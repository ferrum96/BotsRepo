import { and, desc, eq, inArray } from 'drizzle-orm';
import {
  AcquisitionStage,
  AutomationStatus,
  ChannelKind,
  EventType,
  IdentifierType,
  MessageDirection,
  MessageStatus,
  SuppressionLevel,
} from '@astrostone/contracts';
import {
  automationEvents,
  contactIdentifiers,
  deals,
  inboundEvents,
  managerTasks,
  messages,
  type Db,
} from '@astrostone/db';
import { normalizeEmail } from '../normalization/email';
import { normalizePhone } from '../normalization/phone';
import { normalizeTelegram } from '../normalization/telegram';
import { addSuppression } from '../messaging/suppression';
import { detectExplicitOptOut, detectPostpone } from './opt-out';

export interface InboundInput {
  channelKind: ChannelKind;
  externalEventId: string;
  from: string;
  body: string;
  receivedAt?: Date;
  rawPayload?: unknown;
}

export type InboundOutcome =
  | { status: 'DUPLICATE' }
  | { status: 'CONTACT_NOT_FOUND' }
  | {
      status: 'PROCESSED';
      contactId: string;
      dealId: string | null;
      optedOut: boolean;
      postponed: boolean;
    };

/** Из «@username», телефона или числового id собираем варианты для поиска в реестре. */
function lookupCandidates(from: string): { type: IdentifierType; value: string }[] {
  const candidates: { type: IdentifierType; value: string }[] = [];

  const telegram = normalizeTelegram(from);
  if (telegram.userId) {
    candidates.push({ type: IdentifierType.TELEGRAM_ID, value: String(telegram.userId) });
  }
  if (telegram.username) {
    candidates.push({ type: IdentifierType.TELEGRAM_USERNAME, value: telegram.username });
  }

  const phone = normalizePhone(from);
  if (phone) candidates.push({ type: IdentifierType.PHONE, value: phone });

  const email = normalizeEmail(from);
  if (email) candidates.push({ type: IdentifierType.EMAIL, value: email });

  return candidates;
}

/**
 * Обработка входящего сообщения (п. 10 и 12 ТЗ).
 *
 * Остановка автоматизации, перевод сделки и задача менеджеру выполняются одной
 * транзакцией: частичное применение здесь означало бы, что человек ответил,
 * а следующее касание всё равно ушло.
 */
export async function processInboundMessage(db: Db, input: InboundInput): Promise<InboundOutcome> {
  const receivedAt = input.receivedAt ?? new Date();

  // Идемпотентность вебхука: повторная доставка не создаёт вторую запись.
  const inserted = await db
    .insert(inboundEvents)
    .values({
      channel: input.channelKind,
      externalEventId: input.externalEventId,
      payload: (input.rawPayload ?? { from: input.from, body: input.body }) as object,
    })
    .onConflictDoNothing()
    .returning({ id: inboundEvents.id });

  if (inserted.length === 0) return { status: 'DUPLICATE' };

  const candidates = lookupCandidates(input.from);
  if (candidates.length === 0) return { status: 'CONTACT_NOT_FOUND' };

  const [match] = await db
    .select({ contactId: contactIdentifiers.contactId })
    .from(contactIdentifiers)
    .where(
      inArray(
        contactIdentifiers.normalizedValue,
        candidates.map((c) => c.value),
      ),
    )
    .limit(1);

  if (!match) return { status: 'CONTACT_NOT_FOUND' };

  const optedOut = detectExplicitOptOut(input.body);
  const postponed = !optedOut && detectPostpone(input.body);

  const result = await db.transaction(async (tx) => {
    const [deal] = await tx
      .select()
      .from(deals)
      .where(and(eq(deals.contactId, match.contactId), eq(deals.isActive, true)))
      .orderBy(desc(deals.createdAt))
      .limit(1)
      .for('update');

    await tx.insert(messages).values({
      contactId: match.contactId,
      dealId: deal?.id ?? null,
      channelKind: input.channelKind,
      direction: MessageDirection.INBOUND,
      renderedBody: input.body,
      status: MessageStatus.DELIVERED,
      deliveredAt: receivedAt,
      correlationId: deal?.correlationId ?? null,
    });

    if (!deal) return { dealId: null };

    const automationStatus = optedOut
      ? AutomationStatus.STOPPED_BY_OPT_OUT
      : AutomationStatus.STOPPED_BY_REPLY;

    await tx
      .update(deals)
      .set({
        automationStatus,
        stage: optedOut ? AcquisitionStage.CLOSED_REFUSED : AcquisitionStage.REPLIED,
        isActive: optedOut ? false : deal.isActive,
        closedReason: optedOut ? 'REFUSED' : deal.closedReason,
        lastReplyAt: receivedAt,
        updatedAt: receivedAt,
      })
      .where(eq(deals.id, deal.id));

    if (!optedOut) {
      await tx.insert(managerTasks).values({
        dealId: deal.id,
        managerId: deal.responsibleManagerId,
        kind: 'PROCESS_REPLY',
        title: 'Ответил потенциальный партнёр — обработать вручную',
        dueAt: new Date(receivedAt.getTime() + 2 * 3600 * 1000),
      });
    }

    await tx.insert(automationEvents).values([
      {
        contactId: match.contactId,
        dealId: deal.id,
        eventType: EventType.REPLY_RECEIVED,
        source: `webhook:${input.channelKind}`,
        correlationId: deal.correlationId,
        payload: { optedOut, postponed },
      },
      {
        contactId: match.contactId,
        dealId: deal.id,
        eventType: EventType.AUTOMATION_STOPPED,
        source: `webhook:${input.channelKind}`,
        correlationId: deal.correlationId,
        payload: { automationStatus },
      },
    ]);

    return { dealId: deal.id };
  });

  if (optedOut) {
    await addSuppression(db, {
      contactId: match.contactId,
      channelKind: null,
      level: SuppressionLevel.PERMANENT,
      reason: `Явный отказ в переписке: «${input.body.slice(0, 200)}»`,
    });
  } else if (postponed) {
    const pausedUntil = new Date(receivedAt.getTime() + 30 * 24 * 3600 * 1000);
    await addSuppression(db, {
      contactId: match.contactId,
      channelKind: input.channelKind,
      level: SuppressionLevel.PAUSED_UNTIL,
      pausedUntil,
      reason: 'Просил написать позже',
    });
  }

  return {
    status: 'PROCESSED',
    contactId: match.contactId,
    dealId: result.dealId,
    optedOut,
    postponed,
  };
}
