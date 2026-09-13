import { DEDUP_LOOKUP_ORDER, IdentifierType } from '@astrostone/contracts';
import { normalizeEmail } from '../normalization/email';
import { normalizePhone } from '../normalization/phone';
import { normalizeTelegram } from '../normalization/telegram';
import { normalizeUrl } from '../normalization/url';
import { AMO_FIELD, type AmocrmContactMatch } from './fields';
import type { AmocrmPort } from './client';

export interface LookupIdentifier {
  type: IdentifierType;
  normalizedValue: string;
}

export interface AmocrmLookupHit {
  contact: AmocrmContactMatch;
  matchedBy: IdentifierType;
}

const telegramFromName = (name: string): string | null => {
  const mention = name.match(/@([a-zA-Z][a-zA-Z0-9_]{4,31})/);
  if (mention?.[1]) return mention[1].toLowerCase();
  const wrapped = name.match(/\(([a-z][a-z0-9_]{4,31})\)/i);
  return wrapped?.[1]?.toLowerCase() ?? null;
};

const matchPhones = (hit: AmocrmContactMatch): string[] => {
  const values = [...hit.phones];
  const extra = hit.fields[AMO_FIELD.WHATSAPP];
  if (typeof extra === 'string') values.push(extra);
  return values.map((value) => normalizePhone(value)).filter((value): value is string => Boolean(value));
};

const matchEmails = (hit: AmocrmContactMatch): string[] =>
  hit.emails.map((value) => normalizeEmail(value)).filter((value): value is string => Boolean(value));

const matchTelegramUsernames = (hit: AmocrmContactMatch): string[] => {
  const values: string[] = [];
  const field = hit.fields[AMO_FIELD.TG_USERNAME];
  if (typeof field === 'string') {
    const username = normalizeTelegram(field).username;
    if (username) values.push(username);
  }
  const fromName = telegramFromName(hit.name);
  if (fromName) values.push(fromName);
  return values;
};

const matchTelegramIds = (hit: AmocrmContactMatch): string[] => {
  const field = hit.fields[AMO_FIELD.TG_ID];
  if (field === undefined || field === null || field === '') return [];
  return [String(field)];
};

const matchUrls = (hit: AmocrmContactMatch): string[] => {
  const codes = [AMO_FIELD.TG_URL, AMO_FIELD.VK, AMO_FIELD.SITE, AMO_FIELD.IG, AMO_FIELD.PROFILE];
  return codes
    .map((code) => hit.fields[code])
    .filter((value): value is string => typeof value === 'string')
    .map((value) => normalizeUrl(value))
    .filter((value): value is string => Boolean(value));
};

export function contactMatchesIdentifiers(
  hit: AmocrmContactMatch,
  identifiers: LookupIdentifier[],
): IdentifierType | null {
  const phones = matchPhones(hit);
  const emails = matchEmails(hit);
  const usernames = matchTelegramUsernames(hit);
  const telegramIds = matchTelegramIds(hit);
  const urls = matchUrls(hit);

  for (const type of DEDUP_LOOKUP_ORDER) {
    const values = identifiers.filter((row) => row.type === type).map((row) => row.normalizedValue);
    if (values.length === 0) continue;

    const pool =
      type === IdentifierType.PHONE
        ? phones
        : type === IdentifierType.TELEGRAM_ID
          ? telegramIds
          : type === IdentifierType.EMAIL
            ? emails
            : type === IdentifierType.TELEGRAM_USERNAME
              ? usernames
              : urls;

    if (values.some((value) => pool.includes(value))) return type;
  }

  return null;
}

const searchQueries = (identifier: LookupIdentifier): string[] => {
  const value = identifier.normalizedValue;
  if (identifier.type === IdentifierType.PHONE) {
    return [value, value.replace(/^\+/, '')];
  }
  if (identifier.type === IdentifierType.TELEGRAM_USERNAME) {
    return [value, `@${value}`];
  }
  return [value];
};

/**
 * Поиск в amoCRM в порядке п. 3 ТЗ: телефон → Telegram → email → ссылка/username.
 * Подстрока amoCRM сама по себе не доказательство — сверяем нормализованные идентификаторы.
 */
export async function findAmocrmContact(
  client: AmocrmPort,
  identifiers: LookupIdentifier[],
): Promise<AmocrmLookupHit | null> {
  const seen = new Set<number>();

  for (const type of DEDUP_LOOKUP_ORDER) {
    const ofType = identifiers.filter((row) => row.type === type);
    for (const identifier of ofType) {
      for (const query of searchQueries(identifier)) {
        const hits = await client.searchContacts(query);
        for (const hit of hits) {
          if (seen.has(hit.id)) continue;
          seen.add(hit.id);
          const matchedBy = contactMatchesIdentifiers(hit, identifiers);
          if (matchedBy) return { contact: hit, matchedBy };
        }
      }
    }
  }

  return null;
}
