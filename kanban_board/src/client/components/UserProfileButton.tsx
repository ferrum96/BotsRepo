import { ChangeEvent, useCallback, useRef, useState } from 'react'
import Cropper, { Area } from 'react-easy-crop'
import 'react-easy-crop/react-easy-crop.css'
import { Camera, Check, Trash2, UserRound, X } from 'lucide-react'
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

const AVATAR_OUTPUT_SIZE = 256

async function getCroppedAvatarDataUrl(imageSrc: string, crop: Area): Promise<string> {
  const image = await loadImage(imageSrc)
  const canvas = document.createElement('canvas')
  canvas.width = AVATAR_OUTPUT_SIZE
  canvas.height = AVATAR_OUTPUT_SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas unavailable')

  ctx.drawImage(
    image,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    AVATAR_OUTPUT_SIZE,
    AVATAR_OUTPUT_SIZE
  )

  return canvas.toDataURL('image/jpeg', 0.85)
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Image load failed'))
    image.src = src
  })
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result)
      else reject(new Error('Invalid file result'))
    }
    reader.onerror = () => reject(new Error('File read failed'))
    reader.readAsDataURL(file)
  })
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
  const [cropSource, setCropSource] = useState<string | null>(null)
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const onCropComplete = useCallback((_area: Area, areaPixels: Area) => {
    setCroppedAreaPixels(areaPixels)
  }, [])

  if (!user) return null

  const currentAvatar = preview ?? user.avatar
  const isDark = variant === 'dark'
  const isCropping = Boolean(cropSource)

  const resetCropState = () => {
    setCropSource(null)
    setCrop({ x: 0, y: 0 })
    setZoom(1)
    setCroppedAreaPixels(null)
  }

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen)
    if (!nextOpen) {
      setPreview(null)
      setError(null)
      resetCropState()
    }
  }

  const handleOpen = () => {
    setPreview(null)
    setError(null)
    resetCropState()
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
      const dataUrl = await readFileAsDataUrl(file)
      setCrop({ x: 0, y: 0 })
      setZoom(1)
      setCroppedAreaPixels(null)
      setCropSource(dataUrl)
    } catch {
      setError('Не удалось обработать изображение')
    }
  }

  const handleApplyCrop = async () => {
    if (!cropSource || !croppedAreaPixels) return
    try {
      setError(null)
      const dataUrl = await getCroppedAvatarDataUrl(cropSource, croppedAreaPixels)
      setPreview(dataUrl)
      resetCropState()
    } catch {
      setError('Не удалось обрезать изображение')
    }
  }

  const handleCancelCrop = () => {
    resetCropState()
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
      resetCropState()
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
      resetCropState()
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
        className={`flex items-center gap-3 flex-shrink-0 rounded-lg transition-colors ${
          isDark ? 'hover:bg-gray-700 p-1' : 'hover:bg-gray-50 p-1'
        }`}
      >
        {showName && (
          <span className={`text-[21px] font-medium hidden sm:inline ${isDark ? 'text-white' : 'text-gray-900'}`}>
            {user.displayName}
          </span>
        )}
        <div
          className={`rounded-full overflow-hidden flex items-center justify-center ${
            isDark ? 'w-12 h-12 bg-blue-600 text-white' : 'h-[54px] w-[54px] bg-blue-100 text-blue-700'
          }`}
        >
          {user.avatar ? (
            <img src={user.avatar} alt={user.displayName} className="w-full h-full object-cover" />
          ) : isDark ? (
            <span className="text-base font-medium">{user.displayName[0]}</span>
          ) : (
            <UserRound size={27} />
          )}
        </div>
      </button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{isCropping ? 'Обрезка фото' : 'Аватар профиля'}</DialogTitle>
            <DialogDescription>
              {isCropping
                ? 'Перетащите и масштабируйте фото, затем подтвердите обрезку.'
                : 'Загрузите фото — оно будет видно рядом с вашим именем.'}
            </DialogDescription>
          </DialogHeader>

          {isCropping ? (
            <div className="flex flex-col gap-4 py-1">
              <div className="relative h-72 w-full overflow-hidden rounded-xl bg-gray-900">
                <Cropper
                  image={cropSource!}
                  crop={crop}
                  zoom={zoom}
                  aspect={1}
                  cropShape="round"
                  showGrid={false}
                  onCropChange={setCrop}
                  onZoomChange={setZoom}
                  onCropComplete={onCropComplete}
                />
              </div>
              <div className="flex items-center gap-3 px-1">
                <span className="text-xs text-gray-500 shrink-0">Масштаб</span>
                <input
                  type="range"
                  min={1}
                  max={3}
                  step={0.05}
                  value={zoom}
                  onChange={(event) => setZoom(Number(event.target.value))}
                  className="w-full accent-blue-600"
                />
              </div>
              {error && (
                <div className="w-full text-sm text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">
                  {error}
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-5 py-2">
              <div className="w-36 h-36 rounded-full overflow-hidden bg-blue-100 text-blue-700 flex items-center justify-center">
                {currentAvatar ? (
                  <img src={currentAvatar} alt={user.displayName} className="w-full h-full object-cover" />
                ) : (
                  <UserRound size={56} />
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
          )}

          <DialogFooter>
            {isCropping ? (
              <>
                <Button type="button" variant="outline" onClick={handleCancelCrop}>
                  <X size={16} className="mr-2" />
                  Отменить
                </Button>
                <Button type="button" onClick={handleApplyCrop} disabled={!croppedAreaPixels}>
                  <Check size={16} className="mr-2" />
                  Обрезать
                </Button>
              </>
            ) : (
              <>
                <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={saving}>
                  Отмена
                </Button>
                <Button type="button" onClick={handleSave} disabled={saving || preview === null}>
                  {saving ? 'Сохранение...' : 'Сохранить'}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
