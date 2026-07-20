import { beforeEach, describe, expect, it, vi } from 'vitest'
import { create } from 'zustand'
import type { AppState } from '../types'
import { createBeadsSlice, type BeadsRepoContext } from './beads'

const beadsListIssues = vi.fn()
const beadsGetIssue = vi.fn()
const beadsListLabels = vi.fn()
const beadsCreateIssue = vi.fn()
const beadsUpdateIssue = vi.fn()
const beadsCloseIssue = vi.fn()
const beadsReopenIssue = vi.fn()
const beadsAddIssueComment = vi.fn()
const beadsAddDependency = vi.fn()
const beadsRemoveDependency = vi.fn()
const beadsDiagnose = vi.fn()

vi.mock('@/runtime/runtime-beads-client', () => ({
  beadsListIssues: (...args: unknown[]) => beadsListIssues(...args),
  beadsGetIssue: (...args: unknown[]) => beadsGetIssue(...args),
  beadsListLabels: (...args: unknown[]) => beadsListLabels(...args),
  beadsCreateIssue: (...args: unknown[]) => beadsCreateIssue(...args),
  beadsUpdateIssue: (...args: unknown[]) => beadsUpdateIssue(...args),
  beadsCloseIssue: (...args: unknown[]) => beadsCloseIssue(...args),
  beadsReopenIssue: (...args: unknown[]) => beadsReopenIssue(...args),
  beadsAddIssueComment: (...args: unknown[]) => beadsAddIssueComment(...args),
  beadsAddDependency: (...args: unknown[]) => beadsAddDependency(...args),
  beadsRemoveDependency: (...args: unknown[]) => beadsRemoveDependency(...args),
  beadsDiagnose: (...args: unknown[]) => beadsDiagnose(...args)
}))

function createTestStore() {
  return create<AppState>()(
    (...a) =>
      ({
        settings: null,
        ...createBeadsSlice(...a)
      }) as AppState
  )
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

const REPO_A: BeadsRepoContext = { repoPath: '/repos/a', repoId: 'repo-a' }
const REPO_B: BeadsRepoContext = { repoPath: '/repos/b', repoId: 'repo-b' }

function workItem(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    title: id,
    status: 'open',
    priority: 2,
    issueType: 'task',
    labels: [],
    updatedAt: '2026-01-01T00:00:00.000Z',
    repoId: 'repo-a',
    ...overrides
  }
}

function issueDetail(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    title: id,
    status: 'open',
    priority: 2,
    issueType: 'task',
    labels: [],
    dependencies: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides
  }
}

