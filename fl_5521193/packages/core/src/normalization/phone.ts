import { parsePhoneNumberFromString } from 'libphonenumber-js';

const DEFAULT_COUNTRY = 'RU';

/**
 * Телефон в E.164 или null. Пустое и сомнительное значение идентификатором не считается:
 * ложный идентификатор склеивает два разных контакта, а это хуже пропущенного дубля.
 */
export function normalizePhone(value: unknown, defaultCountry = DEFAULT_COUNTRY): string | null {
  if (typeof value === 'number') {
    return normalizePhone(String(value), defaultCountry);
  }
  if (typeof value !== 'string') return null;

  const cleaned = value.trim();
  if (cleaned.length === 0) return null;

  // Excel часто отдаёт номера в экспоненциальной записи или с плавающей точкой.
  const withoutFloatTail = cleaned.replace(/\.0+$/, '');

  // 8 в начале — российский междугородний префикс, libphonenumber его не понимает.
  const digits = withoutFloatTail.replace(/[^\d+]/g, '');
  const candidate =
    defaultCountry === 'RU' && /^8\d{10}$/.test(digits) ? `+7${digits.slice(1)}` : withoutFloatTail;

  const parsed = parsePhoneNumberFromString(candidate, defaultCountry as never);
  if (!parsed || !parsed.isValid()) return null;

  return parsed.number;
}
