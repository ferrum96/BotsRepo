import { useCallback, useState } from 'react'

export function useConfirmAction<T>() {
  const [target, setTarget] = useState<T | null>(null)

  const openFor = useCallback((value: T) => {
    setTarget(value)
  }, [])

  const close = useCallback(() => {
    setTarget(null)
  }, [])

  return {
    target,
    isOpen: target !== null,
    openFor,
    close,
  }
}
