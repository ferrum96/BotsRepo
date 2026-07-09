import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { fetchBlacklist, unblockBlacklistMember } from '../../api/client'

const KEY = ['blacklist']

export function useBlacklist() {
  return useQuery({
    queryKey: KEY,
    queryFn: fetchBlacklist,
  })
}

export function useUnblockBlacklistMember() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (userId: number) => unblockBlacklistMember(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEY })
      queryClient.invalidateQueries({ queryKey: ['members'] })
      queryClient.invalidateQueries({ queryKey: ['stats'] })
    },
  })
}
