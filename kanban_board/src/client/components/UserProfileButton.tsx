import { ChangeEvent, useRef, useState } from 'react'
import { Camera, Trash2, UserRound } from 'lucide-react'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { Button } from './ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog'

async function fileToAvatarDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const maxSize = 256
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas unavailable')
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  return canvas.toDataURL('image/jpeg', 0.85)
}

type UserProfileButtonProps = {
  showName?: boolean
  variant?: 'light' | 'dark'
}

export function UserProfileButton({ showName = true, variant = 'light' }: UserProfileButtonProps) {
  const { user, updateUser } = useAuth()
  const [open, setOpen] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  if (!user) return null

  const currentAvatar = preview ?? user.avatar
  const isDark = variant === 'dark'

  const handleOpen = () => {
    setPreview(null)
    setError(null)
    setOpen(true)
  }

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setError('Выберите файл изображения')
      return
    }

    try {
      setError(null)
      const dataUrl = await fileToAvatarDataUrl(file)
      setPreview(dataUrl)
    } catch {
      setError('Не удалось обработать изображение')
    }
  }

  const handleSave = async () => {
    if (preview === null && !user.avatar) {
      setOpen(false)
      return
    }

    setSaving(true)
    setError(null)
    try {
      const result = await api.auth.updateAvatar(preview)
      if ('error' in result) {
        setError(result.error)
        return
      }
      updateUser(result.user)
      setOpen(false)
      setPreview(null)
    } catch {
      setError('Не удалось сохранить аватар')
    } finally {
      setSaving(false)
    }
  }

  const handleRemove = async () => {
    setSaving(true)
    setError(null)
    try {
      const result = await api.auth.updateAvatar(null)
      if ('error' in result) {
        setError(result.error)
        return
      }
      updateUser(result.user)
      setPreview(null)
      setOpen(false)
    } catch {
      setError('Не удалось удалить аватар')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        title="Изменить аватар"
        className={`flex items-center gap-2 flex-shrink-0 rounded-lg transition-colors ${
          isDark ? 'hover:bg-gray-700 p-1' : 'hover:bg-gray-50 p-1'
        }`}
      >
        <div
          className={`rounded-full overflow-hidden flex items-center justify-center ${
            isDark ? 'w-8 h-8 bg-blue-600 text-white' : 'w-9 h-9 bg-blue-100 text-blue-700'
          }`}
        >
          {user.avatar ? (
            <img src={user.avatar} alt={user.displayName} className="w-full h-full object-cover" />
          ) : isDark ? (
            <span className="text-sm font-medium">{user.displayName[0]}</span>
          ) : (
            <UserRound size={18} />
          )}
        </div>
        {showName && (
          <span className={`text-sm font-medium hidden sm:inline ${isDark ? 'text-white' : 'text-gray-900'}`}>
            {user.displayName}
          </span>
        )}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Аватар профиля</DialogTitle>
            <DialogDescription>
              Загрузите фото — оно будет видно рядом с вашим именем.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col items-center gap-4 py-2">
            <div className="w-24 h-24 rounded-full overflow-hidden bg-blue-100 text-blue-700 flex items-center justify-center">
              {currentAvatar ? (
                <img src={currentAvatar} alt={user.displayName} className="w-full h-full object-cover" />
              ) : (
                <UserRound size={40} />
              )}
            </div>

            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => inputRef.current?.click()}
                disabled={saving}
              >
                <Camera size={16} className="mr-2" />
                Выбрать фото
              </Button>
              {(user.avatar || preview) && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleRemove}
                  disabled={saving}
                  title="Удалить аватар"
                >
                  <Trash2 size={16} />
                </Button>
              )}
            </div>

            {error && (
              <div className="w-full text-sm text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">
                {error}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Отмена
            </Button>
            <Button type="button" onClick={handleSave} disabled={saving || preview === null}>
              {saving ? 'Сохранение...' : 'Сохранить'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
