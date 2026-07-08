import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { fetchMembers, setMemberInactive, setMemberLegacy } from '../../api/client'

const KEY = ['members']

export function useMembers() {
  return useQuery({
    queryKey: KEY,
    queryFn: fetchMembers,
  })
}

export function useToggleMemberInactive() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, isInactive }: { userId: number; isInactive: boolean }) =>
      setMemberInactive(userId, isInactive),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEY })
      queryClient.invalidateQueries({ queryKey: ['inactive'] })
      queryClient.invalidateQueries({ queryKey: ['stats'] })
    },
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
