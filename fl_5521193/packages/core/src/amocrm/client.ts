import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import {
  ASTRO_CUSTOM_FIELDS,
  cardCustomFields,
  type AmocrmContactCard,
  type AmocrmContactMatch,
  type AmocrmLeadMatch,
} from './fields';
import { ensureAstroPipeline, type AstroPipelineMap, type PipelineStatusInput } from './pipeline';

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

export type AmocrmContactInput = AmocrmContactCard;

export interface AmocrmLeadInput {
  name: string;
  contactId: number;
  pipelineId?: number;
  statusId?: number;
}

export interface AmocrmPort {
  createContact(input: AmocrmContactInput): Promise<{ id: number }>;
  updateContact(id: number, input: AmocrmContactInput): Promise<void>;
  searchContacts(query: string): Promise<AmocrmContactMatch[]>;
  getContact(id: number): Promise<AmocrmContactMatch | null>;
  createLead(input: AmocrmLeadInput): Promise<{ id: number }>;
  listLeadsByContact(contactId: number): Promise<AmocrmLeadMatch[]>;
  addNote(contactId: number, text: string): Promise<void>;
}

export class AmocrmHttpError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    super(formatAmocrmError(status, body));
    this.name = 'AmocrmHttpError';
  }
}

function formatAmocrmError(status: number, body: unknown): string {
  if (!body || typeof body !== 'object') return `amoCRM HTTP ${status}`;
  const rec = body as Record<string, unknown>;
  const parts = [`amoCRM HTTP ${status}`];
  if (typeof rec.title === 'string' && rec.title) parts.push(rec.title);
  if (typeof rec.detail === 'string' && rec.detail) parts.push(rec.detail);
  if (rec['validation-errors']) parts.push(JSON.stringify(rec['validation-errors']));
  return parts.join(': ');
}

interface EmbeddedList<T> {
  _embedded?: T;
}

/**
 * Throttled amoCRM v4 client. Refresh token rotates on each use — persist immediately.
 */
interface RawCustomFieldValue {
  field_code?: string;
  field_id?: number;
  values?: Array<{ value?: unknown; enum_code?: string }>;
}

interface RawContact {
  id: number;
  name?: string;
  first_name?: string;
  last_name?: string;
  custom_fields_values?: RawCustomFieldValue[];
}

interface RawLead {
  id: number;
  name?: string;
  pipeline_id?: number;
  status_id?: number;
  closed_at?: number | null;
  _embedded?: { contacts?: Array<{ id: number }> };
}

export class AmocrmClient implements AmocrmPort {
  private tokens: AmocrmTokens | null = null;
  private lastRequestAt = 0;
  private refreshChain: Promise<void> = Promise.resolve();
  private readonly fetchImpl: typeof fetch;
  private fieldIds = new Map<string, number>();
  private fieldsReady: Promise<void> | null = null;
  private astroPipeline: AstroPipelineMap | null = null;
  private pipelineReady: Promise<AstroPipelineMap> | null = null;

