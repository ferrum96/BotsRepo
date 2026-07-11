import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { Member } from '../../api/client'
import { MembersTable } from './MembersTable'

const members: Member[] = [
  {
    user_id: 1,
    tg_username: 'ivan_tg',
    tg_first_name: 'Ivan',
    game_nick: 'Fireman',
    real_name: 'Артём',
    discord_nick: 'art#1',
    perspective: 'FPP',
    join_date: '2026-07-10T00:00:00+00:00',
    is_removed: false,
  },
  {
    user_id: 2,
    tg_username: 'petr_tg',
    tg_first_name: 'Petr',
    game_nick: 'Sniper',
    real_name: 'Пётр',
    discord_nick: null,
    perspective: 'TPP',
    join_date: '2001-01-01',
    is_removed: false,
  },
]

describe('MembersTable', () => {
  it('filters members by search query', () => {
    render(
      <MembersTable members={members} search="snip" onKick={vi.fn()} />,
    )

    expect(screen.getByText('Sniper')).toBeInTheDocument()
    expect(screen.queryByText('Fireman')).not.toBeInTheDocument()
  })

  it('calls onKick for the selected member', async () => {
    const user = userEvent.setup()
    const onKick = vi.fn()

    render(<MembersTable members={members} search="Fireman" onKick={onKick} />)

    await user.click(screen.getByRole('button', { name: 'Удалить из группы' }))
    expect(onKick).toHaveBeenCalledWith(1)
  })

  it('shows pending label for the kicking user', () => {
    render(
      <MembersTable
        members={members}
        search="Sniper"
        onKick={vi.fn()}
        isKicking
        kickingUserId={2}
      />,
    )

    expect(screen.getByRole('button', { name: 'Удаляю…' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Удалить из группы' })).not.toBeInTheDocument()
  })
})
