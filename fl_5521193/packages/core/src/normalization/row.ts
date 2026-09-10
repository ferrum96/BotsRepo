import {
  AcquisitionSource,
  AutomationEligibility,
  COLUMN_ALIASES,
  ChannelKind,
  IdentifierType,
  importErrorCodes,
  type ImportErrorCode,
  type NormalizedRow,
  type RawImportRow,
} from '@astrostone/contracts';
import { normalizeEmail } from './email';
import { normalizeName, splitFullName } from './name';
import { normalizePhone } from './phone';
import { normalizeTelegram } from './telegram';
import { normalizeUrl } from './url';

export interface ExtractedIdentifier {
  type: IdentifierType;
  rawValue: string;
  normalizedValue: string;
}

export interface NormalizeRowResult {
  row: NormalizedRow;
  identifiers: ExtractedIdentifier[];
  eligibility: AutomationEligibility;
  preferredChannel: ChannelKind | null;
  errors: ImportErrorCode[];
}

const canonicalKey = (key: string): string =>
  key
    .toLowerCase()
    .replace(/[\s_\-.()]/g, '')
    .replace(/ё/g, 'е');

type MappableField = keyof typeof COLUMN_ALIASES;

/** Сопоставляет заголовки файла с полями модели: у спарсенных баз заголовки произвольные. */
export function mapColumns(
  headers: string[],
  manualMapping: Record<string, string> = {},
): Partial<Record<MappableField, string>> {
  const mapping: Partial<Record<MappableField, string>> = {};

  for (const [field, header] of Object.entries(manualMapping)) {
    if (field in COLUMN_ALIASES) mapping[field as MappableField] = header;
  }

  for (const [field, aliases] of Object.entries(COLUMN_ALIASES) as [MappableField, string[]][]) {
    if (mapping[field]) continue;

    const match = headers.find((header) => {
      const canonical = canonicalKey(header);
      return aliases.some((alias) => canonical === canonicalKey(alias));
    });

    if (match) mapping[field] = match;
  }

  return mapping;
}

const pick = (
  raw: RawImportRow,
  mapping: Partial<Record<MappableField, string>>,
  field: MappableField,
): unknown => {
  const header = mapping[field];
  return header ? raw[header] : undefined;
};

const parseBoolean = (value: unknown): boolean | null => {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return null;

  const cleaned = value.trim().toLowerCase();
  if (['да', 'yes', 'true', '1', '+', 'джйотиш'].includes(cleaned)) return true;
  if (['нет', 'no', 'false', '0', '-'].includes(cleaned)) return false;

  return null;
};

const asText = (value: unknown): string | null => {
  if (typeof value === 'number') return String(value);
  if (typeof value !== 'string') return null;
  const cleaned = value.trim();
  return cleaned.length > 0 ? cleaned : null;
};

/**
 * Приводит сырую строку файла к модели и собирает идентификаторы для дедупликации.
 * Решение о пригодности строки принимается здесь, по нормализованным значениям:
 * строка без идентификаторов бесполезна, строка без автоканала — не ошибка,
 * а повод отдать контакт менеджеру вручную (docs/01-tz-analysis.md, пробел 5).
 */
