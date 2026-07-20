/* Presentation helpers for beads status + priority — pure mappings shared by
   the list rows, the item dialog, and their tests. Status tones follow the
   GitLab/GitHub item-dialog precedent (semantic color scales) so the four
   active states read as visually distinct; priority is always rendered as a
   P0-P4 label (P0 highest) rather than the raw bd integer. */
import type { BeadsIssuePriority, BeadsIssueStatus } from '../../../../shared/beads-types'
import { translate } from '@/i18n/i18n'

// Why: each surfaced status gets its own tone bucket so open / in_progress /
// blocked / deferred never collapse into the same color (acceptance: they must
// be visually distinct). Mirrors GitLabItemDialog's STATE_TONE approach.
export const BEADS_STATUS_TONE: Record<BeadsIssueStatus, string> = {
  open: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  in_progress: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
  blocked: 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
  deferred: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  closed: 'bg-muted text-muted-foreground',
  pinned: 'bg-violet-500/15 text-violet-700 dark:text-violet-300',
  hooked: 'bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300'
}

export function getBeadsStatusLabel(status: BeadsIssueStatus): string {
  switch (status) {
    case 'open':
      return translate('beads.status.open', 'Open')
    case 'in_progress':
      return translate('beads.status.in_progress', 'In progress')
    case 'blocked':
      return translate('beads.status.blocked', 'Blocked')
    case 'deferred':
      return translate('beads.status.deferred', 'Deferred')
    case 'closed':
      return translate('beads.status.closed', 'Closed')
    case 'pinned':
      return translate('beads.status.pinned', 'Pinned')
    case 'hooked':
      return translate('beads.status.hooked', 'Hooked')
  }
}

// Why: bd's native status set the filter controls expose — closed is reachable
// too but is modeled as a separate open/closed axis by most callers, so the
// active-work statuses lead.
export const BEADS_FILTERABLE_STATUSES: readonly BeadsIssueStatus[] = [
  'open',
  'in_progress',
  'blocked',
  'deferred',
  'closed'
]

// Why: bd priority is an int 0-4 with 0 = highest. Render it as P0..P4 so the
// list/dialog never leak the raw integer (acceptance requirement).
export function getBeadsPriorityLabel(priority: BeadsIssuePriority): string {
  return `P${priority}`
}

// Why: P0/P1 read as elevated urgency, P2 neutral, P3/P4 de-emphasized — a
// coarse three-bucket tone so the label carries meaning at a glance without
// inventing five separate colors.
export function getBeadsPriorityTone(priority: BeadsIssuePriority): string {
  if (priority <= 1) {
    return 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
  }
  if (priority === 2) {
    return 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
  }
  return 'bg-muted text-muted-foreground'
}

// Why: a bd issue is "done" for roll-up purposes when closed; kept as a helper
// so the list badge and the epic-progress rollup agree on the definition.
export function isBeadsIssueClosed(status: BeadsIssueStatus): boolean {
  return status === 'closed'
}
