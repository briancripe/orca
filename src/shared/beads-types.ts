/* Beads (`bd`)-specific shared types. Domain model mapped from bd's JSON
   (snake_case) into the camelCase shapes the rest of Orca expects — mirrors
   how `gitlab-types.ts` sits alongside GitLab's client rather than living in
   the central `types.ts`. Shared layer: no Electron/renderer imports here. */

export type BeadsIssueStatus =
  | 'open'
  | 'in_progress'
  | 'blocked'
  | 'deferred'
  | 'closed'
  | 'pinned'
  | 'hooked'

// Why: the surfaced subset of bd's dependency-edge vocabulary — agent-internal
// edge types are filtered out by the mapper before a BeadsDependency is built.
export type BeadsDependencyType =
  | 'blocks'
  | 'parent-child'
  | 'related'
  | 'discovered-from'
  | 'relates-to'
  | 'duplicates'
  | 'supersedes'

export type BeadsDependency = {
  issueId: string
  dependsOnId: string
  type: BeadsDependencyType
}

export type BeadsComment = {
  id: string
  issueId: string
  author: string
  text: string
  createdAt: string
}

// Why: bd's priority is an int 0-4 (0 = highest); keep it a closed union so
// callers render it with labels (P0..P4) instead of an arbitrary number.
export type BeadsIssuePriority = 0 | 1 | 2 | 3 | 4

// Why: bd's issue_type vocabulary is open-ended (bug|feature|task|epic|...);
// kept as `string` so new bd issue types don't require a shared-layer change.
export type BeadsIssueInfo = {
  id: string
  title: string
  description?: string
  design?: string
  acceptanceCriteria?: string
  notes?: string
  status: BeadsIssueStatus
  priority: BeadsIssuePriority
  issueType: string
  assignee?: string
  owner?: string
  labels: string[]
  dependencies: BeadsDependency[]
  comments?: BeadsComment[]
  createdAt: string
  updatedAt: string
  closedAt?: string
  closeReason?: string
  externalRef?: string
}

// Why: lean row shape for list views, split from the full BeadsIssueInfo
// (description/design/notes/comments) — mirrors the GitLabWorkItem split
// from GitLabIssueInfo so the list surface doesn't pay for detail fields it
// never renders. repoId is stamped by the renderer fetcher, same as
// GitLabWorkItem.repoId.
export type BeadsWorkItem = {
  id: string
  title: string
  status: BeadsIssueStatus
  priority: BeadsIssuePriority
  issueType: string
  labels: string[]
  assignee?: string
  updatedAt: string
  repoId: string
}
