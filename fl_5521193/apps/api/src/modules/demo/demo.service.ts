import { createReadStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { count, desc, eq, sql } from 'drizzle-orm';
import {
  AcquisitionSource,
  AcquisitionStage,
  ChannelKind,
  EventType,
  IdentifierType,
  qualificationSchema,
} from '@astrostone/contracts';
import { calculateScore, processInboundMessage } from '@astrostone/core';
import {
  automationEvents,
  contactIdentifiers,
  contacts,
  deals,
  importBatches,
  importRows,
  managerTasks,
  managers,
  messages,
  qualificationAnswers,
  scoringConfigs,
  seedReferenceData,
  type Db,
} from '@astrostone/db';
import { CONFIG, DB } from '../../infrastructure.module';
import type { AppConfig } from '../../config';
import { CRITICAL_DOC, FIXTURE_CSV, TZ_SOURCE } from '../../paths';
import { ImportsService } from '../imports/imports.service';

const REPLY_BODIES = {
  interested: 'Да, назначаю камни в консультациях. Интересно сотрудничество.',
  refuse: 'Не интересно, не пишите больше',
  later: 'Напишите через месяц',
} as const;

export type ReplyVariant = keyof typeof REPLY_BODIES;

const DEMO_QUALIFICATION = {
  practicesJyotish: true,
  conductsConsultations: true,
  prescribesStones: 'REGULARLY' as const,
  hasSupplier: false,
  monthlyConsultations: '20_50' as const,
  cooperationInterest: 'HIGH' as const,
  comment: 'Демо-анкета для показа заказчику',
};

@Injectable()
export class DemoService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(CONFIG) private readonly config: AppConfig,
    @Inject(ImportsService) private readonly imports: ImportsService,
  ) {}

  async snapshot() {
    const [
      contactCount,
      dealCount,
      sentCount,
      repliedCount,
      taskCount,
      syncedContactCount,
      syncedDealCount,
      latestBatch,
      pipeline,
      recentMessages,
      tasks,
    ] = await Promise.all([
      this.db.select({ n: count() }).from(contacts),
      this.db.select({ n: count() }).from(deals),
      this.db
        .select({ n: count() })
        .from(messages)
        .where(sql`${messages.direction} = 'OUTBOUND' and ${messages.status} in ('SENT', 'DELIVERED', 'READ')`),
      this.db.select({ n: count() }).from(deals).where(sql`${deals.lastReplyAt} is not null`),
      this.db.select({ n: count() }).from(managerTasks).where(sql`${managerTasks.completedAt} is null`),
      this.db.select({ n: count() }).from(contacts).where(sql`${contacts.amocrmContactId} is not null`),
      this.db.select({ n: count() }).from(deals).where(sql`${deals.amocrmDealId} is not null`),
      this.db.select().from(importBatches).orderBy(desc(importBatches.createdAt)).limit(1),
      this.db
        .select({
          dealId: deals.id,
          stage: deals.stage,
          automationStatus: deals.automationStatus,
          automationStep: deals.automationStep,
          score: deals.score,
          rating: deals.rating,
          scoreReasons: deals.scoreReasons,
          lastReplyAt: deals.lastReplyAt,
          lastMessageAt: deals.lastMessageAt,
          contactId: contacts.id,
          firstName: contacts.firstName,
          lastName: contacts.lastName,
          city: contacts.city,
          schoolName: contacts.schoolName,
          preferredChannel: contacts.preferredChannel,
          eligibility: contacts.automationEligibility,
          telegram: contacts.telegramUsernameRaw,
          managerName: managers.fullName,
          amocrmContactId: contacts.amocrmContactId,
          amocrmDealId: deals.amocrmDealId,
        })
        .from(deals)
        .innerJoin(contacts, eq(contacts.id, deals.contactId))
        .leftJoin(managers, eq(managers.id, deals.responsibleManagerId))
        .orderBy(desc(deals.createdAt))
        .limit(80),
      this.db
        .select({
          id: messages.id,
          dealId: messages.dealId,
          contactId: messages.contactId,
          direction: messages.direction,
          status: messages.status,
          step: messages.step,
          body: messages.renderedBody,
          createdAt: messages.createdAt,
          sentAt: messages.sentAt,
        })
        .from(messages)
        .orderBy(desc(messages.createdAt))
        .limit(40),
      this.db
        .select({
          id: managerTasks.id,
          dealId: managerTasks.dealId,
          kind: managerTasks.kind,
          title: managerTasks.title,
          dueAt: managerTasks.dueAt,
        })
        .from(managerTasks)
        .where(sql`${managerTasks.completedAt} is null`)
        .orderBy(desc(managerTasks.createdAt))
        .limit(20),
    ]);

    const batch = latestBatch[0] ?? null;
    const rows = batch
      ? await this.db
          .select({
            rowNumber: importRows.rowNumber,
            status: importRows.status,
            errorMessage: importRows.errorMessage,
            contactId: importRows.contactId,
          })
          .from(importRows)
          .where(eq(importRows.batchId, batch.id))
          .orderBy(importRows.rowNumber)
      : [];

    return {
      demoMode: Boolean(this.config.DEMO_MODE),
      messaging: this.config.MESSAGING_PROVIDER,
      amocrm: this.config.AMOCRM_MODE,
      stats: {
        contacts: Number(contactCount[0]?.n ?? 0),
        deals: Number(dealCount[0]?.n ?? 0),
        messagesSent: Number(sentCount[0]?.n ?? 0),
        replied: Number(repliedCount[0]?.n ?? 0),
        openTasks: Number(taskCount[0]?.n ?? 0),
        amocrmContacts: Number(syncedContactCount[0]?.n ?? 0),
        amocrmDeals: Number(syncedDealCount[0]?.n ?? 0),
      },
      batch,
      rows,
      pipeline,
      recentMessages,
      tasks,
    };
  }

  async sources(): Promise<{
    tz: { filename: string; text: string };
    csv: { filename: string; text: string };
    critical: { filename: string; text: string };
  }> {
    const clean = (value: string): string =>
      value.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '').replace(/^\n+/, '');
    const [tz, csv, critical] = await Promise.all([
      readFile(TZ_SOURCE, 'utf8'),
      readFile(FIXTURE_CSV, 'utf8'),
      readFile(CRITICAL_DOC, 'utf8'),
    ]);
    return {
      tz: { filename: 'tz-source.txt', text: clean(tz) },
      csv: { filename: 'astro-base-sample.csv', text: clean(csv) },
      critical: { filename: '02-critical.md', text: clean(critical) },
    };
  }

  async reset(): Promise<void> {
    await this.db.execute(sql`
      truncate table
        messages,
        inbound_events,
        automation_events,
        audit_log,
        integration_logs,
        qualification_answers,
        manager_tasks,
        duplicate_reviews,
        contact_identifiers,
        data_provenance,
        suppression_list,
        deals,
        contacts,
        import_rows,
        import_batches,
        channel_usage,
        manager_limits,
        orders,
        referrals,
        partners
      restart identity cascade
    `);

    await this.db.update(managers).set({ assignmentCount: 0 });
    await seedReferenceData(this.db);

    try {
      await this.db.execute(sql`truncate table queue.job restart identity cascade`);
    } catch {
      // очередь ещё не создана — на первом запуске так и должно быть
    }
  }

  async runSample(): Promise<{ batchId: string }> {
    await this.reset();
    return this.imports.createBatch({
      filename: 'astro-base-sample.csv',
      stream: createReadStream(FIXTURE_CSV),
      source: AcquisitionSource.PARSING_TELEGRAM,
    });
  }

  async reply(dealId: string, variant: ReplyVariant) {
    const [deal] = await this.db.select().from(deals).where(eq(deals.id, dealId));
    if (!deal) throw new NotFoundException('Сделка не найдена');

    const identifiers = await this.db
      .select()
      .from(contactIdentifiers)
      .where(eq(contactIdentifiers.contactId, deal.contactId));

    const telegram =
      identifiers.find((row) => row.type === IdentifierType.TELEGRAM_USERNAME)?.normalizedValue ??
      identifiers.find((row) => row.type === IdentifierType.TELEGRAM_ID)?.normalizedValue;
    const phone = identifiers.find((row) => row.type === IdentifierType.PHONE)?.normalizedValue;
    const email = identifiers.find((row) => row.type === IdentifierType.EMAIL)?.normalizedValue;

    const from = telegram ? `@${telegram}` : (phone ?? email);
    if (!from) throw new NotFoundException('У контакта нет канала для ответа');

    const channelKind = telegram ? ChannelKind.TELEGRAM : phone ? ChannelKind.WHATSAPP : ChannelKind.EMAIL;

    return processInboundMessage(this.db, {
      channelKind,
      externalEventId: `demo-${dealId}-${variant}-${Date.now()}`,
      from,
      body: REPLY_BODIES[variant],
    });
  }

  async qualify(dealId: string) {
    const parsed = qualificationSchema.parse(DEMO_QUALIFICATION);
    const [deal] = await this.db.select().from(deals).where(eq(deals.id, dealId));
    if (!deal) throw new NotFoundException('Сделка не найдена');

    await this.db
      .insert(qualificationAnswers)
      .values({ dealId, ...parsed, filledAt: new Date() })
      .onConflictDoUpdate({
        target: qualificationAnswers.dealId,
        set: { ...parsed, filledAt: new Date(), updatedAt: new Date() },
      });

    await this.db.insert(automationEvents).values({
      dealId,
      contactId: deal.contactId,
      eventType: EventType.QUALIFICATION_COMPLETED,
      source: 'demo',
      correlationId: deal.correlationId,
    });

    const [config] = await this.db
      .select()
      .from(scoringConfigs)
      .where(eq(scoringConfigs.isActive, true))
      .limit(1);

    if (!config) throw new Error('Нет активной конфигурации scoring');

    const result = calculateScore(parsed, config.weights, config.thresholds, config.version);

    await this.db
      .update(deals)
      .set({
        score: result.score,
        rating: result.rating,
        scoreReasons: result.reasons,
        stage: AcquisitionStage.QUALIFIED,
        updatedAt: new Date(),
      })
      .where(eq(deals.id, dealId));

    return result;
  }
}
