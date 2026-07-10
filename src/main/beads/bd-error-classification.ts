import type { ClassifiedError } from '../../shared/types'

// Why: 'network_error' is a semantic stretch for a local dolt file lock —
// there is no network — but it's the only ClassifiedError member callers
// already treat as retryable (see gitlab/glab-error-classification.ts). We
// rely on the caller reading THIS module's `.message` (both rules below),
// not a type-keyed lookup like gitlab's classifyListIssuesError; a bd
// caller must not reuse that pattern for 'network_error' or a locked
// beads db would show gitlab's "check your connection" copy.

// Why: the bd client (reads vs writes) is the only caller that knows whether
// a given command is idempotent, so this input mirrors what execFile hands
// back rather than pre-deciding retry eligibility here.
export type BdErrorInput = {
  stderr?: string
  exitCode?: number
  error?: unknown
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return typeof error === 'string' ? error : ''
}

// Why: mirrors isHostCommandMissing in git/runner.ts — execFile's spawn
// rejection carries `code: 'ENOENT'` when the bd binary itself isn't on PATH.
function isSpawnEnoent(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false
  }
  const e = error as { code?: unknown; message?: unknown }
  if (e.code === 'ENOENT') {
    return true
  }
  return typeof e.message === 'string' && e.message.toLowerCase().includes('enoent')
}

type BdErrorRule = {
  matches: (stderrLower: string) => boolean
  classify: (rawStderr: string) => ClassifiedError
}

// Why: substring rules, table-driven per gl-error-classification /
// gh-error-classification. Order matters — the dolt-lock and unknown-id
// rules run before the generic missing-db fallback because bd's lock and
// id-resolution messages also mention "database"/"dolt" in context.
const RULES: BdErrorRule[] = [
  {
    // Verified bd v1.1.0 string: "another process holds the exclusive lock
    // on %s; the embedded backend supports only one writer at a time" —
    // only fires on open-time contention, so it's unambiguously transient.
    matches: (s) => s.includes('holds the exclusive lock') || s.includes('acquiring lock'),
    classify: () => ({
      type: 'network_error',
      message: 'The beads database is locked by another process. Try again shortly.'
    })
  },
  {
    // Verified bd v1.1.0 string: "embeddeddolt: store is read-only". Do NOT
    // assert this is transient — bd emits the identical string for two
    // causes we cannot tell apart from stderr alone: (1) a concurrent
    // writer held the lock at open time, which clears on retry, and (2) the
    // routing target is permanently read-only because it's also registered
    // as a read-only hydration repo (repos.additional), which no retry will
    // ever clear. Still marked transient (a few bounded retries are
    // harmless either way, capped by the caller's isLastAttempt), but the
    // message names both possibilities instead of promising a fix.
    matches: (s) => s.includes('embeddeddolt') && s.includes('read-only'),
    classify: () => ({
      type: 'network_error',
      message:
        'The beads database is read-only — either locked by another process (retry shortly) or configured as permanently read-only (check the bd routing/hydration config for this repo).'
    })
  },
  {
    // Verified bd v1.1.0 strings: "Error fetching <id>: no issue found
    // matching %q" (show) and "Error: resolving <id>: no issue found
    // matching %q" (update/other commands resolving an id).
    matches: (s) => s.includes('no issue found matching') || s.includes('no issues found matching'),
    classify: (raw) => ({ type: 'not_found', message: `Issue not found — ${raw.trim()}` })
  },
  {
    // Verified against installed bd v1.1.0 (live repro): "Error: issue <id>
    // not found" (singular, id inline) and "Error: issues not found:
    // <id1>, <id2>" (batch/plural) — a different phrase order from the
    // "no issue(s) found matching" rule above, so it needs its own match.
    matches: (s) => /^error: issues? .*not found\b/.test(s),
    classify: (raw) => ({ type: 'not_found', message: `Issue not found — ${raw.trim()}` })
  },
  {
    // Verified bd v1.1.0 strings: "no beads database found" (bd where has
    // no repo to resolve), "no beads configuration found in %s..." (warns
    // then falls back to a default db name), and "dolt directory not
    // found. Is the current directory a repository directory?".
    matches: (s) =>
      s.includes('no beads database found') ||
      s.includes('no beads configuration found') ||
      s.includes('dolt directory not found'),
    classify: () => ({
      type: 'not_found',
      message: 'No beads database found for this repository — run `bd init` first.'
    })
  }
]

// Why: bd surfaces failures as unstructured stderr (or a spawn/parse
// exception, never a typed error), so map known patterns onto the
// ClassifiedError kinds gitlab/github already use — no new renderer cases.
// Defensive by construction: anything that matches no rule falls back to
// 'unknown' rather than throwing, per the epic's defensive-mapping rule.
export function classifyBdError({ stderr = '', error }: BdErrorInput): ClassifiedError {
  if (isSpawnEnoent(error)) {
    return { type: 'unknown', message: 'bd is not installed or not found on PATH.' }
  }
  const raw = stderr.trim() || errorMessage(error)
  const lower = raw.toLowerCase()
  for (const rule of RULES) {
    if (rule.matches(lower)) {
      return rule.classify(raw)
    }
  }
  return {
    type: 'unknown',
    message: raw ? `bd command failed: ${raw}` : 'bd command failed.'
  }
}

// Why: the retry-policy oracle the bd client consumes. Lock contention is
// the only bd failure mode that resolves itself if you wait and try again;
// bad ids, missing databases, and permission errors need a different
// command, not a repeat of the same one. Callers still gate this on their
// own idempotency (reads retry, writes never — a retried create could
// duplicate an issue).
export function isTransientBdError(e: ClassifiedError): boolean {
  return e.type === 'network_error'
}
