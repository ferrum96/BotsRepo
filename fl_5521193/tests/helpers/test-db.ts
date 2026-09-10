import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { schema, seedReferenceData, type Db } from '@astrostone/db';

const migrationsFolder = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'packages',
  'db',
  'migrations',
);

export interface TestDb {
  db: Db;
  close: () => Promise<void>;
}

/**
 * PGlite — настоящий PostgreSQL, собранный в WASM. Дедупликация, advisory locks
 * и partial unique indexes проверяются на реальном движке, без Docker.
 * Тесты на конкуренцию двух воркеров требуют настоящего сервера — они запускаются
 * отдельно на Testcontainers, когда доступен Docker (docs/04-stack-adr.md, ADR-010).
 */
export async function createTestDb(options: { seed?: boolean } = {}): Promise<TestDb> {
  const client = new PGlite();
  const db = drizzle(client, { schema }) as unknown as Db;

  await migrate(db as never, { migrationsFolder });

  if (options.seed !== false) await seedReferenceData(db);

  return {
    db,
    close: async () => {
      await client.close();
    },
  };
}
