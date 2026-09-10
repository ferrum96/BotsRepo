import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { contacts } from './contacts';
import { managers } from './managers';

export const deals = pgTable(
  'deals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),
    amocrmDealId: bigint('amocrm_deal_id', { mode: 'number' }).unique(),
    pipeline: text('pipeline').notNull(),
    stage: text('stage').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    closedReason: text('closed_reason'),
    responsibleManagerId: uuid('responsible_manager_id').references(() => managers.id),
    automationStatus: text('automation_status').notNull().default('ACTIVE'),
    automationStep: text('automation_step').notNull().default('NEW'),
    score: integer('score'),
    rating: text('rating'),
    scoreReasons: jsonb('score_reasons').$type<string[]>(),
    nextActionAt: timestamp('next_action_at', { withTimezone: true }),
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
    lastReplyAt: timestamp('last_reply_at', { withTimezone: true }),
    correlationId: uuid('correlation_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // П. 3 ТЗ: не создавать дублирующую сделку, если есть активная.
    // Partial unique index — гарантия БД при любой конкуренции воркеров.
    uniqueIndex('deals_one_active_per_contact')
      .on(t.contactId)
      .where(sql`${t.pipeline} = 'PARTNER_ACQUISITION' and ${t.isActive}`),
    index('deals_stage').on(t.pipeline, t.stage),
    index('deals_automation').on(t.automationStatus, t.nextActionAt),
    index('deals_manager').on(t.responsibleManagerId),
  ],
);

export const managerTasks = pgTable(
  'manager_tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    dealId: uuid('deal_id')
      .notNull()
      .references(() => deals.id, { onDelete: 'cascade' }),
    managerId: uuid('manager_id').references(() => managers.id),
    kind: text('kind').notNull(),
    title: text('title').notNull(),
    dueAt: timestamp('due_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    amocrmTaskId: bigint('amocrm_task_id', { mode: 'number' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('manager_tasks_open').on(t.managerId, t.completedAt)],
);
