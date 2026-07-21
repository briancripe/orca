import React, { useId } from 'react'
import { Layers, Plus, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import type { BeadsIssueStatus } from '../../../../shared/beads-types'
import { BEADS_FILTERABLE_STATUSES, getBeadsStatusLabel } from './beads-status-priority'
import { toggleBeadsStatusFilter, type BeadsFilterState } from './beads-filter-model'

export type BeadsFilterBarProps = {
  state: BeadsFilterState
  onChange: (next: BeadsFilterState) => void
  labelSuggestions: readonly string[]
  assigneeSuggestions: readonly string[]
  typeSuggestions: readonly string[]
  loading: boolean
  groupByEpic: boolean
  onToggleGroupByEpic: () => void
  onCreate: () => void
  onRefresh: () => void
}

function DatalistInput({
  value,
  placeholder,
  suggestions,
  ariaLabel,
  onChange
}: {
  value: string
  placeholder: string
  suggestions: readonly string[]
  ariaLabel: string
  onChange: (value: string) => void
}): React.JSX.Element {
  const listId = useId()
  return (
    <>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        list={suggestions.length > 0 ? listId : undefined}
        className="h-8 w-[140px] text-xs"
      />
      {suggestions.length > 0 ? (
        <datalist id={listId}>
          {suggestions.map((suggestion) => (
            <option key={suggestion} value={suggestion} />
          ))}
        </datalist>
      ) : null}
    </>
  )
}

export function BeadsFilterBar({
  state,
  onChange,
  labelSuggestions,
  assigneeSuggestions,
  typeSuggestions,
  loading,
  groupByEpic,
  onToggleGroupByEpic,
  onCreate,
  onRefresh
}: BeadsFilterBarProps): React.JSX.Element {
  const setStatuses = (status: BeadsIssueStatus): void =>
    onChange({ ...state, statuses: toggleBeadsStatusFilter(state.statuses, status) })

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1">
        {BEADS_FILTERABLE_STATUSES.map((status) => {
          const active = state.statuses.includes(status)
          return (
            <button
              key={status}
              type="button"
              aria-pressed={active}
              onClick={() => setStatuses(status)}
              className={cn(
                'rounded-md border px-2 py-1 text-xs transition',
                active
                  ? 'border-foreground/40 bg-muted/70 text-foreground'
                  : 'border-border/40 bg-transparent text-muted-foreground hover:bg-muted/40'
              )}
            >
              {getBeadsStatusLabel(status)}
            </button>
          )
        })}
      </div>

      <button
        type="button"
        aria-pressed={state.ready}
        onClick={() => onChange({ ...state, ready: !state.ready })}
        className={cn(
          'rounded-md border px-2 py-1 text-xs font-medium transition',
          state.ready
            ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
            : 'border-border/40 bg-transparent text-muted-foreground hover:bg-muted/40'
        )}
      >
        {translate('beads.filter.ready', 'Ready')}
      </button>

      <DatalistInput
        value={state.type}
        placeholder={translate('beads.filter.type', 'Type')}
        suggestions={typeSuggestions}
        ariaLabel={translate('beads.filter.typeAria', 'Filter by type')}
        onChange={(value) => onChange({ ...state, type: value })}
      />
      <DatalistInput
        value={state.label}
        placeholder={translate('beads.filter.label', 'Label')}
        suggestions={labelSuggestions}
        ariaLabel={translate('beads.filter.labelAria', 'Filter by label')}
        onChange={(value) => onChange({ ...state, label: value })}
      />
      <DatalistInput
        value={state.assignee}
        placeholder={translate('beads.filter.assignee', 'Assignee')}
        suggestions={assigneeSuggestions}
        ariaLabel={translate('beads.filter.assigneeAria', 'Filter by assignee')}
        onChange={(value) => onChange({ ...state, assignee: value })}
      />

      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          aria-pressed={groupByEpic}
          onClick={onToggleGroupByEpic}
          className={cn(
            'flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition',
            groupByEpic
              ? 'border-foreground/40 bg-muted/70 text-foreground'
              : 'border-border/40 bg-transparent text-muted-foreground hover:bg-muted/40'
          )}
        >
          <Layers className="size-3.5" />
          {translate('beads.filter.groupByEpic', 'Group by epic')}
        </button>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          onClick={onRefresh}
          disabled={loading}
          aria-label={translate('beads.action.refresh', 'Refresh Beads issues')}
        >
          <RefreshCw className={cn('size-4', loading && 'animate-spin')} />
        </Button>
        <Button type="button" size="sm" onClick={onCreate}>
          <Plus className="size-4" />
          {translate('beads.action.newIssue', 'New issue')}
        </Button>
      </div>
    </div>
  )
}
