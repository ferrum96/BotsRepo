import type { QueryClient } from '@tanstack/react-query'

export const MEMBERS_KEY = ['members'] as const
export const INACTIVE_KEY = ['inactive-members'] as const
export const BLACKLIST_KEY = ['blacklist'] as const

export function invalidateKeys(
  queryClient: QueryClient,
  ...keys: ReadonlyArray<readonly string[]>
): void {
  for (const key of keys) {
    void queryClient.invalidateQueries({ queryKey: key })
  }
}