describe('createBeadsSlice — reads and caching', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('serves fresh work-item list reads from cache without calling the runtime client', async () => {
    const store = createTestStore()
    beadsListIssues.mockResolvedValueOnce({ items: [workItem('orca-1')] })

    await store.getState().loadBeadsWorkItems(REPO_A, { ready: true })
    expect(beadsListIssues).toHaveBeenCalledTimes(1)

    const result = await store.getState().loadBeadsWorkItems(REPO_A, { ready: true })
    expect(beadsListIssues).toHaveBeenCalledTimes(1)
    expect(result.items).toEqual([workItem('orca-1')])
  })

  it('refetches once the cached work-item list entry ages past the TTL', async () => {
    const store = createTestStore()
    beadsListIssues.mockResolvedValue({ items: [workItem('orca-1')] })

    await store.getState().loadBeadsWorkItems(REPO_A, { ready: true })
    expect(beadsListIssues).toHaveBeenCalledTimes(1)

    // Age the cached entry past the 60s TTL directly, rather than faking
    // timers for the whole in-flight/promise machinery under test.
    const state = store.getState()
    const [key] = Object.keys(state.beadsWorkItemCache)
    store.setState({
      beadsWorkItemCache: {
        [key]: { ...state.beadsWorkItemCache[key], fetchedAt: Date.now() - 61_000 }
      }
    })

    await store.getState().loadBeadsWorkItems(REPO_A, { ready: true })
    expect(beadsListIssues).toHaveBeenCalledTimes(2)
  })

  it('dedupes concurrent in-flight requests for the same list read', async () => {
    const store = createTestStore()
    const pending = deferred<{ items: unknown[] }>()
    beadsListIssues.mockReturnValueOnce(pending.promise)

    const first = store.getState().loadBeadsWorkItems(REPO_A, { ready: true })
    const second = store.getState().loadBeadsWorkItems(REPO_A, { ready: true })

    expect(beadsListIssues).toHaveBeenCalledTimes(1)
    pending.resolve({ items: [workItem('orca-1')] })
    await expect(first).resolves.toEqual(await second)
  })

  it('dedupes concurrent in-flight issue-detail reads', async () => {
    const store = createTestStore()
    const pending = deferred<unknown>()
    beadsGetIssue.mockReturnValueOnce(pending.promise)

    const first = store.getState().loadBeadsIssueDetails(REPO_A, 'orca-1')
    const second = store.getState().loadBeadsIssueDetails(REPO_A, 'orca-1')

    expect(beadsGetIssue).toHaveBeenCalledTimes(1)
    pending.resolve(issueDetail('orca-1'))
    await expect(first).resolves.toEqual(await second)
  })

  it('keeps work-item list caches isolated across repos and hosts (no cross-pollination)', async () => {
    const store = createTestStore()
    beadsListIssues
      .mockResolvedValueOnce({ items: [workItem('orca-1', { repoId: 'repo-a' })] })
      .mockResolvedValueOnce({ items: [workItem('orca-2', { repoId: 'repo-b' })] })
      .mockResolvedValueOnce({ items: [workItem('orca-3', { repoId: 'repo-a' })] })

    await store.getState().loadBeadsWorkItems(REPO_A, { ready: true })
    await store.getState().loadBeadsWorkItems(REPO_B, { ready: true })

    // Same repo, different active runtime target ("host") — must land in its
    // own cache slot rather than reusing repo A's local-target entry.
    store.setState({ settings: { activeRuntimeEnvironmentId: 'env-1' } as never })
    await store.getState().loadBeadsWorkItems(REPO_A, { ready: true })

    const cache = store.getState().beadsWorkItemCache
    expect(Object.keys(cache)).toHaveLength(3)
    const results = Object.values(cache).map((entry) => entry.data?.items[0]?.id)
    expect(results.sort()).toEqual(['orca-1', 'orca-2', 'orca-3'])
  })

  it('keys work-item list caches by the full filter set, including ready', async () => {
    const store = createTestStore()
    beadsListIssues
      .mockResolvedValueOnce({ items: [workItem('orca-ready')] })
      .mockResolvedValueOnce({ items: [workItem('orca-all')] })

    await store.getState().loadBeadsWorkItems(REPO_A, { ready: true })
    await store.getState().loadBeadsWorkItems(REPO_A, { ready: false })

    expect(beadsListIssues).toHaveBeenCalledTimes(2)
    expect(Object.keys(store.getState().beadsWorkItemCache)).toHaveLength(2)
  })
})

