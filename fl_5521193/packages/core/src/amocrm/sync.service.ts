import { eq } from 'drizzle-orm';
import { IdentifierType } from '@astrostone/contracts';
import {
  contactIdentifiers,
  contacts,
  deals,
  integrationLogs,
  type Db,
} from '@astrostone/db';
import type { AmocrmPort } from './client';

export interface SyncAmocrmResult {
  skipped: boolean;
  amocrmContactId?: number;
  amocrmDealId?: number;
}

function displayName(contact: {
  firstName: string | null;
  lastName: string | null;
  telegram?: string;
}): string {
  const parts = [contact.firstName, contact.lastName].filter(Boolean);
  const name = parts.join(' ').trim() || 'Без имени';
  return contact.telegram ? `${name} (${contact.telegram})` : name;
}

/**
 * Идемпотентный пуш контакта и сделки в amoCRM.
 * Локальные id — источник правды; amo id пишем только если ещё пустые.
 */
export async function syncContactToAmocrm(
  db: Db,
  client: AmocrmPort,
  payload: { contactId: string; dealId?: string },
): Promise<SyncAmocrmResult> {
  const [contact] = await db.select().from(contacts).where(eq(contacts.id, payload.contactId)).limit(1);
  if (!contact) throw new Error(`contact ${payload.contactId} not found`);

  const deal = payload.dealId
    ? (await db.select().from(deals).where(eq(deals.id, payload.dealId)).limit(1))[0]
    : undefined;

  if (contact.amocrmContactId && (!deal || deal.amocrmDealId)) {
    return {
      skipped: true,
      amocrmContactId: contact.amocrmContactId,
      amocrmDealId: deal?.amocrmDealId ?? undefined,
    };
  }

  const identifiers = await db
    .select()
    .from(contactIdentifiers)
    .where(eq(contactIdentifiers.contactId, contact.id));

  const phone = identifiers.find((row) => row.type === IdentifierType.PHONE)?.normalizedValue;
  const email = identifiers.find((row) => row.type === IdentifierType.EMAIL)?.normalizedValue;
  const telegram =
    identifiers.find((row) => row.type === IdentifierType.TELEGRAM_USERNAME)?.normalizedValue ??
    identifiers.find((row) => row.type === IdentifierType.TELEGRAM_ID)?.normalizedValue;

  const started = Date.now();
  let amocrmContactId = contact.amocrmContactId ?? undefined;
  let amocrmDealId = deal?.amocrmDealId ?? undefined;

  try {
    if (!amocrmContactId) {
      const created = await client.createContact({
        name: displayName({ firstName: contact.firstName, lastName: contact.lastName, telegram }),
        ...(phone ? { phone } : {}),
        ...(email ? { email } : {}),
      });
      amocrmContactId = created.id;
      await db
        .update(contacts)
        .set({ amocrmContactId, updatedAt: new Date() })
        .where(eq(contacts.id, contact.id));
    }

    if (deal && !amocrmDealId) {
      const created = await client.createLead({
        name: `Партнёр: ${displayName({ firstName: contact.firstName, lastName: contact.lastName })}`,
        contactId: amocrmContactId,
      });
      amocrmDealId = created.id;
      await db
        .update(deals)
        .set({ amocrmDealId, updatedAt: new Date() })
        .where(eq(deals.id, deal.id));
    }

    await db.insert(integrationLogs).values({
      system: 'amocrm',
      operation: 'sync-contact',
      requestSummary: {
        contactId: contact.id,
        dealId: deal?.id ?? null,
        hasPhone: Boolean(phone),
        hasEmail: Boolean(email),
      },
      responseStatus: 'ok',
      responseSummary: { amocrmContactId, amocrmDealId: amocrmDealId ?? null },
      durationMs: Date.now() - started,
    });

    return { skipped: false, amocrmContactId, amocrmDealId };
  } catch (error) {
    await db.insert(integrationLogs).values({
      system: 'amocrm',
      operation: 'sync-contact',
      requestSummary: { contactId: contact.id, dealId: deal?.id ?? null },
      responseStatus: 'error',
      responseSummary: { message: error instanceof Error ? error.message.slice(0, 300) : 'unknown' },
      durationMs: Date.now() - started,
    });
    throw error;
  }
}
