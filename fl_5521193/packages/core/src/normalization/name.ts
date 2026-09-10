const ZERO_WIDTH = /[\u200B-\u200D\uFEFF]/g;
const LETTER = /\p{L}/u;

/**
 * Имя для подстановки в шаблон: чистим мусор, но не «улучшаем» написание.
 * Значение без букв (эмодзи, цифры, «-») именем не считается: в сообщение
 * такое подставлять нельзя, лучше отправить строку в ручную обработку.
 */
export function normalizeName(value: unknown): string | null {
  if (typeof value !== 'string') return null;

  const cleaned = value
    .replace(ZERO_WIDTH, '')
    .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '')
    .replace(/[«»"'`*_]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (cleaned.length === 0 || cleaned.length > 100) return null;
  if (!LETTER.test(cleaned)) return null;

  return cleaned;
}

/** Разделяет «Иванова Анна» на фамилию и имя, когда ФИО пришло одной колонкой. */
export function splitFullName(value: unknown): { firstName: string | null; lastName: string | null } {
  const normalized = normalizeName(value);
  if (!normalized) return { firstName: null, lastName: null };

  const parts = normalized.split(' ').filter(Boolean);
  if (parts.length === 1) return { firstName: parts[0] ?? null, lastName: null };

  return { firstName: parts[1] ?? null, lastName: parts[0] ?? null };
}
