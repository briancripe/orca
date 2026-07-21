import React from 'react'
import { translate } from '@/i18n/i18n'
import type { BeadsDependency } from '../../../../shared/beads-types'
import { groupBeadsDependenciesByType } from './beads-dependency-model'

export function BeadsDependencySection({
  dependencies
}: {
  dependencies: readonly BeadsDependency[]
}): React.JSX.Element {
  const groups = groupBeadsDependenciesByType(dependencies)
  return (
    <section data-beads-section="dependencies" className="flex flex-col gap-3">
      <h3 className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
        {translate('beads.section.dependencies', 'Dependencies')}
      </h3>
      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground/70">
          {translate('beads.dependencies.empty', 'No dependencies.')}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {groups.map((group) => (
            <div key={group.type} data-beads-dep-group={group.type} className="flex flex-col gap-1">
              <span className="text-[11px] text-muted-foreground">{group.label}</span>
              <div className="flex flex-wrap gap-1.5">
                {group.dependencies.map((dependency) => (
                  <span
                    key={`${dependency.type}:${dependency.dependsOnId}`}
                    className="rounded-full bg-muted px-2 py-0.5 font-mono text-[11px] text-foreground"
                  >
                    {dependency.dependsOnId}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
