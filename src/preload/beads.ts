/* Beads (`bd`) preload bindings — split out of `src/preload/index.ts` so
   adding or changing a `beads.*` channel doesn't surface as a merge
   conflict on every upstream sync of the much larger central preload file
   (same rationale as `./gitlab`). Composed back into `api.beads` from
   `index.ts`. */
import { ipcRenderer } from 'electron'
import type { TaskSourceContext } from '../shared/task-source-context'
import type { BeadsComment, BeadsIssueInfo, BeadsWorkItem } from '../shared/beads-types'
import type { ClassifiedError } from '../shared/types'

type BeadsRepoSelectorArgs = {
  repoPath: string
  repoId?: string | null
  sourceContext?: TaskSourceContext | null
}

type BeadsWorkItemArgs = BeadsRepoSelectorArgs & { id: string }

type BeadsDiagnostics = {
  bdAvailable: boolean
  version?: string
  repoInitialized: boolean
  error?: ClassifiedError
}

type BeadsIssueFilters = {
  status?: string[]
  ready?: boolean
  type?: string
  assignee?: string
  label?: string
  parent?: string
  titleContains?: string
  limit?: number
}

type BeadsIssueCreateInput = {
  title: string
  description?: string
  design?: string
  acceptanceCriteria?: string
  notes?: string
  type?: string
  priority?: number
  assignee?: string
  labels?: string[]
  parent?: string
  externalRef?: string
}

type BeadsIssueUpdate = {
  title?: string
  description?: string
  design?: string
  acceptanceCriteria?: string
  notes?: string
  status?: string
  type?: string
  priority?: number
  assignee?: string
  addLabels?: string[]
  removeLabels?: string[]
  parent?: string | null
  externalRef?: string
}

type BeadsListResult = { items: BeadsWorkItem[]; error?: ClassifiedError }
type BeadsIssueMutationResult =
  | { ok: true; issue: BeadsIssueInfo }
  | { ok: false; error: ClassifiedError }
type BeadsCommentMutationResult =
  | { ok: true; comment: BeadsComment }
  | { ok: false; error: ClassifiedError }
type BeadsStringListResult = { items: string[]; error?: ClassifiedError }
type BeadsOkResult = { ok: true } | { ok: false; error: ClassifiedError }

export const beadsApi = {
  diagnose: (args: BeadsRepoSelectorArgs): Promise<BeadsDiagnostics> =>
    ipcRenderer.invoke('beads:diagnose', args),

  listIssues: (
    args: BeadsRepoSelectorArgs & { filters?: BeadsIssueFilters }
  ): Promise<BeadsListResult> => ipcRenderer.invoke('beads:listIssues', args),

  listWorkItems: (
    args: BeadsRepoSelectorArgs & { filters?: BeadsIssueFilters }
  ): Promise<BeadsListResult> => ipcRenderer.invoke('beads:listWorkItems', args),

  issue: (args: BeadsWorkItemArgs): Promise<BeadsIssueInfo | null> =>
    ipcRenderer.invoke('beads:issue', args),

  workItemDetails: (args: BeadsWorkItemArgs): Promise<BeadsIssueInfo | null> =>
    ipcRenderer.invoke('beads:workItemDetails', args),

  createIssue: (
    args: BeadsRepoSelectorArgs & { input: BeadsIssueCreateInput }
  ): Promise<BeadsIssueMutationResult> => ipcRenderer.invoke('beads:createIssue', args),

  updateIssue: (
    args: BeadsWorkItemArgs & { updates: BeadsIssueUpdate }
  ): Promise<BeadsIssueMutationResult> => ipcRenderer.invoke('beads:updateIssue', args),

  closeIssue: (args: BeadsWorkItemArgs & { reason?: string }): Promise<BeadsIssueMutationResult> =>
    ipcRenderer.invoke('beads:closeIssue', args),

  reopenIssue: (args: BeadsWorkItemArgs & { reason?: string }): Promise<BeadsIssueMutationResult> =>
    ipcRenderer.invoke('beads:reopenIssue', args),

  addIssueComment: (
    args: BeadsWorkItemArgs & { text: string }
  ): Promise<BeadsCommentMutationResult> => ipcRenderer.invoke('beads:addIssueComment', args),

  listLabels: (args: BeadsRepoSelectorArgs): Promise<BeadsStringListResult> =>
    ipcRenderer.invoke('beads:listLabels', args),

  addDependency: (
    args: BeadsRepoSelectorArgs & { issueId: string; dependsOnId: string }
  ): Promise<BeadsOkResult> => ipcRenderer.invoke('beads:addDependency', args),

  removeDependency: (
    args: BeadsRepoSelectorArgs & { issueId: string; dependsOnId: string }
  ): Promise<BeadsOkResult> => ipcRenderer.invoke('beads:removeDependency', args)
}
