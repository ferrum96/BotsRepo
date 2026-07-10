import { useMemo, useState } from 'react'

import type { Member } from '../../api/client'
import { Button } from '../../components/ui/Button'
import { DataTable, Column } from '../../components/table/DataTable'
import { Pagination } from '../../components/table/Pagination'
import { formatJoinDate, perspectiveLabel } from '../../utils/formatters'
import { matchesTextQuery } from '../../utils/query'

const PAGE_SIZE = 25

interface MembersTableProps {
  members: Member[]
  search: string
  onKick: (userId: number) => void
  kickingUserId?: number
  isKicking?: boolean
}

export function MembersTable({
  members,
  search,
  onKick,
  kickingUserId,
  isKicking = false,
}: MembersTableProps) {
  const [page, setPage] = useState(1)

  const filtered = useMemo(() => {
    return members.filter(
      (m) => matchesTextQuery(search, m.game_nick, m.real_name, m.discord_nick, m.tg_username)
    )
  }, [members, search])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageSafe = Math.min(page, totalPages)
  const paged = filtered.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE)

  const columns: Column<Member>[] = [
    {
      key: 'real_name',
      header: 'Имя',
      cell: (row) => (
        <span className="inline-block max-w-[120px] truncate text-center sm:max-w-none">
          {row.real_name}
        </span>
      ),
    },
    {
      key: 'game_nick',
      header: 'Ник в игре',
      cell: (row) => (
        <div className="flex items-center justify-center gap-1 sm:gap-2">
          <span className="inline-block max-w-[120px] truncate text-center font-bold text-electric sm:max-w-none">
            {row.game_nick}
          </span>
        </div>
      ),
    },
    {
      key: 'discord_nick',
      header: 'Ник в Discord',
      headerClassName: 'hidden sm:table-cell',
      cellClassName: 'hidden sm:table-cell',
      cell: (row) => row.discord_nick || '—',
    },
    {
      key: 'perspective',
      header: 'Режим',
      cell: (row) => <span className="text-on-surface-variant">{perspectiveLabel(row.perspective)}</span>,
    },
    {
      key: 'join_date',
      header: 'Дата присоединения',
      headerClassName: 'hidden md:table-cell',
      cellClassName: 'hidden md:table-cell',
      cell: (row) => <span className="text-on-surface-variant">{formatJoinDate(row.join_date)}</span>,
    },
    {
      key: 'kick',
      header: '',
      cell: (row) => (
        <Button
          variant="ghost"
          className="w-auto px-2 py-1 text-[11px] sm:text-[12px] text-red-400 hover:text-red-300 hover:bg-red-950/30 whitespace-nowrap"
          onClick={() => onKick(row.user_id)}
          disabled={isKicking}
        >
          {isKicking && kickingUserId === row.user_id ? 'Удаляю…' : 'Удалить'}
        </Button>
      ),
    },
  ]

  return (
    <div>
      <DataTable
        columns={columns}
        data={paged}
        keyExtractor={(row) => row.user_id}
      />
      <Pagination page={pageSafe} totalPages={totalPages} onPageChange={setPage} />
    </div>
  )
}
