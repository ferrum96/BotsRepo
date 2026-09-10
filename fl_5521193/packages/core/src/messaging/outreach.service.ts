import { and, eq, sql } from 'drizzle-orm';
import {
  AcquisitionStage,
  AutomationStatus,
  AutomationStep,
  ChannelKind,
  EventType,
  MessageDirection,
  MessageStatus,
  OutreachStep,
  SendBlockReason,
  type SendBlockReason as SendBlockReasonType,
} from '@astrostone/contracts';
import {
  automationEvents,
  channelUsage,
  channels,
  contacts,
  deals,
  managerLimits,
  managerTasks,
  managers,
  messageTemplates,
  messages,
  templateVersions,
  type Db,
} from '@astrostone/db';
import type { MessagingProvider } from './provider';
import { isSuppressed } from './suppression';
import { TemplateRenderError, renderTemplate } from './template';
import { isInsideSendWindow, nextSendWindowStart, type SendWindow } from './send-window';

export interface OutreachConfig {
  defaultTimezone: string;
  jitterMinSeconds: number;
  jitterMaxSeconds: number;
}

export type SendOutcome =
  | { status: 'SENT'; messageId: string; body: string }
  | { status: 'CANCELLED'; reason: SendBlockReasonType }
  | { status: 'RESCHEDULED'; reason: SendBlockReasonType; retryAt: Date }
  | { status: 'FAILED'; reason: SendBlockReasonType | 'TRANSPORT_ERROR'; errorCode?: string };

const STEP_TO_STAGE: Partial<Record<OutreachStep, AcquisitionStage>> = {
  [OutreachStep.FIRST]: AcquisitionStage.FIRST_TOUCH_SENT,
  [OutreachStep.FOLLOWUP_D3]: AcquisitionStage.NURTURING,
};

const STEP_TO_AUTOMATION_STEP: Record<OutreachStep, AutomationStep> = {
  [OutreachStep.FIRST]: AutomationStep.FIRST_MESSAGE_SENT,
  [OutreachStep.FOLLOWUP_D3]: AutomationStep.FOLLOWUP_D3_SENT,
  [OutreachStep.FOLLOWUP_D7]: AutomationStep.FOLLOWUP_D7_SENT,
  [OutreachStep.FOLLOWUP_D14]: AutomationStep.FOLLOWUP_D14_SENT,
  [OutreachStep.FOLLOWUP_D30]: AutomationStep.FOLLOWUP_D30_SENT,
};

function destinationFor(
  channelKind: ChannelKind,
  contact: { telegramUsernameRaw: string | null; telegramUserId: number | null; phoneRaw: string | null; whatsappRaw: string | null; emailRaw: string | null },
): string | null {
  if (channelKind === ChannelKind.TELEGRAM) {
    if (contact.telegramUserId) return String(contact.telegramUserId);
    return contact.telegramUsernameRaw ? `@${contact.telegramUsernameRaw}` : null;
  }
  if (channelKind === ChannelKind.WHATSAPP) return contact.whatsappRaw ?? contact.phoneRaw;
  return contact.emailRaw;
}

const dateKey = (date: Date, timeZone: string): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(date);

/**
 * Отправка одного касания.
 *
 * Guard-цепочка выполняется под `for update` по сделке и на свежих данных,
 * а не на payload джобы: ответ мог прийти уже после её постановки
 * (docs/02-critical.md R5). Исчерпанный лимит — это перенос, а не ошибка.
 */
