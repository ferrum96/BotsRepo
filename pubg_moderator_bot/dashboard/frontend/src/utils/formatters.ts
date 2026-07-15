const LEGACY_JOIN_DATE = '2001-01-01'

export function formatJoinDate(date: string): string {
  if (date === LEGACY_JOIN_DATE) {
    return `${date} · Legacy`
  }
  try {
    return new Date(date).toLocaleDateString('ru-RU')
  } catch {
    return date
  }
}

export function formatMemberCount(count: number): string {
  const mod100 = count % 100
  const mod10 = count % 10
  let word = 'участников'
  if (mod100 < 11 || mod100 > 14) {
    if (mod10 === 1) word = 'участник'
    else if (mod10 >= 2 && mod10 <= 4) word = 'участника'
  }
  return `${count} ${word}`
}
