/* oxlint-disable react-doctor/no-adjust-state-on-prop-change -- Why: this is a
   data-loading hook — effects legitimately mirror async store reads (list /
   detail / diagnose) into local render state, the same pattern the other
   provider surfaces use. */
/* Store-wiring hook for the beads task surface. Owns filter state, the list /
   detail fetch lifecycle, and every mutation handler; each mutation re-triggers
   the list + open-detail loads (the slice has already invalidated their caches,
   so the re-load fetches fresh) — this is the "invalidate + refresh" contract
   the acceptance criteria exercise. Kept separate from the view so the flows
   can be driven against a mocked store. */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import type {
  BeadsCreateInput,
  BeadsDiagnosticsResult,
  BeadsIssueDetail,
  BeadsRepoContext
} from '@/store/slices/beads-cache'
import type { BeadsIssueUpdate } from '@/store/slices/beads'
import type { BeadsWorkItem } from '../../../../shared/beads-types'
import type { ClassifiedError } from '../../../../shared/types'
import {
  EMPTY_BEADS_FILTER_STATE,
  toBeadsIssueFilters,
  type BeadsFilterState
} from './beads-filter-model'

export type BeadsTaskSurfaceModel = {
  filterState: BeadsFilterState
  setFilterState: (next: BeadsFilterState) => void
  items: BeadsWorkItem[]
  listLoading: boolean
  listError: ClassifiedError | null
  diagnostics: BeadsDiagnosticsResult | null
  labelSuggestions: string[]
  assigneeSuggestions: string[]
  typeSuggestions: string[]
  selectedIssueId: string | null
  issueDetail: BeadsIssueDetail | null
  detailLoading: boolean
  detailError: ClassifiedError | null
  savingEdit: boolean
  commenting: boolean
  changingStatus: boolean
  createOpen: boolean
  creating: boolean
  openItem: (item: BeadsWorkItem) => void
  navigateToIssue: (id: string) => void
  closeDialog: () => void
  refresh: () => void
  setCreateOpen: (open: boolean) => void
  createIssue: (input: BeadsCreateInput) => void
  saveEdit: (update: BeadsIssueUpdate) => void
  addComment: (text: string) => void
  closeIssue: (reason?: string) => void
  reopenIssue: (reason?: string) => void
  reloadDetail: (id: string) => void
}

function ctxKey(ctx: BeadsRepoContext | null): string {
  return ctx ? `${ctx.repoId ?? ''}::${ctx.repoPath}` : ''
}

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set([...values].filter((value) => value.length > 0))].sort((a, b) =>
    a.localeCompare(b)
  )
}

