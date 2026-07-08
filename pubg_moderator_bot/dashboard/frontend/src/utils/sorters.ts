import type { Member } from '../api/client'

export type SortKey = keyof Member | null
export type SortDirection = 'asc' | 'desc'

export interface SortState {
  key: SortKey
  direction: SortDirection
}

export function sortMembers(
  members: Member[],
  sort: SortState
): Member[] {
  if (!sort.key) return members

  const { key, direction } = sort
  const multiplier = direction === 'asc' ? 1 : -1

  return [...members].sort((a, b) => {
    const aValue = a[key]
    const bValue = b[key]

    if (typeof aValue === 'number' && typeof bValue === 'number') {
      return (aValue - bValue) * multiplier
    }

    const aStr = String(aValue ?? '').toLowerCase()
    const bStr = String(bValue ?? '').toLowerCase()
    return aStr.localeCompare(bStr, 'ru') * multiplier
  })
}
