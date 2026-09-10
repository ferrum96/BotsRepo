import { Controller, Get, Inject } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { Db } from '@astrostone/db';
import { DB } from '../../infrastructure.module';

interface FunnelRow {
  stage: string;
  count: number;
}

@Controller('analytics')
export class AnalyticsController {
  constructor(@Inject(DB) private readonly db: Db) {}

  /**
   * Главная воронка из п. 17 ТЗ: База → Контакт → Ответ → Квалифицирован →
   * Интерес → Подключён → Первая рекомендация → Первый клиент → Продажа.
   * Считается из журнала событий, поэтому историю можно пересчитать задним числом.
   */
  @Get('funnel')
  async funnel(): Promise<{ funnel: FunnelRow[]; conversions: Record<string, number> }> {
    const result = (await this.db.execute(sql`
      with counts as (
        select 'rows_imported' as stage,
               count(*)::int as count
        from import_rows
        where status in ('IMPORTED', 'DUPLICATE_MERGED', 'MANUAL_OUTREACH')
        union all
        select 'contacts', count(*)::int from contacts
        union all
        select 'first_touch_sent', count(distinct deal_id)::int
        from messages where direction = 'OUTBOUND' and status in ('SENT', 'DELIVERED', 'READ')
        union all
        select 'replied', count(*)::int from deals where last_reply_at is not null
        union all
        select 'qualified', count(*)::int from qualification_answers
        union all
        select 'interested', count(*)::int from deals where stage = 'INTERESTED'
        union all
        select 'connected', count(*)::int from partners
        union all
        select 'first_referral', count(*)::int from partners where first_referral_at is not null
        union all
        select 'first_sale', count(*)::int from partners where first_sale_at is not null
      )
      select stage, count from counts
    `)) as unknown as { rows: FunnelRow[] };

    const rows = result.rows ?? [];
    const byStage = new Map(rows.map((row) => [row.stage, Number(row.count)]));

    const ratio = (from: string, to: string): number => {
      const base = byStage.get(from) ?? 0;
      if (base === 0) return 0;
      return Number((((byStage.get(to) ?? 0) / base) * 100).toFixed(2));
    };

    return {
      funnel: rows.map((row) => ({ stage: row.stage, count: Number(row.count) })),
      conversions: {
        base_to_contact: ratio('rows_imported', 'contacts'),
        contact_to_reply: ratio('first_touch_sent', 'replied'),
        reply_to_qualified: ratio('replied', 'qualified'),
        qualified_to_interested: ratio('qualified', 'interested'),
        interested_to_connected: ratio('interested', 'connected'),
        connected_to_referral: ratio('connected', 'first_referral'),
      },
    };
  }

  /** Доставляемость и активность по каналам: п. 17 ТЗ, «% доставки». */
  @Get('delivery')
  async delivery() {
    const result = (await this.db.execute(sql`
      select channel_kind, status, count(*)::int as count
      from messages
      where direction = 'OUTBOUND'
      group by channel_kind, status
      order by channel_kind, status
    `)) as unknown as { rows: { channel_kind: string; status: string; count: number }[] };

    return result.rows ?? [];
  }
}
