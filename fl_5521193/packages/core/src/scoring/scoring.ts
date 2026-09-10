import {
  type QualificationAnswers,
  type Rating,
  type ScoreResult,
  type ScoringThresholds,
  type ScoringWeights,
} from '@astrostone/contracts';

/**
 * Scoring из п. 14 ТЗ. Веса и пороги приходят из scoring_configs: бизнес меняет их
 * без релиза. Причины начисления сохраняются — менеджер должен видеть, откуда балл.
 */
export function calculateScore(
  answers: QualificationAnswers,
  weights: ScoringWeights,
  thresholds: ScoringThresholds,
  configVersion: number,
): ScoreResult {
  let score = 0;
  const reasons: string[] = [];

  const add = (points: number, reason: string): void => {
    if (points === 0) return;
    score += points;
    reasons.push(`${reason} (+${points})`);
  };

  if (answers.practicesJyotish) add(weights.practicesJyotish, 'Практикует Джйотиш');
  if (answers.conductsConsultations) add(weights.conductsConsultations, 'Проводит консультации');

  if (answers.prescribesStones === 'REGULARLY') {
    add(weights.prescribesStonesRegularly, 'Регулярно назначает камни');
  } else if (answers.prescribesStones === 'SOMETIMES') {
    add(weights.prescribesStonesSometimes, 'Иногда назначает камни');
  }

  if (answers.hasSupplier === false) add(weights.noSupplier, 'Нет постоянного поставщика');

  if (answers.monthlyConsultations === '20_50') {
    add(weights.consultations20_50, '20–50 консультаций в месяц');
  } else if (answers.monthlyConsultations === '50_PLUS') {
    add(weights.consultations50Plus, '50+ консультаций в месяц');
  }

  if (answers.cooperationInterest === 'HIGH') add(weights.interestHigh, 'Высокий интерес');
  else if (answers.cooperationInterest === 'MEDIUM') add(weights.interestMedium, 'Средний интерес');
  else if (answers.cooperationInterest === 'LOW') add(weights.interestLow, 'Низкий интерес');

  const rating: Rating = score >= thresholds.A ? 'A' : score >= thresholds.B ? 'B' : 'C';

  return { score, rating, reasons, configVersion };
}
