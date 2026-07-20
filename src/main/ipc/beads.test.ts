import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Store } from '../persistence'
import type { Repo } from '../../shared/types'
import { toSshExecutionHostId } from '../../shared/execution-host'

const {
  ipcHandlers,
  diagnoseBeadsMock,
  listIssuesMock,
  getIssueMock,
  listLabelsMock,
  createIssueMock,
  updateIssueMock,
  closeIssueMock,
  reopenIssueMock,
  addIssueCommentMock,
  addDependencyMock,
  removeDependencyMock,
  getLocalProjectWorktreeGitOptionsMock
} = vi.hoisted(() => ({
  ipcHandlers: new Map<string, (...args: unknown[]) => unknown>(),
  diagnoseBeadsMock: vi.fn(),
  listIssuesMock: vi.fn(),
  getIssueMock: vi.fn(),
  listLabelsMock: vi.fn(),
  createIssueMock: vi.fn(),
  updateIssueMock: vi.fn(),
  closeIssueMock: vi.fn(),
  reopenIssueMock: vi.fn(),
  addIssueCommentMock: vi.fn(),
  addDependencyMock: vi.fn(),
  removeDependencyMock: vi.fn(),
  getLocalProjectWorktreeGitOptionsMock: vi.fn()
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      ipcHandlers.set(channel, handler)
    })
  }
}))

vi.mock('../beads/client', () => ({ diagnoseBeads: diagnoseBeadsMock }))
vi.mock('../beads/issue-queries', () => ({
  getIssue: getIssueMock,
  listIssues: listIssuesMock,
  listLabels: listLabelsMock
}))
vi.mock('../beads/issue-crud', () => ({
  addIssueComment: addIssueCommentMock,
  closeIssue: closeIssueMock,
  createIssue: createIssueMock,
  reopenIssue: reopenIssueMock,
  updateIssue: updateIssueMock
}))
vi.mock('../beads/dependencies', () => ({
  addDependency: addDependencyMock,
  removeDependency: removeDependencyMock
}))
vi.mock('../project-runtime-git-options', () => ({
  getLocalProjectWorktreeGitOptions: getLocalProjectWorktreeGitOptionsMock
}))

import { registerBeadsHandlers } from './beads'

function repo(overrides: Partial<Repo> = {}): Repo {
  return {
    id: 'repo-local',
    path: '/local/orca',
    displayName: 'Orca',
    badgeColor: '#737373',
    addedAt: 1,
    ...overrides
  }
}

function storeWithRepos(repos: Repo[]): Store {
  return {
    getRepos: () => repos,
    getRepo: (id: string) => repos.find((candidate) => candidate.id === id)
  } as unknown as Store
}

const ALL_MOCKS = [
  diagnoseBeadsMock,
  listIssuesMock,
  getIssueMock,
  listLabelsMock,
  createIssueMock,
  updateIssueMock,
  closeIssueMock,
  reopenIssueMock,
  addIssueCommentMock,
  addDependencyMock,
  removeDependencyMock
]

