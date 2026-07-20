/* oxlint-disable react-doctor/no-adjust-state-on-prop-change -- Why: the dialog
   reseeds its edit form + reason panels from the freshly-fetched bd issue when
   the selected issue identity changes, mirroring GitLabItemDialog. */
import React, { useEffect, useState } from 'react'
import { Check, LoaderCircle, Pencil, RotateCcw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { VisuallyHidden } from 'radix-ui'
import { translate } from '@/i18n/i18n'
import type { BeadsIssueInfo, BeadsIssuePriority } from '../../../../shared/beads-types'
import type { ClassifiedError } from '../../../../shared/types'
import type { BeadsIssueUpdate } from '@/store/slices/beads'
import { BeadsPriorityBadge, BeadsStatusBadge } from './BeadsStatusBadge'
import { BeadsProseSections } from './BeadsProseSections'
import { BeadsCommentSection } from './BeadsCommentSection'
import { BeadsDependencySection } from './BeadsDependencySection'
import {
  buildBeadsIssueUpdate,
  buildBeadsLabelUpdate,
  toBeadsEditForm,
  type BeadsEditForm
} from './beads-issue-edit-model'
import { isBeadsIssueClosed } from './beads-status-priority'

export type BeadsItemDialogProps = {
  open: boolean
  issue: BeadsIssueInfo | null
  loading: boolean
  error: ClassifiedError | null
  savingEdit: boolean
  commenting: boolean
  changingStatus: boolean
  onClose: () => void
  onSaveEdit: (update: BeadsIssueUpdate) => void
  onAddComment: (text: string) => void
  onCloseIssue: (reason?: string) => void
  onReopenIssue: (reason?: string) => void
  // Slot for the interactive dependency surface (bead orca-0cc.14). Falls back
  // to the read-only grouped view when not provided.
  dependencySlot?: React.ReactNode
}

function splitLabels(value: string): string[] {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
}

export function BeadsItemDialog(props: BeadsItemDialogProps): React.JSX.Element {
  const { issue, open } = props
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<BeadsEditForm | null>(null)
  const [labelsDraft, setLabelsDraft] = useState('')
  const [closePanelOpen, setClosePanelOpen] = useState(false)
  const [closeReason, setCloseReason] = useState('')

  const issueId = issue?.id ?? null
  useEffect(() => {
    setEditing(false)
    setClosePanelOpen(false)
    setCloseReason('')
    if (issue) {
      setForm(toBeadsEditForm(issue))
      setLabelsDraft(issue.labels.join(', '))
    } else {
      setForm(null)
      setLabelsDraft('')
    }
  }, [issueId, issue])

  const handleSave = (): void => {
    if (!issue || !form) {
      return
    }
    const fieldUpdate = buildBeadsIssueUpdate(issue, form) ?? {}
    const labelUpdate = buildBeadsLabelUpdate(issue.labels, splitLabels(labelsDraft)) ?? {}
    const merged: BeadsIssueUpdate = { ...fieldUpdate, ...labelUpdate }
    if (Object.keys(merged).length > 0) {
      props.onSaveEdit(merged)
    }
    setEditing(false)
  }

  const closed = issue ? isBeadsIssueClosed(issue.status) : false

  return (
    <Sheet open={open} onOpenChange={(next) => (!next ? props.onClose() : undefined)}>
      <SheetContent side="right" className="flex w-full max-w-2xl flex-col gap-0 p-0 sm:max-w-2xl">
        <VisuallyHidden.Root>
          <SheetDescription>
            {translate('beads.dialog.description', 'Beads issue details')}
          </SheetDescription>
        </VisuallyHidden.Root>

        {props.loading && !issue ? (
          <div className="flex flex-1 items-center justify-center py-16">
            <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : props.error && !issue ? (
          <div
            role="alert"
            className="flex flex-1 items-center justify-center px-6 text-center text-sm text-destructive"
          >
            {props.error.message ||
              translate('beads.dialog.loadError', 'Could not load this Beads issue.')}
          </div>
        ) : issue && form ? (
          <>
            <header className="flex flex-none flex-col gap-2 border-b border-border/50 px-5 py-4">
              <div className="flex items-center gap-2">
                <BeadsPriorityBadge priority={issue.priority} />
                <BeadsStatusBadge status={issue.status} />
                <span className="font-mono text-xs text-muted-foreground">{issue.id}</span>
                <span className="ml-auto flex items-center gap-1.5">
                  {editing ? (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleSave}
                        disabled={props.savingEdit}
                      >
                        {props.savingEdit ? (
                          <LoaderCircle className="size-4 animate-spin" />
                        ) : (
                          <Check className="size-4" />
                        )}
                        {translate('beads.dialog.save', 'Save')}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditing(false)}
                      >
                        {translate('beads.dialog.cancel', 'Cancel')}
                      </Button>
                    </>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setEditing(true)}
                    >
                      <Pencil className="size-4" />
                      {translate('beads.dialog.edit', 'Edit')}
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    onClick={props.onClose}
                    aria-label={translate('beads.dialog.close', 'Close details')}
                  >
                    <X className="size-4" />
                  </Button>
                </span>
              </div>
              {editing ? (
                <Input
                  value={form.title}
                  aria-label={translate('beads.dialog.titleAria', 'Issue title')}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="h-9 text-base font-semibold"
                />
              ) : (
                <SheetTitle className="text-base font-semibold text-foreground">
                  {issue.title}
                </SheetTitle>
              )}
              {editing ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    value={form.type}
                    aria-label={translate('beads.dialog.typeAria', 'Issue type')}
                    onChange={(e) => setForm({ ...form, type: e.target.value })}
                    placeholder={translate('beads.dialog.typePlaceholder', 'Type')}
                    className="h-8 w-32 text-xs"
                  />
                  <select
                    value={form.priority}
                    aria-label={translate('beads.dialog.priorityAria', 'Priority')}
                    onChange={(e) =>
                      setForm({ ...form, priority: Number(e.target.value) as BeadsIssuePriority })
                    }
                    className="h-8 rounded-md border border-border/60 bg-transparent px-2 text-xs text-foreground"
                  >
                    {[0, 1, 2, 3, 4].map((priority) => (
                      <option key={priority} value={priority}>
                        {`P${priority}`}
                      </option>
                    ))}
                  </select>
                  <Input
                    value={form.assignee}
                    aria-label={translate('beads.dialog.assigneeAria', 'Assignee')}
                    onChange={(e) => setForm({ ...form, assignee: e.target.value })}
                    placeholder={translate('beads.dialog.assigneePlaceholder', 'Assignee')}
                    className="h-8 w-40 text-xs"
                  />
                  <Input
                    value={labelsDraft}
                    aria-label={translate('beads.dialog.labelsAria', 'Labels (comma separated)')}
                    onChange={(e) => setLabelsDraft(e.target.value)}
                    placeholder={translate('beads.dialog.labelsPlaceholder', 'label-a, label-b')}
                    className="h-8 w-48 text-xs"
                  />
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>{issue.issueType}</span>
                  {issue.assignee ? (
                    <span className="rounded-full bg-muted px-2 py-0.5">{issue.assignee}</span>
                  ) : null}
                  {issue.labels.map((label) => (
                    <span key={label} className="rounded-full bg-muted px-2 py-0.5">
                      {label}
                    </span>
                  ))}
                </div>
              )}
            </header>

            <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-4 scrollbar-sleek">
              <BeadsProseSections
                issue={issue}
                editing={editing}
                form={form}
                onFormChange={setForm}
              />
              {props.dependencySlot ?? <BeadsDependencySection dependencies={issue.dependencies} />}
              <BeadsCommentSection
                comments={issue.comments ?? []}
                submitting={props.commenting}
                onAddComment={props.onAddComment}
              />
            </div>

            <footer className="flex flex-none flex-col gap-2 border-t border-border/50 px-5 py-3">
              {closePanelOpen && !closed ? (
                <div className="flex flex-col gap-2">
                  <Input
                    value={closeReason}
                    aria-label={translate(
                      'beads.dialog.closeReasonAria',
                      'Close reason (optional)'
                    )}
                    onChange={(e) => setCloseReason(e.target.value)}
                    placeholder={translate('beads.dialog.closeReason', 'Reason (optional)')}
                    className="h-8 text-xs"
                  />
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setClosePanelOpen(false)}
                    >
                      {translate('beads.dialog.cancel', 'Cancel')}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      disabled={props.changingStatus}
                      onClick={() => {
                        props.onCloseIssue(closeReason.trim() || undefined)
                        setClosePanelOpen(false)
                      }}
                    >
                      {props.changingStatus ? (
                        <LoaderCircle className="size-4 animate-spin" />
                      ) : (
                        <Check className="size-4" />
                      )}
                      {translate('beads.dialog.confirmClose', 'Close issue')}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex justify-end">
                  {closed ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={props.changingStatus}
                      onClick={() => props.onReopenIssue()}
                    >
                      <RotateCcw className="size-4" />
                      {translate('beads.dialog.reopen', 'Reopen')}
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setClosePanelOpen(true)}
                    >
                      <Check className="size-4" />
                      {translate('beads.dialog.closeIssue', 'Close issue')}
                    </Button>
                  )}
                </div>
              )}
            </footer>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}
