import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import {
  AcquisitionSource,
  AutomationStatus,
  ChannelKind,
  ImportRowStatus,
  OutreachStep,
} from '@astrostone/contracts';
import { contacts, deals, importBatches, importRows, messages, type Db } from '@astrostone/db';
import {
  JobName,
  StubMessagingProvider,
  parseBatch,
  pendingRows,
  processImportRow,
  processInboundMessage,
  sendOutreachStep,
  type MessagingProvider,
} from '@astrostone/core';
import { createTestDb, type TestDb } from './helpers/test-db';
import { InMemoryQueue } from './helpers/in-memory-queue';

const fixturePath = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'fixtures',
  'astro-base-sample.csv',
);

let handle: TestDb;
let db: Db;
let queue: InMemoryQueue;
let provider: StubMessagingProvider;
let providers: Map<ChannelKind, MessagingProvider>;

const config = { defaultTimezone: 'Europe/Moscow', jitterMinSeconds: 0, jitterMaxSeconds: 0 };
const insideWindow = new Date('2026-09-08T09:00:00.000Z');

async function createBatch(): Promise<string> {
  const fileHash = createHash('sha256').update(readFileSync(fixturePath)).digest('hex');

  const [batch] = await db
    .insert(importBatches)
    .values({
      filename: 'astro-base-sample.csv',
      fileHash,
      source: AcquisitionSource.PARSING_TELEGRAM,
    })
    .returning({ id: importBatches.id });

  if (!batch) throw new Error('batch insert failed');
  return batch.id;
}

/** Прогоняет весь файл до конца: разбор, затем обработка всех строк. */
async function runImport(): Promise<string> {
  const batchId = await createBatch();

  await parseBatch(db, queue, batchId, fixturePath);

  for (const job of queue.take(JobName.PROCESS_IMPORT_ROW)) {
    await processImportRow(db, queue, job.payload.rowId as string);
  }

  return batchId;
}

beforeAll(async () => {
  handle = await createTestDb();
  db = handle.db;
});

afterAll(async () => {
  await handle.close();
});

beforeEach(async () => {
  await db.delete(importBatches);
  await db.delete(contacts);
  queue = new InMemoryQueue();
  provider = new StubMessagingProvider(ChannelKind.TELEGRAM);
  providers = new Map<ChannelKind, MessagingProvider>([[ChannelKind.TELEGRAM, provider]]);
});

