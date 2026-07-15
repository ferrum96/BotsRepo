import { describe, expect, it } from 'vitest'

import { matchesTextQuery } from './query'

describe('matchesTextQuery', () => {
  it('matches empty/whitespace query against anything', () => {
    expect(matchesTextQuery('')).toBe(true)
    expect(matchesTextQuery('   ', 'Player')).toBe(true)
  })

  it('matches case-insensitively across fields', () => {
    expect(matchesTextQuery('fire', 'Fireman', 'Артём', null)).toBe(true)
    expect(matchesTextQuery('арт', 'Fireman', 'Артём')).toBe(true)
    expect(matchesTextQuery('xyz', 'Fireman', 'Ivan')).toBe(false)
  })

  it('treats null/undefined fields as empty strings', () => {
    expect(matchesTextQuery('ivan', null, undefined, 'ivan_tg')).toBe(true)
  })
})
