import { describe, expect, it } from 'vitest'

import {
  bdListJson,
  bdShowClosedIssueJson,
  bdShowEmptyJson,
  bdShowNotFoundJson,
  bdShowParentChildJson,
  bdShowWithCommentsJson,
  bdShowWithDependenciesJson
} from './bd-json-fixtures'
import { mapBdIssue, mapBdListItem, parseBdIssueArray } from './mappers'

describe('parseBdIssueArray', () => {
  it('maps every row from `bd list --json` output', () => {
    const issues = parseBdIssueArray(bdListJson)

    expect(issues).toHaveLength(3)
    expect(issues.map((i) => i.id)).toEqual([
      'bd-fixture-sandbox-vr8',
      'bd-fixture-sandbox-zk3',
      'bd-fixture-sandbox-ccl'
    ])
  })

  it('unwraps `bd show` single-issue array to one mapped issue', () => {
    const issues = parseBdIssueArray(bdShowWithCommentsJson)

    expect(issues).toHaveLength(1)
    expect(issues[0]?.id).toBe('bd-fixture-sandbox-zk3')
  })

  it('tolerates an empty array (no match) by returning []', () => {
    expect(parseBdIssueArray(bdShowEmptyJson)).toEqual([])
  })

  it('returns [] for a non-array JSON payload (bd show error object)', () => {
    expect(parseBdIssueArray(bdShowNotFoundJson)).toEqual([])
  })

  it('returns [] for unparseable stdout instead of throwing', () => {
    expect(parseBdIssueArray('not json{{{')).toEqual([])
  })
})

describe('mapBdIssue', () => {
  it('round-trips every snake_case field on a fully-populated closed issue', () => {
    const [raw] = JSON.parse(bdShowClosedIssueJson) as unknown[]

    const issue = mapBdIssue(raw)

    expect(issue).toEqual({
      id: 'bd-fixture-sandbox-sci',
      title: 'Fourth issue',
      design: 'Some design notes',
      acceptanceCriteria: 'Some acceptance criteria',
      notes: 'Some notes',
      status: 'closed',
      priority: 3,
      issueType: 'chore',
      assignee: 'brian@xenophon.dev',
      owner: 'brian@xenophon.dev',
      labels: [],
      dependencies: [],
      createdAt: '2026-07-10T20:08:48Z',
      updatedAt: '2026-07-10T20:08:48Z',
      closedAt: '2026-07-10T20:08:48Z',
      closeReason: 'Fixed in commit abc',
      externalRef: 'gh-42'
    })
  })

  it('maps show output with comments (labels, blocks dependency, comment thread)', () => {
    const [raw] = JSON.parse(bdShowWithCommentsJson) as unknown[]

    const issue = mapBdIssue(raw)

    expect(issue?.labels).toEqual(['backend', 'urgent'])
    expect(issue?.dependencies).toEqual([
      { issueId: 'bd-fixture-sandbox-zk3', dependsOnId: 'bd-fixture-sandbox-ccl', type: 'blocks' }
    ])
    expect(issue?.comments).toEqual([
      {
        id: '019f4da5-1931-720b-b21a-6e3063ce90af',
        issueId: 'bd-fixture-sandbox-zk3',
        author: 'Brian Cripe',
        text: 'This is a comment',
        createdAt: '2026-07-10T20:08:13Z'
      }
    ])
  })

  it('maps show output with dependencies: blocks + discovered-from, dropping the agent-internal waits-for edge', () => {
    const [raw] = JSON.parse(bdShowWithDependenciesJson) as unknown[]

    const issue = mapBdIssue(raw)

    expect(issue?.dependencies).toEqual([
      { issueId: 'bd-fixture-sandbox-zk3', dependsOnId: 'bd-fixture-sandbox-ccl', type: 'blocks' }
    ])
    // waits-for is not in the surfaced dependency vocabulary — it must be
    // filtered out, not throw and not pass through unmapped.
    expect(issue?.dependencies.some((d) => d.dependsOnId === 'bd-fixture-sandbox-sci')).toBe(false)
  })

  it('maps show output with a parent-child dependency and the parent field', () => {
    const [raw] = JSON.parse(bdShowParentChildJson) as unknown[]

    const issue = mapBdIssue(raw)

    expect(issue?.dependencies).toEqual([
      {
        issueId: 'bd-fixture-sandbox-vr8',
        dependsOnId: 'bd-fixture-sandbox-zk3',
        type: 'parent-child'
      }
    ])
  })

  it('falls back to a safe status for an unrecognized status value instead of throwing', () => {
    const issue = mapBdIssue({ id: 'bd-1', title: 'x', status: 'some-future-status' })

    expect(issue?.status).toBe('open')
  })

  it('falls back to a safe issue type when issue_type is missing', () => {
    const issue = mapBdIssue({ id: 'bd-1', title: 'x' })

    expect(issue?.issueType).toBe('task')
  })

  it.each([
    [-3, 0],
    [0, 0],
    [4, 4],
    [9, 4],
    ['not-a-number', 2]
  ])('clamps priority %j to %j', (input, expected) => {
    const issue = mapBdIssue({ id: 'bd-1', title: 'x', priority: input })

    expect(issue?.priority).toBe(expected)
  })

  it('drops an unrecognized dependency type without throwing', () => {
    const issue = mapBdIssue({
      id: 'bd-1',
      title: 'x',
      dependencies: [{ issue_id: 'bd-1', depends_on_id: 'bd-2', type: 'some-agent-internal-edge' }]
    })

    expect(issue?.dependencies).toEqual([])
  })

  it('returns null for garbage input (non-object, null, missing id/title)', () => {
    expect(mapBdIssue(null)).toBeNull()
    expect(mapBdIssue(undefined)).toBeNull()
    expect(mapBdIssue('a string')).toBeNull()
    expect(mapBdIssue(42)).toBeNull()
    expect(mapBdIssue([])).toBeNull()
    expect(mapBdIssue({ title: 'no id' })).toBeNull()
    expect(mapBdIssue({ id: 'bd-1' })).toBeNull()
  })
})

describe('mapBdListItem', () => {
  it('maps a `bd list --json` row to the lean BeadsWorkItem shape', () => {
    const [, zk3] = JSON.parse(bdListJson) as unknown[]

    const item = mapBdListItem(zk3)

    expect(item).toEqual({
      id: 'bd-fixture-sandbox-zk3',
      title: 'First issue',
      status: 'open',
      priority: 1,
      issueType: 'bug',
      labels: ['backend', 'urgent'],
      updatedAt: '2026-07-10T20:07:54Z',
      repoId: ''
    })
  })

  it('falls back to safe status/type and returns null for garbage input', () => {
    expect(
      mapBdListItem({ id: 'bd-1', title: 'x', status: 'unknown-status', issue_type: 42 })
    ).toEqual({
      id: 'bd-1',
      title: 'x',
      status: 'open',
      priority: 2,
      issueType: 'task',
      labels: [],
      updatedAt: '',
      repoId: ''
    })
    expect(mapBdListItem(null)).toBeNull()
    expect(mapBdListItem({})).toBeNull()
  })
})
