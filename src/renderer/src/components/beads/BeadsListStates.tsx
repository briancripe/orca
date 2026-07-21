import React from 'react'
import { Waypoints } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import type { ClassifiedError } from '../../../../shared/types'
import type { BeadsDiagnosticsResult } from '@/store/slices/beads-cache'

export function BeadsListSkeleton(): React.JSX.Element {
  return (
    <div className="divide-y divide-border/50" data-beads-state="loading">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="grid w-full gap-3 px-3 py-2 grid-cols-[90px_minmax(0,3fr)_minmax(120px,1fr)_110px]"
        >
          <div className="h-4 w-16 animate-pulse rounded bg-muted/70" />
          <div className="h-4 w-3/5 animate-pulse rounded bg-muted/70" />
          <div className="h-4 w-20 animate-pulse rounded bg-muted/60" />
          <div className="h-3 w-16 animate-pulse rounded bg-muted/60" />
        </div>
      ))}
    </div>
  )
}

export function BeadsListError({ error }: { error: ClassifiedError }): React.JSX.Element {
  return (
    <div
      role="alert"
      data-beads-state="error"
      className="border-b border-border px-4 py-4 text-sm text-destructive"
    >
      {error.message ||
        translate('beads.list.error', 'Could not load Beads issues for this repository.')}
    </div>
  )
}

// Why: bd's `.beads/` store not being initialized is a distinct, separately
// actionable state from "bd missing" — surface the exact `bd init` guidance so
// the user can fix it in place rather than assuming the tool is broken.
export function BeadsUninitializedGuidance({
  diagnostics
}: {
  diagnostics: BeadsDiagnosticsResult
}): React.JSX.Element {
  const bdMissing = diagnostics.bdAvailable !== true
  return (
    <div
      data-beads-state={bdMissing ? 'bd-unavailable' : 'repo-not-initialized'}
      className="flex flex-col items-center justify-center px-6 py-14 text-center"
    >
      <Waypoints className="mb-4 size-8 text-muted-foreground/60" />
      <p className="text-base font-medium text-foreground">
        {bdMissing
          ? translate('beads.guidance.bdMissing.title', 'Beads (bd) is not installed')
          : translate('beads.guidance.uninitialized.title', 'This repository has no Beads store')}
      </p>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        {bdMissing
          ? translate(
              'beads.guidance.bdMissing.body',
              'Install the bd binary and make sure it is on PATH to browse and manage Beads issues here.'
            )
          : translate(
              'beads.guidance.uninitialized.body',
              'Run `bd init` in this repository to create its Beads store, then reload.'
            )}
      </p>
    </div>
  )
}

export function BeadsEmptyList({ hasFilters }: { hasFilters: boolean }): React.JSX.Element {
  return (
    <div data-beads-state="empty" className="px-4 py-12 text-center text-sm text-muted-foreground">
      {hasFilters
        ? translate('beads.list.emptyFiltered', 'No issues match the current filters.')
        : translate('beads.list.empty', 'No Beads issues yet. Create one to get started.')}
    </div>
  )
}