describe('импорт реальной спарсенной базы', () => {
  it('разбирает файл, раскладывает строки по статусам и не теряет ошибочные', async () => {
    const batchId = await runImport();

    const rows = await db.select().from(importRows).where(eq(importRows.batchId, batchId));
    expect(rows).toHaveLength(20);

    const byStatus = rows.reduce<Record<string, number>>((acc, row) => {
      acc[row.status] = (acc[row.status] ?? 0) + 1;
      return acc;
    }, {});

    // Импортированные, дубли и ошибки существуют одновременно: одна плохая строка
    // не останавливает файл (критерий готовности из плана, этап 4).
    expect(byStatus[ImportRowStatus.IMPORTED]).toBeGreaterThan(10);
    expect(byStatus[ImportRowStatus.FAILED]).toBeGreaterThan(0);

    const failed = rows.filter((row) => row.status === ImportRowStatus.FAILED);
    for (const row of failed) {
      expect(row.rowNumber).toBeGreaterThan(0);
      expect(row.errorCode).toBeTruthy();
      expect(row.errorMessage).toBeTruthy();
    }
  });

  it('склеивает дубль по телефону в другом написании', async () => {
    await runImport();

    const anna = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(sql`lower(${contacts.firstName}) = 'анна'`);

    expect(anna).toHaveLength(1);
  });

  it('контакт только с сайтом уходит в ручную обработку', async () => {
    const batchId = await runImport();

    const manual = await db
      .select()
      .from(importRows)
      .where(eq(importRows.status, ImportRowStatus.MANUAL_OUTREACH));

    expect(manual.length).toBeGreaterThan(0);
    expect(manual.every((row) => row.batchId === batchId)).toBe(true);
  });

  it('повторная загрузка того же файла не создаёт ни строк, ни контактов заново', async () => {
    await runImport();

    const contactsAfterFirst = await db.select({ id: contacts.id }).from(contacts);
    const rowsAfterFirst = await db.select({ id: importRows.id }).from(importRows);

    // Второй батч с тем же файлом: idempotency_key совпадает.
    const secondBatchId = await createBatch();
    await parseBatch(db, queue, secondBatchId, fixturePath);

    const queuedAgain = queue.take(JobName.PROCESS_IMPORT_ROW);
    expect(queuedAgain).toHaveLength(0);

    const contactsAfterSecond = await db.select({ id: contacts.id }).from(contacts);
    const rowsAfterSecond = await db.select({ id: importRows.id }).from(importRows);

    expect(contactsAfterSecond).toHaveLength(contactsAfterFirst.length);
    expect(rowsAfterSecond).toHaveLength(rowsAfterFirst.length);
  });

  it('ставит первое касание только достижимым контактам', async () => {
    await runImport();

    const outreachJobs = queue.jobs.filter((job) => job.job === JobName.SEND_OUTREACH);
    expect(outreachJobs.length).toBeGreaterThan(0);
    expect(outreachJobs.every((job) => job.payload.step === OutreachStep.FIRST)).toBe(true);

    // Инвариант важнее совпадения чисел: касание не должно быть поставлено
    // контакту, до которого нет автоматического канала.
    const eligibility = await Promise.all(
      outreachJobs.map(async (job) => {
        const [row] = await db
          .select({ eligibility: contacts.automationEligibility })
          .from(deals)
          .innerJoin(contacts, eq(contacts.id, deals.contactId))
          .where(eq(deals.id, job.payload.dealId as string));

        return row?.eligibility;
      }),
    );

    expect(eligibility.every((value) => value === 'AUTO_OK')).toBe(true);

    const manualContacts = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(eq(contacts.automationEligibility, 'MANUAL_ONLY'));

    expect(manualContacts.length).toBeGreaterThan(0);
  });
});

describe('сквозной сценарий: импорт → касание → ответ', () => {
  it('доходит от строки файла до остановленной автоматизации', async () => {
    await runImport();

    const outreachJobs = queue.take(JobName.SEND_OUTREACH);
    expect(outreachJobs.length).toBeGreaterThan(0);

    for (const job of outreachJobs) {
      await sendOutreachStep(
        db,
        providers,
        { dealId: job.payload.dealId as string, step: OutreachStep.FIRST, now: insideWindow },
        config,
      );
    }

    expect(provider.sent.length).toBe(outreachJobs.length);
    expect(provider.sent.every((message) => !message.body.includes('{{'))).toBe(true);

    // Отвечает первый из тех, кому написали.
    const firstSent = provider.sent[0]!;
    const reply = await processInboundMessage(db, {
      channelKind: ChannelKind.TELEGRAM,
      externalEventId: 'evt-e2e',
      from: firstSent.destination,
      body: 'Да, назначаю камни в консультациях',
    });

    expect(reply.status).toBe('PROCESSED');
    if (reply.status !== 'PROCESSED') return;

    const [deal] = await db.select().from(deals).where(eq(deals.id, reply.dealId!));
    expect(deal?.automationStatus).toBe(AutomationStatus.STOPPED_BY_REPLY);

    // Follow-up по этой сделке уже не уйдёт.
    const followup = await sendOutreachStep(
      db,
      providers,
      { dealId: reply.dealId!, step: OutreachStep.FOLLOWUP_D3, now: insideWindow },
      config,
    );
    expect(followup.status).toBe('CANCELLED');

    const outbound = await db
      .select({ id: messages.id })
      .from(messages)
      .where(eq(messages.dealId, reply.dealId!));

    // Одно исходящее и одно входящее — второго касания нет.
    expect(outbound).toHaveLength(2);
  });

  it('очередь необработанных строк пустеет после прогона', async () => {
    const batchId = await runImport();

    expect(await pendingRows(db, batchId)).toHaveLength(0);
  });
});
