import { useMemo, useState } from 'react'

import type { InactiveMember } from '../api/client'
import { EmptyState } from '../components/feedback/EmptyState'
import { ErrorState } from '../components/feedback/ErrorState'
import { Loader } from '../components/feedback/Loader'
import { PageHeader } from '../components/layout/PageHeader'
import { DataTable, type Column } from '../components/table/DataTable'
import { Pagination } from '../components/table/Pagination'
import { Button } from '../components/ui/Button'
import { TelegramDmButton } from '../components/ui/TelegramDmButton'
import { ConfirmModal } from '../components/ui/ConfirmModal'
import { useConfirmAction } from '../hooks/useConfirmAction'
import { useDebounce } from '../hooks/useDebounce'
import { useKickMember } from '../features/members/useMembers'
import { useInactiveMembers } from '../features/inactive/useInactiveMembers'
import { matchesTextQuery } from '../utils/query'

const PAGE_SIZE = 25

function formatLastMatch(value: string | null): { dateText: string; agoText: string | null } {
  if (!value) return { dateText: 'Нет данных', agoText: null }
  const normalized = value.includes('T') ? value : value.replace(' ', 'T')
  const parsed = new Date(normalized)
  if (Number.isNaN(parsed.getTime())) return { dateText: value, agoText: null }
  const diffMs = Math.max(0, Date.now() - parsed.getTime())
  const daysAgo = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  const dayLabel = pluralizeDays(daysAgo)
  return {
    dateText: parsed.toLocaleString('ru-RU'),
    agoText: `(${daysAgo} ${dayLabel} назад)`,
  }
}

function pluralizeDays(days: number): string {
  const mod100 = days % 100
  const mod10 = days % 10

  if (mod100 >= 11 && mod100 <= 14) return 'дней'
  if (mod10 === 1) return 'день'
  if (mod10 >= 2 && mod10 <= 4) return 'дня'
  return 'дней'
}

export function InactiveMembersPage() {
  const [search, setSearch] = useState('')
  const kickConfirm = useConfirmAction<number>()
  const [page, setPage] = useState(1)
  const debouncedSearch = useDebounce(search, 250)
  const { data, isLoading, error, refetch } = useInactiveMembers()
  const kickMember = useKickMember()

  const filtered = useMemo(() => {
    return (data || []).filter(
      (member) =>
        matchesTextQuery(
          debouncedSearch,
          member.real_name,
          member.game_nick,
          member.discord_nick,
          member.tg_username,
        )
    )
  }, [data, debouncedSearch])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageSafe = Math.min(page, totalPages)
  const paged = filtered.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE)

  const columns: Column<InactiveMember>[] = [
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
      cell: (row) => {
        const { agoText } = formatLastMatch(row.last_match_at)
        return (
          <div className="flex flex-col items-center justify-center gap-0.5">
            <span className="inline-block max-w-[36vw] truncate text-center font-bold text-electric sm:max-w-[140px] md:max-w-none">
              {row.game_nick}
            </span>
            {agoText && (
              <span className="md:hidden text-[11px] text-on-surface-variant whitespace-nowrap">
                {agoText.replace(/[()]/g, '')}
              </span>
            )}
          </div>
        )
      },
    },
    {
      key: 'discord_nick',
      header: 'Ник в Discord',
      headerClassName: 'hidden sm:table-cell',
      cellClassName: 'hidden sm:table-cell',
      cell: (row) => row.discord_nick || '—',
    },
    {
      key: 'last_match_at',
      header: 'Был в последний раз в игре',
      headerClassName: 'hidden md:table-cell',
      cellClassName: 'hidden md:table-cell',
      cell: (row) => {
        const { dateText, agoText } = formatLastMatch(row.last_match_at)
        return (
          <span className="text-on-surface-variant text-[13px]">
            {dateText}
            {agoText && <> {agoText}</>}
          </span>
        )
      },
    },
    {
      key: 'kick',
      header: '',
      cell: (row) => {
        const kicking = kickMember.isPending && kickMember.variables === row.user_id
        return (
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-1 sm:gap-2">
            <Button
              variant="ghost"
              className="min-h-9 w-full sm:w-auto px-2 py-1.5 text-[12px] text-red-400 hover:text-red-300 hover:bg-red-950/30 whitespace-nowrap"
              onClick={() => kickConfirm.openFor(row.user_id)}
              disabled={kickMember.isPending}
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

  return (
    <div>
      <PageHeader
        title="Неактивные игроки"
        placeholder="Ник в игре, Discord или имя..."
        value={search}
        onChange={setSearch}
      />

      {isLoading && <Loader />}
      {error && <ErrorState message={error.message} onRetry={refetch} />}
      {!isLoading && !error && data && data.length === 0 && (
        <EmptyState
          title="Неактивных игроков нет"
          subtitle="Игроки, которые не играли 7+ дней, появятся здесь автоматически."
        />
      )}
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
        open={kickConfirm.isOpen}
        title="Вы уверены?"
        message="Удалить участника из группы?"
        confirmLabel="Да"
        cancelLabel="Нет"
        isConfirming={kickMember.isPending}
        onCancel={kickConfirm.close}
        onConfirm={() => {
          if (kickConfirm.target === null) return
          kickMember.mutate(kickConfirm.target, {
            onSuccess: kickConfirm.close,
          })
        }}
      />
    </div>
  )
}
