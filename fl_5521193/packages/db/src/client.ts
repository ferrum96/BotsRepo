import type { ExtractTablesWithRelations } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { PgDatabase, PgQueryResultHKT, PgTransaction } from 'drizzle-orm/pg-core';
import { Pool } from 'pg';
import * as schema from './schema/index';

export type Schema = typeof schema;

/**
 * Драйвер-независимый тип: прод работает на node-postgres, тесты — на PGlite
 * (настоящий PostgreSQL в WASM), поэтому сервисы не должны знать драйвер.
 */
export type Db = PgDatabase<PgQueryResultHKT, Schema>;
export type DbTx = PgTransaction<PgQueryResultHKT, Schema, ExtractTablesWithRelations<Schema>>;
export type DbOrTx = Db | DbTx;

export function createPool(connectionString: string): Pool {
  return new Pool({ connectionString, max: 10 });
}

export function createDb(pool: Pool): Db {
  return drizzle(pool, { schema }) as unknown as Db;
}

export { schema };
