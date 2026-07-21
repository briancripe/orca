import { ExternalLink, Waypoints } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/store'
import { IntegrationCardDetails, IntegrationCardShell } from './integration-card-shell'
import { useIntegrationSubordinateRowClass } from './integration-card-presentation'
import { getBeadsHostScope } from './provider-account-scope'
import { ProviderHostScopeControl } from './ProviderHostScopeControl'
import { usePreflightCardStatuses } from './source-control-preflight-card-status'
import { translate } from '@/i18n/i18n'

// Why: the repo is the install entry point bd has no hosted landing page yet.
const BEADS_REPO_URL = 'https://github.com/gastownhall/beads'

export function BeadsIntegrationCard(): React.JSX.Element {
  const { statuses, unavailable, refresh } = usePreflightCardStatuses('beads')
  const status = unavailable ? 'unavailable' : statuses.beadsStatus
  const connected = status === 'connected'
  const settings = useAppStore((s) => s.settings)
  const hostScope = getBeadsHostScope(settings)
  const subordinateRowClass = useIntegrationSubordinateRowClass('text-xs')

  return (
    <IntegrationCardShell
      icon={<Waypoints className="size-5" />}
      name="Beads"
      description={
        <>
          {translate(
            'auto.components.settings.beads.integration.card.description_prefix',
            'Browse and start work from'
          )}{' '}
          <span className="font-mono text-[11px]">
            {translate('auto.components.settings.beads.integration.card.bd', 'bd')}
          </span>{' '}
          {translate(
            'auto.components.settings.beads.integration.card.description_suffix',
            'issues via the local CLI.'
          )}
        </>
      }
      checking={status === 'checking'}
      statusTone={connected ? 'connected' : 'attention'}
      statusLabel={
        connected
          ? translate('auto.components.settings.beads.integration.card.connected', 'Connected')
          : status === 'unavailable'
            ? translate(
                'auto.components.settings.beads.integration.card.unavailable',
                'Unavailable'
              )
            : translate(
                'auto.components.settings.beads.integration.card.not_installed',
                'Not installed'
              )
      }
    >
      <IntegrationCardDetails>
        <ProviderHostScopeControl
          labelPrefix={translate(
            'auto.components.settings.beads.integration.card.host_scope_prefix',
            'Host scope'
          )}
          scope={hostScope}
          className={subordinateRowClass}
        />
        {status !== 'checking' && !connected ? (
          status === 'unavailable' ? (
            <>
              <p className="text-xs text-muted-foreground">
                {translate(
                  'auto.components.settings.beads.integration.card.unavailable_copy',
                  'Beads status is not available in this runtime yet.'
                )}
              </p>
              <Button variant="ghost" size="sm" onClick={refresh}>
                {translate('auto.components.settings.beads.integration.card.recheck', 'Re-check')}
              </Button>
            </>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                {translate(
                  'auto.components.settings.beads.integration.card.not_installed_copy',
                  'Install Beads (bd) to browse and start work from its issues.'
                )}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.api.shell.openUrl(BEADS_REPO_URL)}
                >
                  <ExternalLink className="size-3.5 mr-1.5" />
                  {translate(
                    'auto.components.settings.beads.integration.card.install',
                    'Install Beads'
                  )}
                </Button>
                <Button variant="ghost" size="sm" onClick={refresh}>
                  {translate('auto.components.settings.beads.integration.card.recheck', 'Re-check')}
                </Button>
              </div>
            </>
          )
        ) : null}
      </IntegrationCardDetails>
    </IntegrationCardShell>
  )
}
