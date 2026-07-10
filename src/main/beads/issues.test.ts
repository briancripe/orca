import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as Runner from '../git/runner'
import { bdListJson, bdShowNotFoundJson, bdShowWithCommentsJson } from './bd-json-fixtures'

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
  addIssueComment,
  closeIssue,
  createIssue,
  getIssue,
  listAssignableUsers,
  listIssues,
  listLabels,
  reopenIssue,
  updateIssue
} from './issues'

function call(index: number): { args: string[]; options: Record<string, unknown> } {
  const [args, options] = bdExecFileAsyncMock.mock.calls[index] as [
    string[],
    Record<string, unknown>
  ]
  return { args, options }
}

describe('beads issues', () => {
  beforeEach(() => {
    bdExecFileAsyncMock.mockReset()
  })

  describe('listIssues', () => {
    it('always passes an explicit --limit, --readonly, --no-pager, and -C via cwd', async () => {
      bdExecFileAsyncMock.mockResolvedValueOnce({ stdout: '[]', stderr: '' })
      await listIssues('/repo', {})
      const { args, options } = call(0)
      expect(args).toEqual(['list', '--json', '--no-pager', '--limit', '50'])
      expect(options).toMatchObject({ cwd: '/repo', readonly: true })
    })

    it('renders multi-status filters in comma form, not repeated flags', async () => {
      bdExecFileAsyncMock.mockResolvedValueOnce({ stdout: '[]', stderr: '' })
      await listIssues('/repo', { status: ['open', 'in_progress'] })
      const { args } = call(0)
      expect(args).toContain('--status')
      expect(args[args.indexOf('--status') + 1]).toBe('open,in_progress')
      expect(args.filter((a) => a === '--status')).toHaveLength(1)
    })

    it('passes --ready for the ready filter', async () => {
      bdExecFileAsyncMock.mockResolvedValueOnce({ stdout: '[]', stderr: '' })
      await listIssues('/repo', { ready: true })
      expect(call(0).args).toContain('--ready')
    })

    it('applies type/assignee/label/parent/titleContains filters as flag values', async () => {
      bdExecFileAsyncMock.mockResolvedValueOnce({ stdout: '[]', stderr: '' })
      await listIssues('/repo', {
        type: 'bug',
        assignee: 'alice',
        label: 'backend',
        parent: 'bd-1',
        titleContains: 'crash',
        limit: 10
      })
      const { args } = call(0)
      expect(args).toEqual([
        'list',
        '--json',
        '--no-pager',
        '--type',
        'bug',
        '--assignee',
        'alice',
        '--label',
        'backend',
        '--parent',
        'bd-1',
        '--title-contains',
        'crash',
        '--limit',
        '10'
      ])
    })

    it('maps bd list rows to BeadsWorkItem', async () => {
      bdExecFileAsyncMock.mockResolvedValueOnce({ stdout: bdListJson, stderr: '' })
      const result = await listIssues('/repo', {})
      expect(result.error).toBeUndefined()
      expect(result.items).toHaveLength(3)
      expect(result.items[0]).toMatchObject({ id: 'bd-fixture-sandbox-vr8', status: 'in_progress' })
    })

    it('classifies an exec failure into a structured error instead of throwing', async () => {
      bdExecFileAsyncMock.mockRejectedValueOnce(
        Object.assign(new Error('no db'), { stderr: 'Error: no beads database found' })
      )
      const result = await listIssues('/repo', {})
      expect(result.items).toEqual([])
      expect(result.error).toMatchObject({ type: 'not_found' })
    })
  })

  describe('getIssue', () => {
    it('calls bd show with --json --include-comments and the id as a positional', async () => {
      bdExecFileAsyncMock.mockResolvedValueOnce({ stdout: bdShowWithCommentsJson, stderr: '' })
      const issue = await getIssue('/repo', 'bd-fixture-sandbox-zk3')
      const { args, options } = call(0)
      expect(args).toEqual(['show', '--json', '--include-comments'])
      expect(options.positionals).toEqual(['bd-fixture-sandbox-zk3'])
      expect(options.readonly).toBe(true)
      expect(issue?.id).toBe('bd-fixture-sandbox-zk3')
      expect(issue?.comments).toHaveLength(1)
    })

    it('returns null when bd show reports the id was not found', async () => {
      bdExecFileAsyncMock.mockRejectedValueOnce(
        Object.assign(new Error('not found'), { stderr: bdShowNotFoundJson })
      )
      await expect(getIssue('/repo', 'missing')).resolves.toBeNull()
    })
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

  describe('listLabels / listAssignableUsers', () => {
    it('listLabels passes an explicit --limit 0 (unlimited) and --all', async () => {
      bdExecFileAsyncMock.mockResolvedValueOnce({ stdout: bdListJson, stderr: '' })
      const result = await listLabels('/repo')
      expect(call(0).args).toEqual(['list', '--json', '--no-pager', '--all', '--limit', '0'])
      expect(result.items).toEqual(['backend', 'urgent'])
    })

    it('listAssignableUsers scrapes distinct assignee/owner values', async () => {
      bdExecFileAsyncMock.mockResolvedValueOnce({ stdout: bdListJson, stderr: '' })
      const result = await listAssignableUsers('/repo')
      expect(call(0).args).toEqual(['list', '--json', '--no-pager', '--all', '--limit', '0'])
      expect(result.items).toEqual(['brian@xenophon.dev'])
    })

    it('respects an explicit limit override', async () => {
      bdExecFileAsyncMock.mockResolvedValueOnce({ stdout: '[]', stderr: '' })
      await listLabels('/repo', { limit: 200 })
      expect(call(0).args).toEqual(['list', '--json', '--no-pager', '--all', '--limit', '200'])
    })
  })
})
