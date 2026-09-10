import type { ChannelKind } from '@astrostone/contracts';

export interface OutboundMessage {
  messageId: string;
  channelKind: ChannelKind;
  channelExternalRef: string;
  /** Куда пишем: username, телефон в E.164 или email. */
  destination: string;
  body: string;
}

export interface SendResult {
  ok: boolean;
  externalMessageId?: string;
  /** Причина отказа транспорта: FLOOD_WAIT, USER_PRIVACY_RESTRICTED, NOT_REGISTERED и т.п. */
  errorCode?: string;
  errorMessage?: string;
  /** Транспорт просит притормозить канал до этого момента. */
  retryAfterSeconds?: number;
}

export interface InboundMessage {
  channelKind: ChannelKind;
  externalEventId: string;
  /** Идентификатор отправителя в терминах канала. */
  from: string;
  body: string;
  receivedAt: Date;
}

/**
 * Транспорт сообщений. Единственная реализация на MVP — шлюз внутри amoCRM
 * (docs/04-stack-adr.md, ADR-005); интерфейс нужен, чтобы замена шлюза
 * не задела бизнес-логику, и чтобы в тестах работал stub.
 */
export interface MessagingProvider {
  readonly kind: ChannelKind;
  canSend(destination: string): Promise<boolean>;
  send(message: OutboundMessage): Promise<SendResult>;
  parseInbound(payload: unknown): InboundMessage | null;
}
