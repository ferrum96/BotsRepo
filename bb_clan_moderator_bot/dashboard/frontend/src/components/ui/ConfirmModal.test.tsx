import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ConfirmModal } from './ConfirmModal'

describe('ConfirmModal', () => {
  it('does not render when closed', () => {
    const { container } = render(
      <ConfirmModal open={false} onConfirm={vi.fn()} onCancel={vi.fn()} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('shows content and fires confirm/cancel', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    const onCancel = vi.fn()

    render(
      <ConfirmModal
        open
        title="Удалить?"
        message="Это необратимо"
        confirmLabel="Да"
        cancelLabel="Нет"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    )

    expect(screen.getByText('Удалить?')).toBeInTheDocument()
    expect(screen.getByText('Это необратимо')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Нет' }))
    expect(onCancel).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: 'Да' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('shows pending label and disables actions while confirming', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()

    render(
      <ConfirmModal
        open
        isConfirming
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    )

    const pending = screen.getByRole('button', { name: 'Выполняю…' })
    expect(pending).toBeDisabled()
    await user.click(pending)
    expect(onConfirm).not.toHaveBeenCalled()
  })
})
