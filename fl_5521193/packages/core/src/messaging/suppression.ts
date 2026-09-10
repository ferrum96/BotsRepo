import { and, eq, gt, isNull, or, sql } from 'drizzle-orm';
import { SuppressionLevel, type ChannelKind } from '@astrostone/contracts';
import { contactIdentifiers, suppressionList, type DbOrTx } from '@astrostone/db';

/**
 * Проверка suppression-list. Стоит в самом низком слое отправки, поэтому
 * обойти её из бизнес-кода нельзя (docs/03-architecture.md).
 */
export async function isSuppressed(
  db: DbOrTx,
  contactId: string,
  channelKind: ChannelKind,
  now = new Date(),
): Promise<boolean> {
  const [row] = await db
    .select({ id: suppressionList.id })
    .from(suppressionList)
    .where(
      and(
        or(
          eq(suppressionList.contactId, contactId),
          sql`${suppressionList.identifier} in (
            select ${contactIdentifiers.normalizedValue}
            from ${contactIdentifiers}
            where ${contactIdentifiers.contactId} = ${contactId}
          )`,
        ),
        or(isNull(suppressionList.channelKind), eq(suppressionList.channelKind, channelKind)),
        or(
          eq(suppressionList.level, SuppressionLevel.PERMANENT),
          gt(suppressionList.pausedUntil, now),
        ),
      ),
    )
    .limit(1);

  return row !== undefined;
}

export async function addSuppression(
  db: DbOrTx,
  input: {
    contactId: string;
    channelKind?: ChannelKind | null;
    level: (typeof SuppressionLevel)[keyof typeof SuppressionLevel];
    pausedUntil?: Date | null;
    reason: string;
    createdBy?: string | null;
  },
): Promise<void> {
  await db.insert(suppressionList).values({
    contactId: input.contactId,
    channelKind: input.channelKind ?? null,
    level: input.level,
    pausedUntil: input.pausedUntil ?? null,
    reason: input.reason,
    createdBy: input.createdBy ?? null,
  });
}
