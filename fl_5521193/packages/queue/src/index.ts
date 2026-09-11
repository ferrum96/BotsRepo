import PgBoss from 'pg-boss';
import { JobName, type QueuePort } from '@astrostone/core';

export interface QueueOptions {
  connectionString: string;
  schema?: string;
}

/**
 * Очередь на PostgreSQL (pg-boss). Выбор обоснован в docs/04-stack-adr.md, ADR-004:
 * задача ставится в той же базе, что бизнес-данные, поэтому «сделка создана,
 * а касание потерялось» невозможно без отдельного outbox.
 */
export class PgBossQueue implements QueuePort {
  private readonly boss: PgBoss;
  private started = false;

  constructor(options: QueueOptions) {
    this.boss = new PgBoss({
      connectionString: options.connectionString,
      schema: options.schema ?? 'queue',
      // Мёртвые задачи не удаляем: страница «Логи интеграции» должна их показывать.
      archiveCompletedAfterSeconds: 7 * 24 * 3600,
      deleteAfterDays: 30,
    });
  }

  async start(): Promise<void> {
    if (this.started) return;

    await this.boss.start();

    for (const name of Object.values(JobName)) {
      await this.boss.createQueue(name, {
        name,
        retryLimit: 5,
        retryDelay: 30,
        retryBackoff: true,
        expireInSeconds: 300,
      } as never);
    }

    this.started = true;
  }

  async stop(): Promise<void> {
    if (!this.started) return;
    await this.boss.stop({ graceful: true });
    this.started = false;
  }

  async enqueue(
    job: string,
    payload: Record<string, unknown>,
    options: { runAt?: Date; singletonKey?: string } = {},
  ): Promise<void> {
    await this.boss.send(job, payload, {
      ...(options.runAt ? { startAfter: options.runAt } : {}),
      // singletonKey — дедупликация задач: повторная постановка того же шага не плодит копии.
      ...(options.singletonKey ? { singletonKey: options.singletonKey } : {}),
    });
  }

  async work<T extends object>(
    job: string,
    handler: (payload: T) => Promise<void>,
    options: { concurrency?: number } = {},
  ): Promise<void> {
    await this.boss.work<T>(
      job,
      { batchSize: options.concurrency ?? 1 },
      async (jobs) => {
        for (const item of jobs) await handler(item.data);
      },
    );
  }

  async schedule(job: string, cron: string, payload: Record<string, unknown> = {}): Promise<void> {
    await this.boss.schedule(job, cron, payload);
  }

  get instance(): PgBoss {
    return this.boss;
  }
}

export { JobName };
export { ImmediateQueue } from './immediate';
