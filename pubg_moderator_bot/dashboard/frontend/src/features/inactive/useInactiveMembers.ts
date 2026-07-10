import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  fetchInactiveMembers,
  kickMember,
} from '../../api/client'

const KEY = ['inactive-members']

export function useInactiveMembers() {
  return useQuery({
    queryKey: KEY,
    queryFn: fetchInactiveMembers,
    refetchInterval: 60_000,
  })
}

export function useKickInactiveMember() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (userId: number) => kickMember(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEY })
      queryClient.invalidateQueries({ queryKey: ['members'] })
      queryClient.invalidateQueries({ queryKey: ['blacklist'] })
      queryClient.invalidateQueries({ queryKey: ['stats'] })
    },
  })
}
