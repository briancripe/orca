// @vitest-environment happy-dom

import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

type Row = { id: string; issueType: string; [key: string]: unknown }

const actions = {
  loadBeadsWorkItems: vi.fn(
    (_ctx: unknown, _filters?: { parent?: string }): Promise<{ items: Row[] }> =>
      Promise.resolve({ items: [] })
  ),
  loadBeadsIssueDetails: vi.fn(() => Promise.resolve(null)),
  loadBeadsLabels: vi.fn(() => Promise.resolve({ items: [] })),
  beadsDiagnose: vi.fn(() => Promise.resolve({ bdAvailable: true, repoInitialized: true })),
  createBeadsIssue: vi.fn(() => Promise.resolve({ ok: true })),
  updateBeadsIssue: vi.fn(() => Promise.resolve({ ok: true })),
  closeBeadsIssue: vi.fn(() => Promise.resolve({ ok: true })),
  reopenBeadsIssue: vi.fn(() => Promise.resolve({ ok: true })),
  addBeadsComment: vi.fn(() => Promise.resolve({ ok: true })),
  addBeadsDependency: vi.fn(() => Promise.resolve({ ok: true } as const)),
  removeBeadsDependency: vi.fn(() => Promise.resolve({ ok: true } as const))
}

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: typeof actions) => unknown) => selector(actions)
}))

import { toast } from 'sonner'
import { useBeadsTaskSurface } from './use-beads-task-surface'

const ctx = { repoPath: '/repo', repoId: 'repo-1' }

beforeEach(() => {
  for (const fn of Object.values(actions)) {
    fn.mockClear()
  }
  vi.mocked(toast.error).mockClear()
  vi.mocked(toast.success).mockClear()
})
afterEach(() => vi.clearAllMocks())

describe('useBeadsTaskSurface mutation flows', () => {
  it('loads the list on mount', async () => {
    renderHook(() => useBeadsTaskSurface(ctx))
    await waitFor(() => expect(actions.loadBeadsWorkItems).toHaveBeenCalledTimes(1))
  })

  it.each([
    [
      'create',
      (m: ReturnType<typeof useBeadsTaskSurface>) => m.createIssue({ title: 'x' }),
      'createBeadsIssue'
    ],
    [
      'edit',
      (m: ReturnType<typeof useBeadsTaskSurface>) => m.saveEdit({ title: 'y' }),
      'updateBeadsIssue'
    ],
    [
      'close',
      (m: ReturnType<typeof useBeadsTaskSurface>) => m.closeIssue('done'),
      'closeBeadsIssue'
    ],
    ['reopen', (m: ReturnType<typeof useBeadsTaskSurface>) => m.reopenIssue(), 'reopenBeadsIssue'],
    [
      'comment',
      (m: ReturnType<typeof useBeadsTaskSurface>) => m.addComment('hi'),
      'addBeadsComment'
    ]
  ])('%s calls the slice action and refreshes the list', async (_name, run, actionName) => {
    const { result } = renderHook(() => useBeadsTaskSurface(ctx))
    await waitFor(() => expect(actions.loadBeadsWorkItems).toHaveBeenCalledTimes(1))

    // Select an issue so id-scoped mutations have a target.
    act(() =>
      result.current.openItem({
        id: 'orca-7',
        title: 't',
        status: 'open',
        priority: 0,
        issueType: 'bug',
        labels: [],
        updatedAt: '2026-07-01T00:00:00Z',
        repoId: 'repo-1'
      })
    )

    await act(async () => {
      run(result.current)
      await Promise.resolve()
    })

    expect((actions as Record<string, ReturnType<typeof vi.fn>>)[actionName]).toHaveBeenCalledTimes(
      1
    )
    // Every mutation bumps the refresh nonce → the list effect re-runs.
    await waitFor(() =>
      expect(actions.loadBeadsWorkItems.mock.calls.length).toBeGreaterThanOrEqual(2)
    )
  })
})

// Why: bd write channels resolve `{ok:false, error}` rather than throwing —
// a failed mutation must surface an error and must NOT run the success
// side-effect (e.g. createIssue closing the dialog with nothing created).
describe('useBeadsTaskSurface failed mutation envelopes', () => {
  it('does not close the create dialog and surfaces an error on a failed create', async () => {
    actions.createBeadsIssue.mockResolvedValueOnce({
      ok: false,
      error: { type: 'validation_error', message: 'title is required' }
    } as never)
    const { result } = renderHook(() => useBeadsTaskSurface(ctx))
    await waitFor(() => expect(actions.loadBeadsWorkItems).toHaveBeenCalledTimes(1))

    act(() => result.current.setCreateOpen(true))
    expect(result.current.createOpen).toBe(true)

    await act(async () => {
      result.current.createIssue({ title: 'x' })
      await Promise.resolve()
      await Promise.resolve()
    })

    // The dialog stays open — a failed create must not look like a success.
    expect(result.current.createOpen).toBe(true)
    expect(vi.mocked(toast.error)).toHaveBeenCalledWith('title is required')
    expect(vi.mocked(toast.success)).not.toHaveBeenCalled()
  })

  it.each([
    [
      'edit',
      (m: ReturnType<typeof useBeadsTaskSurface>) => m.saveEdit({ title: 'y' }),
      'updateBeadsIssue'
    ],
    ['close', (m: ReturnType<typeof useBeadsTaskSurface>) => m.closeIssue(), 'closeBeadsIssue'],
    ['reopen', (m: ReturnType<typeof useBeadsTaskSurface>) => m.reopenIssue(), 'reopenBeadsIssue'],
    [
      'comment',
      (m: ReturnType<typeof useBeadsTaskSurface>) => m.addComment('hi'),
      'addBeadsComment'
    ]
  ])(
    '%s surfaces an error toast instead of a success toast on failure',
    async (_name, run, actionName) => {
      ;(actions as Record<string, ReturnType<typeof vi.fn>>)[actionName].mockResolvedValueOnce({
        ok: false,
        error: { type: 'unknown', message: 'bd write failed' }
      })
      const { result } = renderHook(() => useBeadsTaskSurface(ctx))
      await waitFor(() => expect(actions.loadBeadsWorkItems).toHaveBeenCalledTimes(1))
      selectIssue(result)

      await act(async () => {
        run(result.current)
        await Promise.resolve()
        await Promise.resolve()
      })

      expect(vi.mocked(toast.error)).toHaveBeenCalledWith('bd write failed')
      expect(vi.mocked(toast.success)).not.toHaveBeenCalled()
    }
  )
})

