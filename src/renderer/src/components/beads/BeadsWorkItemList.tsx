import React from 'react'
import { translate } from '@/i18n/i18n'
import type { BeadsWorkItem } from '../../../../shared/beads-types'
import type { ClassifiedError } from '../../../../shared/types'
import type { BeadsDiagnosticsResult } from '@/store/slices/beads-cache'
import { BeadsWorkItemRow } from './BeadsWorkItemRow'
import {
  BeadsEmptyList,
  BeadsListError,
  BeadsListSkeleton,
  BeadsUninitializedGuidance
} from './BeadsListStates'

export type BeadsWorkItemListProps = {
  items: readonly BeadsWorkItem[]
  loading: boolean
  error: ClassifiedError | null
  diagnostics: BeadsDiagnosticsResult | null
  hasFilters: boolean
  onOpenItem: (item: BeadsWorkItem) => void
}

function ColumnHeader(): React.JSX.Element {
  return (
    <div className="flex-none grid grid-cols-[90px_minmax(0,3fr)_minmax(120px,1fr)_110px] gap-3 border-b border-border/50 px-3 py-2 text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
      <span>{translate('beads.column.id', 'Pri / ID')}</span>
      <span>{translate('beads.column.title', 'Title')}</span>
      <span>{translate('beads.column.status', 'Status / Type')}</span>
      <span>{translate('beads.column.updated', 'Updated')}</span>
    </div>
  )
}

// Why: the not-initialized / bd-missing guidance replaces the whole list body
// (no rows exist) — checked before the loading/empty branches so a stale empty
// cache never masks the actionable guidance.
function shouldShowGuidance(diagnostics: BeadsDiagnosticsResult | null): boolean {
  return diagnostics !== null && (diagnostics.bdAvailable !== true || !diagnostics.repoInitialized)
}

export function BeadsWorkItemList({
  items,
  loading,
  error,
  diagnostics,
  hasFilters,
  onOpenItem
}: BeadsWorkItemListProps): React.JSX.Element {
  return (
    <div className="flex min-h-0 max-h-full flex-col overflow-hidden rounded-md rounded-t-none border border-t-0 border-border/50 bg-muted/50 shadow-sm">
      <ColumnHeader />
      <div
        className="min-h-0 flex-1 overflow-y-auto scrollbar-sleek"
        style={{ scrollbarGutter: 'stable' }}
      >
        {error ? <BeadsListError error={error} /> : null}
        {shouldShowGuidance(diagnostics) ? (
          <BeadsUninitializedGuidance diagnostics={diagnostics as BeadsDiagnosticsResult} />
        ) : loading && items.length === 0 ? (
          <BeadsListSkeleton />
        ) : items.length === 0 ? (
          <BeadsEmptyList hasFilters={hasFilters} />
        ) : (
          <div className="divide-y divide-border/50">
            {items.map((item) => (
              <BeadsWorkItemRow key={item.id} item={item} onOpen={onOpenItem} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
