import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SCORING_THRESHOLDS,
  DEFAULT_SCORING_WEIGHTS,
  type QualificationAnswers,
} from '@astrostone/contracts';
import { calculateScore, nextOutreachStep, renderTemplate, TemplateRenderError } from '@astrostone/core';
import { OutreachStep } from '@astrostone/contracts';

const score = (answers: Partial<QualificationAnswers>) =>
  calculateScore(
    {
      practicesJyotish: null,
      conductsConsultations: null,
      prescribesStones: null,
      hasSupplier: null,
      monthlyConsultations: null,
      cooperationInterest: null,
      ...answers,
    },
    DEFAULT_SCORING_WEIGHTS,
    DEFAULT_SCORING_THRESHOLDS,
    1,
  );

describe('scoring (п. 14 ТЗ)', () => {
  it('идеальный профиль набирает максимум и рейтинг A', () => {
    const result = score({
      practicesJyotish: true,
      conductsConsultations: true,
      prescribesStones: 'REGULARLY',
      hasSupplier: false,
      monthlyConsultations: '50_PLUS',
      cooperationInterest: 'HIGH',
    });

    expect(result.score).toBe(24);
    expect(result.rating).toBe('A');
    expect(result.reasons).toHaveLength(6);
  });

  it('пустая анкета даёт 0 и рейтинг C', () => {
    const result = score({});

    expect(result.score).toBe(0);
    expect(result.rating).toBe('C');
    expect(result.reasons).toEqual([]);
  });

  it('наличие своего поставщика не приносит баллов', () => {
    expect(score({ hasSupplier: true }).score).toBe(0);
    expect(score({ hasSupplier: false }).score).toBe(DEFAULT_SCORING_WEIGHTS.noSupplier);
  });

  it('сохраняет причины начисления: менеджер должен видеть, откуда балл', () => {
    const result = score({ practicesJyotish: true, cooperationInterest: 'HIGH' });

    expect(result.reasons).toEqual(['Практикует Джйотиш (+3)', 'Высокий интерес (+5)']);
  });

  it('пороги приходят извне, а не зашиты в код', () => {
    const answers: QualificationAnswers = {
      practicesJyotish: true,
      conductsConsultations: true,
      prescribesStones: 'SOMETIMES',
      hasSupplier: true,
      monthlyConsultations: '5_20',
      cooperationInterest: 'MEDIUM',
    };

    expect(calculateScore(answers, DEFAULT_SCORING_WEIGHTS, { A: 16, B: 10 }, 1).rating).toBe('B');
    expect(calculateScore(answers, DEFAULT_SCORING_WEIGHTS, { A: 20, B: 15 }, 1).rating).toBe('C');
    expect(calculateScore(answers, DEFAULT_SCORING_WEIGHTS, { A: 8, B: 5 }, 1).rating).toBe('A');
  });
});

describe('renderTemplate', () => {
  it('подставляет переменные', () => {
    expect(renderTemplate('Здравствуйте, {{firstName}}!', { firstName: 'Анна' })).toBe(
      'Здравствуйте, Анна!',
    );
  });

  it('падает на пустой обязательной переменной вместо «Здравствуйте, !»', () => {
    expect(() =>
      renderTemplate('Здравствуйте, {{firstName}}!', { firstName: '' }, { requiredVariables: ['firstName'] }),
    ).toThrow(TemplateRenderError);
  });

  it('использует fallback, если он задан', () => {
    const result = renderTemplate(
      'Здравствуйте, {{firstName}}!',
      { firstName: null },
      { requiredVariables: ['firstName'], fallbacks: { firstName: 'коллега' } },
    );

    expect(result).toBe('Здравствуйте, коллега!');
  });
});

describe('планировщик серии касаний (п. 11 ТЗ)', () => {
  const start = new Date('2026-09-08T09:00:00.000Z');

  it('первый шаг ставится сразу', () => {
    expect(nextOutreachStep(null, start)).toEqual({ step: OutreachStep.FIRST, runAt: start });
  });

  it('интервалы соответствуют D0/D3/D7/D14/D30', () => {
    const days = (from: Date, to: Date) => Math.round((to.getTime() - from.getTime()) / 86_400_000);

    const d3 = nextOutreachStep(OutreachStep.FIRST, start)!;
    expect(d3.step).toBe(OutreachStep.FOLLOWUP_D3);
    expect(days(start, d3.runAt)).toBe(3);

    const d7 = nextOutreachStep(OutreachStep.FOLLOWUP_D3, d3.runAt)!;
    expect(days(start, d7.runAt)).toBe(7);

    const d14 = nextOutreachStep(OutreachStep.FOLLOWUP_D7, d7.runAt)!;
    expect(days(start, d14.runAt)).toBe(14);

    const d30 = nextOutreachStep(OutreachStep.FOLLOWUP_D14, d14.runAt)!;
    expect(days(start, d30.runAt)).toBe(30);
  });

  it('после последнего касания серия заканчивается', () => {
    expect(nextOutreachStep(OutreachStep.FOLLOWUP_D30, start)).toBeNull();
  });
});
