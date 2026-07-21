// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import type React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { BeadsGroupedList } from './BeadsGroupedList'
import type { BeadsWorkItem } from '../../../../shared/beads-types'

afterEach(cleanup)

function item(
  id: string,
  title: string,
  issueType: string,
  status: BeadsWorkItem['status'] = 'open'
): BeadsWorkItem {
  return {
    id,
    title,
    status,
    priority: 2,
    issueType,
    labels: [],
    updatedAt: '2026-07-01T00:00:00Z',
    repoId: 'repo-1'
  }
}

const epics = [item('e1', 'Epic one', 'epic')]
const childrenByEpicId = {
  e1: [item('a', 'Child a', 'task', 'closed'), item('b', 'Child b', 'task', 'open')]
}
const orphans = [item('c', 'Orphan c', 'bug')]

function renderList(over: Partial<React.ComponentProps<typeof BeadsGroupedList>> = {}) {
  return render(
    <BeadsGroupedList
      epics={epics}
      childrenByEpicId={childrenByEpicId}
      orphans={orphans}
      loadingEpicIds={new Set()}
      onOpenItem={vi.fn()}
      {...over}
    />
  )
}

describe('BeadsGroupedList', () => {
  it('renders epics as group headers with a closed/total progress rollup', () => {
    renderList()
    const group = document.querySelector('[data-beads-epic-group="e1"]')
    expect(group).toBeInTheDocument()
    // 1 of 2 children closed.
    expect(document.querySelector('[data-beads-epic-progress="e1"]')).toHaveTextContent('1/2')
  })

  it('nests children only once the group is expanded (no eager per-row render)', async () => {
    renderList()
    expect(screen.queryByText('Child a')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Toggle epic e1' }))
    expect(screen.getByText('Child a')).toBeInTheDocument()
    expect(screen.getByText('Child b')).toBeInTheDocument()
  })

  it('keeps non-child, non-epic issues in the ungrouped section', () => {
    renderList()
    const section = document.querySelector('[data-beads-orphan-section]')
    expect(section).toBeInTheDocument()
    expect(screen.getByText('Orphan c')).toBeInTheDocument()
  })

  it('opens the epic itself from its title', async () => {
    const onOpenItem = vi.fn()
    renderList({ onOpenItem })
    await userEvent.click(document.querySelector('[data-beads-epic-open="e1"]') as Element)
    expect(onOpenItem).toHaveBeenCalledWith(expect.objectContaining({ id: 'e1' }))
  })
})
