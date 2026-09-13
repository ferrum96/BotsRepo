export type ReplyVariant = 'interested' | 'refuse' | 'later';

export interface DemoState {
  demoMode: boolean;
  messaging: string;
  amocrm: string;
  stats: {
    contacts: number;
    deals: number;
    messagesSent: number;
    replied: number;
    openTasks: number;
    amocrmContacts: number;
    amocrmDeals: number;
  };
  batch: {
    id: string;
    filename: string;
    status: string;
    totalRows: number;
    processedRows: number;
    successRows: number;
    duplicateRows: number;
    failedRows: number;
    manualRows: number;
  } | null;
  rows: {
    rowNumber: number;
    status: string;
    errorMessage: string | null;
    contactId: string | null;
  }[];
  pipeline: {
    dealId: string;
    stage: string;
    automationStatus: string;
    automationStep: string;
    score: number | null;
    rating: string | null;
    scoreReasons: string[] | null;
    lastReplyAt: string | null;
    lastMessageAt: string | null;
    contactId: string;
    firstName: string | null;
    lastName: string | null;
    city: string | null;
    schoolName: string | null;
    preferredChannel: string | null;
    eligibility: string;
    telegram: string | null;
    isVedicAstrologer: boolean | null;
    managerName: string | null;
    amocrmContactId: number | null;
    amocrmDealId: number | null;
  }[];
  recentMessages: {
    id: string;
    dealId: string | null;
    contactId: string;
    direction: string;
    status: string;
    step: string | null;
    body: string;
    createdAt: string;
    sentAt: string | null;
  }[];
  tasks: {
    id: string;
    dealId: string;
    kind: string;
    title: string;
    dueAt: string | null;
  }[];
}

async function parse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || response.statusText);
  }
  return response.json() as Promise<T>;
}

export interface DemoSources {
  tz: { filename: string; text: string };
  csv: { filename: string; text: string };
  critical: { filename: string; text: string };
}

export const api = {
  state: () => fetch('/api/demo/state').then((r) => parse<DemoState>(r)),
  sources: () => fetch('/api/demo/sources').then((r) => parse<DemoSources>(r)),
  runSample: () => fetch('/api/demo/run-sample', { method: 'POST' }).then((r) => parse<{ batchId: string }>(r)),
  reset: () => fetch('/api/demo/reset', { method: 'POST' }).then((r) => parse<{ ok: boolean }>(r)),
  reply: (dealId: string, variant: ReplyVariant) =>
    fetch('/api/demo/reply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dealId, variant }),
    }).then((r) => parse<unknown>(r)),
  qualify: (dealId: string) =>
    fetch('/api/demo/qualify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dealId }),
    }).then((r) => parse<{ score: number; rating: string; reasons: string[] }>(r)),
  upload: (file: File, source = 'PARSING_TELEGRAM') => {
    const body = new FormData();
    body.append('file', file);
    body.append('source', source);
    return fetch('/api/imports', { method: 'POST', body }).then((r) => parse<{ batchId: string }>(r));
  },
};
