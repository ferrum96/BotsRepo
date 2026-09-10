import { index, numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { contacts } from './contacts';

export const partners = pgTable('partners', {
  id: uuid('id').primaryKey().defaultRandom(),
  contactId: uuid('contact_id')
    .notNull()
    .unique()
    .references(() => contacts.id, { onDelete: 'cascade' }),
  promoCode: text('promo_code').notNull().unique(),
  referralSlug: text('referral_slug').notNull().unique(),
  connectedAt: timestamp('connected_at', { withTimezone: true }),
  materialsSeenAt: timestamp('materials_seen_at', { withTimezone: true }),
  firstReferralAt: timestamp('first_referral_at', { withTimezone: true }),
  firstSaleAt: timestamp('first_sale_at', { withTimezone: true }),
  activityStatus: text('activity_status').notNull().default('CONNECTED'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const referrals = pgTable(
  'referrals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    partnerId: uuid('partner_id')
      .notNull()
      .references(() => partners.id, { onDelete: 'cascade' }),
    externalClientId: text('external_client_id'),
    attributionType: text('attribution_type').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('referrals_partner').on(t.partnerId)],
);

export const orders = pgTable(
  'orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    partnerId: uuid('partner_id').references(() => partners.id, { onDelete: 'set null' }),
    referralId: uuid('referral_id').references(() => referrals.id, { onDelete: 'set null' }),
    externalOrderId: text('external_order_id').notNull().unique(),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    currency: text('currency').notNull().default('RUB'),
    status: text('status').notNull(),
    orderedAt: timestamp('ordered_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('orders_partner_date').on(t.partnerId, t.orderedAt)],
);
