/* Dependency-edge presentation helpers for the beads item dialog. Pure so the
   grouped-by-type rendering can be asserted without a live issue payload.

   Edge direction (per src/main/beads/dependencies.ts): a `blocks` edge
   { issueId: A, dependsOnId: B } means "A is blocked by B" — B gates A. */
import { translate } from '@/i18n/i18n'
import type {
  BeadsDependency,
  BeadsDependencyType,
  BeadsWorkItem
} from '../../../../shared/beads-types'
import { isBeadsIssueClosed } from './beads-status-priority'

export type BeadsDependencyGroup = {
  type: BeadsDependencyType
  label: string
  dependencies: BeadsDependency[]
}

// Why: stable, human-ordered grouping — blocks/parent-child lead since they
// carry the strongest workflow meaning; the rest follow in a fixed order so
// the dialog layout doesn't reshuffle between fetches.
const DEPENDENCY_TYPE_ORDER: readonly BeadsDependencyType[] = [
  'blocks',
  'parent-child',
  'related',
  'relates-to',
  'discovered-from',
  'duplicates',
  'supersedes'
]

export function getBeadsDependencyTypeLabel(type: BeadsDependencyType): string {
  switch (type) {
    case 'blocks':
      return translate('beads.dep.blocks', 'Blocked by')
    case 'parent-child':
      return translate('beads.dep.parentChild', 'Parent / child')
    case 'related':
      return translate('beads.dep.related', 'Related')
    case 'relates-to':
      return translate('beads.dep.relatesTo', 'Relates to')
    case 'discovered-from':
      return translate('beads.dep.discoveredFrom', 'Discovered from')
    case 'duplicates':
      return translate('beads.dep.duplicates', 'Duplicates')
    case 'supersedes':
      return translate('beads.dep.supersedes', 'Supersedes')
  }
}

export function groupBeadsDependenciesByType(
  dependencies: readonly BeadsDependency[]
): BeadsDependencyGroup[] {
  const byType = new Map<BeadsDependencyType, BeadsDependency[]>()
  for (const dependency of dependencies) {
    const bucket = byType.get(dependency.type) ?? []
    bucket.push(dependency)
    byType.set(dependency.type, bucket)
  }
  return DEPENDENCY_TYPE_ORDER.filter((type) => byType.has(type)).map((type) => ({
    type,
    label: getBeadsDependencyTypeLabel(type),
    dependencies: byType.get(type) ?? []
  }))
}

// Why: a `blocks` edge { issueId: X, dependsOnId: B } means X is blocked by B —
// the blocker ids that gate the shown issue are the dependsOnId of its own
// blocks edges.
export function getBeadsBlockerIds(
  issueId: string,
  dependencies: readonly BeadsDependency[]
): string[] {
  return dependencies
    .filter((dependency) => dependency.type === 'blocks' && dependency.issueId === issueId)
    .map((dependency) => dependency.dependsOnId)
}

// Why: "blocked by an OPEN blocker" is the actionable subset — a closed blocker
// no longer gates the issue. Blocker status comes from the cached list rows
// (no extra bd call); a blocker missing from the list is treated as open so it
// is never silently dropped.
export function getOpenBeadsBlockers(
  blockerIds: readonly string[],
  itemsById: ReadonlyMap<string, BeadsWorkItem>
): { id: string; item: BeadsWorkItem | null }[] {
  return blockerIds
    .map((id) => ({ id, item: itemsById.get(id) ?? null }))
    .filter(({ item }) => item === null || !isBeadsIssueClosed(item.status))
}
