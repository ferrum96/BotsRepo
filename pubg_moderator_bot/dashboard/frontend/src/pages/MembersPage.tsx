import { useState } from 'react'

import { PageHeader } from '../components/layout/PageHeader'
import { ErrorState } from '../components/feedback/ErrorState'
import { Loader } from '../components/feedback/Loader'
import { EmptyState } from '../components/feedback/EmptyState'
import { MembersTable } from '../features/members/MembersTable'
import { useMembers, useKickMember } from '../features/members/useMembers'
import { useDebounce } from '../hooks/useDebounce'

export function MembersPage() {
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 250)
  const { data, isLoading, error, refetch } = useMembers()
  const kickMember = useKickMember()

  return (
    <div>
      <PageHeader
        title="Clan Members"
        placeholder="Filter Members..."
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
          onKick={(userId) => kickMember.mutate(userId)}
          kickingUserId={kickMember.variables}
          isKicking={kickMember.isPending}
        />
      )}
    </div>
  )
}
