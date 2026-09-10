import { describe, expect, it } from 'vitest';
import { isInsideSendWindow, jitterSeconds, nextSendWindowStart } from '@astrostone/core';

const window = { from: '10:00', to: '19:00', weekdays: [1, 2, 3, 4, 5] };

describe('окно отправки', () => {
  it('рабочий день внутри окна проходит', () => {
    // Вторник, 12:00 MSK.
    expect(isInsideSendWindow(new Date('2026-09-08T09:00:00Z'), window, 'Europe/Moscow')).toBe(true);
  });

  it('ночь не проходит: сообщение в 4 утра — жалоба, а не касание', () => {
    expect(isInsideSendWindow(new Date('2026-09-08T01:00:00Z'), window, 'Europe/Moscow')).toBe(
      false,
    );
  });

  it('выходной не проходит', () => {
    // Суббота, 12:00 MSK.
    expect(isInsideSendWindow(new Date('2026-09-05T09:00:00Z'), window, 'Europe/Moscow')).toBe(
      false,
    );
  });

  it('учитывает часовой пояс контакта, а не сервера', () => {
    const moment = new Date('2026-09-08T22:00:00Z');

    // 01:00 в Москве — нельзя, 15:00 в Лос-Анджелесе — можно.
    expect(isInsideSendWindow(moment, window, 'Europe/Moscow')).toBe(false);
    expect(isInsideSendWindow(moment, window, 'America/Los_Angeles')).toBe(true);
  });

  it('ночью переносит на утро того же дня', () => {
    const next = nextSendWindowStart(new Date('2026-09-08T01:00:00Z'), window, 'Europe/Moscow');

    expect(next.toISOString()).toBe('2026-09-08T07:00:00.000Z');
  });

  it('в пятницу вечером переносит на утро понедельника', () => {
    const next = nextSendWindowStart(new Date('2026-09-04T20:00:00Z'), window, 'Europe/Moscow');

    expect(next.toISOString()).toBe('2026-09-07T07:00:00.000Z');
  });

  it('внутри окна ничего не переносит', () => {
    const now = new Date('2026-09-08T09:00:00Z');

    expect(nextSendWindowStart(now, window, 'Europe/Moscow')).toBe(now);
  });

  it('падает при заведомо неверном конфиге окна', () => {
    expect(() =>
      nextSendWindowStart(new Date('2026-09-08T01:00:00Z'), { ...window, weekdays: [] }, 'UTC'),
    ).toThrow();
  });
});

describe('джиттер', () => {
  it('держится в заданном диапазоне', () => {
    expect(jitterSeconds(60, 180, () => 0)).toBe(60);
    expect(jitterSeconds(60, 180, () => 0.999)).toBeLessThan(180);
    expect(jitterSeconds(60, 60)).toBe(60);
  });
});
