import { useState } from 'react'

import { BlacklistEntry } from '../api/client'
import { PageHeader } from '../components/layout/PageHeader'
import { Button } from '../components/ui/Button'
import { TelegramDmButton } from '../components/ui/TelegramDmButton'
import { ConfirmModal } from '../components/ui/ConfirmModal'
import { Badge } from '../components/ui/Badge'
import { DataTable, Column } from '../components/table/DataTable'
import { Pagination } from '../components/table/Pagination'
import { EmptyState } from '../components/feedback/EmptyState'
import { ErrorState } from '../components/feedback/ErrorState'
import { Loader } from '../components/feedback/Loader'
import { useBlacklist, useUnblockBlacklistMember } from '../features/blacklist/useBlacklist'
import { useConfirmAction } from '../hooks/useConfirmAction'
import { useDebounce } from '../hooks/useDebounce'
import { matchesTextQuery } from '../utils/query'

const PAGE_SIZE = 25

function reasonLabel(reason: string): string {
  if (reason === 'survey_attempts_exhausted' || reason === 'survey_failed') {
    return 'Не прошел опрос'
  }
  if (reason === 'kicked_from_dashboard' || reason === 'removed_from_group') {
    return 'Забанен админом'
  }
  return reason
}

export function BlacklistPage() {
  const [search, setSearch] = useState('')
  const restoreConfirm = useConfirmAction<number>()
  const debouncedSearch = useDebounce(search, 250)
  const [page, setPage] = useState(1)
  const { data, isLoading, error, refetch } = useBlacklist()
  const unblockMember = useUnblockBlacklistMember()

  const filtered = (data || []).filter((entry) => {
    return matchesTextQuery(
      debouncedSearch,
      entry.tg_username,
      entry.game_nick,
      entry.real_name,
      entry.discord_nick
    )
  })

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageSafe = Math.min(page, totalPages)
  const paged = filtered.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE)
  const columns: Column<BlacklistEntry>[] = [
    {
      key: 'tg',
      header: '',
      cell: (row) => (
        <TelegramDmButton userId={row.user_id} tgUsername={row.tg_username} />
      ),
    },
    {
      key: 'tg_username',
      header: 'Ник TG',
      headerClassName: 'hidden sm:table-cell',
      cellClassName: 'hidden sm:table-cell',
      cell: (row) => (
        <span className="inline-block max-w-[140px] truncate text-center md:max-w-none">
          {row.tg_username ? `@${row.tg_username}` : `ID ${row.user_id}`}
        </span>
      ),
    },
    {
      key: 'real_name',
      header: 'Имя',
      headerClassName: 'hidden md:table-cell',
      cellClassName: 'hidden md:table-cell',
      cell: (row) => (
        <span className="inline-block max-w-[120px] truncate text-center md:max-w-none">
          {row.real_name || '—'}
        </span>
      ),
    },
    {
      key: 'game_nick',
      header: 'Ник в игре',
      cell: (row) => (
        <div className="flex flex-col items-center justify-center gap-0.5">
          <span className="inline-block max-w-[36vw] truncate text-center font-bold text-electric sm:max-w-[140px] md:max-w-none">
            {row.game_nick || '—'}
          </span>
          <span className="sm:hidden text-[11px] text-on-surface-variant max-w-[36vw] truncate">
            {row.tg_username ? `@${row.tg_username}` : `ID ${row.user_id}`}
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
      key: 'created_at',
      header: 'Дата добавления',
      headerClassName: 'hidden md:table-cell',
      cellClassName: 'hidden md:table-cell',
      cell: (row) => (
        <span className="text-on-surface-variant">
          {new Date(row.created_at).toLocaleDateString('ru-RU')}
        </span>
      ),
    },
    {
      key: 'reason',
      header: 'Причина блокировки',
      headerClassName: 'hidden sm:table-cell',
      cellClassName: 'hidden sm:table-cell',
      cell: (row) => (
        <Badge className="border-red-900 text-red-500 bg-red-950/30">
          {reasonLabel(row.reason)}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      cell: (row) => {
        const restoring =
          unblockMember.isPending && unblockMember.variables === row.user_id
        return (
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-1 sm:gap-2">
            <Button
              variant="ghost"
              className="min-h-9 w-full sm:w-auto px-2 py-1.5 text-[12px] text-emerald-400 hover:text-emerald-300 hover:bg-emerald-950/30 whitespace-nowrap"
              onClick={() => restoreConfirm.openFor(row.user_id)}
              disabled={unblockMember.isPending}
              aria-label={restoring ? 'Восстанавливаю…' : 'Вернуть доступ'}
            >
              {restoring ? (
                'Восст…'
              ) : (
                <>
                  <span className="sm:hidden">Вернуть</span>
                  <span className="hidden sm:inline">Вернуть доступ</span>
                </>
              )}
            </Button>
          </div>
        )
      },
    },
  ]

  const unblockErrorMessage =
    unblockMember.error instanceof Error ? unblockMember.error.message : null

  return (
    <div>
      <PageHeader
        title="Блэклист"
        placeholder="Ник TG, ник в игре, Discord или имя..."
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
      {!isLoading && !error && data && data.length > 0 && filtered.length === 0 && (
        <EmptyState
          title="Ничего не найдено"
          subtitle="Попробуйте другой поисковый запрос."
        />
      )}
      {!isLoading && !error && data && filtered.length > 0 && (
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
        open={restoreConfirm.isOpen}
        title="Вы уверены?"
        message="Восстановить доступ к группе и убрать его из blacklist?"
        confirmLabel="Да"
        cancelLabel="Нет"
        isConfirming={unblockMember.isPending}
        onCancel={restoreConfirm.close}
        onConfirm={() => {
          if (restoreConfirm.target === null) return
          unblockMember.mutate(restoreConfirm.target, {
            onSuccess: restoreConfirm.close,
          })
        }}
      />
    </div>
  )
}
