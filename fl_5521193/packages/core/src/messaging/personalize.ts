/**
 * Хук первого касания из полей карточки (п. 8 ТЗ).
 * Имя подставляет шаблон. Здесь — школа / канал / специализация / город,
 * чтобы текст не был одним и тем же «практикуете ведическую астрологию».
 */

export interface OutreachHookInput {
  schoolName?: string | null;
  city?: string | null;
  specialization?: string | null;
  telegramUrl?: string | null;
  isVedicAstrologer?: boolean | null;
}

const GENERIC_SPEC = /^(джйотиш|ведическая астрология|астрология)$/i;

function clean(value: string | null | undefined): string | null {
  const text = value?.replace(/\s+/g, ' ').trim();
  return text ? text : null;
}

function channelHandle(url: string | null | undefined): string | null {
  if (!url) return null;
  const match = url.match(/(?:t\.me|telegram\.me)\/(?:s\/)?([A-Za-z0-9_]{4,})/i);
  if (!match?.[1] || match[1].startsWith('+')) return null;
  return `@${match[1]}`;
}

function withPlace(sentence: string, city: string | null): string {
  return city ? `${sentence} (${city}).` : `${sentence}.`;
}

export function buildOutreachHook(contact: OutreachHookInput): string {
  const school = clean(contact.schoolName);
  const city = clean(contact.city);
  const spec = clean(contact.specialization);
  const channel = channelHandle(contact.telegramUrl);

  if (school) return withPlace(`Увидела ваш проект «${school}»`, city);
  if (channel) return withPlace(`Увидела ваш канал ${channel}`, city);
  if (spec && !GENERIC_SPEC.test(spec)) {
    return withPlace(`Увидела, что вы занимаетесь направлением «${spec}»`, city);
  }
  if (contact.isVedicAstrologer) {
    return withPlace('Увидела, что вы практикуете ведическую астрологию', city);
  }
  if (spec) return withPlace(`Увидела, что вы практикуете ${spec}`, city);
  if (city) return `Увидела вашу практику по астрологии в г. ${city}.`;
  return 'Увидела вашу практику по астрологии.';
}
