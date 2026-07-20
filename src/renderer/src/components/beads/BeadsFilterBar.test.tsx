// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { BeadsFilterBar } from './BeadsFilterBar'
import { EMPTY_BEADS_FILTER_STATE, toBeadsIssueFilters } from './beads-filter-model'

afterEach(cleanup)

const baseProps = {
  state: EMPTY_BEADS_FILTER_STATE,
  labelSuggestions: [],
  assigneeSuggestions: [],
  typeSuggestions: [],
  loading: false,
  groupByEpic: false,
  onToggleGroupByEpic: vi.fn(),
  onCreate: vi.fn(),
  onRefresh: vi.fn()
}

describe('BeadsFilterBar', () => {
  it('Ready toggle flips the ready query flag', async () => {
    const onChange = vi.fn()
    render(<BeadsFilterBar {...baseProps} onChange={onChange} />)

    await userEvent.click(screen.getByRole('button', { name: 'Ready' }))
    expect(onChange).toHaveBeenCalledTimes(1)
    const next = onChange.mock.calls[0][0]
    expect(next.ready).toBe(true)
    expect(toBeadsIssueFilters(next)).toEqual({ ready: true })
  })

  it('status buttons toggle the status set', async () => {
    const onChange = vi.fn()
    render(<BeadsFilterBar {...baseProps} onChange={onChange} />)

    await userEvent.click(screen.getByRole('button', { name: 'Blocked' }))
    expect(onChange.mock.calls[0][0].statuses).toEqual(['blocked'])
  })

  it('fires create and refresh callbacks', async () => {
    const onCreate = vi.fn()
    const onRefresh = vi.fn()
    render(
      <BeadsFilterBar {...baseProps} onChange={vi.fn()} onCreate={onCreate} onRefresh={onRefresh} />
    )
    await userEvent.click(screen.getByRole('button', { name: 'New issue' }))
    await userEvent.click(screen.getByRole('button', { name: 'Refresh Beads issues' }))
    expect(onCreate).toHaveBeenCalled()
    expect(onRefresh).toHaveBeenCalled()
  })
})
