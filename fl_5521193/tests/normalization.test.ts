import { describe, expect, it } from 'vitest';
import { AcquisitionSource, AutomationEligibility, ChannelKind } from '@astrostone/contracts';
import {
  mapColumns,
  normalizeEmail,
  normalizeImportRow,
  normalizeName,
  normalizePhone,
  normalizeTelegram,
  normalizeUrl,
  splitFullName,
} from '@astrostone/core';

describe('normalizePhone', () => {
  it('приводит российские номера в любом написании к одному E.164', () => {
    const variants = [
      '+7 916 123-45-67',
      '89161234567',
      '8 (916) 123 45 67',
      '7916 123 45 67',
      '+79161234567',
    ];

    for (const variant of variants) {
      expect(normalizePhone(variant), variant).toBe('+79161234567');
    }
  });

  it('переваривает мусор из Excel', () => {
    expect(normalizePhone(79161234567)).toBe('+79161234567');
    expect(normalizePhone('79161234567.0')).toBe('+79161234567');
  });

  it('не выдумывает идентификатор из непригодного значения', () => {
    expect(normalizePhone('')).toBeNull();
    expect(normalizePhone('нет телефона')).toBeNull();
    expect(normalizePhone('123')).toBeNull();
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone('+7916123456')).toBeNull();
  });
});

describe('normalizeEmail', () => {
  it('приводит к нижнему регистру и вычищает обёртки', () => {
    expect(normalizeEmail('  Anna@Example.COM ')).toBe('anna@example.com');
    expect(normalizeEmail('mailto:anna@example.com')).toBe('anna@example.com');
    expect(normalizeEmail('Анна <anna@example.com>')).toBe('anna@example.com');
  });

  it('отбрасывает некорректные значения', () => {
    expect(normalizeEmail('anna@example')).toBeNull();
    expect(normalizeEmail('anna example.com')).toBeNull();
    expect(normalizeEmail('—')).toBeNull();
  });
});

describe('normalizeTelegram', () => {
  it('снимает любую обёртку с username', () => {
    for (const value of [
      '@astro_anna',
      'astro_anna',
      'https://t.me/astro_anna',
      't.me/astro_anna/',
      'telegram.me/@astro_anna',
      'https://t.me/astro_anna?start=1',
    ]) {
      expect(normalizeTelegram(value).username, value).toBe('astro_anna');
    }
  });

  it('распознаёт числовой user id', () => {
    expect(normalizeTelegram('123456789').userId).toBe(123456789);
    expect(normalizeTelegram(123456789).userId).toBe(123456789);
  });

  it('инвайт-ссылку идентификатором не считает', () => {
    const invite = normalizeTelegram('https://t.me/+AbCdEfGh');
    expect(invite.username).toBeNull();
    expect(invite.isChannelLink).toBe(true);
  });

  it('помечает ссылку на пост канала: писать в личку по ней нельзя', () => {
    const post = normalizeTelegram('https://t.me/astro_channel/451');
    expect(post.username).toBe('astro_channel');
    expect(post.isChannelLink).toBe(true);
  });

  it('отбрасывает слишком короткие и невалидные username', () => {
    expect(normalizeTelegram('@ann').username).toBeNull();
    expect(normalizeTelegram('9anna_astro').username).toBeNull();
    expect(normalizeTelegram('').username).toBeNull();
  });
});

describe('normalizeUrl', () => {
  it('приводит к каноническому виду', () => {
    expect(normalizeUrl('http://WWW.Example.com/Page/?utm_source=tg#top')).toBe(
      'https://example.com/Page',
    );
    expect(normalizeUrl('vk.com/astro_anna')).toBe('https://vk.com/astro_anna');
  });

  it('сохраняет значимые query-параметры и сортирует их', () => {
    expect(normalizeUrl('https://example.com/p?b=2&a=1&utm_medium=x')).toBe(
      'https://example.com/p?a=1&b=2',
    );
  });

  it('отбрасывает не-URL', () => {
    expect(normalizeUrl('нет сайта')).toBeNull();
    expect(normalizeUrl('javascript:alert(1)')).toBeNull();
  });
});

describe('normalizeName', () => {
  it('чистит мусор, но не переписывает написание', () => {
    expect(normalizeName('  Анна\u200B  ')).toBe('Анна');
    expect(normalizeName('«Анна»')).toBe('Анна');
    expect(normalizeName('anna')).toBe('anna');
  });

  it('значение без букв именем не считается', () => {
    expect(normalizeName('123')).toBeNull();
    expect(normalizeName('-')).toBeNull();
    expect(normalizeName('')).toBeNull();
  });

  it('делит ФИО из одной колонки', () => {
    expect(splitFullName('Иванова Анна')).toEqual({ firstName: 'Анна', lastName: 'Иванова' });
    expect(splitFullName('Анна')).toEqual({ firstName: 'Анна', lastName: null });
  });
});

describe('mapColumns', () => {
  it('сопоставляет произвольные заголовки спарсенной базы', () => {
    const mapping = mapColumns([
      'Имя',
      'Фамилия',
      'Телефон',
      'E-mail',
      'Telegram',
      'Ссылка на VK',
      'Город',
      'Название школы',
    ]);

    expect(mapping.firstName).toBe('Имя');
    expect(mapping.phone).toBe('Телефон');
    expect(mapping.email).toBe('E-mail');
    expect(mapping.telegramUsername).toBe('Telegram');
    expect(mapping.vkUrl).toBe('Ссылка на VK');
    expect(mapping.schoolName).toBe('Название школы');
  });
});

describe('normalizeImportRow', () => {
  const mapping = mapColumns(['Имя', 'Телефон', 'Telegram', 'Email', 'Сайт', 'Город']);
  const options = { mapping, source: AcquisitionSource.PARSING_TELEGRAM };

  it('собирает идентификаторы и признаёт контакт достижимым', () => {
    const result = normalizeImportRow(
      { Имя: 'Анна', Телефон: '8 916 123 45 67', Telegram: '@astro_anna', Город: 'Москва' },
      options,
    );

    expect(result.errors).toEqual([]);
    expect(result.eligibility).toBe(AutomationEligibility.AUTO_OK);
    expect(result.preferredChannel).toBe(ChannelKind.TELEGRAM);
    expect(result.identifiers.map((i) => i.normalizedValue)).toEqual(
      expect.arrayContaining(['+79161234567', 'astro_anna']),
    );
  });

  it('контакт только с сайтом уходит в ручную обработку, а не в ошибки', () => {
    const result = normalizeImportRow({ Имя: 'Анна', Сайт: 'astro-anna.ru' }, options);

    expect(result.errors).toEqual([]);
    expect(result.eligibility).toBe(AutomationEligibility.MANUAL_ONLY);
    expect(result.preferredChannel).toBeNull();
  });

  it('строка без идентификаторов помечается ошибкой', () => {
    const result = normalizeImportRow({ Имя: 'Анна', Город: 'Москва' }, options);

    expect(result.errors).toContain('NO_IDENTIFIER');
  });

  it('строка без имени помечается ошибкой: подставлять пустоту в шаблон нельзя', () => {
    const result = normalizeImportRow({ Телефон: '+79161234567' }, options);

    expect(result.errors).toContain('NO_NAME');
  });

  it('пустая строка распознаётся отдельно', () => {
    expect(normalizeImportRow({ Имя: '', Телефон: '' }, options).errors).toContain('EMPTY_ROW');
  });
});
