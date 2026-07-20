/* Beads (`bd`) renderer store slice. Repo-scoped like the GitLab surface (no
   account/site connection to select) — every cache key carries both the repo
   identity and the active runtime target (see beads-cache.ts) so multiple
   repos and multiple hosts never cross-pollinate. Structured after
   jira.ts/linear.ts; delegates every read/write to runtime-beads-client so
   local and remote (SSH/runtime environment) targets both work. Read/write
   execution shape is shared via beads-request-runner.ts. */
import type { StateCreator } from 'zustand'
import type { AppState } from '../types'
import type { CacheEntry } from './github'
import {
  beadsAddDependency,
  beadsAddIssueComment,
  beadsCloseIssue,
  beadsCreateIssue,
  beadsDiagnose as runtimeBeadsDiagnose,
  beadsGetIssue,
  beadsListIssues,
  beadsListLabels,
  beadsRemoveDependency,
  beadsReopenIssue,
  beadsUpdateIssue
} from '@/runtime/runtime-beads-client'
import {
  beadsDiagnoseCacheKey,
  beadsIssueCacheKey,
  beadsLabelsCacheKey,
  beadsListCacheKey,
  beadsScopeKey,
  evictStaleBeadsEntries,
  inflightBeadsDiagnoseRequests,
  inflightBeadsIssueRequests,
  inflightBeadsLabelsRequests,
  inflightBeadsListRequests,
  invalidateBeadsIssueCache,
  invalidateBeadsLabelsCache,
  invalidateBeadsListCache,
  type BeadsCreateInput,
  type BeadsDiagnosticsResult,
  type BeadsIssueDetail,
  type BeadsIssueFilters,
  type BeadsLabelsResult,
  type BeadsListResult,
  type BeadsRepoContext
} from './beads-cache'
import { runBeadsMutation, runCachedBeadsRead } from './beads-request-runner'

export type { BeadsRepoContext } from './beads-cache'

type BeadsUpdateInput = Parameters<typeof beadsUpdateIssue>[1]['updates']
// Why: re-exported so the renderer edit form (beads-issue-edit-model) can build
// a well-typed update diff without re-declaring bd's update shape.
export type BeadsIssueUpdate = BeadsUpdateInput
export type BeadsIssueMutationResult = Awaited<ReturnType<typeof beadsCreateIssue>>
export type BeadsCommentMutationResult = Awaited<ReturnType<typeof beadsAddIssueComment>>
export type BeadsOkResult = Awaited<ReturnType<typeof beadsAddDependency>>

type BeadsFetchOptions = { force?: boolean }

export type BeadsSlice = {
  beadsWorkItemCache: Record<string, CacheEntry<BeadsListResult>>
  beadsIssueCache: Record<string, CacheEntry<BeadsIssueDetail>>
  beadsLabelsCache: Record<string, CacheEntry<BeadsLabelsResult>>
  beadsDiagnoseCache: Record<string, CacheEntry<BeadsDiagnosticsResult>>

  loadBeadsWorkItems: (
    ctx: BeadsRepoContext,
    filters?: BeadsIssueFilters,
    options?: BeadsFetchOptions
  ) => Promise<BeadsListResult>
  loadBeadsIssueDetails: (
    ctx: BeadsRepoContext,
    id: string,
    options?: BeadsFetchOptions
  ) => Promise<BeadsIssueDetail>
  loadBeadsLabels: (
    ctx: BeadsRepoContext,
    options?: BeadsFetchOptions
  ) => Promise<BeadsLabelsResult>
  createBeadsIssue: (
    ctx: BeadsRepoContext,
    input: BeadsCreateInput
  ) => Promise<BeadsIssueMutationResult>
  updateBeadsIssue: (
    ctx: BeadsRepoContext,
    id: string,
    updates: BeadsUpdateInput
  ) => Promise<BeadsIssueMutationResult>
  closeBeadsIssue: (
    ctx: BeadsRepoContext,
    id: string,
    reason?: string
  ) => Promise<BeadsIssueMutationResult>
  reopenBeadsIssue: (
    ctx: BeadsRepoContext,
    id: string,
    reason?: string
  ) => Promise<BeadsIssueMutationResult>
  addBeadsComment: (
    ctx: BeadsRepoContext,
    id: string,
    text: string
  ) => Promise<BeadsCommentMutationResult>
  addBeadsDependency: (
    ctx: BeadsRepoContext,
    issueId: string,
    dependsOnId: string
  ) => Promise<BeadsOkResult>
  removeBeadsDependency: (
    ctx: BeadsRepoContext,
    issueId: string,
    dependsOnId: string
  ) => Promise<BeadsOkResult>
  beadsDiagnose: (
    ctx: BeadsRepoContext,
    options?: BeadsFetchOptions
  ) => Promise<BeadsDiagnosticsResult>
}

