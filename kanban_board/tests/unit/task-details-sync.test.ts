import { describe, expect, it } from 'vitest'
import {
  resolveDraftAfterTaskSync,
  shouldKeepDescriptionEditorOpen,
  shouldSilentBoardRefetch,
  shouldSkipBoardRefetch,
} from '../../src/client/lib/task-details-sync.js'

describe('task-details-sync', () => {
  it('skips board refetch for meta-only updates', () => {
    expect(shouldSkipBoardRefetch({ meta: '{}' })).toBe(true)
    expect(shouldSilentBoardRefetch({ meta: '{}' })).toBe(false)
  })

  it('requires silent board refetch for detail field updates', () => {
    expect(shouldSkipBoardRefetch({ priority: 'HIGH' })).toBe(false)
    expect(shouldSilentBoardRefetch({ priority: 'HIGH' })).toBe(true)

    expect(shouldSkipBoardRefetch({ title: 'New title' })).toBe(false)
    expect(shouldSilentBoardRefetch({ title: 'New title' })).toBe(true)

    expect(shouldSkipBoardRefetch({ epicId: null })).toBe(false)
    expect(shouldSilentBoardRefetch({ epicId: null })).toBe(true)

    expect(shouldSkipBoardRefetch({ description: 'Draft', priority: 'LOW' })).toBe(false)
    expect(shouldSilentBoardRefetch({ description: 'Draft', priority: 'LOW' })).toBe(true)
  })

  it('does not skip refetch when meta is mixed with other fields', () => {
    expect(shouldSkipBoardRefetch({ meta: '{}', title: 'X' })).toBe(false)
    expect(shouldSilentBoardRefetch({ meta: '{}', title: 'X' })).toBe(true)
  })

  it('keeps local draft while description editor is open', () => {
    expect(
      resolveDraftAfterTaskSync({
        isEditing: true,
        localValue: 'unsaved draft',
        serverValue: 'server value',
      })
    ).toBe('unsaved draft')

    expect(
      resolveDraftAfterTaskSync({
        isEditing: false,
        localValue: 'unsaved draft',
        serverValue: 'server value',
      })
    ).toBe('server value')
  })

  it('keeps title draft while title editor is open', () => {
    expect(
      resolveDraftAfterTaskSync({
        isEditing: true,
        localValue: 'local title',
        serverValue: 'server title',
      })
    ).toBe('local title')
  })

  it('reports whether description editor should stay open', () => {
    expect(shouldKeepDescriptionEditorOpen(true)).toBe(true)
    expect(shouldKeepDescriptionEditorOpen(false)).toBe(false)
  })
})
