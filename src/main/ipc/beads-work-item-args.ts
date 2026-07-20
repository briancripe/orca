import type { TaskSourceContext } from '../../shared/task-source-context'

// Why: beads issue ids are opaque strings (e.g. `orca-42`, `bd-a3f8e9`), so
// the integer-only dispatchWorkItem guard github/gitlab use can't cover them.
// This file owns the string-id validation for every beads channel that passes
// an id straight into `bd`'s argv.
export type BeadsWorkItemArgs = {
  repoPath: string
  repoId?: string | null
  sourceContext?: TaskSourceContext | null
  id: string
}

// Why: first char is alphanumeric (never `-`) so a value can't be smuggled in
// as a `bd` flag, and the tail is restricted to the id alphabet bd actually
// mints (`[A-Za-z0-9._-]`) — anything with a space, `=`, or control char is
// rejected rather than reaching the spawn.
const BEADS_ISSUE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

/**
 * Validate an issue id arriving from the renderer (untrusted IPC input).
 * Returns the id unchanged when safe, or `null` when it must not reach `bd` —
 * callers turn `null` into a `null`/error-envelope result without spawning.
 */
export function validateBeadsIssueId(id: unknown): string | null {
  if (typeof id !== 'string') {
    return null
  }
  // Why: explicit leading-`-` reject (subsumed by the pattern) documents the
  // flag-smuggling threat this guard exists for — `-rf`/`--db=x` must never
  // reach bd's argv even if the pattern is later loosened.
  if (id.startsWith('-')) {
    return null
  }
  return BEADS_ISSUE_ID_PATTERN.test(id) ? id : null
}
