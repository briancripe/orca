/* Loads each epic's children via a per-epic `--parent` list fetch (one bd call
   per epic, never per row) when epic grouping is enabled. Split from the
   surface hook to keep both files focused. */
import { useEffect, useMemo, useState } from 'react'
import { useAppStore } from '@/store'
import type { BeadsRepoContext } from '@/store/slices/beads-cache'
import type { BeadsWorkItem } from '../../../../shared/beads-types'
import { collectBeadsChildIds, computeBeadsOrphans, getBeadsEpics } from './beads-epic-grouping'

export type BeadsEpicGroupsModel = {
  epics: BeadsWorkItem[]
  childrenByEpicId: Record<string, BeadsWorkItem[]>
  orphans: BeadsWorkItem[]
  loadingEpicIds: ReadonlySet<string>
}

function ctxKey(ctx: BeadsRepoContext | null): string {
  return ctx ? `${ctx.repoId ?? ''}::${ctx.repoPath}` : ''
}

export function useBeadsEpicGroups(args: {
  ctx: BeadsRepoContext | null
  enabled: boolean
  items: readonly BeadsWorkItem[]
  refreshNonce: number
}): BeadsEpicGroupsModel {
  const { ctx, enabled, items, refreshNonce } = args
  const loadBeadsWorkItems = useAppStore((s) => s.loadBeadsWorkItems)

  const epics = useMemo(() => getBeadsEpics(items), [items])
  const epicIdsKey = useMemo(() => epics.map((epic) => epic.id).join(','), [epics])
  const [childrenByEpicId, setChildrenByEpicId] = useState<Record<string, BeadsWorkItem[]>>({})
  const [loadingEpicIds, setLoadingEpicIds] = useState<ReadonlySet<string>>(new Set())

  const key = ctxKey(ctx)
  useEffect(() => {
    if (!ctx || !enabled || epics.length === 0) {
      setChildrenByEpicId({})
      setLoadingEpicIds(new Set())
      return
    }
    let cancelled = false
    setLoadingEpicIds(new Set(epics.map((epic) => epic.id)))
    // Why: one `--parent` fetch per epic (not per row); results are collected
    // into a map so expanding a group renders from cache with no new bd call.
    Promise.all(
      epics.map((epic) =>
        loadBeadsWorkItems(ctx, { parent: epic.id })
          .then((result) => ({ id: epic.id, items: result.items }))
          .catch(() => ({ id: epic.id, items: [] as BeadsWorkItem[] }))
      )
    ).then((results) => {
      if (cancelled) {
        return
      }
      const next: Record<string, BeadsWorkItem[]> = {}
      for (const result of results) {
        next[result.id] = result.items
      }
      setChildrenByEpicId(next)
      setLoadingEpicIds(new Set())
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, epicIdsKey, refreshNonce])

  const orphans = useMemo(
    () => computeBeadsOrphans(items, collectBeadsChildIds(childrenByEpicId)),
    [items, childrenByEpicId]
  )

  return { epics, childrenByEpicId, orphans, loadingEpicIds }
}
