import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { fetchBlacklist, unblockBlacklistMember } from '../../api/client'
import { BLACKLIST_KEY, MEMBERS_KEY, invalidateKeys } from '../../utils/queryKeys'

export function useBlacklist() {
  return useQuery({
    queryKey: BLACKLIST_KEY,
    queryFn: fetchBlacklist,
  })
}

export function useUnblockBlacklistMember() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (userId: number) => unblockBlacklistMember(userId),
    onSuccess: () => {
      invalidateKeys(queryClient, BLACKLIST_KEY, MEMBERS_KEY)
    },
  })
}