export function useBeadsTaskSurface(ctx: BeadsRepoContext | null): BeadsTaskSurfaceModel {
  const loadBeadsWorkItems = useAppStore((s) => s.loadBeadsWorkItems)
  const loadBeadsIssueDetails = useAppStore((s) => s.loadBeadsIssueDetails)
  const loadBeadsLabels = useAppStore((s) => s.loadBeadsLabels)
  const beadsDiagnose = useAppStore((s) => s.beadsDiagnose)
  const createBeadsIssue = useAppStore((s) => s.createBeadsIssue)
  const updateBeadsIssue = useAppStore((s) => s.updateBeadsIssue)
  const closeBeadsIssue = useAppStore((s) => s.closeBeadsIssue)
  const reopenBeadsIssue = useAppStore((s) => s.reopenBeadsIssue)
  const addBeadsComment = useAppStore((s) => s.addBeadsComment)

  const [filterState, setFilterState] = useState<BeadsFilterState>(EMPTY_BEADS_FILTER_STATE)
  const [items, setItems] = useState<BeadsWorkItem[]>([])
  const [listLoading, setListLoading] = useState(false)
  const [listError, setListError] = useState<ClassifiedError | null>(null)
  const [diagnostics, setDiagnostics] = useState<BeadsDiagnosticsResult | null>(null)
  const [labels, setLabels] = useState<string[]>([])
  const [refreshNonce, setRefreshNonce] = useState(0)

  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null)
  const [issueDetail, setIssueDetail] = useState<BeadsIssueDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<ClassifiedError | null>(null)
  const [detailNonce, setDetailNonce] = useState(0)

  const [savingEdit, setSavingEdit] = useState(false)
  const [commenting, setCommenting] = useState(false)
  const [changingStatus, setChangingStatus] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)

  const key = ctxKey(ctx)
  const filterSignature = useMemo(
    () => JSON.stringify(toBeadsIssueFilters(filterState)),
    [filterState]
  )

  // List load — re-runs on ctx / filter / refresh changes. A mutation bumps the
  // nonce after invalidating the cache, so this re-fetches fresh rows.
  useEffect(() => {
    if (!ctx) {
      setItems([])
      return
    }
    let cancelled = false
    setListLoading(true)
    void loadBeadsWorkItems(ctx, toBeadsIssueFilters(filterState))
      .then((result) => {
        if (cancelled) {
          return
        }
        setItems(result.items)
        setListError(result.error ?? null)
      })
      .catch(() => {
        if (!cancelled) {
          setListError({
            type: 'unknown',
            message: translate('beads.error.loadList', 'Failed to load Beads issues.')
          })
        }
      })
      .finally(() => {
        if (!cancelled) {
          setListLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, filterSignature, refreshNonce])

  // Diagnose + labels — repo-scoped, refreshed alongside the list nonce.
  useEffect(() => {
    if (!ctx) {
      setDiagnostics(null)
      setLabels([])
      return
    }
    let cancelled = false
    void beadsDiagnose(ctx).then((result) => {
      if (!cancelled) {
        setDiagnostics(result)
      }
    })
    void loadBeadsLabels(ctx).then((result) => {
      if (!cancelled) {
        setLabels(result.items)
      }
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, refreshNonce])

  // Detail load — re-runs when the selected issue or detail nonce changes.
  useEffect(() => {
    if (!ctx || !selectedIssueId) {
      setIssueDetail(null)
      setDetailError(null)
      return
    }
    let cancelled = false
    setDetailLoading(true)
    void loadBeadsIssueDetails(ctx, selectedIssueId)
      .then((detail) => {
        if (!cancelled) {
          setIssueDetail(detail)
          setDetailError(
            detail
              ? null
              : {
                  type: 'not_found',
                  message: translate('beads.error.notFound', 'Issue not found.')
                }
          )
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDetailError({
            type: 'unknown',
            message: translate('beads.error.loadDetail', 'Failed to load issue.')
          })
        }
      })
      .finally(() => {
        if (!cancelled) {
          setDetailLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, selectedIssueId, detailNonce])

  const refresh = useCallback(() => setRefreshNonce((nonce) => nonce + 1), [])
  const reloadDetail = useCallback((_id: string) => setDetailNonce((nonce) => nonce + 1), [])

  const runMutation = useCallback(
    async (
      setBusy: (busy: boolean) => void,
      run: () => Promise<unknown>,
      options: { reloadDetail?: boolean } = {}
    ): Promise<void> => {
      setBusy(true)
      try {
        await run()
      } finally {
        setBusy(false)
        setRefreshNonce((nonce) => nonce + 1)
        if (options.reloadDetail) {
          setDetailNonce((nonce) => nonce + 1)
        }
      }
    },
    []
  )

  const createIssue = useCallback(
    (input: BeadsCreateInput) => {
      if (!ctx) {
        return
      }
      void runMutation(setCreating, () => createBeadsIssue(ctx, input)).then(() =>
        setCreateOpen(false)
      )
    },
    [ctx, createBeadsIssue, runMutation]
  )

  const saveEdit = useCallback(
    (update: BeadsIssueUpdate) => {
      if (!ctx || !selectedIssueId) {
        return
      }
      void runMutation(setSavingEdit, () => updateBeadsIssue(ctx, selectedIssueId, update), {
        reloadDetail: true
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
        reloadDetail: true
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
        reloadDetail: true
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
        reloadDetail: true
      })
    },
    [ctx, selectedIssueId, reopenBeadsIssue, runMutation]
  )

  const labelSuggestions = useMemo(
    () => uniqueSorted([...labels, ...items.flatMap((item) => item.labels)]),
    [labels, items]
  )
  const assigneeSuggestions = useMemo(
    () => uniqueSorted(items.map((item) => item.assignee ?? '')),
    [items]
  )
  const typeSuggestions = useMemo(() => uniqueSorted(items.map((item) => item.issueType)), [items])

  return {
    filterState,
    setFilterState,
    items,
    listLoading,
    listError,
    diagnostics,
    labelSuggestions,
    assigneeSuggestions,
    typeSuggestions,
    selectedIssueId,
    issueDetail,
    detailLoading,
    detailError,
    savingEdit,
    commenting,
    changingStatus,
    createOpen,
    creating,
    openItem: (item) => setSelectedIssueId(item.id),
    navigateToIssue: (id) => setSelectedIssueId(id),
    closeDialog: () => setSelectedIssueId(null),
    refresh,
    setCreateOpen,
    createIssue,
    saveEdit,
    addComment,
    closeIssue,
    reopenIssue,
    reloadDetail
  }
}
