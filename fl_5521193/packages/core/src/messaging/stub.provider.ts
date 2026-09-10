import { ChannelKind } from '@astrostone/contracts';
import type { InboundMessage, MessagingProvider, OutboundMessage, SendResult } from './provider';

export interface StubSentRecord extends OutboundMessage {
  sentAt: Date;
}

/**
 * Провайдер для dev, демо и тестов: ничего не отправляет, всё складывает в памяти.
 * Позволяет прогнать сценарий целиком до подключения шлюза и оплаты каналов.
 */
export class StubMessagingProvider implements MessagingProvider {
  readonly kind: ChannelKind;
  readonly sent: StubSentRecord[] = [];

  /** Имитация отказов транспорта: destination → код ошибки. */
  private readonly failures = new Map<string, string>();

  constructor(kind: ChannelKind = ChannelKind.TELEGRAM) {
    this.kind = kind;
  }

  failFor(destination: string, errorCode: string): void {
    this.failures.set(destination, errorCode);
  }

  async canSend(destination: string): Promise<boolean> {
    return destination.length > 0;
  }

  async send(message: OutboundMessage): Promise<SendResult> {
    const failure = this.failures.get(message.destination);
    if (failure) {
      return {
        ok: false,
        errorCode: failure,
        errorMessage: `stub failure: ${failure}`,
        ...(failure === 'FLOOD_WAIT' ? { retryAfterSeconds: 3600 } : {}),
      };
    }

    this.sent.push({ ...message, sentAt: new Date() });

    return { ok: true, externalMessageId: `stub-${message.messageId}` };
  }

  parseInbound(payload: unknown): InboundMessage | null {
    if (typeof payload !== 'object' || payload === null) return null;

    const raw = payload as Record<string, unknown>;
    if (typeof raw.from !== 'string' || typeof raw.body !== 'string') return null;

    return {
      channelKind: this.kind,
      externalEventId: typeof raw.eventId === 'string' ? raw.eventId : `stub-${Date.now()}`,
      from: raw.from,
      body: raw.body,
      receivedAt: raw.receivedAt instanceof Date ? raw.receivedAt : new Date(),
    };
  }
}
