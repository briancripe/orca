/* oxlint-disable react-doctor/no-adjust-state-on-prop-change -- Why: this is a
   data-loading hook — effects legitimately mirror async store reads (list /
   detail / diagnose) into local render state, the same pattern the other
   provider surfaces use. */
/* Store-wiring hook for the beads task surface. Owns filter state, the list /
   detail fetch lifecycle, and dialog navigation; mutation handlers live in
   use-beads-mutations.ts and re-trigger these loads on settle (the slice has
   already invalidated the caches, so the re-load fetches fresh). Kept separate
   from the view so the flows can be driven against a mocked store. */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import type {
  BeadsDiagnosticsResult,
  BeadsIssueDetail,
  BeadsRepoContext
} from '@/store/slices/beads-cache'
import type { BeadsWorkItem } from '../../../../shared/beads-types'
import type { ClassifiedError } from '../../../../shared/types'
import {
  EMPTY_BEADS_FILTER_STATE,
  toBeadsIssueFilters,
  type BeadsFilterState
} from './beads-filter-model'
import { useBeadsMutations, type BeadsMutationsModel } from './use-beads-mutations'

export type BeadsTaskSurfaceModel = BeadsMutationsModel & {
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
  canGoBack: boolean
  createOpen: boolean
  openItem: (item: BeadsWorkItem) => void
  navigateToIssue: (id: string) => void
  back: () => void
  closeDialog: () => void
  refresh: () => void
  setCreateOpen: (open: boolean) => void
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

  const [filterState, setFilterState] = useState<BeadsFilterState>(EMPTY_BEADS_FILTER_STATE)
  const [items, setItems] = useState<BeadsWorkItem[]>([])
  const [listLoading, setListLoading] = useState(false)
  const [listError, setListError] = useState<ClassifiedError | null>(null)
  const [diagnostics, setDiagnostics] = useState<BeadsDiagnosticsResult | null>(null)
  const [labels, setLabels] = useState<string[]>([])
  const [refreshNonce, setRefreshNonce] = useState(0)

  // Why: a nav stack (not a single id) so chip navigation into a dependency
  // can be walked back — the top of the stack is the issue currently shown.
  const [navStack, setNavStack] = useState<string[]>([])
  const selectedIssueId = navStack.at(-1) ?? null
  const [issueDetail, setIssueDetail] = useState<BeadsIssueDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<ClassifiedError | null>(null)
  const [detailNonce, setDetailNonce] = useState(0)
  const [createOpen, setCreateOpen] = useState(false)

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
        if (!cancelled) {
          setItems(result.items)
          setListError(result.error ?? null)
        }
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
    void beadsDiagnose(ctx).then((result) => !cancelled && setDiagnostics(result))
    void loadBeadsLabels(ctx).then((result) => !cancelled && setLabels(result.items))
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
  const bumpDetailNonce = useCallback(() => setDetailNonce((nonce) => nonce + 1), [])
  const closeCreate = useCallback(() => setCreateOpen(false), [])

  const mutations = useBeadsMutations({
    ctx,
    selectedIssueId,
    onRefresh: refresh,
    onReloadDetail: bumpDetailNonce,
    onCreated: closeCreate
  })

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
    ...mutations,
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
    canGoBack: navStack.length > 1,
    createOpen,
    openItem: (item) => {
      mutations.clearDependencyError()
      setNavStack([item.id])
    },
    navigateToIssue: (id) => {
      mutations.clearDependencyError()
      setNavStack((stack) => [...stack, id])
    },
    back: () => setNavStack((stack) => (stack.length > 1 ? stack.slice(0, -1) : stack)),
    closeDialog: () => {
      mutations.clearDependencyError()
      setNavStack([])
    },
    refresh,
    setCreateOpen,
    reloadDetail
  }
}