describe('createBeadsSlice — mutations invalidate reads', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('drops a stale in-flight list read that resolves after a mutation invalidated the cache', async () => {
    const store = createTestStore()
    const pendingList = deferred<{ items: unknown[] }>()
    beadsListIssues.mockReturnValueOnce(pendingList.promise)
    beadsCreateIssue.mockResolvedValueOnce({ ok: true, issue: issueDetail('orca-2') })

    const readRequest = store.getState().loadBeadsWorkItems(REPO_A, { ready: true })
    await store.getState().createBeadsIssue(REPO_A, { title: 'New issue' })

    // The read started before the mutation invalidated the cache; once it
    // resolves it must not repopulate the (now stale) pre-mutation entry.
    pendingList.resolve({ items: [workItem('orca-1')] })
    await readRequest

    expect(Object.keys(store.getState().beadsWorkItemCache)).toHaveLength(0)
  })

  it('invalidates the work-item list cache after a successful create', async () => {
    const store = createTestStore()
    beadsListIssues.mockResolvedValue({ items: [workItem('orca-1')] })
    beadsCreateIssue.mockResolvedValueOnce({ ok: true, issue: issueDetail('orca-2') })

    await store.getState().loadBeadsWorkItems(REPO_A, { ready: true })
    expect(Object.keys(store.getState().beadsWorkItemCache)).toHaveLength(1)

    await store.getState().createBeadsIssue(REPO_A, { title: 'New issue' })
    expect(Object.keys(store.getState().beadsWorkItemCache)).toHaveLength(0)

    await store.getState().loadBeadsWorkItems(REPO_A, { ready: true })
    expect(beadsListIssues).toHaveBeenCalledTimes(2)
  })

  it('does not invalidate caches when create fails', async () => {
    const store = createTestStore()
    beadsListIssues.mockResolvedValueOnce({ items: [workItem('orca-1')] })
    beadsCreateIssue.mockResolvedValueOnce({
      ok: false,
      error: { message: 'boom' }
    })

    await store.getState().loadBeadsWorkItems(REPO_A, { ready: true })
    await store.getState().createBeadsIssue(REPO_A, { title: 'New issue' })

    expect(Object.keys(store.getState().beadsWorkItemCache)).toHaveLength(1)
  })

  it('invalidates the list and detail cache after a successful update', async () => {
    const store = createTestStore()
    beadsListIssues.mockResolvedValue({ items: [workItem('orca-1')] })
    beadsGetIssue.mockResolvedValue(issueDetail('orca-1'))
    beadsUpdateIssue.mockResolvedValueOnce({
      ok: true,
      issue: issueDetail('orca-1', { status: 'in_progress' })
    })

    await store.getState().loadBeadsWorkItems(REPO_A, { ready: true })
    await store.getState().loadBeadsIssueDetails(REPO_A, 'orca-1')
    expect(Object.keys(store.getState().beadsWorkItemCache)).toHaveLength(1)
    expect(Object.keys(store.getState().beadsIssueCache)).toHaveLength(1)

    await store.getState().updateBeadsIssue(REPO_A, 'orca-1', { status: 'in_progress' })

    expect(Object.keys(store.getState().beadsWorkItemCache)).toHaveLength(0)
    expect(Object.keys(store.getState().beadsIssueCache)).toHaveLength(0)
  })

  it('invalidates the issue detail cache after closing and reopening', async () => {
    const store = createTestStore()
    beadsGetIssue.mockResolvedValue(issueDetail('orca-1'))
    beadsCloseIssue.mockResolvedValueOnce({
      ok: true,
      issue: issueDetail('orca-1', { status: 'closed' })
    })
    beadsReopenIssue.mockResolvedValueOnce({
      ok: true,
      issue: issueDetail('orca-1', { status: 'open' })
    })

    await store.getState().loadBeadsIssueDetails(REPO_A, 'orca-1')
    expect(Object.keys(store.getState().beadsIssueCache)).toHaveLength(1)

    await store.getState().closeBeadsIssue(REPO_A, 'orca-1', 'done')
    expect(Object.keys(store.getState().beadsIssueCache)).toHaveLength(0)

    await store.getState().loadBeadsIssueDetails(REPO_A, 'orca-1')
    expect(Object.keys(store.getState().beadsIssueCache)).toHaveLength(1)

    await store.getState().reopenBeadsIssue(REPO_A, 'orca-1', 'needs more work')
    expect(Object.keys(store.getState().beadsIssueCache)).toHaveLength(0)
  })

  it('invalidates the issue detail cache after adding a comment', async () => {
    const store = createTestStore()
    beadsGetIssue.mockResolvedValue(issueDetail('orca-1'))
    beadsAddIssueComment.mockResolvedValueOnce({
      ok: true,
      comment: { id: 'c1', issueId: 'orca-1', author: 'me', text: 'hi', createdAt: '2026-01-01' }
    })

    await store.getState().loadBeadsIssueDetails(REPO_A, 'orca-1')
    expect(Object.keys(store.getState().beadsIssueCache)).toHaveLength(1)

    await store.getState().addBeadsComment(REPO_A, 'orca-1', 'hi')
    expect(Object.keys(store.getState().beadsIssueCache)).toHaveLength(0)
  })

  it('invalidates both endpoints detail caches on add/remove dependency', async () => {
    const store = createTestStore()
    beadsGetIssue.mockImplementation((_settings: unknown, args: { id: string }) =>
      Promise.resolve(issueDetail(args.id))
    )
    beadsAddDependency.mockResolvedValueOnce({ ok: true })
    beadsRemoveDependency.mockResolvedValueOnce({ ok: true })

    await store.getState().loadBeadsIssueDetails(REPO_A, 'orca-1')
    await store.getState().loadBeadsIssueDetails(REPO_A, 'orca-2')
    expect(Object.keys(store.getState().beadsIssueCache)).toHaveLength(2)

    await store.getState().addBeadsDependency(REPO_A, 'orca-1', 'orca-2')
    expect(Object.keys(store.getState().beadsIssueCache)).toHaveLength(0)

    await store.getState().loadBeadsIssueDetails(REPO_A, 'orca-1')
    await store.getState().loadBeadsIssueDetails(REPO_A, 'orca-2')
    expect(Object.keys(store.getState().beadsIssueCache)).toHaveLength(2)

    await store.getState().removeBeadsDependency(REPO_A, 'orca-1', 'orca-2')
    expect(Object.keys(store.getState().beadsIssueCache)).toHaveLength(0)
  })

  it('does not invalidate caches when a dependency mutation fails', async () => {
    const store = createTestStore()
    beadsGetIssue.mockImplementation((_settings: unknown, args: { id: string }) =>
      Promise.resolve(issueDetail(args.id))
    )
    beadsAddDependency.mockResolvedValueOnce({ ok: false, error: { message: 'cycle' } })

    await store.getState().loadBeadsIssueDetails(REPO_A, 'orca-1')
    await store.getState().loadBeadsIssueDetails(REPO_A, 'orca-2')

    await store.getState().addBeadsDependency(REPO_A, 'orca-1', 'orca-2')
    expect(Object.keys(store.getState().beadsIssueCache)).toHaveLength(2)
  })
})

