import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
import { schema, type Db } from './client';
import { seedReferenceData } from './seed-data';

const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

export interface EmbeddedDb {
  db: Db;
  close: () => Promise<void>;
}

/**
 * Демо без Docker: Postgres в WASM, файл на диске. Не для продакшена —
 * нет LISTEN/NOTIFY, поэтому очередь тоже in-process (ImmediateQueue).
 */
export async function createEmbeddedDb(dataDir: string): Promise<EmbeddedDb> {
  await mkdir(dataDir, { recursive: true });
  const client = new PGlite(dataDir);
  const db = drizzle(client, { schema }) as unknown as Db;
  await migrate(db as never, { migrationsFolder });
  await seedReferenceData(db);
  return {
    db,
    close: async () => {
      await client.close();
    },
  };
}
