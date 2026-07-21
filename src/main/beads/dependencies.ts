import type { ClassifiedError } from '../../shared/types'
import type { BeadsWorkItem } from '../../shared/beads-types'
import { mapBdListItem } from './mappers'
import { bdRead, bdWrite, classifyBdExecError, type BdCallOptions } from './bd-utils'

export type BeadsOkResult = { ok: true } | { ok: false; error: ClassifiedError }

/**
 * Add a `blocks` dependency: `issueId` becomes blocked by `dependsOnId`.
 * `bd dep add <issueId> <dependsOnId>` is the only dependency shape this
 * client creates — other edge types (parent-child, relates-to, ...) are
 * bd-internal or created through other commands (e.g. `--parent` on create).
 */
export async function addDependency(
  repoPath: string,
  issueId: string,
  dependsOnId: string,
  opts: BdCallOptions = {}
): Promise<BeadsOkResult> {
  try {
    await bdWrite(repoPath, ['dep', 'add', '--json'], {
      ...opts,
      positionals: [issueId, dependsOnId]
    })
    return { ok: true }
  } catch (err) {
    return { ok: false, error: classifyBdExecError(err) }
  }
}

export async function removeDependency(
  repoPath: string,
  issueId: string,
  dependsOnId: string,
  opts: BdCallOptions = {}
): Promise<BeadsOkResult> {
  try {
    await bdWrite(repoPath, ['dep', 'remove', '--json'], {
      ...opts,
      positionals: [issueId, dependsOnId]
    })
    return { ok: true }
  } catch (err) {
    return { ok: false, error: classifyBdExecError(err) }
  }
}

export type BeadsChildrenResult = {
  items: BeadsWorkItem[]
  error?: ClassifiedError
}

const DEFAULT_CHILDREN_LIMIT = 50

/** List the direct children of a parent issue (e.g. an epic's tasks). */
export async function listChildren(
  repoPath: string,
  parentId: string,
  opts: BdCallOptions & { limit?: number; includeClosed?: boolean } = {}
): Promise<BeadsChildrenResult> {
  try {
    const { stdout } = await bdRead(
      repoPath,
      [
        'list',
        '--json',
        '--no-pager',
        '--parent',
        parentId,
        '--limit',
        String(opts.limit ?? DEFAULT_CHILDREN_LIMIT),
        // Why --all: bd's default `list` filter omits closed issues, so
        // callers that need closed children (e.g. getEpicProgress) must
        // opt in explicitly rather than losing them silently.
        ...(opts.includeClosed ? ['--all'] : [])
      ],
      opts
    )
    let parsed: unknown
    try {
      parsed = JSON.parse(stdout)
    } catch {
      return { items: [] }
    }
    const items = Array.isArray(parsed)
      ? parsed.map(mapBdListItem).filter((item): item is BeadsWorkItem => item !== null)
      : []
    return { items }
  } catch (err) {
    return { items: [], error: classifyBdExecError(err) }
  }
}

export type BeadsEpicProgress = {
  total: number
  openCount: number
  inProgressCount: number
  blockedCount: number
  closedCount: number
  percentClosed: number
}

// Why: derived purely from already-fetched children (one listChildren call)
// rather than a separate bd aggregate query — bd has no "epic progress"
// command, and this keeps diagnoseBeads-style call sites cheap.
export function summarizeEpicProgress(children: BeadsWorkItem[]): BeadsEpicProgress {
  const total = children.length
  const closedCount = children.filter((c) => c.status === 'closed').length
  const inProgressCount = children.filter((c) => c.status === 'in_progress').length
  const blockedCount = children.filter((c) => c.status === 'blocked').length
  const openCount = total - closedCount - inProgressCount - blockedCount
  return {
    total,
    openCount,
    inProgressCount,
    blockedCount,
    closedCount,
    percentClosed: total === 0 ? 0 : Math.round((closedCount / total) * 100)
  }
}

export type BeadsEpicProgressResult = {
  progress: BeadsEpicProgress
  error?: ClassifiedError
}

export async function getEpicProgress(
  repoPath: string,
  epicId: string,
  opts: BdCallOptions & { limit?: number } = {}
): Promise<BeadsEpicProgressResult> {
  const { items, error } = await listChildren(repoPath, epicId, { ...opts, includeClosed: true })
  return { progress: summarizeEpicProgress(items), ...(error ? { error } : {}) }
}
