/**
 * Поля карточки из п. 2 ТЗ, которые уходят в amoCRM.
 * Стандартные PHONE/EMAIL — кодами amoCRM. Остальные создаём сами (ASTRO_*),
 * чтобы тестовый аккаунт не зависел от ручной настройки воронки.
 */
export const AMO_FIELD = {
  PHONE: 'PHONE',
  EMAIL: 'EMAIL',
  TG_USERNAME: 'ASTRO_TG_USERNAME',
  TG_ID: 'ASTRO_TG_ID',
  WHATSAPP: 'ASTRO_WHATSAPP',
  TG_URL: 'ASTRO_TG_URL',
  VK: 'ASTRO_VK',
  SITE: 'ASTRO_SITE',
  IG: 'ASTRO_IG',
  PROFILE: 'ASTRO_PROFILE',
  SCHOOL: 'ASTRO_SCHOOL',
  CITY: 'ASTRO_CITY',
  COUNTRY: 'ASTRO_COUNTRY',
  SOURCE: 'ASTRO_SOURCE',
  PARSE_CHANNEL: 'ASTRO_PARSE_CHANNEL',
  SOURCE_URL: 'ASTRO_SOURCE_URL',
  COMMENT: 'ASTRO_COMMENT',
  SPEC: 'ASTRO_SPEC',
  VEDIC: 'ASTRO_VEDIC',
  CONTACT_TYPE: 'ASTRO_CONTACT_TYPE',
  DIRECTION: 'ASTRO_DIRECTION',
  ENTERED_AT: 'ASTRO_ENTERED_AT',
  QUALIFICATION: 'ASTRO_QUALIFICATION',
} as const;

export const CONTACT_TYPE_LABEL = 'потенциальный астро-партнёр';
export const DIRECTION_LABEL = 'Джйотиш / ведическая астрология';
export const SOURCE_LABEL = 'парсинг';
export const QUALIFICATION_NOT_LABELED = 'не квалифицирован';

export type ParseChannel = 'Telegram' | 'VK' | 'сайт' | 'Instagram' | 'другое';

export function parseChannelFromSource(
  source: string | null | undefined,
  urls: { instagramUrl?: string | null; website?: string | null; vkUrl?: string | null },
): ParseChannel {
  if (source === 'VK' || urls.vkUrl) return 'VK';
  if (urls.instagramUrl) return 'Instagram';
  if (source === 'PARSING_TELEGRAM' || source === 'TELEGRAM_ADS') return 'Telegram';
  if (urls.website || source === 'SEO') return 'сайт';
  return 'другое';
}

export function profileLinkFromCard(card: {
  profileUrl?: string | null;
  telegramUrl?: string | null;
  telegramUsername?: string | null;
  vkUrl?: string | null;
  instagramUrl?: string | null;
  website?: string | null;
}): string | null {
  if (card.profileUrl) return card.profileUrl;
  if (card.telegramUrl) return card.telegramUrl;
  if (card.telegramUsername) return `https://t.me/${card.telegramUsername}`;
  return card.vkUrl ?? card.instagramUrl ?? card.website ?? null;
}

export type AmoFieldCode = (typeof AMO_FIELD)[keyof typeof AMO_FIELD];

export interface CustomFieldSpec {
  code: string;
  name: string;
  type: 'text' | 'url' | 'textarea' | 'checkbox' | 'numeric' | 'date';
}

export const ASTRO_CUSTOM_FIELDS: CustomFieldSpec[] = [
  { code: AMO_FIELD.TG_USERNAME, name: 'Telegram username', type: 'text' },
  { code: AMO_FIELD.TG_ID, name: 'Telegram ID', type: 'numeric' },
  { code: AMO_FIELD.WHATSAPP, name: 'WhatsApp', type: 'text' },
  { code: AMO_FIELD.TG_URL, name: 'Telegram-канал', type: 'url' },
  { code: AMO_FIELD.VK, name: 'VK', type: 'url' },
  { code: AMO_FIELD.SITE, name: 'Сайт', type: 'url' },
  { code: AMO_FIELD.IG, name: 'Instagram', type: 'url' },
  { code: AMO_FIELD.PROFILE, name: 'Ссылка на профиль', type: 'url' },
  { code: AMO_FIELD.SCHOOL, name: 'Школа / проект', type: 'text' },
  { code: AMO_FIELD.CITY, name: 'Город', type: 'text' },
  { code: AMO_FIELD.COUNTRY, name: 'Страна', type: 'text' },
  { code: AMO_FIELD.SOURCE, name: 'Источник', type: 'text' },
  { code: AMO_FIELD.PARSE_CHANNEL, name: 'Источник парсинга', type: 'text' },
  { code: AMO_FIELD.SOURCE_URL, name: 'URL источника', type: 'url' },
  { code: AMO_FIELD.COMMENT, name: 'Комментарий', type: 'textarea' },
  { code: AMO_FIELD.SPEC, name: 'Деятельность', type: 'textarea' },
  { code: AMO_FIELD.VEDIC, name: 'Ведический астролог / Джйотиш', type: 'checkbox' },
  { code: AMO_FIELD.CONTACT_TYPE, name: 'Тип контакта', type: 'text' },
  { code: AMO_FIELD.DIRECTION, name: 'Направление', type: 'text' },
  { code: AMO_FIELD.ENTERED_AT, name: 'Дата попадания в базу', type: 'date' },
  { code: AMO_FIELD.QUALIFICATION, name: 'Статус квалификации', type: 'text' },
];

