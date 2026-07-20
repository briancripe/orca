import { describe, expect, it } from 'vitest'
import { getLinkedWorkItemProvider } from './new-workspace'

describe('getLinkedWorkItemProvider', () => {
  it.each([
    [
      'explicit provider metadata',
      {
        type: 'issue',
        provider: 'jira',
        number: 0,
        title: 'ORCA-123 Fix Jira',
        url: 'https://example.atlassian.net/browse/ORCA-123',
        jiraIdentifier: 'ORCA-123'
      },
      'jira'
    ],
    [
      'Jira issue URL with no numeric issue id',
      {
        type: 'issue',
        number: 0,
        title: 'ORCA-123 Fix Jira',
        url: 'https://example.atlassian.net/browse/ORCA-123'
      },
      'jira'
    ],
    [
      'legacy Linear linked issue',
      {
        type: 'issue',
        number: 0,
        title: 'Fix Linear',
        url: 'https://linear.app/team/issue/ENG-123/fix-linear',
        linearIdentifier: 'ENG-123'
      },
      'linear'
    ],
    [
      'explicit beads provider metadata',
      {
        type: 'issue',
        provider: 'beads',
        number: 0,
        title: 'Add Beads provider',
        url: '',
        beadsIdentifier: 'orca-0cc.16'
      },
      'beads'
    ],
    [
      'beads inferred from identifier only',
      {
        type: 'issue',
        number: 0,
        title: 'Add Beads provider',
        url: '',
        beadsIdentifier: 'orca-42'
      },
      'beads'
    ]
  ] as const)('detects %s', (_label, item, provider) => {
    expect(getLinkedWorkItemProvider(item)).toBe(provider)
  })

  it('does not fall through to the legacy Linear sentinel when a beads identifier is set', () => {
    // Why: a beads item carries number 0 and an empty url, which would otherwise
    // match the `number === 0 && !github.com` → linear heuristic.
    expect(
      getLinkedWorkItemProvider({
        type: 'issue',
        number: 0,
        title: 'Add Beads provider',
        url: '',
        beadsIdentifier: 'orca-42'
      })
    ).not.toBe('linear')
  })
})
