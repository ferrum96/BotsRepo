import type { QueuePort } from '@astrostone/core';

export interface QueuedJob {
  job: string;
  payload: Record<string, unknown>;
  runAt?: Date;
  singletonKey?: string;
}

/**
 * Очередь в памяти для e2e-прогона: задачи выполняются явно, шаг за шагом.
 * Так тест проверяет бизнес-цепочку, а не поведение pg-boss.
 */
export class InMemoryQueue implements QueuePort {
  readonly jobs: QueuedJob[] = [];

  async enqueue(
    job: string,
    payload: Record<string, unknown>,
    options: { runAt?: Date; singletonKey?: string } = {},
  ): Promise<void> {
    const singletonKey = options.singletonKey;

    if (singletonKey && this.jobs.some((existing) => existing.singletonKey === singletonKey)) {
      return;
    }

    this.jobs.push({
      job,
      payload,
      ...(options.runAt ? { runAt: options.runAt } : {}),
      ...(singletonKey ? { singletonKey } : {}),
    });
  }

  take(job: string): QueuedJob[] {
    const matching = this.jobs.filter((item) => item.job === job);
    for (const item of matching) this.jobs.splice(this.jobs.indexOf(item), 1);
    return matching;
  }

  clear(): void {
    this.jobs.length = 0;
  }
}