export interface AmocrmContactCard {
  name: string;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  email?: string | null;
  telegramUsername?: string | null;
  telegramUserId?: number | null;
  whatsapp?: string | null;
  telegramUrl?: string | null;
  vkUrl?: string | null;
  instagramUrl?: string | null;
  website?: string | null;
  profileUrl?: string | null;
  schoolName?: string | null;
  city?: string | null;
  country?: string | null;
  specialization?: string | null;
  comment?: string | null;
  isVedicAstrologer?: boolean | null;
  acquisitionSource?: string | null;
  sourceUrl?: string | null;
  contactType?: string | null;
  direction?: string | null;
  parseChannel?: string | null;
  enteredAt?: number | null;
  qualificationStatus?: string | null;
}

export interface AmocrmContactMatch {
  id: number;
  name: string;
  firstName?: string | null;
  lastName?: string | null;
  phones: string[];
  emails: string[];
  fields: Record<string, string | boolean | number>;
}

export interface AmocrmLeadMatch {
  id: number;
  name: string;
  contactId: number;
  pipelineId?: number;
  statusId?: number;
  closed: boolean;
}

export type AmocrmFieldValue = string | boolean | number;

export function cardCustomFields(card: AmocrmContactCard): Array<{
  code: string;
  value: AmocrmFieldValue;
}> {
  const rows: Array<{ code: string; value: AmocrmFieldValue }> = [];
  const push = (code: string, value: string | number | boolean | null | undefined): void => {
    if (value === null || value === undefined || value === '') return;
    rows.push({ code, value });
  };

  push(AMO_FIELD.TG_USERNAME, card.telegramUsername);
  push(AMO_FIELD.TG_ID, card.telegramUserId ?? null);
  push(AMO_FIELD.WHATSAPP, card.whatsapp);
  push(AMO_FIELD.TG_URL, card.telegramUrl);
  push(AMO_FIELD.VK, card.vkUrl);
  push(AMO_FIELD.SITE, card.website);
  push(AMO_FIELD.IG, card.instagramUrl);
  push(AMO_FIELD.PROFILE, profileLinkFromCard(card));
  push(AMO_FIELD.SCHOOL, card.schoolName);
  push(AMO_FIELD.CITY, card.city);
  push(AMO_FIELD.COUNTRY, card.country);
  push(AMO_FIELD.SOURCE, card.acquisitionSource ? SOURCE_LABEL : null);
  push(AMO_FIELD.PARSE_CHANNEL, card.parseChannel);
  push(AMO_FIELD.SOURCE_URL, card.sourceUrl);
  push(AMO_FIELD.COMMENT, card.comment);
  push(AMO_FIELD.SPEC, card.specialization);
  if (card.isVedicAstrologer !== null && card.isVedicAstrologer !== undefined) {
    push(AMO_FIELD.VEDIC, card.isVedicAstrologer);
  }
  push(AMO_FIELD.CONTACT_TYPE, card.contactType);
  push(AMO_FIELD.DIRECTION, card.direction);
  push(AMO_FIELD.ENTERED_AT, card.enteredAt ?? null);
  push(AMO_FIELD.QUALIFICATION, card.qualificationStatus);

  return rows;
}

