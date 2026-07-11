import { describe, expect, it } from 'vitest'

import { formatJoinDate, isLegacyJoinDate, perspectiveLabel } from './formatters'

describe('formatJoinDate', () => {
  it('marks legacy join date', () => {
    expect(formatJoinDate('2001-01-01')).toBe('2001-01-01 · Legacy')
  })

  it('formats regular ISO dates for ru-RU locale', () => {
    const iso = '2026-07-10T12:00:00.000Z'
    expect(formatJoinDate(iso)).toBe(new Date(iso).toLocaleDateString('ru-RU'))
  })
})

describe('isLegacyJoinDate', () => {
  it('detects only the legacy sentinel', () => {
    expect(isLegacyJoinDate('2001-01-01')).toBe(true)
    expect(isLegacyJoinDate('2026-01-01')).toBe(false)
  })
})

describe('perspectiveLabel', () => {
  it('returns known labels and falls back to raw value', () => {
    expect(perspectiveLabel('FPP')).toBe('FPP')
    expect(perspectiveLabel('TPP')).toBe('TPP')
    expect(perspectiveLabel('Mixed')).toBe('Mixed')
    expect(perspectiveLabel('Other')).toBe('Other')
  })
})
