import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  AcquisitionSource,
  AcquisitionStage,
  AutomationStatus,
  ChannelKind,
  MessageDirection,
  OutreachStep,
  SendBlockReason,
  SuppressionLevel,
} from '@astrostone/contracts';
import {
  channelUsage,
  channels,
  contacts,
  deals,
  managerTasks,
  messages,
  type Db,
} from '@astrostone/db';
import {
  StubMessagingProvider,
  addSuppression,
  assignManager,
  mapColumns,
  normalizeImportRow,
  processInboundMessage,
  resolveContactAndDeal,
  sendOutreachStep,
  type MessagingProvider,
} from '@astrostone/core';
import { createTestDb, type TestDb } from './helpers/test-db';

let handle: TestDb;
let db: Db;
let provider: StubMessagingProvider;
let providers: Map<ChannelKind, MessagingProvider>;

const config = {
  defaultTimezone: 'Europe/Moscow',
  jitterMinSeconds: 0,
  jitterMaxSeconds: 0,
};

/** Вторник, 12:00 по Москве — внутри рабочего окна отправки. */
const insideWindow = new Date('2026-09-08T09:00:00.000Z');

async function seedProspect(
  raw: Record<string, unknown> = { Имя: 'Анна', Telegram: '@astro_anna' },
): Promise<{ contactId: string; dealId: string }> {
  const normalized = normalizeImportRow(raw, {
    mapping: mapColumns(Object.keys(raw)),
    source: AcquisitionSource.PARSING_TELEGRAM,
  });

  const result = await resolveContactAndDeal(db, {
    row: normalized.row,
    identifiers: normalized.identifiers,
    eligibility: normalized.eligibility,
    preferredChannel: normalized.preferredChannel,
    importRowId: crypto.randomUUID(),
    correlationId: crypto.randomUUID(),
  });

  if (!result.dealId) throw new Error('deal was not created');

  await assignManager(db, result.dealId, normalized.preferredChannel, crypto.randomUUID());

  return { contactId: result.contactId, dealId: result.dealId };
}

beforeAll(async () => {
  handle = await createTestDb();
  db = handle.db;
});

afterAll(async () => {
  await handle.close();
});

beforeEach(async () => {
  await db.delete(contacts);
  await db.delete(channelUsage);
  await db.update(channels).set({ status: 'ACTIVE', dailyLimit: 20 });
  provider = new StubMessagingProvider(ChannelKind.TELEGRAM);
  providers = new Map<ChannelKind, MessagingProvider>([[ChannelKind.TELEGRAM, provider]]);
});

describe('первое касание', () => {
  it('отправляется с подстановкой имени и переводит сделку на этап', async () => {
    const { dealId } = await seedProspect();

    const outcome = await sendOutreachStep(
      db,
      providers,
      { dealId, step: OutreachStep.FIRST, now: insideWindow },
      config,
    );

    expect(outcome.status).toBe('SENT');
    expect(provider.sent).toHaveLength(1);
    expect(provider.sent[0]?.body).toContain('Анна');
    expect(provider.sent[0]?.destination).toBe('@astro_anna');

    const [deal] = await db.select().from(deals).where(eq(deals.id, dealId));
    expect(deal?.stage).toBe(AcquisitionStage.FIRST_TOUCH_SENT);
  });

  it('сохраняет фактический текст сообщения, а не только ссылку на шаблон', async () => {
    const { dealId } = await seedProspect();

    await sendOutreachStep(
      db,
      providers,
      { dealId, step: OutreachStep.FIRST, now: insideWindow },
      config,
    );

    const [message] = await db.select().from(messages).where(eq(messages.dealId, dealId));

    expect(message?.renderedBody).toContain('AstroStone');
    expect(message?.renderedBody).not.toContain('{{');
    expect(message?.templateVersionId).not.toBeNull();
  });

  it('повторный запуск того же шага не отправляет второе сообщение', async () => {
    const { dealId } = await seedProspect();

    const first = await sendOutreachStep(
      db,
      providers,
      { dealId, step: OutreachStep.FIRST, now: insideWindow },
      config,
    );
    const second = await sendOutreachStep(
      db,
      providers,
      { dealId, step: OutreachStep.FIRST, now: insideWindow },
      config,
    );

    expect(first.status).toBe('SENT');
    expect(second).toMatchObject({ status: 'CANCELLED', reason: SendBlockReason.ALREADY_SENT });
    expect(provider.sent).toHaveLength(1);
  });
});

