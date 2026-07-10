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

import { bdRead, bdWrite } from './bd-utils'

// Why: a controllable, never-auto-resolving promise so tests can observe
// "N calls started but not yet finished" instead of racing real timers.
function deferred<T>(): {
  promise: Promise<T>
  resolve: (v: T) => void
  reject: (e: unknown) => void
} {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('bd-utils', () => {
  beforeEach(() => {
    bdExecFileAsyncMock.mockReset()
  })

  describe('bdRead', () => {
    it('always passes readonly:true and the repo cwd', async () => {
      bdExecFileAsyncMock.mockResolvedValueOnce({ stdout: '[]', stderr: '' })
      await bdRead('/repo', ['list', '--json', '--limit', '50'])
      expect(bdExecFileAsyncMock).toHaveBeenCalledWith(
        ['list', '--json', '--limit', '50'],
        expect.objectContaining({ cwd: '/repo', readonly: true })
      )
    })

    it('omits cwd when repoPath is undefined (global, non-repo-scoped commands)', async () => {
      bdExecFileAsyncMock.mockResolvedValueOnce({ stdout: '{}', stderr: '' })
      await bdRead(undefined, ['version', '--json'])
      const [, options] = bdExecFileAsyncMock.mock.calls[0] as [string[], Record<string, unknown>]
      expect(options.cwd).toBeUndefined()
      expect(options.readonly).toBe(true)
    })

    it('retries a transient dolt-lock error and succeeds on a later attempt', async () => {
      bdExecFileAsyncMock
        .mockRejectedValueOnce(
          Object.assign(new Error('locked'), {
            stderr:
              'Error: embeddeddolt: another process holds the exclusive lock on /repo/.beads/embeddeddolt; the embedded backend supports only one writer at a time'
          })
        )
        .mockResolvedValueOnce({ stdout: '[]', stderr: '' })

      await expect(bdRead('/repo', ['list', '--json', '--limit', '50'])).resolves.toEqual({
        stdout: '[]',
        stderr: ''
      })
      expect(bdExecFileAsyncMock).toHaveBeenCalledTimes(2)
    })

    it('does not retry a non-transient error (e.g. unknown issue id)', async () => {
      bdExecFileAsyncMock.mockRejectedValueOnce(
        Object.assign(new Error('not found'), {
          stderr: 'Error fetching bd-1: no issue found matching "bd-1"'
        })
      )

      await expect(bdRead('/repo', ['show', '--json'])).rejects.toThrow()
      expect(bdExecFileAsyncMock).toHaveBeenCalledTimes(1)
    })

    it('gives up after exhausting retries on a persistently transient error', async () => {
      const lockedError = Object.assign(new Error('locked'), {
        stderr: 'Error: embeddeddolt: another process holds the exclusive lock on /repo'
      })
      bdExecFileAsyncMock.mockRejectedValue(lockedError)

      await expect(bdRead('/repo', ['list', '--json'])).rejects.toThrow()
      // 1 initial attempt + 2 retries = 3 total calls.
      expect(bdExecFileAsyncMock).toHaveBeenCalledTimes(3)
    })

    it('caps concurrent reads at 4', async () => {
      const deferredCalls = Array.from({ length: 6 }, () =>
        deferred<{ stdout: string; stderr: string }>()
      )
      let started = 0
      bdExecFileAsyncMock.mockImplementation(() => {
        const call = deferredCalls[started]
        started += 1
        return call.promise
      })

      const reads = deferredCalls.map((_, i) => bdRead('/repo', ['list', '--json', String(i)]))
      await Promise.resolve()
      await Promise.resolve()

      expect(started).toBe(4)

      deferredCalls[0].resolve({ stdout: '[]', stderr: '' })
      await Promise.resolve()
      await Promise.resolve()
      expect(started).toBe(5)

      deferredCalls.slice(1).forEach((c) => c.resolve({ stdout: '[]', stderr: '' }))
      await Promise.all(reads)
    })
  })

  describe('bdWrite', () => {
    it('never retries, even on a transient-looking error', async () => {
      bdExecFileAsyncMock.mockRejectedValueOnce(
        Object.assign(new Error('locked'), {
          stderr: 'Error: embeddeddolt: another process holds the exclusive lock on /repo'
        })
      )

      await expect(bdWrite('/repo', ['create', '--json'])).rejects.toThrow()
      expect(bdExecFileAsyncMock).toHaveBeenCalledTimes(1)
    })

    it('does not pass readonly on writes', async () => {
      bdExecFileAsyncMock.mockResolvedValueOnce({ stdout: '{}', stderr: '' })
      await bdWrite('/repo', ['create', '--json'])
      const [, options] = bdExecFileAsyncMock.mock.calls[0] as [string[], Record<string, unknown>]
      expect(options.readonly).toBeUndefined()
      expect(options.cwd).toBe('/repo')
    })

    it('serializes concurrent writes — the second does not start until the first resolves', async () => {
      const first = deferred<{ stdout: string; stderr: string }>()
      const second = deferred<{ stdout: string; stderr: string }>()
      let calls = 0
      bdExecFileAsyncMock.mockImplementation(() => {
        calls += 1
        return calls === 1 ? first.promise : second.promise
      })

      const w1 = bdWrite('/repo', ['create', '--json', '1'])
      const w2 = bdWrite('/repo', ['create', '--json', '2'])
      await Promise.resolve()
      await Promise.resolve()

      expect(calls).toBe(1)

      first.resolve({ stdout: '{}', stderr: '' })
      await w1
      await Promise.resolve()
      await Promise.resolve()
      expect(calls).toBe(2)

      second.resolve({ stdout: '{}', stderr: '' })
      await w2
    })

    it('never runs concurrently with an in-flight read', async () => {
      const read = deferred<{ stdout: string; stderr: string }>()
      const write = deferred<{ stdout: string; stderr: string }>()
      let writeStarted = false
      bdExecFileAsyncMock.mockImplementation((args: string[]) => {
        if (args[0] === 'list') {
          return read.promise
        }
        writeStarted = true
        return write.promise
      })

      const r = bdRead('/repo', ['list', '--json'])
      const w = bdWrite('/repo', ['create', '--json'])
      await Promise.resolve()
      await Promise.resolve()

      expect(writeStarted).toBe(false)

      read.resolve({ stdout: '[]', stderr: '' })
      await r
      await Promise.resolve()
      await Promise.resolve()
      expect(writeStarted).toBe(true)

      write.resolve({ stdout: '{}', stderr: '' })
      await w
    })
  })
})
