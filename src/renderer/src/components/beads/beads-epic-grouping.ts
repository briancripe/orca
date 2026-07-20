/* Epic-grouping helpers for the beads list view. Pure so the group partition
   and the children status roll-up can be asserted without loading anything.

   Children come from a per-epic `--parent` list fetch (see
   use-beads-epic-groups.ts) — never a per-row bd call — so grouping stays O(1)
   invocations per epic, not per item. */
import type { BeadsWorkItem } from '../../../../shared/beads-types'
import { isBeadsIssueClosed } from './beads-status-priority'

export type BeadsEpicProgress = { closed: number; total: number }

// Why: progress is a closed/total roll-up of the epic's children (getEpicProgress
// on the main side now counts closed children too, so these totals are
// trustworthy). Percent is left to the renderer.
export function getBeadsEpicProgress(children: readonly BeadsWorkItem[]): BeadsEpicProgress {
  return {
    closed: children.filter((child) => isBeadsIssueClosed(child.status)).length,
    total: children.length
  }
}

export function getBeadsEpics(items: readonly BeadsWorkItem[]): BeadsWorkItem[] {
  return items.filter((item) => item.issueType === 'epic')
}

// Why: an "orphan" is any non-epic list row that isn't a child of a shown epic —
// those render in the flat ungrouped section so grouping never hides an issue.
export function computeBeadsOrphans(
  items: readonly BeadsWorkItem[],
  childIds: ReadonlySet<string>
): BeadsWorkItem[] {
  return items.filter((item) => item.issueType !== 'epic' && !childIds.has(item.id))
}

export function collectBeadsChildIds(
  childrenByEpicId: Readonly<Record<string, readonly BeadsWorkItem[]>>
): Set<string> {
  const ids = new Set<string>()
  for (const children of Object.values(childrenByEpicId)) {
    for (const child of children) {
      ids.add(child.id)
    }
  }
  return ids
}
