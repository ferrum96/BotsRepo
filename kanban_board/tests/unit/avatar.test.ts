import { describe, expect, it } from 'vitest'
import { MAX_AVATAR_LENGTH, parseAvatarUpdate } from '../../src/server/lib/avatar.js'

describe('parseAvatarUpdate', () => {
  it('accepts null avatar (remove)', () => {
    expect(parseAvatarUpdate({ avatar: null })).toEqual({ ok: true, avatar: null })
  })

  it('accepts data:image payload within size limit', () => {
    const avatar = `data:image/jpeg;base64,${'a'.repeat(100)}`
    expect(parseAvatarUpdate({ avatar })).toEqual({ ok: true, avatar })
  })

  it('rejects missing avatar field', () => {
    expect(parseAvatarUpdate({})).toEqual({
      ok: false,
      error: 'Передайте поле avatar',
    })
    expect(parseAvatarUpdate(null)).toEqual({
      ok: false,
      error: 'Передайте поле avatar',
    })
  })

  it('rejects non-image payloads', () => {
    expect(parseAvatarUpdate({ avatar: 'https://example.com/a.png' })).toEqual({
      ok: false,
      error: 'Аватар должен быть изображением',
    })
    expect(parseAvatarUpdate({ avatar: 123 })).toEqual({
      ok: false,
      error: 'Аватар должен быть изображением',
    })
  })

  it('rejects oversized avatar', () => {
    const avatar = `data:image/png;base64,${'x'.repeat(MAX_AVATAR_LENGTH)}`
    expect(parseAvatarUpdate({ avatar })).toEqual({
      ok: false,
      error: 'Слишком большой файл. Выберите изображение поменьше',
    })
  })
})
