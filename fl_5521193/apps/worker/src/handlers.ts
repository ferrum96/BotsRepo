import { eq } from 'drizzle-orm';
import {
  AutomationStatus,
  AutomationStep,
  type ChannelKind,
  type OutreachStep as OutreachStepType,
} from '@astrostone/contracts';
import { deals, type Db } from '@astrostone/db';
import {
  AmocrmHttpError,
  finishBatchIfDone,
  jitterSeconds,
  nextOutreachStep,
  parseBatch,
  processImportRow,
  sendOutreachStep,
  syncContactToAmocrm,
  type AmocrmPort,
  type MessagingProvider,
  type OutreachConfig,
  type QueuePort,
} from '@astrostone/core';
import { JobName } from '@astrostone/queue';

export interface HandlerDeps {
  db: Db;
  queue: QueuePort;
  providers: Map<ChannelKind, MessagingProvider>;
  config: OutreachConfig;
  amocrmMode: 'stub' | 'live';
  amocrm?: AmocrmPort;
  log: (event: string, data: Record<string, unknown>) => void;
}

export async function handleParseImportBatch(
  deps: HandlerDeps,
  payload: { batchId: string; filePath: string; columnMapping?: Record<string, string> | null },
): Promise<void> {
  const result = await parseBatch(deps.db, deps.queue, payload.batchId, payload.filePath, {
    ...(payload.columnMapping ? { columnMapping: payload.columnMapping } : {}),
  });

  deps.log('import.parsed', { batchId: payload.batchId, ...result });
}

export async function handleProcessImportRow(
  deps: HandlerDeps,
  payload: { rowId: string },
): Promise<void> {
  const result = await processImportRow(deps.db, deps.queue, payload.rowId);

  deps.log('import.row.processed', { rowId: payload.rowId, status: result.status });
  await finishBatchIfDone(deps.db, result.batchId);
}

/**
 * Отправка касания и планирование следующего шага.
 *
 * Следующий шаг ставится только после фактической отправки текущего, и каждый
 * раз заново: планировать всю серию заранее означало бы рассылать по устаревшему
 * состоянию сделки (docs/06-state-machines.md).
 */
export async function handleSendOutreach(
  deps: HandlerDeps,
  payload: { dealId: string; step: OutreachStepType },
): Promise<void> {
  const outcome = await sendOutreachStep(
    deps.db,
    deps.providers,
    { dealId: payload.dealId, step: payload.step },
    deps.config,
  );

  deps.log('outreach.step', { dealId: payload.dealId, step: payload.step, outcome: outcome.status });

  if (outcome.status === 'RESCHEDULED') {
    await deps.queue.enqueue(
      JobName.SEND_OUTREACH,
      { dealId: payload.dealId, step: payload.step },
      { runAt: outcome.retryAt, singletonKey: `${payload.dealId}:${payload.step}:retry` },
    );
    return;
  }

  if (outcome.status !== 'SENT') return;

  const next = nextOutreachStep(payload.step, new Date());

  if (!next) {
    await deps.db
      .update(deals)
      .set({ automationStep: AutomationStep.LONG_TERM_NURTURE, automationStatus: AutomationStatus.COMPLETED })
      .where(eq(deals.id, payload.dealId));
    return;
  }

  // Джиттер, чтобы касания одного канала не уходили ровной сеткой.
  const jitter = jitterSeconds(deps.config.jitterMinSeconds, deps.config.jitterMaxSeconds) * 1000;

  await deps.queue.enqueue(
    JobName.SEND_OUTREACH,
    { dealId: payload.dealId, step: next.step },
    {
      runAt: new Date(next.runAt.getTime() + jitter),
      singletonKey: `${payload.dealId}:${next.step}`,
    },
  );

  await deps.db
    .update(deals)
    .set({ nextActionAt: next.runAt })
    .where(eq(deals.id, payload.dealId));
}

/**
 * Синхронизация с amoCRM. stub — только лог. live — контакт + сделка, id пишем локально.
 */
export async function handleSyncAmocrm(
  deps: HandlerDeps,
  payload: { contactId: string; dealId?: string },
): Promise<void> {
  if (deps.amocrmMode !== 'live' || !deps.amocrm) {
    deps.log('amocrm.sync.skipped', { ...payload, reason: 'AMOCRM_MODE=stub' });
    return;
  }

  try {
    const result = await syncContactToAmocrm(deps.db, deps.amocrm, payload);
    deps.log('amocrm.sync.ok', { ...payload, ...result });
  } catch (error) {
    deps.log('amocrm.sync.failed', {
      ...payload,
      error: error instanceof Error ? error.message : 'unknown',
    });
    const status = error instanceof AmocrmHttpError ? error.status : 0;
    if (status >= 400 && status < 500 && status !== 429) return;
    throw error;
  }
}

export async function handleBatchFinish(
  deps: HandlerDeps,
  payload: { batchId: string },
): Promise<void> {
  await finishBatchIfDone(deps.db, payload.batchId);
}
