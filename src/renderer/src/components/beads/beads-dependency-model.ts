/* Dependency-edge presentation helpers for the beads item dialog. Pure so the
   grouped-by-type rendering can be asserted without a live issue payload.

   Edge direction (per src/main/beads/dependencies.ts): a `blocks` edge
   { issueId: A, dependsOnId: B } means "A is blocked by B" — B gates A. */
import { translate } from '@/i18n/i18n'
import type { BeadsDependency, BeadsDependencyType } from '../../../../shared/beads-types'

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
