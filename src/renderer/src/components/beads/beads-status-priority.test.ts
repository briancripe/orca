import { describe, expect, it } from 'vitest'
import {
  BEADS_STATUS_TONE,
  getBeadsPriorityLabel,
  getBeadsPriorityTone,
  getBeadsStatusLabel,
  isBeadsIssueClosed
} from './beads-status-priority'
import type { BeadsIssuePriority, BeadsIssueStatus } from '../../../../shared/beads-types'

describe('beads status/priority presentation', () => {
  it('renders priority as P0-P4, never a raw integer', () => {
    const priorities: BeadsIssuePriority[] = [0, 1, 2, 3, 4]
    expect(priorities.map(getBeadsPriorityLabel)).toEqual(['P0', 'P1', 'P2', 'P3', 'P4'])
  })

  it('gives the four active statuses visually distinct tones', () => {
    const active: BeadsIssueStatus[] = ['open', 'in_progress', 'blocked', 'deferred']
    const tones = active.map((status) => BEADS_STATUS_TONE[status])
    expect(new Set(tones).size).toBe(active.length)
  })

  it('escalates P0/P1 tone above P2 and de-emphasizes P3/P4', () => {
    expect(getBeadsPriorityTone(0)).toBe(getBeadsPriorityTone(1))
    expect(getBeadsPriorityTone(2)).not.toBe(getBeadsPriorityTone(0))
    expect(getBeadsPriorityTone(3)).toBe(getBeadsPriorityTone(4))
  })

  it('labels each status distinctly', () => {
    expect(getBeadsStatusLabel('in_progress')).toBe('In progress')
    expect(getBeadsStatusLabel('blocked')).toBe('Blocked')
    expect(getBeadsStatusLabel('deferred')).toBe('Deferred')
  })

  it('treats only closed as closed for roll-ups', () => {
    expect(isBeadsIssueClosed('closed')).toBe(true)
    expect(isBeadsIssueClosed('open')).toBe(false)
    expect(isBeadsIssueClosed('blocked')).toBe(false)
  })
})
