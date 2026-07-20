// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import type React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { BeadsDependencyEditor } from './BeadsDependencyEditor'
import type { BeadsIssueInfo, BeadsWorkItem } from '../../../../shared/beads-types'

afterEach(cleanup)

function workItem(
  id: string,
  title: string,
  status: BeadsWorkItem['status'] = 'open'
): BeadsWorkItem {
  return {
    id,
    title,
    status,
    priority: 2,
    issueType: 'task',
    labels: [],
    updatedAt: '2026-07-01T00:00:00Z',
    repoId: 'repo-1'
  }
}

function issue(over: Partial<BeadsIssueInfo> = {}): BeadsIssueInfo {
  return {
    id: 'orca-1',
    title: 'Main',
    status: 'blocked',
    priority: 1,
    issueType: 'task',
    labels: [],
    dependencies: [{ issueId: 'orca-1', dependsOnId: 'orca-2', type: 'blocks' }],
    createdAt: '2026-06-01T00:00:00Z',
    updatedAt: '2026-07-01T00:00:00Z',
    ...over
  }
}

function baseProps(over: Partial<React.ComponentProps<typeof BeadsDependencyEditor>> = {}) {
  return {
    issue: issue(),
    pickerItems: [workItem('orca-2', 'Blocker two'), workItem('orca-3', 'Candidate three')],
    adding: false,
    removing: false,
    error: null,
    onNavigate: vi.fn(),
    onAddDependency: vi.fn(),
    onRemoveDependency: vi.fn(),
    onClearError: vi.fn(),
    ...over
  }
}

describe('BeadsDependencyEditor', () => {
  it('navigates to a dependency target on chip click', async () => {
    const onNavigate = vi.fn()
    render(<BeadsDependencyEditor {...baseProps({ onNavigate })} />)
    await userEvent.click(document.querySelector('[data-beads-dep-nav="orca-2"]') as Element)
    expect(onNavigate).toHaveBeenCalledWith('orca-2')
  })

  it('lists open blockers and navigates from them', async () => {
    const onNavigate = vi.fn()
    render(<BeadsDependencyEditor {...baseProps({ onNavigate })} />)
    expect(document.querySelector('[data-beads-open-blockers]')).toBeInTheDocument()
    await userEvent.click(document.querySelector('[data-beads-open-blocker="orca-2"]') as Element)
    expect(onNavigate).toHaveBeenCalledWith('orca-2')
  })

  it('does not flag a closed blocker as gating', () => {
    render(
      <BeadsDependencyEditor
        {...baseProps({ pickerItems: [workItem('orca-2', 'Blocker two', 'closed')] })}
      />
    )
    expect(document.querySelector('[data-beads-open-blockers]')).not.toBeInTheDocument()
  })

  it('adds a blocks edge from the picker, excluding self and existing deps', async () => {
    const onAddDependency = vi.fn()
    render(<BeadsDependencyEditor {...baseProps({ onAddDependency })} />)
    await userEvent.type(screen.getByLabelText('Add a blocking dependency'), 'orca')
    // orca-1 (self) and orca-2 (existing dep) are excluded; orca-3 remains.
    expect(document.querySelector('[data-beads-dep-candidate="orca-2"]')).not.toBeInTheDocument()
    await userEvent.click(document.querySelector('[data-beads-dep-candidate="orca-3"]') as Element)
    expect(onAddDependency).toHaveBeenCalledWith('orca-3')
  })

  it('removes a dependency after confirmation', async () => {
    const onRemoveDependency = vi.fn()
    render(<BeadsDependencyEditor {...baseProps({ onRemoveDependency })} />)
    await userEvent.click(screen.getByRole('button', { name: 'Remove dependency orca-2' }))
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }))
    expect(onRemoveDependency).toHaveBeenCalledWith('orca-2')
  })

  it('renders a cycle error inline without crashing', () => {
    render(
      <BeadsDependencyEditor
        {...baseProps({ error: { type: 'validation_error', message: 'would create a cycle' } })}
      />
    )
    expect(screen.getByRole('alert')).toHaveTextContent('would create a cycle')
  })
})
