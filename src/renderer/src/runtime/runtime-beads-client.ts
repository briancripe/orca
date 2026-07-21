/* The one beads API the store slice sees. Branches on the active runtime
   target: a local target hits the desktop preload (`window.api.beads.*`); an
   environment target sends the RPC twin (`beads.<method>`) to whichever host
   owns the checkout — bd runs there, so remote availability comes from
   `beads.diagnose` per target, never a local preflight probe. Structured after
   runtime-jira-client; repo-scoped like the GitLab surface. */
import type { GlobalSettings } from '../../../shared/types'
import type { PreloadApi } from '../../../preload/api-types'
import {
  getTaskSourceRuntimeSettings,
  type TaskSourceContext
} from '../../../shared/task-source-context'
import { callRuntimeRpc, getActiveRuntimeTarget } from './runtime-rpc-client'

type BeadsApi = PreloadApi['beads']

// Why: bd's Dolt store can be slower than a REST call (git-history scans,
// write-lock waits), so give remote beads RPCs the same generous ceiling the
// other provider clients use rather than the default.
const BEADS_RPC_TIMEOUT_MS = 30_000

export type RuntimeBeadsSettings =
  | Pick<GlobalSettings, 'activeRuntimeEnvironmentId'>
  | TaskSourceContext
  | null
  | undefined

type BeadsRepoRef = { repoPath: string; repoId?: string | null }

function isTaskSourceRuntimeSettings(
  settings: RuntimeBeadsSettings
): settings is TaskSourceContext {
  return settings !== null && settings !== undefined && 'kind' in settings
}

function getBeadsRuntimeTarget(
  settings: RuntimeBeadsSettings
): ReturnType<typeof getActiveRuntimeTarget> {
  // Why: task source context makes provider ownership explicit; legacy callers
  // still pass focused runtime settings (mirrors runtime-jira-client).
  return getActiveRuntimeTarget(
    isTaskSourceRuntimeSettings(settings) ? getTaskSourceRuntimeSettings(settings) : settings
  )
}

// Why: the runtime host resolves a repo by selector string, not the
// {repoPath, repoId} the preload IPC takes — prefer the stable id, fall back
// to the path (mirrors web-preload-api's repo-selector mapping).
function beadsRepoSelector(args: BeadsRepoRef): string {
  return args.repoId ? `id:${args.repoId}` : `path:${args.repoPath}`
}

type DiagnoseArgs = Parameters<BeadsApi['diagnose']>[0]
type ListArgs = Parameters<BeadsApi['listIssues']>[0]
type IssueArgs = Parameters<BeadsApi['issue']>[0]
type CreateArgs = Parameters<BeadsApi['createIssue']>[0]
type UpdateArgs = Parameters<BeadsApi['updateIssue']>[0]
type CloseArgs = Parameters<BeadsApi['closeIssue']>[0]
type ReopenArgs = Parameters<BeadsApi['reopenIssue']>[0]
type CommentArgs = Parameters<BeadsApi['addIssueComment']>[0]
type LabelsArgs = Parameters<BeadsApi['listLabels']>[0]
type DependencyArgs = Parameters<BeadsApi['addDependency']>[0]

export async function beadsDiagnose(
  settings: RuntimeBeadsSettings,
  args: DiagnoseArgs
): Promise<Awaited<ReturnType<BeadsApi['diagnose']>>> {
  const target = getBeadsRuntimeTarget(settings)
  return target.kind === 'environment'
    ? callRuntimeRpc(
        target,
        'beads.diagnose',
        { repo: beadsRepoSelector(args) },
        {
          timeoutMs: BEADS_RPC_TIMEOUT_MS
        }
      )
    : window.api.beads.diagnose(args)
}

export async function beadsListIssues(
  settings: RuntimeBeadsSettings,
  args: ListArgs
): Promise<Awaited<ReturnType<BeadsApi['listIssues']>>> {
  const target = getBeadsRuntimeTarget(settings)
  return target.kind === 'environment'
    ? callRuntimeRpc(
        target,
        'beads.listIssues',
        { repo: beadsRepoSelector(args), filters: args.filters },
        { timeoutMs: BEADS_RPC_TIMEOUT_MS }
      )
    : window.api.beads.listIssues(args)
}

export async function beadsGetIssue(
  settings: RuntimeBeadsSettings,
  args: IssueArgs
): Promise<Awaited<ReturnType<BeadsApi['issue']>>> {
  const target = getBeadsRuntimeTarget(settings)
  return target.kind === 'environment'
    ? callRuntimeRpc(
        target,
        'beads.issue',
        { repo: beadsRepoSelector(args), id: args.id },
        { timeoutMs: BEADS_RPC_TIMEOUT_MS }
      )
    : window.api.beads.issue(args)
}

