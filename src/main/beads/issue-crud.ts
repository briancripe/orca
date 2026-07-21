import type { ClassifiedError } from '../../shared/types'
import type {
  BeadsComment,
  BeadsIssueInfo,
  BeadsIssuePriority,
  BeadsIssueStatus
} from '../../shared/beads-types'
import { mapComment, parseBdIssueArray } from './mappers'
import { bdWrite, classifyBdExecError, type BdCallOptions } from './bd-utils'
import { getIssue } from './issue-queries'

export type BeadsIssueMutationResult =
  | { ok: true; issue: BeadsIssueInfo }
  | { ok: false; error: ClassifiedError }

export type BeadsCommentMutationResult =
  | { ok: true; comment: BeadsComment }
  | { ok: false; error: ClassifiedError }

export type BeadsIssueCreateInput = {
  title: string
  description?: string
  design?: string
  acceptanceCriteria?: string
  notes?: string
  type?: string
  priority?: BeadsIssuePriority
  assignee?: string
  labels?: string[]
  parent?: string
  externalRef?: string
}

export type BeadsIssueUpdate = {
  title?: string
  description?: string
  design?: string
  acceptanceCriteria?: string
  notes?: string
  status?: BeadsIssueStatus
  type?: string
  priority?: BeadsIssuePriority
  assignee?: string
  addLabels?: string[]
  removeLabels?: string[]
  /** `null` clears the parent (bd accepts an empty string for that). */
  parent?: string | null
  externalRef?: string
}

function createArgs(input: BeadsIssueCreateInput): string[] {
  return [
    'create',
    '--json',
    '--silent',
    '--title',
    input.title,
    ...(input.description !== undefined ? ['--description', input.description] : []),
    ...(input.design !== undefined ? ['--design', input.design] : []),
    ...(input.acceptanceCriteria !== undefined ? ['--acceptance', input.acceptanceCriteria] : []),
    ...(input.notes !== undefined ? ['--notes', input.notes] : []),
    ...(input.type ? ['--type', input.type] : []),
    ...(input.priority !== undefined ? ['--priority', String(input.priority)] : []),
    ...(input.assignee ? ['--assignee', input.assignee] : []),
    ...(input.labels && input.labels.length > 0 ? ['--labels', input.labels.join(',')] : []),
    ...(input.parent ? ['--parent', input.parent] : []),
    ...(input.externalRef ? ['--external-ref', input.externalRef] : [])
  ]
}

function extractCreatedIssueId(stdout: string): string | null {
  const trimmed = stdout.trim()
  try {
    const parsed = JSON.parse(trimmed) as { id?: unknown }
    return typeof parsed.id === 'string' && parsed.id.length > 0 ? parsed.id : null
  } catch {
    // Why: tolerate a bd build/config where --silent wins over --json and
    // prints only the bare id (no JSON) — see BdExecOptions callers' note
    // that this path must stay `--silent`-compatible.
    return trimmed.length > 0 ? trimmed : null
  }
}

/**
 * Create an issue, then re-fetch it via `getIssue` so the returned shape is
 * always the same fully-populated `BeadsIssueInfo` every other mutation here
 * returns — `bd create`'s own JSON response is not relied on beyond the id.
 */
export async function createIssue(
  repoPath: string,
  input: BeadsIssueCreateInput,
  opts: BdCallOptions = {}
): Promise<BeadsIssueMutationResult> {
  try {
    const { stdout } = await bdWrite(repoPath, createArgs(input), opts)
    const id = extractCreatedIssueId(stdout)
    if (!id) {
      return {
        ok: false,
        error: { type: 'unknown', message: 'bd create did not return an issue id.' }
      }
    }
    const issue = await getIssue(repoPath, id, opts)
    if (!issue) {
      return {
        ok: false,
        error: { type: 'unknown', message: `Issue ${id} was created but could not be re-fetched.` }
      }
    }
    return { ok: true, issue }
  } catch (err) {
    return { ok: false, error: classifyBdExecError(err) }
  }
}

