#!/usr/bin/env npx tsx
/**
 * П. 5: воронка «Астро-партнёры» + перенос сделок «Партнёр:».
 * П. 4: дописывает обязательные поля на карточках этих сделок.
 * Секреты в stdout не печатает.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AmocrmClient } from '../packages/core/src/amocrm/client.ts';
import {
  CONTACT_TYPE_LABEL,
  DIRECTION_LABEL,
  QUALIFICATION_NOT_LABELED,
  parseChannelFromSource,
  profileLinkFromCard,
  type AmocrmContactMatch,
  type ParseChannel,
} from '../packages/core/src/amocrm/fields.ts';
import { ASTRO_PIPELINE_NAME } from '../packages/core/src/amocrm/pipeline.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PIPELINE_FILE = join(ROOT, 'data', 'amocrm-pipeline.json');
const ENV_FILE = join(ROOT, '.env');

function loadEnv(text: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const stripped = line.trim();
    if (!stripped || stripped.startsWith('#') || !stripped.includes('=')) continue;
    const eq = stripped.indexOf('=');
    env[stripped.slice(0, eq).trim()] = stripped.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
  }
  return env;
}

function patchEnv(text: string, updates: Record<string, string>): string {
  let next = text.endsWith('\n') ? text : `${text}\n`;
  for (const [key, value] of Object.entries(updates)) {
    const re = new RegExp(`^${key}=.*$`, 'm');
    if (re.test(next)) next = next.replace(re, `${key}=${value}`);
    else next += `${key}=${value}\n`;
  }
  return next.replace(
    /# trial:.*$/m,
    `# воронка п. 5 «${ASTRO_PIPELINE_NAME}»; клиент сам создаст, если ID пустые`,
  );
}

function fieldString(existing: AmocrmContactMatch, code: string): string | null {
  const value = existing.fields[code];
  return typeof value === 'string' && value ? value : null;
}

function backfillCard(existing: AmocrmContactMatch) {
  const entered = existing.fields.ASTRO_ENTERED_AT;
  const qualification = existing.fields.ASTRO_QUALIFICATION;
  const parseChannel = existing.fields.ASTRO_PARSE_CHANNEL;
  return {
    name: existing.name,
    contactType: CONTACT_TYPE_LABEL,
    direction: DIRECTION_LABEL,
    acquisitionSource: 'PARSING_TELEGRAM',
    parseChannel:
      typeof parseChannel === 'string' && parseChannel
        ? (parseChannel as ParseChannel)
        : parseChannelFromSource(null, {
            instagramUrl: fieldString(existing, 'ASTRO_IG'),
            website: fieldString(existing, 'ASTRO_SITE'),
            vkUrl: fieldString(existing, 'ASTRO_VK'),
          }),
    qualificationStatus:
      typeof qualification === 'string' && qualification ? qualification : QUALIFICATION_NOT_LABELED,
    enteredAt: typeof entered === 'number' ? entered : Math.floor(Date.now() / 1000),
    profileUrl: profileLinkFromCard({
      profileUrl: fieldString(existing, 'ASTRO_PROFILE'),
      telegramUrl: fieldString(existing, 'ASTRO_TG_URL'),
      telegramUsername: fieldString(existing, 'ASTRO_TG_USERNAME'),
      vkUrl: fieldString(existing, 'ASTRO_VK'),
      instagramUrl: fieldString(existing, 'ASTRO_IG'),
      website: fieldString(existing, 'ASTRO_SITE'),
    }),
  };
}

async function main(): Promise<void> {
  const envText = await readFile(ENV_FILE, 'utf8');
  const env = loadEnv(envText);
  const baseUrl = env.AMOCRM_BASE_URL?.replace(/\/$/, '');
  if (!baseUrl || !env.AMOCRM_CLIENT_ID || !env.AMOCRM_CLIENT_SECRET || !env.AMOCRM_REDIRECT_URI) {
    throw new Error('нет amoCRM credentials в .env');
  }

  const client = new AmocrmClient({
    baseUrl,
    clientId: env.AMOCRM_CLIENT_ID,
    clientSecret: env.AMOCRM_CLIENT_SECRET,
    redirectUri: env.AMOCRM_REDIRECT_URI,
    tokenFile: env.AMOCRM_TOKEN_FILE || join(ROOT, 'data', 'amocrm-tokens.json'),
    rateLimitRps: Number(env.AMOCRM_RATE_LIMIT_RPS ?? 5),
  });

  const map = await client.resolveAstroPipeline();
  await mkdir(dirname(PIPELINE_FILE), { recursive: true });
  await writeFile(
    PIPELINE_FILE,
    `${JSON.stringify({ name: ASTRO_PIPELINE_NAME, ...map }, null, 2)}\n`,
  );

  await writeFile(
    ENV_FILE,
    patchEnv(envText, {
      AMOCRM_PIPELINE_ID: String(map.pipelineId),
      AMOCRM_STATUS_ID: String(map.statusId),
    }),
  );

  const seen = new Set<number>();
  const moved: number[] = [];
  const patched: number[] = [];
  const catalogs = await client.pipelines();
  const sourceIds = catalogs.filter((pipeline) => pipeline.id !== map.pipelineId).map((pipeline) => pipeline.id);
  const queries: Array<{ query?: string; pipelineId?: number }> = [
    { query: 'Партнёр' },
    ...sourceIds.map((pipelineId) => ({ pipelineId })),
  ];

  for (const filter of queries) {
    for (let page = 1; page <= 20; page += 1) {
      const batch = await client.listLeads({ ...filter, page, limit: 250 });
      if (batch.length === 0) break;
      for (const lead of batch) {
        if (seen.has(lead.id) || !lead.name.startsWith('Партнёр:')) continue;
        seen.add(lead.id);
        if (lead.pipelineId !== map.pipelineId) {
          await client.updateLead(lead.id, { pipelineId: map.pipelineId, statusId: map.statusId });
          moved.push(lead.id);
        }
        if (!lead.contactId) continue;
        const contact = await client.getContact(lead.contactId);
        if (!contact) continue;
        await client.updateContact(contact.id, backfillCard(contact));
        patched.push(contact.id);
      }
      if (batch.length < 250) break;
    }
  }

  console.log(
    `pipeline ${map.pipelineId} status ${map.statusId} moved=${moved.length} contacts_patched=${patched.length}`,
  );
}

function isConnectTimeout(error: unknown): boolean {
  const text = [error, error instanceof Error ? error.cause : null]
    .filter((item): item is Error => item instanceof Error)
    .map((item) => `${item.name} ${item.message}`)
    .join(' ');
  return /Connect Timeout|UND_ERR_CONNECT_TIMEOUT|fetch failed/i.test(text);
}

main().catch((error) => {
  if (isConnectTimeout(error)) {
    console.error(
      'amoCRM не отвечает по TLS (ferrumsk96.amocrm.ru:443). TCP проходит, handshake зависает — режет сеть/DPI, не скрипт. VPN или другая сеть, потом снова: npm run amocrm:pipeline',
    );
  } else {
    console.error(error instanceof Error ? error.message : error);
  }
  if (error instanceof Error && error.cause instanceof Error && !isConnectTimeout(error)) {
    console.error(error.cause.message);
  }
  process.exit(1);
});
