import { createHash } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import {
  AcquisitionSource,
  AutomationEligibility,
  EventType,
  ImportBatchStatus,
  ImportRowStatus,
  IMPORT_ERROR_MESSAGES,
  OutreachStep,
  importErrorCodes,
} from '@astrostone/contracts';
import {
  automationEvents,
  deals,
  importBatches,
  importRows,
  managerTasks,
  type Db,
} from '@astrostone/db';
import { assignManager } from '../managers/assignment.service';
import { mapColumns, normalizeImportRow } from '../normalization/row';
import { resolveContactAndDeal } from '../dedup/dedup.service';
import { parseFile } from './parse';

/** Порт очереди: core не должен знать про pg-boss (docs/04-stack-adr.md, ADR-004). */
export interface QueuePort {
  enqueue(
    job: string,
    payload: Record<string, unknown>,
    options?: { runAt?: Date; singletonKey?: string },
  ): Promise<void>;
}

export const JobName = {
  PARSE_IMPORT_BATCH: 'parse-import-batch',
  PROCESS_IMPORT_ROW: 'process-import-row',
  SEND_OUTREACH: 'send-outreach',
  SYNC_AMOCRM_CONTACT: 'sync-amocrm-contact',
} as const;

const identityKey = (identifiers: { type: string; normalizedValue: string }[], rowNumber: number): string =>
  identifiers.length > 0
    ? identifiers.map((i) => `${i.type}:${i.normalizedValue}`).sort().join('|')
    : `row:${rowNumber}`;

/**
 * Разбор файла в строки. Идемпотентность считается от хеша файла и состава
 * идентификаторов: повторная загрузка того же файла не создаёт вторую обработку,
 * а тот же контакт из другого файла проходит дедупликацию и фиксирует новый источник.
 */
export async function parseBatch(
  db: Db,
  queue: QueuePort,
  batchId: string,
  filePath: string,
  options: { source?: AcquisitionSource; columnMapping?: Record<string, string> } = {},
): Promise<{ totalRows: number; queued: number }> {
  const [batch] = await db.select().from(importBatches).where(eq(importBatches.id, batchId));
  if (!batch) throw new Error(`import batch ${batchId} not found`);

  await db
    .update(importBatches)
    .set({ status: ImportBatchStatus.PARSING })
    .where(eq(importBatches.id, batchId));

  const source = options.source ?? (batch.source as AcquisitionSource);
  const seenInFile = new Set<string>();
  let mapping: ReturnType<typeof mapColumns> | null = null;
  let queued = 0;

  const result = await parseFile(filePath, batch.filename, {
    onRow: async ({ rowNumber, raw }) => {
      mapping ??= mapColumns(Object.keys(raw), options.columnMapping);

      const normalized = normalizeImportRow(raw, { mapping, source });
      const identity = identityKey(normalized.identifiers, rowNumber);
      const idempotencyKey = createHash('sha256')
        .update(`${batch.fileHash}:${identity}`)
        .digest('hex');

      const duplicateInFile = normalized.identifiers.length > 0 && seenInFile.has(identity);
      seenInFile.add(identity);

      const status = duplicateInFile
        ? ImportRowStatus.DUPLICATE_IN_FILE
        : normalized.errors.length > 0
          ? ImportRowStatus.FAILED
          : ImportRowStatus.NORMALIZED;

      const errorCode = duplicateInFile
        ? importErrorCodes.DUPLICATE_IN_FILE
        : (normalized.errors[0] ?? null);

      const inserted = await db
        .insert(importRows)
        .values({
          batchId,
          rowNumber,
          rawPayload: raw,
          normalizedPayload: normalized.row,
          status,
          idempotencyKey,
          correlationId: crypto.randomUUID(),
          errorCode,
          errorMessage: errorCode ? IMPORT_ERROR_MESSAGES[errorCode] : null,
        })
        .onConflictDoNothing()
        .returning({ id: importRows.id });

      const row = inserted[0];
      if (!row) return; // строка уже обработана прошлой загрузкой файла
      if (status !== ImportRowStatus.NORMALIZED) {
        await bumpBatchCounters(db, batchId, status);
        return;
      }

      // Джоба на строку, а не на файл: упавшая строка не тянет за собой остальные.
      await queue.enqueue(
        JobName.PROCESS_IMPORT_ROW,
        { rowId: row.id },
        { singletonKey: row.id },
      );
      queued += 1;
    },
  });

  await db
    .update(importBatches)
    .set({ status: ImportBatchStatus.PROCESSING, totalRows: result.totalRows })
    .where(eq(importBatches.id, batchId));

  await db.insert(automationEvents).values({
    eventType: EventType.IMPORT_CREATED,
    source: 'import',
    payload: { batchId, totalRows: result.totalRows, truncated: result.truncated },
  });

  // Все строки отбракованы на разборе — батч всё равно должен закрыться.
  await finishBatchIfDone(db, batchId);

  return { totalRows: result.totalRows, queued };
}

