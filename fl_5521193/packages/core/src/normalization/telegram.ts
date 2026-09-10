export interface TelegramIdentifier {
  /** Нормализованный username в нижнем регистре, без @ и без обёртки в URL. */
  username: string | null;
  /** Числовой Telegram user id, если он был в исходных данных. */
  userId: number | null;
  /**
   * Ссылка на канал или групповой чат, а не на пользователя.
   * Писать по такой ссылке в личку нельзя — контакт уходит в ручную очередь.
   */
  isChannelLink: boolean;
}

const USERNAME_RE = /^[a-z][a-z0-9_]{4,31}$/;

const EMPTY: TelegramIdentifier = { username: null, userId: null, isChannelLink: false };

/**
 * Приводит любое представление Telegram-контакта к username и/или user id.
 * Инвайт-ссылки (t.me/+..., /joinchat/) username не содержат и идентификатором не считаются.
 */
export function normalizeTelegram(value: unknown): TelegramIdentifier {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return { username: null, userId: value, isChannelLink: false };
  }
  if (typeof value !== 'string') return EMPTY;

  let cleaned = value.trim();
  if (cleaned.length === 0) return EMPTY;

  if (/^\d{5,15}$/.test(cleaned)) {
    return { username: null, userId: Number(cleaned), isChannelLink: false };
  }

  cleaned = cleaned
    .replace(/^https?:\/\//i, '')
    .replace(/^(www\.)?(t\.me|telegram\.me|telegram\.dog)\//i, '')
    .replace(/[?#].*$/, '')
    .replace(/\/+$/, '');

  if (cleaned.startsWith('+') || /^joinchat\//i.test(cleaned)) {
    return { username: null, userId: null, isChannelLink: true };
  }

  // t.me/s/channel — публичный превью канала.
  const isPreview = /^s\//i.test(cleaned);
  if (isPreview) cleaned = cleaned.slice(2);

  cleaned = cleaned.replace(/^@+/, '');

  // t.me/name/123 — ссылка на конкретный пост в канале.
  const segments = cleaned.split('/');
  const isPostLink = segments.length > 1 && /^\d+$/.test(segments[1] ?? '');
  const username = (segments[0] ?? '').toLowerCase();

  if (!USERNAME_RE.test(username)) return EMPTY;

  return { username, userId: null, isChannelLink: isPreview || isPostLink };
}
