import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { fetchInactive, setMemberInactive } from '../../api/client'

const KEY = ['inactive']

export function useInactive() {
  return useQuery({
    queryKey: KEY,
    queryFn: fetchInactive,
  })
}

export function useReactivateMember() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (userId: number) => setMemberInactive(userId, false),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEY })
      queryClient.invalidateQueries({ queryKey: ['members'] })
      queryClient.invalidateQueries({ queryKey: ['stats'] })
    },
  })
}
