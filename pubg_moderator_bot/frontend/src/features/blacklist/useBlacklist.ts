import { useQuery } from '@tanstack/react-query'

import { fetchBlacklist } from '../../api/client'

export function useBlacklist() {
  return useQuery({
    queryKey: ['blacklist'],
    queryFn: fetchBlacklist,
  })
}
