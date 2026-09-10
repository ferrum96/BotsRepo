import { Controller, Get, Inject } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { Db } from '@astrostone/db';
import { DB } from '../infrastructure.module';

@Controller()
export class HealthController {
  constructor(@Inject(DB) private readonly db: Db) {}

  @Get('health')
  async health(): Promise<{ status: string; db: boolean }> {
    try {
      await this.db.execute(sql`select 1`);
      return { status: 'ok', db: true };
    } catch {
      return { status: 'degraded', db: false };
    }
  }
}
