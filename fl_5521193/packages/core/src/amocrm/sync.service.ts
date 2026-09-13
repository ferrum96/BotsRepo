import { desc, eq } from 'drizzle-orm';
import { IdentifierType } from '@astrostone/contracts';
import {
  contactIdentifiers,
  contacts,
  dataProvenance,
  deals,
  integrationLogs,
  type Db,
} from '@astrostone/db';
import type { AmocrmPort } from './client';
import {
  CONTACT_TYPE_LABEL,
  DIRECTION_LABEL,
  QUALIFICATION_NOT_LABELED,
  cardHasPayload,
  cardNote,
  missingCardFields,
  parseChannelFromSource,
  patchedFieldCodes,
  profileLinkFromCard,
  type AmocrmContactCard,
} from './fields';
import { findAmocrmContact } from './lookup';

export interface SyncAmocrmResult {
  skipped: boolean;
  amocrmContactId?: number;
  amocrmDealId?: number;
  contactAction?: 'created' | 'reused' | 'updated';
  dealAction?: 'created' | 'reused' | 'skipped';
  matchedBy?: string;
}

function displayName(contact: {
  firstName: string | null;
  lastName: string | null;
  telegram?: string | null;
}): string {
  const parts = [contact.firstName, contact.lastName].filter(Boolean);
  const name = parts.join(' ').trim() || 'Без имени';
  return contact.telegram ? `${name} (${contact.telegram})` : name;
}

const cardFromLocal = (
  contact: typeof contacts.$inferSelect,
  extras: {
    phone?: string | null;
    email?: string | null;
    telegram?: string | null;
    sourceUrl?: string | null;
  },
): AmocrmContactCard => ({
  name: displayName({
    firstName: contact.firstName,
    lastName: contact.lastName,
    telegram: extras.telegram ?? contact.telegramUsernameRaw,
  }),
  firstName: contact.firstName,
  lastName: contact.lastName,
  phone: extras.phone ?? contact.phoneRaw,
  email: extras.email ?? contact.emailRaw,
  telegramUsername: extras.telegram ?? contact.telegramUsernameRaw,
  telegramUserId: contact.telegramUserId,
  whatsapp: contact.whatsappRaw,
  telegramUrl: contact.telegramUrl,
  vkUrl: contact.vkUrl,
  instagramUrl: contact.instagramUrl,
  website: contact.website,
  schoolName: contact.schoolName,
  city: contact.city,
  country: contact.country,
  specialization: contact.specialization,
  comment: contact.comment,
  isVedicAstrologer: contact.isVedicAstrologer,
  acquisitionSource: contact.acquisitionSource,
  sourceUrl: extras.sourceUrl,
  contactType: contact.contactType === 'POTENTIAL_ASTRO_PARTNER' ? CONTACT_TYPE_LABEL : contact.contactType,
  direction: DIRECTION_LABEL,
  parseChannel: parseChannelFromSource(contact.acquisitionSource, {
    instagramUrl: contact.instagramUrl,
    website: contact.website,
    vkUrl: contact.vkUrl,
  }),
  enteredAt: Math.floor(contact.createdAt.getTime() / 1000),
  qualificationStatus:
    contact.qualificationStatus === 'NOT_QUALIFIED' ? QUALIFICATION_NOT_LABELED : contact.qualificationStatus,
  profileUrl: profileLinkFromCard({
    profileUrl: contact.profileUrl,
    telegramUrl: contact.telegramUrl,
    telegramUsername: extras.telegram ?? contact.telegramUsernameRaw,
    vkUrl: contact.vkUrl,
    instagramUrl: contact.instagramUrl,
    website: contact.website,
  }),
});

