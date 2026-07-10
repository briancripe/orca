/* eslint-disable max-lines -- Why: parallel to gitlab/issues.ts — co-locating
issue CRUD + comment + label/assignee lookups keeps the shared bdRead/bdWrite
+ error-classification pattern obvious. Each function is short; the file is
long because the surface is broad. */
import type { ClassifiedError } from '../../shared/types'
import type {
  BeadsComment,
  BeadsIssueInfo,
  BeadsIssuePriority,
  BeadsIssueStatus,
  BeadsWorkItem
} from '../../shared/beads-types'
import { mapBdListItem, mapComment, parseBdIssueArray } from './mappers'
import { bdRead, bdWrite, classifyBdExecError, type BdCallOptions } from './bd-utils'

// Why: bd's own `list` default (50) is the exact silent-truncation trap the
// epic calls out — this constant exists so every call site passes an
// explicit `--limit` (rule enforced by tests), matching bd's default instead
// of silently picking something else, while still being explicit about it.
const DEFAULT_LIST_LIMIT = 50

export type BeadsIssueFilters = {
  status?: BeadsIssueStatus[]
  ready?: boolean
  type?: string
  assignee?: string
  label?: string
  parent?: string
  titleContains?: string
  limit?: number
}

export type BeadsIssueListResult = {
  items: BeadsWorkItem[]
  error?: ClassifiedError
}

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

function listFilterArgs(filters: BeadsIssueFilters): string[] {
  return [
    ...(filters.status && filters.status.length > 0 ? ['--status', filters.status.join(',')] : []),
    ...(filters.ready ? ['--ready'] : []),
    ...(filters.type ? ['--type', filters.type] : []),
    ...(filters.assignee ? ['--assignee', filters.assignee] : []),
    ...(filters.label ? ['--label', filters.label] : []),
    ...(filters.parent ? ['--parent', filters.parent] : []),
    ...(filters.titleContains ? ['--title-contains', filters.titleContains] : []),
    '--limit',
    String(filters.limit ?? DEFAULT_LIST_LIMIT)
  ]
}

function parseBdListItems(stdout: string): BeadsWorkItem[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(stdout)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) {
    return []
  }
  return parsed.map(mapBdListItem).filter((item): item is BeadsWorkItem => item !== null)
}

export async function listIssues(
  repoPath: string,
  filters: BeadsIssueFilters = {},
  opts: BdCallOptions = {}
): Promise<BeadsIssueListResult> {
  try {
    const { stdout } = await bdRead(
      repoPath,
      ['list', '--json', '--no-pager', ...listFilterArgs(filters)],
      opts
    )
    return { items: parseBdListItems(stdout) }
  } catch (err) {
    return { items: [], error: classifyBdExecError(err) }
  }
}

/**
 * Fetch one issue's full detail. Returns `null` on any failure (unknown id,
 * bd not installed, locked db after retries, ...) — callers that need to
 * distinguish those cases should call `diagnoseBeads` first, mirroring how
 * gitlab's `getIssue` collapses failures to `null` for the same reason (a
 * single missing-issue lookup shouldn't need its own error UI).
 */
export async function getIssue(
  repoPath: string,
  id: string,
  opts: BdCallOptions = {}
): Promise<BeadsIssueInfo | null> {
  try {
    const { stdout } = await bdRead(repoPath, ['show', '--json', '--include-comments'], {
      ...opts,
      positionals: [id]
    })
    return parseBdIssueArray(stdout)[0] ?? null
  } catch {
    return null
  }
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

type RawListRow = Record<string, unknown>

async function listAllIssuesRaw(
  repoPath: string,
  opts: BdCallOptions & { limit?: number }
): Promise<{ items: RawListRow[]; error?: ClassifiedError }> {
  try {
    const { stdout } = await bdRead(
      repoPath,
      ['list', '--json', '--no-pager', '--all', '--limit', String(opts.limit ?? 0)],
      opts
    )
    let parsed: unknown
    try {
      parsed = JSON.parse(stdout)
    } catch {
      return { items: [] }
    }
    return { items: Array.isArray(parsed) ? (parsed as RawListRow[]) : [] }
  } catch (err) {
    return { items: [], error: classifyBdExecError(err) }
  }
}

export type BeadsStringListResult = { items: string[]; error?: ClassifiedError }

/** Every distinct label in use across the repo (not per-issue). */
export async function listLabels(
  repoPath: string,
  opts: BdCallOptions & { limit?: number } = {}
): Promise<BeadsStringListResult> {
  const { items, error } = await listAllIssuesRaw(repoPath, opts)
  const labels = new Set<string>()
  for (const raw of items) {
    const labelsField = raw.labels
    if (Array.isArray(labelsField)) {
      for (const label of labelsField) {
        if (typeof label === 'string') {
          labels.add(label)
        }
      }
    }
  }
  return { items: Array.from(labels).sort(), ...(error ? { error } : {}) }
}

/**
 * Distinct assignee/owner strings seen across existing issues, scraped from
 * `bd list` since bd has no user directory to query — these are suggestions
 * only; bd accepts any free-text string as an assignee.
 */
export async function listAssignableUsers(
  repoPath: string,
  opts: BdCallOptions & { limit?: number } = {}
): Promise<BeadsStringListResult> {
  const { items, error } = await listAllIssuesRaw(repoPath, opts)
  const values = new Set<string>()
  for (const raw of items) {
    if (typeof raw.assignee === 'string' && raw.assignee) {
      values.add(raw.assignee)
    }
    if (typeof raw.owner === 'string' && raw.owner) {
      values.add(raw.owner)
    }
  }
  return { items: Array.from(values).sort(), ...(error ? { error } : {}) }
}
