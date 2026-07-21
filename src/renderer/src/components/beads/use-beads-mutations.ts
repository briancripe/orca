/* Mutation handlers for the beads task surface, split out of the surface hook
   to keep each file focused. Every mutation runs through runMutation, which
   flips a busy flag and — on settle — signals the caller to re-fetch the list
   (and optionally the open detail); the slice has already invalidated those
   caches, so the re-fetch returns fresh data (the "invalidate + refresh"
   contract).

   bd write channels resolve `{ok:false, error}` rather than throwing (see
   src/main/ipc/beads.ts) — runMutation checks `result.ok` before treating a
   settle as success, mirroring GitLabItemDialog's result-checking + toast
   pattern, so a failed mutation surfaces an error instead of silently
   behaving like a success (e.g. closing the create dialog with nothing
   created). Dependency add/remove keep their own inline dependencyError
   surfacing (bd's cycle-detection message shown in the dialog, not a toast)
   rather than this toast path. */
import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import type { BeadsCreateInput, BeadsRepoContext } from '@/store/slices/beads-cache'
import type { BeadsIssueUpdate } from '@/store/slices/beads'
import type { ClassifiedError } from '../../../../shared/types'

type BeadsMutationEnvelope = { ok: true } | { ok: false; error: ClassifiedError }

export type BeadsMutationsModel = {
  savingEdit: boolean
  commenting: boolean
  changingStatus: boolean
  addingDependency: boolean
  removingDependency: boolean
  creating: boolean
  dependencyError: ClassifiedError | null
  createIssue: (input: BeadsCreateInput) => void
  saveEdit: (update: BeadsIssueUpdate) => void
  addComment: (text: string) => void
  closeIssue: (reason?: string) => void
  reopenIssue: (reason?: string) => void
  addDependency: (dependsOnId: string) => void
  removeDependency: (dependsOnId: string) => void
  clearDependencyError: () => void
}

type UseBeadsMutationsArgs = {
  ctx: BeadsRepoContext | null
  selectedIssueId: string | null
  onRefresh: () => void
  onReloadDetail: () => void
  onCreated: () => void
}

