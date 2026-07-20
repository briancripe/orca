import { describe, expect, it } from 'vitest'
import {
  collectBeadsChildIds,
  computeBeadsOrphans,
  getBeadsEpicProgress,
  getBeadsEpics
} from './beads-epic-grouping'
import type { BeadsWorkItem } from '../../../../shared/beads-types'

function item(
  id: string,
  issueType: string,
  status: BeadsWorkItem['status'] = 'open'
): BeadsWorkItem {
  return {
    id,
    title: `t-${id}`,
    status,
    priority: 2,
    issueType,
    labels: [],
    updatedAt: '2026-07-01T00:00:00Z',
    repoId: 'repo-1'
  }
}

describe('beads epic grouping', () => {
  const items = [item('e1', 'epic'), item('a', 'task'), item('b', 'task'), item('c', 'bug')]

  it('selects epics by issue type', () => {
    expect(getBeadsEpics(items).map((epic) => epic.id)).toEqual(['e1'])
  })

  it('rolls up children progress as closed/total', () => {
    const progress = getBeadsEpicProgress([
      item('a', 'task', 'closed'),
      item('b', 'task', 'open'),
      item('c', 'task', 'closed')
    ])
    expect(progress).toEqual({ closed: 2, total: 3 })
  })

  it('leaves non-child, non-epic issues in the orphan section', () => {
    const childIds = collectBeadsChildIds({ e1: [item('a', 'task'), item('b', 'task')] })
    expect(childIds.has('a')).toBe(true)
    const orphans = computeBeadsOrphans(items, childIds)
    // a + b are children; e1 is an epic → only c is an orphan.
    expect(orphans.map((orphan) => orphan.id)).toEqual(['c'])
  })
})
