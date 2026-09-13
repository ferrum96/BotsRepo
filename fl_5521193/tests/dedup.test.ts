import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { AcquisitionSource, AcquisitionStage } from '@astrostone/contracts';
import { contactIdentifiers, contacts, dataProvenance, deals, duplicateReviews, type Db } from '@astrostone/db';
import { mapColumns, normalizeImportRow, resolveContactAndDeal } from '@astrostone/core';
import { createTestDb, type TestDb } from './helpers/test-db';

let handle: TestDb;
let db: Db;

const mapping = mapColumns(['Имя', 'Фамилия', 'Телефон', 'Telegram', 'Email', 'Город']);

const importRow = async (
  raw: Record<string, unknown>,
  options: { importRowId?: string; source?: AcquisitionSource } = {},
) => {
  const normalized = normalizeImportRow(raw, {
    mapping,
    source: options.source ?? AcquisitionSource.PARSING_TELEGRAM,
  });

  return resolveContactAndDeal(db, {
    row: normalized.row,
    identifiers: normalized.identifiers,
    eligibility: normalized.eligibility,
    preferredChannel: normalized.preferredChannel,
    importRowId: options.importRowId ?? crypto.randomUUID(),
    correlationId: crypto.randomUUID(),
  });
};

beforeAll(async () => {
  handle = await createTestDb();
  db = handle.db;
});

afterAll(async () => {
  await handle.close();
});

beforeEach(async () => {
  await db.delete(contacts);
});

describe('дедупликация контактов', () => {
  it('новый контакт создаёт контакт и сделку', async () => {
    const result = await importRow({
      Имя: 'Анна',
      Фамилия: 'Иванова',
      Телефон: '+7 916 123-45-67',
      Telegram: '@astro_anna',
    });

    expect(result.decision).toBe('CONTACT_CREATED');
    expect(result.dealId).not.toBeNull();

    const identifiers = await db
      .select()
      .from(contactIdentifiers)
      .where(eq(contactIdentifiers.contactId, result.contactId));

    expect(identifiers.map((i) => i.normalizedValue).sort()).toEqual(
      ['+79161234567', 'astro_anna'].sort(),
    );
  });

  it('тот же телефон в другом написании не создаёт второй контакт', async () => {
    const first = await importRow({ Имя: 'Анна', Телефон: '+7 916 123-45-67' });
    const second = await importRow({ Имя: 'Анна', Телефон: '8(916)123-45-67' });

    expect(second.contactId).toBe(first.contactId);
    expect(second.decision).toBe('CONTACT_MERGED_DEAL_EXISTS');

    const all = await db.select({ id: contacts.id }).from(contacts);
    expect(all).toHaveLength(1);
  });

  it('дубль по Telegram-ссылке в другом формате тоже склеивается', async () => {
    const first = await importRow({ Имя: 'Анна', Telegram: '@astro_anna' });
    const second = await importRow({ Имя: 'Анна', Telegram: 'https://t.me/astro_anna' });

    expect(second.contactId).toBe(first.contactId);
  });

  it('при повторном попадании дополняет пустые поля и не затирает заполненные', async () => {
    const first = await importRow({ Имя: 'Анна', Телефон: '+79161234567' });

    await importRow({
      Имя: 'Аня',
      Фамилия: 'Иванова',
      Телефон: '+79161234567',
      Email: 'anna@example.com',
      Город: 'Москва',
    });

    const [contact] = await db.select().from(contacts).where(eq(contacts.id, first.contactId));

    expect(contact?.firstName).toBe('Анна');
    expect(contact?.lastName).toBe('Иванова');
    expect(contact?.emailRaw).toBe('anna@example.com');
    expect(contact?.city).toBe('Москва');
  });

  it('сохраняет признак ведический астролог из файла', async () => {
    const mapping = mapColumns(['Имя', 'Телефон', 'Ведический астролог']);
    const normalized = normalizeImportRow(
      { Имя: 'Анна', Телефон: '+79160001122', 'Ведический астролог': 'да' },
      { mapping, source: AcquisitionSource.PARSING_TELEGRAM },
    );
    const result = await resolveContactAndDeal(db, {
      row: normalized.row,
      identifiers: normalized.identifiers,
      eligibility: normalized.eligibility,
      preferredChannel: normalized.preferredChannel,
      importRowId: crypto.randomUUID(),
      correlationId: crypto.randomUUID(),
    });
    const [contact] = await db.select().from(contacts).where(eq(contacts.id, result.contactId));
    expect(normalized.row.isVedicAstrologer).toBe(true);
    expect(contact?.isVedicAstrologer).toBe(true);
  });

  it('фиксирует источник повторного попадания', async () => {
    const first = await importRow({ Имя: 'Анна', Телефон: '+79161234567' });
    await importRow({ Имя: 'Анна', Телефон: '+79161234567', Email: 'anna@example.com' }, { source: AcquisitionSource.VK });

    const provenance = await db
      .select()
      .from(dataProvenance)
      .where(eq(dataProvenance.contactId, first.contactId));

    expect(provenance).toHaveLength(2);
    expect(provenance.map((p) => p.source).sort()).toEqual(['PARSING_TELEGRAM', 'VK']);
  });

  it('существующий контакт без активной сделки получает только сделку', async () => {
    const first = await importRow({ Имя: 'Анна', Телефон: '+79161234567' });

    await db
      .update(deals)
      .set({ isActive: false, stage: AcquisitionStage.CLOSED_NO_CONTACT })
      .where(eq(deals.id, first.dealId!));

    const second = await importRow({ Имя: 'Анна', Телефон: '+79161234567' });

    expect(second.decision).toBe('CONTACT_MERGED_DEAL_CREATED');
    expect(second.contactId).toBe(first.contactId);
    expect(second.dealId).not.toBe(first.dealId);

    const contactRows = await db.select({ id: contacts.id }).from(contacts);
    expect(contactRows).toHaveLength(1);
  });

  it('однофамильца без общих идентификаторов не сливает, а отдаёт на проверку', async () => {
    await importRow({ Имя: 'Анна', Фамилия: 'Иванова', Телефон: '+79161234567', Город: 'Москва' });

    const second = await importRow({
      Имя: 'Анна',
      Фамилия: 'Иванова',
      Telegram: '@another_anna',
      Город: 'Москва',
    });

    expect(second.decision).toBe('NEEDS_REVIEW');

    const reviews = await db.select().from(duplicateReviews);
    expect(reviews).toHaveLength(1);
    expect(reviews[0]?.status).toBe('PENDING');
  });
});

