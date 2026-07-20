/* oxlint-disable react-doctor/no-adjust-state-on-prop-change -- Why: the create
   form resets its draft to empty each time the dialog re-opens, mirroring the
   reseed pattern the GitLab/GitHub create dialogs use. */
import React, { useEffect, useId, useState } from 'react'
import { LoaderCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { translate } from '@/i18n/i18n'
import type { BeadsIssuePriority } from '../../../../shared/beads-types'
import type { BeadsCreateInput } from '@/store/slices/beads-cache'

type CreateFormState = {
  title: string
  description: string
  type: string
  priority: BeadsIssuePriority
  assignee: string
  labels: string
}

const EMPTY_FORM: CreateFormState = {
  title: '',
  description: '',
  type: '',
  priority: 2,
  assignee: '',
  labels: ''
}

function splitLabels(value: string): string[] {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
}

function toCreateInput(form: CreateFormState): BeadsCreateInput {
  const input: BeadsCreateInput = { title: form.title.trim() }
  if (form.description.trim()) {
    input.description = form.description.trim()
  }
  if (form.type.trim()) {
    input.type = form.type.trim()
  }
  input.priority = form.priority
  if (form.assignee.trim()) {
    input.assignee = form.assignee.trim()
  }
  const labels = splitLabels(form.labels)
  if (labels.length > 0) {
    input.labels = labels
  }
  return input
}

export function BeadsCreateDialog({
  open,
  submitting,
  labelSuggestions,
  assigneeSuggestions,
  typeSuggestions,
  onOpenChange,
  onCreate
}: {
  open: boolean
  submitting: boolean
  labelSuggestions: readonly string[]
  assigneeSuggestions: readonly string[]
  typeSuggestions: readonly string[]
  onOpenChange: (open: boolean) => void
  onCreate: (input: BeadsCreateInput) => void
}): React.JSX.Element {
  const [form, setForm] = useState<CreateFormState>(EMPTY_FORM)
  const typeListId = useId()
  const assigneeListId = useId()
  const labelListId = useId()

  useEffect(() => {
    if (open) {
      setForm(EMPTY_FORM)
    }
  }, [open])

  const canSubmit = form.title.trim().length > 0 && !submitting

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{translate('beads.create.title', 'New Beads issue')}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <Input
            value={form.title}
            aria-label={translate('beads.create.titleAria', 'Title')}
            placeholder={translate('beads.create.titlePlaceholder', 'Title')}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
          <textarea
            value={form.description}
            aria-label={translate('beads.create.descriptionAria', 'Description')}
            placeholder={translate('beads.create.descriptionPlaceholder', 'Description')}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="min-h-24 w-full resize-y rounded-md border border-border/60 bg-transparent p-2 text-sm text-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring scrollbar-sleek"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={form.type}
              list={typeSuggestions.length > 0 ? typeListId : undefined}
              aria-label={translate('beads.create.typeAria', 'Type')}
              placeholder={translate('beads.create.typePlaceholder', 'Type')}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
              className="w-32"
            />
            <datalist id={typeListId}>
              {typeSuggestions.map((suggestion) => (
                <option key={suggestion} value={suggestion} />
              ))}
            </datalist>
            <select
              value={form.priority}
              aria-label={translate('beads.create.priorityAria', 'Priority')}
              onChange={(e) =>
                setForm({ ...form, priority: Number(e.target.value) as BeadsIssuePriority })
              }
              className="h-9 rounded-md border border-border/60 bg-transparent px-2 text-sm text-foreground"
            >
              {[0, 1, 2, 3, 4].map((priority) => (
                <option key={priority} value={priority}>
                  {`P${priority}`}
                </option>
              ))}
            </select>
          </div>
          <Input
            value={form.assignee}
            list={assigneeSuggestions.length > 0 ? assigneeListId : undefined}
            aria-label={translate('beads.create.assigneeAria', 'Assignee')}
            placeholder={translate('beads.create.assigneePlaceholder', 'Assignee')}
            onChange={(e) => setForm({ ...form, assignee: e.target.value })}
          />
          <datalist id={assigneeListId}>
            {assigneeSuggestions.map((suggestion) => (
              <option key={suggestion} value={suggestion} />
            ))}
          </datalist>
          <Input
            value={form.labels}
            list={labelSuggestions.length > 0 ? labelListId : undefined}
            aria-label={translate('beads.create.labelsAria', 'Labels (comma separated)')}
            placeholder={translate('beads.create.labelsPlaceholder', 'label-a, label-b')}
            onChange={(e) => setForm({ ...form, labels: e.target.value })}
          />
          <datalist id={labelListId}>
            {labelSuggestions.map((suggestion) => (
              <option key={suggestion} value={suggestion} />
            ))}
          </datalist>
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {translate('beads.create.cancel', 'Cancel')}
          </Button>
          <Button type="button" disabled={!canSubmit} onClick={() => onCreate(toCreateInput(form))}>
            {submitting ? <LoaderCircle className="size-4 animate-spin" /> : null}
            {translate('beads.create.submit', 'Create issue')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
