import { describe, expect, it } from 'vitest'
import { classifyBdError, isTransientBdError, type BdErrorInput } from './bd-error-classification'
import type { ClassifiedError } from '../../shared/types'

// Why: fixtures are verbatim bd v1.1.0 stderr, captured either from a live
// binary run (unknown id, missing db) or extracted from the compiled Go
// binary's string table (dolt lock / read-only — genuine contention is
// timing-dependent and hard to force reliably from a CLI integration test).
const CASES: {
  name: string
  input: BdErrorInput
  type: ClassifiedError['type']
  transient: boolean
}[] = [
  {
    name: 'ENOENT spawn failure (bd binary not on PATH)',
    input: { stderr: '', error: Object.assign(new Error('spawn bd ENOENT'), { code: 'ENOENT' }) },
    type: 'unknown',
    transient: false
  },
  {
    name: 'no beads database found (repo never initialized)',
    input: {
      stderr:
        "Error: no beads database found\nHint: run 'bd where' to inspect the resolved workspace, or 'bd init' to create a new database\n      or set BEADS_DIR to point to your .beads directory\n"
    },
    type: 'not_found',
    transient: false
  },
  {
    name: 'no beads configuration found (falls back to default db name)',
    input: {
      stderr:
        'warning: no beads configuration found in .beads/embeddeddolt; using default database name "beads"'
    },
    type: 'not_found',
    transient: false
  },
  {
    name: 'unknown issue id (show)',
    input: { stderr: 'Error fetching orca-0cc: no issue found matching "orca-0cc"' },
    type: 'not_found',
    transient: false
  },
  {
    name: 'unknown issue id (resolving, e.g. update/close)',
    input: { stderr: 'Error: resolving orca-0cc: no issue found matching "orca-0cc"' },
    type: 'not_found',
    transient: false
  },
  {
    // Verified via live repro against installed bd 1.1.0 (`bd delete
    // <nonexistent-id>`): bd delete shares an id-resolution helper that
    // emits a different phrase order than "no issue(s) found matching"
    // above.
    name: 'unknown issue id (delete, singular)',
    input: { stderr: 'Error: issue orca-nonexistent-id not found' },
    type: 'not_found',
    transient: false
  },
  {
    // Verified via live repro against installed bd 1.1.0 (`bd delete
    // <id1> <id2>`, both nonexistent).
    name: 'unknown issue id (delete, batch/plural)',
    input: { stderr: 'Error: issues not found: orca-nonexistent-1, orca-nonexistent-2' },
    type: 'not_found',
    transient: false
  },
  {
    name: 'dolt exclusive lock held by another process',
    input: {
      stderr:
        'Error: embeddeddolt: another process holds the exclusive lock on /repo/.beads/embeddeddolt; the embedded backend supports only one writer at a time'
    },
    type: 'network_error',
    transient: true
  },
  {
    // bd emits this identical string for two indistinguishable causes: a
    // concurrent writer held the lock at open time (clears on retry), or
    // this repo's routing/hydration config makes the store permanently
    // read-only (no retry clears it) — see the message assertion below.
    name: 'dolt store read-only (locked-or-permanent, ambiguous from stderr alone)',
    input: { stderr: 'Error updating orca-0cc.17: embeddeddolt: store is read-only' },
    type: 'network_error',
    transient: true
  },
  {
    name: 'garbage stderr with no recognizable shape',
    input: { stderr: '\x00\x01 garbled non-utf8 nonsense 0x93 %%%' },
    type: 'unknown',
    transient: false
  },
  {
    name: 'malformed JSON (parse exception, no stderr)',
    input: { stderr: '', error: new SyntaxError('Unexpected token g in JSON at position 0') },
    type: 'unknown',
    transient: false
  },
  {
    name: 'empty everything (no stderr, no error)',
    input: {},
    type: 'unknown',
    transient: false
  }
]

describe('classifyBdError', () => {
  it.each(CASES)('$name → $type', ({ input, type, transient }) => {
    const classified = classifyBdError(input)
    expect(classified.type).toBe(type)
    expect(classified.message.length).toBeGreaterThan(0)
    expect(isTransientBdError(classified)).toBe(transient)
  })

  it('never throws on non-Error, non-object garbage input', () => {
    expect(() => classifyBdError({ error: 42 })).not.toThrow()
    expect(() => classifyBdError({ error: null })).not.toThrow()
    expect(() => classifyBdError({})).not.toThrow()
  })

  it('includes the raw id-resolution message so the UI can show which id failed', () => {
    const classified = classifyBdError({
      stderr: 'Error fetching orca-0cc.99: no issue found matching "orca-0cc.99"'
    })
    expect(classified.message).toContain('orca-0cc.99')
  })

  it('does NOT promise a fix for the ambiguous read-only shape (may be permanent, not just locked)', () => {
    // Why: "store is read-only" also fires when the repo's bd routing marks
    // this target as a permanently read-only hydration source — retrying
    // never clears that. The message must not claim it will.
    const classified = classifyBdError({
      stderr: 'Error updating orca-0cc.17: embeddeddolt: store is read-only'
    })
    expect(classified.message).not.toContain('Try again shortly')
    expect(classified.message.toLowerCase()).toContain('config')
  })

  it('DOES promise a fix for genuine open-time lock contention (unambiguous)', () => {
    const classified = classifyBdError({
      stderr:
        'Error: embeddeddolt: another process holds the exclusive lock on /repo/.beads/embeddeddolt; the embedded backend supports only one writer at a time'
    })
    expect(classified.message).toContain('Try again shortly')
  })
})

describe('isTransientBdError', () => {
  it('is true only for the network_error (dolt-lock) kind', () => {
    const kinds: ClassifiedError['type'][] = [
      'permission_denied',
      'not_found',
      'issues_disabled',
      'validation_error',
      'rate_limited',
      'network_error',
      'unknown'
    ]
    const transientKinds = kinds.filter((type) => isTransientBdError({ type, message: 'x' }))
    expect(transientKinds).toEqual(['network_error'])
  })
})
