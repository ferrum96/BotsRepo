import { sql } from 'drizzle-orm';
import {
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
import { deals } from './deals';
import { channels } from './managers';

export const messageTemplates = pgTable('message_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: text('code').notNull().unique(),
  step: text('step').notNull(),
  channelKind: text('channel_kind').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const templateVersions = pgTable(
  'template_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    templateId: uuid('template_id')
      .notNull()
      .references(() => messageTemplates.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    body: text('body').notNull(),
    /** Переменные, без которых шаблон не рендерится (п. 8 ТЗ: «Здравствуйте, !» недопустимо). */
    requiredVariables: jsonb('required_variables').notNull().$type<string[]>().default([]),
    fallbacks: jsonb('fallbacks').notNull().$type<Record<string, string>>().default({}),
    isActive: boolean('is_active').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('template_versions_unique').on(t.templateId, t.version)],
);

export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),
    dealId: uuid('deal_id').references(() => deals.id, { onDelete: 'set null' }),
    channelId: uuid('channel_id').references(() => channels.id),
    channelKind: text('channel_kind').notNull(),
    direction: text('direction').notNull(),
    step: text('step'),
    templateVersionId: uuid('template_version_id').references(() => templateVersions.id),
    /** Фактически отправленный текст, а не ID шаблона: шаблоны меняются. */
    renderedBody: text('rendered_body').notNull(),
    externalMessageId: text('external_message_id'),
    status: text('status').notNull().default('QUEUED'),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    failedAt: timestamp('failed_at', { withTimezone: true }),
    failureReason: text('failure_reason'),
    idempotencyKey: text('idempotency_key'),
    correlationId: uuid('correlation_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Одно и то же касание не уйдёт дважды даже при повторе джобы.
    uniqueIndex('messages_idempotency')
      .on(t.idempotencyKey)
      .where(sql`${t.idempotencyKey} is not null`),
    index('messages_deal_created').on(t.dealId, t.createdAt),
    index('messages_status_scheduled').on(t.status, t.scheduledAt),
  ],
);

/** Идемпотентность вебхуков: повторная доставка не должна создавать вторую запись. */
export const inboundEvents = pgTable(
  'inbound_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    channel: text('channel').notNull(),
    externalEventId: text('external_event_id').notNull(),
    payload: jsonb('payload').notNull(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('inbound_events_unique').on(t.channel, t.externalEventId)],
);
