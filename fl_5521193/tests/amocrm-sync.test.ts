import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { AcquisitionSource, IdentifierType } from '@astrostone/contracts';
import { contacts, deals, type Db } from '@astrostone/db';
import {
  ASTRO_PIPELINE_NAME,
  ASTRO_PIPELINE_STAGES,
  AmocrmClient,
  AmocrmHttpError,
  CONTACT_TYPE_LABEL,
  DIRECTION_LABEL,
  MemoryAmocrmClient,
  QUALIFICATION_NOT_LABELED,
  SOURCE_LABEL,
  contactMatchesIdentifiers,
  ensureAstroPipeline,
  mapColumns,
  normalizeImportRow,
  parseChannelFromSource,
  resolveContactAndDeal,
  syncContactToAmocrm,
  type PipelineAdmin,
} from '@astrostone/core';
import { createTestDb, type TestDb } from './helpers/test-db';

let handle: TestDb;
let db: Db;

const seedProspect = async (
  raw: Record<string, unknown> = {
    Имя: 'Анна',
    Фамилия: 'Иванова',
    Telegram: '@astro_anna',
    Email: 'anna@astrostone.test',
    Телефон: '+79161234567',
    Город: 'Москва',
    'Ведический астролог': 'да',
    Комментарий: 'Ведёт вебинары',
  },
): Promise<{ contactId: string; dealId: string }> => {
  const normalized = normalizeImportRow(raw, {
    mapping: mapColumns(Object.keys(raw)),
    source: AcquisitionSource.PARSING_TELEGRAM,
  });
  const result = await resolveContactAndDeal(db, {
    row: normalized.row,
    identifiers: normalized.identifiers,
    eligibility: normalized.eligibility,
    preferredChannel: normalized.preferredChannel,
    importRowId: crypto.randomUUID(),
    correlationId: crypto.randomUUID(),
  });
  if (!result.dealId) throw new Error('deal was not created');
  return { contactId: result.contactId, dealId: result.dealId };
};