describe('Beads IPC handlers', () => {
  beforeEach(() => {
    ipcHandlers.clear()
    for (const mock of ALL_MOCKS) {
      mock.mockReset()
    }
    getLocalProjectWorktreeGitOptionsMock.mockReset()
    getLocalProjectWorktreeGitOptionsMock.mockReturnValue({})
  })

  describe('registered-repo guard', () => {
    it('rejects an unregistered repo path before spawning bd on every channel', async () => {
      registerBeadsHandlers(storeWithRepos([]))
      const channels = [
        ['beads:diagnose', { repoPath: '/not/registered' }],
        ['beads:listIssues', { repoPath: '/not/registered' }],
        ['beads:listWorkItems', { repoPath: '/not/registered' }],
        ['beads:issue', { repoPath: '/not/registered', id: 'orca-1' }],
        ['beads:workItemDetails', { repoPath: '/not/registered', id: 'orca-1' }],
        ['beads:createIssue', { repoPath: '/not/registered', input: { title: 'x' } }],
        ['beads:updateIssue', { repoPath: '/not/registered', id: 'orca-1', updates: {} }],
        ['beads:closeIssue', { repoPath: '/not/registered', id: 'orca-1' }],
        ['beads:reopenIssue', { repoPath: '/not/registered', id: 'orca-1' }],
        ['beads:addIssueComment', { repoPath: '/not/registered', id: 'orca-1', text: 'hi' }],
        ['beads:listLabels', { repoPath: '/not/registered' }],
        ['beads:addDependency', { repoPath: '/not/registered', issueId: 'a', dependsOnId: 'b' }],
        ['beads:removeDependency', { repoPath: '/not/registered', issueId: 'a', dependsOnId: 'b' }]
      ] as const

      for (const [channel, args] of channels) {
        await expect(ipcHandlers.get(channel)?.(null, args)).rejects.toThrow(
          'unknown repository path'
        )
      }
      for (const mock of ALL_MOCKS) {
        expect(mock).not.toHaveBeenCalled()
      }
    })

    it('rejects a source context whose host does not match the repo host', async () => {
      registerBeadsHandlers(storeWithRepos([repo()]))
      await expect(
        ipcHandlers.get('beads:diagnose')?.(null, {
          repoPath: '/local/orca',
          repoId: 'repo-local',
          sourceContext: {
            kind: 'task-source',
            provider: 'gitlab',
            projectId: 'p',
            hostId: toSshExecutionHostId('builder'),
            repoId: 'repo-local'
          }
        })
      ).rejects.toThrow('source host does not match')
      expect(diagnoseBeadsMock).not.toHaveBeenCalled()
    })

    it('resolves the repo by repoId when the path does not match', async () => {
      const remoteRepo = repo({
        id: 'repo-ssh',
        path: '/ssh/orca',
        executionHostId: toSshExecutionHostId('builder')
      })
      diagnoseBeadsMock.mockResolvedValueOnce({ bdAvailable: true, repoInitialized: true })
      registerBeadsHandlers(storeWithRepos([repo(), remoteRepo]))

      await ipcHandlers.get('beads:diagnose')?.(null, {
        repoPath: '/does/not/matter',
        repoId: 'repo-ssh',
        sourceContext: {
          kind: 'task-source',
          provider: 'gitlab',
          projectId: 'p',
          hostId: toSshExecutionHostId('builder'),
          repoId: 'repo-ssh'
        }
      })
      expect(diagnoseBeadsMock).toHaveBeenCalledWith('/ssh/orca', {})
    })
  })

  describe('payload round-trips', () => {
    it('lists issues and stamps the resolved repo id onto each row', async () => {
      listIssuesMock.mockResolvedValueOnce({
        items: [{ id: 'orca-1', title: 'One', repoId: '' }]
      })
      registerBeadsHandlers(storeWithRepos([repo()]))

      const result = await ipcHandlers.get('beads:listIssues')?.(null, {
        repoPath: '/local/orca',
        filters: { status: ['open'], limit: 20 }
      })
      expect(listIssuesMock).toHaveBeenCalledWith(
        '/local/orca',
        { status: ['open'], limit: 20 },
        {}
      )
      expect(result).toEqual({ items: [{ id: 'orca-1', title: 'One', repoId: 'repo-local' }] })
    })

    it('listWorkItems shares the list path and stamps repoId', async () => {
      listIssuesMock.mockResolvedValueOnce({ items: [{ id: 'orca-2', title: 'Two', repoId: '' }] })
      registerBeadsHandlers(storeWithRepos([repo()]))

      const result = await ipcHandlers.get('beads:listWorkItems')?.(null, {
        repoPath: '/local/orca'
      })
      expect(listIssuesMock).toHaveBeenCalledWith('/local/orca', {}, {})
      expect(result).toEqual({ items: [{ id: 'orca-2', title: 'Two', repoId: 'repo-local' }] })
    })

    it('fetches a single issue and its detail through the same bd show path', async () => {
      getIssueMock.mockResolvedValue({ id: 'orca-3', title: 'Three' })
      registerBeadsHandlers(storeWithRepos([repo()]))

      await ipcHandlers.get('beads:issue')?.(null, { repoPath: '/local/orca', id: 'orca-3' })
      await ipcHandlers.get('beads:workItemDetails')?.(null, {
        repoPath: '/local/orca',
        id: 'orca-3'
      })
      expect(getIssueMock).toHaveBeenNthCalledWith(1, '/local/orca', 'orca-3', {})
      expect(getIssueMock).toHaveBeenNthCalledWith(2, '/local/orca', 'orca-3', {})
    })

    it('round-trips create / update / close / reopen / comment / labels / deps', async () => {
      createIssueMock.mockResolvedValue({ ok: true, issue: { id: 'orca-4' } })
      updateIssueMock.mockResolvedValue({ ok: true, issue: { id: 'orca-4' } })
      closeIssueMock.mockResolvedValue({ ok: true, issue: { id: 'orca-4' } })
      reopenIssueMock.mockResolvedValue({ ok: true, issue: { id: 'orca-4' } })
      addIssueCommentMock.mockResolvedValue({ ok: true, comment: { id: 'c1' } })
      listLabelsMock.mockResolvedValue({ items: ['bug', 'feature'] })
      addDependencyMock.mockResolvedValue({ ok: true })
      removeDependencyMock.mockResolvedValue({ ok: true })
      registerBeadsHandlers(storeWithRepos([repo()]))

      await ipcHandlers.get('beads:createIssue')?.(null, {
        repoPath: '/local/orca',
        input: { title: 'Four' }
      })
      await ipcHandlers.get('beads:updateIssue')?.(null, {
        repoPath: '/local/orca',
        id: 'orca-4',
        updates: { status: 'in_progress' }
      })
      await ipcHandlers.get('beads:closeIssue')?.(null, {
        repoPath: '/local/orca',
        id: 'orca-4',
        reason: 'done'
      })
      await ipcHandlers.get('beads:reopenIssue')?.(null, { repoPath: '/local/orca', id: 'orca-4' })
      await ipcHandlers.get('beads:addIssueComment')?.(null, {
        repoPath: '/local/orca',
        id: 'orca-4',
        text: 'note'
      })
      await ipcHandlers.get('beads:listLabels')?.(null, { repoPath: '/local/orca' })
      await ipcHandlers.get('beads:addDependency')?.(null, {
        repoPath: '/local/orca',
        issueId: 'orca-4',
        dependsOnId: 'orca-1'
      })
      await ipcHandlers.get('beads:removeDependency')?.(null, {
        repoPath: '/local/orca',
        issueId: 'orca-4',
        dependsOnId: 'orca-1'
      })

      expect(createIssueMock).toHaveBeenCalledWith('/local/orca', { title: 'Four' }, {})
      expect(updateIssueMock).toHaveBeenCalledWith(
        '/local/orca',
        'orca-4',
        { status: 'in_progress' },
        {}
      )
      expect(closeIssueMock).toHaveBeenCalledWith('/local/orca', 'orca-4', 'done', {})
      expect(reopenIssueMock).toHaveBeenCalledWith('/local/orca', 'orca-4', undefined, {})
      expect(addIssueCommentMock).toHaveBeenCalledWith('/local/orca', 'orca-4', 'note', {})
      expect(listLabelsMock).toHaveBeenCalledWith('/local/orca', {})
      expect(addDependencyMock).toHaveBeenCalledWith('/local/orca', 'orca-4', 'orca-1', {})
      expect(removeDependencyMock).toHaveBeenCalledWith('/local/orca', 'orca-4', 'orca-1', {})
    })

    it('plumbs WSL distro options through to the bd client', async () => {
      getLocalProjectWorktreeGitOptionsMock.mockReturnValue({ wslDistro: 'Ubuntu' })
      listLabelsMock.mockResolvedValue({ items: [] })
      registerBeadsHandlers(storeWithRepos([repo()]))

      await ipcHandlers.get('beads:listLabels')?.(null, { repoPath: '/local/orca' })
      expect(listLabelsMock).toHaveBeenCalledWith('/local/orca', { wslDistro: 'Ubuntu' })
    })
  })

  describe('id validation before spawn', () => {
    it('returns null for a flag-smuggling id on read channels without spawning bd', async () => {
      registerBeadsHandlers(storeWithRepos([repo()]))
      await expect(
        ipcHandlers.get('beads:issue')?.(null, { repoPath: '/local/orca', id: '--db=x' })
      ).resolves.toBeNull()
      await expect(
        ipcHandlers.get('beads:workItemDetails')?.(null, { repoPath: '/local/orca', id: '-rf' })
      ).resolves.toBeNull()
      expect(getIssueMock).not.toHaveBeenCalled()
    })

    it('returns an error envelope for an invalid id on mutating channels without spawning bd', async () => {
      registerBeadsHandlers(storeWithRepos([repo()]))
      const invalid = { repoPath: '/local/orca', id: '-rf', updates: {} }
      await expect(ipcHandlers.get('beads:updateIssue')?.(null, invalid)).resolves.toEqual({
        ok: false,
        error: { type: 'validation_error', message: 'Invalid beads issue id' }
      })
      await expect(
        ipcHandlers.get('beads:addDependency')?.(null, {
          repoPath: '/local/orca',
          issueId: 'orca-1',
          dependsOnId: '--db=x'
        })
      ).resolves.toEqual({
        ok: false,
        error: { type: 'validation_error', message: 'Invalid beads issue id' }
      })
      expect(updateIssueMock).not.toHaveBeenCalled()
      expect(addDependencyMock).not.toHaveBeenCalled()
    })
  })
})
