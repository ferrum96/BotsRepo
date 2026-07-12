import { ChangeEvent, MouseEvent as ReactMouseEvent, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDownUp, ArrowLeft, Download, Paperclip, Pencil, Send, Trash2, X } from 'lucide-react'
import { createPortal } from 'react-dom'
import { BoardWithDetails, User } from '@/lib/types'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { formatTaskId, getPriorityBadgeColor, getPriorityLabel } from '@/lib/kanban-utils'
import { safeRandomUUID } from '@/lib/uuid'
import { RichTextEditor, renderRichText } from './RichTextEditor'
import { LabelBadge } from './LabelBadge'

type TaskDetailsPageProps = {
  board: BoardWithDetails
  taskId: string
  onBack: () => void
  onUpdateTask: (taskId: string, data: TaskDetailsUpdateInput) => Promise<void>
}

type TaskComment = {
  id: string
  body: string
  author: string
  createdAt: string
}

type TaskAttachment = {
  id: string
  name: string
  type: string
  size: number
  createdAt: string
  dataUrl: string
}

type TaskMeta = {
  comments: TaskComment[]
  attachments: TaskAttachment[]
  timeEntries: TaskTimeEntry[]
  richImages: Record<string, StoredRichImage>
}

type TaskTimeEntry = {
  id: string
  date: string
  duration: string
  minutes: number
  createdAt: string
}

type StoredRichImage = {
  id: string
  name: string
  dataUrl: string
  createdAt: string
}

type TaskDetailsUpdateInput = {
  description?: string
  columnId?: string
  priority?: string
  assignee?: string | null
  estimatedTime?: string | null
  meta?: string
}

const TASK_ATTACHMENTS_ACCEPT =
  'image/*,image/heic,image/heif,video/*,.heic,.heif,.jpg,.jpeg,.png,.gif,.webp,.bmp,.svg,.avif,.mp4,.mov,.m4v,.avi,.webm,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip,.rar,.ppt,.pptx'

const getMetaKey = (taskId: string) => `kanban-task-meta-${taskId}`
const DEFAULT_ACTUAL_DATE = () => new Date().toISOString().slice(0, 10)
const LEGACY_RICH_IMAGE_KEY = 'kanban-rich-text-images'
const EMPTY_META: TaskMeta = { comments: [], attachments: [], timeEntries: [], richImages: {} }

const safeStorageGet = (key: string) => {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

const safeStorageSet = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Ignore Safari private mode storage errors.
  }
}

const readAsDataUrl = (file: File) =>
  new Promise<string>(async (resolve) => {
    if (isHeicLikeFile(file)) {
      void convertHeicToJpegDataUrl(file).then((converted) => {
        if (converted) {
          resolve(converted)
          return
        }
        resolveByFileReader(file, resolve)
      })
      return
    }

    if (!file.type || file.type === 'application/octet-stream') {
      const fallback = await readFileAsDataUrlFallback(file)
      resolve(fallback)
      return
    }

    resolveByFileReader(file, resolve)
  })