describe('guard-цепочка', () => {
  it('не пишет в suppression-list', async () => {
    const { contactId, dealId } = await seedProspect();

    await addSuppression(db, {
      contactId,
      level: SuppressionLevel.PERMANENT,
      reason: 'тест',
    });

    const outcome = await sendOutreachStep(
      db,
      providers,
      { dealId, step: OutreachStep.FIRST, now: insideWindow },
      config,
    );

    expect(outcome).toMatchObject({ status: 'CANCELLED', reason: SendBlockReason.SUPPRESSED });
    expect(provider.sent).toHaveLength(0);
  });

  it('не пишет при остановленной автоматизации', async () => {
    const { dealId } = await seedProspect();

    await db
      .update(deals)
      .set({ automationStatus: AutomationStatus.STOPPED_BY_MANAGER })
      .where(eq(deals.id, dealId));

    const outcome = await sendOutreachStep(
      db,
      providers,
      { dealId, step: OutreachStep.FIRST, now: insideWindow },
      config,
    );

    expect(outcome).toMatchObject({
      status: 'CANCELLED',
      reason: SendBlockReason.AUTOMATION_NOT_ACTIVE,
    });
  });

  it('исчерпанный дневной лимит канала переносит отправку, а не роняет её', async () => {
    const { dealId } = await seedProspect();

    await db.update(channels).set({ dailyLimit: 0 });

    const outcome = await sendOutreachStep(
      db,
      providers,
      { dealId, step: OutreachStep.FIRST, now: insideWindow },
      config,
    );

    expect(outcome.status).toBe('RESCHEDULED');
    if (outcome.status === 'RESCHEDULED') {
      expect(outcome.reason).toBe(SendBlockReason.CHANNEL_LIMIT_REACHED);
      expect(outcome.retryAt.getTime()).toBeGreaterThan(insideWindow.getTime());
    }
    expect(provider.sent).toHaveLength(0);
  });

  it('вне окна отправки переносит на начало следующего окна', async () => {
    const { dealId } = await seedProspect();

    // Воскресенье, 04:00 по Москве.
    const outside = new Date('2026-09-06T01:00:00.000Z');

    const outcome = await sendOutreachStep(
      db,
      providers,
      { dealId, step: OutreachStep.FIRST, now: outside },
      config,
    );

    expect(outcome).toMatchObject({
      status: 'RESCHEDULED',
      reason: SendBlockReason.OUTSIDE_SEND_WINDOW,
    });
    if (outcome.status === 'RESCHEDULED') {
      // Ближайшее окно — понедельник 10:00 MSK = 07:00 UTC.
      expect(outcome.retryAt.toISOString()).toBe('2026-09-07T07:00:00.000Z');
    }
  });

  it('демо-режим игнорирует окно отправки', async () => {
    const { dealId } = await seedProspect();
    const outside = new Date('2026-09-06T01:00:00.000Z');

    const outcome = await sendOutreachStep(
      db,
      providers,
      { dealId, step: OutreachStep.FIRST, now: outside },
      { ...config, bypassSendWindow: true },
    );

    expect(outcome.status).toBe('SENT');
  });

  it('контакт без автоканала не получает автоматических сообщений', async () => {
    const { dealId } = await seedProspect({ Имя: 'Анна', Сайт: 'astro-anna.ru' });

    const outcome = await sendOutreachStep(
      db,
      providers,
      { dealId, step: OutreachStep.FIRST, now: insideWindow },
      config,
    );

    expect(outcome.status).not.toBe('SENT');
    expect(provider.sent).toHaveLength(0);
  });

  it('FLOOD_WAIT от транспорта ставит канал на паузу целиком', async () => {
    const { dealId } = await seedProspect();
    provider.failFor('@astro_anna', 'FLOOD_WAIT');

    const outcome = await sendOutreachStep(
      db,
      providers,
      { dealId, step: OutreachStep.FIRST, now: insideWindow },
      config,
    );

    expect(outcome).toMatchObject({ status: 'FAILED', errorCode: 'FLOOD_WAIT' });

    const paused = await db.select().from(channels).where(eq(channels.status, 'PAUSED'));
    expect(paused.length).toBeGreaterThan(0);
  });
});

