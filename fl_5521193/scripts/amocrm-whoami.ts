#!/usr/bin/env npx tsx
/**
 * Проверка токена: аккаунт и воронки. Секреты в stdout не печатает.
 */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AmocrmClient } from '../packages/core/src/amocrm/client.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

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

async function main(): Promise<void> {
  const env = loadEnv(await readFile(join(ROOT, '.env'), 'utf8'));
  const baseUrl = env.AMOCRM_BASE_URL?.replace(/\/$/, '');
  if (!baseUrl || !env.AMOCRM_CLIENT_ID || !env.AMOCRM_CLIENT_SECRET || !env.AMOCRM_REDIRECT_URI) {
    throw new Error('нет amoCRM credentials в .env');
  }

  const client = new AmocrmClient({
    baseUrl,
    clientId: env.AMOCRM_CLIENT_ID,
    clientSecret: env.AMOCRM_CLIENT_SECRET,
    redirectUri: env.AMOCRM_REDIRECT_URI,
    tokenFile: join(ROOT, 'data', 'amocrm-tokens.json'),
    rateLimitRps: 5,
  });

  const account = await client.account();
  const pipelines = await client.pipelines();
  console.log(`account ${account.subdomain} pipelines=${pipelines.length}`);
  for (const pipeline of pipelines) {
    console.log(`pipeline ${pipeline.id} ${pipeline.name}`);
    for (const status of pipeline.statuses) {
      console.log(`  status ${status.id} ${status.name}`);
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
