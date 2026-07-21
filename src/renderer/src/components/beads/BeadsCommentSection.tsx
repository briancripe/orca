import React, { useState } from 'react'
import { LoaderCircle, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import CommentMarkdown from '@/components/sidebar/CommentMarkdown'
import { isScreenSubmitShortcut } from '@/lib/screen-submit-shortcut'
import { hasBoundedCommentBodyText } from '@/lib/comment-body-submit-state'
import { translate } from '@/i18n/i18n'
import type { BeadsComment } from '../../../../shared/beads-types'

function formatTimestamp(value: string): string {
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toLocaleString()
}

export function BeadsCommentSection({
  comments,
  submitting,
  onAddComment
}: {
  comments: readonly BeadsComment[]
  submitting: boolean
  onAddComment: (text: string) => void
}): React.JSX.Element {
  const [draft, setDraft] = useState('')
  const canSubmit = hasBoundedCommentBodyText(draft) && !submitting

  const submit = (): void => {
    if (!canSubmit) {
      return
    }
    onAddComment(draft.trim())
    setDraft('')
  }

  return (
    <section data-beads-section="comments" className="flex flex-col gap-3">
      <h3 className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
        {translate('beads.section.comments', 'Comments')}
      </h3>

      {comments.length === 0 ? (
        <p className="text-sm text-muted-foreground/70">
          {translate('beads.comments.empty', 'No comments yet.')}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {comments.map((comment) => (
            <li
              key={comment.id}
              data-beads-comment={comment.id}
              className="rounded-md border border-border/50 bg-muted/30 px-3 py-2"
            >
              <div className="mb-1 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                <span className="truncate font-medium text-foreground">{comment.author}</span>
                <span className="shrink-0">{formatTimestamp(comment.createdAt)}</span>
              </div>
              <div className="text-sm text-foreground">
                <CommentMarkdown content={comment.text} />
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (isScreenSubmitShortcut(e)) {
              e.preventDefault()
              submit()
            }
          }}
          aria-label={translate('beads.comments.composerAria', 'Add a comment')}
          placeholder={translate('beads.comments.placeholder', 'Add a comment…')}
          className="min-h-16 w-full resize-y rounded-md border border-border/60 bg-transparent p-2 text-sm text-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring scrollbar-sleek"
        />
        <div className="flex justify-end">
          <Button type="button" size="sm" disabled={!canSubmit} onClick={submit}>
            {submitting ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
            {translate('beads.comments.submit', 'Comment')}
          </Button>
        </div>
      </div>
    </section>
  )
}
