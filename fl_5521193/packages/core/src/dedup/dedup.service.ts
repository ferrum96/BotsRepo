import { and, eq, inArray, sql } from 'drizzle-orm';
import {
  AcquisitionStage,
  AutomationEligibility,
  AutomationStatus,
  AutomationStep,
  DEDUP_LOOKUP_ORDER,
  EventType,
  type ChannelKind,
  type IdentifierType,
  type NormalizedRow,
} from '@astrostone/contracts';
import {
  acquireAdvisoryLock,
  automationEvents,
  contactIdentifiers,
  contacts,
  dataProvenance,
  deals,
  duplicateReviews,
  type Db,
  type DbTx,
} from '@astrostone/db';
import type { ExtractedIdentifier } from '../normalization/row';

export interface DedupInput {
  row: NormalizedRow;
  identifiers: ExtractedIdentifier[];
  eligibility: AutomationEligibility;
  preferredChannel: ChannelKind | null;
  importRowId: string;
  correlationId: string;
}

export type DedupDecision =
  | 'CONTACT_CREATED'
  | 'CONTACT_MERGED_DEAL_CREATED'
  | 'CONTACT_MERGED_DEAL_EXISTS'
  | 'NEEDS_REVIEW';

export interface DedupResult {
  decision: DedupDecision;
  contactId: string;
  dealId: string | null;
}

/** Идентификатор с наибольшим приоритетом — на нём берём advisory lock. */
function primaryIdentifier(identifiers: ExtractedIdentifier[]): ExtractedIdentifier | null {
  for (const type of DEDUP_LOOKUP_ORDER) {
    const found = identifiers.find((i) => i.type === type);
    if (found) return found;
  }
  return identifiers[0] ?? null;
}

async function findContactByIdentifiers(
  tx: DbTx,
  identifiers: ExtractedIdentifier[],
): Promise<{ contactId: string; matchedBy: IdentifierType } | null> {
  // Порядок из п. 3 ТЗ: телефон → Telegram → email → username/ссылка.
  for (const type of DEDUP_LOOKUP_ORDER) {
    const values = identifiers.filter((i) => i.type === type).map((i) => i.normalizedValue);
    if (values.length === 0) continue;

    const [found] = await tx
      .select({ contactId: contactIdentifiers.contactId })
      .from(contactIdentifiers)
      .where(
        and(eq(contactIdentifiers.type, type), inArray(contactIdentifiers.normalizedValue, values)),
      )
      .limit(1);

    if (found) return { contactId: found.contactId, matchedBy: type };
  }

  return null;
}

/**
 * Нечёткий кандидат: совпали имя, фамилия и город, но ни одного общего идентификатора.
 * Такие записи не сливаем автоматически — решение принимает человек (docs/02-critical.md R3).
 */
async function findFuzzyCandidate(tx: DbTx, row: NormalizedRow): Promise<string | null> {
  if (!row.firstName || !row.lastName) return null;

  const [found] = await tx
    .select({ id: contacts.id })
    .from(contacts)
    .where(
      and(
        sql`lower(${contacts.firstName}) = lower(${row.firstName})`,
        sql`lower(${contacts.lastName}) = lower(${row.lastName})`,
        row.city ? sql`lower(${contacts.city}) = lower(${row.city})` : sql`true`,
      ),
    )
    .limit(1);

  return found?.id ?? null;
}

const contactValuesFromRow = (row: NormalizedRow, eligibility: AutomationEligibility, channel: ChannelKind | null) => ({
  firstName: row.firstName,
  lastName: row.lastName,
  phoneRaw: row.phone,
  emailRaw: row.email,
  telegramUsernameRaw: row.telegramUsername,
  telegramUserId: row.telegramUserId,
  whatsappRaw: row.whatsapp,
  profileUrl: row.profileUrl,
  telegramUrl: row.telegramUrl,
  vkUrl: row.vkUrl,
  instagramUrl: row.instagramUrl,
  website: row.website,
  schoolName: row.schoolName,
  city: row.city,
  country: row.country,
  specialization: row.specialization,
  comment: row.comment,
  acquisitionSource: row.acquisitionSource,
  automationEligibility: eligibility,
  preferredChannel: channel,
});

/** Дополняем только пустые поля: данные из новой базы не должны затирать проверенные. */
function missingFieldsPatch(
  existing: Record<string, unknown>,
  incoming: Record<string, unknown>,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(incoming)) {
    if (value === null || value === undefined) continue;
    const current = existing[key];
    if (current === null || current === undefined || current === '') patch[key] = value;
  }

  return patch;
}

async function hasActiveAcquisitionDeal(tx: DbTx, contactId: string): Promise<string | null> {
  const [found] = await tx
    .select({ id: deals.id })
    .from(deals)
    .where(
      and(
        eq(deals.contactId, contactId),
        eq(deals.pipeline, 'PARTNER_ACQUISITION'),
        eq(deals.isActive, true),
      ),
    )
    .limit(1);

  return found?.id ?? null;
}

