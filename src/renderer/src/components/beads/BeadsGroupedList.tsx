import React, { useState } from 'react'
import { ChevronDown, ChevronRight, LoaderCircle } from 'lucide-react'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import type { BeadsWorkItem } from '../../../../shared/beads-types'
import { BeadsPriorityBadge, BeadsStatusBadge } from './BeadsStatusBadge'
import { BeadsWorkItemRow } from './BeadsWorkItemRow'
import { getBeadsEpicProgress } from './beads-epic-grouping'

export type BeadsGroupedListProps = {
  epics: readonly BeadsWorkItem[]
  childrenByEpicId: Readonly<Record<string, readonly BeadsWorkItem[]>>
  orphans: readonly BeadsWorkItem[]
  loadingEpicIds: ReadonlySet<string>
  onOpenItem: (item: BeadsWorkItem) => void
}

function EpicGroup({
  epic,
  childItems,
  loading,
  onOpenItem
}: {
  epic: BeadsWorkItem
  childItems: readonly BeadsWorkItem[]
  loading: boolean
  onOpenItem: (item: BeadsWorkItem) => void
}): React.JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const progress = getBeadsEpicProgress(childItems)
  const percent = progress.total > 0 ? Math.round((progress.closed / progress.total) * 100) : 0

  return (
    <div data-beads-epic-group={epic.id}>
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          aria-expanded={expanded}
          aria-label={translate('beads.epic.toggleAria', 'Toggle epic {{value0}}', {
            value0: epic.id
          })}
          onClick={() => setExpanded((open) => !open)}
          className="text-muted-foreground hover:text-foreground"
        >
          {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        </button>
        <BeadsPriorityBadge priority={epic.priority} />
        <BeadsStatusBadge status={epic.status} />
        <button
          type="button"
          data-beads-epic-open={epic.id}
          onClick={() => onOpenItem(epic)}
          className="min-w-0 flex-1 truncate text-left text-sm font-medium text-foreground hover:underline"
        >
          {epic.title}
        </button>
        {loading ? (
          <LoaderCircle className="size-4 animate-spin text-muted-foreground" />
        ) : (
          <span
            data-beads-epic-progress={epic.id}
            className="flex shrink-0 items-center gap-2 text-[11px] text-muted-foreground"
          >
            <Progress value={percent} className="h-1.5 w-20" />
            <span className="tabular-nums">
              {progress.closed}/{progress.total}
            </span>
          </span>
        )}
      </div>
      {expanded ? (
        <div className="divide-y divide-border/40 border-t border-border/40 bg-background/40 pl-6">
          {childItems.length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted-foreground/70">
              {translate('beads.epic.noChildren', 'No child issues.')}
            </p>
          ) : (
            childItems.map((child) => (
              <BeadsWorkItemRow key={child.id} item={child} onOpen={onOpenItem} />
            ))
          )}
        </div>
      ) : null}
    </div>
  )
}

export function BeadsGroupedList({
  epics,
  childrenByEpicId,
  orphans,
  loadingEpicIds,
  onOpenItem
}: BeadsGroupedListProps): React.JSX.Element {
  return (
    <div className="flex min-h-0 max-h-full flex-col overflow-hidden rounded-md rounded-t-none border border-t-0 border-border/50 bg-muted/50 shadow-sm">
      <div
        className="min-h-0 flex-1 overflow-y-auto scrollbar-sleek"
        style={{ scrollbarGutter: 'stable' }}
      >
        {epics.length === 0 && orphans.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-muted-foreground">
            {translate('beads.list.empty', 'No Beads issues yet. Create one to get started.')}
          </div>
        ) : null}

        <div className="divide-y divide-border/50">
          {epics.map((epic) => (
            <EpicGroup
              key={epic.id}
              epic={epic}
              childItems={childrenByEpicId[epic.id] ?? []}
              loading={loadingEpicIds.has(epic.id)}
              onOpenItem={onOpenItem}
            />
          ))}
        </div>

        {orphans.length > 0 ? (
          <div
            data-beads-orphan-section
            className={cn(epics.length > 0 && 'border-t border-border/50')}
          >
            <div className="px-3 py-2 text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
              {translate('beads.epic.ungrouped', 'Ungrouped')}
            </div>
            <div className="divide-y divide-border/50">
              {orphans.map((item) => (
                <BeadsWorkItemRow key={item.id} item={item} onOpen={onOpenItem} />
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
