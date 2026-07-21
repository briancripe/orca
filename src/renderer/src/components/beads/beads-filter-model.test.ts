import { describe, expect, it } from 'vitest'
import {
  EMPTY_BEADS_FILTER_STATE,
  hasActiveBeadsFilters,
  toBeadsIssueFilters,
  toggleBeadsStatusFilter
} from './beads-filter-model'

describe('beads filter model', () => {
  it('omits empty fields entirely', () => {
    expect(toBeadsIssueFilters(EMPTY_BEADS_FILTER_STATE)).toEqual({})
  })

  it('maps the Ready toggle onto the bd ready filter', () => {
    const filters = toBeadsIssueFilters({ ...EMPTY_BEADS_FILTER_STATE, ready: true })
    expect(filters).toEqual({ ready: true })
  })

  it('carries the selected status set and trimmed text filters', () => {
    const filters = toBeadsIssueFilters({
      statuses: ['open', 'blocked'],
      ready: true,
      type: ' bug ',
      label: 'ui',
      assignee: ' alice ',
      titleContains: 'crash'
    })
    expect(filters).toEqual({
      status: ['open', 'blocked'],
      ready: true,
      type: 'bug',
      label: 'ui',
      assignee: 'alice',
      titleContains: 'crash'
    })
  })

  it('toggles a status in and out of the set', () => {
    expect(toggleBeadsStatusFilter(['open'], 'blocked')).toEqual(['open', 'blocked'])
    expect(toggleBeadsStatusFilter(['open', 'blocked'], 'open')).toEqual(['blocked'])
  })

  it('detects whether any filter is active', () => {
    expect(hasActiveBeadsFilters(EMPTY_BEADS_FILTER_STATE)).toBe(false)
    expect(hasActiveBeadsFilters({ ...EMPTY_BEADS_FILTER_STATE, ready: true })).toBe(true)
    expect(hasActiveBeadsFilters({ ...EMPTY_BEADS_FILTER_STATE, label: 'ui' })).toBe(true)
  })
})
