import { describe, expect, it, vi } from 'vitest'
import { RpcDispatcher } from '../dispatcher'
import type { RpcRequest } from '../core'
import type { OrcaRuntimeService } from '../../orca-runtime'
import { BEADS_METHODS } from './beads'

function makeRequest(method: string, params?: unknown): RpcRequest {
  return { id: 'req-1', authToken: 'tok', method, params }
}

describe('beads RPC methods', () => {
  it('routes beads queries and mutations to the runtime server with arg pass-through', async () => {
    const runtime = {
      getRuntimeId: () => 'test-runtime',
      diagnoseRepoBeads: vi.fn().mockResolvedValue({ bdAvailable: true, repoInitialized: true }),
      listBeadsRepoIssues: vi.fn().mockResolvedValue({ items: [] }),
      getBeadsRepoIssue: vi.fn().mockResolvedValue({ id: 'orca-1', title: 'One' }),
      listBeadsRepoLabels: vi.fn().mockResolvedValue({ items: ['bug'] }),
      createBeadsRepoIssue: vi.fn().mockResolvedValue({ ok: true, issue: { id: 'orca-2' } }),
      updateBeadsRepoIssue: vi.fn().mockResolvedValue({ ok: true, issue: { id: 'orca-2' } }),
      closeBeadsRepoIssue: vi.fn().mockResolvedValue({ ok: true, issue: { id: 'orca-2' } }),
      reopenBeadsRepoIssue: vi.fn().mockResolvedValue({ ok: true, issue: { id: 'orca-2' } }),
      addBeadsRepoIssueComment: vi.fn().mockResolvedValue({ ok: true, comment: { id: 'c1' } }),
      addBeadsRepoDependency: vi.fn().mockResolvedValue({ ok: true }),
      removeBeadsRepoDependency: vi.fn().mockResolvedValue({ ok: true })
    } as unknown as OrcaRuntimeService
    const dispatcher = new RpcDispatcher({ runtime, methods: BEADS_METHODS })

    await dispatcher.dispatch(makeRequest('beads.diagnose', { repo: 'id:repo-1' }))
    await dispatcher.dispatch(
      makeRequest('beads.listIssues', {
        repo: 'id:repo-1',
        filters: { status: ['open'], limit: 20 }
      })
    )
    await dispatcher.dispatch(makeRequest('beads.issue', { repo: 'id:repo-1', id: 'orca-1' }))
    await dispatcher.dispatch(makeRequest('beads.listLabels', { repo: 'id:repo-1' }))
    await dispatcher.dispatch(
      makeRequest('beads.createIssue', { repo: 'id:repo-1', input: { title: 'Two' } })
    )
    await dispatcher.dispatch(
      makeRequest('beads.updateIssue', {
        repo: 'id:repo-1',
        id: 'orca-2',
        updates: { status: 'in_progress' }
      })
    )
    await dispatcher.dispatch(
      makeRequest('beads.closeIssue', { repo: 'id:repo-1', id: 'orca-2', reason: 'done' })
    )
    await dispatcher.dispatch(makeRequest('beads.reopenIssue', { repo: 'id:repo-1', id: 'orca-2' }))
    await dispatcher.dispatch(
      makeRequest('beads.addIssueComment', { repo: 'id:repo-1', id: 'orca-2', text: 'note' })
    )
    await dispatcher.dispatch(
      makeRequest('beads.addDependency', {
        repo: 'id:repo-1',
        issueId: 'orca-2',
        dependsOnId: 'orca-1'
      })
    )
    await dispatcher.dispatch(
      makeRequest('beads.removeDependency', {
        repo: 'id:repo-1',
        issueId: 'orca-2',
        dependsOnId: 'orca-1'
      })
    )

    expect(runtime.diagnoseRepoBeads).toHaveBeenCalledWith('id:repo-1')
    expect(runtime.listBeadsRepoIssues).toHaveBeenCalledWith('id:repo-1', {
      status: ['open'],
      limit: 20
    })
    expect(runtime.getBeadsRepoIssue).toHaveBeenCalledWith('id:repo-1', 'orca-1')
    expect(runtime.listBeadsRepoLabels).toHaveBeenCalledWith('id:repo-1')
    expect(runtime.createBeadsRepoIssue).toHaveBeenCalledWith('id:repo-1', { title: 'Two' })
    expect(runtime.updateBeadsRepoIssue).toHaveBeenCalledWith('id:repo-1', 'orca-2', {
      status: 'in_progress'
    })
    expect(runtime.closeBeadsRepoIssue).toHaveBeenCalledWith('id:repo-1', 'orca-2', 'done')
    expect(runtime.reopenBeadsRepoIssue).toHaveBeenCalledWith('id:repo-1', 'orca-2', undefined)
    expect(runtime.addBeadsRepoIssueComment).toHaveBeenCalledWith('id:repo-1', 'orca-2', 'note')
    expect(runtime.addBeadsRepoDependency).toHaveBeenCalledWith('id:repo-1', 'orca-2', 'orca-1')
    expect(runtime.removeBeadsRepoDependency).toHaveBeenCalledWith('id:repo-1', 'orca-2', 'orca-1')
  })

  it('rejects a flag-smuggling issue id at the RPC boundary before reaching the runtime', async () => {
    const runtime = {
      getRuntimeId: () => 'test-runtime',
      getBeadsRepoIssue: vi.fn().mockResolvedValue(null),
      addBeadsRepoDependency: vi.fn().mockResolvedValue({ ok: true })
    } as unknown as OrcaRuntimeService
    const dispatcher = new RpcDispatcher({ runtime, methods: BEADS_METHODS })

    const issueResponse = await dispatcher.dispatch(
      makeRequest('beads.issue', { repo: 'id:repo-1', id: '--db=x' })
    )
    const depResponse = await dispatcher.dispatch(
      makeRequest('beads.addDependency', {
        repo: 'id:repo-1',
        issueId: 'orca-1',
        dependsOnId: '-rf'
      })
    )

    expect(issueResponse.ok).toBe(false)
    expect(depResponse.ok).toBe(false)
    expect(runtime.getBeadsRepoIssue).not.toHaveBeenCalled()
    expect(runtime.addBeadsRepoDependency).not.toHaveBeenCalled()
  })
})
