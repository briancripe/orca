import type { ClassifiedError } from '../../shared/types'
import type { BeadsIssueInfo, BeadsIssueStatus, BeadsWorkItem } from '../../shared/beads-types'
import { mapBdListItem, parseBdIssueArray } from './mappers'
import { bdRead, classifyBdExecError, type BdCallOptions } from './bd-utils'

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
