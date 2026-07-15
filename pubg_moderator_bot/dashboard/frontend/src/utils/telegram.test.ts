import { describe, expect, it } from 'vitest'

import { telegramDmUrl } from './telegram'

describe('telegramDmUrl', () => {
  it('prefers username link', () => {
    expect(telegramDmUrl(1, 'ivan_tg')).toBe('https://t.me/ivan_tg')
    expect(telegramDmUrl(1, '@ivan_tg')).toBe('https://t.me/ivan_tg')
  })

  it('falls back to tg user id deep link', () => {
    expect(telegramDmUrl(8448628043, null)).toBe('tg://user?id=8448628043')
    expect(telegramDmUrl(8448628043, '  ')).toBe('tg://user?id=8448628043')
  })
})