describe('amoCRM sync', () => {
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

  it('создаёт контакт со всеми полями п. 2 и сделку', async () => {
    const { contactId, dealId } = await seedProspect();
    const client = new MemoryAmocrmClient();

    const first = await syncContactToAmocrm(db, client, { contactId, dealId });
    expect(first.contactAction).toBe('created');
    expect(first.dealAction).toBe('created');
    expect(client.calls.contacts).toBe(1);
    expect(client.calls.leads).toBe(1);

    const stored = [...client.contacts.values()][0];
    expect(stored?.phones).toContain('+79161234567');
    expect(stored?.emails).toContain('anna@astrostone.test');
    expect(stored?.fields.ASTRO_TG_USERNAME).toBe('astro_anna');
    expect(stored?.fields.ASTRO_CITY).toBe('Москва');
    expect(stored?.fields.ASTRO_VEDIC).toBe(true);
    expect(stored?.fields.ASTRO_COMMENT).toBe('Ведёт вебинары');
    expect(stored?.fields.ASTRO_CONTACT_TYPE).toBe(CONTACT_TYPE_LABEL);
    expect(stored?.fields.ASTRO_DIRECTION).toBe(DIRECTION_LABEL);
    expect(stored?.fields.ASTRO_SOURCE).toBe(SOURCE_LABEL);
    expect(stored?.fields.ASTRO_PARSE_CHANNEL).toBe('Telegram');
    expect(stored?.fields.ASTRO_QUALIFICATION).toBe(QUALIFICATION_NOT_LABELED);
    expect(stored?.fields.ASTRO_PROFILE).toBe('https://t.me/astro_anna');
    expect(typeof stored?.fields.ASTRO_ENTERED_AT).toBe('number');
    expect(client.notes[0]?.text).toContain('AstroStone · импорт');
    expect(client.notes[0]?.text).toContain('Тип контакта');

    const [contact] = await db.select().from(contacts).where(eq(contacts.id, contactId));
    expect(contact?.isVedicAstrologer).toBe(true);
    expect(contact?.amocrmContactId).toBe(first.amocrmContactId);

    const second = await syncContactToAmocrm(db, client, { contactId, dealId });
    expect(second.skipped).toBe(true);
    expect(client.calls.contacts).toBe(1);
    expect(client.calls.leads).toBe(1);
  });

  it('п. 3: повторный импорт находит контакт в amoCRM и не плодит карточку и сделку', async () => {
    const client = new MemoryAmocrmClient();
    const existing = await client.createContact({
      name: 'Ольга (olga_jyotish)',
      phone: '+79031234567',
      telegramUsername: 'olga_jyotish',
    });
    const existingLead = await client.createLead({
      name: 'Партнёр: Ольга',
      contactId: existing.id,
    });

    const local = await seedProspect({
      Имя: 'Ольга',
      Телефон: '8 (903) 123-45-67',
      Email: 'olga@astrostone.test',
      Город: 'Казань',
    });
    const reused = await syncContactToAmocrm(db, client, local);

    expect(reused.amocrmContactId).toBe(existing.id);
    expect(reused.amocrmDealId).toBe(existingLead.id);
    expect(reused.contactAction).toBe('updated');
    expect(reused.dealAction).toBe('reused');
    expect(reused.matchedBy).toBe(IdentifierType.PHONE);
    expect(client.calls.contacts).toBe(1);
    expect(client.calls.leads).toBe(1);

    const stored = client.contacts.get(existing.id);
    expect(stored?.emails).toContain('olga@astrostone.test');
    expect(stored?.fields.ASTRO_CITY).toBe('Казань');
    expect(client.notes.some((note) => note.text.includes('повторное попадание'))).toBe(true);
  });

  it('п. 3: сделка amoCRM, уже привязанная к другому контакту, не переиспользуется', async () => {
    const client = new MemoryAmocrmClient();
    const existing = await client.createContact({
      name: 'Галина',
      phone: '+79160005566',
      telegramUsername: 'galina_vedic',
    });
    const stolen = await client.createLead({ name: 'Чужая', contactId: existing.id });

    const owner = await seedProspect({ Имя: 'Владелец', Телефон: '+79001112233' });
    await db.update(deals).set({ amocrmDealId: stolen.id }).where(eq(deals.id, owner.dealId));

    const local = await seedProspect({
      Имя: 'Галина',
      Телефон: '+79160005566',
      Telegram: '@galina_vedic',
    });
    const result = await syncContactToAmocrm(db, client, local);

    expect(result.amocrmContactId).toBe(existing.id);
    expect(result.dealAction).toBe('created');
    expect(result.amocrmDealId).not.toBe(stolen.id);
  });

  it('п. 3: закрытая сделка не мешает создать новую', async () => {
    const client = new MemoryAmocrmClient();
    const existing = await client.createContact({
      name: 'Мария (maria_vedic)',
      telegramUsername: 'maria_vedic',
    });
    const closed = await client.createLead({ name: 'Старая', contactId: existing.id });
    client.closeLead(closed.id);

    const local = await seedProspect({ Имя: 'Мария', Telegram: '@maria_vedic' });
    const again = await syncContactToAmocrm(db, client, local);

    expect(again.amocrmContactId).toBe(existing.id);
    expect(again.dealAction).toBe('created');
    expect(again.amocrmDealId).not.toBe(closed.id);
    expect(client.calls.leads).toBe(2);
  });

  it('сверяет идентификаторы, а не подстроку amoCRM', () => {
    const hit = {
      id: 1,
      name: 'Анна (astro_anna)',
      phones: ['+79161234567'],
      emails: [],
      fields: {},
    };
    expect(
      contactMatchesIdentifiers(hit, [
        { type: IdentifierType.PHONE, normalizedValue: '+79161234567' },
      ]),
    ).toBe(IdentifierType.PHONE);
    expect(
      contactMatchesIdentifiers(hit, [
        { type: IdentifierType.TELEGRAM_USERNAME, normalizedValue: 'astro_anna' },
      ]),
    ).toBe(IdentifierType.TELEGRAM_USERNAME);
    expect(
      contactMatchesIdentifiers(hit, [
        { type: IdentifierType.PHONE, normalizedValue: '+79990000000' },
      ]),
    ).toBeNull();
  });

  it('refreshes access token on 401 and retries', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'amocrm-'));
    const tokenFile = join(dir, 'tokens.json');
    await writeFile(
      tokenFile,
      JSON.stringify({ access_token: 'old-access', refresh_token: 'old-refresh' }),
    );

    let contactsCalls = 0;
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      if (url.endsWith('/oauth2/access_token')) {
        const body = JSON.parse(String(init?.body)) as { refresh_token: string };
        expect(body.refresh_token).toBe('old-refresh');
        return new Response(
          JSON.stringify({
            token_type: 'Bearer',
            expires_in: 86400,
            access_token: 'new-access',
            refresh_token: 'new-refresh',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.endsWith('/api/v4/contacts')) {
        contactsCalls += 1;
        const auth = new Headers(init?.headers).get('Authorization');
        if (auth === 'Bearer old-access') {
          return new Response('{"status":401}', { status: 401 });
        }
        expect(auth).toBe('Bearer new-access');
        return new Response(JSON.stringify({ _embedded: { contacts: [{ id: 99 }] } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`unexpected url ${url}`);
    };

    const client = new AmocrmClient({
      baseUrl: 'https://example.amocrm.ru',
      clientId: 'id',
      clientSecret: 'secret',
      redirectUri: 'https://localhost/callback',
      tokenFile,
      rateLimitRps: 1000,
      fetchImpl,
    });

    await expect(client.createContact({ name: 'Тест' })).resolves.toEqual({ id: 99 });
    expect(contactsCalls).toBe(2);
    const saved = JSON.parse(await readFile(tokenFile, 'utf8')) as { refresh_token: string };
    expect(saved.refresh_token).toBe('new-refresh');
  });

  it('maps HTTP errors', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'amocrm-'));
    const tokenFile = join(dir, 'tokens.json');
    await writeFile(
      tokenFile,
      JSON.stringify({ access_token: 'access', refresh_token: 'refresh' }),
    );

    const client = new AmocrmClient({
      baseUrl: 'https://example.amocrm.ru',
      clientId: 'id',
      clientSecret: 'secret',
      redirectUri: 'https://localhost/callback',
      tokenFile,
      rateLimitRps: 1000,
      fetchImpl: async () => new Response('{"title":"Bad Request"}', { status: 400 }),
    });

    await expect(client.createContact({ name: 'Тест' })).rejects.toBeInstanceOf(AmocrmHttpError);
  });
});

