import { Module } from '@nestjs/common';
import { InfrastructureModule } from './infrastructure.module';
import { HealthController } from './modules/health.controller';
import { ImportsController } from './modules/imports/imports.controller';
import { ImportsService } from './modules/imports/imports.service';
import { ContactsController } from './modules/contacts/contacts.controller';
import { DealsController } from './modules/deals/deals.controller';
import { WebhooksController } from './modules/webhooks/webhooks.controller';
import { AnalyticsController } from './modules/analytics/analytics.controller';

import { DemoController } from './modules/demo/demo.controller';
import { DemoService } from './modules/demo/demo.service';
import { MessagesController } from './modules/messages/messages.controller';

@Module({
  imports: [InfrastructureModule],
  controllers: [
    HealthController,
    ImportsController,
    ContactsController,
    DealsController,
    WebhooksController,
    AnalyticsController,
    DemoController,
    MessagesController,
  ],
  providers: [ImportsService, DemoService],
})
export class AppModule {}