function selectIssue(result: { current: ReturnType<typeof useBeadsTaskSurface> }): void {
  act(() =>
    result.current.openItem({
      id: 'orca-1',
      title: 't',
      status: 'open',
      priority: 0,
      issueType: 'bug',
      labels: [],
      updatedAt: '2026-07-01T00:00:00Z',
      repoId: 'repo-1'
    })
  )
}

describe('useBeadsTaskSurface dependency navigation', () => {
  it('preserves back-navigation across chip navigation', async () => {
    const { result } = renderHook(() => useBeadsTaskSurface(ctx))
    selectIssue(result)
    expect(result.current.selectedIssueId).toBe('orca-1')
    expect(result.current.canGoBack).toBe(false)

    act(() => result.current.navigateToIssue('orca-9'))
    expect(result.current.selectedIssueId).toBe('orca-9')
    expect(result.current.canGoBack).toBe(true)

    act(() => result.current.back())
    expect(result.current.selectedIssueId).toBe('orca-1')
    expect(result.current.canGoBack).toBe(false)
  })

  it('adds a dependency and refreshes the detail', async () => {
    const { result } = renderHook(() => useBeadsTaskSurface(ctx))
    selectIssue(result)
    await act(async () => {
      result.current.addDependency('orca-2')
      await Promise.resolve()
    })
    expect(actions.addBeadsDependency).toHaveBeenCalledWith(ctx, 'orca-1', 'orca-2')
    await waitFor(() => expect(result.current.dependencyError).toBeNull())
  })

  it('removes a dependency', async () => {
    const { result } = renderHook(() => useBeadsTaskSurface(ctx))
    selectIssue(result)
    await act(async () => {
      result.current.removeDependency('orca-2')
      await Promise.resolve()
    })
    expect(actions.removeBeadsDependency).toHaveBeenCalledWith(ctx, 'orca-1', 'orca-2')
  })

  it('surfaces a cycle error inline instead of throwing', async () => {
    actions.addBeadsDependency.mockResolvedValueOnce({
      ok: false,
      error: { type: 'validation_error', message: 'cycle detected' }
    } as never)
    const { result } = renderHook(() => useBeadsTaskSurface(ctx))
    selectIssue(result)
    await act(async () => {
      result.current.addDependency('orca-2')
      await Promise.resolve()
    })
    await waitFor(() => expect(result.current.dependencyError?.message).toBe('cycle detected'))
  })
})

const epicRow = {
  id: 'e1',
  title: 'Epic',
  status: 'open' as const,
  priority: 0 as const,
  issueType: 'epic',
  labels: [],
  updatedAt: '2026-07-01T00:00:00Z',
  repoId: 'repo-1'
}

describe('useBeadsTaskSurface epic grouping', () => {
  it('fetches children once per epic (parent filter), not per row, and toggles back', async () => {
    // The list fetch returns one epic + two non-epic rows; parent fetches return
    // that epic's children.
    actions.loadBeadsWorkItems.mockImplementation((_ctx: unknown, filters?: { parent?: string }) =>
      filters?.parent
        ? Promise.resolve({ items: [{ ...epicRow, id: 'child', issueType: 'task' }] })
        : Promise.resolve({
            items: [
              epicRow,
              { ...epicRow, id: 'x', issueType: 'task' },
              { ...epicRow, id: 'y', issueType: 'bug' }
            ]
          })
    )

    const { result } = renderHook(() => useBeadsTaskSurface(ctx))
    await waitFor(() => expect(result.current.items).toHaveLength(3))

    act(() => result.current.setGroupByEpic(true))

    // Exactly one parent-scoped fetch (one epic) — never one per row.
    await waitFor(() => {
      const parentCalls = actions.loadBeadsWorkItems.mock.calls.filter(
        (call) => (call[1] as { parent?: string } | undefined)?.parent === 'e1'
      )
      expect(parentCalls).toHaveLength(1)
    })
    await waitFor(() => expect(result.current.epicGroups.epics).toHaveLength(1))
    expect(result.current.epicGroups.orphans.map((orphan) => orphan.id)).toEqual(['x', 'y'])

    act(() => result.current.setGroupByEpic(false))
    expect(result.current.groupByEpic).toBe(false)
  })
})