describe('гарантии уровня БД', () => {
  it('уникальный индекс не даёт двум контактам получить один идентификатор', async () => {
    const first = await importRow({ Имя: 'Анна', Телефон: '+79161234567' });

    const [other] = await db
      .insert(contacts)
      .values({ firstName: 'Другая', acquisitionSource: AcquisitionSource.OTHER })
      .returning({ id: contacts.id });

    await expect(
      db.insert(contactIdentifiers).values({
        contactId: other!.id,
        type: 'PHONE',
        rawValue: '+79161234567',
        normalizedValue: '+79161234567',
      }),
    ).rejects.toThrow();

    expect(first.contactId).not.toBe(other!.id);
  });

  it('partial unique index не даёт создать вторую активную сделку привлечения', async () => {
    const first = await importRow({ Имя: 'Анна', Телефон: '+79161234567' });

    await expect(
      db.insert(deals).values({
        contactId: first.contactId,
        pipeline: 'PARTNER_ACQUISITION',
        stage: AcquisitionStage.NEW_PROSPECT,
        isActive: true,
      }),
    ).rejects.toThrow();
  });

  it('закрытая сделка не мешает создать новую активную', async () => {
    const first = await importRow({ Имя: 'Анна', Телефон: '+79161234567' });

    await db.update(deals).set({ isActive: false }).where(eq(deals.id, first.dealId!));

    await db.insert(deals).values({
      contactId: first.contactId,
      pipeline: 'PARTNER_ACQUISITION',
      stage: AcquisitionStage.NEW_PROSPECT,
      isActive: true,
    });

    const active = await db
      .select({ id: deals.id })
      .from(deals)
      .where(and(eq(deals.contactId, first.contactId), eq(deals.isActive, true)));

    expect(active).toHaveLength(1);
  });
});
