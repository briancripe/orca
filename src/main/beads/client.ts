import type { ClassifiedError } from '../../shared/types'
import { bdRead, classifyBdExecError, type BdCallOptions } from './bd-utils'

export type BdDiagnostics = {
  bdAvailable: boolean
  version?: string
  repoInitialized: boolean
  error?: ClassifiedError
}

function parseBdVersion(stdout: string): string | undefined {
  try {
    const parsed = JSON.parse(stdout) as { version?: unknown }
    return typeof parsed.version === 'string' ? parsed.version : undefined
  } catch {
    return undefined
  }
}

/**
 * Fast health-check for the beads IPC surface: is `bd` on PATH, what version
 * is it, and does this repo have an initialized beads database. Deliberately
 * cheap — no issue listing here, just two minimal reads.
 */
export async function diagnoseBeads(
  repoPath: string,
  opts: BdCallOptions = {}
): Promise<BdDiagnostics> {
  let version: string | undefined
  try {
    // Why no `-C repoPath` here: see the doc comment on bdRead's `repoPath`
    // parameter — `bd version` errors on an un-initialized repo when scoped
    // with `-C`, which would misreport "bd not available" for the common
    // "bd is installed, repo just isn't initialized yet" case.
    const { stdout } = await bdRead(undefined, ['version', '--json'], opts)
    version = parseBdVersion(stdout)
  } catch (err) {
    return { bdAvailable: false, repoInitialized: false, error: classifyBdExecError(err) }
  }

  try {
    // Why --no-activity: skips bd's git-history scan, keeping this call
    // cheap — diagnoseBeads is meant to be a fast health check, not a report.
    await bdRead(repoPath, ['status', '--no-activity', '--json'], opts)
    return { bdAvailable: true, version, repoInitialized: true }
  } catch (err) {
    const error = classifyBdExecError(err)
    if (error.type === 'not_found') {
      return { bdAvailable: true, version, repoInitialized: false }
    }
    return { bdAvailable: true, version, repoInitialized: false, error }
  }
}
