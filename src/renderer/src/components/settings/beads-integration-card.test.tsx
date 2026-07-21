// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getExecutionHostLabel } from '../../../../shared/execution-host'
import { BeadsIntegrationCard } from './beads-integration-card'

const LOCAL_HOST_LABEL = getExecutionHostLabel('local')

type StoreState = {
  settings: { activeRuntimeEnvironmentId: string | null }
  openSettingsPage: () => void
  openSettingsTarget: (target: { pane: string; repoId: string | null }) => void
}

const mocks = vi.hoisted(() => ({
  store: { current: null as StoreState | null },
  preflight: {
    statuses: { beadsStatus: 'checking' as 'checking' | 'connected' | 'not-installed' },
    unavailable: false,
    refresh: vi.fn()
  }
}))

vi.mock('@/store', () => ({
  useAppStore: (selector: (state: StoreState) => unknown) => {
    if (!mocks.store.current) {
      throw new Error('Store state was not installed')
    }
    return selector(mocks.store.current)
  }
}))

vi.mock('./source-control-preflight-card-status', () => ({
  usePreflightCardStatuses: () => mocks.preflight
}))

let root: Root | null = null
let container: HTMLDivElement | null = null

function setShellApi(): { openUrl: ReturnType<typeof vi.fn> } {
  const shell = { openUrl: vi.fn().mockResolvedValue(undefined) }
  ;(window as unknown as { api: { shell: typeof shell } }).api = { shell }
  return shell
}

async function renderCard(): Promise<HTMLDivElement> {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(<BeadsIntegrationCard />)
  })
  return container
}

describe('BeadsIntegrationCard', () => {
  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount()
      })
    }
    root = null
    container?.remove()
    container = null
    mocks.store.current = null
    mocks.preflight.statuses.beadsStatus = 'checking'
    mocks.preflight.unavailable = false
    mocks.preflight.refresh.mockClear()
  })

  it('shows a checking state before preflight status arrives', async () => {
    mocks.store.current = {
      settings: { activeRuntimeEnvironmentId: null },
      openSettingsPage: vi.fn(),
      openSettingsTarget: vi.fn()
    }
    mocks.preflight.statuses.beadsStatus = 'checking'
    setShellApi()

    const rendered = await renderCard()

    expect(rendered.textContent).toContain('Beads')
    expect(rendered.textContent).not.toContain('Connected')
    expect(rendered.textContent).not.toContain('Not installed')
  })

  it('shows connected with local host scope when bd is installed', async () => {
    mocks.store.current = {
      settings: { activeRuntimeEnvironmentId: null },
      openSettingsPage: vi.fn(),
      openSettingsTarget: vi.fn()
    }
    mocks.preflight.statuses.beadsStatus = 'connected'
    setShellApi()

    const rendered = await renderCard()

    expect(rendered.textContent).toContain('Connected')
    expect(rendered.textContent).toContain(`Host scope: ${LOCAL_HOST_LABEL}`)
    expect(rendered.textContent).toContain(
      'bd runs on this desktop client. Use Settings > Remote Orca Servers > Advanced to edit server-owned hosts.'
    )
  })

  it('shows install guidance and opens the Beads repo when bd is not installed', async () => {
    mocks.store.current = {
      settings: { activeRuntimeEnvironmentId: 'runtime-1' },
      openSettingsPage: vi.fn(),
      openSettingsTarget: vi.fn()
    }
    mocks.preflight.statuses.beadsStatus = 'not-installed'
    const shell = setShellApi()

    const rendered = await renderCard()

    expect(rendered.textContent).toContain('Not installed')
    expect(rendered.textContent).toContain('Host scope: Remote server: runtime-1')
    expect(rendered.textContent).toContain(
      'Install Beads (bd) to browse and start work from its issues.'
    )

    await act(async () => {
      Array.from(rendered.querySelectorAll('button'))
        .find((button) => button.textContent?.includes('Install Beads'))
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(shell.openUrl).toHaveBeenCalledWith('https://github.com/gastownhall/beads')

    await act(async () => {
      Array.from(rendered.querySelectorAll('button'))
        .find((button) => button.textContent === 'Re-check')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(mocks.preflight.refresh).toHaveBeenCalledTimes(1)
  })

  it('shows unavailable guidance when preflight status cannot be read', async () => {
    mocks.store.current = {
      settings: { activeRuntimeEnvironmentId: null },
      openSettingsPage: vi.fn(),
      openSettingsTarget: vi.fn()
    }
    mocks.preflight.unavailable = true
    setShellApi()

    const rendered = await renderCard()

    expect(rendered.textContent).toContain('Unavailable')
    expect(rendered.textContent).toContain('Beads status is not available in this runtime yet.')
  })
})
