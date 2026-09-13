import { cardCustomFields, type AmocrmContactMatch, type AmocrmLeadMatch } from './fields';
import type { AmocrmContactInput, AmocrmLeadInput, AmocrmPort } from './client';

interface StoredContact {
  id: number;
  name: string;
  firstName?: string | null;
  lastName?: string | null;
  phones: string[];
  emails: string[];
  fields: Record<string, string | boolean | number>;
}

interface StoredLead {
  id: number;
  name: string;
  contactId: number;
  pipelineId?: number;
  statusId?: number;
  closed: boolean;
}

const toMatch = (contact: StoredContact): AmocrmContactMatch => ({
  id: contact.id,
  name: contact.name,
  firstName: contact.firstName,
  lastName: contact.lastName,
  phones: [...contact.phones],
  emails: [...contact.emails],
  fields: { ...contact.fields },
});

/**
 * In-memory amoCRM для тестов п. 2–3: поиск, дозаполнение, отказ от второй сделки.
 */
export class MemoryAmocrmClient implements AmocrmPort {
  readonly contacts = new Map<number, StoredContact>();
  readonly leads = new Map<number, StoredLead>();
  readonly notes: Array<{ contactId: number; text: string }> = [];
  readonly calls = { contacts: 0, leads: 0, updates: 0, searches: 0, notes: 0 };

  private nextContactId = 10_000;
  private nextLeadId = 20_000;

  async createContact(input: AmocrmContactInput): Promise<{ id: number }> {
    this.calls.contacts += 1;
    const id = this.nextContactId;
    this.nextContactId += 1;
    this.contacts.set(id, this.applyCard({ id, name: input.name, phones: [], emails: [], fields: {} }, input));
    return { id };
  }

  async updateContact(id: number, input: AmocrmContactInput): Promise<void> {
    const existing = this.contacts.get(id);
    if (!existing) throw new Error(`memory amoCRM contact ${id} not found`);
    this.calls.updates += 1;
    this.contacts.set(id, this.applyCard(existing, input));
  }

  async searchContacts(query: string): Promise<AmocrmContactMatch[]> {
    this.calls.searches += 1;
    const needle = query.trim().toLowerCase();
    if (!needle) return [];

    return [...this.contacts.values()]
      .filter((contact) => this.haystack(contact).includes(needle))
      .map(toMatch);
  }

  async getContact(id: number): Promise<AmocrmContactMatch | null> {
    const contact = this.contacts.get(id);
    return contact ? toMatch(contact) : null;
  }

  async createLead(input: AmocrmLeadInput): Promise<{ id: number }> {
    this.calls.leads += 1;
    const id = this.nextLeadId;
    this.nextLeadId += 1;
    this.leads.set(id, {
      id,
      name: input.name,
      contactId: input.contactId,
      pipelineId: input.pipelineId,
      statusId: input.statusId,
      closed: false,
    });
    return { id };
  }

  async listLeadsByContact(contactId: number): Promise<AmocrmLeadMatch[]> {
    return [...this.leads.values()]
      .filter((lead) => lead.contactId === contactId)
      .map((lead) => ({ ...lead }));
  }

  async addNote(contactId: number, text: string): Promise<void> {
    this.calls.notes += 1;
    this.notes.push({ contactId, text });
  }

  closeLead(id: number): void {
    const lead = this.leads.get(id);
    if (lead) lead.closed = true;
  }

  private applyCard(target: StoredContact, input: AmocrmContactInput): StoredContact {
    const next: StoredContact = {
      ...target,
      name: input.name || target.name,
      firstName: input.firstName ?? target.firstName,
      lastName: input.lastName ?? target.lastName,
      phones: [...target.phones],
      emails: [...target.emails],
      fields: { ...target.fields },
    };

    const phone = input.phone ?? input.whatsapp;
    if (phone && !next.phones.includes(phone)) next.phones.push(phone);
    if (input.email && !next.emails.includes(input.email)) next.emails.push(input.email);

    for (const field of cardCustomFields(input)) {
      if (next.fields[field.code] === undefined || next.fields[field.code] === '') {
        next.fields[field.code] = field.value;
      }
    }

    return next;
  }

  private haystack(contact: StoredContact): string {
    return [
      contact.name,
      contact.firstName,
      contact.lastName,
      ...contact.phones,
      ...contact.emails,
      ...Object.values(contact.fields).map(String),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
  }
}
