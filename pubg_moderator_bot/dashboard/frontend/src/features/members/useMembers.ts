import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  fetchMembers,
  kickMember,
} from '../../api/client'

const KEY = ['members']

export function useMembers() {
  return useQuery({
    queryKey: KEY,
    queryFn: fetchMembers,
    refetchInterval: 10 * 60 * 1000,
  })
}

export function useKickMember() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (userId: number) => kickMember(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEY })
      queryClient.invalidateQueries({ queryKey: ['inactive-members'] })
      queryClient.invalidateQueries({ queryKey: ['blacklist'] })
      queryClient.invalidateQueries({ queryKey: ['stats'] })
    },
  })
}