export function TaskDetailsPage({
  board,
  taskId,
  onBack,
  onUpdateTask,
}: TaskDetailsPageProps) {
  const { user } = useAuth()
  const task = useMemo(
    () => board.columns.flatMap((column) => column.tasks).find((item) => item.id === taskId) ?? null,
    [board, taskId]
  )
  const taskColumn = useMemo(
    () => board.columns.find((column) => column.id === task?.columnId) ?? null,
    [board.columns, task?.columnId]
  )

  const [description, setDescription] = useState(task?.description ?? '')
  const [isSavingDescription, setIsSavingDescription] = useState(false)
  const [isEditingDescription, setIsEditingDescription] = useState(!(task?.description ?? '').trim())
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false)
  const [commentBody, setCommentBody] = useState('')
  const [commentAuthor, setCommentAuthor] = useState(user?.displayName || 'You')
  const [isEditingComment, setIsEditingComment] = useState(false)
  const [openStatusMenu, setOpenStatusMenu] = useState(false)
  const [openPriorityMenu, setOpenPriorityMenu] = useState(false)
  const [openAssigneeMenu, setOpenAssigneeMenu] = useState(false)
  const [assigneeQuery, setAssigneeQuery] = useState('')
  const [estimatedTimeDraft, setEstimatedTimeDraft] = useState(task?.estimatedTime ?? '')
  const [estimatedTimeError, setEstimatedTimeError] = useState('')
  const [isEditingEstimate, setIsEditingEstimate] = useState(false)
  const [savingField, setSavingField] = useState<null | 'status' | 'priority' | 'assignee' | 'estimate'>(null)
  const [meta, setMeta] = useState<TaskMeta>(EMPTY_META)
  const [attachmentError, setAttachmentError] = useState('')
  const [isAddingActualTime, setIsAddingActualTime] = useState(false)
  const [actualDurationDraft, setActualDurationDraft] = useState('')
  const [actualDateDraft, setActualDateDraft] = useState(DEFAULT_ACTUAL_DATE())
  const [actualTimeError, setActualTimeError] = useState('')
  const [previewImage, setPreviewImage] = useState<{ src: string; name: string } | null>(null)
  const [users, setUsers] = useState<User[]>([])
  const detailsPanelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (user?.displayName) setCommentAuthor(user.displayName)
  }, [user?.displayName])

  useEffect(() => {
    api.users.list()
      .then(setUsers)
      .catch((err) => console.error('Failed to fetch users:', err))
  }, [])

  useEffect(() => {
    if (!task) return
    setDescription(task.description ?? '')
    setIsEditingDescription(!(task.description ?? '').trim())
    setIsDescriptionExpanded(false)
    setEstimatedTimeDraft(task.estimatedTime ?? '')
    setIsEditingEstimate(false)
    setOpenStatusMenu(false)
    setOpenPriorityMenu(false)
    setOpenAssigneeMenu(false)
    setAssigneeQuery('')
    setEstimatedTimeError('')
    setIsAddingActualTime(false)
    setActualDurationDraft('')
    setActualDateDraft(DEFAULT_ACTUAL_DATE())
    setActualTimeError('')
  }, [task])

  useEffect(() => {
    const handleOutsideClick = (event: globalThis.MouseEvent) => {
      if (!detailsPanelRef.current) return
      const target = event.target
      if (!(target instanceof Node)) return
      const insideDropdown = target instanceof Element && Boolean(target.closest('[data-details-dropdown]'))
      const insideDetailsPanel = detailsPanelRef.current.contains(target)

      if (!insideDropdown) {
        setOpenStatusMenu(false)
        setOpenPriorityMenu(false)
        setOpenAssigneeMenu(false)
      }

      if (!insideDetailsPanel) {
        setIsEditingEstimate(false)
        setEstimatedTimeDraft(task?.estimatedTime ?? '')
      }
    }

    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [task?.estimatedTime])

  useEffect(() => {
    if (!task) return
    const serverMeta = parseTaskMeta(task.meta)
    const localMetaRaw = safeStorageGet(getMetaKey(task.id))
    const localMeta = localMetaRaw ? parseTaskMeta(localMetaRaw) : EMPTY_META
    const hasServerData = hasMetaData(serverMeta)
    const hasLocalData = hasMetaData(localMeta)

    const baseMeta = hasServerData ? serverMeta : hasLocalData ? localMeta : EMPTY_META
    const referencedImageIds = extractReferencedImageIds(task.description, baseMeta.comments)
    const legacyImages = readLegacyRichImages()
    const missingIds = referencedImageIds.filter((id) => !baseMeta.richImages[id] && legacyImages[id])

    const effectiveMeta =
      missingIds.length > 0
        ? {
            ...baseMeta,
            richImages: {
              ...baseMeta.richImages,
              ...Object.fromEntries(missingIds.map((id) => [id, legacyImages[id]])),
            },
          }
        : baseMeta

    setMeta(effectiveMeta)
    safeStorageSet(getMetaKey(task.id), JSON.stringify(effectiveMeta))

    if ((!hasServerData && hasLocalData) || missingIds.length > 0) {
      void onUpdateTask(task.id, { meta: JSON.stringify(effectiveMeta) })
    }
  }, [task?.id, task?.meta])

  const saveMeta = (next: TaskMeta) => {
    if (!task) return
    setMeta(next)
    safeStorageSet(getMetaKey(task.id), JSON.stringify(next))
    void onUpdateTask(task.id, { meta: JSON.stringify(next) })
  }

  const storeRichImage = (input: { name: string; dataUrl: string }) => {
    const id = safeRandomUUID()
    const nextMeta: TaskMeta = {
      ...meta,
      richImages: {
        ...meta.richImages,
        [id]: {
          id,
          name: input.name,
          dataUrl: input.dataUrl,
          createdAt: new Date().toISOString(),
        },
      },
    }
    saveMeta(nextMeta)
    return id
  }

  const handleSaveDescription = async () => {
    if (!task) return
    setIsSavingDescription(true)
    try {
      await onUpdateTask(task.id, { description })
      setIsEditingDescription(false)
    } finally {
      setIsSavingDescription(false)
    }
  }

  const handleAddComment = () => {
    if (!task || !commentBody.trim()) return
    const nextComment: TaskComment = {
      id: safeRandomUUID(),
      body: commentBody.trim(),
      author: commentAuthor.trim() || 'You',
      createdAt: new Date().toISOString(),
    }
    saveMeta({
      ...meta,
      comments: [nextComment, ...meta.comments],
    })
    setCommentBody('')
    setIsEditingComment(false)
  }

  const updateTaskField = async (
    field: 'status' | 'priority' | 'assignee' | 'estimate',
    data: TaskDetailsUpdateInput
  ) => {
    if (!task) return
    setSavingField(field)
    try {
      await onUpdateTask(task.id, data)
    } finally {
      setSavingField(null)
    }
  }

  const handleAttachFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    if (!task || !event.target.files?.length) return
    setAttachmentError('')

    const files = Array.from(event.target.files)
    const failedFiles: Array<{ name: string; reason: string }> = []
    try {
      const loadedRaw = await Promise.all(
        files.map(async (file) => {
          try {
            const fileDataUrl = await readAsDataUrl(file)
            if (!fileDataUrl) {
              throw new Error('Empty data URL')
            }
            const inferredTypeFromDataUrl = inferMimeFromDataUrl(fileDataUrl)
            return {
              id: safeRandomUUID(),
              name: file.name,
              type:
                (file.type && file.type !== 'application/octet-stream'
                  ? file.type
                  : detectMimeByName(file.name) || inferredTypeFromDataUrl || 'application/octet-stream'),
              size: file.size,
              createdAt: new Date().toISOString(),
              dataUrl: fileDataUrl,
            }
          } catch (error) {
            failedFiles.push({
              name: file.name || 'unknown',
              reason: getReadableError(error),
            })
            return null
          }
        })
      )
      const loaded = loadedRaw.filter((item): item is NonNullable<typeof item> => item !== null)
      if (!loaded.length) {
        throw new Error('All files failed')
      }
      saveMeta({
        ...meta,
        attachments: [...loaded, ...meta.attachments],
      })
      if (loaded.length < files.length) {
        const first = failedFiles[0]
        const details = first ? ` (${first.name}: ${first.reason})` : ''
        setAttachmentError(`Часть файлов не удалось загрузить${details}.`)
      }
    } catch {
      setAttachmentError('Не удалось загрузить вложение. Попробуйте другой файл.')
    } finally {
      event.target.value = ''
    }
  }

  const removeAttachment = (attachmentId: string) => {
    saveMeta({
      ...meta,
      attachments: meta.attachments.filter((file) => file.id !== attachmentId),
    })
  }

  const isImageAttachment = (file: TaskAttachment) => file.type.startsWith('image/')
  const assigneeOptions = useMemo(
    () => users.map((item) => item.displayName).sort((a, b) => a.localeCompare(b, 'ru')),
    [users]
  )
  const filteredAssignees = assigneeOptions.filter((name) =>
    name.toLowerCase().includes(assigneeQuery.trim().toLowerCase())
  )

  const parseDurationInput = (value: string) => {
    const raw = value.trim().toLowerCase()
    if (!raw) {
      return { valid: true, normalized: '', totalMinutes: 0 }
    }

    const unitToMinutes: Record<string, number> = {
      w: 5 * 8 * 60,
      d: 8 * 60,
      h: 60,
      m: 1,
    }
    const tokenRegex = /(\d+)\s*([wdhm])/g
    const tokens: Array<{ amount: number; unit: string; start: number; end: number }> = []
    let match: RegExpExecArray | null

    while ((match = tokenRegex.exec(raw)) !== null) {
      tokens.push({
        amount: Number(match[1]),
        unit: match[2],
        start: match.index,
        end: match.index + match[0].length,
      })
    }

    if (!tokens.length) {
      return { valid: false, normalized: raw, totalMinutes: 0 }
    }

    const onlyAllowedSeparators = (chunk: string) => /^[\s:.,;/\\|-]*$/.test(chunk)
    let cursor = 0
    let totalMinutes = 0

    for (const token of tokens) {
      const separator = raw.slice(cursor, token.start)
      if (!onlyAllowedSeparators(separator)) {
        return { valid: false, normalized: raw, totalMinutes: 0 }
      }

      totalMinutes += token.amount * (unitToMinutes[token.unit] ?? 0)
      cursor = token.end
    }

    if (!onlyAllowedSeparators(raw.slice(cursor))) {
      return { valid: false, normalized: raw, totalMinutes: 0 }
    }

    const normalized = tokens.map((token) => `${token.amount}${token.unit}`).join(' ')
    return {
      valid: true,
      normalized,
      totalMinutes,
    }
  }

  const validateEstimate = (value: string) => {
    const parsed = parseDurationInput(value)
    return {
      valid: parsed.valid,
      normalized: parsed.normalized,
    }
  }

  const parseDurationToMinutes = (value: string) => parseDurationInput(value).totalMinutes

  const formatMinutesToDuration = (minutes: number) => {
    if (minutes <= 0) return '0m'

    const units = [
      { key: 'w', value: 5 * 8 * 60 },
      { key: 'd', value: 8 * 60 },
      { key: 'h', value: 60 },
      { key: 'm', value: 1 },
    ] as const

    let rest = minutes
    const result: string[] = []

    units.forEach(({ key, value }) => {
      const amount = Math.floor(rest / value)
      if (amount > 0) {
        result.push(`${amount}${key}`)
        rest -= amount * value
      }
    })

    return result.join(' ')
  }

  const estimatedMinutes = useMemo(
    () => parseDurationToMinutes(task?.estimatedTime ?? ''),
    [task?.estimatedTime]
  )
  const spentMinutes = useMemo(
    () => meta.timeEntries.reduce((acc, entry) => acc + entry.minutes, 0),
    [meta.timeEntries]
  )
  const spentPercent = estimatedMinutes > 0 ? Math.min(100, Math.round((spentMinutes / estimatedMinutes) * 100)) : 0
  const isOverSpent = estimatedMinutes > 0 && spentMinutes > estimatedMinutes

  const addActualTimeEntry = () => {
    const check = validateEstimate(actualDurationDraft)
    if (!check.valid) {
      setActualTimeError('Формат списания: 1w 2d 4h 30m')
      return
    }

    if (!actualDateDraft) {
      setActualTimeError('Выберите дату списания')
      return
    }

    const minutes = parseDurationToMinutes(check.normalized)
    if (minutes <= 0) {
      setActualTimeError('Укажите время больше 0m')
      return
    }

    const entry: TaskTimeEntry = {
      id: safeRandomUUID(),
      date: actualDateDraft,
      duration: check.normalized,
      minutes,
      createdAt: new Date().toISOString(),
    }

    saveMeta({
      ...meta,
      timeEntries: [entry, ...meta.timeEntries],
    })
    setActualDurationDraft('')
    setActualDateDraft(DEFAULT_ACTUAL_DATE())
    setActualTimeError('')
    setIsAddingActualTime(false)
  }

  const removeActualTimeEntry = (entryId: string) => {
    saveMeta({
      ...meta,
      timeEntries: meta.timeEntries.filter((entry) => entry.id !== entryId),
    })
  }
  const handleRichTextMediaClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    const target = event.target
    if (!(target instanceof Element)) return

    const copyButton = target.closest<HTMLButtonElement>('[data-copy-code]')
    if (copyButton) {
      event.preventDefault()
      event.stopPropagation()
      const encodedCode = copyButton.getAttribute('data-copy-code')
      if (!encodedCode) return
      const codeToCopy = safeDecodeURIComponent(encodedCode)
      if (!codeToCopy) return

      void copyToClipboard(codeToCopy).then((copied) => {
        copyButton.textContent = copied ? 'Скопировано' : 'Ошибка'
        window.setTimeout(() => {
          copyButton.textContent = 'Копировать'
        }, 1400)
      })
      return
    }

    const collapsibleCode = target.closest<HTMLElement>('[data-toggle-code]')
    if (collapsibleCode) {
      event.preventDefault()
      event.stopPropagation()
      collapsibleCode.classList.toggle('rich-text-code-expanded')
      return
    }

    if (!(target instanceof HTMLImageElement)) return
    if (!target.classList.contains('rich-text-image')) return
    setPreviewImage({
      src: target.currentSrc || target.src,
      name: target.alt || 'image',
    })
  }

  if (!task) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-sm text-gray-500">Задача не найдена</div>
      </div>
    )
  }

  return (
    <div className="flex-1 min-h-full overflow-y-auto bg-gray-50 p-3 sm:p-4 md:p-6">
      <div className="mx-auto flex min-h-full max-w-6xl flex-col">
        <div className="mb-3 flex justify-end sm:mb-4 sm:justify-start">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
          >
            <ArrowLeft size={16} />
            К доске
          </button>
        </div>

        <div className="grid flex-1 gap-3 sm:gap-4 lg:grid-cols-[1fr_300px] lg:items-stretch">
          <section className="order-2 h-full space-y-4 rounded-xl border border-gray-200 bg-white p-3 sm:p-4 md:p-6 lg:order-1">
            <div>
              <div className="mb-2 text-xs uppercase tracking-wide text-gray-400">
                {formatTaskId(task.taskNumber)}
              </div>
              <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">{task.title}</h1>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-gray-700">Описание</h2>
                {!isEditingDescription && (
                  <button
                    type="button"
                    onClick={() => setIsEditingDescription(true)}
                    className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 sm:px-3"
                  >
                    <Pencil size={12} />
                    Редактировать
                  </button>
                )}
              </div>
              <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                <div className={!isEditingDescription && !isDescriptionExpanded ? 'max-h-64 overflow-y-auto scrollbar-none pr-1' : undefined}>
                  {isEditingDescription ? (
                    <>
                      <RichTextEditor
                        value={description}
                        onChange={setDescription}
                        onStoreImage={storeRichImage}
                        minRows={8}
                        placeholder="Опиши задачу, добавь форматирование и кодовые блоки..."
                      />
                      <div className="mt-3 flex flex-wrap justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setDescription(task.description ?? '')
                            setIsEditingDescription(false)
                          }}
                          className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
                        >
                          Отменить
                        </button>
                        <button
                          type="button"
                          disabled={isSavingDescription}
                          onClick={handleSaveDescription}
                          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isSavingDescription ? 'Сохраняем...' : 'Сохранить'}
                        </button>
                      </div>
                    </>
                  ) : description.trim() ? (
                    <div
                      className="rich-text-content"
                      onClick={handleRichTextMediaClick}
                      dangerouslySetInnerHTML={{
                        __html: renderRichText(description, {
                          resolveImage: (id) => meta.richImages[id]?.dataUrl,
                        }),
                      }}
                    />
                  ) : (
                    <p className="text-sm text-gray-400">Описание пока не заполнено</p>
                  )}
                </div>
                {!isEditingDescription && description.trim() && (
                  <div className="mt-3 flex justify-center border-t border-gray-200 pt-3">
                    <button
                      type="button"
                      onClick={() => setIsDescriptionExpanded((prev) => !prev)}
                      className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100"
                    >
                      <ArrowDownUp size={12} />
                      {isDescriptionExpanded ? 'Свернуть окно' : 'Развернуть окно'}
                    </button>
                  </div>
                )}
              </div>

              <div className="mt-4">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-gray-700">Файлы задачи</h3>
                  <label className="relative inline-flex cursor-pointer items-center gap-2 overflow-hidden rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100">
                    <Paperclip size={12} />
                    Добавить файл
                    <input
                      type="file"
                      multiple
                      className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                      onChange={handleAttachFiles}
                      accept={TASK_ATTACHMENTS_ACCEPT}
                    />
                  </label>
                </div>
                {attachmentError && <p className="mb-2 text-xs text-red-500">{attachmentError}</p>}

                <div className="flex flex-wrap gap-2 sm:gap-3">
                  {meta.attachments.length === 0 ? (
                    <p className="text-xs text-gray-400">Файлы не прикреплены</p>
                  ) : (
                    meta.attachments.map((file) => (
                      <div key={file.id} className="w-[92px] rounded-lg border border-gray-200 bg-white p-1.5 sm:w-[115px] lg:w-[130px]">
                        {isImageAttachment(file) ? (
                          <button
                            type="button"
                            onClick={() =>
                              setPreviewImage({
                                src: file.dataUrl,
                                name: file.name,
                              })
                            }
                            className="group block w-full text-left"
                          >
                            <img
                              src={file.dataUrl}
                              alt={file.name}
                              className="h-14 w-full rounded-md border border-gray-200 object-cover sm:h-16 lg:h-20"
                            />
                            <span className="mt-1 block truncate text-[11px] font-medium text-gray-800 group-hover:underline sm:text-xs">
                              {file.name}
                            </span>
                          </button>
                        ) : (
                          <div>
                            <div className="truncate text-[11px] font-medium text-gray-800 sm:text-xs">{file.name}</div>
                            <div className="mt-1 text-[10px] text-gray-500 sm:text-[11px]">{Math.max(1, Math.round(file.size / 1024))} KB</div>
                          </div>
                        )}

                        <div className="mt-2 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1">
                            <a
                              href={file.dataUrl}
                              download={file.name}
                              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 text-xs text-gray-700 hover:bg-gray-100 sm:h-auto sm:w-auto sm:gap-1 sm:px-2 sm:py-1"
                            >
                              <Download size={12} />
                              <span className="hidden sm:inline">Скачать</span>
                            </a>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeAttachment(file.id)}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-red-500 hover:bg-red-50 hover:text-red-600"
                            aria-label="Удалить файл"
                            title="Удалить файл"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-gray-700">Комментарии</h2>
                {!isEditingComment && (
                  <button
                    type="button"
                    onClick={() => setIsEditingComment(true)}
                    className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                  >
                    <Pencil size={12} />
                    Новый комментарий
                  </button>
                )}
              </div>
              {isEditingComment && (
                <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                  <RichTextEditor
                    value={commentBody}
                    onChange={setCommentBody}
                    onStoreImage={storeRichImage}
                    minRows={5}
                    placeholder="Оставьте комментарий..."
                  />
                  <div className="mt-3 flex flex-wrap items-center gap-2 sm:gap-3">
                    <input
                      type="text"
                      value={commentAuthor}
                      onChange={(event) => setCommentAuthor(event.target.value)}
                      placeholder="Автор комментария"
                      className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm outline-none focus:border-blue-400 sm:w-auto sm:min-w-[200px]"
                    />
                    <button
                      type="button"
                      onClick={handleAddComment}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-black sm:w-auto"
                    >
                      <Send size={14} />
                      Сохранить комментарий
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCommentBody('')
                        setIsEditingComment(false)
                      }}
                      className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 sm:w-auto"
                    >
                      Отменить
                    </button>
                  </div>
                </div>
              )}

              <div className="mt-4 space-y-3">
                {meta.comments.length === 0 ? (
                  <p className="text-sm text-gray-400">Комментариев пока нет</p>
                ) : (
                  meta.comments.map((comment) => (
                    <article key={comment.id} className="rounded-xl border border-gray-200 bg-gray-50 p-3 sm:p-4">
                      <div className="mb-2 flex items-center justify-between gap-2 text-xs text-gray-500">
                        <span className="font-semibold text-gray-700">{comment.author}</span>
                        <span>{new Date(comment.createdAt).toLocaleString()}</span>
                      </div>
                      <div
                        className="rich-text-content"
                        onClick={handleRichTextMediaClick}
                        dangerouslySetInnerHTML={{
                          __html: renderRichText(comment.body, {
                            resolveImage: (id) => meta.richImages[id]?.dataUrl,
                          }),
                        }}
                      />
                    </article>
                  ))
                )}
              </div>
            </div>
          </section>

          <aside className="order-1 h-full space-y-4 rounded-xl border border-gray-200 bg-white p-3 sm:p-4 lg:order-2">
            <h2 className="text-sm font-semibold text-gray-700">Детали</h2>

            <div ref={detailsPanelRef} className="space-y-3 text-sm text-gray-600">
              <div className="relative flex items-center justify-between gap-3 py-1.5">
                <span>Статус</span>
                <button
                  type="button"
                  disabled={savingField === 'status'}
                  onClick={() => {
                    setOpenStatusMenu((prev) => !prev)
                    setOpenPriorityMenu(false)
                    setOpenAssigneeMenu(false)
                  }}
                  className="inline-flex cursor-pointer items-center rounded-full px-2.5 py-1 text-xs font-semibold hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
                  style={{
                    color: taskColumn?.color ?? '#111827',
                    backgroundColor: `${taskColumn?.color ?? '#6B7280'}22`,
                  }}
                >
                  {taskColumn?.title ?? '—'}
                </button>
                {openStatusMenu && (
                  <div
                    data-details-dropdown
                    className="absolute right-0 top-[calc(100%+4px)] z-20 w-[min(86vw,220px)] rounded-lg border border-gray-200 bg-white p-1 shadow-lg"
                  >
                    {board.columns.map((column) => (
                      <button
                        key={column.id}
                        type="button"
                        onClick={async () => {
                          setOpenStatusMenu(false)
                          await updateTaskField('status', { columnId: column.id })
                        }}
                        className={`block w-full cursor-pointer rounded-md px-2 py-1.5 text-left text-sm hover:bg-gray-100 ${
                          column.id === task.columnId ? 'bg-gray-100 text-gray-900' : 'text-gray-700'
                        }`}
                        style={{
                          borderLeft: `3px solid ${column.color}`,
                        }}
                      >
                        {column.title}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="relative flex items-center justify-between gap-3 py-1.5">
                <span>Приоритет</span>
                <button
                  type="button"
                  disabled={savingField === 'priority'}
                  onClick={() => {
                    setOpenPriorityMenu((prev) => !prev)
                    setOpenStatusMenu(false)
                    setOpenAssigneeMenu(false)
                  }}
                  className="inline-flex cursor-pointer items-center rounded-full px-2 py-1 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${getPriorityBadgeColor(task.priority)}`}>
                    {getPriorityLabel(task.priority)}
                  </span>
                </button>
                {openPriorityMenu && (
                  <div
                    data-details-dropdown
                    className="absolute right-0 top-[calc(100%+4px)] z-20 w-[min(86vw,220px)] rounded-lg border border-gray-200 bg-white p-1 shadow-lg"
                  >
                    {(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const).map((priority) => (
                      <button
                        key={priority}
                        type="button"
                        onClick={async () => {
                          setOpenPriorityMenu(false)
                          await updateTaskField('priority', { priority })
                        }}
                        className={`flex w-full cursor-pointer items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-gray-100 ${
                          priority === task.priority ? 'bg-gray-100 text-gray-900' : 'text-gray-700'
                        }`}
                      >
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${getPriorityBadgeColor(priority)}`}>
                          {getPriorityLabel(priority)}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="relative flex items-center justify-between gap-3 py-1.5">
                <span>Исполнитель</span>
                <button
                  type="button"
                  disabled={savingField === 'assignee'}
                  onClick={() => {
                    setOpenAssigneeMenu((prev) => !prev)
                    setOpenPriorityMenu(false)
                    setOpenStatusMenu(false)
                    setAssigneeQuery('')
                  }}
                  className="inline-flex cursor-pointer items-center rounded-md px-2 py-1 font-medium text-gray-900 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {task.assignee || 'Не назначен'}
                </button>
                {openAssigneeMenu && (
                  <div
                    data-details-dropdown
                    className="absolute right-0 top-[calc(100%+4px)] z-20 w-[min(90vw,260px)] rounded-lg border border-gray-200 bg-white p-2 shadow-lg"
                  >
                    <input
                      value={assigneeQuery}
                      onChange={(event) => setAssigneeQuery(event.target.value)}
                      placeholder="Поиск исполнителя..."
                      className="mb-2 h-9 w-full rounded-md border border-gray-200 px-2 text-sm outline-none focus:border-blue-400"
                    />
                    <button
                      type="button"
                      onClick={async () => {
                        setOpenAssigneeMenu(false)
                        await updateTaskField('assignee', { assignee: null })
                      }}
                      className={`mb-1 block w-full cursor-pointer rounded-md px-2 py-1.5 text-left text-sm hover:bg-gray-100 ${
                        !task.assignee ? 'bg-gray-100 text-gray-900' : 'text-gray-700'
                      }`}
                    >
                      Не назначен
                    </button>
                    {filteredAssignees.length > 0 ? (
                      <div className="max-h-44 overflow-y-auto">
                        {filteredAssignees.map((name) => (
                          <button
                            key={name}
                            type="button"
                            onClick={async () => {
                              setOpenAssigneeMenu(false)
                              await updateTaskField('assignee', { assignee: name })
                            }}
                            className={`block w-full cursor-pointer rounded-md px-2 py-1.5 text-left text-sm hover:bg-gray-100 ${
                              task.assignee === name ? 'bg-gray-100 text-gray-900' : 'text-gray-700'
                            }`}
                          >
                            {name}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="px-2 py-1 text-xs text-gray-400">Пользователи не найдены</p>
                    )}
                  </div>
                )}
              </div>

              <div className="py-1.5">
                <div className="flex items-center justify-between gap-3">
                  <span>Оценка</span>
                  {isEditingEstimate ? (
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <input
                        autoFocus
                        value={estimatedTimeDraft}
                        onChange={(event) => {
                          setEstimatedTimeDraft(event.target.value)
                          if (estimatedTimeError) setEstimatedTimeError('')
                        }}
                        placeholder="1w 2d 4h 30m"
                        className={`h-9 w-[130px] rounded-md border px-2 text-right text-sm text-gray-900 outline-none sm:w-36 ${
                          estimatedTimeError ? 'border-red-400 focus:border-red-500' : 'border-gray-200 focus:border-blue-400'
                        }`}
                      />
                      <button
                        type="button"
                        disabled={savingField === 'estimate'}
                        onClick={async () => {
                          const check = validateEstimate(estimatedTimeDraft)
                          if (!check.valid) {
                            setEstimatedTimeError('Допустимый формат: 1w 2d 4h 30m')
                            return
                          }
                          setEstimatedTimeError('')
                          await updateTaskField('estimate', {
                            estimatedTime: check.normalized || null,
                          })
                          setIsEditingEstimate(false)
                        }}
                        className="rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-700 hover:bg-gray-100 disabled:opacity-60"
                      >
                        OK
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEstimatedTimeDraft(task.estimatedTime ?? '')
                          setEstimatedTimeError('')
                          setIsEditingEstimate(false)
                        }}
                        className="rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-700 hover:bg-gray-100"
                      >
                        Отмена
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setIsEditingEstimate(true)}
                      className={`inline-flex cursor-pointer items-center rounded-md border px-2.5 py-1 text-sm font-medium ${
                        task.estimatedTime
                          ? 'border-gray-200 text-gray-900 hover:bg-gray-50'
                          : 'border-dashed border-gray-300 text-gray-500 hover:border-gray-400 hover:bg-gray-50'
                      }`}
                      title="Нажмите, чтобы изменить оценку"
                    >
                      {task.estimatedTime || 'Добавить оценку'}
                    </button>
                  )}
                </div>
                {isEditingEstimate && estimatedTimeError && (
                  <p className="mt-1 text-right text-xs text-red-500">{estimatedTimeError}</p>
                )}
              </div>

              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-gray-700">Фактические затраты</span>
                  <button
                    type="button"
                    onClick={() => {
                      setIsAddingActualTime((prev) => !prev)
                      setActualTimeError('')
                    }}
                    className="rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100"
                  >
                    {isAddingActualTime ? 'Скрыть' : 'Списать время'}
                  </button>
                </div>

                <div className="mb-2 h-2 w-full rounded-full bg-gray-200">
                  <div
                    className={`h-2 rounded-full ${isOverSpent ? 'bg-red-500' : 'bg-blue-500'}`}
                    style={{ width: `${spentPercent}%` }}
                  />
                </div>
                <p className="text-xs text-gray-600">
                  {formatMinutesToDuration(spentMinutes)} из {task.estimatedTime || 'без оценки'}
                  {estimatedMinutes > 0 && ` (${spentPercent}%)`}
                </p>
                {isOverSpent && <p className="mt-1 text-xs text-red-500">Превышение оценки</p>}

                {isAddingActualTime && (
                  <div className="mt-3 space-y-2 rounded-md border border-gray-200 bg-white p-2.5">
                    <div className="grid grid-cols-1 gap-2">
                      <label className="text-xs text-gray-600">
                        День списания
                        <input
                          type="date"
                          value={actualDateDraft}
                          onChange={(event) => setActualDateDraft(event.target.value)}
                          className="mt-1 h-9 w-full rounded-md border border-gray-200 px-2 text-sm text-gray-800 outline-none focus:border-blue-400"
                        />
                      </label>
                      <label className="text-xs text-gray-600">
                        Затраченное время
                        <input
                          value={actualDurationDraft}
                          onChange={(event) => {
                            setActualDurationDraft(event.target.value)
                            if (actualTimeError) setActualTimeError('')
                          }}
                          placeholder="Например: 2h 30m"
                          className={`mt-1 h-9 w-full rounded-md border px-2 text-sm text-gray-800 outline-none ${
                            actualTimeError ? 'border-red-400 focus:border-red-500' : 'border-gray-200 focus:border-blue-400'
                          }`}
                        />
                      </label>
                    </div>
                    {actualTimeError && <p className="text-xs text-red-500">{actualTimeError}</p>}
                    <div className="flex flex-wrap justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setIsAddingActualTime(false)
                          setActualTimeError('')
                        }}
                        className="rounded-md border border-gray-200 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-100"
                      >
                        Отмена
                      </button>
                      <button
                        type="button"
                        onClick={addActualTimeEntry}
                        className="rounded-md bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700"
                      >
                        Добавить
                      </button>
                    </div>
                  </div>
                )}

                <div className="mt-3 max-h-40 space-y-1 overflow-y-auto">
                  {meta.timeEntries.length === 0 ? (
                    <p className="text-xs text-gray-400">Списаний пока нет</p>
                  ) : (
                    meta.timeEntries.map((entry) => (
                      <div key={entry.id} className="flex items-center justify-between rounded-md border border-gray-200 bg-white px-2 py-1.5">
                        <div className="text-xs">
                          <div className="font-medium text-gray-800">{entry.duration}</div>
                          <div className="text-gray-500">{new Date(entry.date).toLocaleDateString()}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeActualTimeEntry(entry.id)}
                          className="inline-flex h-6 w-6 items-center justify-center rounded text-red-500 hover:bg-red-50 hover:text-red-600"
                          title="Удалить списание"
                          aria-label="Удалить списание"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {task.labels.length > 0 && (
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase text-gray-500">Labels</h3>
                <div className="flex flex-wrap gap-2">
                  {task.labels.map((item) => (
                    <LabelBadge key={item.labelId} name={item.label.name} color={item.label.color} />
                  ))}
                </div>
              </div>
            )}

          </aside>
        </div>
      </div>

      {previewImage && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/85 p-4"
          onClick={() => setPreviewImage(null)}
        >
          <button
            type="button"
            onClick={() => setPreviewImage(null)}
            className="absolute right-4 top-4 rounded-full bg-white/15 p-2 text-white hover:bg-white/25"
            aria-label="Закрыть предпросмотр"
          >
            <X size={20} />
          </button>
          <img
            src={previewImage.src}
            alt={previewImage.name}
            className="max-h-[92vh] max-w-[96vw] rounded-lg object-contain"
            onClick={(event) => event.stopPropagation()}
          />
        </div>,
        document.body
      )}
    </div>
  )
}

function safeDecodeURIComponent(value: string) {
  try {
    return decodeURIComponent(value)
  } catch {
    return null
  }
}

async function copyToClipboard(value: string) {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value)
      return true
    }
  } catch {
    // fallback below
  }

  if (typeof document === 'undefined') return false
  try {
    const textarea = document.createElement('textarea')
    textarea.value = value
    textarea.setAttribute('readonly', 'true')
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    const copied = document.execCommand('copy')
    document.body.removeChild(textarea)
    return copied
  } catch {
    return false
  }
}

function parseTaskMeta(raw: string | null | undefined): TaskMeta {
  if (!raw) return EMPTY_META
  try {
    const parsed = JSON.parse(raw) as Partial<TaskMeta>
    return {
      comments: Array.isArray(parsed.comments) ? parsed.comments : [],
      attachments: Array.isArray(parsed.attachments) ? parsed.attachments : [],
      timeEntries: Array.isArray(parsed.timeEntries) ? parsed.timeEntries : [],
      richImages: parsed.richImages && typeof parsed.richImages === 'object'
        ? parsed.richImages as Record<string, StoredRichImage>
        : {},
    }
  } catch {
    return EMPTY_META
  }
}

function hasMetaData(meta: TaskMeta) {
  return (
    meta.comments.length > 0 ||
    meta.attachments.length > 0 ||
    meta.timeEntries.length > 0 ||
    Object.keys(meta.richImages).length > 0
  )
}

function extractReferencedImageIds(description: string | null, comments: TaskComment[]) {
  const content = [description ?? '', ...comments.map((comment) => comment.body)].join('\n')
  const ids = new Set<string>()
  const regex = /!\[[^\]]*]\(img:([^)]+)\)/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(content)) !== null) {
    if (match[1]) ids.add(match[1])
  }
  return Array.from(ids)
}

function readLegacyRichImages() {
  if (typeof window === 'undefined') return {} as Record<string, StoredRichImage>
  try {
    const raw = window.localStorage.getItem(LEGACY_RICH_IMAGE_KEY)
    if (!raw) return {} as Record<string, StoredRichImage>
    return JSON.parse(raw) as Record<string, StoredRichImage>
  } catch {
    return {} as Record<string, StoredRichImage>
  }
}

const MIME_BY_EXTENSION: Record<string, string> = {
  heic: 'image/heic',
  heif: 'image/heif',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
  avif: 'image/avif',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  m4v: 'video/x-m4v',
  webm: 'video/webm',
  pdf: 'application/pdf',
}

function detectMimeByName(fileName: string) {
  const lower = fileName.toLowerCase()
  const ext = lower.split('.').pop()
  if (!ext) return null
  return MIME_BY_EXTENSION[ext] ?? null
}

function resolveByFileReader(file: File, resolve: (value: string) => void) {
  const reader = new FileReader()
  reader.onload = async () => {
    const result = String(reader.result ?? '')
    if (!result || result.startsWith('data:application/octet-stream')) {
      const fallback = await readFileAsDataUrlFallback(file)
      resolve(fallback)
      return
    }
    resolve(result)
  }
  reader.onerror = async () => {
    const fallback = await readFileAsDataUrlFallback(file)
    resolve(fallback)
  }
  try {
    reader.readAsDataURL(file)
  } catch {
    void readFileAsDataUrlFallback(file)
      .then(resolve)
      .catch(() => resolve(''))
  }
}

function isHeicLikeFile(file: File) {
  const type = file.type.toLowerCase()
  if (type === 'image/heic' || type === 'image/heif') return true
  const lowerName = file.name.toLowerCase()
  return lowerName.endsWith('.heic') || lowerName.endsWith('.heif')
}

async function convertHeicToJpegDataUrl(file: File) {
  if (typeof window === 'undefined') return null

  const objectUrl = URL.createObjectURL(file)
  try {
    const image = await loadImage(objectUrl)
    const canvas = document.createElement('canvas')
    const maxSize = 2048
    const scale = Math.min(1, maxSize / Math.max(image.naturalWidth, image.naturalHeight))
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))

    const context = canvas.getContext('2d')
    if (!context) return null
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', 0.9)
  } catch {
    return null
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Failed to load image'))
    image.src = src
  })
}

async function readFileAsDataUrlFallback(file: File) {
  const rendered = await renderImageFileToDataUrl(file)
  if (rendered) return rendered

  try {
    const buffer = await readArrayBufferSafely(file)
    const bytes = new Uint8Array(buffer)
    const mime = resolvePreferredMime(file, bytes)
    const blobUrl = await readBlobAsDataUrl(new Blob([buffer], { type: mime || undefined }))
    if (blobUrl) return blobUrl
    return bytesToDataUrl(bytes, mime)
  } catch {
    const objectUrl = URL.createObjectURL(file)
    try {
      const response = await fetch(objectUrl)
      const blob = await response.blob()
      const fileReaderUrl = await readBlobAsDataUrl(blob)
      if (fileReaderUrl) return fileReaderUrl
    } catch {
      // keep fallback below
    } finally {
      URL.revokeObjectURL(objectUrl)
    }
    throw new Error('Failed to read file as data URL')
  }
}

function resolvePreferredMime(file: File, bytes: Uint8Array) {
  if (file.type && file.type !== 'application/octet-stream') return file.type
  return detectMimeByName(file.name) || detectMimeBySignature(bytes) || 'application/octet-stream'
}

function inferMimeFromDataUrl(dataUrl: string) {
  const match = /^data:([^;,]+)[;,]/.exec(dataUrl)
  return match?.[1] ?? null
}

function readBlobAsDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Blob reader failed'))
    try {
      reader.readAsDataURL(blob)
    } catch {
      reject(new Error('Blob reader readAsDataURL failed'))
    }
  })
}

function readBlobAsArrayBuffer(blob: Blob) {
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.onerror = () => reject(new Error('Blob reader arrayBuffer failed'))
    try {
      reader.readAsArrayBuffer(blob)
    } catch {
      reject(new Error('Blob reader readAsArrayBuffer failed'))
    }
  })
}

async function readArrayBufferSafely(file: File) {
  try {
    return await file.arrayBuffer()
  } catch {
    // fallback below
  }
  try {
    return await readBlobAsArrayBuffer(file)
  } catch {
    // fallback below
  }

  const objectUrl = URL.createObjectURL(file)
  try {
    const response = await fetch(objectUrl)
    return await response.arrayBuffer()
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

function bytesToDataUrl(bytes: Uint8Array, mime: string) {
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize)
    binary += String.fromCharCode(...chunk)
  }
  const base64 = btoa(binary)
  return `data:${mime};base64,${base64}`
}

async function renderImageFileToDataUrl(file: File) {
  if (typeof window === 'undefined') return null
  const objectUrl = URL.createObjectURL(file)
  try {
    const image = await loadImage(objectUrl)
    const canvas = document.createElement('canvas')
    const maxSize = 4096
    const scale = Math.min(1, maxSize / Math.max(image.naturalWidth, image.naturalHeight))
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
    const context = canvas.getContext('2d')
    if (!context) return null
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    const outputMime = resolveCanvasOutputMime(file.type)
    return canvas.toDataURL(outputMime, 0.92)
  } catch {
    return null
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

function resolveCanvasOutputMime(type: string) {
  const lower = type.toLowerCase()
  if (lower === 'image/png') return 'image/png'
  if (lower === 'image/webp') return 'image/webp'
  return 'image/jpeg'
}

function getReadableError(error: unknown) {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'string') return error
  return 'unknown error'
}

function detectMimeBySignature(bytes: Uint8Array) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'image/png'
  }
  if (
    bytes.length >= 6 &&
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38 &&
    (bytes[4] === 0x37 || bytes[4] === 0x39) &&
    bytes[5] === 0x61
  ) {
    return 'image/gif'
  }
  if (bytes.length >= 12) {
    if (
      bytes[0] === 0x52 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x46 &&
      bytes[8] === 0x57 &&
      bytes[9] === 0x45 &&
      bytes[10] === 0x42 &&
      bytes[11] === 0x50
    ) {
      return 'image/webp'
    }
  }
  if (bytes.length >= 12) {
    if (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
      const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]).toLowerCase()
      if (brand.startsWith('heic') || brand.startsWith('heix') || brand.startsWith('hevc') || brand.startsWith('hevx')) {
        return 'image/heic'
      }
      if (brand.startsWith('mif1') || brand.startsWith('heif') || brand.startsWith('msf1')) {
        return 'image/heif'
      }
      if (brand.startsWith('avif')) {
        return 'image/avif'
      }
    }
  }
  return null
}
