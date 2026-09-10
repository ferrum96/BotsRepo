import { BadRequestException, Body, Controller, Headers, Inject, Param, Post } from '@nestjs/common';
import { ChannelKind } from '@astrostone/contracts';
import { processInboundMessage } from '@astrostone/core';
import type { Db } from '@astrostone/db';
import { DB } from '../../infrastructure.module';

interface InboundWebhookBody {
  eventId?: string;
  from?: string;
  body?: string;
  receivedAt?: string;
}

@Controller('webhooks')
export class WebhooksController {
  constructor(@Inject(DB) private readonly db: Db) {}

  /**
   * Входящее сообщение из мессенджер-шлюза.
   *
   * Проверка подписи включается вместе с реальным шлюзом: секрет и схема подписи
   * зависят от выбранного провайдера (docs/08-open-questions.md, вопрос 1).
   */
  @Post(':channel')
  async inbound(
    @Param('channel') channel: string,
    @Body() body: InboundWebhookBody,
    @Headers('x-signature') _signature?: string,
  ) {
    const channelKind = channel.toUpperCase() as ChannelKind;
    if (!Object.values(ChannelKind).includes(channelKind)) {
      throw new BadRequestException(`Неизвестный канал: ${channel}`);
    }

    if (!body.from || !body.body) {
      throw new BadRequestException('Обязательные поля: from, body');
    }

    const outcome = await processInboundMessage(this.db, {
      channelKind,
      externalEventId: body.eventId ?? `${channel}:${body.from}:${Date.now()}`,
      from: body.from,
      body: body.body,
      receivedAt: body.receivedAt ? new Date(body.receivedAt) : undefined,
      rawPayload: body,
    });

    return outcome;
  }
}
