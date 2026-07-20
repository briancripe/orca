/* Pure edit-form <-> BeadsIssueUpdate diffing for the item dialog. Only
   changed fields are emitted so an edit never re-sends untouched prose, and
   label changes are split into the add/remove sets bd's update expects. */
import type { BeadsIssueUpdate } from '@/store/slices/beads'
import type { BeadsIssueInfo, BeadsIssuePriority } from '../../../../shared/beads-types'

export type BeadsEditForm = {
  title: string
  description: string
  design: string
  acceptanceCriteria: string
  notes: string
  type: string
  priority: BeadsIssuePriority
  assignee: string
}

export function toBeadsEditForm(issue: BeadsIssueInfo): BeadsEditForm {
  return {
    title: issue.title,
    description: issue.description ?? '',
    design: issue.design ?? '',
    acceptanceCriteria: issue.acceptanceCriteria ?? '',
    notes: issue.notes ?? '',
    type: issue.issueType,
    priority: issue.priority,
    assignee: issue.assignee ?? ''
  }
}

function diffString(next: string, previous: string | undefined): string | undefined {
  const trimmedNext = next.trim()
  if (trimmedNext === (previous ?? '').trim()) {
    return undefined
  }
  return trimmedNext
}

// Why: returns undefined (not an empty object) when nothing changed so the
// caller can short-circuit the mutation entirely.
export function buildBeadsIssueUpdate(
  issue: BeadsIssueInfo,
  form: BeadsEditForm
): BeadsIssueUpdate | undefined {
  const update: BeadsIssueUpdate = {}
  const title = diffString(form.title, issue.title)
  if (title !== undefined && title.length > 0) {
    update.title = title
  }
  const description = diffString(form.description, issue.description)
  if (description !== undefined) {
    update.description = description
  }
  const design = diffString(form.design, issue.design)
  if (design !== undefined) {
    update.design = design
  }
  const acceptanceCriteria = diffString(form.acceptanceCriteria, issue.acceptanceCriteria)
  if (acceptanceCriteria !== undefined) {
    update.acceptanceCriteria = acceptanceCriteria
  }
  const notes = diffString(form.notes, issue.notes)
  if (notes !== undefined) {
    update.notes = notes
  }
  const type = diffString(form.type, issue.issueType)
  if (type !== undefined && type.length > 0) {
    update.type = type
  }
  if (form.priority !== issue.priority) {
    update.priority = form.priority
  }
  const assignee = diffString(form.assignee, issue.assignee)
  if (assignee !== undefined) {
    update.assignee = assignee
  }
  return Object.keys(update).length > 0 ? update : undefined
}

// Why: label add/remove is a separate axis from field edits — the dialog's
// label chips call this to compute the delta against the issue's current set.
export function buildBeadsLabelUpdate(
  currentLabels: readonly string[],
  nextLabels: readonly string[]
): { addLabels?: string[]; removeLabels?: string[] } | undefined {
  const current = new Set(currentLabels)
  const next = new Set(nextLabels)
  const addLabels = [...next].filter((label) => !current.has(label))
  const removeLabels = [...current].filter((label) => !next.has(label))
  if (addLabels.length === 0 && removeLabels.length === 0) {
    return undefined
  }
  const update: { addLabels?: string[]; removeLabels?: string[] } = {}
  if (addLabels.length > 0) {
    update.addLabels = addLabels
  }
  if (removeLabels.length > 0) {
    update.removeLabels = removeLabels
  }
  return update
}
