import { useState } from 'react'

import type { Member } from '../api/client'
import { PageHeader } from '../components/layout/PageHeader'
import { ErrorState } from '../components/feedback/ErrorState'
import { Loader } from '../components/feedback/Loader'
import { EmptyState } from '../components/feedback/EmptyState'
import { ConfirmModal } from '../components/ui/ConfirmModal'
import { EditMemberModal } from '../features/members/EditMemberModal'
import { MembersTable } from '../features/members/MembersTable'
import { useMembers, useKickMember, useUpdateMember } from '../features/members/useMembers'
import { useConfirmAction } from '../hooks/useConfirmAction'
import { useDebounce } from '../hooks/useDebounce'
import { formatMemberCount } from '../utils/formatters'

export function MembersPage() {
  const [search, setSearch] = useState('')
  const [editMember, setEditMember] = useState<Member | null>(null)
  const kickConfirm = useConfirmAction<number>()
  const debouncedSearch = useDebounce(search, 250)
  const { data, isLoading, error, refetch } = useMembers()
  const kickMember = useKickMember()
  const updateMember = useUpdateMember()

  return (
    <div>
      <PageHeader
        title="Участники группы"
        placeholder="Ник в игре или имя..."
        value={search}
        onChange={setSearch}
      />

      {data && (
        <p className="mb-stack-md text-sm font-medium text-[#7dd3c7]">
          {formatMemberCount(data.length)}
        </p>
      )}

      {isLoading && <Loader />}
      {error && <ErrorState message={error.message} onRetry={refetch} />}
      {!isLoading && !error && data && data.length === 0 && <EmptyState />}
      {!isLoading && !error && data && data.length > 0 && (
        <MembersTable
          members={data}
          search={debouncedSearch}
          onEdit={setEditMember}
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
      <EditMemberModal
        open={editMember !== null}
        member={editMember}
        isSaving={updateMember.isPending}
        onCancel={() => {
          if (updateMember.isPending) return
          setEditMember(null)
        }}
        onSave={(payload) => {
          if (!editMember) return
          updateMember.mutate(
            { userId: editMember.user_id, payload },
            { onSuccess: () => setEditMember(null) },
          )
        }}
      />
    </div>
  )
}
