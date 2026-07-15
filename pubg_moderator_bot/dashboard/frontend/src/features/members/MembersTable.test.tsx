import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { Member } from '../../api/client'
import { MembersTable } from './MembersTable'

const PROD_GROUP_SIZE_CAP = 100
const PAGE_SIZE = 25

function makeMembers(count: number): Member[] {
  return Array.from({ length: count }, (_, index) => {
    const id = index + 1
    return {
      user_id: id,
      tg_username: `user${id}`,
      tg_first_name: `User${id}`,
      game_nick: `Nick${id}`,
      real_name: `Name${id}`,
      discord_nick: id % 2 === 0 ? `disc${id}` : null,
      perspective: id % 2 === 0 ? 'FPP' : 'TPP',
      join_date: '2026-07-10T00:00:00+00:00',
      is_removed: false,
    }
  })
}

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
      <MembersTable members={members} search="snip" onEdit={vi.fn()} onKick={vi.fn()} />,
    )

    expect(screen.getByText('Sniper')).toBeInTheDocument()
    expect(screen.queryByText('Fireman')).not.toBeInTheDocument()
  })

  it('calls onKick for the selected member', async () => {
    const user = userEvent.setup()
    const onKick = vi.fn()

    render(
      <MembersTable members={members} search="Fireman" onEdit={vi.fn()} onKick={onKick} />,
    )

    await user.click(screen.getByRole('button', { name: 'Удалить из группы' }))
    expect(onKick).toHaveBeenCalledWith(1)
  })

  it('calls onEdit for the selected member', async () => {
    const user = userEvent.setup()
    const onEdit = vi.fn()

    render(
      <MembersTable members={members} search="Fireman" onEdit={onEdit} onKick={vi.fn()} />,
    )

    await user.click(screen.getByRole('button', { name: 'Изменить' }))
    expect(onEdit).toHaveBeenCalledWith(members[0])
  })

  it('shows pending label for the kicking user', () => {
    render(
      <MembersTable
        members={members}
        search="Sniper"
        onEdit={vi.fn()}
        onKick={vi.fn()}
        isKicking
        kickingUserId={2}
      />,
    )

    expect(screen.getByRole('button', { name: 'Удаляю…' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Удалить из группы' })).not.toBeInTheDocument()
  })

  it('paginates a prod-sized roster of 100 members', async () => {
    const user = userEvent.setup()
    const roster = makeMembers(PROD_GROUP_SIZE_CAP)
    expect(roster).toHaveLength(PROD_GROUP_SIZE_CAP)

    render(
      <MembersTable members={roster} search="" onEdit={vi.fn()} onKick={vi.fn()} />,
    )

    expect(screen.getByText('Nick1')).toBeInTheDocument()
    expect(screen.getByText(`Nick${PAGE_SIZE}`)).toBeInTheDocument()
    expect(screen.queryByText(`Nick${PAGE_SIZE + 1}`)).not.toBeInTheDocument()
    expect(screen.getByText(`1 / ${PROD_GROUP_SIZE_CAP / PAGE_SIZE}`)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /chevron_right/i }))
    expect(screen.getByText(`Nick${PAGE_SIZE + 1}`)).toBeInTheDocument()
    expect(screen.queryByText('Nick1')).not.toBeInTheDocument()
    expect(screen.getByText(`2 / ${PROD_GROUP_SIZE_CAP / PAGE_SIZE}`)).toBeInTheDocument()
  })

  it('clamps pagination when search shrinks the list', async () => {
    const user = userEvent.setup()
    const roster = makeMembers(PROD_GROUP_SIZE_CAP)

    const { rerender } = render(
      <MembersTable members={roster} search="" onEdit={vi.fn()} onKick={vi.fn()} />,
    )

    await user.click(screen.getByRole('button', { name: /chevron_right/i }))
    expect(screen.getByText('2 / 4')).toBeInTheDocument()

    rerender(
      <MembersTable members={roster} search="Nick100" onEdit={vi.fn()} onKick={vi.fn()} />,
    )

    expect(screen.getByText('Nick100')).toBeInTheDocument()
    expect(screen.queryByText(/\/ 4/)).not.toBeInTheDocument()
  })
})
