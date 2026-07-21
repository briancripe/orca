// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { BeadsWorkItemList } from './BeadsWorkItemList'
import type { BeadsWorkItem } from '../../../../shared/beads-types'

afterEach(cleanup)

function item(overrides: Partial<BeadsWorkItem> = {}): BeadsWorkItem {
  return {
    id: 'orca-1',
    title: 'Fix the crash',
    status: 'open',
    priority: 0,
    issueType: 'bug',
    labels: ['ui'],
    assignee: 'alice',
    updatedAt: '2026-07-01T00:00:00.000Z',
    repoId: 'repo-1',
    ...overrides
  }
}

const baseProps = {
  loading: false,
  error: null,
  diagnostics: { bdAvailable: true, repoInitialized: true },
  hasFilters: false,
  onOpenItem: vi.fn()
}

describe('BeadsWorkItemList states', () => {
  it('shows the loading skeleton while first-load is pending', () => {
    render(<BeadsWorkItemList {...baseProps} loading items={[]} />)
    expect(document.querySelector('[data-beads-state="loading"]')).toBeInTheDocument()
  })

  it('renders the error banner', () => {
    render(
      <BeadsWorkItemList {...baseProps} error={{ type: 'unknown', message: 'boom' }} items={[]} />
    )
    expect(screen.getByRole('alert')).toHaveTextContent('boom')
  })

  it('surfaces bd init guidance when the repo store is not initialized', () => {
    render(
      <BeadsWorkItemList
        {...baseProps}
        diagnostics={{ bdAvailable: true, repoInitialized: false }}
        items={[]}
      />
    )
    expect(document.querySelector('[data-beads-state="repo-not-initialized"]')).toBeInTheDocument()
    expect(screen.getByText(/bd init/)).toBeInTheDocument()
  })

  it('surfaces bd-missing guidance when the tool is unavailable', () => {
    render(
      <BeadsWorkItemList
        {...baseProps}
        diagnostics={{ bdAvailable: false, repoInitialized: false }}
        items={[]}
      />
    )
    expect(document.querySelector('[data-beads-state="bd-unavailable"]')).toBeInTheDocument()
  })

  it('shows the empty state when there are no issues', () => {
    render(<BeadsWorkItemList {...baseProps} items={[]} />)
    expect(document.querySelector('[data-beads-state="empty"]')).toBeInTheDocument()
  })

  it('renders rows with a status badge and a P-label priority', async () => {
    const onOpenItem = vi.fn()
    render(
      <BeadsWorkItemList
        {...baseProps}
        onOpenItem={onOpenItem}
        items={[
          item(),
          item({ id: 'orca-2', title: 'Second bug', status: 'blocked', priority: 3 })
        ]}
      />
    )
    expect(document.querySelector('[data-beads-status="open"]')).toBeInTheDocument()
    expect(document.querySelector('[data-beads-status="blocked"]')).toBeInTheDocument()
    expect(document.querySelector('[data-beads-priority="0"]')).toHaveTextContent('P0')
    expect(document.querySelector('[data-beads-priority="3"]')).toHaveTextContent('P3')

    await userEvent.click(screen.getByText('Fix the crash'))
    expect(onOpenItem).toHaveBeenCalledWith(expect.objectContaining({ id: 'orca-1' }))
  })
})