export async function beadsListLabels(
  settings: RuntimeBeadsSettings,
  args: LabelsArgs
): Promise<Awaited<ReturnType<BeadsApi['listLabels']>>> {
  const target = getBeadsRuntimeTarget(settings)
  return target.kind === 'environment'
    ? callRuntimeRpc(
        target,
        'beads.listLabels',
        { repo: beadsRepoSelector(args) },
        {
          timeoutMs: BEADS_RPC_TIMEOUT_MS
        }
      )
    : window.api.beads.listLabels(args)
}

export async function beadsCreateIssue(
  settings: RuntimeBeadsSettings,
  args: CreateArgs
): Promise<Awaited<ReturnType<BeadsApi['createIssue']>>> {
  const target = getBeadsRuntimeTarget(settings)
  return target.kind === 'environment'
    ? callRuntimeRpc(
        target,
        'beads.createIssue',
        { repo: beadsRepoSelector(args), input: args.input },
        { timeoutMs: BEADS_RPC_TIMEOUT_MS }
      )
    : window.api.beads.createIssue(args)
}

export async function beadsUpdateIssue(
  settings: RuntimeBeadsSettings,
  args: UpdateArgs
): Promise<Awaited<ReturnType<BeadsApi['updateIssue']>>> {
  const target = getBeadsRuntimeTarget(settings)
  return target.kind === 'environment'
    ? callRuntimeRpc(
        target,
        'beads.updateIssue',
        { repo: beadsRepoSelector(args), id: args.id, updates: args.updates },
        { timeoutMs: BEADS_RPC_TIMEOUT_MS }
      )
    : window.api.beads.updateIssue(args)
}

export async function beadsCloseIssue(
  settings: RuntimeBeadsSettings,
  args: CloseArgs
): Promise<Awaited<ReturnType<BeadsApi['closeIssue']>>> {
  const target = getBeadsRuntimeTarget(settings)
  return target.kind === 'environment'
    ? callRuntimeRpc(
        target,
        'beads.closeIssue',
        { repo: beadsRepoSelector(args), id: args.id, reason: args.reason },
        { timeoutMs: BEADS_RPC_TIMEOUT_MS }
      )
    : window.api.beads.closeIssue(args)
}

export async function beadsReopenIssue(
  settings: RuntimeBeadsSettings,
  args: ReopenArgs
): Promise<Awaited<ReturnType<BeadsApi['reopenIssue']>>> {
  const target = getBeadsRuntimeTarget(settings)
  return target.kind === 'environment'
    ? callRuntimeRpc(
        target,
        'beads.reopenIssue',
        { repo: beadsRepoSelector(args), id: args.id, reason: args.reason },
        { timeoutMs: BEADS_RPC_TIMEOUT_MS }
      )
    : window.api.beads.reopenIssue(args)
}

export async function beadsAddIssueComment(
  settings: RuntimeBeadsSettings,
  args: CommentArgs
): Promise<Awaited<ReturnType<BeadsApi['addIssueComment']>>> {
  const target = getBeadsRuntimeTarget(settings)
  return target.kind === 'environment'
    ? callRuntimeRpc(
        target,
        'beads.addIssueComment',
        { repo: beadsRepoSelector(args), id: args.id, text: args.text },
        { timeoutMs: BEADS_RPC_TIMEOUT_MS }
      )
    : window.api.beads.addIssueComment(args)
}

export async function beadsAddDependency(
  settings: RuntimeBeadsSettings,
  args: DependencyArgs
): Promise<Awaited<ReturnType<BeadsApi['addDependency']>>> {
  const target = getBeadsRuntimeTarget(settings)
  return target.kind === 'environment'
    ? callRuntimeRpc(
        target,
        'beads.addDependency',
        { repo: beadsRepoSelector(args), issueId: args.issueId, dependsOnId: args.dependsOnId },
        { timeoutMs: BEADS_RPC_TIMEOUT_MS }
      )
    : window.api.beads.addDependency(args)
}

export async function beadsRemoveDependency(
  settings: RuntimeBeadsSettings,
  args: DependencyArgs
): Promise<Awaited<ReturnType<BeadsApi['removeDependency']>>> {
  const target = getBeadsRuntimeTarget(settings)
  return target.kind === 'environment'
    ? callRuntimeRpc(
        target,
        'beads.removeDependency',
        { repo: beadsRepoSelector(args), issueId: args.issueId, dependsOnId: args.dependsOnId },
        { timeoutMs: BEADS_RPC_TIMEOUT_MS }
      )
    : window.api.beads.removeDependency(args)
}