function updateArgs(updates: BeadsIssueUpdate): string[] {
  const args: string[] = []
  if (updates.title !== undefined) {
    args.push('--title', updates.title)
  }
  if (updates.description !== undefined) {
    args.push('--description', updates.description)
  }
  if (updates.design !== undefined) {
    args.push('--design', updates.design)
  }
  if (updates.acceptanceCriteria !== undefined) {
    args.push('--acceptance', updates.acceptanceCriteria)
  }
  if (updates.notes !== undefined) {
    args.push('--notes', updates.notes)
  }
  if (updates.status !== undefined) {
    args.push('--status', updates.status)
  }
  if (updates.type !== undefined) {
    args.push('--type', updates.type)
  }
  if (updates.priority !== undefined) {
    args.push('--priority', String(updates.priority))
  }
  if (updates.assignee !== undefined) {
    args.push('--assignee', updates.assignee)
  }
  for (const label of updates.addLabels ?? []) {
    args.push('--add-label', label)
  }
  for (const label of updates.removeLabels ?? []) {
    args.push('--remove-label', label)
  }
  if (updates.parent !== undefined) {
    args.push('--parent', updates.parent ?? '')
  }
  if (updates.externalRef !== undefined) {
    args.push('--external-ref', updates.externalRef)
  }
  return args
}

export async function updateIssue(
  repoPath: string,
  id: string,
  updates: BeadsIssueUpdate,
  opts: BdCallOptions = {}
): Promise<BeadsIssueMutationResult> {
  try {
    const { stdout } = await bdWrite(repoPath, ['update', '--json', ...updateArgs(updates)], {
      ...opts,
      positionals: [id]
    })
    const issue = parseBdIssueArray(stdout)[0]
    if (!issue) {
      return { ok: false, error: { type: 'unknown', message: 'bd update returned no issue.' } }
    }
    return { ok: true, issue }
  } catch (err) {
    return { ok: false, error: classifyBdExecError(err) }
  }
}

export async function closeIssue(
  repoPath: string,
  id: string,
  reason?: string,
  opts: BdCallOptions = {}
): Promise<BeadsIssueMutationResult> {
  try {
    const { stdout } = await bdWrite(
      repoPath,
      ['close', '--json', ...(reason ? ['--reason', reason] : [])],
      { ...opts, positionals: [id] }
    )
    const issue = parseBdIssueArray(stdout)[0]
    if (!issue) {
      return { ok: false, error: { type: 'unknown', message: 'bd close returned no issue.' } }
    }
    return { ok: true, issue }
  } catch (err) {
    return { ok: false, error: classifyBdExecError(err) }
  }
}

export async function reopenIssue(
  repoPath: string,
  id: string,
  reason?: string,
  opts: BdCallOptions = {}
): Promise<BeadsIssueMutationResult> {
  try {
    const { stdout } = await bdWrite(
      repoPath,
      ['reopen', '--json', ...(reason ? ['--reason', reason] : [])],
      { ...opts, positionals: [id] }
    )
    const issue = parseBdIssueArray(stdout)[0]
    if (!issue) {
      return { ok: false, error: { type: 'unknown', message: 'bd reopen returned no issue.' } }
    }
    return { ok: true, issue }
  } catch (err) {
    return { ok: false, error: classifyBdExecError(err) }
  }
}

/**
 * `bd comment --json -- <id> <text>` returns a flat single-object response
 * (not array-wrapped like show/update/close/reopen) whose snake_case field
 * names already match `mapComment`'s expected shape.
 */
export async function addIssueComment(
  repoPath: string,
  id: string,
  text: string,
  opts: BdCallOptions = {}
): Promise<BeadsCommentMutationResult> {
  try {
    const { stdout } = await bdWrite(repoPath, ['comment', '--json'], {
      ...opts,
      positionals: [id, text]
    })
    let raw: unknown
    try {
      raw = JSON.parse(stdout)
    } catch {
      raw = null
    }
    const comment = mapComment(raw)
    if (!comment) {
      return { ok: false, error: { type: 'unknown', message: 'bd comment returned no comment.' } }
    }
    return { ok: true, comment }
  } catch (err) {
    return { ok: false, error: classifyBdExecError(err) }
  }
}
