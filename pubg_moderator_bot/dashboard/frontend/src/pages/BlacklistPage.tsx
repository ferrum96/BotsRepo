import { useState } from 'react'

import { BlacklistEntry } from '../api/client'
import { PageHeader } from '../components/layout/PageHeader'
import { Badge } from '../components/ui/Badge'
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

  const filtered = (data || []).filter((entry) => {
    const query = debouncedSearch.trim().toLowerCase()
    if (!query) return true
    return (
      entry.game_nick?.toLowerCase().includes(query) ||
      entry.real_name?.toLowerCase().includes(query)
    )
  })

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageSafe = Math.min(page, totalPages)
  const paged = filtered.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE)

  const columns: Column<BlacklistEntry>[] = [
    {
      key: 'game_nick',
      header: 'Ник в игре',
      sortable: true,
      cell: (row) => (
        <span className="font-bold text-electric">{row.game_nick || '—'}</span>
      ),
    },
    {
      key: 'real_name',
      header: 'Имя',
      sortable: true,
      cell: (row) => row.real_name || '—',
    },
    {
      key: 'created_at',
      header: 'Дата добавления',
      sortable: true,
      cell: (row) => (
        <span className="text-on-surface-variant">
          {new Date(row.created_at).toLocaleDateString('ru-RU')}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Статус',
      cell: () => (
        <Badge className="border-red-900 text-red-500 bg-red-950/30">Blocked</Badge>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="Blacklist"
        placeholder="Filter Blacklist..."
        value={search}
        onChange={setSearch}
      />

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
