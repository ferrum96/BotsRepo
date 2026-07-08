import { useState } from 'react'

import { Member } from '../api/client'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { DataTable, Column } from '../components/table/DataTable'
import { Pagination } from '../components/table/Pagination'
import { EmptyState } from '../components/feedback/EmptyState'
import { ErrorState } from '../components/feedback/ErrorState'
import { Loader } from '../components/feedback/Loader'
import { useInactive, useReactivateMember } from '../features/inactive/useInactive'
import { useDebounce } from '../hooks/useDebounce'
import { formatJoinDate, perspectiveLabel } from '../utils/formatters'

const PAGE_SIZE = 25

export function InactivePage() {
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 250)
  const [page, setPage] = useState(1)
  const { data, isLoading, error, refetch } = useInactive()
  const reactivate = useReactivateMember()

  const filtered = (data || []).filter(
    (m) =>
      m.game_nick.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
      m.real_name.toLowerCase().includes(debouncedSearch.toLowerCase())
  )

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageSafe = Math.min(page, totalPages)
  const paged = filtered.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE)

  const columns: Column<Member>[] = [
    {
      key: 'game_nick',
      header: 'Ник в игре',
      cell: (row) => <span className="font-bold text-electric">{row.game_nick}</span>,
    },
    {
      key: 'level',
      header: 'Уровень',
      cell: (row) => <span className="text-on-surface-variant">{row.level}</span>,
    },
    {
      key: 'perspective',
      header: 'Режим',
      cell: (row) => <span className="text-on-surface-variant">{perspectiveLabel(row.perspective)}</span>,
    },
    {
      key: 'real_name',
      header: 'Имя',
      cell: (row) => row.real_name,
    },
    {
      key: 'join_date',
      header: 'Дата присоединения',
      cell: (row) => <span className="text-on-surface-variant">{formatJoinDate(row.join_date)}</span>,
    },
    {
      key: 'actions',
      header: '',
      cell: (row) => (
        <Button
          variant="ghost"
          className="w-auto px-2"
          onClick={() => reactivate.mutate(row.user_id)}
          disabled={reactivate.isPending}
        >
          Вернуть в активные
        </Button>
      ),
    },
  ]

  return (
    <div>
      <div className="mb-stack-lg flex flex-col sm:flex-row sm:items-center justify-between gap-stack-md">
        <h2 className="text-display text-on-surface">Неактивные игроки</h2>
        <Input
          icon={<span className="material-symbols-outlined text-[20px]">search</span>}
          placeholder="Поиск по нику или имени…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full sm:w-64"
        />
      </div>

      {isLoading && <Loader />}
      {error && <ErrorState message={error.message} onRetry={refetch} />}
      {!isLoading && !error && data && data.length === 0 && <EmptyState />}
      {!isLoading && !error && data && data.length > 0 && (
        <>
          <DataTable
            columns={columns}
            data={paged}
            keyExtractor={(row) => row.user_id}
          />
          <Pagination page={pageSafe} totalPages={totalPages} onPageChange={setPage} />
        </>
      )}
    </div>
  )
}
