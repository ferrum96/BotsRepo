import { z } from 'zod';
import { AcquisitionSource } from './enums';

/**
 * Сырая строка файла: ни одно поле не гарантировано (п. 2 ТЗ).
 * Валидация «строка вообще пригодна» живёт в normalizedRowSchema, а не здесь,
 * потому что решение принимается уже по нормализованным значениям.
 */
export const rawImportRowSchema = z.record(z.string(), z.unknown());
export type RawImportRow = z.infer<typeof rawImportRowSchema>;

export const normalizedRowSchema = z.object({
  firstName: z.string().min(1).nullable(),
  lastName: z.string().min(1).nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  telegramUsername: z.string().nullable(),
  telegramUserId: z.number().int().positive().nullable(),
  whatsapp: z.string().nullable(),
  telegramUrl: z.string().nullable(),
  vkUrl: z.string().nullable(),
  instagramUrl: z.string().nullable(),
  website: z.string().nullable(),
  profileUrl: z.string().nullable(),
  schoolName: z.string().nullable(),
  city: z.string().nullable(),
  country: z.string().nullable(),
  specialization: z.string().nullable(),
  comment: z.string().nullable(),
  isVedicAstrologer: z.boolean().nullable(),
  acquisitionSource: z.nativeEnum(AcquisitionSource),
  sourceUrl: z.string().nullable(),
});
export type NormalizedRow = z.infer<typeof normalizedRowSchema>;

/**
 * Синонимы колонок: спарсенные базы приходят с произвольными заголовками.
 * Сопоставление регистронезависимое, пробелы и подчёркивания игнорируются.
 */
export const COLUMN_ALIASES: Record<keyof Omit<NormalizedRow, 'acquisitionSource'>, string[]> = {
  firstName: ['имя', 'firstname', 'first_name', 'name', 'фио'],
  lastName: ['фамилия', 'lastname', 'last_name', 'surname'],
  phone: ['телефон', 'phone', 'tel', 'mobile', 'номер', 'номертелефона'],
  email: ['email', 'e-mail', 'почта', 'мейл', 'мыло'],
  telegramUsername: ['telegram', 'телеграм', 'username', 'tgusername', 'telegramusername', 'ник'],
  telegramUserId: ['telegramid', 'tgid', 'telegramuserid', 'userid'],
  whatsapp: ['whatsapp', 'вотсап', 'ватсап', 'wa'],
  telegramUrl: [
    'telegramканал',
    'ссылканателеграм',
    'ссылканаtelegram',
    'telegramurl',
    'канал',
    'tgканал',
  ],
  vkUrl: ['vk', 'вк', 'вконтакте', 'vkurl', 'ссылканавк', 'ссылканаvk'],
  instagramUrl: ['instagram', 'инстаграм', 'инста', 'instagramurl'],
  website: ['сайт', 'website', 'site', 'web'],
  profileUrl: ['ссылканапрофиль', 'профиль', 'profile', 'profileurl', 'ссылка'],
  schoolName: ['школа', 'проект', 'названиешколы', 'school', 'названиепроекта'],
  city: ['город', 'city'],
  country: ['страна', 'country'],
  specialization: ['специализация', 'направление', 'specialization'],
  comment: ['комментарий', 'comment', 'note', 'заметка'],
  isVedicAstrologer: ['ведическийастролог', 'джйотиш', 'jyotish', 'vedic', 'признак'],
  sourceUrl: ['источник', 'source', 'откуда', 'sourceurl', 'найденгде'],
};

export const createImportSchema = z.object({
  source: z.nativeEnum(AcquisitionSource).default(AcquisitionSource.PARSING_TELEGRAM),
  /** Опционально: ручное сопоставление колонок, если авто-сопоставление не сработало. */
  columnMapping: z.record(z.string(), z.string()).optional(),
});
export type CreateImportInput = z.infer<typeof createImportSchema>;

export const importErrorCodes = {
  NO_IDENTIFIER: 'NO_IDENTIFIER',
  NO_NAME: 'NO_NAME',
  INVALID_PHONE: 'INVALID_PHONE',
  INVALID_EMAIL: 'INVALID_EMAIL',
  EMPTY_ROW: 'EMPTY_ROW',
  DUPLICATE_IN_FILE: 'DUPLICATE_IN_FILE',
  AMOCRM_ERROR: 'AMOCRM_ERROR',
  UNEXPECTED: 'UNEXPECTED',
} as const;
export type ImportErrorCode = (typeof importErrorCodes)[keyof typeof importErrorCodes];

export const IMPORT_ERROR_MESSAGES: Record<ImportErrorCode, string> = {
  NO_IDENTIFIER: 'В строке нет ни одного идентификатора (телефон, Telegram, email, ссылка)',
  NO_NAME: 'В строке нет имени',
  INVALID_PHONE: 'Телефон не приводится к формату E.164',
  INVALID_EMAIL: 'Некорректный email',
  EMPTY_ROW: 'Пустая строка',
  DUPLICATE_IN_FILE: 'Строка дублирует другую строку того же файла',
  AMOCRM_ERROR: 'Ошибка при обращении к amoCRM',
  UNEXPECTED: 'Непредвиденная ошибка обработки строки',
};
