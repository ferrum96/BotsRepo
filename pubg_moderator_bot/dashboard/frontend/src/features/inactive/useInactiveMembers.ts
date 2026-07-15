import { useQuery } from '@tanstack/react-query'

import { fetchInactiveMembers } from '../../api/client'
import { INACTIVE_KEY } from '../../utils/queryKeys'

export function useInactiveMembers() {
  return useQuery({
    queryKey: INACTIVE_KEY,
    queryFn: fetchInactiveMembers,
    refetchInterval: 5 * 60 * 1000,
  })
}
