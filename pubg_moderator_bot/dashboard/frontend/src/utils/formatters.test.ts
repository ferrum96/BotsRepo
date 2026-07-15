import { describe, expect, it } from 'vitest'

import { formatJoinDate, formatMemberCount } from './formatters'

describe('formatJoinDate', () => {
  it('marks legacy join date', () => {
    expect(formatJoinDate('2001-01-01')).toBe('2001-01-01 · Legacy')
  })

  it('formats regular ISO dates for ru-RU locale', () => {
    const iso = '2026-07-10T12:00:00.000Z'
    expect(formatJoinDate(iso)).toBe(new Date(iso).toLocaleDateString('ru-RU'))
  })
})

describe('formatMemberCount', () => {
  it('uses russian plural forms', () => {
    expect(formatMemberCount(0)).toBe('0 участников')
    expect(formatMemberCount(1)).toBe('1 участник')
    expect(formatMemberCount(2)).toBe('2 участника')
    expect(formatMemberCount(5)).toBe('5 участников')
    expect(formatMemberCount(11)).toBe('11 участников')
    expect(formatMemberCount(21)).toBe('21 участник')
  })
})
