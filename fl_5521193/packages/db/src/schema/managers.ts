import {
  bigint,
  boolean,
  date,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

export const managers = pgTable('managers', {
  id: uuid('id').primaryKey().defaultRandom(),
  fullName: text('full_name').notNull(),
  email: text('email').notNull().unique(),
  amocrmUserId: bigint('amocrm_user_id', { mode: 'number' }),
  role: text('role').notNull().default('MANAGER'),
  isActive: boolean('is_active').notNull().default(true),
  assignmentCount: integer('assignment_count').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Канал = один аккаунт/номер в мессенджер-шлюзе. Бан приходит на канал,
 * а не на менеджера, поэтому лимит нужен именно здесь (docs/05-data-model.md).
 */
export const channels = pgTable('channels', {
  id: uuid('id').primaryKey().defaultRandom(),
  kind: text('kind').notNull(),
  externalRef: text('external_ref').notNull(),
  canInitiate: boolean('can_initiate').notNull().default(false),
  dailyLimit: integer('daily_limit').notNull().default(20),
  sendWindow: jsonb('send_window')
    .notNull()
    .$type<{ from: string; to: string; weekdays: number[] }>(),
  warmupUntil: date('warmup_until'),
  status: text('status').notNull().default('ACTIVE'),
  managerId: uuid('manager_id').references(() => managers.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const channelUsage = pgTable(
  'channel_usage',
  {
    channelId: uuid('channel_id')
      .notNull()
      .references(() => channels.id, { onDelete: 'cascade' }),
    usageDate: date('usage_date').notNull(),
    sentCount: integer('sent_count').notNull().default(0),
    lastSentAt: timestamp('last_sent_at', { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.channelId, t.usageDate] })],
);

export const managerLimits = pgTable(
  'manager_limits',
  {
    managerId: uuid('manager_id')
      .notNull()
      .references(() => managers.id, { onDelete: 'cascade' }),
    usageDate: date('usage_date').notNull(),
    dailyLimit: integer('daily_limit').notNull().default(20),
    usedCount: integer('used_count').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.managerId, t.usageDate] })],
);