describe('входящий ответ (п. 10 и 12 ТЗ)', () => {
  it('останавливает автоматизацию, переводит сделку и ставит задачу менеджеру', async () => {
    const { dealId } = await seedProspect();

    await sendOutreachStep(
      db,
      providers,
      { dealId, step: OutreachStep.FIRST, now: insideWindow },
      config,
    );

    const outcome = await processInboundMessage(db, {
      channelKind: ChannelKind.TELEGRAM,
      externalEventId: 'evt-1',
      from: '@astro_anna',
      body: 'Здравствуйте, да, использую камни в практике',
    });

    expect(outcome.status).toBe('PROCESSED');

    const [deal] = await db.select().from(deals).where(eq(deals.id, dealId));
    expect(deal?.automationStatus).toBe(AutomationStatus.STOPPED_BY_REPLY);
    expect(deal?.stage).toBe(AcquisitionStage.REPLIED);
    expect(deal?.lastReplyAt).not.toBeNull();

    const tasks = await db.select().from(managerTasks).where(eq(managerTasks.dealId, dealId));
    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.kind).toBe('PROCESS_REPLY');

    const inbound = await db
      .select()
      .from(messages)
      .where(eq(messages.direction, MessageDirection.INBOUND));
    expect(inbound).toHaveLength(1);
  });

  it('повторная доставка вебхука не создаёт вторую запись', async () => {
    await seedProspect();

    const payload = {
      channelKind: ChannelKind.TELEGRAM,
      externalEventId: 'evt-dup',
      from: '@astro_anna',
      body: 'Ответ',
    };

    expect((await processInboundMessage(db, payload)).status).toBe('PROCESSED');
    expect((await processInboundMessage(db, payload)).status).toBe('DUPLICATE');

    const inbound = await db
      .select()
      .from(messages)
      .where(eq(messages.direction, MessageDirection.INBOUND));
    expect(inbound).toHaveLength(1);
  });

  it('ответ, пришедший до отправки follow-up, отменяет касание', async () => {
    const { dealId } = await seedProspect();

    await sendOutreachStep(
      db,
      providers,
      { dealId, step: OutreachStep.FIRST, now: insideWindow },
      config,
    );

    await processInboundMessage(db, {
      channelKind: ChannelKind.TELEGRAM,
      externalEventId: 'evt-2',
      from: '@astro_anna',
      body: 'Не интересно',
    });

    // Джоба follow-up уже стояла в очереди и запускается как обычно.
    const followup = await sendOutreachStep(
      db,
      providers,
      { dealId, step: OutreachStep.FOLLOWUP_D3, now: insideWindow },
      config,
    );

    expect(followup).toMatchObject({
      status: 'CANCELLED',
      reason: SendBlockReason.AUTOMATION_NOT_ACTIVE,
    });
    expect(provider.sent).toHaveLength(1);
  });

  it('явный отказ включает постоянный запрет и закрывает сделку', async () => {
    const { contactId, dealId } = await seedProspect();

    const outcome = await processInboundMessage(db, {
      channelKind: ChannelKind.TELEGRAM,
      externalEventId: 'evt-3',
      from: '@astro_anna',
      body: 'Не пишите мне больше, это спам',
    });

    expect(outcome).toMatchObject({ status: 'PROCESSED', optedOut: true, contactId });

    const [deal] = await db.select().from(deals).where(eq(deals.id, dealId));
    expect(deal?.automationStatus).toBe(AutomationStatus.STOPPED_BY_OPT_OUT);
    expect(deal?.stage).toBe(AcquisitionStage.CLOSED_REFUSED);
    expect(deal?.isActive).toBe(false);

    const followup = await sendOutreachStep(
      db,
      providers,
      { dealId, step: OutreachStep.FOLLOWUP_D3, now: insideWindow },
      config,
    );
    expect(followup.status).toBe('CANCELLED');
  });

  it('«напишите позже» ставит паузу, а не постоянный запрет', async () => {
    await seedProspect();

    const outcome = await processInboundMessage(db, {
      channelKind: ChannelKind.TELEGRAM,
      externalEventId: 'evt-4',
      from: '@astro_anna',
      body: 'Напишите через месяц, сейчас не до этого',
    });

    expect(outcome).toMatchObject({ status: 'PROCESSED', optedOut: false, postponed: true });
  });
});
