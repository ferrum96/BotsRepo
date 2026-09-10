import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import type { ScoringThresholds, ScoringWeights } from '@astrostone/contracts';
import { deals } from './deals';

export const qualificationAnswers = pgTable(
  'qualification_answers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    dealId: uuid('deal_id')
      .notNull()
      .references(() => deals.id, { onDelete: 'cascade' }),
    practicesJyotish: boolean('practices_jyotish'),
    conductsConsultations: boolean('conducts_consultations'),
    prescribesStones: text('prescribes_stones'),
    hasSupplier: boolean('has_supplier'),
    monthlyConsultations: text('monthly_consultations'),
    cooperationInterest: text('cooperation_interest'),
    comment: text('comment'),
    filledBy: uuid('filled_by'),
    filledAt: timestamp('filled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('qualification_one_per_deal').on(t.dealId)],
);

/** Веса и пороги версионируются: бизнес меняет их без правки кода (п. 14 ТЗ). */
export const scoringConfigs = pgTable('scoring_configs', {
  id: uuid('id').primaryKey().defaultRandom(),
  version: integer('version').notNull().unique(),
  weights: jsonb('weights').notNull().$type<ScoringWeights>(),
  thresholds: jsonb('thresholds').notNull().$type<ScoringThresholds>(),
  isActive: boolean('is_active').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
