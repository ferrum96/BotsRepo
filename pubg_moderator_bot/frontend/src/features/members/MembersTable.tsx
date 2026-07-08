import { useMemo, useState } from 'react'

import type { Member } from '../../api/client'
import { Badge } from '../../components/ui/Badge'
import { DataTable, Column } from '../../components/table/DataTable'
import { Pagination } from '../../components/table/Pagination'
import { formatJoinDate, perspectiveLabel, statusBadge } from '../../utils/formatters'
import { sortMembers, SortState } from '../../utils/sorters'

const PAGE_SIZE = 25

interface MembersTableProps {
  members: Member[]
  search: string
}

export function MembersTable({ members, search }: MembersTableProps) {
  const [sort, setSort] = useState<SortState>({ key: null, direction: 'asc' })
  const [page, setPage] = useState(1)

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return members
    return members.filter(
      (m) =>
        m.game_nick.toLowerCase().includes(query) ||
        m.real_name.toLowerCase().includes(query) ||
        (m.discord_nick && m.discord_nick.toLowerCase().includes(query)) ||
        (m.tg_username && m.tg_username.toLowerCase().includes(query))
    )
  }, [members, search])

  const sorted = useMemo(() => sortMembers(filtered, sort), [filtered, sort])
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const pageSafe = Math.min(page, totalPages)
  const paged = sorted.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE)

  const handleSort = (key: string) => {
    setSort((prev) => ({
      key: key as keyof Member,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
    }))
    setPage(1)
  }

  const columns: Column<Member>[] = [
    {
      key: 'game_nick',
      header: 'Ник в игре',
      sortable: true,
      cell: (row) => (
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${row.is_removed ? 'bg-red-500' : 'bg-emerald-500'}`} />
          <span className="font-bold text-electric">{row.game_nick}</span>
        </div>
      ),
    },
    {
      key: 'level',
      header: 'Уровень',
      sortable: true,
      cell: (row) => <span className="text-on-surface-variant">{row.level}</span>,
    },
    {
      key: 'perspective',
      header: 'Режим',
      sortable: true,
      cell: (row) => <span className="text-on-surface-variant">{perspectiveLabel(row.perspective)}</span>,
    },
    {
      key: 'real_name',
      header: 'Имя',
      sortable: true,
      cell: (row) => row.real_name,
    },
    {
      key: 'join_date',
      header: 'Дата присоединения',
      sortable: true,
      cell: (row) => <span className="text-on-surface-variant">{formatJoinDate(row.join_date)}</span>,
    },
    {
      key: 'is_removed',
      header: 'Удалён',
      sortable: true,
      cell: (row) => {
        const badge = statusBadge(row.is_removed)
        return <Badge className={badge.className}>{badge.text}</Badge>
      },
    },
  ]

  return (
    <div>
      <DataTable
        columns={columns}
        data={paged}
        keyExtractor={(row) => row.user_id}
        sortKey={sort.key}
        sortDirection={sort.direction}
        onSort={handleSort}
      />
      <Pagination page={pageSafe} totalPages={totalPages} onPageChange={setPage} />
    </div>
  )
}
