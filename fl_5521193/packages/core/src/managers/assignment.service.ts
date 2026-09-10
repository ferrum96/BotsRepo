import { and, asc, eq, sql } from 'drizzle-orm';
import { EventType, type ChannelKind } from '@astrostone/contracts';
import { automationEvents, channels, deals, managers, type Db } from '@astrostone/db';

export interface AssignmentResult {
  managerId: string | null;
  channelId: string | null;
  reason?: 'NO_ACTIVE_MANAGER' | 'NO_CHANNEL_FOR_KIND';
}

/**
 * Round-robin из п. 6 ТЗ с учётом канала.
 *
 * Счётчик назначений инкрементируется под блокировкой строки в той же транзакции,
 * что и сама сделка: иначе два воркера прочитают одно значение и выдадут
 * двойную порцию одному менеджеру (docs/03-architecture.md).
 */
export async function assignManager(
  db: Db,
  dealId: string,
  channelKind: ChannelKind | null,
  correlationId: string,
): Promise<AssignmentResult> {
  return db.transaction(async (tx) => {
    const candidates = channelKind
      ? await tx
          .select({
            managerId: managers.id,
            assignmentCount: managers.assignmentCount,
            channelId: channels.id,
          })
          .from(managers)
          .innerJoin(channels, eq(channels.managerId, managers.id))
          .where(
            and(
              eq(managers.isActive, true),
              eq(channels.kind, channelKind),
              eq(channels.status, 'ACTIVE'),
              eq(channels.canInitiate, true),
            ),
          )
          .orderBy(asc(managers.assignmentCount), asc(managers.createdAt))
          .limit(1)
          .for('update', { of: managers })
      : await tx
          .select({
            managerId: managers.id,
            assignmentCount: managers.assignmentCount,
            channelId: sql<string | null>`null`,
          })
          .from(managers)
          .where(eq(managers.isActive, true))
          .orderBy(asc(managers.assignmentCount), asc(managers.createdAt))
          .limit(1)
          .for('update');

    const chosen = candidates[0];
    if (!chosen) {
      return {
        managerId: null,
        channelId: null,
        reason: channelKind ? 'NO_CHANNEL_FOR_KIND' : 'NO_ACTIVE_MANAGER',
      };
    }

    await tx
      .update(managers)
      .set({ assignmentCount: chosen.assignmentCount + 1 })
      .where(eq(managers.id, chosen.managerId));

    await tx
      .update(deals)
      .set({ responsibleManagerId: chosen.managerId, updatedAt: new Date() })
      .where(eq(deals.id, dealId));

    await tx.insert(automationEvents).values({
      dealId,
      eventType: EventType.MANAGER_ASSIGNED,
      source: 'assignment',
      correlationId,
      payload: { managerId: chosen.managerId, channelId: chosen.channelId },
    });

    return { managerId: chosen.managerId, channelId: chosen.channelId ?? null };
  });
}
