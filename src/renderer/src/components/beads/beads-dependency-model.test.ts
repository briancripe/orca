import { describe, expect, it } from 'vitest'
import {
  getBeadsBlockerIds,
  getOpenBeadsBlockers,
  groupBeadsDependenciesByType
} from './beads-dependency-model'
import type { BeadsDependency, BeadsWorkItem } from '../../../../shared/beads-types'

function workItem(id: string, status: BeadsWorkItem['status']): BeadsWorkItem {
  return {
    id,
    title: `title ${id}`,
    status,
    priority: 2,
    issueType: 'task',
    labels: [],
    updatedAt: '2026-07-01T00:00:00Z',
    repoId: 'repo-1'
  }
}

const deps: BeadsDependency[] = [
  { issueId: 'a', dependsOnId: 'b', type: 'blocks' },
  { issueId: 'a', dependsOnId: 'c', type: 'blocks' },
  { issueId: 'a', dependsOnId: 'd', type: 'related' }
]

describe('beads dependency model', () => {
  it('groups dependencies by type in a stable order', () => {
    const groups = groupBeadsDependenciesByType(deps)
    expect(groups.map((group) => group.type)).toEqual(['blocks', 'related'])
    expect(groups[0].dependencies).toHaveLength(2)
  })

  it('extracts blocker ids from the issue own blocks edges', () => {
    expect(getBeadsBlockerIds('a', deps)).toEqual(['b', 'c'])
    // Edges owned by another issue are not this issue's blockers.
    expect(getBeadsBlockerIds('z', deps)).toEqual([])
  })

  it('keeps only open blockers, treating unknown ids as still gating', () => {
    const itemsById = new Map([
      ['b', workItem('b', 'open')],
      ['c', workItem('c', 'closed')]
    ])
    const open = getOpenBeadsBlockers(['b', 'c', 'missing'], itemsById)
    expect(open.map((entry) => entry.id)).toEqual(['b', 'missing'])
  })
})
