import type { QueuePort } from '@astrostone/core';

interface QueuedJob {
  job: string;
  payload: Record<string, unknown>;
  runAt?: Date;
  singletonKey?: string;
}

/**
 * Очередь для демо-стенда: джобы с runAt в прошлом/сейчас выполняются сразу
 * в том же процессе. Follow-up D+3 остаётся ждать — на встрече нужен только D0.
 */
export class ImmediateQueue implements QueuePort {
  private readonly handlers = new Map<string, (payload: Record<string, unknown>) => Promise<void>>();
  private readonly jobs: QueuedJob[] = [];
  private draining = false;

  async start(): Promise<void> {}

  async stop(): Promise<void> {
    this.jobs.length = 0;
    this.handlers.clear();
  }

  async work<T extends object>(
    job: string,
    handler: (payload: T) => Promise<void>,
  ): Promise<void> {
    this.handlers.set(job, (payload) => handler(payload as T));
  }

  async enqueue(
    job: string,
    payload: Record<string, unknown>,
    options: { runAt?: Date; singletonKey?: string } = {},
  ): Promise<void> {
    if (options.singletonKey && this.jobs.some((item) => item.singletonKey === options.singletonKey)) {
      return;
    }

    this.jobs.push({
      job,
      payload,
      ...(options.runAt ? { runAt: options.runAt } : {}),
      ...(options.singletonKey ? { singletonKey: options.singletonKey } : {}),
    });

    queueMicrotask(() => {
      void this.drain();
    });
  }

  private async drain(): Promise<void> {
    if (this.draining) return;
    this.draining = true;

    try {
      const now = Date.now();
      const due: QueuedJob[] = [];
      const later: QueuedJob[] = [];

      for (const item of this.jobs) {
        if (!item.runAt || item.runAt.getTime() <= now) due.push(item);
        else later.push(item);
      }

      this.jobs.length = 0;
      this.jobs.push(...later);

      for (const item of due) {
        const handler = this.handlers.get(item.job);
        if (!handler) continue;
        await handler(item.payload);
      }
    } finally {
      this.draining = false;
      const now = Date.now();
      if (this.jobs.some((item) => !item.runAt || item.runAt.getTime() <= now)) {
        queueMicrotask(() => {
          void this.drain();
        });
      }
    }
  }
}
