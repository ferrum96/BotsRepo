import { Body, Controller, Get, Inject, Param, Post, Put, Query } from '@nestjs/common';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import {
  AutomationStatus,
  EventType,
  SuppressionLevel,
  qualificationSchema,
} from '@astrostone/contracts';
import {
  automationEvents,
  deals,
  messages,
  qualificationAnswers,
  scoringConfigs,
  type Db,
} from '@astrostone/db';
import { addSuppression, calculateScore } from '@astrostone/core';
import { DB } from '../../infrastructure.module';

@Controller('deals')
export class DealsController {
  constructor(@Inject(DB) private readonly db: Db) {}

  @Get()
  list(@Query('limit') limit = '100') {
    return this.db
      .select()
      .from(deals)
      .orderBy(desc(deals.createdAt))
      .limit(Math.min(Number(limit) || 100, 500));
  }

  /** Цепочка событий по сделке: п. 19 ТЗ — «должно быть понятно, где именно сломалось». */
  @Get(':id/timeline')
  async timeline(@Param('id') id: string) {
    const [deal] = await this.db.select().from(deals).where(eq(deals.id, id));
    if (!deal) throw new NotFoundException('Сделка не найдена');

    const [events, messageList] = await Promise.all([
      this.db
        .select()
        .from(automationEvents)
        .where(eq(automationEvents.dealId, id))
        .orderBy(automationEvents.createdAt),
      this.db
        .select({
          id: messages.id,
          direction: messages.direction,
          step: messages.step,
          status: messages.status,
          renderedBody: messages.renderedBody,
          sentAt: messages.sentAt,
          deliveredAt: messages.deliveredAt,
          failureReason: messages.failureReason,
        })
        .from(messages)
        .where(eq(messages.dealId, id))
        .orderBy(messages.createdAt),
    ]);

    return { deal, events, messages: messageList };
  }

  @Get(':id/qualification')
  async getQualification(@Param('id') id: string) {
    const [answers] = await this.db
      .select()
      .from(qualificationAnswers)
      .where(eq(qualificationAnswers.dealId, id));

    return answers ?? null;
  }

  @Put(':id/qualification')
  async putQualification(@Param('id') id: string, @Body() body: unknown) {
    const parsed = qualificationSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);

    const [deal] = await this.db.select().from(deals).where(eq(deals.id, id));
    if (!deal) throw new NotFoundException('Сделка не найдена');

    await this.db
      .insert(qualificationAnswers)
      .values({ dealId: id, ...parsed.data, filledAt: new Date() })
      .onConflictDoUpdate({
        target: qualificationAnswers.dealId,
        set: { ...parsed.data, filledAt: new Date(), updatedAt: new Date() },
      });

    await this.db.insert(automationEvents).values({
      dealId: id,
      contactId: deal.contactId,
      eventType: EventType.QUALIFICATION_COMPLETED,
      source: 'api',
      correlationId: deal.correlationId,
    });

    return this.recalculateScore(id);
  }

  @Post(':id/recalculate-score')
  async recalculateScore(@Param('id') id: string) {
    const [answers] = await this.db
      .select()
      .from(qualificationAnswers)
      .where(eq(qualificationAnswers.dealId, id));

    if (!answers) throw new NotFoundException('Анкета квалификации не заполнена');

    const [config] = await this.db
      .select()
      .from(scoringConfigs)
      .where(eq(scoringConfigs.isActive, true))
      .limit(1);

    if (!config) throw new Error('Нет активной конфигурации scoring');

    const result = calculateScore(
      {
        practicesJyotish: answers.practicesJyotish,
        conductsConsultations: answers.conductsConsultations,
        prescribesStones: answers.prescribesStones as never,
        hasSupplier: answers.hasSupplier,
        monthlyConsultations: answers.monthlyConsultations as never,
        cooperationInterest: answers.cooperationInterest as never,
      },
      config.weights,
      config.thresholds,
      config.version,
    );

    await this.db
      .update(deals)
      .set({
        score: result.score,
        rating: result.rating,
        scoreReasons: result.reasons,
        updatedAt: new Date(),
      })
      .where(eq(deals.id, id));

    return result;
  }

  /** Ручная остановка автоматизации из админки (действие из п. 16 плана). */
  @Post(':id/stop-automation')
  async stop(@Param('id') id: string, @Body() body: { reason?: string; optOut?: boolean }) {
    const [deal] = await this.db.select().from(deals).where(eq(deals.id, id));
    if (!deal) throw new NotFoundException('Сделка не найдена');

    await this.db
      .update(deals)
      .set({
        automationStatus: body.optOut
          ? AutomationStatus.STOPPED_BY_OPT_OUT
          : AutomationStatus.STOPPED_BY_MANAGER,
        updatedAt: new Date(),
      })
      .where(eq(deals.id, id));

    if (body.optOut) {
      await addSuppression(this.db, {
        contactId: deal.contactId,
        level: SuppressionLevel.PERMANENT,
        reason: body.reason ?? 'Остановлено менеджером с запретом канала',
      });
    }

    await this.db.insert(automationEvents).values({
      dealId: id,
      contactId: deal.contactId,
      eventType: EventType.AUTOMATION_STOPPED,
      source: 'api',
      payload: { reason: body.reason ?? null, optOut: Boolean(body.optOut) },
    });

    return { status: 'stopped' };
  }

  @Post(':id/resume-automation')
  async resume(@Param('id') id: string) {
    const [deal] = await this.db.select().from(deals).where(eq(deals.id, id));
    if (!deal) throw new NotFoundException('Сделка не найдена');

    // Из постоянного отказа возврата нет: это необратимое решение человека.
    if (deal.automationStatus === AutomationStatus.STOPPED_BY_OPT_OUT) {
      throw new BadRequestException('Контакт отказался от переписки, возобновление запрещено');
    }

    await this.db
      .update(deals)
      .set({ automationStatus: AutomationStatus.ACTIVE, updatedAt: new Date() })
      .where(eq(deals.id, id));

    return { status: 'active' };
  }
}
