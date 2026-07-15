import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { Member } from '../api/client'
import { MembersPage } from './MembersPage'

const members: Member[] = Array.from({ length: 21 }, (_, index) => {
  const id = index + 1
  return {
    user_id: id,
    tg_username: `user${id}`,
    tg_first_name: `User${id}`,
    game_nick: `Nick${id}`,
    real_name: `Name${id}`,
    discord_nick: null,
    perspective: 'FPP',
    join_date: '2026-07-10T00:00:00+00:00',
    is_removed: false,
  }
})

vi.mock('../features/members/useMembers', () => ({
  useMembers: () => ({
    data: members,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
  useKickMember: () => ({
    mutate: vi.fn(),
    isPending: false,
    variables: undefined,
  }),
  useUpdateMember: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
}))

vi.mock('../hooks/useDebounce', () => ({
  useDebounce: <T,>(value: T) => value,
}))

describe('MembersPage', () => {
  it('shows member counter under the title', () => {
    render(<MembersPage />)

    expect(screen.getByText('Участники группы')).toBeInTheDocument()
    expect(screen.getByText('21 участник')).toBeInTheDocument()
  })
})