export function useBeadsMutations(args: UseBeadsMutationsArgs): BeadsMutationsModel {
  const { ctx, selectedIssueId, onRefresh, onReloadDetail, onCreated } = args
  const createBeadsIssue = useAppStore((s) => s.createBeadsIssue)
  const updateBeadsIssue = useAppStore((s) => s.updateBeadsIssue)
  const closeBeadsIssue = useAppStore((s) => s.closeBeadsIssue)
  const reopenBeadsIssue = useAppStore((s) => s.reopenBeadsIssue)
  const addBeadsComment = useAppStore((s) => s.addBeadsComment)
  const addBeadsDependency = useAppStore((s) => s.addBeadsDependency)
  const removeBeadsDependency = useAppStore((s) => s.removeBeadsDependency)

  const [savingEdit, setSavingEdit] = useState(false)
  const [commenting, setCommenting] = useState(false)
  const [changingStatus, setChangingStatus] = useState(false)
  const [addingDependency, setAddingDependency] = useState(false)
  const [removingDependency, setRemovingDependency] = useState(false)
  const [creating, setCreating] = useState(false)
  const [dependencyError, setDependencyError] = useState<ClassifiedError | null>(null)

  const runMutation = useCallback(
    async <T extends BeadsMutationEnvelope>(
      setBusy: (busy: boolean) => void,
      run: () => Promise<T>,
      options: {
        reloadDetail?: boolean
        successMessage?: string
        fallbackErrorMessage: string
        onSuccess?: () => void
      }
    ): Promise<void> => {
      setBusy(true)
      try {
        const result = await run()
        if (result.ok) {
          if (options.successMessage) {
            toast.success(options.successMessage)
          }
          options.onSuccess?.()
        } else {
          toast.error(result.error.message || options.fallbackErrorMessage)
        }
      } catch {
        toast.error(options.fallbackErrorMessage)
      } finally {
        setBusy(false)
        onRefresh()
        if (options.reloadDetail) {
          onReloadDetail()
        }
      }
    },
    [onRefresh, onReloadDetail]
  )

  const runDependencyMutation = useCallback(
    (
      setBusy: (busy: boolean) => void,
      run: () => Promise<{ ok: true } | { ok: false; error: ClassifiedError }>,
      fallbackMessage: string
    ): void => {
      if (!ctx || !selectedIssueId) {
        return
      }
      setDependencyError(null)
      setBusy(true)
      void run()
        .then((result) => {
          if (!result.ok) {
            setDependencyError(result.error)
          }
        })
        .catch(() => setDependencyError({ type: 'unknown', message: fallbackMessage }))
        .finally(() => {
          setBusy(false)
          onRefresh()
          onReloadDetail()
        })
    },
    [ctx, selectedIssueId, onRefresh, onReloadDetail]
  )

  const createIssue = useCallback(
    (input: BeadsCreateInput) => {
      if (!ctx) {
        return
      }
      void runMutation(setCreating, () => createBeadsIssue(ctx, input), {
        successMessage: translate('beads.success.create', 'Issue created.'),
        fallbackErrorMessage: translate('beads.error.create', 'Could not create the issue.'),
        onSuccess: onCreated
      })
    },
    [ctx, createBeadsIssue, runMutation, onCreated]
  )

  const saveEdit = useCallback(
    (update: BeadsIssueUpdate) => {
      if (!ctx || !selectedIssueId) {
        return
      }
      void runMutation(setSavingEdit, () => updateBeadsIssue(ctx, selectedIssueId, update), {
        reloadDetail: true,
        successMessage: translate('beads.success.edit', 'Issue updated.'),
        fallbackErrorMessage: translate('beads.error.edit', 'Could not save the issue.')
      })
    },
    [ctx, selectedIssueId, updateBeadsIssue, runMutation]
  )

  const addComment = useCallback(
    (text: string) => {
      if (!ctx || !selectedIssueId) {
        return
      }
      void runMutation(setCommenting, () => addBeadsComment(ctx, selectedIssueId, text), {
        reloadDetail: true,
        successMessage: translate('beads.success.comment', 'Comment added.'),
        fallbackErrorMessage: translate('beads.error.comment', 'Could not add the comment.')
      })
    },
    [ctx, selectedIssueId, addBeadsComment, runMutation]
  )

  const closeIssue = useCallback(
    (reason?: string) => {
      if (!ctx || !selectedIssueId) {
        return
      }
      void runMutation(setChangingStatus, () => closeBeadsIssue(ctx, selectedIssueId, reason), {
        reloadDetail: true,
        successMessage: translate('beads.success.close', 'Issue closed.'),
        fallbackErrorMessage: translate('beads.error.close', 'Could not close the issue.')
      })
    },
    [ctx, selectedIssueId, closeBeadsIssue, runMutation]
  )

  const reopenIssue = useCallback(
    (reason?: string) => {
      if (!ctx || !selectedIssueId) {
        return
      }
      void runMutation(setChangingStatus, () => reopenBeadsIssue(ctx, selectedIssueId, reason), {
        reloadDetail: true,
        successMessage: translate('beads.success.reopen', 'Issue reopened.'),
        fallbackErrorMessage: translate('beads.error.reopen', 'Could not reopen the issue.')
      })
    },
    [ctx, selectedIssueId, reopenBeadsIssue, runMutation]
  )

  const addDependency = useCallback(
    (dependsOnId: string) =>
      runDependencyMutation(
        setAddingDependency,
        () => addBeadsDependency(ctx as BeadsRepoContext, selectedIssueId as string, dependsOnId),
        translate('beads.error.addDependency', 'Could not add the dependency.')
      ),
    [runDependencyMutation, addBeadsDependency, ctx, selectedIssueId]
  )

  const removeDependency = useCallback(
    (dependsOnId: string) =>
      runDependencyMutation(
        setRemovingDependency,
        () =>
          removeBeadsDependency(ctx as BeadsRepoContext, selectedIssueId as string, dependsOnId),
        translate('beads.error.removeDependency', 'Could not remove the dependency.')
      ),
    [runDependencyMutation, removeBeadsDependency, ctx, selectedIssueId]
  )

  return {
    savingEdit,
    commenting,
    changingStatus,
    addingDependency,
    removingDependency,
    creating,
    dependencyError,
    createIssue,
    saveEdit,
    addComment,
    closeIssue,
    reopenIssue,
    addDependency,
    removeDependency,
    clearDependencyError: () => setDependencyError(null)
  }
}