describe('п. 4 источник парсинга', () => {
  it('мапит канал по источнику и ссылкам', () => {
    expect(parseChannelFromSource('VK', {})).toBe('VK');
    expect(parseChannelFromSource(null, { vkUrl: 'https://vk.com/x' })).toBe('VK');
    expect(parseChannelFromSource(null, { instagramUrl: 'https://instagram.com/x' })).toBe('Instagram');
    expect(parseChannelFromSource('PARSING_TELEGRAM', {})).toBe('Telegram');
    expect(parseChannelFromSource('TELEGRAM_ADS', {})).toBe('Telegram');
    expect(parseChannelFromSource('SEO', {})).toBe('сайт');
    expect(parseChannelFromSource(null, { website: 'https://x.test' })).toBe('сайт');
    expect(parseChannelFromSource('REFERRAL', {})).toBe('другое');
  });
});

describe('п. 5 воронка', () => {
  it('создаёт «Астро-партнёры» и дописывает недостающие статусы', async () => {
    const created: string[] = [];
    const extra = { id: 99, name: 'Лишнее' };
    const admin: PipelineAdmin = {
      pipelines: async () =>
        created.length === 0
          ? []
          : [
              {
                id: 500,
                name: ASTRO_PIPELINE_NAME,
                statuses: [
                  extra,
                  ...ASTRO_PIPELINE_STAGES.slice(0, 3).map((spec, index) => ({
                    id: 10 + index,
                    name: spec.name,
                  })),
                ],
              },
            ],
      createPipeline: async (name) => {
        expect(name).toBe(ASTRO_PIPELINE_NAME);
        created.push(name);
        return { id: 500 };
      },
      createStatuses: async (_pipelineId, statuses) =>
        statuses.map((status, index) => ({ id: 100 + index, name: status.name })),
    };

    const map = await ensureAstroPipeline(admin);
    expect(map.pipelineId).toBe(500);
    expect(map.statusId).toBe(10);
    expect(Object.keys(map.statusByStage)).toHaveLength(ASTRO_PIPELINE_STAGES.length);
  });

  it('createLead без ID сам вешает сделку на «Астро-партнёры»', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'amocrm-'));
    const tokenFile = join(dir, 'tokens.json');
    await writeFile(tokenFile, JSON.stringify({ access_token: 'access', refresh_token: 'refresh' }));

    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      if (url.endsWith('/api/v4/leads/pipelines') && (!init?.method || init.method === 'GET')) {
        return new Response(
          JSON.stringify({
            _embedded: {
              pipelines: [
                {
                  id: 777,
                  name: ASTRO_PIPELINE_NAME,
                  _embedded: {
                    statuses: ASTRO_PIPELINE_STAGES.map((spec, index) => ({
                      id: 1000 + index,
                      name: spec.name,
                    })),
                  },
                },
              ],
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.endsWith('/api/v4/leads') && init?.method === 'POST') {
        const body = JSON.parse(String(init.body)) as Array<{ pipeline_id: number; status_id: number }>;
        expect(body[0]?.pipeline_id).toBe(777);
        expect(body[0]?.status_id).toBe(1000);
        return new Response(JSON.stringify({ _embedded: { leads: [{ id: 42 }] } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`unexpected url ${url} ${init?.method}`);
    };

    const client = new AmocrmClient({
      baseUrl: 'https://example.amocrm.ru',
      clientId: 'id',
      clientSecret: 'secret',
      redirectUri: 'https://localhost/callback',
      tokenFile,
      rateLimitRps: 1000,
      pipelineId: 11282546,
      statusId: 88470698,
      fetchImpl,
    });

    await expect(client.createLead({ name: 'Партнёр: Анна', contactId: 1 })).resolves.toEqual({ id: 42 });
  });

  it('повторный вызов не создаёт воронку снова', async () => {
    let creates = 0;
    const admin: PipelineAdmin = {
      pipelines: async () => [
        {
          id: 7,
          name: ASTRO_PIPELINE_NAME,
          statuses: ASTRO_PIPELINE_STAGES.map((spec, index) => ({ id: index + 1, name: spec.name })),
        },
      ],
      createPipeline: async () => {
        creates += 1;
        return { id: 7 };
      },
      createStatuses: async () => {
        throw new Error('не должны дописывать статусы');
      },
    };

    const map = await ensureAstroPipeline(admin);
    expect(map.pipelineId).toBe(7);
    expect(creates).toBe(0);
  });
});
