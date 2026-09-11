import pino from 'pino';
import { ChannelKind } from '@astrostone/contracts';
import { createDb, createPool } from '@astrostone/db';
import {
  AmocrmClient,
  StubMessagingProvider,
  amocrmConfigFromEnv,
  type MessagingProvider,
  type OutreachConfig,
} from '@astrostone/core';
import { JobName, PgBossQueue } from '@astrostone/queue';
import {
  handleParseImportBatch,
  handleProcessImportRow,
  handleSendOutreach,
  handleSyncAmocrm,
  type HandlerDeps,
} from './handlers';

const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  // ПД в логах не сохраняем: маскирование включено на уровне сериализатора.
  redact: {
    paths: ['*.phone', '*.email', '*.body', '*.renderedBody', '*.destination'],
    censor: '[masked]',
  },
});

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is not set');

  const pool = createPool(databaseUrl);
  const db = createDb(pool);
  const queue = new PgBossQueue({ connectionString: databaseUrl });

  await queue.start();

  const demoMode = process.env.DEMO_MODE === 'true';

  const providers = new Map<ChannelKind, MessagingProvider>();
  if ((process.env.MESSAGING_PROVIDER ?? 'stub') === 'stub') {
    providers.set(ChannelKind.TELEGRAM, new StubMessagingProvider(ChannelKind.TELEGRAM));
    providers.set(ChannelKind.WHATSAPP, new StubMessagingProvider(ChannelKind.WHATSAPP));
    providers.set(ChannelKind.EMAIL, new StubMessagingProvider(ChannelKind.EMAIL));
    logger.warn('messaging provider = stub: сообщения никуда не уходят');
  }

  const config: OutreachConfig = {
    defaultTimezone: process.env.DEFAULT_TIMEZONE ?? 'Europe/Moscow',
    jitterMinSeconds: Number(process.env.SEND_JITTER_MIN_SECONDS ?? (demoMode ? 0 : 60)),
    jitterMaxSeconds: Number(process.env.SEND_JITTER_MAX_SECONDS ?? (demoMode ? 0 : 180)),
    bypassSendWindow: demoMode,
  };

  const amocrmConfig = amocrmConfigFromEnv(process.env, 'data/amocrm-tokens.json');

  const deps: HandlerDeps = {
    db,
    queue,
    providers,
    config,
    amocrmMode: process.env.AMOCRM_MODE === 'live' ? 'live' : 'stub',
    ...(amocrmConfig ? { amocrm: new AmocrmClient(amocrmConfig) } : {}),
    log: (event, data) => logger.info({ event, ...data }),
  };

  await queue.work(JobName.PARSE_IMPORT_BATCH, (payload: never) =>
    handleParseImportBatch(deps, payload),
  );
  await queue.work(
    JobName.PROCESS_IMPORT_ROW,
    (payload: never) => handleProcessImportRow(deps, payload),
    // Дедупликация сериализуется advisory-локами, поэтому конкурентность безопасна.
    { concurrency: 5 },
  );
  await queue.work(JobName.SEND_OUTREACH, (payload: never) => handleSendOutreach(deps, payload));
  await queue.work(JobName.SYNC_AMOCRM_CONTACT, (payload: never) => handleSyncAmocrm(deps, payload));

  logger.info('worker started');

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'worker shutting down');
    await queue.stop();
    await pool.end();
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((error) => {
  logger.error(error);
  process.exit(1);
});
