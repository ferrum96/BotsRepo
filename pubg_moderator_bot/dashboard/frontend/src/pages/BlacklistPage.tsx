import { useState } from 'react'

import { BlacklistEntry } from '../api/client'
import { PageHeader } from '../components/layout/PageHeader'
import { Button } from '../components/ui/Button'
import { ConfirmModal } from '../components/ui/ConfirmModal'
import { Badge } from '../components/ui/Badge'
import { DataTable, Column } from '../components/table/DataTable'
import { Pagination } from '../components/table/Pagination'
import { EmptyState } from '../components/feedback/EmptyState'
import { ErrorState } from '../components/feedback/ErrorState'
import { Loader } from '../components/feedback/Loader'
import { useBlacklist, useUnblockBlacklistMember } from '../features/blacklist/useBlacklist'
import { useDebounce } from '../hooks/useDebounce'

const PAGE_SIZE = 25

export function BlacklistPage() {
  const [search, setSearch] = useState('')
  const [confirmRestoreUserId, setConfirmRestoreUserId] = useState<number | null>(null)
  const debouncedSearch = useDebounce(search, 250)
  const [page, setPage] = useState(1)
  const { data, isLoading, error, refetch } = useBlacklist()
  const unblockMember = useUnblockBlacklistMember()

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
        <span className="inline-block max-w-[120px] truncate text-center font-bold text-electric sm:max-w-none">
          {row.game_nick || '—'}
        </span>
      ),
    },
    {
      key: 'real_name',
      header: 'Имя',
      sortable: true,
      cell: (row) => (
        <span className="inline-block max-w-[120px] truncate text-center sm:max-w-none">
          {row.real_name || '—'}
        </span>
      ),
    },
    {
      key: 'created_at',
      header: 'Дата добавления',
      sortable: true,
      headerClassName: 'hidden md:table-cell',
      cellClassName: 'hidden md:table-cell',
      cell: (row) => (
        <span className="text-on-surface-variant">
          {new Date(row.created_at).toLocaleDateString('ru-RU')}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Статус',
      headerClassName: 'hidden sm:table-cell',
      cellClassName: 'hidden sm:table-cell',
      cell: () => (
        <Badge className="border-red-900 text-red-500 bg-red-950/30">Blocked</Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      cell: (row) => (
        <Button
          variant="ghost"
          className="w-auto px-2 py-1 text-[11px] sm:text-[12px] text-emerald-400 hover:text-emerald-300 hover:bg-emerald-950/30 whitespace-nowrap"
          onClick={() => setConfirmRestoreUserId(row.user_id)}
          disabled={unblockMember.isPending}
        >
          {unblockMember.isPending && unblockMember.variables === row.user_id
            ? 'Восст…'
            : 'Вернуть'}
        </Button>
      ),
    },
  ]

  const unblockErrorMessage =
    unblockMember.error instanceof Error ? unblockMember.error.message : null

  return (
    <div>
      <PageHeader
        title="Блэклист"
        placeholder="Ник в игре или имя..."
        value={search}
        onChange={setSearch}
      />

      {isLoading && <Loader />}
      {error && <ErrorState message={error.message} onRetry={refetch} />}
      {unblockErrorMessage && (
        <ErrorState
          message={unblockErrorMessage}
          onRetry={() => {
            if (typeof unblockMember.variables === 'number') {
              unblockMember.mutate(unblockMember.variables)
            }
          }}
        />
      )}
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
      <ConfirmModal
        open={confirmRestoreUserId !== null}
        title="Вы уверены?"
        message="Восстановить участника и убрать его из blacklist?"
        confirmLabel="Да"
        cancelLabel="Нет"
        isConfirming={unblockMember.isPending}
        onCancel={() => setConfirmRestoreUserId(null)}
        onConfirm={() => {
          if (confirmRestoreUserId === null) return
          unblockMember.mutate(confirmRestoreUserId, {
            onSuccess: () => setConfirmRestoreUserId(null),
          })
        }}
      />
    </div>
  )
}
