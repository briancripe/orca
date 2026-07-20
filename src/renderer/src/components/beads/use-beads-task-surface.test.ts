// @vitest-environment happy-dom

import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const actions = {
  loadBeadsWorkItems: vi.fn(() => Promise.resolve({ items: [] })),
  loadBeadsIssueDetails: vi.fn(() => Promise.resolve(null)),
  loadBeadsLabels: vi.fn(() => Promise.resolve({ items: [] })),
  beadsDiagnose: vi.fn(() => Promise.resolve({ bdAvailable: true, repoInitialized: true })),
  createBeadsIssue: vi.fn(() => Promise.resolve({ ok: true })),
  updateBeadsIssue: vi.fn(() => Promise.resolve({ ok: true })),
  closeBeadsIssue: vi.fn(() => Promise.resolve({ ok: true })),
  reopenBeadsIssue: vi.fn(() => Promise.resolve({ ok: true })),
  addBeadsComment: vi.fn(() => Promise.resolve({ ok: true }))
}

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: typeof actions) => unknown) => selector(actions)
}))

import { useBeadsTaskSurface } from './use-beads-task-surface'

const ctx = { repoPath: '/repo', repoId: 'repo-1' }

beforeEach(() => {
  for (const fn of Object.values(actions)) {
    fn.mockClear()
  }
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