export function normalizeImportRow(
  raw: RawImportRow,
  options: {
    mapping: Partial<Record<MappableField, string>>;
    source: AcquisitionSource;
    defaultCountry?: string;
  },
): NormalizeRowResult {
  const { mapping, source } = options;
  const errors: ImportErrorCode[] = [];

  const rawFirstName = pick(raw, mapping, 'firstName');
  const rawLastName = pick(raw, mapping, 'lastName');

  let firstName = normalizeName(rawFirstName);
  let lastName = normalizeName(rawLastName);

  // ФИО одной колонкой: «Иванова Анна».
  if (!lastName && firstName && firstName.includes(' ')) {
    const split = splitFullName(firstName);
    firstName = split.firstName;
    lastName = split.lastName;
  }

  const phone = normalizePhone(pick(raw, mapping, 'phone'), options.defaultCountry);
  const whatsappSource = pick(raw, mapping, 'whatsapp');
  const whatsapp = normalizePhone(whatsappSource, options.defaultCountry);
  const email = normalizeEmail(pick(raw, mapping, 'email'));

  const telegramFromUsername = normalizeTelegram(pick(raw, mapping, 'telegramUsername'));
  const telegramFromUrl = normalizeTelegram(pick(raw, mapping, 'telegramUrl'));
  const telegramFromId = normalizeTelegram(pick(raw, mapping, 'telegramUserId'));

  const telegramUsername = telegramFromUsername.username ?? telegramFromUrl.username;
  const telegramUserId = telegramFromId.userId ?? telegramFromUsername.userId;
  // Ссылка на канал сама по себе не даёт возможности написать в личку.
  const onlyChannelLink =
    !telegramUsername && !telegramUserId && (telegramFromUrl.isChannelLink || telegramFromUsername.isChannelLink);

  const vkUrl = normalizeUrl(pick(raw, mapping, 'vkUrl'));
  const instagramUrl = normalizeUrl(pick(raw, mapping, 'instagramUrl'));
  const website = normalizeUrl(pick(raw, mapping, 'website'));
  const profileUrl = normalizeUrl(pick(raw, mapping, 'profileUrl'));
  const telegramUrl = normalizeUrl(pick(raw, mapping, 'telegramUrl'));

  const row: NormalizedRow = {
    firstName,
    lastName,
    phone,
    email,
    telegramUsername,
    telegramUserId,
    whatsapp,
    telegramUrl,
    vkUrl,
    instagramUrl,
    website,
    profileUrl,
    schoolName: asText(pick(raw, mapping, 'schoolName')),
    city: asText(pick(raw, mapping, 'city')),
    country: asText(pick(raw, mapping, 'country')),
    specialization: asText(pick(raw, mapping, 'specialization')),
    comment: asText(pick(raw, mapping, 'comment')),
    isVedicAstrologer: parseBoolean(pick(raw, mapping, 'isVedicAstrologer')),
    acquisitionSource: source,
    sourceUrl: asText(pick(raw, mapping, 'sourceUrl')),
  };

  const identifiers: ExtractedIdentifier[] = [];
  const push = (type: IdentifierType, rawValue: unknown, normalizedValue: string | null): void => {
    if (!normalizedValue) return;
    if (identifiers.some((i) => i.type === type && i.normalizedValue === normalizedValue)) return;
    identifiers.push({
      type,
      rawValue: asText(rawValue) ?? normalizedValue,
      normalizedValue,
    });
  };

  push(IdentifierType.PHONE, pick(raw, mapping, 'phone'), phone);
  push(IdentifierType.PHONE, whatsappSource, whatsapp);
  push(IdentifierType.TELEGRAM_ID, pick(raw, mapping, 'telegramUserId'), telegramUserId ? String(telegramUserId) : null);
  push(IdentifierType.EMAIL, pick(raw, mapping, 'email'), email);
  push(IdentifierType.TELEGRAM_USERNAME, pick(raw, mapping, 'telegramUsername'), telegramUsername);
  push(IdentifierType.URL, pick(raw, mapping, 'vkUrl'), vkUrl);
  push(IdentifierType.URL, pick(raw, mapping, 'instagramUrl'), instagramUrl);
  push(IdentifierType.URL, pick(raw, mapping, 'profileUrl'), profileUrl);
  push(IdentifierType.URL, pick(raw, mapping, 'website'), website);

  const hasAnyValue = Object.values(raw).some((value) => asText(value) !== null);
  if (!hasAnyValue) errors.push(importErrorCodes.EMPTY_ROW);
  if (identifiers.length === 0 && hasAnyValue) errors.push(importErrorCodes.NO_IDENTIFIER);
  if (!firstName && errors.length === 0) errors.push(importErrorCodes.NO_NAME);

  // Автоматически достижимые каналы: Telegram по username/id, WhatsApp по номеру, email.
  let preferredChannel: ChannelKind | null = null;
  if (telegramUsername || telegramUserId) preferredChannel = ChannelKind.TELEGRAM;
  else if (whatsapp ?? phone) preferredChannel = ChannelKind.WHATSAPP;
  else if (email) preferredChannel = ChannelKind.EMAIL;

  const eligibility =
    errors.length > 0
      ? AutomationEligibility.BLOCKED
      : preferredChannel
        ? AutomationEligibility.AUTO_OK
        : AutomationEligibility.MANUAL_ONLY;

  if (onlyChannelLink && eligibility === AutomationEligibility.MANUAL_ONLY) {
    row.comment = [row.comment, 'Только ссылка на канал, личный диалог недоступен']
      .filter(Boolean)
      .join('; ');
  }

  return { row, identifiers, eligibility, preferredChannel, errors };
}
