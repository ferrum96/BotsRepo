import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { createDb, createPool, type Db } from '@astrostone/db';
import { PgBossQueue } from '@astrostone/queue';
import type { Pool } from 'pg';
import { loadConfig, type AppConfig } from './config';

export const DB = Symbol('DB');
export const POOL = Symbol('POOL');
export const QUEUE = Symbol('QUEUE');
export const CONFIG = Symbol('CONFIG');

@Global()
@Module({
  providers: [
    { provide: CONFIG, useFactory: (): AppConfig => loadConfig() },
    {
      provide: POOL,
      inject: [CONFIG],
      useFactory: (config: AppConfig): Pool => createPool(config.DATABASE_URL),
    },
    { provide: DB, inject: [POOL], useFactory: (pool: Pool): Db => createDb(pool) },
    {
      provide: QUEUE,
      inject: [CONFIG],
      useFactory: async (config: AppConfig): Promise<PgBossQueue> => {
        const queue = new PgBossQueue({ connectionString: config.DATABASE_URL });
        await queue.start();
        return queue;
      },
    },
  ],
  exports: [DB, POOL, QUEUE, CONFIG],
})
export class InfrastructureModule implements OnApplicationShutdown {
  constructor(
    @Inject(POOL) private readonly pool: Pool,
    @Inject(QUEUE) private readonly queue: PgBossQueue,
  ) {}

  async onApplicationShutdown(): Promise<void> {
    await this.queue.stop();
    await this.pool.end();
  }
}
