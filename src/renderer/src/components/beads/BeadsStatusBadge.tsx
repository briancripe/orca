import React from 'react'
import { cn } from '@/lib/utils'
import type { BeadsIssuePriority, BeadsIssueStatus } from '../../../../shared/beads-types'
import {
  BEADS_STATUS_TONE,
  getBeadsPriorityLabel,
  getBeadsPriorityTone,
  getBeadsStatusLabel
} from './beads-status-priority'

export function BeadsStatusBadge({
  status,
  className
}: {
  status: BeadsIssueStatus
  className?: string
}): React.JSX.Element {
  return (
    <span
      data-beads-status={status}
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide',
        BEADS_STATUS_TONE[status],
        className
      )}
    >
      {getBeadsStatusLabel(status)}
    </span>
  )
}

export function BeadsPriorityBadge({
  priority,
  className
}: {
  priority: BeadsIssuePriority
  className?: string
}): React.JSX.Element {
  return (
    <span
      data-beads-priority={priority}
      className={cn(
        'inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums',
        getBeadsPriorityTone(priority),
        className
      )}
    >
      {getBeadsPriorityLabel(priority)}
    </span>
  )
}
