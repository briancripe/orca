import { describe, expect, it } from 'vitest'
import { normalizeFolderWorkspaceLinkedTask } from './folder-workspaces'
import type { FolderWorkspaceLinkedTask } from './types'

describe('normalizeFolderWorkspaceLinkedTask — beads', () => {
  const beadsTask: FolderWorkspaceLinkedTask = {
    provider: 'beads',
    type: 'issue',
    number: 0,
    title: 'Add beads provider',
    url: '',
    beadsIdentifier: 'orca-0cc.16'
  }

  it('accepts a beads linked task with an empty url and survives a round-trip', () => {
    expect(normalizeFolderWorkspaceLinkedTask(beadsTask)).toEqual(beadsTask)
  })

  it('preserves the beads identifier that carries the real (string) issue id', () => {
    const normalized = normalizeFolderWorkspaceLinkedTask({ ...beadsTask, url: '' })
    expect(normalized?.beadsIdentifier).toBe('orca-0cc.16')
    expect(normalized?.url).toBe('')
  })

  it('rejects a beads linked task with no identifier', () => {
    const { beadsIdentifier: _drop, ...withoutId } = beadsTask
    expect(normalizeFolderWorkspaceLinkedTask(withoutId)).toBeNull()
  })

  it('still requires a non-empty url for non-beads providers', () => {
    expect(
      normalizeFolderWorkspaceLinkedTask({
        provider: 'github',
        type: 'issue',
        number: 12,
        title: 'Fix it',
        url: ''
      })
    ).toBeNull()
  })
})
