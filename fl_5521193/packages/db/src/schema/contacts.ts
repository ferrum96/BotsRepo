import {
  bigint,
  boolean,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const contacts = pgTable('contacts', {
  id: uuid('id').primaryKey().defaultRandom(),
  amocrmContactId: bigint('amocrm_contact_id', { mode: 'number' }).unique(),
  firstName: text('first_name'),
  lastName: text('last_name'),
  phoneRaw: text('phone_raw'),
  emailRaw: text('email_raw'),
  telegramUsernameRaw: text('telegram_username_raw'),
  telegramUserId: bigint('telegram_user_id', { mode: 'number' }),
  whatsappRaw: text('whatsapp_raw'),
  profileUrl: text('profile_url'),
  telegramUrl: text('telegram_url'),
  vkUrl: text('vk_url'),
  instagramUrl: text('instagram_url'),
  website: text('website'),
  schoolName: text('school_name'),
  city: text('city'),
  country: text('country'),
  timezone: text('timezone'),
  specialization: text('specialization'),
  comment: text('comment'),
  contactType: text('contact_type').notNull().default('POTENTIAL_ASTRO_PARTNER'),
  acquisitionSource: text('acquisition_source').notNull(),
  qualificationStatus: text('qualification_status').notNull().default('NOT_QUALIFIED'),
  automationEligibility: text('automation_eligibility').notNull().default('UNKNOWN'),
  preferredChannel: text('preferred_channel'),
  legalBasis: text('legal_basis'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const contactIdentifiers = pgTable(
  'contact_identifiers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    rawValue: text('raw_value').notNull(),
    normalizedValue: text('normalized_value').notNull(),
    isPrimary: boolean('is_primary').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Главная гарантия от дублей: ограничение БД, а не проверка в коде.
    uniqueIndex('contact_identifiers_unique').on(t.type, t.normalizedValue),
    index('contact_identifiers_contact').on(t.contactId),
  ],
);

/** Происхождение персональных данных: обязательно для 152-ФЗ, см. docs/02-critical.md R2. */
export const dataProvenance = pgTable(
  'data_provenance',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),
    source: text('source').notNull(),
    sourceUrl: text('source_url'),
    collectedAt: timestamp('collected_at', { withTimezone: true }),
    importRowId: uuid('import_row_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('data_provenance_contact').on(t.contactId)],
);

/** Нечёткие совпадения решает человек, автослияние необратимо портит данные. */
export const duplicateReviews = pgTable(
  'duplicate_reviews',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    importRowId: uuid('import_row_id').notNull(),
    candidateContactId: uuid('candidate_contact_id')
      .notNull()
      .references(() => contacts.id, { onDelete: 'cascade' }),
    matchReason: text('match_reason').notNull(),
    confidence: numeric('confidence', { precision: 3, scale: 2 }).notNull(),
    status: text('status').notNull().default('PENDING'),
    resolvedBy: uuid('resolved_by'),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('duplicate_reviews_status').on(t.status, t.createdAt)],
);

export const suppressionList = pgTable(
  'suppression_list',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'cascade' }),
    identifier: text('identifier'),
    channelKind: text('channel_kind'),
    level: text('level').notNull(),
    pausedUntil: timestamp('paused_until', { withTimezone: true }),
    reason: text('reason').notNull(),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('suppression_lookup').on(t.contactId, t.channelKind),
    index('suppression_identifier').on(t.identifier),
  ],
);