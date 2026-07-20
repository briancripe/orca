// Real-`bd`-binary integration coverage for the beads client layer
// (client.ts/issue-crud.ts/issue-queries.ts/dependencies.ts). Every other
// test in this directory mocks bdExecFileAsync; this file instead drives an
// actual `bd` process against a throwaway `git init` + `bd init` scratch
// repo, following the hosted-review-gitea.integration.test.ts pattern (real
// local resources, mkdtemp scratch dir, cleanup in afterEach). This pins the
// bd v1.1.0 JSON contract so an upstream bd change fails loudly here instead
// of in production.
import { execFileSync } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { diagnoseBeads } from './client'
import { addDependency, getEpicProgress, listChildren, removeDependency } from './dependencies'
import { addIssueComment, closeIssue, createIssue, reopenIssue, updateIssue } from './issue-crud'
import { getIssue, listAssignableUsers, listIssues, listLabels } from './issue-queries'

function isBdOnPath(): boolean {
  try {
    execFileSync('bd', ['version', '--json'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

const bdAvailable = isBdOnPath()

describe.skipIf(!bdAvailable)('bd client against a real bd binary', () => {
  let repoPath: string

  beforeEach(async () => {
    repoPath = await mkdtemp(join(tmpdir(), 'orca-bd-client-'))
    execFileSync('git', ['init', '-q'], { cwd: repoPath })
    execFileSync('git', ['config', 'user.email', 'orca-test@example.com'], { cwd: repoPath })
    execFileSync('git', ['config', 'user.name', 'Orca Test'], { cwd: repoPath })
    // Why --skip-agents/--skip-hooks: a bare `bd init` also scaffolds
    // CLAUDE.md/AGENTS.md/git hooks for the target repo — noise this scratch
    // repo never needs and that would otherwise leak writes outside .beads/.
    execFileSync(
      'bd',
      ['init', '--non-interactive', '--quiet', '--skip-agents', '--skip-hooks', '--prefix', 'itg'],
      { cwd: repoPath }
    )
  })

  afterEach(async () => {
    await rm(repoPath, { recursive: true, force: true })
  })

  it('diagnoses an initialized repo as available with a version', async () => {
    await expect(diagnoseBeads(repoPath)).resolves.toMatchObject({
      bdAvailable: true,
      repoInitialized: true,
      version: expect.any(String)
    })
  })

  it('drives create -> list (--ready/--status) -> show -> update -> close -> reopen -> comment', async () => {
    const created = await createIssue(repoPath, {
      title: 'Fix the flaky login test',
      description: 'Investigate intermittent auth failures',
      priority: 1,
      labels: ['bug', 'ci']
    })
    expect(created.ok).toBe(true)
    if (!created.ok) {
      return
    }
    const { id } = created.issue
    expect(created.issue).toMatchObject({
      title: 'Fix the flaky login test',
      description: 'Investigate intermittent auth failures',
      status: 'open',
      priority: 1,
      labels: ['bug', 'ci']
    })

    const listed = await listIssues(repoPath, { limit: 50 })
    expect(listed.error).toBeUndefined()
    expect(listed.items.map((item) => item.id)).toContain(id)

    const ready = await listIssues(repoPath, { ready: true, limit: 50 })
    expect(ready.error).toBeUndefined()
    expect(ready.items.map((item) => item.id)).toContain(id)

    const openOnly = await listIssues(repoPath, { status: ['open'], limit: 50 })
    expect(openOnly.items.map((item) => item.id)).toContain(id)
    const closedOnly = await listIssues(repoPath, { status: ['closed'], limit: 50 })
    expect(closedOnly.items.map((item) => item.id)).not.toContain(id)

    const shown = await getIssue(repoPath, id)
    expect(shown).toMatchObject({ id, title: 'Fix the flaky login test', dependencies: [] })

    const commented = await addIssueComment(repoPath, id, 'Repro found: race in setup()')
    expect(commented.ok).toBe(true)
    if (commented.ok) {
      expect(commented.comment).toMatchObject({ issueId: id, text: 'Repro found: race in setup()' })
    }
    const shownWithComment = await getIssue(repoPath, id)
    expect(shownWithComment?.comments).toEqual([
      expect.objectContaining({ text: 'Repro found: race in setup()' })
    ])

    const updated = await updateIssue(repoPath, id, { status: 'in_progress', priority: 0 })
    expect(updated.ok).toBe(true)
    if (updated.ok) {
      expect(updated.issue).toMatchObject({ status: 'in_progress', priority: 0 })
    }

    const closed = await closeIssue(repoPath, id, 'Fixed by pinning the setup() await')
    expect(closed.ok).toBe(true)
    if (closed.ok) {
      expect(closed.issue).toMatchObject({
        status: 'closed',
        closeReason: 'Fixed by pinning the setup() await'
      })
    }

    const reopened = await reopenIssue(repoPath, id, 'Regressed in the follow-up PR')
    expect(reopened.ok).toBe(true)
    if (reopened.ok) {
      expect(reopened.issue.status).toBe('open')
    }
  })

  it('round-trips a dependency add/remove and lists children via the parent filter', async () => {
    const blocker = await createIssue(repoPath, { title: 'Design the schema' })
    const blocked = await createIssue(repoPath, { title: 'Implement the migration' })
    expect(blocker.ok && blocked.ok).toBe(true)
    if (!blocker.ok || !blocked.ok) {
      return
    }

    const added = await addDependency(repoPath, blocked.issue.id, blocker.issue.id)
    expect(added).toEqual({ ok: true })

    const withDependency = await getIssue(repoPath, blocked.issue.id)
    expect(withDependency?.dependencies).toEqual([
      { issueId: blocked.issue.id, dependsOnId: blocker.issue.id, type: 'blocks' }
    ])

    const removed = await removeDependency(repoPath, blocked.issue.id, blocker.issue.id)
    expect(removed).toEqual({ ok: true })

    const withoutDependency = await getIssue(repoPath, blocked.issue.id)
    expect(withoutDependency?.dependencies).toEqual([])

    const parent = await createIssue(repoPath, { title: 'Epic: onboarding revamp', type: 'epic' })
    expect(parent.ok).toBe(true)
    if (!parent.ok) {
      return
    }
    const child = await createIssue(repoPath, {
      title: 'Write the onboarding checklist',
      parent: parent.issue.id
    })
    expect(child.ok).toBe(true)
    if (!child.ok) {
      return
    }

    const children = await listChildren(repoPath, parent.issue.id)
    expect(children.error).toBeUndefined()
    expect(children.items.map((item) => item.id)).toEqual([child.issue.id])
  })

  it('serializes two concurrent client writes through the write semaphore without a lock error', async () => {
    // Why concurrent through the client (not raw `bd`): bdWrite's module-level
    // write lock (bd-utils.ts) is what must prevent two overlapping mutations
    // from ever reaching bd's single-writer Dolt store at once — this proves
    // that guarantee against the real binary rather than a mock. If the
    // semaphore ever regressed, this would surface as a raw "holds the
    // exclusive lock" bd failure instead of two clean results.
    const [first, second] = await Promise.all([
      createIssue(repoPath, { title: 'Concurrent write A' }),
      createIssue(repoPath, { title: 'Concurrent write B' })
    ])

    expect(first.ok).toBe(true)
    expect(second.ok).toBe(true)
    if (!first.ok || !second.ok) {
      return
    }
    expect(first.issue.id).not.toBe(second.issue.id)

    const listed = await listIssues(repoPath, { limit: 50 })
    expect(listed.items.map((item) => item.id)).toEqual(
      expect.arrayContaining([first.issue.id, second.issue.id])
    )
  })

  it('scrapes distinct labels and assignees across the repo via listLabels/listAssignableUsers', async () => {
    const first = await createIssue(repoPath, {
      title: 'Tune the query planner',
      labels: ['perf', 'backend'],
      assignee: 'ada@example.com'
    })
    const second = await createIssue(repoPath, {
      title: 'Audit the login flow',
      labels: ['security'],
      assignee: 'grace@example.com'
    })
    expect(first.ok && second.ok).toBe(true)

    const labels = await listLabels(repoPath)
    expect(labels.error).toBeUndefined()
    expect(labels.items).toEqual(['backend', 'perf', 'security'])

    // Why arrayContaining, not toEqual: bd also stamps every created issue's
    // `owner` with the scratch repo's git identity, and listAssignableUsers
    // scrapes both assignee and owner — so that identity is always present
    // alongside the explicit assignees under test.
    const assignees = await listAssignableUsers(repoPath)
    expect(assignees.error).toBeUndefined()
    expect(assignees.items).toEqual(
      expect.arrayContaining(['ada@example.com', 'grace@example.com'])
    )
  })

  it('derives getEpicProgress from an epic parent and its children', async () => {
    const parent = await createIssue(repoPath, { title: 'Epic: search revamp', type: 'epic' })
    expect(parent.ok).toBe(true)
    if (!parent.ok) {
      return
    }
    const inProgress = await createIssue(repoPath, {
      title: 'Index the new fields',
      parent: parent.issue.id
    })
    const pending = await createIssue(repoPath, {
      title: 'Ship the ranking tweak',
      parent: parent.issue.id
    })
    expect(inProgress.ok && pending.ok).toBe(true)
    if (!inProgress.ok) {
      return
    }
    const updated = await updateIssue(repoPath, inProgress.issue.id, { status: 'in_progress' })
    expect(updated.ok).toBe(true)

    // Why not a closed child: bd's `list` (what listChildren drives) omits
    // closed issues unless `--all` is passed, so getEpicProgress's own
    // closedCount is only ever reachable via the open/in-progress/blocked
    // children still surfaced by that default listing.
    const progress = await getEpicProgress(repoPath, parent.issue.id)
    expect(progress.error).toBeUndefined()
    expect(progress.progress).toMatchObject({
      total: 2,
      inProgressCount: 1,
      openCount: 1,
      closedCount: 0
    })
  })
})
