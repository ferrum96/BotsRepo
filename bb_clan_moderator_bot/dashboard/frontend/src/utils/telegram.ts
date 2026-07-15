/** Build a deep link to open a Telegram private chat / profile. */
export function telegramDmUrl(
  userId: number,
  tgUsername?: string | null,
): string {
  const username = (tgUsername || '').trim().replace(/^@/, '')
  if (username) {
    return `https://t.me/${encodeURIComponent(username)}`
  }
  return `tg://user?id=${userId}`
}
