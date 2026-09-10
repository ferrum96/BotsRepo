import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import type { NormalizedRow, RawImportRow } from '@astrostone/contracts';
import { contacts } from './contacts';
import { deals } from './deals';

export const importBatches = pgTable('import_batches', {
  id: uuid('id').primaryKey().defaultRandom(),
  filename: text('filename').notNull(),
  fileHash: text('file_hash').notNull(),
  source: text('source').notNull(),
  status: text('status').notNull().default('NEW'),
  totalRows: integer('total_rows').notNull().default(0),
  processedRows: integer('processed_rows').notNull().default(0),
  successRows: integer('success_rows').notNull().default(0),
  duplicateRows: integer('duplicate_rows').notNull().default(0),
  failedRows: integer('failed_rows').notNull().default(0),
  manualRows: integer('manual_rows').notNull().default(0),
  createdBy: uuid('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
});

export const importRows = pgTable(
  'import_rows',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    batchId: uuid('batch_id')
      .notNull()
      .references(() => importBatches.id, { onDelete: 'cascade' }),
    rowNumber: integer('row_number').notNull(),
    rawPayload: jsonb('raw_payload').notNull().$type<RawImportRow>(),
    normalizedPayload: jsonb('normalized_payload').$type<NormalizedRow>(),
    status: text('status').notNull().default('NEW'),
    contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
    dealId: uuid('deal_id').references(() => deals.id, { onDelete: 'set null' }),
    errorCode: text('error_code'),
    errorMessage: text('error_message'),
    idempotencyKey: text('idempotency_key').notNull(),
    correlationId: uuid('correlation_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Повторная загрузка того же файла не создаёт вторую обработку той же строки.
    uniqueIndex('import_rows_idempotency').on(t.idempotencyKey),
    index('import_rows_batch_status').on(t.batchId, t.status),
  ],
);