/**
 * П. 2–3: все доступные поля в карточку amoCRM.
 * Перед созданием ищем дубль (телефон → Telegram → email → ссылка).
 * Нашли — дополняем пустые поля, активную сделку не плодим, пишем источник повтора.
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

  const identifiers = await db
    .select()
    .from(contactIdentifiers)
    .where(eq(contactIdentifiers.contactId, contact.id));

  const [provenance] = await db
    .select()
    .from(dataProvenance)
    .where(eq(dataProvenance.contactId, contact.id))
    .orderBy(desc(dataProvenance.createdAt))
    .limit(1);

  const phone = identifiers.find((row) => row.type === IdentifierType.PHONE)?.normalizedValue;
  const email = identifiers.find((row) => row.type === IdentifierType.EMAIL)?.normalizedValue;
  const telegram =
    identifiers.find((row) => row.type === IdentifierType.TELEGRAM_USERNAME)?.normalizedValue ??
    identifiers.find((row) => row.type === IdentifierType.TELEGRAM_ID)?.normalizedValue;

  const card = cardFromLocal(contact, {
    phone,
    email,
    telegram,
    sourceUrl: provenance?.sourceUrl ?? null,
  });

  const started = Date.now();
  let amocrmContactId = contact.amocrmContactId ?? undefined;
  let amocrmDealId = deal?.amocrmDealId ?? undefined;
  let contactAction: SyncAmocrmResult['contactAction'];
  let dealAction: SyncAmocrmResult['dealAction'];
  let matchedBy: string | undefined;

  try {
    if (!amocrmContactId) {
      const found = await findAmocrmContact(
        client,
        identifiers.map((row) => ({
          type: row.type as IdentifierType,
          normalizedValue: row.normalizedValue,
        })),
      );
      if (found) {
        amocrmContactId = found.contact.id;
        matchedBy = found.matchedBy;
        contactAction = 'reused';
        const patch = missingCardFields(found.contact, card);
        if (cardHasPayload(patch)) {
          await client.updateContact(amocrmContactId, { ...patch, name: card.name });
          contactAction = 'updated';
        }
        await client
          .addNote(
            amocrmContactId,
            cardNote(card, `AstroStone · повторное попадание (${found.matchedBy})`),
          )
          .catch(() => undefined);
      } else {
        const created = await client.createContact(card);
        amocrmContactId = created.id;
        contactAction = 'created';
        await client.addNote(amocrmContactId, cardNote(card, 'AstroStone · импорт')).catch(() => undefined);
      }

      await db
        .update(contacts)
        .set({ amocrmContactId, updatedAt: new Date() })
        .where(eq(contacts.id, contact.id));
    } else if (deal && deal.amocrmDealId) {
      return {
        skipped: true,
        amocrmContactId,
        amocrmDealId: deal.amocrmDealId,
        contactAction: 'reused',
        dealAction: 'skipped',
      };
    } else {
      const existing = await client.getContact(amocrmContactId);
      if (existing) {
        const patch = missingCardFields(existing, card);
        if (cardHasPayload(patch)) {
          await client.updateContact(amocrmContactId, { ...patch, name: existing.name || card.name });
          contactAction = 'updated';
        } else {
          contactAction = 'reused';
        }
      } else {
        contactAction = 'reused';
      }
    }

    if (deal && !amocrmDealId) {
      const leads = await client.listLeadsByContact(amocrmContactId);
      let active = leads.find((lead) => !lead.closed) ?? null;
      if (active) {
        const [taken] = await db
          .select({ id: deals.id })
          .from(deals)
          .where(eq(deals.amocrmDealId, active.id))
          .limit(1);
        if (taken && taken.id !== deal.id) active = null;
      }

      if (active) {
        amocrmDealId = active.id;
        dealAction = 'reused';
      } else {
        const created = await client.createLead({
          name: `Партнёр: ${displayName({ firstName: contact.firstName, lastName: contact.lastName })}`,
          contactId: amocrmContactId,
        });
        amocrmDealId = created.id;
        dealAction = 'created';
      }

      await db
        .update(deals)
        .set({ amocrmDealId, updatedAt: new Date() })
        .where(eq(deals.id, deal.id));
    } else {
      dealAction = deal ? 'skipped' : undefined;
    }

    await db.insert(integrationLogs).values({
      system: 'amocrm',
      operation: 'sync-contact',
      requestSummary: {
        contactId: contact.id,
        dealId: deal?.id ?? null,
        hasPhone: Boolean(phone),
        hasEmail: Boolean(email),
        patched: patchedFieldCodes(card),
      },
      responseStatus: 'ok',
      responseSummary: {
        amocrmContactId,
        amocrmDealId: amocrmDealId ?? null,
        contactAction,
        dealAction: dealAction ?? null,
        matchedBy: matchedBy ?? null,
      },
      durationMs: Date.now() - started,
    });

    return {
      skipped: false,
      amocrmContactId,
      amocrmDealId,
      contactAction,
      dealAction,
      matchedBy,
    };
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
