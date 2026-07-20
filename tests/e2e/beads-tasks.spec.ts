/**
 * E2E coverage for the Beads (bd) task provider (beads epic orca-0cc.16/.17).
 *
 * Two availability tiers, following the "never fail CI when the tool isn't
 * present" convention used by the real-bd integration suite
 * (src/main/beads/bd-client.integration.test.ts):
 *
 *  1. bd absent — the Integrations settings card shows the not-installed
 *     guidance and the tasks page offers no beads source tab. Runs only when
 *     bd is NOT on PATH (the not-installed state can't be reproduced without
 *     PATH control when bd is installed).
 *  2. bd present — a git + `bd init` scratch repo lists its seeded issues, and
 *     "Start work" from an issue opens the New Workspace composer pre-filled
 *     with the bead id. A second git-only repo exercises the uninitialized
 *     ("run bd init") tier. Skipped cleanly when bd is unavailable.
 */

import { execFileSync } from 'node:child_process'
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test, expect } from './helpers/orca-app'
import { waitForSessionReady, getStoreState } from './helpers/store'

type OrcaPage = Parameters<typeof getStoreState>[0]

function isBdOnPath(): boolean {
  try {
    execFileSync('bd', ['version', '--json'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

const bdAvailable = isBdOnPath()
const scratchRoots: string[] = []

function initGitRepo(): string {
  // realpathSync so the path matches the store's repo.path on macOS, where
  // os.tmpdir() (/var/...) symlinks to /private/var/... and the app
  // canonicalizes repo.path via `git rev-parse --show-toplevel` on add.
  const repoPath = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'orca-e2e-beads-')))
  scratchRoots.push(repoPath)
  execFileSync('git', ['init', '-q'], { cwd: repoPath })
  execFileSync('git', ['config', 'user.email', 'e2e@test.local'], { cwd: repoPath })
  execFileSync('git', ['config', 'user.name', 'E2E Test'], { cwd: repoPath })
  execFileSync('git', ['commit', '--allow-empty', '-m', 'init', '-q'], { cwd: repoPath })
  return repoPath
}

/** git init + bd init + a few seeded issues; returns repo path and seed titles. */
function provisionBeadsRepo(): { repoPath: string; seededTitles: string[] } {
  const repoPath = initGitRepo()
  // --skip-agents/--skip-hooks: a bare `bd init` also scaffolds CLAUDE.md /
  // git hooks — noise this scratch repo never needs.
  execFileSync(
    'bd',
    ['init', '--non-interactive', '--quiet', '--skip-agents', '--skip-hooks', '--prefix', 'e2e'],
    { cwd: repoPath }
  )
  const seededTitles = ['Wire up the login flow', 'Investigate flaky import']
  for (const title of seededTitles) {
    execFileSync(
      'bd',
      ['create', '--silent', '--title', title, '--type', 'task', '--priority', '1'],
      {
        cwd: repoPath
      }
    )
  }
  return { repoPath, seededTitles }
}

async function addProject(page: OrcaPage, folderPath: string): Promise<string> {
  await page.evaluate((p) => {
    window.__store?.getState().openModal('confirm-add-project-from-folder', { folderPath: p })
  }, folderPath)
  const dialog = page.getByRole('dialog', { name: /^Add Project$/i })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: /^Add Project$/ }).click()
  await expect(dialog).toBeHidden()

  let repoId = ''
  await expect
    .poll(
      async () =>
        (repoId = await page.evaluate((p) => {
          const repo = window.__store?.getState().repos.find((r) => r.path === p)
          return repo?.id ?? ''
        }, folderPath)),
      { timeout: 30_000, message: 'added beads project never appeared in the store' }
    )
    .not.toBe('')
  return repoId
}

async function openBeadsTasks(page: OrcaPage, repoId: string): Promise<void> {
  await page.evaluate((id) => {
    window.__store?.getState().openTaskPage({ taskSource: 'beads', preselectedRepoId: id })
  }, repoId)
  await expect
    .poll(async () => getStoreState<string>(page, 'activeView'), { timeout: 5_000 })
    .toBe('tasks')
}

