import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export interface AmocrmTokens {
  token_type?: string;
  expires_in?: number;
  server_time?: number;
  access_token: string;
  refresh_token: string;
  obtained_at?: number;
}

export interface AmocrmClientConfig {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  tokenFile: string;
  rateLimitRps: number;
  pipelineId?: number;
  statusId?: number;
  fetchImpl?: typeof fetch;
}

export interface AmocrmContactInput {
  name: string;
  phone?: string;
  email?: string;
}

export interface AmocrmLeadInput {
  name: string;
  contactId: number;
  pipelineId?: number;
  statusId?: number;
}

export interface AmocrmPort {
  createContact(input: AmocrmContactInput): Promise<{ id: number }>;
  createLead(input: AmocrmLeadInput): Promise<{ id: number }>;
}

export class AmocrmHttpError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    super(`amoCRM HTTP ${status}`);
    this.name = 'AmocrmHttpError';
  }
}

interface EmbeddedList<T> {
  _embedded?: T;
}

/**
 * Throttled amoCRM v4 client. Refresh token rotates on each use — persist immediately.
 */
export class AmocrmClient implements AmocrmPort {
  private tokens: AmocrmTokens | null = null;
  private lastRequestAt = 0;
  private refreshChain: Promise<void> = Promise.resolve();
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly config: AmocrmClientConfig) {
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async createContact(input: AmocrmContactInput): Promise<{ id: number }> {
    const custom_fields_values: Array<Record<string, unknown>> = [];
    if (input.phone) {
      custom_fields_values.push({
        field_code: 'PHONE',
        values: [{ value: input.phone, enum_code: 'WORK' }],
      });
    }
    if (input.email) {
      custom_fields_values.push({
        field_code: 'EMAIL',
        values: [{ value: input.email, enum_code: 'WORK' }],
      });
    }

    const payload: Record<string, unknown> = { name: input.name };
    if (custom_fields_values.length > 0) payload.custom_fields_values = custom_fields_values;

    const body = await this.request<EmbeddedList<{ contacts: Array<{ id: number }> }>>(
      '/api/v4/contacts',
      {
        method: 'POST',
        body: JSON.stringify([payload]),
      },
    );
    const id = body._embedded?.contacts?.[0]?.id;
    if (!id) throw new Error('amoCRM contact create: empty id');
    return { id };
  }

  async createLead(input: AmocrmLeadInput): Promise<{ id: number }> {
    const payload: Record<string, unknown> = {
      name: input.name,
      _embedded: { contacts: [{ id: input.contactId }] },
    };
    const pipelineId = input.pipelineId ?? this.config.pipelineId;
    const statusId = input.statusId ?? this.config.statusId;
    if (pipelineId) payload.pipeline_id = pipelineId;
    if (statusId) payload.status_id = statusId;

    const body = await this.request<EmbeddedList<{ leads: Array<{ id: number }> }>>('/api/v4/leads', {
      method: 'POST',
      body: JSON.stringify([payload]),
    });
    const id = body._embedded?.leads?.[0]?.id;
    if (!id) throw new Error('amoCRM lead create: empty id');
    return { id };
  }

  async account(): Promise<{ id: number; name: string; subdomain: string }> {
    const body = await this.request<{ id: number; name: string; subdomain: string }>('/api/v4/account');
    return { id: body.id, name: body.name, subdomain: body.subdomain };
  }

  async pipelines(): Promise<Array<{ id: number; name: string; statuses: Array<{ id: number; name: string }> }>> {
    const body = await this.request<
      EmbeddedList<{ pipelines: Array<{ id: number; name: string; _embedded?: { statuses: Array<{ id: number; name: string }> } }> }>
    >('/api/v4/leads/pipelines');
    return (body._embedded?.pipelines ?? []).map((pipeline) => ({
      id: pipeline.id,
      name: pipeline.name,
      statuses: pipeline._embedded?.statuses ?? [],
    }));
  }

  private async request<T>(path: string, init: RequestInit = {}, retried = false): Promise<T> {
    await this.throttle();
    const tokens = await this.loadTokens();
    const response = await this.fetchImpl(`${this.config.baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    });

    if (response.status === 401 && !retried) {
      await this.refresh();
      return this.request<T>(path, init, true);
    }

    if (response.status === 204) return undefined as T;

    const text = await response.text();
    const json = text ? (JSON.parse(text) as unknown) : null;
    if (!response.ok) throw new AmocrmHttpError(response.status, json);
    return json as T;
  }

  private async throttle(): Promise<void> {
    const minInterval = Math.ceil(1000 / Math.max(this.config.rateLimitRps, 1));
    const wait = this.lastRequestAt + minInterval - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    this.lastRequestAt = Date.now();
  }

  private async loadTokens(): Promise<AmocrmTokens> {
    if (this.tokens) return this.tokens;
    const raw = JSON.parse(await readFile(this.config.tokenFile, 'utf8')) as AmocrmTokens;
    if (!raw.access_token || !raw.refresh_token) {
      throw new Error(`amoCRM tokens missing in ${this.config.tokenFile}`);
    }
    this.tokens = raw;
    return raw;
  }

  private async refresh(): Promise<void> {
    this.refreshChain = this.refreshChain.then(() => this.refreshOnce());
    await this.refreshChain;
  }

  private async refreshOnce(): Promise<void> {
    const current = await this.loadTokens();
    const response = await this.fetchImpl(`${this.config.baseUrl}/oauth2/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        grant_type: 'refresh_token',
        refresh_token: current.refresh_token,
        redirect_uri: this.config.redirectUri,
      }),
    });
    const text = await response.text();
    const json = text ? (JSON.parse(text) as AmocrmTokens) : null;
    if (!response.ok || !json?.access_token || !json.refresh_token) {
      throw new AmocrmHttpError(response.status, json);
    }
    const next: AmocrmTokens = {
      ...json,
      obtained_at: Date.now(),
    };
    await mkdir(dirname(this.config.tokenFile), { recursive: true });
    await writeFile(this.config.tokenFile, `${JSON.stringify(next, null, 2)}\n`);
    this.tokens = next;
  }
}

export function amocrmConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  tokenFile: string,
): AmocrmClientConfig | null {
  if ((env.AMOCRM_MODE ?? 'stub') !== 'live') return null;
  const baseUrl = env.AMOCRM_BASE_URL?.replace(/\/$/, '');
  const clientId = env.AMOCRM_CLIENT_ID;
  const clientSecret = env.AMOCRM_CLIENT_SECRET;
  const redirectUri = env.AMOCRM_REDIRECT_URI;
  if (!baseUrl || !clientId || !clientSecret || !redirectUri) {
    throw new Error('AMOCRM_MODE=live requires BASE_URL, CLIENT_ID, CLIENT_SECRET, REDIRECT_URI');
  }
  return {
    baseUrl,
    clientId,
    clientSecret,
    redirectUri,
    tokenFile: env.AMOCRM_TOKEN_FILE ?? tokenFile,
    rateLimitRps: Number(env.AMOCRM_RATE_LIMIT_RPS ?? 5),
    pipelineId: env.AMOCRM_PIPELINE_ID ? Number(env.AMOCRM_PIPELINE_ID) : undefined,
    statusId: env.AMOCRM_STATUS_ID ? Number(env.AMOCRM_STATUS_ID) : undefined,
  };
}
