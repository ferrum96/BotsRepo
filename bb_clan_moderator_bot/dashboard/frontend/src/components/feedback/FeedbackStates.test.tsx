import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { EmptyState } from './EmptyState'
import { ErrorState } from './ErrorState'

describe('EmptyState', () => {
  it('renders default copy', () => {
    render(<EmptyState />)
    expect(screen.getByText('Ничего не найдено')).toBeInTheDocument()
    expect(
      screen.getByText('Попробуй изменить фильтры или поисковый запрос.'),
    ).toBeInTheDocument()
  })
})

describe('ErrorState', () => {
  it('renders message and retries when asked', async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()

    render(<ErrorState message="Network down" onRetry={onRetry} />)

    expect(screen.getByText('Ошибка загрузки')).toBeInTheDocument()
    expect(screen.getByText('Network down')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Повторить' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('hides retry button when callback is missing', () => {
    render(<ErrorState message="Boom" />)
    expect(screen.queryByRole('button', { name: 'Повторить' })).not.toBeInTheDocument()
  })
})
