import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  fetchMembers,
  kickMember,
  updateMember,
  type MemberUpdate,
} from '../../api/client'
import {
  BLACKLIST_KEY,
  INACTIVE_KEY,
  MEMBERS_KEY,
  invalidateKeys,
} from '../../utils/queryKeys'

export function useMembers() {
  return useQuery({
    queryKey: MEMBERS_KEY,
    queryFn: fetchMembers,
    // Live updates arrive via WebSocket; keep a slow safety net.
    refetchInterval: 5 * 60 * 1000,
  })
}

export function useKickMember() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (userId: number) => kickMember(userId),
    onSuccess: () => {
      invalidateKeys(queryClient, MEMBERS_KEY, INACTIVE_KEY, BLACKLIST_KEY)
    },
  })
}

export function useUpdateMember() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, payload }: { userId: number; payload: MemberUpdate }) =>
      updateMember(userId, payload),
    onSuccess: () => {
      invalidateKeys(queryClient, MEMBERS_KEY, INACTIVE_KEY)
    },
  })
}
