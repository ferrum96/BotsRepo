import { ChangeEvent, ClipboardEvent, DragEvent, useEffect, useRef } from 'react'

type RichTextEditorProps = {
  value: string
  placeholder?: string
  minRows?: number
  onChange: (value: string) => void
  onStoreImage?: (input: { name: string; dataUrl: string }) => string
}

type FormatAction = 'bold' | 'strike' | 'size' | 'list' | 'code'
const IMAGE_STORAGE_KEY = 'kanban-rich-text-images'
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg', '.heic', '.heif', '.avif']
const IMAGE_ACCEPT =
  'image/*,image/heic,image/heif,.heic,.heif,.jpg,.jpeg,.png,.gif,.webp,.bmp,.svg,.avif'

export function RichTextEditor({
  value,
  placeholder,
  minRows = 6,
  onChange,
  onStoreImage,
}: RichTextEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const valueRef = useRef(value)

  useEffect(() => {
    valueRef.current = value
  }, [value])

  const insertAtSelection = (text: string) => {
    const textarea = textareaRef.current
    if (!textarea) return

    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const current = valueRef.current
    const next = `${current.slice(0, start)}${text}${current.slice(end)}`
    onChange(next)

    requestAnimationFrame(() => {
      textarea.focus()
      const cursor = start + text.length
      textarea.setSelectionRange(cursor, cursor)
    })
  }

  const insertImages = async (files: File[], forceInclude = false) => {
    const imageFiles = forceInclude ? files : files.filter(isLikelyImageFile)
    if (!imageFiles.length) return

    const imageMarkdown = await Promise.all(
      imageFiles.map(async (file) => {
        const dataUrl = await fileToDataUrl(file)
        if (!dataUrl) {
          throw new Error('Failed to read image')
        }
        const safeName = file.name || 'screenshot'
        const imageId = onStoreImage
          ? onStoreImage({ name: safeName, dataUrl })
          : saveStoredImage({ name: safeName, dataUrl })
        return `![${safeName}](img:${imageId})`
      })
    )
    // Keep multiple images on one text line.
    insertAtSelection(`${imageMarkdown.join(' ')} `)
  }

  const applyFormat = (action: FormatAction) => {
    const textarea = textareaRef.current
    if (!textarea) return

    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const current = valueRef.current
    const selected = current.slice(start, end)

    const wrap = (before: string, after = before) => {
      const content = selected || 'текст'
      const next = `${current.slice(0, start)}${before}${content}${after}${current.slice(end)}`
      onChange(next)
      requestAnimationFrame(() => {
        textarea.focus()
        const cursor = start + before.length + content.length + after.length
        textarea.setSelectionRange(cursor, cursor)
      })
    }

    if (action === 'bold') {
      wrap('**')
      return
    }

    if (action === 'strike') {
      wrap('~~')
      return
    }

    if (action === 'size') {
      wrap('[size=20]', '[/size]')
      return
    }

    if (action === 'code') {
      const content = selected || "const value = 'code'"
      const snippet = `\n\`\`\`\n${content}\n\`\`\`\n`
      const next = `${current.slice(0, start)}${snippet}${current.slice(end)}`
      onChange(next)
      requestAnimationFrame(() => {
        textarea.focus()
        const cursor = start + snippet.length
        textarea.setSelectionRange(cursor, cursor)
      })
      return
    }

    if (action === 'list') {
      const content = selected || 'список 1\nсписок 2'
      const listText = content
        .split('\n')
        .map((line) => (line.trim() ? `* ${line.replace(/^\*\s*/, '')}` : '* '))
        .join('\n')
      const next = `${current.slice(0, start)}${listText}${current.slice(end)}`
      onChange(next)
      requestAnimationFrame(() => {
        textarea.focus()
        const cursor = start + listText.length
        textarea.setSelectionRange(cursor, cursor)
      })
    }
  }

  const handleImagePick = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    // iOS media picker can provide empty MIME/extension for photos; still attempt image insertion.
    await insertImages(files, true)
    event.target.value = ''
  }

  const handlePaste = async (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const images = Array.from(event.clipboardData.items)
      .filter((item) => item.type.startsWith('image/'))
      .map((item) => item.getAsFile())
      .filter((file): file is File => file !== null)

    if (!images.length) return
    event.preventDefault()
    await insertImages(images)
  }

  const handleDrop = async (event: DragEvent<HTMLTextAreaElement>) => {
    const files = Array.from(event.dataTransfer.files ?? [])
    const hasImage = files.some(isLikelyImageFile)
    if (!hasImage) return

    event.preventDefault()
    await insertImages(files)
  }

  const handleDragOver = (event: DragEvent<HTMLTextAreaElement>) => {
    if (!event.dataTransfer.types.includes('Files')) return
    event.preventDefault()
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-gray-100 px-2 py-2 sm:gap-2 sm:px-3">
        <button
          type="button"
          className="editor-toolbar-btn editor-toolbar-btn-bold"
          onClick={() => applyFormat('bold')}
          title="Жирный текст"
          aria-label="Жирный текст"
        >
          B
        </button>
        <button
          type="button"
          className="editor-toolbar-btn editor-toolbar-btn-strike"
          onClick={() => applyFormat('strike')}
          title="Зачеркнутый текст"
          aria-label="Зачеркнутый текст"
        >
          S
        </button>
        <button
          type="button"
          className="editor-toolbar-btn"
          onClick={() => applyFormat('size')}
          title="Размер шрифта"
          aria-label="Размер шрифта"
        >
          Size
        </button>
        <button
          type="button"
          className="editor-toolbar-btn"
          onClick={() => applyFormat('list')}
          title="Маркированный список"
          aria-label="Маркированный список"
        >
          List
        </button>
        <button
          type="button"
          className="editor-toolbar-btn editor-toolbar-btn-code"
          onClick={() => applyFormat('code')}
          title="Кодовый блок"
          aria-label="Кодовый блок"
        >
          {'</>'}
        </button>
        <label
          className="editor-toolbar-btn relative cursor-pointer overflow-hidden"
          title="Вставить изображение"
          aria-label="Вставить изображение"
        >
          Img
          <input
            type="file"
            accept={IMAGE_ACCEPT}
            multiple
            onChange={handleImagePick}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </label>
      </div>
      <div className="editor-toolbar-help hidden border-b border-gray-100 px-3 py-1.5 text-[11px] text-gray-500 sm:block">
        B - жирный, S - зачеркнутый, Size - размер, List - список, {'</>'} - код, Img - изображение
      </div>

      <textarea
        ref={textareaRef}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        onPaste={handlePaste}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        rows={minRows}
        className="w-full resize-y rounded-b-xl border-0 bg-transparent p-3 text-sm text-gray-800 outline-none"
      />
    </div>
  )
}

