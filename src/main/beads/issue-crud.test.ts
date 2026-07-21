import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as Runner from '../git/runner'
import { bdShowWithCommentsJson } from './bd-json-fixtures'

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

import { addIssueComment, closeIssue, createIssue, reopenIssue, updateIssue } from './issue-crud'

function call(index: number): { args: string[]; options: Record<string, unknown> } {
  const [args, options] = bdExecFileAsyncMock.mock.calls[index] as [
    string[],
    Record<string, unknown>
  ]
  return { args, options }
}

describe('beads issue crud', () => {
  beforeEach(() => {
    bdExecFileAsyncMock.mockReset()
  })

  describe('createIssue', () => {
    it('creates via --title (not a bare positional) then re-fetches via getIssue', async () => {
      bdExecFileAsyncMock
        .mockResolvedValueOnce({ stdout: JSON.stringify({ id: 'bd-new-1' }), stderr: '' })
        .mockResolvedValueOnce({ stdout: bdShowWithCommentsJson, stderr: '' })

      const result = await createIssue('/repo', {
        title: 'New issue',
        priority: 1,
        labels: ['a', 'b']
      })

      const createCall = call(0)
      expect(createCall.args).toEqual([
        'create',
        '--json',
        '--silent',
        '--title',
        'New issue',
        '--priority',
        '1',
        '--labels',
        'a,b'
      ])
      expect(createCall.options.cwd).toBe('/repo')
      expect(createCall.options.readonly).toBeUndefined()

      const showCall = call(1)
      expect(showCall.args).toEqual(['show', '--json', '--include-comments'])
      expect(showCall.options.positionals).toEqual(['bd-new-1'])

      expect(result).toMatchObject({ ok: true })
    })

    it('accepts a title that looks like a flag without bd rejecting it', async () => {
      bdExecFileAsyncMock
        .mockResolvedValueOnce({ stdout: JSON.stringify({ id: 'bd-new-2' }), stderr: '' })
        .mockResolvedValueOnce({ stdout: bdShowWithCommentsJson, stderr: '' })

      await createIssue('/repo', { title: '--looks-like-a-flag' })
      const createCall = call(0)
      expect(createCall.args[createCall.args.indexOf('--title') + 1]).toBe('--looks-like-a-flag')
    })

    it('tolerates a bare-id (non-JSON) --silent response', async () => {
      bdExecFileAsyncMock
        .mockResolvedValueOnce({ stdout: 'bd-new-3\n', stderr: '' })
        .mockResolvedValueOnce({ stdout: bdShowWithCommentsJson, stderr: '' })

      const result = await createIssue('/repo', { title: 'New issue' })
      expect(result).toMatchObject({ ok: true })
      expect(call(1).options.positionals).toEqual(['bd-new-3'])
    })

    it('never retries a failed create', async () => {
      bdExecFileAsyncMock.mockRejectedValueOnce(
        Object.assign(new Error('locked'), {
          stderr: 'Error: embeddeddolt: another process holds the exclusive lock on /repo'
        })
      )
      const result = await createIssue('/repo', { title: 'New issue' })
      expect(result).toMatchObject({ ok: false })
      expect(bdExecFileAsyncMock).toHaveBeenCalledTimes(1)
    })
  })

  describe('updateIssue / closeIssue / reopenIssue', () => {
    it('updateIssue passes the id as a positional and add/remove labels as repeated flags', async () => {
      bdExecFileAsyncMock.mockResolvedValueOnce({ stdout: bdShowWithCommentsJson, stderr: '' })
      await updateIssue('/repo', 'bd-1', {
        title: 'Renamed',
        addLabels: ['x'],
        removeLabels: ['y'],
        parent: null
      })
      const { args, options } = call(0)
      expect(args).toEqual([
        'update',
        '--json',
        '--title',
        'Renamed',
        '--add-label',
        'x',
        '--remove-label',
        'y',
        '--parent',
        ''
      ])
      expect(options.positionals).toEqual(['bd-1'])
    })

    it('closeIssue passes --reason and the id as a positional', async () => {
      bdExecFileAsyncMock.mockResolvedValueOnce({ stdout: bdShowWithCommentsJson, stderr: '' })
      await closeIssue('/repo', 'bd-1', 'done')
      const { args, options } = call(0)
      expect(args).toEqual(['close', '--json', '--reason', 'done'])
      expect(options.positionals).toEqual(['bd-1'])
    })

    it('reopenIssue omits --reason when none is given', async () => {
      bdExecFileAsyncMock.mockResolvedValueOnce({ stdout: bdShowWithCommentsJson, stderr: '' })
      await reopenIssue('/repo', 'bd-1')
      expect(call(0).args).toEqual(['reopen', '--json'])
    })

    it('none of these mutation argvs ever contain the forbidden `edit` subcommand', async () => {
      bdExecFileAsyncMock.mockResolvedValue({ stdout: bdShowWithCommentsJson, stderr: '' })
      await updateIssue('/repo', 'bd-1', { title: 'x' })
      await closeIssue('/repo', 'bd-1')
      await reopenIssue('/repo', 'bd-1')
      for (const { args } of bdExecFileAsyncMock.mock.calls.map((c) => ({
        args: c[0] as string[]
      }))) {
        expect(args).not.toContain('edit')
      }
    })
  })

  describe('addIssueComment', () => {
    it('passes id and text as positionals and maps the flat comment response', async () => {
      bdExecFileAsyncMock.mockResolvedValueOnce({
        stdout: JSON.stringify({
          id: 'c-1',
          issue_id: 'bd-1',
          author: 'Brian',
          text: 'hello world',
          created_at: '2026-07-10T20:00:00Z'
        }),
        stderr: ''
      })
      const result = await addIssueComment('/repo', 'bd-1', 'hello world')
      const { args, options } = call(0)
      expect(args).toEqual(['comment', '--json'])
      expect(options.positionals).toEqual(['bd-1', 'hello world'])
      expect(result).toMatchObject({ ok: true, comment: { id: 'c-1', text: 'hello world' } })
    })
  })
})
