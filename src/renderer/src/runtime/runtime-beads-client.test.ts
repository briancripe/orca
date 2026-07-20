// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as RuntimeRpcClient from './runtime-rpc-client'

const { callRuntimeRpcMock } = vi.hoisted(() => ({ callRuntimeRpcMock: vi.fn() }))

vi.mock('./runtime-rpc-client', async (importActual) => {
  const actual = await importActual<typeof RuntimeRpcClient>()
  return { ...actual, callRuntimeRpc: callRuntimeRpcMock }
})

import {
  beadsAddDependency,
  beadsCreateIssue,
  beadsDiagnose,
  beadsGetIssue,
  beadsListIssues,
  beadsUpdateIssue
} from './runtime-beads-client'

const localBeads = {
  diagnose: vi.fn(),
  listIssues: vi.fn(),
  issue: vi.fn(),
  listLabels: vi.fn(),
  createIssue: vi.fn(),
  updateIssue: vi.fn(),
  closeIssue: vi.fn(),
  reopenIssue: vi.fn(),
  addIssueComment: vi.fn(),
  addDependency: vi.fn(),
  removeDependency: vi.fn()
}

const LOCAL_REPO = { repoPath: '/local/orca', repoId: 'repo-1' }
const ENV_SETTINGS = { activeRuntimeEnvironmentId: 'env-1' }

beforeEach(() => {
  callRuntimeRpcMock.mockReset()
  for (const fn of Object.values(localBeads)) {
    fn.mockReset()
  }
  vi.stubGlobal('window', { api: { beads: localBeads } })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('runtime beads client — local vs remote branch selection', () => {
  it('routes to the desktop preload for a local target and never touches RPC', async () => {
    const listResult = { items: [{ id: 'orca-1', title: 'One', repoId: 'repo-1' }] }
    localBeads.listIssues.mockResolvedValue(listResult)

    const result = await beadsListIssues(null, { ...LOCAL_REPO, filters: { limit: 20 } })

    expect(localBeads.listIssues).toHaveBeenCalledWith({ ...LOCAL_REPO, filters: { limit: 20 } })
    expect(callRuntimeRpcMock).not.toHaveBeenCalled()
    expect(result).toEqual(listResult)
  })

  it('routes to the RPC twin for an environment target with a repo selector', async () => {
    const listResult = { items: [{ id: 'orca-1', title: 'One', repoId: 'repo-1' }] }
    callRuntimeRpcMock.mockResolvedValue(listResult)

    const result = await beadsListIssues(ENV_SETTINGS, { ...LOCAL_REPO, filters: { limit: 20 } })

    expect(localBeads.listIssues).not.toHaveBeenCalled()
    expect(callRuntimeRpcMock).toHaveBeenCalledWith(
      { kind: 'environment', environmentId: 'env-1' },
      'beads.listIssues',
      { repo: 'id:repo-1', filters: { limit: 20 } },
      expect.objectContaining({ timeoutMs: expect.any(Number) })
    )
    expect(result).toEqual(listResult)
  })

  it('produces an identical result shape on both branches', async () => {
    const issue = { id: 'orca-1', title: 'One', status: 'open' }
    localBeads.issue.mockResolvedValue(issue)
    callRuntimeRpcMock.mockResolvedValue(issue)

    const local = await beadsGetIssue(null, { ...LOCAL_REPO, id: 'orca-1' })
    const remote = await beadsGetIssue(ENV_SETTINGS, { ...LOCAL_REPO, id: 'orca-1' })

    expect(local).toEqual(remote)
    expect(callRuntimeRpcMock).toHaveBeenCalledWith(
      { kind: 'environment', environmentId: 'env-1' },
      'beads.issue',
      { repo: 'id:repo-1', id: 'orca-1' },
      expect.objectContaining({ timeoutMs: expect.any(Number) })
    )
  })

  it('falls back to a path selector when no repoId is present', async () => {
    callRuntimeRpcMock.mockResolvedValue({ bdAvailable: true, repoInitialized: true })

    await beadsDiagnose(ENV_SETTINGS, { repoPath: '/ssh/orca' })

    expect(callRuntimeRpcMock).toHaveBeenCalledWith(
      { kind: 'environment', environmentId: 'env-1' },
      'beads.diagnose',
      { repo: 'path:/ssh/orca' },
      expect.objectContaining({ timeoutMs: expect.any(Number) })
    )
  })

  it('passes mutation payloads through on each branch', async () => {
    localBeads.createIssue.mockResolvedValue({ ok: true, issue: { id: 'orca-2' } })
    callRuntimeRpcMock.mockResolvedValue({ ok: true, issue: { id: 'orca-2' } })

    await beadsCreateIssue(null, { ...LOCAL_REPO, input: { title: 'Two' } })
    expect(localBeads.createIssue).toHaveBeenCalledWith({ ...LOCAL_REPO, input: { title: 'Two' } })

    await beadsUpdateIssue(ENV_SETTINGS, {
      ...LOCAL_REPO,
      id: 'orca-2',
      updates: { status: 'in_progress' }
    })
    expect(callRuntimeRpcMock).toHaveBeenCalledWith(
      { kind: 'environment', environmentId: 'env-1' },
      'beads.updateIssue',
      { repo: 'id:repo-1', id: 'orca-2', updates: { status: 'in_progress' } },
      expect.objectContaining({ timeoutMs: expect.any(Number) })
    )

    await beadsAddDependency(ENV_SETTINGS, {
      ...LOCAL_REPO,
      issueId: 'orca-2',
      dependsOnId: 'orca-1'
    })
    expect(callRuntimeRpcMock).toHaveBeenCalledWith(
      { kind: 'environment', environmentId: 'env-1' },
      'beads.addDependency',
      { repo: 'id:repo-1', issueId: 'orca-2', dependsOnId: 'orca-1' },
      expect.objectContaining({ timeoutMs: expect.any(Number) })
    )
  })
})
