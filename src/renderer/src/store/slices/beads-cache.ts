/* Cache-key, freshness, and invalidation helpers for the beads store slice
   (./beads.ts) — split out to keep the slice itself under the file's
   line budget, mirroring hosted-review-cache-identity.ts / github-cache-key.ts. */
import type { AppState } from '../types'
import type { CacheEntry } from './github'
import type {
  beadsCreateIssue,
  beadsDiagnose,
  beadsGetIssue,
  beadsListIssues,
  beadsListLabels
} from '@/runtime/runtime-beads-client'
import { getProviderRuntimeContextKey } from '@/lib/provider-runtime-context'

export const BEADS_CACHE_TTL = 60_000
export const BEADS_MAX_CACHE_ENTRIES = 500

// Types are derived from the runtime client's own signatures rather than
// redeclared, so the slice can't drift from the IPC/RPC contract it wraps.
type BeadsListArgs = Parameters<typeof beadsListIssues>[1]
export type BeadsIssueFilters = NonNullable<BeadsListArgs['filters']>
export type BeadsListResult = Awaited<ReturnType<typeof beadsListIssues>>
export type BeadsIssueDetail = Awaited<ReturnType<typeof beadsGetIssue>>
export type BeadsLabelsResult = Awaited<ReturnType<typeof beadsListLabels>>
export type BeadsCreateInput = Parameters<typeof beadsCreateIssue>[1]['input']
export type BeadsDiagnosticsResult = Awaited<ReturnType<typeof beadsDiagnose>>

// Why: ctx is repo identity only — the active runtime target comes from
// `get().settings` (mirrors how runtime-beads-client resolves local vs RPC),
// so callers never have to thread settings through by hand.
export type BeadsRepoContext = {
  repoPath: string
  repoId?: string | null
}

export function isBeadsCacheEntryFresh<T>(
  entry: CacheEntry<T> | undefined
): entry is CacheEntry<T> {
  return entry !== undefined && Date.now() - entry.fetchedAt < BEADS_CACHE_TTL
}

export function evictStaleBeadsEntries<T>(
  cache: Record<string, CacheEntry<T>>,
  maxEntries = BEADS_MAX_CACHE_ENTRIES
): Record<string, CacheEntry<T>> {
  const keys = Object.keys(cache)
  if (keys.length <= maxEntries) {
    return cache
  }
  const sorted = keys.sort((a, b) => (cache[a]?.fetchedAt ?? 0) - (cache[b]?.fetchedAt ?? 0))
  const pruned: Record<string, CacheEntry<T>> = {}
  for (const key of sorted.slice(sorted.length - maxEntries)) {
    pruned[key] = cache[key]
  }
  return pruned
}

function beadsRepoKey(ctx: BeadsRepoContext): string {
  return ctx.repoId ? `id:${ctx.repoId}` : `path:${ctx.repoPath}`
}

// Why: embedding the runtime target in the scope (not just guarding writes
// with it, as jira/linear do) means switching hosts never needs a blanket
// cache purge — each host's entries live at their own key.
export function beadsScopeKey(ctx: BeadsRepoContext, settings: AppState['settings']): string {
  return `${getProviderRuntimeContextKey(settings)}::${beadsRepoKey(ctx)}`
}

function beadsFilterSignature(filters?: BeadsIssueFilters): string {
  if (!filters) {
    return ''
  }
  const status = filters.status ? [...filters.status].sort().join(',') : ''
  return [
    status,
    filters.ready ?? '',
    filters.type ?? '',
    filters.assignee ?? '',
    filters.label ?? '',
    filters.parent ?? '',
    filters.titleContains ?? '',
    filters.limit ?? ''
  ].join('::')
}

export function beadsListCacheKey(scopeKey: string, filters?: BeadsIssueFilters): string {
  return `${scopeKey}::list::${beadsFilterSignature(filters)}`
}

export function beadsIssueCacheKey(scopeKey: string, id: string): string {
  return `${scopeKey}::issue::${id}`
}

export function beadsLabelsCacheKey(scopeKey: string): string {
  return `${scopeKey}::labels`
}

export function beadsDiagnoseCacheKey(scopeKey: string): string {
  return `${scopeKey}::diagnose`
}

export type InflightBeadsRequest<T> = {
  promise: Promise<T>
  force: boolean
  mutationGeneration: number
}

export const inflightBeadsListRequests = new Map<string, InflightBeadsRequest<BeadsListResult>>()
export const inflightBeadsIssueRequests = new Map<string, InflightBeadsRequest<BeadsIssueDetail>>()
export const inflightBeadsLabelsRequests = new Map<
  string,
  InflightBeadsRequest<BeadsLabelsResult>
>()
export const inflightBeadsDiagnoseRequests = new Map<
  string,
  InflightBeadsRequest<BeadsDiagnosticsResult>
>()

// Why: a mutation bumps this so a slow read that started before the mutation
// can't clobber the cache-invalidation with stale (pre-mutation) data once it
// resolves after the fact — same "stale write" guard jira/linear use, scoped
// here to a single global counter since every read captures it up front.
let beadsMutationGeneration = 0

export function beginBeadsMutation(): number {
  beadsMutationGeneration += 1
  return beadsMutationGeneration
}

export function currentBeadsMutationGeneration(): number {
  return beadsMutationGeneration
}

export function isCurrentBeadsMutation(generation: number): boolean {
  return generation === beadsMutationGeneration
}

function clearBeadsInflightByPrefix<T>(
  map: Map<string, InflightBeadsRequest<T>>,
  prefix: string
): void {
  for (const key of Array.from(map.keys())) {
    if (key.startsWith(prefix)) {
      map.delete(key)
    }
  }
}

export function invalidateBeadsListCache(
  cache: Record<string, CacheEntry<BeadsListResult>>,
  scopeKey: string
): Record<string, CacheEntry<BeadsListResult>> {
  const prefix = `${scopeKey}::list::`
  const next = { ...cache }
  let changed = false
  for (const key of Object.keys(next)) {
    if (key.startsWith(prefix)) {
      delete next[key]
      changed = true
    }
  }
  clearBeadsInflightByPrefix(inflightBeadsListRequests, prefix)
  return changed ? next : cache
}

export function invalidateBeadsIssueCache(
  cache: Record<string, CacheEntry<BeadsIssueDetail>>,
  scopeKey: string,
  id: string
): Record<string, CacheEntry<BeadsIssueDetail>> {
  const key = beadsIssueCacheKey(scopeKey, id)
  inflightBeadsIssueRequests.delete(key)
  if (!(key in cache)) {
    return cache
  }
  const next = { ...cache }
  delete next[key]
  return next
}

export function invalidateBeadsLabelsCache(
  cache: Record<string, CacheEntry<BeadsLabelsResult>>,
  scopeKey: string
): Record<string, CacheEntry<BeadsLabelsResult>> {
  const key = beadsLabelsCacheKey(scopeKey)
  inflightBeadsLabelsRequests.delete(key)
  if (!(key in cache)) {
    return cache
  }
  const next = { ...cache }
  delete next[key]
  return next
}