export interface ProcessRowResult {
  status: ImportRowStatus;
  batchId: string;
  contactId?: string;
  dealId?: string;
}

/**
 * Обработка одной строки: дедуп, назначение менеджера, постановка первого касания.
 * Ошибка строки не останавливает импорт — она остаётся на строке вместе с причиной.
 */
export async function processImportRow(
  db: Db,
  queue: QueuePort,
  rowId: string,
): Promise<ProcessRowResult> {
  const [row] = await db.select().from(importRows).where(eq(importRows.id, rowId));
  if (!row) throw new Error(`import row ${rowId} not found`);
  if (row.status === ImportRowStatus.IMPORTED) {
    return { status: ImportRowStatus.IMPORTED, batchId: row.batchId };
  }

  const normalized = row.normalizedPayload;
  if (!normalized) throw new Error(`import row ${rowId} has no normalized payload`);

  const mapping = mapColumns(Object.keys(row.rawPayload));
  const recomputed = normalizeImportRow(row.rawPayload, {
    mapping,
    source: normalized.acquisitionSource,
  });

  await db
    .update(importRows)
    .set({ status: ImportRowStatus.PROCESSING, updatedAt: new Date() })
    .where(eq(importRows.id, rowId));

  try {
    const decision = await resolveContactAndDeal(db, {
      row: recomputed.row,
      identifiers: recomputed.identifiers,
      eligibility: recomputed.eligibility,
      preferredChannel: recomputed.preferredChannel,
      importRowId: rowId,
      correlationId: row.correlationId,
    });

    const status =
      decision.decision === 'CONTACT_CREATED'
        ? ImportRowStatus.IMPORTED
        : decision.decision === 'NEEDS_REVIEW'
          ? ImportRowStatus.NEEDS_REVIEW
          : decision.decision === 'CONTACT_MERGED_DEAL_CREATED'
            ? ImportRowStatus.DUPLICATE_MERGED
            : ImportRowStatus.DUPLICATE_SKIPPED;

    const finalStatus =
      status === ImportRowStatus.IMPORTED &&
      recomputed.eligibility === AutomationEligibility.MANUAL_ONLY
        ? ImportRowStatus.MANUAL_OUTREACH
        : status;

    await db
      .update(importRows)
      .set({
        status: finalStatus,
        contactId: decision.contactId,
        dealId: decision.dealId,
        updatedAt: new Date(),
      })
      .where(eq(importRows.id, rowId));

    await bumpBatchCounters(db, row.batchId, finalStatus);

    if (decision.dealId) {
      const assignment = await assignManager(
        db,
        decision.dealId,
        recomputed.preferredChannel,
        row.correlationId,
      );

      if (recomputed.eligibility === AutomationEligibility.AUTO_OK && assignment.managerId) {
        await queue.enqueue(
          JobName.SEND_OUTREACH,
          { dealId: decision.dealId, step: OutreachStep.FIRST },
          { singletonKey: `${decision.dealId}:${OutreachStep.FIRST}` },
        );
      } else if (recomputed.eligibility === AutomationEligibility.MANUAL_ONLY) {
        // Контакт без автоканала не теряется молча: он уходит менеджеру в работу.
        await db.insert(managerTasks).values({
          dealId: decision.dealId,
          managerId: assignment.managerId,
          kind: 'MANUAL_OUTREACH',
          title: 'Автоматический канал недоступен — связаться вручную',
        });

        await db.insert(automationEvents).values({
          contactId: decision.contactId,
          dealId: decision.dealId,
          eventType: EventType.MANUAL_OUTREACH_REQUIRED,
          source: 'import',
          correlationId: row.correlationId,
        });
      }

      await queue.enqueue(JobName.SYNC_AMOCRM_CONTACT, {
        contactId: decision.contactId,
        dealId: decision.dealId,
      });
    }

    return {
      status: finalStatus,
      batchId: row.batchId,
      contactId: decision.contactId,
      dealId: decision.dealId ?? undefined,
    };
  } catch (error) {
    await db
      .update(importRows)
      .set({
        status: ImportRowStatus.FAILED,
        errorCode: importErrorCodes.UNEXPECTED,
        errorMessage: error instanceof Error ? error.message.slice(0, 500) : 'unknown error',
        updatedAt: new Date(),
      })
      .where(eq(importRows.id, rowId));

    await bumpBatchCounters(db, row.batchId, ImportRowStatus.FAILED);

    return { status: ImportRowStatus.FAILED, batchId: row.batchId };
  }
}

