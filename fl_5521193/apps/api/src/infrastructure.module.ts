import { Global, Inject, Injectable, Logger, Module, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import { ChannelKind } from '@astrostone/contracts';
import {
  AmocrmClient,
  StubMessagingProvider,
  amocrmConfigFromEnv,
  type OutreachConfig,
} from '@astrostone/core';
import { createDb, createEmbeddedDb, createPool, type Db } from '@astrostone/db';
import { ImmediateQueue, JobName, PgBossQueue } from '@astrostone/queue';
import type { Pool } from 'pg';
import { join } from 'node:path';
import {
  handleParseImportBatch,
  handleProcessImportRow,
  handleSendOutreach,
  handleSyncAmocrm,
  type HandlerDeps,
} from '../../worker/src/handlers';
import { loadConfig, type AppConfig } from './config';
import { REPO_ROOT } from './paths';

export const DB = Symbol('DB');
export const POOL = Symbol('POOL');
export const QUEUE = Symbol('QUEUE');
export const CONFIG = Symbol('CONFIG');
export const DB_CLOSE = Symbol('DB_CLOSE');

export type AppQueue = ImmediateQueue | PgBossQueue;

@Injectable()
class DemoRuntime implements OnModuleInit {
  private readonly log = new Logger('demo-runtime');

  constructor(
    @Inject(CONFIG) private readonly config: AppConfig,
    @Inject(DB) private readonly db: Db,
    @Inject(QUEUE) private readonly queue: AppQueue,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.config.DEMO_MODE) return;

    const providers = new Map();
    providers.set(ChannelKind.TELEGRAM, new StubMessagingProvider(ChannelKind.TELEGRAM));
    providers.set(ChannelKind.WHATSAPP, new StubMessagingProvider(ChannelKind.WHATSAPP));
    providers.set(ChannelKind.EMAIL, new StubMessagingProvider(ChannelKind.EMAIL));

    const outreach: OutreachConfig = {
      defaultTimezone: this.config.DEFAULT_TIMEZONE,
      jitterMinSeconds: 0,
      jitterMaxSeconds: 0,
      bypassSendWindow: true,
    };

    const amocrmSettings = amocrmConfigFromEnv(process.env, join(REPO_ROOT, 'data', 'amocrm-tokens.json'));
    if (this.config.AMOCRM_MODE === 'live' && !amocrmSettings) {
      throw new Error('AMOCRM_MODE=live but client config is empty');
    }

    const deps: HandlerDeps = {
      db: this.db,
      queue: this.queue,
      providers,
      config: outreach,
      amocrmMode: this.config.AMOCRM_MODE,
      ...(amocrmSettings ? { amocrm: new AmocrmClient(amocrmSettings) } : {}),
      log: (event, data) => this.log.log(`${event} ${JSON.stringify(data)}`),
    };

    await this.queue.work(JobName.PARSE_IMPORT_BATCH, (payload: never) =>
      handleParseImportBatch(deps, payload),
    );
    await this.queue.work(JobName.PROCESS_IMPORT_ROW, (payload: never) =>
      handleProcessImportRow(deps, payload),
    );
    await this.queue.work(JobName.SEND_OUTREACH, (payload: never) => handleSendOutreach(deps, payload));
    await this.queue.work(JobName.SYNC_AMOCRM_CONTACT, (payload: never) =>
      handleSyncAmocrm(deps, payload),
    );

    this.log.log('in-process workers + PGlite: Docker не нужен');
  }
}

@Global()
@Module({
  providers: [
    { provide: CONFIG, useFactory: (): AppConfig => loadConfig() },
    {
      provide: POOL,
      inject: [CONFIG],
      useFactory: (config: AppConfig): Pool | null =>
        config.DEMO_MODE || !config.DATABASE_URL ? null : createPool(config.DATABASE_URL),
    },
    {
      provide: DB_CLOSE,
      inject: [CONFIG],
      useFactory: async (
        config: AppConfig,
      ): Promise<{ db: Db; close: () => Promise<void> }> => {
        if (config.DEMO_MODE) {
          return createEmbeddedDb(join(REPO_ROOT, 'data', 'pglite'));
        }
        if (!config.DATABASE_URL) throw new Error('DATABASE_URL is not set');
        const pool = createPool(config.DATABASE_URL);
        return {
          db: createDb(pool),
          close: () => pool.end(),
        };
      },
    },
    {
      provide: DB,
      inject: [DB_CLOSE],
      useFactory: (handle: { db: Db }): Db => handle.db,
    },
    {
      provide: QUEUE,
      inject: [CONFIG],
      useFactory: async (config: AppConfig): Promise<AppQueue> => {
        if (config.DEMO_MODE) {
          const queue = new ImmediateQueue();
          await queue.start();
          return queue;
        }
        if (!config.DATABASE_URL) throw new Error('DATABASE_URL is not set');
        const queue = new PgBossQueue({ connectionString: config.DATABASE_URL });
        await queue.start();
        return queue;
      },
    },
    DemoRuntime,
  ],
  exports: [DB, QUEUE, CONFIG],
})
export class InfrastructureModule implements OnApplicationShutdown {
  constructor(
    @Inject(QUEUE) private readonly queue: AppQueue,
    @Inject(DB_CLOSE) private readonly handle: { close: () => Promise<void> },
  ) {}

  async onApplicationShutdown(): Promise<void> {
    await this.queue.stop();
    await this.handle.close();
  }
}
