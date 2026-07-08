import { useState } from 'react'

import { BlacklistEntry } from '../api/client'
import { Badge } from '../components/ui/Badge'
import { Input } from '../components/ui/Input'
import { DataTable, Column } from '../components/table/DataTable'
import { Pagination } from '../components/table/Pagination'
import { EmptyState } from '../components/feedback/EmptyState'
import { ErrorState } from '../components/feedback/ErrorState'
import { Loader } from '../components/feedback/Loader'
import { useBlacklist } from '../features/blacklist/useBlacklist'
import { useDebounce } from '../hooks/useDebounce'

const PAGE_SIZE = 25

export function BlacklistPage() {
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 250)
  const [page, setPage] = useState(1)
  const { data, isLoading, error, refetch } = useBlacklist()

  const filtered = (data || []).filter(
    (entry) =>
      String(entry.user_id).includes(debouncedSearch) ||
      entry.reason.toLowerCase().includes(debouncedSearch.toLowerCase())
  )

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageSafe = Math.min(page, totalPages)
  const paged = filtered.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE)

  const columns: Column<BlacklistEntry>[] = [
    {
      key: 'user_id',
      header: 'Telegram ID',
      sortable: true,
      cell: (row) => <span className="font-mono text-on-surface-variant">{row.user_id}</span>,
    },
    {
      key: 'reason',
      header: 'Причина',
      sortable: true,
      cell: (row) => row.reason,
    },
    {
      key: 'created_at',
      header: 'Дата добавления',
      sortable: true,
      cell: (row) => <span className="text-on-surface-variant">{new Date(row.created_at).toLocaleDateString('ru-RU')}</span>,
    },
    {
      key: 'status',
      header: 'Статус',
      cell: () => <Badge className="border-red-900 text-red-500 bg-red-950/30">Blocked</Badge>,
    },
  ]

  return (
    <div>
      <div className="mb-stack-lg flex flex-col sm:flex-row sm:items-center justify-between gap-stack-md">
        <h2 className="text-display text-on-surface">Blacklist</h2>
        <Input
          icon={<span className="material-symbols-outlined text-[20px]">search</span>}
          placeholder="Поиск по ID или причине…"
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
