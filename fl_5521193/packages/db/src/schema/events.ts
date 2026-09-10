import {
  bigserial,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { contacts } from './contacts';
import { deals } from './deals';

/** Единый журнал событий автоматизации (п. 19 ТЗ) и основа аналитики (п. 17). */
export const automationEvents = pgTable(
  'automation_events',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
    dealId: uuid('deal_id').references(() => deals.id, { onDelete: 'set null' }),
    eventType: text('event_type').notNull(),
    payload: jsonb('payload'),
    source: text('source').notNull(),
    correlationId: uuid('correlation_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('automation_events_contact').on(t.contactId, t.createdAt),
    index('automation_events_correlation').on(t.correlationId),
    index('automation_events_type_date').on(t.eventType, t.createdAt),
  ],
);

/** Аудит административных действий. ПД в diff маскируются на уровне сервиса. */
export const auditLog = pgTable(
  'audit_log',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    actorId: uuid('actor_id'),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id'),
    diff: jsonb('diff'),
    ip: text('ip'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('audit_log_actor').on(t.actorId, t.createdAt)],
);

/** Лог обращений к внешним API — страница «Логи интеграции» в админке. */
export const integrationLogs = pgTable(
  'integration_logs',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    system: text('system').notNull(),
    operation: text('operation').notNull(),
    requestSummary: jsonb('request_summary'),
    responseStatus: text('response_status'),
    responseSummary: jsonb('response_summary'),
    durationMs: integer('duration_ms'),
    correlationId: uuid('correlation_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('integration_logs_system_date').on(t.system, t.createdAt)],
);