describe('createBeadsSlice — labels and diagnose', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('caches labels reads and invalidates them on create', async () => {
    const store = createTestStore()
    beadsListLabels.mockResolvedValue({ items: ['bug', 'feature'] })
    beadsCreateIssue.mockResolvedValueOnce({ ok: true, issue: issueDetail('orca-2') })

    await store.getState().loadBeadsLabels(REPO_A)
    expect(beadsListLabels).toHaveBeenCalledTimes(1)
    expect(Object.keys(store.getState().beadsLabelsCache)).toHaveLength(1)

    await store.getState().createBeadsIssue(REPO_A, { title: 'New issue', labels: ['chore'] })
    expect(Object.keys(store.getState().beadsLabelsCache)).toHaveLength(0)

    await store.getState().loadBeadsLabels(REPO_A)
    expect(beadsListLabels).toHaveBeenCalledTimes(2)
  })

  it('caches diagnose reads scoped per repo', async () => {
    const store = createTestStore()
    beadsDiagnose
      .mockResolvedValueOnce({ bdAvailable: true, repoInitialized: true })
      .mockResolvedValueOnce({ bdAvailable: false, repoInitialized: false })

    const a = await store.getState().beadsDiagnose(REPO_A)
    const b = await store.getState().beadsDiagnose(REPO_B)

    expect(beadsDiagnose).toHaveBeenCalledTimes(2)
    expect(a.bdAvailable).toBe(true)
    expect(b.bdAvailable).toBe(false)

    await store.getState().beadsDiagnose(REPO_A)
    expect(beadsDiagnose).toHaveBeenCalledTimes(2)
  })
})
