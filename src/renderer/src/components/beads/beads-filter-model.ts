/* Filter state <-> bd query translation for the beads list surface. Pure so
   the Ready toggle / status-set / type / label / assignee controls can be
   driven and asserted without a live store. */
import type { BeadsIssueFilters } from '@/store/slices/beads-cache'
import type { BeadsIssueStatus } from '../../../../shared/beads-types'

export type BeadsFilterState = {
  statuses: readonly BeadsIssueStatus[]
  // Why: the Ready toggle maps onto bd's `--ready` filter (unblocked, actionable
  // work). It is orthogonal to the status set, so both can apply at once.
  ready: boolean
  type: string
  label: string
  assignee: string
  titleContains: string
}

export const EMPTY_BEADS_FILTER_STATE: BeadsFilterState = {
  statuses: [],
  ready: false,
  type: '',
  label: '',
  assignee: '',
  titleContains: ''
}

function trimmedOrUndefined(value: string): string | undefined {
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

// Why: build a minimal filter object — omit empties entirely so the cache key
// (beadsFilterSignature) stays stable and bd isn't handed blank flags.
export function toBeadsIssueFilters(state: BeadsFilterState): BeadsIssueFilters {
  const filters: BeadsIssueFilters = {}
  if (state.statuses.length > 0) {
    filters.status = [...state.statuses]
  }
  if (state.ready) {
    filters.ready = true
  }
  const type = trimmedOrUndefined(state.type)
  if (type) {
    filters.type = type
  }
  const label = trimmedOrUndefined(state.label)
  if (label) {
    filters.label = label
  }
  const assignee = trimmedOrUndefined(state.assignee)
  if (assignee) {
    filters.assignee = assignee
  }
  const titleContains = trimmedOrUndefined(state.titleContains)
  if (titleContains) {
    filters.titleContains = titleContains
  }
  return filters
}

export function toggleBeadsStatusFilter(
  statuses: readonly BeadsIssueStatus[],
  status: BeadsIssueStatus
): BeadsIssueStatus[] {
  return statuses.includes(status)
    ? statuses.filter((entry) => entry !== status)
    : [...statuses, status]
}

export function hasActiveBeadsFilters(state: BeadsFilterState): boolean {
  return (
    state.statuses.length > 0 ||
    state.ready ||
    trimmedOrUndefined(state.type) !== undefined ||
    trimmedOrUndefined(state.label) !== undefined ||
    trimmedOrUndefined(state.assignee) !== undefined ||
    trimmedOrUndefined(state.titleContains) !== undefined
  )
}
