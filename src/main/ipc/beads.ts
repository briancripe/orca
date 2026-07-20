import { ipcMain } from 'electron'
import { resolve } from 'node:path'
import type { ClassifiedError, Repo } from '../../shared/types'
import type { BeadsIssueInfo, BeadsWorkItem } from '../../shared/beads-types'
import { getRepoExecutionHostId } from '../../shared/execution-host'
import type { TaskSourceContext } from '../../shared/task-source-context'
import type { Store } from '../persistence'
import { getLocalProjectWorktreeGitOptions } from '../project-runtime-git-options'
import type { BdCallOptions } from '../beads/bd-utils'
import { diagnoseBeads } from '../beads/client'
import {
  addIssueComment,
  closeIssue,
  createIssue,
  reopenIssue,
  updateIssue,
  type BeadsCommentMutationResult,
  type BeadsIssueCreateInput,
  type BeadsIssueMutationResult,
  type BeadsIssueUpdate
} from '../beads/issue-crud'
import {
  getIssue,
  listIssues,
  listLabels,
  type BeadsIssueFilters,
  type BeadsIssueListResult,
  type BeadsStringListResult
} from '../beads/issue-queries'
import { addDependency, removeDependency, type BeadsOkResult } from '../beads/dependencies'
import { validateBeadsIssueId, type BeadsWorkItemArgs } from './beads-work-item-args'

type BeadsRepoSelectorArgs = {
  repoPath: string
  repoId?: string | null
  sourceContext?: TaskSourceContext | null
}

// Why: an id that fails the flag-smuggling-safe validator must never spawn bd;
// mutating channels surface this as an error envelope (rather than throwing)
// so the renderer store slice handles it the same as any other bd failure.
const INVALID_ID_ERROR: ClassifiedError = {
  type: 'validation_error',
  message: 'Invalid beads issue id'
}

function findRegisteredBeadsRepo(args: BeadsRepoSelectorArgs, store: Store): Repo | undefined {
  const repoId = args.repoId?.trim() || args.sourceContext?.repoId?.trim() || null
  if (repoId) {
    const repo = store.getRepo(repoId)
    if (repo) {
      return repo
    }
  }
  const resolvedRepoPath = resolve(args.repoPath)
  return store.getRepos().find((r) => resolve(r.path) === resolvedRepoPath)
}

// Why: mirror the gitlab/github assertRegisteredRepo guard — a beads handler
// must never run bd against a path the user hasn't registered as a repo
// (filesystem-auth boundary). When a task carries a source context, its host
// must match the repo's execution host so a task fetched on one machine can't
// drive bd against a same-path repo on another.
function assertRegisteredRepo(args: BeadsRepoSelectorArgs, store: Store): Repo {
  const repo = findRegisteredBeadsRepo(args, store)
  if (!repo) {
    throw new Error('Access denied: unknown repository path')
  }
  if (args.sourceContext && args.sourceContext.hostId !== getRepoExecutionHostId(repo)) {
    throw new Error('Access denied: Beads source host does not match repository host')
  }
  return repo
}

// Why: bd runs in the same resolved project runtime as agents/terminals, so a
// WSL project routes bd into the right distro — plumbed exactly like the
// gitlab handlers' localGitOptionArgs.
function beadsCallOptions(store: Store, repo: Repo): BdCallOptions {
  const { wslDistro } = getLocalProjectWorktreeGitOptions(store, repo)
  return wslDistro ? { wslDistro } : {}
}

// Why: bd's per-issue JSON has no repo concept (single local db), so the
// main-process mapper leaves repoId blank — the handler stamps the resolved
// repo id here, mirroring how gitlab's listIssues stamps repo.id.
function stampRepoId(items: BeadsWorkItem[], repoId: string): BeadsWorkItem[] {
  return items.map((item) => ({ ...item, repoId }))
}

async function handleListIssues(
  store: Store,
  args: BeadsRepoSelectorArgs & { filters?: BeadsIssueFilters }
): Promise<BeadsIssueListResult> {
  const repo = assertRegisteredRepo(args, store)
  const result = await listIssues(repo.path, args.filters ?? {}, beadsCallOptions(store, repo))
  return {
    items: stampRepoId(result.items, repo.id),
    ...(result.error ? { error: result.error } : {})
  }
}

async function handleGetIssue(
  store: Store,
  args: BeadsWorkItemArgs
): Promise<BeadsIssueInfo | null> {
  const repo = assertRegisteredRepo(args, store)
  const id = validateBeadsIssueId(args.id)
  if (!id) {
    return null
  }
  return getIssue(repo.path, id, beadsCallOptions(store, repo))
}

