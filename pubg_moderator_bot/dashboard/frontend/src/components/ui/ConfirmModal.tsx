import { ReactNode } from 'react'

import { Button } from './Button'

interface ConfirmModalProps {
  open: boolean
  title?: string
  message?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  isConfirming?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmModal({
  open,
  title = 'Вы уверены?',
  message,
  confirmLabel = 'Да',
  cancelLabel = 'Нет',
  isConfirming = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="w-full max-w-md rounded-lg border border-outline-level bg-surface-1 p-5 shadow-[0_12px_48px_rgba(0,0,0,0.4)]">
        <h3 className="text-on-surface text-lg font-semibold">{title}</h3>
        {message && <p className="mt-2 text-on-surface-variant text-body-sm">{message}</p>}
        <div className="mt-5 flex justify-end gap-3">
          <Button
            variant="ghost"
            className="w-auto px-4 py-2"
            onClick={onCancel}
            disabled={isConfirming}
          >
            {cancelLabel}
          </Button>
          <Button className="w-auto px-4 py-2" onClick={onConfirm} disabled={isConfirming}>
            {isConfirming ? 'Выполняю…' : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
