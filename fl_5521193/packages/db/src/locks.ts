import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { DbTx } from './client';

/**
 * Стабильный 64-битный ключ для advisory lock из произвольной строки.
 * Берём 8 байт sha256 и приводим к signed bigint — pg_advisory_xact_lock(bigint).
 */
export function advisoryLockKey(value: string): bigint {
  const digest = createHash('sha256').update(value).digest();
  return digest.readBigInt64BE(0);
}

/**
 * Транзакционный advisory lock: снимается автоматически при commit или rollback,
 * поэтому упавший воркер не оставляет висящую блокировку (docs/02-critical.md R3).
 */
export async function acquireAdvisoryLock(tx: DbTx, value: string): Promise<void> {
  const key = advisoryLockKey(value);
  await tx.execute(sql`select pg_advisory_xact_lock(${key}::bigint)`);
}
