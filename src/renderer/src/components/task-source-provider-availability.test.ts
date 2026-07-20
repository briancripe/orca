import { describe, expect, it } from 'vitest'
import type { PreflightStatus } from '../../../preload/api-types'
import type { TaskSourceContext } from '../../../shared/task-source-context'
import { getRepoBackedProviderAvailability } from './task-source-provider-availability'

const readyPreflight: PreflightStatus = {
  git: { installed: true },
  gh: { installed: true, authenticated: true },
  glab: { installed: true, authenticated: true },
  beads: { installed: true }
}

function source(hostId: TaskSourceContext['hostId']): TaskSourceContext {
  return {
    kind: 'task-source',
    provider: 'github',
    projectId: 'github:stablyai/orca',
    hostId,
    repoId: `repo-${hostId}`
  }
}

describe('task source provider availability', () => {
  it('marks desktop-owned GitHub sources unavailable when gh auth is missing', () => {
    expect(
      getRepoBackedProviderAvailability({
        provider: 'github',
        contexts: [source('local'), source('ssh:builder')],
        preflightReady: true,
        preflightStatus: {
          ...readyPreflight,
          gh: { installed: true, authenticated: false }
        }
      })
    ).toEqual([
      { hostId: 'local', reason: 'missing-provider-auth' },
      { hostId: 'ssh:builder', reason: 'missing-provider-auth' }
    ])
  })

  it('marks desktop-owned GitLab sources unavailable when glab is missing', () => {
    expect(
      getRepoBackedProviderAvailability({
        provider: 'gitlab',
        contexts: [source('local')],
        preflightReady: true,
        preflightStatus: {
          ...readyPreflight,
          glab: { installed: false, authenticated: false }
        }
      })
    ).toEqual([{ hostId: 'local', reason: 'unavailable-source-tool' }])
  })

  it('marks GitLab unsupported when a host preflight payload predates GitLab support', () => {
    const { glab: _glab, ...preGitLabPreflight } = readyPreflight

    expect(
      getRepoBackedProviderAvailability({
        provider: 'gitlab',
        contexts: [source('local')],
        preflightReady: true,
        preflightStatus: preGitLabPreflight
      })
    ).toEqual([{ hostId: 'local', reason: 'unsupported-provider' }])
  })

  it('does not apply desktop preflight to runtime-owned sources', () => {
    expect(
      getRepoBackedProviderAvailability({
        provider: 'github',
        contexts: [source('runtime:server')],
        preflightReady: true,
        preflightStatus: {
          ...readyPreflight,
          gh: { installed: false, authenticated: false }
        }
      })
    ).toEqual([])
  })

  it('marks runtime-owned GitHub sources unavailable from their own preflight', () => {
    expect(
      getRepoBackedProviderAvailability({
        provider: 'github',
        contexts: [source('runtime:server')],
        preflightReady: true,
        preflightStatus: readyPreflight,
        runtimePreflightStatusByHostId: new Map([
          [
            'runtime:server',
            {
              checked: true,
              status: {
                ...readyPreflight,
                gh: { installed: true, authenticated: false }
              }
            }
          ]
        ])
      })
    ).toEqual([{ hostId: 'runtime:server', reason: 'missing-provider-auth' }])
  })

  it('waits for runtime preflight before reporting runtime provider availability', () => {
    expect(
      getRepoBackedProviderAvailability({
        provider: 'github',
        contexts: [source('runtime:server')],
        preflightReady: true,
        preflightStatus: readyPreflight,
        runtimePreflightStatusByHostId: new Map([
          [
            'runtime:server',
            {
              checked: false,
              status: null
            }
          ]
        ])
      })
    ).toEqual([])
  })

  it('marks runtime-owned GitLab sources unsupported when runtime preflight lacks GitLab', () => {
    const { glab: _glab, ...preGitLabPreflight } = readyPreflight

    expect(
      getRepoBackedProviderAvailability({
        provider: 'gitlab',
        contexts: [source('runtime:server')],
        preflightReady: true,
        preflightStatus: readyPreflight,
        runtimePreflightStatusByHostId: new Map([
          [
            'runtime:server',
            {
              checked: true,
              status: preGitLabPreflight
            }
          ]
        ])
      })
    ).toEqual([{ hostId: 'runtime:server', reason: 'unsupported-provider' }])
  })

  it('waits for preflight before reporting provider availability', () => {
    expect(
      getRepoBackedProviderAvailability({
        provider: 'github',
        contexts: [source('local')],
        preflightReady: false,
        preflightStatus: {
          ...readyPreflight,
          gh: { installed: false, authenticated: false }
        }
      })
    ).toEqual([])
  })

  it('marks bd unavailable when the binary is missing from PATH', () => {
    expect(
      getRepoBackedProviderAvailability({
        provider: 'beads',
        contexts: [source('local')],
        preflightReady: true,
        preflightStatus: {
          ...readyPreflight,
          beads: { installed: false }
        }
      })
    ).toEqual([{ hostId: 'local', reason: 'unavailable-source-tool' }])
  })

  it('treats a missing beads preflight field (older server) as not installed', () => {
    const { beads: _beads, ...preBeadsPreflight } = readyPreflight

    expect(
      getRepoBackedProviderAvailability({
        provider: 'beads',
        contexts: [source('local')],
        preflightReady: true,
        preflightStatus: preBeadsPreflight
      })
    ).toEqual([{ hostId: 'local', reason: 'unavailable-source-tool' }])
  })

  it('waits for repo diagnose before reporting bd availability once bd is on PATH', () => {
    expect(
      getRepoBackedProviderAvailability({
        provider: 'beads',
        contexts: [source('local')],
        preflightReady: true,
        preflightStatus: readyPreflight
      })
    ).toEqual([])
  })

  it('marks bd unavailable with a distinct init-guidance reason when the repo is not yet initialized', () => {
    expect(
      getRepoBackedProviderAvailability({
        provider: 'beads',
        contexts: [source('local')],
        preflightReady: true,
        preflightStatus: readyPreflight,
        beadsRepoDiagnosisByRepoId: new Map([
          ['repo-local', { checked: true, status: { bdAvailable: true, repoInitialized: false } }]
        ])
      })
    ).toEqual([{ hostId: 'local', reason: 'beads-repo-not-initialized' }])
  })

  it('marks bd unavailable with the generic tool reason when diagnose reports bd missing', () => {
    expect(
      getRepoBackedProviderAvailability({
        provider: 'beads',
        contexts: [source('local')],
        preflightReady: true,
        preflightStatus: readyPreflight,
        beadsRepoDiagnosisByRepoId: new Map([
          ['repo-local', { checked: true, status: { bdAvailable: false, repoInitialized: false } }]
        ])
      })
    ).toEqual([{ hostId: 'local', reason: 'unavailable-source-tool' }])
  })

  it('marks bd available when installed and the repo is initialized', () => {
    expect(
      getRepoBackedProviderAvailability({
        provider: 'beads',
        contexts: [source('local')],
        preflightReady: true,
        preflightStatus: readyPreflight,
        beadsRepoDiagnosisByRepoId: new Map([
          ['repo-local', { checked: true, status: { bdAvailable: true, repoInitialized: true } }]
        ])
      })
    ).toEqual([])
  })

  it('does not apply beads repo diagnosis to other providers', () => {
    expect(
      getRepoBackedProviderAvailability({
        provider: 'github',
        contexts: [source('local')],
        preflightReady: true,
        preflightStatus: readyPreflight,
        beadsRepoDiagnosisByRepoId: new Map([
          ['repo-local', { checked: true, status: { bdAvailable: false, repoInitialized: false } }]
        ])
      })
    ).toEqual([])
  })
})
