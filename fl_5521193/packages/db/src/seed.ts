import { createDb, createPool } from './client';
import { seedReferenceData } from './seed-data';

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');

  const pool = createPool(url);
  try {
    await seedReferenceData(createDb(pool));
    console.log('reference data seeded');
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
