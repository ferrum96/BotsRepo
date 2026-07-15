import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { Button } from './Button'

describe('Button', () => {
  it('renders children and handles clicks', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()

    render(<Button onClick={onClick}>Сохранить</Button>)

    await user.click(screen.getByRole('button', { name: 'Сохранить' }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('can be disabled', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()

    render(
      <Button disabled onClick={onClick}>
        Busy
      </Button>,
    )

    await user.click(screen.getByRole('button', { name: 'Busy' }))
    expect(onClick).not.toHaveBeenCalled()
  })
})
