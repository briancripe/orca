import React from 'react'
import CommentMarkdown from '@/components/sidebar/CommentMarkdown'
import { translate } from '@/i18n/i18n'
import type { BeadsIssueInfo } from '../../../../shared/beads-types'
import type { BeadsEditForm } from './beads-issue-edit-model'

type ProseFieldKey = 'description' | 'design' | 'acceptanceCriteria' | 'notes'

function useProseFields(): { key: ProseFieldKey; label: string }[] {
  return [
    { key: 'description', label: translate('beads.section.description', 'Description') },
    { key: 'design', label: translate('beads.section.design', 'Design') },
    {
      key: 'acceptanceCriteria',
      label: translate('beads.section.acceptanceCriteria', 'Acceptance criteria')
    },
    { key: 'notes', label: translate('beads.section.notes', 'Notes') }
  ]
}

function issueValue(issue: BeadsIssueInfo, key: ProseFieldKey): string {
  return issue[key] ?? ''
}

export function BeadsProseSections({
  issue,
  editing,
  form,
  onFormChange
}: {
  issue: BeadsIssueInfo
  editing: boolean
  form: BeadsEditForm
  onFormChange: (form: BeadsEditForm) => void
}): React.JSX.Element {
  const fields = useProseFields()
  return (
    <div className="flex flex-col gap-4">
      {fields.map((field) => {
        const value = editing ? form[field.key] : issueValue(issue, field.key)
        return (
          <section key={field.key} data-beads-section={field.key} className="flex flex-col gap-1.5">
            <h3 className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
              {field.label}
            </h3>
            {editing ? (
              <textarea
                value={form[field.key]}
                aria-label={field.label}
                onChange={(e) => onFormChange({ ...form, [field.key]: e.target.value })}
                className="min-h-20 w-full resize-y rounded-md border border-border/60 bg-transparent p-2 text-sm text-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring scrollbar-sleek"
              />
            ) : value.trim() ? (
              <div className="text-sm text-foreground">
                <CommentMarkdown content={value} />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground/70">
                {translate('beads.section.empty', 'None')}
              </p>
            )}
          </section>
        )
      })}
    </div>
  )
}