async function bumpBatchCounters(db: Db, batchId: string, status: ImportRowStatus): Promise<void> {
  const increments: Record<string, unknown> = {
    processedRows: sql`${importBatches.processedRows} + 1`,
  };

  if (status === ImportRowStatus.IMPORTED) {
    increments.successRows = sql`${importBatches.successRows} + 1`;
  } else if (status === ImportRowStatus.FAILED) {
    increments.failedRows = sql`${importBatches.failedRows} + 1`;
  } else if (status === ImportRowStatus.MANUAL_OUTREACH) {
    increments.manualRows = sql`${importBatches.manualRows} + 1`;
  } else {
    increments.duplicateRows = sql`${importBatches.duplicateRows} + 1`;
  }

  await db.update(importBatches).set(increments).where(eq(importBatches.id, batchId));
}

/** Повтор только упавших строк: п. «импорт можно возобновить» из плана. */
export async function retryFailedRows(db: Db, batchId: string, queue: QueuePort): Promise<number> {
  const failed = await db
    .select({ id: importRows.id })
    .from(importRows)
    .where(and(eq(importRows.batchId, batchId), eq(importRows.status, ImportRowStatus.FAILED)));

  for (const row of failed) {
    await db
      .update(importRows)
      .set({
        status: ImportRowStatus.NORMALIZED,
        errorCode: null,
        errorMessage: null,
        updatedAt: new Date(),
      })
      .where(eq(importRows.id, row.id));

    await queue.enqueue(JobName.PROCESS_IMPORT_ROW, { rowId: row.id });
  }

  return failed.length;
}

/** Строки, ожидающие обработки: воркер берёт их пачками. */
export async function pendingRows(db: Db, batchId: string, limit = 500): Promise<string[]> {
  const rows = await db
    .select({ id: importRows.id })
    .from(importRows)
    .where(and(eq(importRows.batchId, batchId), eq(importRows.status, ImportRowStatus.NORMALIZED)))
    .limit(limit);

  return rows.map((row) => row.id);
}

export async function finishBatchIfDone(db: Db, batchId: string): Promise<void> {
  const [pending] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(importRows)
    .where(
      and(
        eq(importRows.batchId, batchId),
        sql`${importRows.status} in ('NEW', 'VALIDATED', 'NORMALIZED', 'PROCESSING')`,
      ),
    );

  if ((pending?.count ?? 0) > 0) return;

  await db
    .update(importBatches)
    .set({ status: ImportBatchStatus.DONE, finishedAt: new Date() })
    .where(eq(importBatches.id, batchId));
}

/** Сделки, ждущие ручной обработки: используется админкой. */
export async function manualOutreachQueue(db: Db, limit = 100) {
  return db
    .select({ dealId: deals.id, contactId: deals.contactId, createdAt: deals.createdAt })
    .from(deals)
    .where(eq(deals.automationStep, 'MANUAL_OUTREACH_REQUIRED'))
    .limit(limit);
}
