import { useMemo, useState } from 'react'

import type { Member } from '../../api/client'
import { EmptyState } from '../../components/feedback/EmptyState'
import { Button } from '../../components/ui/Button'
import { TelegramDmButton } from '../../components/ui/TelegramDmButton'
import { DataTable, Column } from '../../components/table/DataTable'
import { Pagination } from '../../components/table/Pagination'
import { formatJoinDate } from '../../utils/formatters'
import { matchesTextQuery } from '../../utils/query'

const PAGE_SIZE = 25

interface MembersTableProps {
  members: Member[]
  search: string
  onEdit: (member: Member) => void
  onKick: (userId: number) => void
  kickingUserId?: number
  isKicking?: boolean
}

export function MembersTable({
  members,
  search,
  onEdit,
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
      key: 'tg',
      header: '',
      cell: (row) => (
        <TelegramDmButton userId={row.user_id} tgUsername={row.tg_username} />
      ),
    },
    {
      key: 'real_name',
      header: 'Имя',
      headerClassName: 'hidden sm:table-cell',
      cellClassName: 'hidden sm:table-cell',
      cell: (row) => (
        <span className="inline-block max-w-[140px] truncate text-center md:max-w-none">
          {row.real_name}
        </span>
      ),
    },
    {
      key: 'game_nick',
      header: 'Ник в игре',
      cell: (row) => (
        <div className="flex flex-col items-center justify-center gap-0.5">
          <span className="inline-block max-w-[36vw] truncate text-center font-bold text-electric sm:max-w-[140px] md:max-w-none">
            {row.game_nick}
          </span>
          <span className="sm:hidden text-[11px] text-on-surface-variant max-w-[36vw] truncate">
            {row.real_name}
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
      headerClassName: 'hidden sm:table-cell',
      cellClassName: 'hidden sm:table-cell',
      cell: (row) => <span className="text-on-surface-variant">{row.perspective}</span>,
    },
    {
      key: 'join_date',
      header: 'Дата присоединения',
      headerClassName: 'hidden md:table-cell',
      cellClassName: 'hidden md:table-cell',
      cell: (row) => <span className="text-on-surface-variant">{formatJoinDate(row.join_date)}</span>,
    },
    {
      key: 'actions',
      header: '',
      cell: (row) => {
        const kicking = isKicking && kickingUserId === row.user_id
        return (
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-1 sm:gap-2">
            <Button
              variant="ghost"
              className="min-h-9 w-full sm:w-auto px-2 py-1.5 text-[12px] whitespace-nowrap"
              onClick={() => onEdit(row)}
              disabled={isKicking}
            >
              Изменить
            </Button>
            <Button
              variant="ghost"
              className="min-h-9 w-full sm:w-auto px-2 py-1.5 text-[12px] text-red-400 hover:text-red-300 hover:bg-red-950/30 whitespace-nowrap"
              onClick={() => onKick(row.user_id)}
              disabled={isKicking}
              aria-label={kicking ? 'Удаляю…' : 'Удалить из группы'}
            >
              {kicking ? (
                'Удаляю…'
              ) : (
                <>
                  <span className="sm:hidden">Удалить</span>
                  <span className="hidden sm:inline">Удалить из группы</span>
                </>
              )}
            </Button>
          </div>
        )
      },
    },
  ]

  if (filtered.length === 0) {
    return (
      <EmptyState
        title="Ничего не найдено"
        subtitle="Попробуйте другой поисковый запрос."
      />
    )
  }

  return (
    <div className="min-w-0">
      <DataTable
        columns={columns}
        data={paged}
        keyExtractor={(row) => row.user_id}
      />
      <Pagination page={pageSafe} totalPages={totalPages} onPageChange={setPage} />
    </div>
  )
}
