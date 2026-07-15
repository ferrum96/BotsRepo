import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { useConfirmAction } from './useConfirmAction'

describe('useConfirmAction', () => {
  it('opens with a target and closes by clearing it', () => {
    const { result } = renderHook(() => useConfirmAction<number>())

    expect(result.current.isOpen).toBe(false)
    expect(result.current.target).toBeNull()

    act(() => {
      result.current.openFor(42)
    })
    expect(result.current.isOpen).toBe(true)
    expect(result.current.target).toBe(42)

    act(() => {
      result.current.close()
    })
    expect(result.current.isOpen).toBe(false)
    expect(result.current.target).toBeNull()
  })
})
