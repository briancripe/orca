import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as Runner from '../git/runner'
import { bdListJson } from './bd-json-fixtures'

const { bdExecFileAsyncMock } = vi.hoisted(() => ({
  bdExecFileAsyncMock: vi.fn()
}))

vi.mock('../git/runner', async () => {
  const actual = await vi.importActual<typeof Runner>('../git/runner')
  return {
    ...actual,
    bdExecFileAsync: bdExecFileAsyncMock
  }
})

import {
  addDependency,
  getEpicProgress,
  listChildren,
  removeDependency,
  summarizeEpicProgress
} from './dependencies'

function call(index: number): { args: string[]; options: Record<string, unknown> } {
  const [args, options] = bdExecFileAsyncMock.mock.calls[index] as [
    string[],
    Record<string, unknown>
  ]
  return { args, options }
}

describe('beads dependencies', () => {
  beforeEach(() => {
    bdExecFileAsyncMock.mockReset()
  })

  describe('addDependency / removeDependency', () => {
    it('addDependency runs `bd dep add` with issueId/dependsOnId as positionals', async () => {
      bdExecFileAsyncMock.mockResolvedValueOnce({
        stdout: JSON.stringify({
          issue_id: 'bd-1',
          depends_on_id: 'bd-2',
          type: 'blocks',
          status: 'added'
        }),
        stderr: ''
      })
      const result = await addDependency('/repo', 'bd-1', 'bd-2')
      const { args, options } = call(0)
      expect(args).toEqual(['dep', 'add', '--json'])
      expect(options.positionals).toEqual(['bd-1', 'bd-2'])
      expect(options.readonly).toBeUndefined()
      expect(result).toEqual({ ok: true })
    })

    it('removeDependency runs `bd dep remove` with issueId/dependsOnId as positionals', async () => {
      bdExecFileAsyncMock.mockResolvedValueOnce({
        stdout: JSON.stringify({ issue_id: 'bd-1', depends_on_id: 'bd-2', status: 'removed' }),
        stderr: ''
      })
      const result = await removeDependency('/repo', 'bd-1', 'bd-2')
      const { args, options } = call(0)
      expect(args).toEqual(['dep', 'remove', '--json'])
      expect(options.positionals).toEqual(['bd-1', 'bd-2'])
      expect(result).toEqual({ ok: true })
    })

    it('never retries a failed write, even on a transient-looking lock error', async () => {
      bdExecFileAsyncMock.mockRejectedValueOnce(
        Object.assign(new Error('locked'), {
          stderr: 'Error: embeddeddolt: another process holds the exclusive lock on /repo'
        })
      )
      const result = await addDependency('/repo', 'bd-1', 'bd-2')
      expect(result.ok).toBe(false)
      expect(bdExecFileAsyncMock).toHaveBeenCalledTimes(1)
    })

    it('argv never contains the forbidden `edit` subcommand', async () => {
      bdExecFileAsyncMock.mockResolvedValue({ stdout: '{}', stderr: '' })
      await addDependency('/repo', 'bd-1', 'bd-2')
      await removeDependency('/repo', 'bd-1', 'bd-2')
      for (const c of bdExecFileAsyncMock.mock.calls) {
        expect(c[0] as string[]).not.toContain('edit')
      }
    })
  })

  describe('listChildren', () => {
    it('filters via --parent and passes an explicit --limit', async () => {
      bdExecFileAsyncMock.mockResolvedValueOnce({ stdout: bdListJson, stderr: '' })
      const result = await listChildren('/repo', 'bd-fixture-sandbox-zk3')
      const { args, options } = call(0)
      expect(args).toEqual([
        'list',
        '--json',
        '--no-pager',
        '--parent',
        'bd-fixture-sandbox-zk3',
        '--limit',
        '50'
      ])
      expect(options).toMatchObject({ cwd: '/repo', readonly: true })
      expect(result.items).toHaveLength(3)
    })

    it('respects an explicit limit override', async () => {
      bdExecFileAsyncMock.mockResolvedValueOnce({ stdout: '[]', stderr: '' })
      await listChildren('/repo', 'bd-1', { limit: 5 })
      expect(call(0).args).toEqual([
        'list',
        '--json',
        '--no-pager',
        '--parent',
        'bd-1',
        '--limit',
        '5'
      ])
    })

    it('classifies an exec failure into a structured error', async () => {
      bdExecFileAsyncMock.mockRejectedValueOnce(
        Object.assign(new Error('no db'), { stderr: 'Error: no beads database found' })
      )
      const result = await listChildren('/repo', 'bd-1')
      expect(result.items).toEqual([])
      expect(result.error).toMatchObject({ type: 'not_found' })
    })
  })

  describe('summarizeEpicProgress', () => {
    it('rolls up status counts from the children list', () => {
      const progress = summarizeEpicProgress([
        { id: '1', status: 'closed' } as never,
        { id: '2', status: 'closed' } as never,
        { id: '3', status: 'in_progress' } as never,
        { id: '4', status: 'blocked' } as never,
        { id: '5', status: 'open' } as never
      ])
      expect(progress).toEqual({
        total: 5,
        openCount: 1,
        inProgressCount: 1,
        blockedCount: 1,
        closedCount: 2,
        percentClosed: 40
      })
    })

    it('reports 0% for an epic with no children', () => {
      expect(summarizeEpicProgress([]).percentClosed).toBe(0)
    })
  })

  describe('getEpicProgress', () => {
    it('derives progress from listChildren without an extra bd call', async () => {
      bdExecFileAsyncMock.mockResolvedValueOnce({ stdout: bdListJson, stderr: '' })
      const result = await getEpicProgress('/repo', 'bd-fixture-sandbox-zk3')
      expect(bdExecFileAsyncMock).toHaveBeenCalledTimes(1)
      expect(result.progress.total).toBe(3)
    })

    it('lists children with --all so closed children are counted', async () => {
      bdExecFileAsyncMock.mockResolvedValueOnce({ stdout: bdListJson, stderr: '' })
      await getEpicProgress('/repo', 'bd-fixture-sandbox-zk3')
      expect(call(0).args).toEqual([
        'list',
        '--json',
        '--no-pager',
        '--parent',
        'bd-fixture-sandbox-zk3',
        '--limit',
        '50',
        '--all'
      ])
    })
  })
})