export function cardNote(card: AmocrmContactCard, title: string): string {
  const line = (label: string, value: unknown): string | null => {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'boolean') return `${label}: ${value ? 'да' : 'нет'}`;
    return `${label}: ${value}`;
  };

  return [
    title,
    line('Имя', [card.firstName, card.lastName].filter(Boolean).join(' ') || card.name),
    line('Телефон', card.phone),
    line('WhatsApp', card.whatsapp),
    line('Email', card.email),
    line('Telegram', card.telegramUsername ? `@${card.telegramUsername}` : null),
    line('Telegram ID', card.telegramUserId),
    line('Канал', card.telegramUrl),
    line('VK', card.vkUrl),
    line('Сайт', card.website),
    line('Instagram', card.instagramUrl),
    line('Профиль', card.profileUrl),
    line('Школа / проект', card.schoolName),
    line('Город', card.city),
    line('Страна', card.country),
    line('Джйотиш', card.isVedicAstrologer),
    line('Деятельность', card.specialization),
    line('Тип контакта', card.contactType ?? CONTACT_TYPE_LABEL),
    line('Направление', card.direction ?? DIRECTION_LABEL),
    line('Источник', SOURCE_LABEL),
    line('Источник парсинга', card.parseChannel),
    line(
      'Дата попадания в базу',
      card.enteredAt ? new Date(card.enteredAt * 1000).toISOString().slice(0, 10) : null,
    ),
    line('Статус квалификации', card.qualificationStatus ?? QUALIFICATION_NOT_LABELED),
    line('URL источника', card.sourceUrl),
    line('Комментарий', card.comment),
  ]
    .filter(Boolean)
    .join('\n');
}

export function missingCardFields(
  existing: AmocrmContactMatch,
  incoming: AmocrmContactCard,
): AmocrmContactCard {
  const hasPhone = existing.phones.length > 0;
  const hasEmail = existing.emails.length > 0;
  const field = (code: string): AmocrmFieldValue | undefined => existing.fields[code];

  const empty = (code: string): boolean => {
    const value = field(code);
    return value === undefined || value === null || value === '';
  };

  return {
    name: existing.name || incoming.name,
    firstName: existing.firstName || incoming.firstName,
    lastName: existing.lastName || incoming.lastName,
    phone: hasPhone ? null : incoming.phone,
    email: hasEmail ? null : incoming.email,
    telegramUsername: empty(AMO_FIELD.TG_USERNAME) ? incoming.telegramUsername : null,
    telegramUserId: empty(AMO_FIELD.TG_ID) ? incoming.telegramUserId : null,
    whatsapp: empty(AMO_FIELD.WHATSAPP) ? incoming.whatsapp : null,
    telegramUrl: empty(AMO_FIELD.TG_URL) ? incoming.telegramUrl : null,
    vkUrl: empty(AMO_FIELD.VK) ? incoming.vkUrl : null,
    instagramUrl: empty(AMO_FIELD.IG) ? incoming.instagramUrl : null,
    website: empty(AMO_FIELD.SITE) ? incoming.website : null,
    profileUrl: empty(AMO_FIELD.PROFILE) ? incoming.profileUrl : null,
    schoolName: empty(AMO_FIELD.SCHOOL) ? incoming.schoolName : null,
    city: empty(AMO_FIELD.CITY) ? incoming.city : null,
    country: empty(AMO_FIELD.COUNTRY) ? incoming.country : null,
    specialization: empty(AMO_FIELD.SPEC) ? incoming.specialization : null,
    comment: empty(AMO_FIELD.COMMENT) ? incoming.comment : null,
    isVedicAstrologer: empty(AMO_FIELD.VEDIC) ? incoming.isVedicAstrologer : null,
    acquisitionSource: empty(AMO_FIELD.SOURCE) ? incoming.acquisitionSource : null,
    sourceUrl: empty(AMO_FIELD.SOURCE_URL) ? incoming.sourceUrl : null,
    contactType: empty(AMO_FIELD.CONTACT_TYPE) ? incoming.contactType : null,
    direction: empty(AMO_FIELD.DIRECTION) ? incoming.direction : null,
    parseChannel: empty(AMO_FIELD.PARSE_CHANNEL) ? incoming.parseChannel : null,
    enteredAt: empty(AMO_FIELD.ENTERED_AT) ? incoming.enteredAt : null,
    qualificationStatus: empty(AMO_FIELD.QUALIFICATION) ? incoming.qualificationStatus : null,
  };
}

export function cardHasPayload(card: AmocrmContactCard): boolean {
  return Boolean(
    card.phone ||
      card.email ||
      card.telegramUsername ||
      card.telegramUserId ||
      card.whatsapp ||
      card.telegramUrl ||
      card.vkUrl ||
      card.instagramUrl ||
      card.website ||
      card.profileUrl ||
      card.schoolName ||
      card.city ||
      card.country ||
      card.specialization ||
      card.comment ||
      (card.isVedicAstrologer !== null && card.isVedicAstrologer !== undefined) ||
      card.acquisitionSource ||
      card.sourceUrl ||
      card.direction ||
      card.parseChannel ||
      card.enteredAt ||
      card.qualificationStatus ||
      card.contactType,
  );
}

export function patchedFieldCodes(card: AmocrmContactCard): string[] {
  return cardCustomFields(card).map((row) => row.code);
}