export function registerBeadsHandlers(store: Store): void {
  ipcMain.handle('beads:diagnose', async (_event, args: BeadsRepoSelectorArgs) => {
    const repo = assertRegisteredRepo(args, store)
    return diagnoseBeads(repo.path, beadsCallOptions(store, repo))
  })

  ipcMain.handle(
    'beads:listIssues',
    async (_event, args: BeadsRepoSelectorArgs & { filters?: BeadsIssueFilters }) =>
      handleListIssues(store, args)
  )

  // Why: the Tasks-screen unified list surface. Beads has no MR concept (unlike
  // gitlab's listWorkItems), so it shares handleListIssues — kept as its own
  // channel to mirror the provider surface the renderer store slice branches on.
  ipcMain.handle(
    'beads:listWorkItems',
    async (_event, args: BeadsRepoSelectorArgs & { filters?: BeadsIssueFilters }) =>
      handleListIssues(store, args)
  )

  ipcMain.handle('beads:issue', async (_event, args: BeadsWorkItemArgs) =>
    handleGetIssue(store, args)
  )

  // Why: aggregated dialog payload. For beads a single `bd show
  // --include-comments` already yields the detail beyond the lean list row
  // (comments + dependencies), so this shares handleGetIssue with `issue` —
  // kept distinct to parallel gitlab's separate issue / workItemDetails surface.
  ipcMain.handle('beads:workItemDetails', async (_event, args: BeadsWorkItemArgs) =>
    handleGetIssue(store, args)
  )

  ipcMain.handle(
    'beads:createIssue',
    async (
      _event,
      args: BeadsRepoSelectorArgs & { input: BeadsIssueCreateInput }
    ): Promise<BeadsIssueMutationResult> => {
      const repo = assertRegisteredRepo(args, store)
      return createIssue(repo.path, args.input, beadsCallOptions(store, repo))
    }
  )

  ipcMain.handle(
    'beads:updateIssue',
    async (
      _event,
      args: BeadsWorkItemArgs & { updates: BeadsIssueUpdate }
    ): Promise<BeadsIssueMutationResult> => {
      const repo = assertRegisteredRepo(args, store)
      const id = validateBeadsIssueId(args.id)
      if (!id) {
        return { ok: false, error: INVALID_ID_ERROR }
      }
      return updateIssue(repo.path, id, args.updates, beadsCallOptions(store, repo))
    }
  )

  ipcMain.handle(
    'beads:closeIssue',
    async (
      _event,
      args: BeadsWorkItemArgs & { reason?: string }
    ): Promise<BeadsIssueMutationResult> => {
      const repo = assertRegisteredRepo(args, store)
      const id = validateBeadsIssueId(args.id)
      if (!id) {
        return { ok: false, error: INVALID_ID_ERROR }
      }
      return closeIssue(repo.path, id, args.reason, beadsCallOptions(store, repo))
    }
  )

  ipcMain.handle(
    'beads:reopenIssue',
    async (
      _event,
      args: BeadsWorkItemArgs & { reason?: string }
    ): Promise<BeadsIssueMutationResult> => {
      const repo = assertRegisteredRepo(args, store)
      const id = validateBeadsIssueId(args.id)
      if (!id) {
        return { ok: false, error: INVALID_ID_ERROR }
      }
      return reopenIssue(repo.path, id, args.reason, beadsCallOptions(store, repo))
    }
  )

  ipcMain.handle(
    'beads:addIssueComment',
    async (
      _event,
      args: BeadsWorkItemArgs & { text: string }
    ): Promise<BeadsCommentMutationResult> => {
      const repo = assertRegisteredRepo(args, store)
      const id = validateBeadsIssueId(args.id)
      if (!id) {
        return { ok: false, error: INVALID_ID_ERROR }
      }
      return addIssueComment(repo.path, id, args.text, beadsCallOptions(store, repo))
    }
  )

  ipcMain.handle(
    'beads:listLabels',
    async (_event, args: BeadsRepoSelectorArgs): Promise<BeadsStringListResult> => {
      const repo = assertRegisteredRepo(args, store)
      return listLabels(repo.path, beadsCallOptions(store, repo))
    }
  )

  ipcMain.handle(
    'beads:addDependency',
    async (
      _event,
      args: BeadsRepoSelectorArgs & { issueId: string; dependsOnId: string }
    ): Promise<BeadsOkResult> => {
      const repo = assertRegisteredRepo(args, store)
      const issueId = validateBeadsIssueId(args.issueId)
      const dependsOnId = validateBeadsIssueId(args.dependsOnId)
      if (!issueId || !dependsOnId) {
        return { ok: false, error: INVALID_ID_ERROR }
      }
      return addDependency(repo.path, issueId, dependsOnId, beadsCallOptions(store, repo))
    }
  )

  ipcMain.handle(
    'beads:removeDependency',
    async (
      _event,
      args: BeadsRepoSelectorArgs & { issueId: string; dependsOnId: string }
    ): Promise<BeadsOkResult> => {
      const repo = assertRegisteredRepo(args, store)
      const issueId = validateBeadsIssueId(args.issueId)
      const dependsOnId = validateBeadsIssueId(args.dependsOnId)
      if (!issueId || !dependsOnId) {
        return { ok: false, error: INVALID_ID_ERROR }
      }
      return removeDependency(repo.path, issueId, dependsOnId, beadsCallOptions(store, repo))
    }
  )
}

export type { BeadsRepoSelectorArgs }
