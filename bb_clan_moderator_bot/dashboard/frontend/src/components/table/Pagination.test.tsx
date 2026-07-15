import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { Pagination } from './Pagination'

describe('Pagination', () => {
  it('renders nothing for a single page', () => {
    const { container } = render(
      <Pagination page={1} totalPages={1} onPageChange={vi.fn()} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('navigates between pages and disables edges', async () => {
    const user = userEvent.setup()
    const onPageChange = vi.fn()

    const { rerender } = render(
      <Pagination page={1} totalPages={3} onPageChange={onPageChange} />,
    )

    expect(screen.getByText('1 / 3')).toBeInTheDocument()
    const buttons = screen.getAllByRole('button')
    expect(buttons[0]).toBeDisabled()

    await user.click(buttons[1])
    expect(onPageChange).toHaveBeenCalledWith(2)

    rerender(<Pagination page={3} totalPages={3} onPageChange={onPageChange} />)
    expect(screen.getByText('3 / 3')).toBeInTheDocument()
    expect(screen.getAllByRole('button')[1]).toBeDisabled()
  })
})
