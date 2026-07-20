/* Barrel + concurrency control for the bd (Beads) client, cloned from
   gl-utils.ts's acquire/release semaphore but extended with a write lock:
   bd's embedded Dolt database is a single-writer store, so a write must never
   run concurrently with another write OR with an in-flight read (a read
   started against the pre-write state could otherwise race a write that
   changes it underfoot). Reads may still run up to MAX_CONCURRENT_READS at
   once, same as gl-utils, since bd's --readonly reads don't contend with
   each other. */
import { bdExecFileAsync, extractExecError, type BdExecOptions } from '../git/runner'
import { classifyBdError, isTransientBdError } from './bd-error-classification'

export { bdExecFileAsync, classifyBdError, isTransientBdError }
export type { BdExecOptions }

const MAX_CONCURRENT_READS = 4

let activeReaders = 0
let writerActive = false
const readQueue: (() => void)[] = []
const writeQueue: (() => void)[] = []

// Why: a queued writer must not be starved by a steady stream of new readers
// arriving after it — new reads only proceed immediately when no writer is
// waiting; once one is queued, reads queue up behind it too.
function canStartReadNow(): boolean {
  return !writerActive && writeQueue.length === 0 && activeReaders < MAX_CONCURRENT_READS
}

function acquireRead(): Promise<void> {
  if (canStartReadNow()) {
    activeReaders += 1
    return Promise.resolve()
  }
  return new Promise((resolve) =>
    readQueue.push(() => {
      activeReaders += 1
      resolve()
    })
  )
}

function releaseRead(): void {
  activeReaders -= 1
  pump()
}

function acquireWrite(): Promise<void> {
  if (!writerActive && activeReaders === 0 && writeQueue.length === 0) {
    writerActive = true
    return Promise.resolve()
  }
  return new Promise((resolve) =>
    writeQueue.push(() => {
      writerActive = true
      resolve()
    })
  )
}

function releaseWrite(): void {
  writerActive = false
  pump()
}

function pump(): void {
  if (writerActive) {
    return
  }
  if (writeQueue.length > 0 && activeReaders === 0) {
    const nextWriter = writeQueue.shift()
    nextWriter?.()
    return
  }
  while (canStartReadNow() && readQueue.length > 0) {
    const nextReader = readQueue.shift()
    nextReader?.()
  }
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Why: shorter than the runner's own BD_RETRY_DELAYS_MS is unnecessary — this
// module already gates retries on the fixture-verified classifier
// (isTransientBdError from bd-error-classification.ts) rather than the
// runner's conservative raw-stderr heuristic, so we own the retry loop here
// instead of delegating to bdExecFileAsync's `idempotent` flag.
const BD_READ_RETRY_DELAYS_MS = [100, 300] as const

export type BdCallOptions = {
  signal?: AbortSignal
  timeoutMs?: number
  wslDistro?: string
  env?: NodeJS.ProcessEnv
}

/**
 * Run a read-only bd command: `--readonly` is always appended, the call is
 * bounded by the read semaphore, and a transient error (per the
 * fixture-verified classifier) is retried a couple of times with a short
 * backoff. Never call this for a command that mutates state.
 */
export async function bdRead(
  // Why `undefined` is allowed: `bd version` is not repo-scoped, and passing
  // `-C <dir>` to it errors ("no beads project found") when the target repo
  // hasn't run `bd init` yet — exactly the case diagnoseBeads must be able to
  // report on. Every repo-scoped caller still always passes a real path.
  repoPath: string | undefined,
  args: string[],
  options: BdCallOptions & { positionals?: string[] } = {}
): Promise<{ stdout: string; stderr: string }> {
  const execOptions: BdExecOptions = {
    ...(repoPath !== undefined ? { cwd: repoPath } : {}),
    readonly: true,
    signal: options.signal,
    timeoutMs: options.timeoutMs,
    wslDistro: options.wslDistro,
    env: options.env,
    positionals: options.positionals
  }
  await acquireRead()
  try {
    let lastError: unknown
    for (let attempt = 0; attempt <= BD_READ_RETRY_DELAYS_MS.length; attempt++) {
      try {
        return await bdExecFileAsync(args, execOptions)
      } catch (err) {
        lastError = err
        const isLastAttempt = attempt >= BD_READ_RETRY_DELAYS_MS.length
        const classified = classifyBdError({ stderr: extractExecError(err).stderr, error: err })
        if (!isLastAttempt && isTransientBdError(classified)) {
          await sleep(BD_READ_RETRY_DELAYS_MS[attempt])
          continue
        }
        throw err
      }
    }
    throw lastError
  } finally {
    releaseRead()
  }
}

/**
 * Run a mutating bd command: bounded by the write lock (exclusive of reads
 * and other writes) and NEVER retried — a retried write after a transient
 * failure could duplicate the mutation (e.g. a second `bd create`).
 */
export async function bdWrite(
  repoPath: string,
  args: string[],
  options: BdCallOptions & { positionals?: string[] } = {}
): Promise<{ stdout: string; stderr: string }> {
  const execOptions: BdExecOptions = {
    cwd: repoPath,
    signal: options.signal,
    timeoutMs: options.timeoutMs,
    wslDistro: options.wslDistro,
    env: options.env,
    positionals: options.positionals
  }
  await acquireWrite()
  try {
    return await bdExecFileAsync(args, execOptions)
  } finally {
    releaseWrite()
  }
}

/** Build a `ClassifiedError` from a caught bd exec rejection. */
export function classifyBdExecError(err: unknown): ReturnType<typeof classifyBdError> {
  return classifyBdError({ stderr: extractExecError(err).stderr, error: err })
}
