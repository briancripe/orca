// Why: bdExecFileAsync is the security boundary for the whole Beads provider
// (orca-0cc) — every argv this runner builds ends up as a real bd process
// invocation. Covers argv assembly (-C placement, --readonly), that it never
// spawns a shell, WSL path routing, idempotent-gated retry, exit-code stderr
// surfacing, and the flag-injection guard.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { execFileMock, execFileSyncMock, spawnMock } = vi.hoisted(() => ({
  execFileMock: vi.fn(),
  execFileSyncMock: vi.fn(),
  spawnMock: vi.fn()
}))

vi.mock('node:child_process', () => ({
  execFile: execFileMock,
  execFileSync: execFileSyncMock,
  spawn: spawnMock
}))

import { assertBdArgSafe, bdExecFileAsync, isTransientBdError } from './runner'

function mockExecFileOnce(result: { stdout?: string; stderr?: string } | Error): void {
  execFileMock.mockImplementationOnce((_binary, _args, _options, callback) => {
    if (result instanceof Error) {
      callback(result)
      return
    }
    callback(null, { stdout: result.stdout ?? '', stderr: result.stderr ?? '' })
  })
}

beforeEach(() => {
  execFileMock.mockReset()
  spawnMock.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('bdExecFileAsync', () => {
  it('spawns bd directly via execFile, never a shell', async () => {
    mockExecFileOnce({ stdout: '[]' })

    await bdExecFileAsync(['list', '--limit', '0'], { cwd: '/repo' })

    expect(spawnMock).not.toHaveBeenCalled()
    expect(execFileMock).toHaveBeenCalledTimes(1)
    const [binary, , execOptions] = execFileMock.mock.calls[0]
    expect(binary).toBe('bd')
    // Why: execFile never interprets shell metacharacters in argv — asserting
    // no `shell` option is set is the difference between execFile-safety and
    // an accidental execFile(..., { shell: true }) shell reintroduction.
    expect(execOptions.shell).toBeUndefined()
  })

  it('places -C <cwd> before the caller-supplied args', async () => {
    mockExecFileOnce({ stdout: '[]' })

    await bdExecFileAsync(['list', '--limit', '0'], { cwd: '/repo' })

    expect(execFileMock).toHaveBeenCalledWith(
      'bd',
      ['-C', '/repo', 'list', '--limit', '0'],
      expect.anything(),
      expect.any(Function)
    )
  })

  it('omits -C when no cwd is given', async () => {
    mockExecFileOnce({ stdout: '[]' })

    await bdExecFileAsync(['version'])

    expect(execFileMock).toHaveBeenCalledWith(
      'bd',
      ['version'],
      expect.anything(),
      expect.any(Function)
    )
  })

  it('appends --readonly when readonly is requested', async () => {
    mockExecFileOnce({ stdout: '[]' })

    await bdExecFileAsync(['list', '--limit', '0'], { cwd: '/repo', readonly: true })

    expect(execFileMock).toHaveBeenCalledWith(
      'bd',
      ['-C', '/repo', 'list', '--limit', '0', '--readonly'],
      expect.anything(),
      expect.any(Function)
    )
  })

  it('does not append --readonly by default', async () => {
    mockExecFileOnce({ stdout: '' })

    await bdExecFileAsync(['create', '--title', 'x'], { cwd: '/repo' })

    const [, args] = execFileMock.mock.calls[0]
    expect(args).not.toContain('--readonly')
  })

  it('routes through wsl.exe and translates a WSL UNC cwd into the argv', async () => {
    const originalPlatform = process.platform
    Object.defineProperty(process, 'platform', { configurable: true, value: 'win32' })
    try {
      mockExecFileOnce({ stdout: '[]' })

      await bdExecFileAsync(['list', '--limit', '0'], {
        cwd: String.raw`\\wsl.localhost\Ubuntu\home\jinwoo\repo`,
        readonly: true
      })

      expect(execFileMock).toHaveBeenCalledWith(
        'wsl.exe',
        [
          '-d',
          'Ubuntu',
          '--',
          'bash',
          '-c',
          "cd '/home/jinwoo/repo' && 'bd' '-C' '/home/jinwoo/repo' 'list' '--limit' '0' '--readonly'"
        ],
        expect.objectContaining({ cwd: undefined }),
        expect.any(Function)
      )
    } finally {
      Object.defineProperty(process, 'platform', { configurable: true, value: originalPlatform })
    }
  })

  it('resolves a plain (non-WSL) Windows cwd without wsl.exe routing', async () => {
    const originalPlatform = process.platform
    Object.defineProperty(process, 'platform', { configurable: true, value: 'win32' })
    try {
      mockExecFileOnce({ stdout: '[]' })

      await bdExecFileAsync(['list', '--limit', '0'], { cwd: String.raw`C:\repo` })

      expect(execFileMock).toHaveBeenCalledWith(
        'bd',
        ['-C', String.raw`C:\repo`, 'list', '--limit', '0'],
        expect.anything(),
        expect.any(Function)
      )
    } finally {
      Object.defineProperty(process, 'platform', { configurable: true, value: originalPlatform })
    }
  })

  it('retries a transient dolt-lock error only when idempotent: true', async () => {
    mockExecFileOnce(Object.assign(new Error('lock failed'), { stderr: 'database is locked' }))
    mockExecFileOnce({ stdout: '[]' })

    await expect(
      bdExecFileAsync(['list', '--limit', '0'], { cwd: '/repo', readonly: true, idempotent: true })
    ).resolves.toEqual({ stdout: '[]', stderr: '' })

    expect(execFileMock).toHaveBeenCalledTimes(2)
  })

  it('does not retry a transient dolt-lock error when idempotent is unset (default write safety)', async () => {
    mockExecFileOnce(Object.assign(new Error('lock failed'), { stderr: 'database is locked' }))

    await expect(bdExecFileAsync(['create', '--title', 'x'], { cwd: '/repo' })).rejects.toThrow(
      'lock failed'
    )

    expect(execFileMock).toHaveBeenCalledTimes(1)
  })

  it('does not retry a non-transient error even when idempotent: true', async () => {
    mockExecFileOnce(Object.assign(new Error('not found'), { stderr: 'issue orca-999 not found' }))

    await expect(
      bdExecFileAsync(['show'], {
        cwd: '/repo',
        readonly: true,
        idempotent: true,
        positionals: ['orca-999']
      })
    ).rejects.toThrow('not found')

    expect(execFileMock).toHaveBeenCalledTimes(1)
  })

  it('surfaces stderr from an exit-code failure on the thrown error (extractExecError compatible)', async () => {
    mockExecFileOnce(
      Object.assign(new Error('Command failed: bd show orca-999'), {
        stdout: '',
        stderr: 'Error: issue orca-999 not found\n'
      })
    )

    await expect(
      bdExecFileAsync(['show'], { cwd: '/repo', positionals: ['orca-999'] })
    ).rejects.toMatchObject({
      stderr: 'Error: issue orca-999 not found\n'
    })
  })

  it('appends positionals after a literal "--", following --readonly', async () => {
    mockExecFileOnce({ stdout: '{}' })

    await bdExecFileAsync(['show'], { cwd: '/repo', readonly: true, positionals: ['orca-999'] })

    expect(execFileMock).toHaveBeenCalledWith(
      'bd',
      ['-C', '/repo', 'show', '--readonly', '--', 'orca-999'],
      expect.anything(),
      expect.any(Function)
    )
  })

  it('omits the "--" terminator entirely when no positionals are given', async () => {
    mockExecFileOnce({ stdout: '[]' })

    await bdExecFileAsync(['list', '--limit', '0'], { cwd: '/repo' })

    const [, args] = execFileMock.mock.calls[0]
    expect(args).not.toContain('--')
  })

  it(
    'rejects a hostile positional passed the natural way, before bd is ever spawned — ' +
      'no assertBdArgSafe call anywhere in this test',
    async () => {
      const hostileId = '--db=/etc/passwd'

      // This is the natural, obvious call a future call site (bd-utils
      // issues.ts, IPC handlers) makes: hand the untrusted id straight to
      // bdExecFileAsync via `positionals`. Nothing here pre-sanitizes it —
      // the runner itself must refuse to build the argv.
      await expect(
        bdExecFileAsync(['show'], { cwd: '/repo', readonly: true, positionals: [hostileId] })
      ).rejects.toThrow(/refusing to pass a bd argument that looks like a flag/)

      expect(execFileMock).not.toHaveBeenCalled()
    }
  )
})

describe('isTransientBdError', () => {
  it('classifies dolt lock/contention stderr as transient', () => {
    expect(isTransientBdError('database is locked')).toBe(true)
    expect(isTransientBdError('Error: could not acquire lock on issues table')).toBe(true)
    expect(isTransientBdError('lock wait timeout exceeded')).toBe(true)
  })

  it('does not classify a validation/not-found error as transient', () => {
    expect(isTransientBdError('issue orca-999 not found')).toBe(false)
    expect(isTransientBdError('unknown flag: --bogus')).toBe(false)
  })
})

describe('assertBdArgSafe (flag/option-injection guard)', () => {
  it('passes through an ordinary value unchanged', () => {
    expect(assertBdArgSafe('orca-123')).toBe('orca-123')
  })

  it('throws for a value that starts with "-", preventing it from smuggling a bd flag', () => {
    // Why: this is the concrete proof that a hostile/malformed id like
    // `--db=/etc/passwd` can never reach bd argv as a positional value —
    // it is rejected before it is ever joined into the args array that
    // bdExecFileAsync hands to execFile.
    expect(() => assertBdArgSafe('--db=/etc/passwd')).toThrow(
      /refusing to pass a bd argument that looks like a flag/
    )
    expect(() => assertBdArgSafe('-x')).toThrow()
  })
})