export async function sendOutreachStep(
  db: Db,
  providers: Map<ChannelKind, MessagingProvider>,
  input: { dealId: string; step: OutreachStep; now?: Date },
  config: OutreachConfig,
): Promise<SendOutcome> {
  const now = input.now ?? new Date();
  const idempotencyKey = `${input.dealId}:${input.step}`;

  const prepared = await db.transaction(async (tx) => {
    const [deal] = await tx
      .select()
      .from(deals)
      .where(eq(deals.id, input.dealId))
      .limit(1)
      .for('update');

    if (!deal) throw new Error(`deal ${input.dealId} not found`);

    if (deal.automationStatus !== AutomationStatus.ACTIVE) {
      return { blocked: SendBlockReason.AUTOMATION_NOT_ACTIVE } as const;
    }
    if (deal.lastReplyAt) {
      return { blocked: SendBlockReason.ALREADY_REPLIED } as const;
    }

    const [contact] = await tx
      .select()
      .from(contacts)
      .where(eq(contacts.id, deal.contactId))
      .limit(1);

    if (!contact) throw new Error(`contact ${deal.contactId} not found`);

    const channelKind = (contact.preferredChannel as ChannelKind | null) ?? ChannelKind.TELEGRAM;

    if (await isSuppressed(tx, contact.id, channelKind, now)) {
      return { blocked: SendBlockReason.SUPPRESSED, contactId: contact.id } as const;
    }

    const [alreadySent] = await tx
      .select({ id: messages.id })
      .from(messages)
      .where(eq(messages.idempotencyKey, idempotencyKey))
      .limit(1);

    if (alreadySent) return { blocked: SendBlockReason.ALREADY_SENT } as const;

    const destination = destinationFor(channelKind, contact);
    if (!destination) return { blocked: SendBlockReason.NO_CHANNEL, contactId: contact.id } as const;

    const [channel] = await tx
      .select()
      .from(channels)
      .where(
        and(
          eq(channels.kind, channelKind),
          eq(channels.status, 'ACTIVE'),
          eq(channels.canInitiate, true),
          deal.responsibleManagerId
            ? eq(channels.managerId, deal.responsibleManagerId)
            : sql`true`,
        ),
      )
      .limit(1);

    if (!channel) return { blocked: SendBlockReason.NO_CHANNEL, contactId: contact.id } as const;

    const timeZone = contact.timezone ?? config.defaultTimezone;
    const window = channel.sendWindow as SendWindow;

    if (!isInsideSendWindow(now, window, timeZone)) {
      return {
        blocked: SendBlockReason.OUTSIDE_SEND_WINDOW,
        retryAt: nextSendWindowStart(now, window, timeZone),
        contactId: contact.id,
      } as const;
    }

    const usageDate = dateKey(now, timeZone);

    await tx
      .insert(channelUsage)
      .values({ channelId: channel.id, usageDate, sentCount: 0 })
      .onConflictDoNothing();

    const [usage] = await tx
      .select()
      .from(channelUsage)
      .where(and(eq(channelUsage.channelId, channel.id), eq(channelUsage.usageDate, usageDate)))
      .limit(1)
      .for('update');

    if (usage && usage.sentCount >= channel.dailyLimit) {
      return {
        blocked: SendBlockReason.CHANNEL_LIMIT_REACHED,
        retryAt: nextSendWindowStart(
          new Date(now.getTime() + 24 * 3600 * 1000),
          window,
          timeZone,
        ),
        contactId: contact.id,
      } as const;
    }

    if (deal.responsibleManagerId) {
      await tx
        .insert(managerLimits)
        .values({ managerId: deal.responsibleManagerId, usageDate, usedCount: 0 })
        .onConflictDoNothing();

      const [managerLimit] = await tx
        .select()
        .from(managerLimits)
        .where(
          and(
            eq(managerLimits.managerId, deal.responsibleManagerId),
            eq(managerLimits.usageDate, usageDate),
          ),
        )
        .limit(1)
        .for('update');

      if (managerLimit && managerLimit.usedCount >= managerLimit.dailyLimit) {
        return {
          blocked: SendBlockReason.MANAGER_LIMIT_REACHED,
          retryAt: nextSendWindowStart(
            new Date(now.getTime() + 24 * 3600 * 1000),
            window,
            timeZone,
          ),
          contactId: contact.id,
        } as const;
      }
    }

    const [template] = await tx
      .select({
        versionId: templateVersions.id,
        body: templateVersions.body,
        requiredVariables: templateVersions.requiredVariables,
        fallbacks: templateVersions.fallbacks,
      })
      .from(templateVersions)
      .innerJoin(messageTemplates, eq(messageTemplates.id, templateVersions.templateId))
      .where(
        and(
          eq(messageTemplates.step, input.step),
          eq(messageTemplates.channelKind, channelKind),
          eq(templateVersions.isActive, true),
        ),
      )
      .limit(1);

    if (!template) throw new Error(`no active template for step ${input.step}/${channelKind}`);

    const [manager] = deal.responsibleManagerId
      ? await tx
          .select({ fullName: managers.fullName })
          .from(managers)
          .where(eq(managers.id, deal.responsibleManagerId))
          .limit(1)
      : [];

    let body: string;
    try {
      body = renderTemplate(
        template.body,
        {
          firstName: contact.firstName,
          lastName: contact.lastName,
          managerName: manager?.fullName?.split(' ')[0] ?? null,
          schoolName: contact.schoolName,
          city: contact.city,
        },
        {
          requiredVariables: template.requiredVariables,
          fallbacks: template.fallbacks,
        },
      );
    } catch (error) {
      if (!(error instanceof TemplateRenderError)) throw error;

      await tx.insert(managerTasks).values({
        dealId: deal.id,
        managerId: deal.responsibleManagerId,
        kind: 'FIX_CONTACT_DATA',
        title: `Не хватает данных для сообщения: ${error.missingVariables.join(', ')}`,
      });

      return { blocked: SendBlockReason.TEMPLATE_RENDER_FAILED, contactId: contact.id } as const;
    }

    const [message] = await tx
      .insert(messages)
      .values({
        contactId: contact.id,
        dealId: deal.id,
        channelId: channel.id,
        channelKind,
        direction: MessageDirection.OUTBOUND,
        step: input.step,
        templateVersionId: template.versionId,
        renderedBody: body,
        status: MessageStatus.SENDING,
        scheduledAt: now,
        idempotencyKey,
        correlationId: deal.correlationId,
      })
      .returning({ id: messages.id });

    if (!message) throw new Error('message insert returned no row');

    await tx
      .update(channelUsage)
      .set({ sentCount: (usage?.sentCount ?? 0) + 1, lastSentAt: now })
      .where(and(eq(channelUsage.channelId, channel.id), eq(channelUsage.usageDate, usageDate)));

    if (deal.responsibleManagerId) {
      await tx
        .update(managerLimits)
        .set({ usedCount: sql`${managerLimits.usedCount} + 1` })
        .where(
          and(
            eq(managerLimits.managerId, deal.responsibleManagerId),
            eq(managerLimits.usageDate, usageDate),
          ),
        );
    }

    await tx.insert(automationEvents).values({
      contactId: contact.id,
      dealId: deal.id,
      eventType: EventType.MESSAGE_QUEUED,
      source: 'outreach',
      correlationId: deal.correlationId,
      payload: { step: input.step, channelKind },
    });

    return {
      blocked: null,
      messageId: message.id,
      body,
      destination,
      channelKind,
      channelExternalRef: channel.externalRef,
      contactId: contact.id,
      dealId: deal.id,
      correlationId: deal.correlationId,
    } as const;
  });

  if (prepared.blocked) {
    const reason = prepared.blocked;
    const contactId = 'contactId' in prepared ? prepared.contactId : null;
    const retryAt = 'retryAt' in prepared ? prepared.retryAt : null;

    await db.insert(automationEvents).values({
      contactId,
      dealId: input.dealId,
      eventType: retryAt ? EventType.MESSAGE_RESCHEDULED : EventType.MESSAGE_CANCELLED,
      source: 'outreach',
      payload: { step: input.step, reason },
    });

    if (retryAt) return { status: 'RESCHEDULED', reason, retryAt };
    if (reason === SendBlockReason.TEMPLATE_RENDER_FAILED) return { status: 'FAILED', reason };

    return { status: 'CANCELLED', reason };
  }

  // Сеть — вне транзакции: держать блокировку сделки на время запроса нельзя.
  const provider = providers.get(prepared.channelKind);
  if (!provider) throw new Error(`no provider for channel ${prepared.channelKind}`);

  const result = await provider.send({
    messageId: prepared.messageId,
    channelKind: prepared.channelKind,
    channelExternalRef: prepared.channelExternalRef,
    destination: prepared.destination,
    body: prepared.body,
  });

  if (!result.ok) {
    await db
      .update(messages)
      .set({
        status: MessageStatus.FAILED,
        failedAt: new Date(),
        failureReason: result.errorCode ?? 'UNKNOWN',
      })
      .where(eq(messages.id, prepared.messageId));

    await db.insert(automationEvents).values({
      contactId: prepared.contactId,
      dealId: prepared.dealId,
      eventType: EventType.MESSAGE_FAILED,
      source: 'outreach',
      correlationId: prepared.correlationId,
      payload: { step: input.step, errorCode: result.errorCode },
    });

    // Транспорт просит притормозить — останавливаем канал целиком, а не одну отправку.
    if (result.retryAfterSeconds && result.errorCode === 'FLOOD_WAIT') {
      await db
        .update(channels)
        .set({ status: 'PAUSED' })
        .where(eq(channels.externalRef, prepared.channelExternalRef));
    }

    return { status: 'FAILED', reason: 'TRANSPORT_ERROR', errorCode: result.errorCode };
  }

  const sentAt = new Date();

  await db
    .update(messages)
    .set({
      status: MessageStatus.SENT,
      sentAt,
      externalMessageId: result.externalMessageId ?? null,
    })
    .where(eq(messages.id, prepared.messageId));

  const nextStage = STEP_TO_STAGE[input.step];

  await db
    .update(deals)
    .set({
      automationStep: STEP_TO_AUTOMATION_STEP[input.step],
      lastMessageAt: sentAt,
      updatedAt: sentAt,
      ...(nextStage ? { stage: nextStage } : {}),
    })
    .where(eq(deals.id, prepared.dealId));

  await db.insert(automationEvents).values({
    contactId: prepared.contactId,
    dealId: prepared.dealId,
    eventType: EventType.MESSAGE_SENT,
    source: 'outreach',
    correlationId: prepared.correlationId,
    payload: { step: input.step, externalMessageId: result.externalMessageId },
  });

  return { status: 'SENT', messageId: prepared.messageId, body: prepared.body };
}
