import React from 'react'
import { translate } from '@/i18n/i18n'
import type { BeadsRepoContext } from '@/store/slices/beads-cache'
import type { BeadsIssueInfo } from '../../../../shared/beads-types'
import { hasActiveBeadsFilters } from './beads-filter-model'
import { BeadsFilterBar } from './BeadsFilterBar'
import { BeadsWorkItemList } from './BeadsWorkItemList'
import { BeadsGroupedList } from './BeadsGroupedList'
import { BeadsItemDialog } from './BeadsItemDialog'
import { BeadsCreateDialog } from './BeadsCreateDialog'
import { BeadsDependencyEditor } from './BeadsDependencyEditor'
import { useBeadsTaskSurface } from './use-beads-task-surface'

// Why: the whole beads tab body lives here so TaskPage only wires the tab
// (a single `taskSource === 'beads'` branch) rather than growing its already
// oversized render with beads-specific filters / list / dialog state.
export function BeadsTaskSurface({
  ctx,
  onStartWork
}: {
  ctx: BeadsRepoContext | null
  onStartWork?: (issue: BeadsIssueInfo) => void
}): React.JSX.Element {
  const model = useBeadsTaskSurface(ctx)

  if (!ctx) {
    return (
      <div className="flex min-h-40 items-center justify-center rounded-md border border-border/50 bg-muted/50 px-6 py-12 text-center text-sm text-muted-foreground shadow-sm">
        {translate('beads.surface.noRepo', 'Select a repository to browse its Beads issues.')}
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <BeadsFilterBar
        state={model.filterState}
        onChange={model.setFilterState}
        labelSuggestions={model.labelSuggestions}
        assigneeSuggestions={model.assigneeSuggestions}
        typeSuggestions={model.typeSuggestions}
        loading={model.listLoading}
        groupByEpic={model.groupByEpic}
        onToggleGroupByEpic={() => model.setGroupByEpic(!model.groupByEpic)}
        onCreate={() => model.setCreateOpen(true)}
        onRefresh={model.refresh}
      />

      {model.groupByEpic ? (
        <BeadsGroupedList
          epics={model.epicGroups.epics}
          childrenByEpicId={model.epicGroups.childrenByEpicId}
          orphans={model.epicGroups.orphans}
          loadingEpicIds={model.epicGroups.loadingEpicIds}
          onOpenItem={model.openItem}
        />
      ) : (
        <BeadsWorkItemList
          items={model.items}
          loading={model.listLoading}
          error={model.listError}
          diagnostics={model.diagnostics}
          hasFilters={hasActiveBeadsFilters(model.filterState)}
          onOpenItem={model.openItem}
        />
      )}

      <BeadsItemDialog
        open={model.selectedIssueId !== null}
        issue={model.issueDetail}
        loading={model.detailLoading}
        error={model.detailError}
        savingEdit={model.savingEdit}
        commenting={model.commenting}
        changingStatus={model.changingStatus}
        canGoBack={model.canGoBack}
        onBack={model.back}
        onClose={model.closeDialog}
        onSaveEdit={model.saveEdit}
        onAddComment={model.addComment}
        onCloseIssue={model.closeIssue}
        onReopenIssue={model.reopenIssue}
        onStartWork={onStartWork}
        dependencySlot={
          model.issueDetail ? (
            <BeadsDependencyEditor
              issue={model.issueDetail}
              pickerItems={model.items}
              adding={model.addingDependency}
              removing={model.removingDependency}
              error={model.dependencyError}
              onNavigate={model.navigateToIssue}
              onAddDependency={model.addDependency}
              onRemoveDependency={model.removeDependency}
              onClearError={model.clearDependencyError}
            />
          ) : undefined
        }
      />

      <BeadsCreateDialog
        open={model.createOpen}
        submitting={model.creating}
        labelSuggestions={model.labelSuggestions}
        assigneeSuggestions={model.assigneeSuggestions}
        typeSuggestions={model.typeSuggestions}
        onOpenChange={model.setCreateOpen}
        onCreate={model.createIssue}
      />
    </div>
  )
}

export default BeadsTaskSurface