function escapeHtml(text: string) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

type RichTextRenderOptions = {
  resolveImage?: (id: string) => string | undefined
}

function applyInlineFormatting(text: string, options?: RichTextRenderOptions) {
  return escapeHtml(text)
    .replace(
      /!\[([^\]]*)\]\(img:([^)]+)\)/g,
      (_match, altText, imageId) => {
        const resolvedUrl = options?.resolveImage?.(imageId) ?? getStoredImage(imageId)?.dataUrl
        if (!resolvedUrl) return `[image: ${altText || imageId}]`
        return `<img src="${resolvedUrl}" alt="${altText}" class="rich-text-image" loading="lazy" />`
      }
    )
    .replace(
      /!\[([^\]]*)\]\(encoded-image:([^)]+)\)/g,
      (_match, altText, encodedUrl) => {
        try {
          const decoded = decodeURIComponent(encodedUrl)
          if (!decoded.startsWith('data:image/')) return altText
          return `<img src="${decoded}" alt="${altText}" class="rich-text-image" loading="lazy" />`
        } catch {
          return altText
        }
      }
    )
    .replace(
      /!\[([^\]]*)\]\(([^)]+)\)/g,
      '<img src="$2" alt="$1" class="rich-text-image" loading="lazy" />'
    )
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/~~(.+?)~~/g, '<span class="line-through">$1</span>')
    .replace(/\[size=(\d+)\]([\s\S]*?)\[\/size\]/g, '<span style="font-size:$1px;">$2</span>')
}

function renderListBlock(text: string, options?: RichTextRenderOptions) {
  const lines = text.split('\n')
  let html = ''
  let inList = false

  lines.forEach((line) => {
    if (/^\s*\*\s+/.test(line)) {
      if (!inList) {
        html += '<ul class="rich-text-list">'
        inList = true
      }
      const value = line.replace(/^\s*\*\s+/, '')
      html += `<li>${applyInlineFormatting(value, options)}</li>`
      return
    }

    if (inList) {
      html += '</ul>'
      inList = false
    }

    if (line.trim()) {
      html += `<p>${applyInlineFormatting(line, options)}</p>`
    } else {
      html += '<br/>'
    }
  })

  if (inList) html += '</ul>'
  return html
}

export function renderRichText(value?: string | null, options?: RichTextRenderOptions) {
  if (!value?.trim()) return ''

  const parts = value.split(/```/)
  return parts
    .map((part, index) => {
      if (index % 2 === 1) {
        return `<pre class="rich-text-code"><code>${escapeHtml(part.trim())}</code></pre>`
      }
      return renderListBlock(part, options)
    })
    .join('')
}

function fileToDataUrl(file: File) {
  return new Promise<string>(async (resolve) => {
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

type StoredImage = {
  id: string
  name: string
  dataUrl: string
  createdAt: string
}

function readStoredImages() {
  if (typeof window === 'undefined') return {} as Record<string, StoredImage>
  try {
    const raw = window.localStorage.getItem(IMAGE_STORAGE_KEY)
    if (!raw) return {} as Record<string, StoredImage>
    return JSON.parse(raw) as Record<string, StoredImage>
  } catch {
    return {} as Record<string, StoredImage>
  }
}

function writeStoredImages(images: Record<string, StoredImage>) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(IMAGE_STORAGE_KEY, JSON.stringify(images))
}

function saveStoredImage(input: { name: string; dataUrl: string }) {
  const id = crypto.randomUUID()
  const images = readStoredImages()
  images[id] = {
    id,
    name: input.name,
    dataUrl: input.dataUrl,
    createdAt: new Date().toISOString(),
  }
  writeStoredImages(images)
  return id
}

function getStoredImage(id: string) {
  const images = readStoredImages()
  return images[id]
}

function isLikelyImageFile(file: File) {
  if (file.type?.startsWith('image/')) return true
  const lowerName = file.name.toLowerCase()
  return IMAGE_EXTENSIONS.some((ext) => lowerName.endsWith(ext))
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
}

function detectMimeByName(fileName: string) {
  const lower = fileName.toLowerCase()
  const ext = lower.split('.').pop()
  if (!ext) return null
  return MIME_BY_EXTENSION[ext] ?? null
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
