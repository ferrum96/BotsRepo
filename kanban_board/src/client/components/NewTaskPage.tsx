import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react'
import { Download, Paperclip, Trash2 } from 'lucide-react'
import { BoardWithDetails, CreateTaskInput, User } from '@/lib/types'
import { api } from '@/lib/api'
import { getPriorityBadgeColor, getPriorityLabel } from '@/lib/kanban-utils'
import { safeRandomUUID } from '@/lib/uuid'
import { RichTextEditor } from './RichTextEditor'

type NewTaskPageProps = {
  board: BoardWithDetails
  onCancel: () => void
  onCreateTask: (data: CreateTaskInput) => Promise<{ id: string }>
}

type TaskAttachment = {
  id: string
  name: string
  type: string
  size: number
  createdAt: string
  dataUrl: string
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

type TaskMeta = {
  comments: []
  attachments: TaskAttachment[]
  timeEntries: TaskTimeEntry[]
  richImages: Record<string, StoredRichImage>
}

const EMPTY_META: TaskMeta = { comments: [], attachments: [], timeEntries: [], richImages: {} }
const DEFAULT_ACTUAL_DATE = () => new Date().toISOString().slice(0, 10)
const TASK_ATTACHMENTS_ACCEPT =
  'image/*,image/heic,image/heif,video/*,.heic,.heif,.jpg,.jpeg,.png,.gif,.webp,.bmp,.svg,.avif,.mp4,.mov,.m4v,.avi,.webm,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip,.rar,.ppt,.pptx'

function findBacklogColumnId(board: BoardWithDetails) {
  const backlog = board.columns.find((column) => column.title.toUpperCase() === 'BACKLOG')
  return backlog?.id || board.columns[0]?.id || ''
}

export function NewTaskPage({ board, onCancel, onCreateTask }: NewTaskPageProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [columnId, setColumnId] = useState(() => findBacklogColumnId(board))
  const [priority, setPriority] = useState<'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'>('LOW')
  const [assignee, setAssignee] = useState<string | null>(null)
  const [estimatedTime, setEstimatedTime] = useState('')
  const [estimatedTimeDraft, setEstimatedTimeDraft] = useState('')
  const [estimatedTimeError, setEstimatedTimeError] = useState('')
  const [isEditingEstimate, setIsEditingEstimate] = useState(false)
  const [meta, setMeta] = useState<TaskMeta>(EMPTY_META)
  const [attachmentError, setAttachmentError] = useState('')
  const [openStatusMenu, setOpenStatusMenu] = useState(false)
  const [openPriorityMenu, setOpenPriorityMenu] = useState(false)
  const [openAssigneeMenu, setOpenAssigneeMenu] = useState(false)
  const [assigneeQuery, setAssigneeQuery] = useState('')
  const [isAddingActualTime, setIsAddingActualTime] = useState(false)
  const [actualDurationDraft, setActualDurationDraft] = useState('')
  const [actualDateDraft, setActualDateDraft] = useState(DEFAULT_ACTUAL_DATE())
  const [actualTimeError, setActualTimeError] = useState('')
  const [saving, setSaving] = useState(false)
  const [titleError, setTitleError] = useState('')
  const [users, setUsers] = useState<User[]>([])
  const detailsPanelRef = useRef<HTMLDivElement>(null)

  const selectedColumn = useMemo(
    () => board.columns.find((column) => column.id === columnId) ?? null,
    [board.columns, columnId]
  )

  const statusColumns = useMemo(
    () =>
      board.columns.filter((column) => {
        const normalizedTitle = column.title.toUpperCase().replaceAll(/[\s_-]+/g, ' ').trim()
        return normalizedTitle !== 'IN REVIEW' && normalizedTitle !== 'DONE'
      }),
    [board.columns]
  )

  useEffect(() => {
    api.users.list()
      .then(setUsers)
      .catch((err) => console.error('Failed to fetch users:', err))
  }, [])

  const assigneeOptions = useMemo(
    () => users.map((user) => user.displayName).sort((a, b) => a.localeCompare(b, 'ru')),
    [users]
  )

  const filteredAssignees = assigneeOptions.filter((name) =>
    name.toLowerCase().includes(assigneeQuery.trim().toLowerCase())
  )

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
        setEstimatedTimeDraft(estimatedTime)
      }
    }

    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [estimatedTime])

  const storeRichImage = (input: { name: string; dataUrl: string }) => {
    const id = safeRandomUUID()
    setMeta((prev) => ({
      ...prev,
      richImages: {
        ...prev.richImages,
        [id]: {
          id,
          name: input.name,
          dataUrl: input.dataUrl,
          createdAt: new Date().toISOString(),
        },
      },
    }))
    return id
  }

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

    return {
      valid: true,
      normalized: tokens.map((token) => `${token.amount}${token.unit}`).join(' '),
      totalMinutes,
    }
  }

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

  const estimatedMinutes = parseDurationInput(estimatedTime).totalMinutes
  const spentMinutes = meta.timeEntries.reduce((acc, entry) => acc + entry.minutes, 0)
  const spentPercent = estimatedMinutes > 0 ? Math.min(100, Math.round((spentMinutes / estimatedMinutes) * 100)) : 0
  const isOverSpent = estimatedMinutes > 0 && spentMinutes > estimatedMinutes

  const handleAttachFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files?.length) return
    setAttachmentError('')
    const files = Array.from(event.target.files)

    try {
      const loaded = await Promise.all(
        files.map(
          (file) =>
            new Promise<TaskAttachment>((resolve, reject) => {
              const reader = new FileReader()
              reader.onload = () => {
                resolve({
                  id: safeRandomUUID(),
                  name: file.name,
                  type: file.type || 'application/octet-stream',
                  size: file.size,
                  createdAt: new Date().toISOString(),
                  dataUrl: String(reader.result || ''),
                })
              }
              reader.onerror = () => reject(new Error(file.name))
              reader.readAsDataURL(file)
            })
        )
      )
      setMeta((prev) => ({ ...prev, attachments: [...loaded, ...prev.attachments] }))
    } catch {
      setAttachmentError('Не удалось загрузить вложение. Попробуйте другой файл.')
    } finally {
      event.target.value = ''
    }
  }

  const addActualTimeEntry = () => {
    const check = parseDurationInput(actualDurationDraft)
    if (!check.valid) {
      setActualTimeError('Формат списания: 1w 2d 4h 30m')
      return
    }
    if (!actualDateDraft) {
      setActualTimeError('Выберите дату списания')
      return
    }
    if (check.totalMinutes <= 0) {
      setActualTimeError('Укажите время больше 0m')
      return
    }

    const entry: TaskTimeEntry = {
      id: safeRandomUUID(),
      date: actualDateDraft,
      duration: check.normalized,
      minutes: check.totalMinutes,
      createdAt: new Date().toISOString(),
    }
    setMeta((prev) => ({ ...prev, timeEntries: [entry, ...prev.timeEntries] }))
    setActualDurationDraft('')
    setActualDateDraft(DEFAULT_ACTUAL_DATE())
    setActualTimeError('')
    setIsAddingActualTime(false)
  }

  const handleSave = async () => {
    if (!title.trim()) {
      setTitleError('Введите название задачи')
      return
    }
    if (!columnId) return

    setSaving(true)
    setTitleError('')
    try {
      const hasMeta =
        meta.attachments.length > 0 ||
        meta.timeEntries.length > 0 ||
        Object.keys(meta.richImages).length > 0

      await onCreateTask({
        title: title.trim(),
        description: description.trim() || undefined,
        columnId,
        priority,
        assignee: assignee || undefined,
        estimatedTime: estimatedTime || undefined,
        ...(hasMeta ? { meta: JSON.stringify(meta) } : {}),
      })
    } finally {
      setSaving(false)
    }
  }

  const isImageAttachment = (file: TaskAttachment) => file.type.startsWith('image/')

  return (
    <div className="flex-1 min-h-full overflow-y-auto bg-gray-50 p-3 sm:p-4 md:p-6">
      <div className="mx-auto flex min-h-full max-w-6xl flex-col">
        <div className="mb-3 flex justify-end gap-2 sm:mb-4">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-60"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? 'Сохранение...' : 'Сохранить'}
          </button>
        </div>

        <div className="grid flex-1 gap-3 sm:gap-4 lg:grid-cols-[1fr_300px] lg:items-stretch">
          <section className="order-2 h-full space-y-4 rounded-xl border border-gray-200 bg-white p-3 sm:p-4 md:p-6 lg:order-1">
            <div>
              <div className="mb-2 text-xs uppercase tracking-wide text-gray-400">Новая задача</div>
              <input
                type="text"
                value={title}
                onChange={(event) => {
                  setTitle(event.target.value)
                  if (titleError) setTitleError('')
                }}
                placeholder="Название задачи"
                autoFocus
                className={`w-full rounded-lg border bg-white px-3 py-2 text-xl font-bold text-gray-900 outline-none placeholder:font-medium placeholder:text-gray-400 focus:border-blue-400 sm:text-2xl ${
                  titleError ? 'border-red-400' : 'border-gray-200'
                }`}
              />
              {titleError && <p className="mt-1 text-xs text-red-500">{titleError}</p>}
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-gray-700">Описание</h2>
              </div>
              <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                <RichTextEditor
                  value={description}
                  onChange={setDescription}
                  onStoreImage={storeRichImage}
                  minRows={8}
                  placeholder="Опиши задачу, добавь форматирование и кодовые блоки..."
                />
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
                          <div>
                            <img
                              src={file.dataUrl}
                              alt={file.name}
                              className="h-14 w-full rounded-md border border-gray-200 object-cover sm:h-16 lg:h-20"
                            />
                            <span className="mt-1 block truncate text-[11px] font-medium text-gray-800 sm:text-xs">
                              {file.name}
                            </span>
                          </div>
                        ) : (
                          <div>
                            <div className="truncate text-[11px] font-medium text-gray-800 sm:text-xs">{file.name}</div>
                            <div className="mt-1 text-[10px] text-gray-500 sm:text-[11px]">
                              {Math.max(1, Math.round(file.size / 1024))} KB
                            </div>
                          </div>
                        )}
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <a
                            href={file.dataUrl}
                            download={file.name}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 text-xs text-gray-700 hover:bg-gray-100 sm:h-auto sm:w-auto sm:gap-1 sm:px-2 sm:py-1"
                          >
                            <Download size={12} />
                            <span className="hidden sm:inline">Скачать</span>
                          </a>
                          <button
                            type="button"
                            onClick={() =>
                              setMeta((prev) => ({
                                ...prev,
                                attachments: prev.attachments.filter((item) => item.id !== file.id),
                              }))
                            }
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-red-500 hover:bg-red-50 hover:text-red-600"
                            aria-label="Удалить файл"
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
          </section>

          <aside className="order-1 h-full space-y-4 rounded-xl border border-gray-200 bg-white p-3 sm:p-4 lg:order-2">
            <h2 className="text-sm font-semibold text-gray-700">Детали</h2>

            <div ref={detailsPanelRef} className="space-y-3 text-sm text-gray-600">
              <div className="relative flex items-center justify-between gap-3 py-1.5">
                <span>Статус</span>
                <button
                  type="button"
                  onClick={() => {
                    setOpenStatusMenu((prev) => !prev)
                    setOpenPriorityMenu(false)
                    setOpenAssigneeMenu(false)
                  }}
                  className="inline-flex cursor-pointer items-center rounded-full px-2.5 py-1 text-xs font-semibold hover:shadow-sm"
                  style={{
                    color: selectedColumn?.color ?? '#111827',
                    backgroundColor: `${selectedColumn?.color ?? '#6B7280'}22`,
                  }}
                >
                  {selectedColumn?.title ?? '—'}
                </button>
                {openStatusMenu && (
                  <div
                    data-details-dropdown
                    className="absolute right-0 top-[calc(100%+4px)] z-20 w-[min(86vw,220px)] rounded-xl border border-gray-200 bg-white p-1.5 shadow-lg"
                  >
                    <div className="space-y-1">
                      {statusColumns.map((column) => (
                      <button
                        key={column.id}
                        type="button"
                        onClick={() => {
                          setColumnId(column.id)
                          setOpenStatusMenu(false)
                        }}
                        className={`block w-full cursor-pointer rounded-lg px-2.5 py-2 text-left text-sm hover:bg-gray-100 ${
                          column.id === columnId ? 'bg-gray-100 text-gray-900' : 'text-gray-700'
                        }`}
                        style={{ borderLeft: `3px solid ${column.color}` }}
                      >
                        {column.title}
                      </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="relative flex items-center justify-between gap-3 py-1.5">
                <span>Приоритет</span>
                <button
                  type="button"
                  onClick={() => {
                    setOpenPriorityMenu((prev) => !prev)
                    setOpenStatusMenu(false)
                    setOpenAssigneeMenu(false)
                  }}
                  className="inline-flex cursor-pointer items-center rounded-full px-2 py-1 hover:opacity-90"
                >
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${getPriorityBadgeColor(priority)}`}>
                    {getPriorityLabel(priority)}
                  </span>
                </button>
                {openPriorityMenu && (
                  <div
                    data-details-dropdown
                    className="absolute right-0 top-[calc(100%+4px)] z-20 w-[min(86vw,220px)] rounded-lg border border-gray-200 bg-white p-1 shadow-lg"
                  >
                    {(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const).map((value) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => {
                          setPriority(value)
                          setOpenPriorityMenu(false)
                        }}
                        className={`flex w-full cursor-pointer items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-gray-100 ${
                          value === priority ? 'bg-gray-100 text-gray-900' : 'text-gray-700'
                        }`}
                      >
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${getPriorityBadgeColor(value)}`}>
                          {getPriorityLabel(value)}
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
                  onClick={() => {
                    setOpenAssigneeMenu((prev) => !prev)
                    setOpenPriorityMenu(false)
                    setOpenStatusMenu(false)
                    setAssigneeQuery('')
                  }}
                  className="inline-flex cursor-pointer items-center rounded-md px-2 py-1 font-medium text-gray-900 hover:bg-gray-100"
                >
                  {assignee || 'Не назначен'}
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
                      onClick={() => {
                        setAssignee(null)
                        setOpenAssigneeMenu(false)
                      }}
                      className={`mb-1 block w-full cursor-pointer rounded-md px-2 py-1.5 text-left text-sm hover:bg-gray-100 ${
                        !assignee ? 'bg-gray-100 text-gray-900' : 'text-gray-700'
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
                            onClick={() => {
                              setAssignee(name)
                              setOpenAssigneeMenu(false)
                            }}
                            className={`block w-full cursor-pointer rounded-md px-2 py-1.5 text-left text-sm hover:bg-gray-100 ${
                              assignee === name ? 'bg-gray-100 text-gray-900' : 'text-gray-700'
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
                        onClick={() => {
                          const check = parseDurationInput(estimatedTimeDraft)
                          if (!check.valid) {
                            setEstimatedTimeError('Допустимый формат: 1w 2d 4h 30m')
                            return
                          }
                          setEstimatedTimeError('')
                          setEstimatedTime(check.normalized)
                          setIsEditingEstimate(false)
                        }}
                        className="rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-700 hover:bg-gray-100"
                      >
                        OK
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEstimatedTimeDraft(estimatedTime)
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
                      onClick={() => {
                        setEstimatedTimeDraft(estimatedTime)
                        setIsEditingEstimate(true)
                      }}
                      className={`inline-flex cursor-pointer items-center rounded-md border px-2.5 py-1 text-sm font-medium ${
                        estimatedTime
                          ? 'border-gray-200 text-gray-900 hover:bg-gray-50'
                          : 'border-dashed border-gray-300 text-gray-500 hover:border-gray-400 hover:bg-gray-50'
                      }`}
                    >
                      {estimatedTime || 'Добавить оценку'}
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
                  {formatMinutesToDuration(spentMinutes)} из {estimatedTime || 'без оценки'}
                  {estimatedMinutes > 0 && ` (${spentPercent}%)`}
                </p>

                {isAddingActualTime && (
                  <div className="mt-3 space-y-2 rounded-md border border-gray-200 bg-white p-2.5">
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
                      <div
                        key={entry.id}
                        className="flex items-center justify-between rounded-md border border-gray-200 bg-white px-2 py-1.5"
                      >
                        <div className="text-xs">
                          <div className="font-medium text-gray-800">{entry.duration}</div>
                          <div className="text-gray-500">{new Date(entry.date).toLocaleDateString()}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setMeta((prev) => ({
                              ...prev,
                              timeEntries: prev.timeEntries.filter((item) => item.id !== entry.id),
                            }))
                          }
                          className="inline-flex h-6 w-6 items-center justify-center rounded text-red-500 hover:bg-red-50 hover:text-red-600"
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
          </aside>
        </div>
      </div>
    </div>
  )
}
