import { z } from 'zod'
import { defineMethod, type RpcMethod } from '../core'
import { OptionalString, requiredString } from '../schemas'
import { validateBeadsIssueId } from '../../../ipc/beads-work-item-args'

const RepoSelector = z.object({
  repo: requiredString('Missing repo selector')
})

// Why: mirror the shared BeadsIssueStatus / BeadsIssuePriority unions so the
// zod-inferred params match the bd-client's narrowed input types exactly (the
// same closed sets the mapper validates bd's output against).
const BeadsStatus = z.enum([
  'open',
  'in_progress',
  'blocked',
  'deferred',
  'closed',
  'pinned',
  'hooked'
])
const BeadsPriority = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4)
])

// Why: bd issue ids are opaque strings that flow straight into bd's argv, so
// the RPC boundary rejects a flag-smuggling id (leading '-', spaces, control
// chars) with the same validator the desktop IPC handlers use — a remote
// runtime host must not be a softer entry point than the local one.
const BeadsIssueId = z
  .unknown()
  .transform((value) => (typeof value === 'string' ? value : ''))
  .pipe(z.string().refine((v) => validateBeadsIssueId(v) !== null, 'Invalid beads issue id'))

const IssueFilters = z
  .object({
    status: z.array(BeadsStatus).optional(),
    ready: z.boolean().optional(),
    type: OptionalString,
    assignee: OptionalString,
    label: OptionalString,
    parent: OptionalString,
    titleContains: OptionalString,
    limit: z.number().optional()
  })
  .optional()

const ListIssues = RepoSelector.extend({ filters: IssueFilters })

const IssueRef = RepoSelector.extend({ id: BeadsIssueId })

const CreateIssue = RepoSelector.extend({
  input: z.object({
    title: requiredString('Missing title'),
    description: z.string().optional(),
    design: z.string().optional(),
    acceptanceCriteria: z.string().optional(),
    notes: z.string().optional(),
    type: z.string().optional(),
    priority: BeadsPriority.optional(),
    assignee: z.string().optional(),
    labels: z.array(z.string()).optional(),
    parent: z.string().optional(),
    externalRef: z.string().optional()
  })
})

const UpdateIssue = IssueRef.extend({
  updates: z.object({
    title: z.string().optional(),
    description: z.string().optional(),
    design: z.string().optional(),
    acceptanceCriteria: z.string().optional(),
    notes: z.string().optional(),
    status: BeadsStatus.optional(),
    type: z.string().optional(),
    priority: BeadsPriority.optional(),
    assignee: z.string().optional(),
    addLabels: z.array(z.string()).optional(),
    removeLabels: z.array(z.string()).optional(),
    parent: z.string().nullable().optional(),
    externalRef: z.string().optional()
  })
})

const CloseOrReopenIssue = IssueRef.extend({ reason: OptionalString })

const AddIssueComment = IssueRef.extend({
  text: requiredString('Comment text is required')
})

const DependencyEdge = RepoSelector.extend({
  issueId: BeadsIssueId,
  dependsOnId: BeadsIssueId
})

export const BEADS_METHODS: RpcMethod[] = [
  defineMethod({
    name: 'beads.diagnose',
    params: RepoSelector,
    handler: async (params, { runtime }) => runtime.diagnoseRepoBeads(params.repo)
  }),
  defineMethod({
    name: 'beads.listIssues',
    params: ListIssues,
    handler: async (params, { runtime }) => runtime.listBeadsRepoIssues(params.repo, params.filters)
  }),
  defineMethod({
    name: 'beads.issue',
    params: IssueRef,
    handler: async (params, { runtime }) => runtime.getBeadsRepoIssue(params.repo, params.id)
  }),
  defineMethod({
    name: 'beads.listLabels',
    params: RepoSelector,
    handler: async (params, { runtime }) => runtime.listBeadsRepoLabels(params.repo)
  }),
  defineMethod({
    name: 'beads.createIssue',
    params: CreateIssue,
    handler: async (params, { runtime }) => runtime.createBeadsRepoIssue(params.repo, params.input)
  }),
  defineMethod({
    name: 'beads.updateIssue',
    params: UpdateIssue,
    handler: async (params, { runtime }) =>
      runtime.updateBeadsRepoIssue(params.repo, params.id, params.updates)
  }),
  defineMethod({
    name: 'beads.closeIssue',
    params: CloseOrReopenIssue,
    handler: async (params, { runtime }) =>
      runtime.closeBeadsRepoIssue(params.repo, params.id, params.reason)
  }),
  defineMethod({
    name: 'beads.reopenIssue',
    params: CloseOrReopenIssue,
    handler: async (params, { runtime }) =>
      runtime.reopenBeadsRepoIssue(params.repo, params.id, params.reason)
  }),
  defineMethod({
    name: 'beads.addIssueComment',
    params: AddIssueComment,
    handler: async (params, { runtime }) =>
      runtime.addBeadsRepoIssueComment(params.repo, params.id, params.text)
  }),
  defineMethod({
    name: 'beads.addDependency',
    params: DependencyEdge,
    handler: async (params, { runtime }) =>
      runtime.addBeadsRepoDependency(params.repo, params.issueId, params.dependsOnId)
  }),
  defineMethod({
    name: 'beads.removeDependency',
    params: DependencyEdge,
    handler: async (params, { runtime }) =>
      runtime.removeBeadsRepoDependency(params.repo, params.issueId, params.dependsOnId)
  })
]
