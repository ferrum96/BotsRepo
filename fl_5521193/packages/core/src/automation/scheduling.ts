import { OUTREACH_SEQUENCE, OutreachStep } from '@astrostone/contracts';

export interface ScheduledStep {
  step: OutreachStep;
  runAt: Date;
}

/**
 * Следующий шаг серии касаний (п. 11 ТЗ). Возвращает null, когда серия исчерпана —
 * дальше сделка уходит в длительный прогрев.
 *
 * Каждый шаг планируется отдельной задачей: один «спящий» сценарий на 30 дней
 * не переживает ни рестарт, ни изменение состояния сделки.
 */
export function nextOutreachStep(
  currentStep: OutreachStep | null,
  from: Date,
): ScheduledStep | null {
  if (currentStep === null) {
    const first = OUTREACH_SEQUENCE[0];
    return first ? { step: first.step, runAt: from } : null;
  }

  const currentIndex = OUTREACH_SEQUENCE.findIndex((item) => item.step === currentStep);
  if (currentIndex === -1) return null;

  const current = OUTREACH_SEQUENCE[currentIndex];
  const next = OUTREACH_SEQUENCE[currentIndex + 1];
  if (!current || !next) return null;

  const delayDays = next.delayDays - current.delayDays;

  return { step: next.step, runAt: new Date(from.getTime() + delayDays * 24 * 3600 * 1000) };
}
