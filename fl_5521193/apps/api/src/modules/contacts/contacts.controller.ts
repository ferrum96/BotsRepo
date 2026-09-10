import { Controller, Get, Inject, NotFoundException, Param, Query } from '@nestjs/common';
import { desc, eq, ilike, or, sql } from 'drizzle-orm';
import {
  contactIdentifiers,
  contacts,
  dataProvenance,
  deals,
  duplicateReviews,
  type Db,
} from '@astrostone/db';
import { DB } from '../../infrastructure.module';

@Controller('contacts')
export class ContactsController {
  constructor(@Inject(DB) private readonly db: Db) {}

  @Get()
  list(@Query('search') search?: string, @Query('limit') limit = '100') {
    const take = Math.min(Number(limit) || 100, 500);

    const query = this.db
      .select({
        id: contacts.id,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
        city: contacts.city,
        schoolName: contacts.schoolName,
        preferredChannel: contacts.preferredChannel,
        automationEligibility: contacts.automationEligibility,
        acquisitionSource: contacts.acquisitionSource,
        createdAt: contacts.createdAt,
      })
      .from(contacts)
      .orderBy(desc(contacts.createdAt))
      .limit(take);

    if (!search) return query;

    return query.where(
      or(
        ilike(contacts.firstName, `%${search}%`),
        ilike(contacts.lastName, `%${search}%`),
        ilike(contacts.schoolName, `%${search}%`),
      ),
    );
  }

  @Get('duplicate-reviews')
  duplicateReviews() {
    return this.db
      .select()
      .from(duplicateReviews)
      .where(eq(duplicateReviews.status, 'PENDING'))
      .orderBy(desc(duplicateReviews.createdAt))
      .limit(200);
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const [contact] = await this.db.select().from(contacts).where(eq(contacts.id, id));
    if (!contact) throw new NotFoundException('Контакт не найден');

    const [identifiers, provenance, contactDeals] = await Promise.all([
      this.db
        .select()
        .from(contactIdentifiers)
        .where(eq(contactIdentifiers.contactId, id)),
      this.db.select().from(dataProvenance).where(eq(dataProvenance.contactId, id)),
      this.db.select().from(deals).where(eq(deals.contactId, id)),
    ]);

    return { contact, identifiers, provenance, deals: contactDeals };
  }
}