async function createAcquisitionDeal(
  tx: DbTx,
  contactId: string,
  correlationId: string,
  eligibility: AutomationEligibility,
): Promise<string> {
  const [deal] = await tx
    .insert(deals)
    .values({
      contactId,
      pipeline: 'PARTNER_ACQUISITION',
      stage: AcquisitionStage.NEW_PROSPECT,
      isActive: true,
      automationStatus:
        eligibility === AutomationEligibility.AUTO_OK
          ? AutomationStatus.ACTIVE
          : AutomationStatus.PAUSED,
      automationStep:
        eligibility === AutomationEligibility.AUTO_OK
          ? AutomationStep.ELIGIBILITY_CHECK
          : AutomationStep.MANUAL_OUTREACH_REQUIRED,
      correlationId,
    })
    .returning({ id: deals.id });

  if (!deal) throw new Error('deal insert returned no row');

  await tx.insert(automationEvents).values({
    contactId,
    dealId: deal.id,
    eventType: EventType.DEAL_CREATED,
    source: 'import',
    correlationId,
    payload: { pipeline: 'PARTNER_ACQUISITION', stage: AcquisitionStage.NEW_PROSPECT },
  });

  return deal.id;
}

/**
 * Идемпотентное разрешение контакта и сделки по одной строке импорта.
 *
 * Транзакция плюс advisory lock по ключевому идентификатору: два воркера
 * с одним и тем же телефоном выстраиваются в очередь, а не создают два контакта.
 * Уникальный индекс на (type, normalized_value) остаётся последней линией защиты.
 */
export async function resolveContactAndDeal(db: Db, input: DedupInput): Promise<DedupResult> {
  const { row, identifiers, correlationId, importRowId } = input;

  const primary = primaryIdentifier(identifiers);
  if (!primary) throw new Error('resolveContactAndDeal requires at least one identifier');

  return db.transaction(async (tx) => {
    await acquireAdvisoryLock(tx, `${primary.type}:${primary.normalizedValue}`);

    const match = await findContactByIdentifiers(tx, identifiers);

    if (match) {
      const [existing] = await tx
        .select()
        .from(contacts)
        .where(eq(contacts.id, match.contactId))
        .limit(1);

      if (!existing) throw new Error(`contact ${match.contactId} vanished mid-transaction`);

      const patch = missingFieldsPatch(
        existing as unknown as Record<string, unknown>,
        contactValuesFromRow(row, input.eligibility, input.preferredChannel),
      );
      // Признак достижимости пересчитывается, а не дополняется: канал мог появиться.
      if (
        existing.automationEligibility !== AutomationEligibility.AUTO_OK &&
        input.eligibility === AutomationEligibility.AUTO_OK
      ) {
        patch.automationEligibility = AutomationEligibility.AUTO_OK;
        patch.preferredChannel = input.preferredChannel;
      }

      if (Object.keys(patch).length > 0) {
        await tx
          .update(contacts)
          .set({ ...patch, updatedAt: new Date() })
          .where(eq(contacts.id, existing.id));
      }

      // Новые идентификаторы того же человека добавляем, конфликты игнорируем.
      for (const identifier of identifiers) {
        await tx
          .insert(contactIdentifiers)
          .values({
            contactId: existing.id,
            type: identifier.type,
            rawValue: identifier.rawValue,
            normalizedValue: identifier.normalizedValue,
          })
          .onConflictDoNothing();
      }

      // П. 3 ТЗ: фиксировать источник повторного попадания.
      await tx.insert(dataProvenance).values({
        contactId: existing.id,
        source: row.acquisitionSource,
        sourceUrl: row.sourceUrl,
        importRowId,
      });

      await tx.insert(automationEvents).values({
        contactId: existing.id,
        eventType: EventType.DUPLICATE_FOUND,
        source: 'import',
        correlationId,
        payload: { matchedBy: match.matchedBy, patchedFields: Object.keys(patch) },
      });

      const activeDealId = await hasActiveAcquisitionDeal(tx, existing.id);
      if (activeDealId) {
        return {
          decision: 'CONTACT_MERGED_DEAL_EXISTS',
          contactId: existing.id,
          dealId: activeDealId,
        };
      }

      const dealId = await createAcquisitionDeal(
        tx,
        existing.id,
        correlationId,
        input.eligibility,
      );

      return { decision: 'CONTACT_MERGED_DEAL_CREATED', contactId: existing.id, dealId };
    }

    const fuzzyCandidateId = await findFuzzyCandidate(tx, row);
    if (fuzzyCandidateId) {
      await tx.insert(duplicateReviews).values({
        importRowId,
        candidateContactId: fuzzyCandidateId,
        matchReason: 'Совпали имя, фамилия и город, общих идентификаторов нет',
        confidence: '0.50',
      });

      return { decision: 'NEEDS_REVIEW', contactId: fuzzyCandidateId, dealId: null };
    }

    const [created] = await tx
      .insert(contacts)
      .values(contactValuesFromRow(row, input.eligibility, input.preferredChannel))
      .returning({ id: contacts.id });

    if (!created) throw new Error('contact insert returned no row');

    for (const identifier of identifiers) {
      await tx.insert(contactIdentifiers).values({
        contactId: created.id,
        type: identifier.type,
        rawValue: identifier.rawValue,
        normalizedValue: identifier.normalizedValue,
        isPrimary: identifier === primary,
      });
    }

    await tx.insert(dataProvenance).values({
      contactId: created.id,
      source: row.acquisitionSource,
      sourceUrl: row.sourceUrl,
      importRowId,
    });

    await tx.insert(automationEvents).values({
      contactId: created.id,
      eventType: EventType.CONTACT_CREATED,
      source: 'import',
      correlationId,
      payload: { identifiers: identifiers.map((i) => i.type) },
    });

    const dealId = await createAcquisitionDeal(tx, created.id, correlationId, input.eligibility);

    return { decision: 'CONTACT_CREATED', contactId: created.id, dealId };
  });
}
