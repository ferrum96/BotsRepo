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

export function isLegacyJoinDate(date: string): boolean {
  return date === LEGACY_JOIN_DATE
}

export function perspectiveLabel(value: string): string {
  const labels: Record<string, string> = {
    FPP: 'FPP',
    TPP: 'TPP',
    Mixed: 'Mixed',
  }
  return labels[value] || value
}
