import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  fetchMembers,
  kickMember,
  setMemberLegacy,
} from '../../api/client'

const KEY = ['members']

export function useMembers() {
  return useQuery({
    queryKey: KEY,
    queryFn: fetchMembers,
  })
}

export function useToggleMemberLegacy() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, isLegacy }: { userId: number; isLegacy: boolean }) =>
      setMemberLegacy(userId, isLegacy),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEY })
      queryClient.invalidateQueries({ queryKey: ['stats'] })
    },
  })
}

export function useKickMember() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (userId: number) => kickMember(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEY })
      queryClient.invalidateQueries({ queryKey: ['blacklist'] })
      queryClient.invalidateQueries({ queryKey: ['stats'] })
    },
  })
}
