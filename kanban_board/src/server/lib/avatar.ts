export const MAX_AVATAR_LENGTH = 400_000

export type AvatarParseResult =
  | { ok: true; avatar: string | null }
  | { ok: false; error: string }

export function parseAvatarUpdate(body: unknown): AvatarParseResult {
  if (!body || typeof body !== 'object' || !('avatar' in body)) {
    return { ok: false, error: 'Передайте поле avatar' }
  }

  const avatar = (body as { avatar: unknown }).avatar
  if (avatar === null) {
    return { ok: true, avatar: null }
  }

  if (typeof avatar !== 'string' || !avatar.startsWith('data:image/')) {
    return { ok: false, error: 'Аватар должен быть изображением' }
  }

  if (avatar.length > MAX_AVATAR_LENGTH) {
    return { ok: false, error: 'Слишком большой файл. Выберите изображение поменьше' }
  }

  return { ok: true, avatar }
}
