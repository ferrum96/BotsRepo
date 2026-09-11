import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { AcquisitionSource } from '@astrostone/contracts';
import { contacts, deals, integrationLogs, type Db } from '@astrostone/db';
import {
  AmocrmClient,
  AmocrmHttpError,
  mapColumns,
  normalizeImportRow,
  resolveContactAndDeal,
  syncContactToAmocrm,
  type AmocrmPort,
} from '@astrostone/core';
import { createTestDb, type TestDb } from './helpers/test-db';

let handle: TestDb;
let db: Db;

async function seedProspect(): Promise<{ contactId: string; dealId: string }> {
  const raw = { Имя: 'Анна', Telegram: '@astro_anna', Email: 'anna@astrostone.test' };
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
}

describe('amoCRM sync', () => {
  beforeAll(async () => {
    handle = await createTestDb();
    db = handle.db;
  });

  afterAll(async () => {
    await handle.close();
  });

  it('creates contact and lead once, second call is skip', async () => {
    const { contactId, dealId } = await seedProspect();
    const calls = { contacts: 0, leads: 0 };
    const client: AmocrmPort = {
      async createContact() {
        calls.contacts += 1;
        return { id: 11001 };
      },
      async createLead(input) {
        calls.leads += 1;
        expect(input.contactId).toBe(11001);
        return { id: 22002 };
      },
    };

    const first = await syncContactToAmocrm(db, client, { contactId, dealId });
    expect(first).toEqual({ skipped: false, amocrmContactId: 11001, amocrmDealId: 22002 });

    const [contact] = await db.select().from(contacts).where(eq(contacts.id, contactId));
    const [deal] = await db.select().from(deals).where(eq(deals.id, dealId));
    expect(contact?.amocrmContactId).toBe(11001);
    expect(deal?.amocrmDealId).toBe(22002);

    const second = await syncContactToAmocrm(db, client, { contactId, dealId });
    expect(second.skipped).toBe(true);
    expect(calls).toEqual({ contacts: 1, leads: 1 });

    const logs = await db.select().from(integrationLogs);
    expect(logs.some((row) => row.system === 'amocrm' && row.responseStatus === 'ok')).toBe(true);
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