export const createBeadsSlice: StateCreator<AppState, [], [], BeadsSlice> = (set, get) => ({
  beadsWorkItemCache: {},
  beadsIssueCache: {},
  beadsLabelsCache: {},
  beadsDiagnoseCache: {},

  loadBeadsWorkItems: (ctx, filters, options) => {
    const settings = get().settings
    const scopeKey = beadsScopeKey(ctx, settings)
    const cacheKey = beadsListCacheKey(scopeKey, filters)
    return runCachedBeadsRead({
      cached: get().beadsWorkItemCache[cacheKey],
      fallback: { items: [] },
      force: Boolean(options?.force),
      inflightMap: inflightBeadsListRequests,
      cacheKey,
      fetch: () =>
        beadsListIssues(settings, { repoPath: ctx.repoPath, repoId: ctx.repoId, filters }),
      writeCache: (data) =>
        set((s) => ({
          beadsWorkItemCache: evictStaleBeadsEntries({
            ...s.beadsWorkItemCache,
            [cacheKey]: { data, fetchedAt: Date.now() }
          })
        })),
      logLabel: 'loadBeadsWorkItems'
    })
  },

  loadBeadsIssueDetails: (ctx, id, options) => {
    const settings = get().settings
    const scopeKey = beadsScopeKey(ctx, settings)
    const cacheKey = beadsIssueCacheKey(scopeKey, id)
    return runCachedBeadsRead({
      cached: get().beadsIssueCache[cacheKey],
      fallback: null,
      force: Boolean(options?.force),
      inflightMap: inflightBeadsIssueRequests,
      cacheKey,
      fetch: () => beadsGetIssue(settings, { repoPath: ctx.repoPath, repoId: ctx.repoId, id }),
      writeCache: (data) =>
        set((s) => ({
          beadsIssueCache: evictStaleBeadsEntries({
            ...s.beadsIssueCache,
            [cacheKey]: { data, fetchedAt: Date.now() }
          })
        })),
      logLabel: 'loadBeadsIssueDetails'
    })
  },

  loadBeadsLabels: (ctx, options) => {
    const settings = get().settings
    const scopeKey = beadsScopeKey(ctx, settings)
    const cacheKey = beadsLabelsCacheKey(scopeKey)
    return runCachedBeadsRead({
      cached: get().beadsLabelsCache[cacheKey],
      fallback: { items: [] },
      force: Boolean(options?.force),
      inflightMap: inflightBeadsLabelsRequests,
      cacheKey,
      fetch: () => beadsListLabels(settings, { repoPath: ctx.repoPath, repoId: ctx.repoId }),
      writeCache: (data) =>
        set((s) => ({
          beadsLabelsCache: evictStaleBeadsEntries({
            ...s.beadsLabelsCache,
            [cacheKey]: { data, fetchedAt: Date.now() }
          })
        })),
      logLabel: 'loadBeadsLabels'
    })
  },

  beadsDiagnose: (ctx, options) => {
    const settings = get().settings
    const scopeKey = beadsScopeKey(ctx, settings)
    const cacheKey = beadsDiagnoseCacheKey(scopeKey)
    return runCachedBeadsRead({
      cached: get().beadsDiagnoseCache[cacheKey],
      fallback: { bdAvailable: false, repoInitialized: false },
      force: Boolean(options?.force),
      inflightMap: inflightBeadsDiagnoseRequests,
      cacheKey,
      fetch: () => runtimeBeadsDiagnose(settings, { repoPath: ctx.repoPath, repoId: ctx.repoId }),
      writeCache: (data) =>
        set((s) => ({
          beadsDiagnoseCache: evictStaleBeadsEntries({
            ...s.beadsDiagnoseCache,
            [cacheKey]: { data, fetchedAt: Date.now() }
          })
        })),
      logLabel: 'beadsDiagnose'
    })
  },

  createBeadsIssue: (ctx, input) => {
    const settings = get().settings
    const scopeKey = beadsScopeKey(ctx, settings)
    return runBeadsMutation(
      () => beadsCreateIssue(settings, { repoPath: ctx.repoPath, repoId: ctx.repoId, input }),
      () =>
        set((s) => ({
          beadsWorkItemCache: invalidateBeadsListCache(s.beadsWorkItemCache, scopeKey),
          beadsLabelsCache: invalidateBeadsLabelsCache(s.beadsLabelsCache, scopeKey)
        }))
    )
  },

  updateBeadsIssue: (ctx, id, updates) => {
    const settings = get().settings
    const scopeKey = beadsScopeKey(ctx, settings)
    return runBeadsMutation(
      () => beadsUpdateIssue(settings, { repoPath: ctx.repoPath, repoId: ctx.repoId, id, updates }),
      () =>
        set((s) => ({
          beadsWorkItemCache: invalidateBeadsListCache(s.beadsWorkItemCache, scopeKey),
          beadsIssueCache: invalidateBeadsIssueCache(s.beadsIssueCache, scopeKey, id),
          beadsLabelsCache: invalidateBeadsLabelsCache(s.beadsLabelsCache, scopeKey)
        }))
    )
  },

  closeBeadsIssue: (ctx, id, reason) => {
    const settings = get().settings
    const scopeKey = beadsScopeKey(ctx, settings)
    return runBeadsMutation(
      () => beadsCloseIssue(settings, { repoPath: ctx.repoPath, repoId: ctx.repoId, id, reason }),
      () =>
        set((s) => ({
          beadsWorkItemCache: invalidateBeadsListCache(s.beadsWorkItemCache, scopeKey),
          beadsIssueCache: invalidateBeadsIssueCache(s.beadsIssueCache, scopeKey, id)
        }))
    )
  },

  reopenBeadsIssue: (ctx, id, reason) => {
    const settings = get().settings
    const scopeKey = beadsScopeKey(ctx, settings)
    return runBeadsMutation(
      () => beadsReopenIssue(settings, { repoPath: ctx.repoPath, repoId: ctx.repoId, id, reason }),
      () =>
        set((s) => ({
          beadsWorkItemCache: invalidateBeadsListCache(s.beadsWorkItemCache, scopeKey),
          beadsIssueCache: invalidateBeadsIssueCache(s.beadsIssueCache, scopeKey, id)
        }))
    )
  },

  addBeadsComment: (ctx, id, text) => {
    const settings = get().settings
    const scopeKey = beadsScopeKey(ctx, settings)
    return runBeadsMutation(
      () =>
        beadsAddIssueComment(settings, { repoPath: ctx.repoPath, repoId: ctx.repoId, id, text }),
      () =>
        set((s) => ({
          beadsIssueCache: invalidateBeadsIssueCache(s.beadsIssueCache, scopeKey, id)
        }))
    )
  },

  addBeadsDependency: (ctx, issueId, dependsOnId) => {
    const settings = get().settings
    const scopeKey = beadsScopeKey(ctx, settings)
    return runBeadsMutation(
      () =>
        beadsAddDependency(settings, {
          repoPath: ctx.repoPath,
          repoId: ctx.repoId,
          issueId,
          dependsOnId
        }),
      () =>
        set((s) => ({
          beadsIssueCache: invalidateBeadsIssueCache(
            invalidateBeadsIssueCache(s.beadsIssueCache, scopeKey, issueId),
            scopeKey,
            dependsOnId
          )
        }))
    )
  },

  removeBeadsDependency: (ctx, issueId, dependsOnId) => {
    const settings = get().settings
    const scopeKey = beadsScopeKey(ctx, settings)
    return runBeadsMutation(
      () =>
        beadsRemoveDependency(settings, {
          repoPath: ctx.repoPath,
          repoId: ctx.repoId,
          issueId,
          dependsOnId
        }),
      () =>
        set((s) => ({
          beadsIssueCache: invalidateBeadsIssueCache(
            invalidateBeadsIssueCache(s.beadsIssueCache, scopeKey, issueId),
            scopeKey,
            dependsOnId
          )
        }))
    )
  }
})
