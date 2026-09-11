import { Controller, Get, Inject, Query } from '@nestjs/common';
import { desc } from 'drizzle-orm';
import { contacts, messages, type Db } from '@astrostone/db';
import { eq } from 'drizzle-orm';
import { DB } from '../../infrastructure.module';

@Controller('messages')
export class MessagesController {
  constructor(@Inject(DB) private readonly db: Db) {}

  @Get()
  list(@Query('limit') limit = '80') {
    return this.db
      .select({
        id: messages.id,
        dealId: messages.dealId,
        contactId: messages.contactId,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
        direction: messages.direction,
        status: messages.status,
        step: messages.step,
        body: messages.renderedBody,
        createdAt: messages.createdAt,
        sentAt: messages.sentAt,
      })
      .from(messages)
      .innerJoin(contacts, eq(contacts.id, messages.contactId))
      .orderBy(desc(messages.createdAt))
      .limit(Math.min(Number(limit) || 80, 300));
  }
}
