import React, { useMemo, useState } from 'react'
import { AlertCircle, Plus, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import type { BeadsIssueInfo, BeadsWorkItem } from '../../../../shared/beads-types'
import type { ClassifiedError } from '../../../../shared/types'
import {
  getBeadsBlockerIds,
  getOpenBeadsBlockers,
  groupBeadsDependenciesByType
} from './beads-dependency-model'

export type BeadsDependencyEditorProps = {
  issue: BeadsIssueInfo
  pickerItems: readonly BeadsWorkItem[]
  adding: boolean
  removing: boolean
  error: ClassifiedError | null
  onNavigate: (id: string) => void
  onAddDependency: (dependsOnId: string) => void
  onRemoveDependency: (dependsOnId: string) => void
  onClearError: () => void
}

// Why: a navigable dependency chip — the label body jumps to the target issue
// (loadBeadsIssueDetails, back-navigation preserved) while the trailing X asks
// to remove the edge without triggering navigation.
function DependencyChip({
  id,
  removing,
  confirming,
  onNavigate,
  onRequestRemove,
  onConfirmRemove,
  onCancelRemove
}: {
  id: string
  removing: boolean
  confirming: boolean
  onNavigate: () => void
  onRequestRemove: () => void
  onConfirmRemove: () => void
  onCancelRemove: () => void
}): React.JSX.Element {
  if (confirming) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted px-2 py-0.5 text-[11px]">
        <span className="font-mono">{id}</span>
        <button
          type="button"
          className="text-destructive hover:underline"
          disabled={removing}
          onClick={onConfirmRemove}
        >
          {translate('beads.dep.confirmRemove', 'Remove')}
        </button>
        <button
          type="button"
          className="text-muted-foreground hover:underline"
          onClick={onCancelRemove}
        >
          {translate('beads.dep.cancelRemove', 'Cancel')}
        </button>
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 font-mono text-[11px] text-foreground">
      <button
        type="button"
        data-beads-dep-nav={id}
        className="hover:underline"
        onClick={onNavigate}
      >
        {id}
      </button>
      <button
        type="button"
        aria-label={translate('beads.dep.removeAria', 'Remove dependency {{value0}}', {
          value0: id
        })}
        className="text-muted-foreground hover:text-destructive"
        onClick={onRequestRemove}
      >
        <X className="size-3" />
      </button>
    </span>
  )
}

export function BeadsDependencyEditor(props: BeadsDependencyEditorProps): React.JSX.Element {
  const { issue, pickerItems } = props
  const [query, setQuery] = useState('')
  const [confirmingId, setConfirmingId] = useState<string | null>(null)

  const itemsById = useMemo(
    () => new Map(pickerItems.map((item) => [item.id, item])),
    [pickerItems]
  )
  const groups = groupBeadsDependenciesByType(issue.dependencies)
  const blockerIds = getBeadsBlockerIds(issue.id, issue.dependencies)
  const openBlockers = getOpenBeadsBlockers(blockerIds, itemsById)

  const existingIds = useMemo(
    () => new Set(issue.dependencies.map((dependency) => dependency.dependsOnId)),
    [issue.dependencies]
  )
  const candidates = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) {
      return []
    }
    return pickerItems
      .filter(
        (item) =>
          item.id !== issue.id &&
          !existingIds.has(item.id) &&
          (item.id.toLowerCase().includes(normalized) ||
            item.title.toLowerCase().includes(normalized))
      )
      .slice(0, 8)
  }, [query, pickerItems, issue.id, existingIds])

  return (
    <section data-beads-section="dependencies" className="flex flex-col gap-3">
      <h3 className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
        {translate('beads.section.dependencies', 'Dependencies')}
      </h3>

      {openBlockers.length > 0 ? (
        <div
          data-beads-open-blockers
          className="flex flex-col gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs"
        >
          <span className="font-medium text-amber-700 dark:text-amber-300">
            {translate('beads.dep.blockedBy', 'Blocked by open issues')}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {openBlockers.map((blocker) => (
              <button
                key={blocker.id}
                type="button"
                data-beads-open-blocker={blocker.id}
                onClick={() => props.onNavigate(blocker.id)}
                className="rounded-full bg-background/60 px-2 py-0.5 font-mono text-[11px] hover:underline"
              >
                {blocker.id}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {props.error ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
        >
          <AlertCircle className="mt-0.5 size-3.5 flex-none" />
          <span className="min-w-0 flex-1">{props.error.message}</span>
          <button type="button" className="hover:underline" onClick={props.onClearError}>
            {translate('beads.dep.dismiss', 'Dismiss')}
          </button>
        </div>
      ) : null}

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
                  <DependencyChip
                    key={`${dependency.type}:${dependency.dependsOnId}`}
                    id={dependency.dependsOnId}
                    removing={props.removing}
                    confirming={confirmingId === dependency.dependsOnId}
                    onNavigate={() => props.onNavigate(dependency.dependsOnId)}
                    onRequestRemove={() => setConfirmingId(dependency.dependsOnId)}
                    onConfirmRemove={() => {
                      props.onRemoveDependency(dependency.dependsOnId)
                      setConfirmingId(null)
                    }}
                    onCancelRemove={() => setConfirmingId(null)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-1">
        <Input
          value={query}
          aria-label={translate('beads.dep.addAria', 'Add a blocking dependency')}
          placeholder={translate('beads.dep.addPlaceholder', 'Block on… (search id or title)')}
          onChange={(e) => setQuery(e.target.value)}
          className="h-8 text-xs"
        />
        {candidates.length > 0 ? (
          <ul className="flex flex-col gap-0.5 rounded-md border border-border/50 bg-muted/30 p-1">
            {candidates.map((candidate) => (
              <li key={candidate.id}>
                <button
                  type="button"
                  data-beads-dep-candidate={candidate.id}
                  disabled={props.adding}
                  onClick={() => {
                    props.onAddDependency(candidate.id)
                    setQuery('')
                  }}
                  className={cn(
                    'flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-muted/60',
                    props.adding && 'opacity-60'
                  )}
                >
                  <Plus className="size-3 flex-none text-muted-foreground" />
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {candidate.id}
                  </span>
                  <span className="min-w-0 truncate">{candidate.title}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  )
}
