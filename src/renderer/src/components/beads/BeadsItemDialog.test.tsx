// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { BeadsItemDialog } from './BeadsItemDialog'
import type { BeadsIssueInfo } from '../../../../shared/beads-types'

afterEach(cleanup)

function issue(overrides: Partial<BeadsIssueInfo> = {}): BeadsIssueInfo {
  return {
    id: 'orca-7',
    title: 'Improve the thing',
    description: 'A description body',
    design: 'A design body',
    acceptanceCriteria: 'An acceptance body',
    notes: 'Some notes',
    status: 'open',
    priority: 1,
    issueType: 'feature',
    assignee: 'alice',
    labels: ['ui', 'p1'],
    dependencies: [{ issueId: 'orca-7', dependsOnId: 'orca-3', type: 'blocks' }],
    comments: [
      {
        id: 'c1',
        issueId: 'orca-7',
        author: 'bob',
        text: 'first!',
        createdAt: '2026-07-01T00:00:00Z'
      }
    ],
    createdAt: '2026-06-01T00:00:00Z',
    updatedAt: '2026-07-01T00:00:00Z',
    ...overrides
  }
}

function baseProps(over: Partial<React.ComponentProps<typeof BeadsItemDialog>> = {}) {
  return {
    open: true,
    issue: issue(),
    loading: false,
    error: null,
    savingEdit: false,
    commenting: false,
    changingStatus: false,
    onClose: vi.fn(),
    onSaveEdit: vi.fn(),
    onAddComment: vi.fn(),
    onCloseIssue: vi.fn(),
    onReopenIssue: vi.fn(),
    ...over
  }
}

describe('BeadsItemDialog', () => {
  it('renders all four prose sections plus comments and dependencies', () => {
    render(<BeadsItemDialog {...baseProps()} />)
    for (const section of ['description', 'design', 'acceptanceCriteria', 'notes']) {
      expect(document.querySelector(`[data-beads-section="${section}"]`)).toBeInTheDocument()
    }
    expect(document.querySelector('[data-beads-section="comments"]')).toBeInTheDocument()
    expect(document.querySelector('[data-beads-section="dependencies"]')).toBeInTheDocument()
    expect(screen.getByText('first!')).toBeInTheDocument()
    expect(screen.getByText('orca-3')).toBeInTheDocument()
  })

  it('edit flow saves only the changed field', async () => {
    const onSaveEdit = vi.fn()
    render(<BeadsItemDialog {...baseProps({ onSaveEdit })} />)

    await userEvent.click(screen.getByRole('button', { name: 'Edit' }))
    const title = screen.getByLabelText('Issue title')
    await userEvent.clear(title)
    await userEvent.type(title, 'Renamed')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(onSaveEdit).toHaveBeenCalledWith({ title: 'Renamed' })
  })

  it('close flow passes the optional reason', async () => {
    const onCloseIssue = vi.fn()
    render(<BeadsItemDialog {...baseProps({ onCloseIssue })} />)

    await userEvent.click(screen.getByRole('button', { name: 'Close issue' }))
    await userEvent.type(screen.getByLabelText('Close reason (optional)'), 'done')
    await userEvent.click(screen.getByRole('button', { name: 'Close issue' }))

    expect(onCloseIssue).toHaveBeenCalledWith('done')
  })

  it('reopen flow fires for a closed issue', async () => {
    const onReopenIssue = vi.fn()
    render(
      <BeadsItemDialog {...baseProps({ issue: issue({ status: 'closed' }), onReopenIssue })} />
    )

    await userEvent.click(screen.getByRole('button', { name: 'Reopen' }))
    expect(onReopenIssue).toHaveBeenCalled()
  })

  it('adds a comment', async () => {
    const onAddComment = vi.fn()
    render(<BeadsItemDialog {...baseProps({ onAddComment })} />)

    const composer = screen.getByLabelText('Add a comment')
    await userEvent.type(composer, 'nice work')
    await userEvent.click(screen.getByRole('button', { name: 'Comment' }))
    expect(onAddComment).toHaveBeenCalledWith('nice work')
  })

  it('shows a spinner while the detail is loading', () => {
    render(<BeadsItemDialog {...baseProps({ issue: null, loading: true })} />)
    expect(within(document.body).queryByText('first!')).not.toBeInTheDocument()
  })
})
