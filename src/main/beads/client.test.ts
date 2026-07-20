import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as Runner from '../git/runner'

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

import { diagnoseBeads } from './client'

function call(index: number): { args: string[]; options: Record<string, unknown> } {
  const [args, options] = bdExecFileAsyncMock.mock.calls[index] as [
    string[],
    Record<string, unknown>
  ]
  return { args, options }
}

describe('diagnoseBeads', () => {
  beforeEach(() => {
    bdExecFileAsyncMock.mockReset()
  })

  it('reports bdAvailable + version + repoInitialized when everything works', async () => {
    bdExecFileAsyncMock
      .mockResolvedValueOnce({ stdout: JSON.stringify({ version: '1.1.0' }), stderr: '' })
      .mockResolvedValueOnce({ stdout: JSON.stringify({ summary: {} }), stderr: '' })

    await expect(diagnoseBeads('/repo')).resolves.toEqual({
      bdAvailable: true,
      version: '1.1.0',
      repoInitialized: true
    })
  })

  it('calls `bd version` without -C (no cwd) so an un-initialized repo does not misreport bd as missing', async () => {
    bdExecFileAsyncMock
      .mockResolvedValueOnce({ stdout: JSON.stringify({ version: '1.1.0' }), stderr: '' })
      .mockResolvedValueOnce({ stdout: '{}', stderr: '' })

    await diagnoseBeads('/repo')

    const versionCall = call(0)
    expect(versionCall.args).toEqual(['version', '--json'])
    expect(versionCall.options.cwd).toBeUndefined()
    expect(versionCall.options.readonly).toBe(true)
  })

  it('scopes the repo-initialized check to repoPath via cwd, and uses --no-activity to stay cheap', async () => {
    bdExecFileAsyncMock
      .mockResolvedValueOnce({ stdout: JSON.stringify({ version: '1.1.0' }), stderr: '' })
      .mockResolvedValueOnce({ stdout: '{}', stderr: '' })

    await diagnoseBeads('/repo')

    const statusCall = call(1)
    expect(statusCall.args).toEqual(['status', '--no-activity', '--json'])
    expect(statusCall.options).toMatchObject({ cwd: '/repo', readonly: true })
  })

  it('reports bdAvailable:false when the bd binary is not on PATH', async () => {
    bdExecFileAsyncMock.mockRejectedValueOnce(
      Object.assign(new Error('spawn bd ENOENT'), { code: 'ENOENT' })
    )

    const result = await diagnoseBeads('/repo')
    expect(result.bdAvailable).toBe(false)
    expect(result.repoInitialized).toBe(false)
    expect(result.error).toMatchObject({ type: 'unknown' })
  })

  it('reports repoInitialized:false (no error) when the repo has no beads database yet', async () => {
    bdExecFileAsyncMock
      .mockResolvedValueOnce({ stdout: JSON.stringify({ version: '1.1.0' }), stderr: '' })
      .mockRejectedValueOnce(
        Object.assign(new Error('no db'), { stderr: 'Error: no beads database found' })
      )

    await expect(diagnoseBeads('/repo')).resolves.toEqual({
      bdAvailable: true,
      version: '1.1.0',
      repoInitialized: false
    })
  })

  it('surfaces an unexpected repo-check failure as a structured error', async () => {
    bdExecFileAsyncMock
      .mockResolvedValueOnce({ stdout: JSON.stringify({ version: '1.1.0' }), stderr: '' })
      .mockRejectedValue(
        Object.assign(new Error('locked'), {
          stderr: 'Error: embeddeddolt: another process holds the exclusive lock on /repo'
        })
      )

    const result = await diagnoseBeads('/repo')
    expect(result.bdAvailable).toBe(true)
    expect(result.repoInitialized).toBe(false)
    expect(result.error).toMatchObject({ type: 'network_error' })
  })

  it('never emits the forbidden `edit` subcommand in any diagnostic argv', async () => {
    bdExecFileAsyncMock.mockRejectedValue(new Error('boom'))

    await diagnoseBeads('/repo')

    for (const c of bdExecFileAsyncMock.mock.calls) {
      expect(c[0] as string[]).not.toContain('edit')
    }
  })
})
