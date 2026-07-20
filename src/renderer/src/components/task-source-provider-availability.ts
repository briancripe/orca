import { parseExecutionHostId } from '../../../shared/execution-host'
import type { TaskProvider } from '../../../shared/types'
import type { PreflightStatus, PreloadApi } from '../../../preload/api-types'
import type { TaskSourceContext } from '../../../shared/task-source-context'
import type { TaskSourceHostAvailability } from './task-source-context-summary'

type ProviderToolStatus = {
  installed: boolean
  authenticated: boolean
}

// Why: 'repo-not-initialized' is beads-only — the repo's `.beads/` hasn't
// been created, distinct from the tool being absent entirely.
type ProviderAvailabilityStatus = ProviderToolStatus | 'unsupported' | 'repo-not-initialized'

export type RuntimeProviderPreflightStatus = {
  checked: boolean
  status: PreflightStatus | null
}

type BeadsDiagnostics = Awaited<ReturnType<PreloadApi['beads']['diagnose']>>

// Why: the per-repo `.beads/` init check (bd diagnose) is orthogonal to the
// global "bd on PATH" preflight signal — a repo can sit on a host where bd is
// installed but never initialized. Diagnose is repo-scoped (unlike gh/glab,
// which are host-scoped), so callers key it by repoId rather than hostId.
export type RepoBeadsDiagnosis = {
  checked: boolean
  status: BeadsDiagnostics | null
}

function isDesktopOwnedHost(hostId: TaskSourceContext['hostId']): boolean {
  const parsed = parseExecutionHostId(hostId)
  return parsed?.kind !== 'runtime'
}

function getRepoBackedProviderToolStatus(
  provider: Extract<TaskProvider, 'github' | 'gitlab' | 'beads'>,
  preflightStatus: PreflightStatus | null,
  beadsDiagnosis?: RepoBeadsDiagnosis
): ProviderAvailabilityStatus | null {
  if (!preflightStatus) {
    return null
  }
  if (provider === 'github') {
    return preflightStatus.gh
  }
  if (provider === 'beads') {
    // Why: bd has no hosted auth (see PreflightStatus.beads doc), so
    // "authenticated" never applies here — but "bd not on PATH" and "repo not
    // initialized" are two distinct, separately-actionable problems, so they
    // report different reasons via getProviderReason below.
    if (preflightStatus.beads?.installed !== true) {
      return { installed: false, authenticated: false }
    }
    if (!beadsDiagnosis?.checked) {
      return null
    }
    if (beadsDiagnosis.status?.bdAvailable !== true) {
      return { installed: false, authenticated: false }
    }
    if (!beadsDiagnosis.status.repoInitialized) {
      return 'repo-not-initialized'
    }
    return { installed: true, authenticated: true }
  }
  // Why: older remote servers can predate GitLab preflight entirely. That is a
  // host capability gap, not a user-fixable missing `glab` install.
  return Object.hasOwn(preflightStatus, 'glab')
    ? (preflightStatus.glab ?? { installed: false, authenticated: false })
    : 'unsupported'
}

function getProviderReason(
  status: ProviderAvailabilityStatus
): TaskSourceHostAvailability['reason'] | null {
  if (status === 'unsupported') {
    return 'unsupported-provider'
  }
  if (status === 'repo-not-initialized') {
    return 'beads-repo-not-initialized'
  }
  if (!status.installed) {
    return 'unavailable-source-tool'
  }
  if (!status.authenticated) {
    return 'missing-provider-auth'
  }
  return null
}

export function getRepoBackedProviderAvailability(args: {
  provider: Extract<TaskProvider, 'github' | 'gitlab' | 'beads'>
  contexts: readonly TaskSourceContext[]
  preflightStatus: PreflightStatus | null
  preflightReady: boolean
  runtimePreflightStatusByHostId?: ReadonlyMap<
    TaskSourceContext['hostId'],
    RuntimeProviderPreflightStatus
  >
  // Why: keyed by repoId (not hostId) — bd's `.beads/` init state is per
  // repo, so two repos on the same host can disagree.
  beadsRepoDiagnosisByRepoId?: ReadonlyMap<string, RepoBeadsDiagnosis>
}): TaskSourceHostAvailability[] {
  return args.contexts.flatMap((context) => {
    const hostPreflight = isDesktopOwnedHost(context.hostId)
      ? { checked: args.preflightReady, status: args.preflightStatus }
      : args.runtimePreflightStatusByHostId?.get(context.hostId)
    if (!hostPreflight?.checked) {
      return []
    }
    const beadsDiagnosis =
      args.provider === 'beads' && context.repoId
        ? args.beadsRepoDiagnosisByRepoId?.get(context.repoId)
        : undefined
    const status = getRepoBackedProviderToolStatus(
      args.provider,
      hostPreflight.status,
      beadsDiagnosis
    )
    const reason = status ? getProviderReason(status) : null
    return reason ? [{ hostId: context.hostId, reason }] : []
  })
}
