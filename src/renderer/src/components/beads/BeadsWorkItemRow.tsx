import React from 'react'
import { cn } from '@/lib/utils'
import type { BeadsWorkItem } from '../../../../shared/beads-types'
import { BeadsPriorityBadge, BeadsStatusBadge } from './BeadsStatusBadge'

// Why: bd timestamps are ISO strings; render a stable locale date and guard
// against malformed values so a bad row never throws in the list.
function formatUpdatedAt(value: string): string {
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toLocaleDateString()
}

export function BeadsWorkItemRow({
  item,
  onOpen,
  className
}: {
  item: BeadsWorkItem
  onOpen: (item: BeadsWorkItem) => void
  className?: string
}): React.JSX.Element {
  return (
    <button
      type="button"
      data-beads-row={item.id}
      onClick={() => onOpen(item)}
      className={cn(
        'grid w-full cursor-pointer items-center gap-3 px-3 py-2 text-left grid-cols-[90px_minmax(0,3fr)_minmax(120px,1fr)_110px] hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none',
        className
      )}
    >
      <span className="flex items-center gap-1.5">
        <BeadsPriorityBadge priority={item.priority} />
        <span className="min-w-0 truncate font-mono text-[11px] text-muted-foreground">
          {item.id}
        </span>
      </span>
      <span className="flex min-w-0 items-center gap-2">
        <span className="min-w-0 truncate text-sm text-foreground">{item.title}</span>
        {item.labels.slice(0, 2).map((label) => (
          <span
            key={label}
            className="hidden shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground sm:inline"
          >
            {label}
          </span>
        ))}
      </span>
      <span className="flex min-w-0 items-center gap-2">
        <BeadsStatusBadge status={item.status} />
        <span className="min-w-0 truncate text-[11px] text-muted-foreground">{item.issueType}</span>
      </span>
      <span className="truncate text-xs text-muted-foreground">
        {formatUpdatedAt(item.updatedAt)}
      </span>
    </button>
  )
}