  constructor(private readonly config: AmocrmClientConfig) {
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async createContact(input: AmocrmContactInput): Promise<{ id: number }> {
    const payload = await this.contactPayload(input);
    const body = await this.request<EmbeddedList<{ contacts: Array<{ id: number }> }>>(
      '/api/v4/contacts',
      {
        method: 'POST',
        body: JSON.stringify([payload]),
      },
    );
    const id = body?._embedded?.contacts?.[0]?.id;
    if (!id) throw new Error('amoCRM contact create: empty id');
    return { id };
  }

  async updateContact(id: number, input: AmocrmContactInput): Promise<void> {
    const payload = { id, ...(await this.contactPayload(input)) };
    await this.request('/api/v4/contacts', {
      method: 'PATCH',
      body: JSON.stringify([payload]),
    });
  }

  async searchContacts(query: string): Promise<AmocrmContactMatch[]> {
    const qs = new URLSearchParams({ query, limit: '10' });
    const body = await this.request<EmbeddedList<{ contacts: RawContact[] }> | undefined>(
      `/api/v4/contacts?${qs.toString()}`,
    );
    return (body?._embedded?.contacts ?? []).map(mapRawContact);
  }

  async getContact(id: number): Promise<AmocrmContactMatch | null> {
    try {
      const body = await this.request<RawContact>(`/api/v4/contacts/${id}`);
      return mapRawContact(body);
    } catch (error) {
      if (error instanceof AmocrmHttpError && (error.status === 204 || error.status === 404)) {
        return null;
      }
      throw error;
    }
  }

  async listLeadsByContact(contactId: number): Promise<AmocrmLeadMatch[]> {
    // filter[contacts] на /leads в trial отдаёт чужие сделки. Берём id с карточки контакта.
    const contact = await this.request<RawContact & { _embedded?: { leads?: Array<{ id: number }> } }>(
      `/api/v4/contacts/${contactId}?with=leads`,
    );
    const ids = contact?._embedded?.leads?.map((lead) => lead.id) ?? [];
    const leads: AmocrmLeadMatch[] = [];
    for (const id of ids) {
      const lead = await this.request<RawLead>(`/api/v4/leads/${id}`);
      leads.push({
        id: lead.id,
        name: lead.name ?? '',
        contactId,
        pipelineId: lead.pipeline_id,
        statusId: lead.status_id,
        closed: Boolean(lead.closed_at),
      });
    }
    return leads;
  }

  async addNote(contactId: number, text: string): Promise<void> {
    await this.request('/api/v4/contacts/notes', {
      method: 'POST',
      body: JSON.stringify([
        {
          entity_id: contactId,
          note_type: 'common',
          params: { text },
        },
      ]),
    });
  }

  async createLead(input: AmocrmLeadInput): Promise<{ id: number }> {
    const payload: Record<string, unknown> = {
      name: input.name,
      _embedded: { contacts: [{ id: input.contactId }] },
    };
    const resolved =
      input.pipelineId && input.statusId ? null : await this.resolveAstroPipeline();
    const pipelineId = input.pipelineId ?? resolved?.pipelineId;
    const statusId = input.statusId ?? resolved?.statusId;
    if (pipelineId) payload.pipeline_id = pipelineId;
    if (statusId) payload.status_id = statusId;

    const body = await this.request<EmbeddedList<{ leads: Array<{ id: number }> }>>('/api/v4/leads', {
      method: 'POST',
      body: JSON.stringify([payload]),
    });
    const id = body?._embedded?.leads?.[0]?.id;
    if (!id) throw new Error('amoCRM lead create: empty id');
    return { id };
  }

  async account(): Promise<{ id: number; name: string; subdomain: string }> {
    const body = await this.request<{ id: number; name: string; subdomain: string }>('/api/v4/account');
    return { id: body.id, name: body.name, subdomain: body.subdomain };
  }

  private async contactPayload(input: AmocrmContactInput): Promise<Record<string, unknown>> {
    const extras = cardCustomFields(input);
    if (extras.length > 0) await this.ensureCustomFields();

    const custom_fields_values: Array<Record<string, unknown>> = [];
    const phone = input.phone ?? input.whatsapp;
    if (phone) {
      custom_fields_values.push({
        field_code: 'PHONE',
        values: [{ value: phone, enum_code: 'WORK' }],
      });
    }
    if (input.email) {
      custom_fields_values.push({
        field_code: 'EMAIL',
        values: [{ value: input.email, enum_code: 'WORK' }],
      });
    }

    for (const field of extras) {
      const field_id = this.fieldIds.get(field.code);
      const entry: Record<string, unknown> = field_id
        ? { field_id, values: [{ value: field.value }] }
        : { field_code: field.code, values: [{ value: field.value }] };
      custom_fields_values.push(entry);
    }

    const payload: Record<string, unknown> = { name: input.name };
    if (input.firstName) payload.first_name = input.firstName;
    if (input.lastName) payload.last_name = input.lastName;
    if (custom_fields_values.length > 0) payload.custom_fields_values = custom_fields_values;
    return payload;
  }

  /**
   * Один раз за жизнь клиента: читаем кастомные поля и создаём ASTRO_*, если их нет.
   * Ошибка создания не валит импорт — карточка всё равно уйдёт через note.
   */
  private async ensureCustomFields(): Promise<void> {
    if (this.fieldsReady) return this.fieldsReady;
    this.fieldsReady = this.loadCustomFields();
    try {
      await this.fieldsReady;
    } catch (error) {
      this.fieldsReady = null;
      throw error;
    }
  }

  private async loadCustomFields(): Promise<void> {
    try {
      const body = await this.request<
        EmbeddedList<{ custom_fields: Array<{ id: number; code?: string; name?: string }> }>
      >('/api/v4/contacts/custom_fields?limit=250');
      for (const field of body._embedded?.custom_fields ?? []) {
        if (field.code) this.fieldIds.set(field.code, field.id);
      }
    } catch {
      return;
    }

    const missing = ASTRO_CUSTOM_FIELDS.filter((field) => !this.fieldIds.has(field.code));
    if (missing.length === 0) return;

    try {
      const body = await this.request<
        EmbeddedList<{ custom_fields: Array<{ id: number; code?: string }> }>
      >('/api/v4/contacts/custom_fields', {
        method: 'POST',
        body: JSON.stringify(
          missing.map((field) => ({ name: field.name, type: field.type, code: field.code })),
        ),
      });
      for (const field of body._embedded?.custom_fields ?? []) {
        if (field.code) this.fieldIds.set(field.code, field.id);
      }
    } catch {
      // trial без прав на поля: дальше пишем field_code и note
    }
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

  async createPipeline(name: string, statuses?: PipelineStatusInput[]): Promise<{ id: number }> {
    try {
      return await this.postPipeline(name, statuses);
    } catch (error) {
      if (error instanceof AmocrmHttpError && error.status === 400 && statuses?.length) {
        return this.postPipeline(name);
      }
      throw error;
    }
  }

  private async postPipeline(name: string, statuses?: PipelineStatusInput[]): Promise<{ id: number }> {
    const payload: Record<string, unknown> = {
      name,
      sort: 20,
      is_main: false,
      is_unsorted_on: false,
    };
    if (statuses?.length) payload._embedded = { statuses };

    const body = await this.request<EmbeddedList<{ pipelines: Array<{ id: number }> }>>(
      '/api/v4/leads/pipelines',
      { method: 'POST', body: JSON.stringify([payload]) },
    );
    const id = body?._embedded?.pipelines?.[0]?.id;
    if (!id) throw new Error('amoCRM pipeline create: empty id');
    return { id };
  }

  async createStatuses(
    pipelineId: number,
    statuses: PipelineStatusInput[],
  ): Promise<Array<{ id: number; name: string }>> {
    const body = await this.request<EmbeddedList<{ statuses: Array<{ id: number; name: string }> }>>(
      `/api/v4/leads/pipelines/${pipelineId}/statuses`,
      { method: 'POST', body: JSON.stringify(statuses) },
    );
    return body?._embedded?.statuses ?? [];
  }

  async updateLead(
    id: number,
    patch: { pipelineId?: number; statusId?: number },
  ): Promise<void> {
    const payload: Record<string, unknown> = { id };
    if (patch.pipelineId) payload.pipeline_id = patch.pipelineId;
    if (patch.statusId) payload.status_id = patch.statusId;
    await this.request('/api/v4/leads', {
      method: 'PATCH',
      body: JSON.stringify([payload]),
    });
  }

  async listLeads(filter?: {
    pipelineId?: number;
    query?: string;
    page?: number;
    limit?: number;
  }): Promise<AmocrmLeadMatch[]> {
    const qs = new URLSearchParams();
    qs.set('limit', String(filter?.limit ?? 250));
    qs.set('page', String(filter?.page ?? 1));
    qs.set('with', 'contacts');
    if (filter?.query) qs.set('query', filter.query);
    if (filter?.pipelineId) qs.set('filter[pipeline_id][0]', String(filter.pipelineId));

    const body = await this.request<EmbeddedList<{ leads: RawLead[] }>>(`/api/v4/leads?${qs.toString()}`);
    return (body?._embedded?.leads ?? []).map((lead) => ({
      id: lead.id,
      name: lead.name ?? '',
      contactId: lead._embedded?.contacts?.[0]?.id ?? 0,
      pipelineId: lead.pipeline_id,
      statusId: lead.status_id,
      closed: Boolean(lead.closed_at),
    }));
  }

  async resolveAstroPipeline(): Promise<AstroPipelineMap> {
    if (this.astroPipeline) return this.astroPipeline;
    if (!this.pipelineReady) {
      this.pipelineReady = ensureAstroPipeline(this)
        .then((map) => {
          this.astroPipeline = map;
          this.config.pipelineId = map.pipelineId;
          this.config.statusId = map.statusId;
          return map;
        })
        .catch((error) => {
          this.pipelineReady = null;
          throw error;
        });
    }
    return this.pipelineReady;
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

function mapRawContact(contact: RawContact): AmocrmContactMatch {
  const phones: string[] = [];
  const emails: string[] = [];
  const fields: Record<string, string | boolean | number> = {};

  for (const field of contact.custom_fields_values ?? []) {
    const code = field.field_code;
    const raw = field.values?.[0]?.value;
    if (!code || raw === undefined || raw === null) continue;
    if (code === 'PHONE' && typeof raw === 'string') phones.push(raw);
    else if (code === 'EMAIL' && typeof raw === 'string') emails.push(raw);
    else if (typeof raw === 'string' || typeof raw === 'boolean' || typeof raw === 'number') {
      fields[code] = raw;
    }
  }

  return {
    id: contact.id,
    name: contact.name ?? '',
    firstName: contact.first_name ?? null,
    lastName: contact.last_name ?? null,
    phones,
    emails,
    fields,
  };
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
