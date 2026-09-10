import { z } from 'zod';

/** Анкета из п. 13 ТЗ. */
export const qualificationSchema = z.object({
  practicesJyotish: z.boolean().nullable(),
  conductsConsultations: z.boolean().nullable(),
  prescribesStones: z.enum(['REGULARLY', 'SOMETIMES', 'NEVER']).nullable(),
  hasSupplier: z.boolean().nullable(),
  monthlyConsultations: z.enum(['0_5', '5_20', '20_50', '50_PLUS']).nullable(),
  cooperationInterest: z.enum(['HIGH', 'MEDIUM', 'LOW']).nullable(),
  comment: z.string().max(2000).nullable().optional(),
});
export type QualificationAnswers = z.infer<typeof qualificationSchema>;

/**
 * Веса и пороги живут в БД (scoring_configs) и версионируются: бизнес их меняет.
 * Здесь — только дефолт для сида и тестов, из п. 14 ТЗ.
 */
export const scoringWeightsSchema = z.object({
  practicesJyotish: z.number(),
  conductsConsultations: z.number(),
  prescribesStonesRegularly: z.number(),
  prescribesStonesSometimes: z.number(),
  noSupplier: z.number(),
  consultations20_50: z.number(),
  consultations50Plus: z.number(),
  interestHigh: z.number(),
  interestMedium: z.number(),
  interestLow: z.number(),
});
export type ScoringWeights = z.infer<typeof scoringWeightsSchema>;

export const DEFAULT_SCORING_WEIGHTS: ScoringWeights = {
  practicesJyotish: 3,
  conductsConsultations: 3,
  prescribesStonesRegularly: 5,
  prescribesStonesSometimes: 2,
  noSupplier: 3,
  consultations20_50: 4,
  consultations50Plus: 5,
  interestHigh: 5,
  interestMedium: 3,
  interestLow: 1,
};

export const scoringThresholdsSchema = z.object({ A: z.number(), B: z.number() });
export type ScoringThresholds = z.infer<typeof scoringThresholdsSchema>;

/** Максимум по формуле ТЗ — 23. Пороги требуют подтверждения заказчиком (вопрос 8). */
export const DEFAULT_SCORING_THRESHOLDS: ScoringThresholds = { A: 16, B: 10 };

export type Rating = 'A' | 'B' | 'C';

export interface ScoreResult {
  score: number;
  rating: Rating;
  reasons: string[];
  configVersion: number;
}
