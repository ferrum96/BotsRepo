import { useState } from 'react'

import { Input } from '../components/ui/Input'
import { ErrorState } from '../components/feedback/ErrorState'
import { Loader } from '../components/feedback/Loader'
import { EmptyState } from '../components/feedback/EmptyState'
import { MembersTable } from '../features/members/MembersTable'
import { useMembers } from '../features/members/useMembers'
import { useDebounce } from '../hooks/useDebounce'

export function MembersPage() {
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 250)
  const { data, isLoading, error, refetch } = useMembers()

  return (
    <div>
      <div className="mb-stack-lg flex flex-col sm:flex-row sm:items-center justify-between gap-stack-md">
        <h2 className="text-display text-on-surface">Участники клана</h2>
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
        <MembersTable members={data} search={debouncedSearch} />
      )}
    </div>
  )
}
