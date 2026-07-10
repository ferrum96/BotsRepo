import { useState } from 'react'

import { PageHeader } from '../components/layout/PageHeader'
import { ErrorState } from '../components/feedback/ErrorState'
import { Loader } from '../components/feedback/Loader'
import { EmptyState } from '../components/feedback/EmptyState'
import { ConfirmModal } from '../components/ui/ConfirmModal'
import { MembersTable } from '../features/members/MembersTable'
import { useMembers, useKickMember } from '../features/members/useMembers'
import { useConfirmAction } from '../hooks/useConfirmAction'
import { useDebounce } from '../hooks/useDebounce'

export function MembersPage() {
  const [search, setSearch] = useState('')
  const kickConfirm = useConfirmAction<number>()
  const debouncedSearch = useDebounce(search, 250)
  const { data, isLoading, error, refetch } = useMembers()
  const kickMember = useKickMember()

  return (
    <div>
      <PageHeader
        title="Участники группы"
        placeholder="Ник в игре или имя..."
        value={search}
        onChange={setSearch}
      />

      {isLoading && <Loader />}
      {error && <ErrorState message={error.message} onRetry={refetch} />}
      {!isLoading && !error && data && data.length === 0 && <EmptyState />}
      {!isLoading && !error && data && data.length > 0 && (
        <MembersTable
          members={data}
          search={debouncedSearch}
          onKick={kickConfirm.openFor}
          kickingUserId={kickMember.variables}
          isKicking={kickMember.isPending}
        />
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