test.afterEach(() => {
  for (const root of scratchRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

test.describe('Beads task provider — bd unavailable', () => {
  test.skip(bdAvailable, 'bd is installed; the not-installed state is not reproducible')

  test('shows install guidance and offers no beads source tab', async ({ orcaPage }) => {
    await waitForSessionReady(orcaPage)

    await orcaPage.evaluate(() => {
      window.__store?.getState().openSettingsTarget({ pane: 'integrations', repoId: null })
    })

    // The Beads integration card renders the not-installed guidance (copy is
    // unique to that branch of the card).
    await expect(orcaPage.getByText(/Install Beads \(bd\) to browse and start work/i)).toBeVisible({
      timeout: 10_000
    })
    await expect(orcaPage.getByText('Not installed').first()).toBeVisible()

    await orcaPage.evaluate(() => window.__store?.getState().closeSettingsPage())
    await orcaPage.evaluate(() => window.__store?.getState().openTaskPage())
    await expect
      .poll(async () => getStoreState<string>(orcaPage, 'activeView'), { timeout: 5_000 })
      .toBe('tasks')

    const beadsTabCount = await orcaPage
      .locator(
        '[data-contextual-tour-target="tasks-source-filters"] button[data-task-source="beads"]'
      )
      .count()
    expect(beadsTabCount).toBe(0)
  })
})

test.describe('Beads task provider — bd available', () => {
  test.skip(!bdAvailable, 'bd is not installed; skipping the live beads flow')

  test('surfaces run-bd-init guidance for a repo with no beads store', async ({ orcaPage }) => {
    await waitForSessionReady(orcaPage)
    const repoId = await addProject(orcaPage, initGitRepo())
    await openBeadsTasks(orcaPage, repoId)

    await expect(orcaPage.locator('[data-beads-state="repo-not-initialized"]')).toBeVisible({
      timeout: 15_000
    })
    await expect(orcaPage.getByText(/Run `?bd init`? in this repository/i)).toBeVisible()
  })

  test('lists seeded issues and starts work from one', async ({ orcaPage }) => {
    await waitForSessionReady(orcaPage)
    const { repoPath, seededTitles } = provisionBeadsRepo()
    const repoId = await addProject(orcaPage, repoPath)
    await openBeadsTasks(orcaPage, repoId)

    // The seeded rows render (each carries the bead id in data-beads-row).
    const firstRow = orcaPage.locator('[data-beads-row]').first()
    await expect(firstRow).toBeVisible({ timeout: 20_000 })
    await expect(orcaPage.getByText(seededTitles[0])).toBeVisible()

    const beadId = (await firstRow.getAttribute('data-beads-row')) ?? ''
    expect(beadId).not.toBe('')

    // Open the issue and start work from it.
    await firstRow.click()
    const startWork = orcaPage.getByRole('button', { name: 'Start work' })
    await expect(startWork).toBeVisible({ timeout: 10_000 })
    await startWork.click()

    // The New Workspace composer opens pre-filled with a beads-linked task
    // whose identifier is the bead id (url '' — beads has no hosted page).
    // openModal stashes the payload in modalData, keyed by activeModal.
    await expect
      .poll(
        async () =>
          orcaPage.evaluate(() => {
            const state = window.__store?.getState()
            const linked = state?.modalData?.linkedWorkItem as
              | { provider?: string; beadsIdentifier?: string }
              | undefined
            if (state?.activeModal !== 'new-workspace-composer' || !linked) {
              return null
            }
            return { provider: linked.provider, id: linked.beadsIdentifier }
          }),
        { timeout: 10_000, message: 'start work did not open a beads-linked workspace composer' }
      )
      .toEqual({ provider: 'beads', id: beadId })

    // User-observable: the composer name field is seeded from the bead id.
    await expect
      .poll(
        async () => {
          const values = await orcaPage
            .locator('input[type="text"], input:not([type])')
            .evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value))
          return values.some((value) => value.includes(beadId))
        },
        { timeout: 10_000, message: 'composer name field was not seeded from the bead id' }
      )
      .toBe(true)
  })

  test('creates and closes an issue through the dialog', async ({ orcaPage }) => {
    await waitForSessionReady(orcaPage)
    const { repoPath } = provisionBeadsRepo()
    const repoId = await addProject(orcaPage, repoPath)
    await openBeadsTasks(orcaPage, repoId)
    await expect(orcaPage.locator('[data-beads-row]').first()).toBeVisible({ timeout: 20_000 })

    // Create a new issue via the dialog.
    const newTitle = 'E2E created issue'
    await orcaPage.getByRole('button', { name: 'New issue' }).click()
    const createDialog = orcaPage.getByRole('dialog', { name: /New Beads issue/i })
    await expect(createDialog).toBeVisible()
    await createDialog.getByLabel('Title', { exact: true }).fill(newTitle)
    await createDialog.getByRole('button', { name: 'Create issue' }).click()
    await expect(createDialog).toBeHidden()
    await expect(orcaPage.getByText(newTitle)).toBeVisible({ timeout: 15_000 })

    // Open it and close it — "Close issue" opens the reason panel, whose confirm
    // shares the label; clicking it again commits the close.
    await orcaPage.getByText(newTitle).click()
    await orcaPage.getByRole('button', { name: 'Close issue' }).click()
    await orcaPage.getByRole('button', { name: 'Close issue' }).click()
    // The reopen affordance only appears once the issue is closed.
    await expect(orcaPage.getByRole('button', { name: 'Reopen' })).toBeVisible({ timeout: 15_000 })
  })
})
