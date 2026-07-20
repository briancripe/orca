import type {
  BeadsComment,
  BeadsDependency,
  BeadsDependencyType,
  BeadsIssueInfo,
  BeadsIssuePriority,
  BeadsIssueStatus,
  BeadsWorkItem
} from '../../shared/beads-types'

// Why: bd's enum sets grow over time (new statuses, new dependency edge
// kinds for internal agent wiring); anything outside these closed sets is
// treated as unrecognized rather than trusted verbatim, so a newer bd
// binary can't hand the renderer a value it has no case for.
const KNOWN_STATUSES = new Set<BeadsIssueStatus>([
  'open',
  'in_progress',
  'blocked',
  'deferred',
  'closed',
  'pinned',
  'hooked'
])

const KNOWN_DEPENDENCY_TYPES = new Set<BeadsDependencyType>([
  'blocks',
  'parent-child',
  'related',
  'discovered-from',
  'relates-to',
  'duplicates',
  'supersedes'
])

const FALLBACK_STATUS: BeadsIssueStatus = 'open'
const FALLBACK_ISSUE_TYPE = 'task'
const FALLBACK_PRIORITY: BeadsIssuePriority = 2
const MIN_PRIORITY = 0
const MAX_PRIORITY = 4

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
}

// Why: builds `{ [key]: value }` only when value is present, so optional
// BeadsIssueInfo fields are omitted rather than set to `undefined` — mirrors
// the spread-conditional pattern gitlab/mappers.ts uses for the same reason
// (callers can tell "absent" from "blank").
function optional<K extends string>(key: K, value: string | undefined): Partial<Record<K, string>> {
  return value === undefined ? {} : ({ [key]: value } as Partial<Record<K, string>>)
}

function mapStatus(value: unknown): BeadsIssueStatus {
  return typeof value === 'string' && KNOWN_STATUSES.has(value as BeadsIssueStatus)
    ? (value as BeadsIssueStatus)
    : FALLBACK_STATUS
}

// Why: BeadsIssueInfo.issueType is deliberately typed `string` (see
// beads-types.ts) because bd's issue_type vocabulary is open-ended — any
// non-empty string is valid. Only a missing/non-string value needs a
// fallback here.
function mapIssueType(value: unknown): string {
  return typeof value === 'string' && value.length > 0 ? value : FALLBACK_ISSUE_TYPE
}

function mapPriority(value: unknown): BeadsIssuePriority {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) {
    return FALLBACK_PRIORITY
  }
  return Math.min(MAX_PRIORITY, Math.max(MIN_PRIORITY, Math.round(n))) as BeadsIssuePriority
}

// Why: exported so issues.ts can map `bd comment --json`'s flat single-object
// response (same snake_case shape as a nested `bd show` comment) without a
// second, duplicate parser.
export function mapComment(raw: unknown): BeadsComment | null {
  if (!isRecord(raw)) {
    return null
  }
  const id = asString(raw.id)
  const issueId = asString(raw.issue_id)
  const author = asString(raw.author)
  const text = asString(raw.text)
  const createdAt = asString(raw.created_at)
  if (!id || !issueId || !author || text === undefined || !createdAt) {
    return null
  }
  return { id, issueId, author, text, createdAt }
}

// Why: `bd list`/`create`/`update` emit dependencies as flat edges
// (issue_id/depends_on_id/type); `bd show` nests the full target issue with
// a `dependency_type` field instead. Accept both shapes here so callers
// don't need to know which command produced the payload.
function mapDependency(parentIssueId: string, raw: unknown): BeadsDependency | null {
  if (!isRecord(raw)) {
    return null
  }
  const type = asString(raw.dependency_type) ?? asString(raw.type)
  if (!type || !KNOWN_DEPENDENCY_TYPES.has(type as BeadsDependencyType)) {
    return null
  }
  const dependsOnId = asString(raw.depends_on_id) ?? asString(raw.id)
  if (!dependsOnId) {
    return null
  }
  return {
    issueId: asString(raw.issue_id) ?? parentIssueId,
    dependsOnId,
    type: type as BeadsDependencyType
  }
}

// Why: never throws on garbage — an unrecognized shape (or non-object) just
// means "not a bead", so the caller can classify it via classifyBdError
// instead of crashing the IPC round-trip.
export function mapBdIssue(raw: unknown): BeadsIssueInfo | null {
  if (!isRecord(raw)) {
    return null
  }
  const id = asString(raw.id)
  const title = asString(raw.title)
  if (!id || !title) {
    return null
  }

  const dependencies = Array.isArray(raw.dependencies)
    ? raw.dependencies
        .map((dep) => mapDependency(id, dep))
        .filter((dep): dep is BeadsDependency => dep !== null)
    : []

  const comments = Array.isArray(raw.comments)
    ? raw.comments.map(mapComment).filter((c): c is BeadsComment => c !== null)
    : undefined

  return {
    id,
    title,
    ...optional('description', asString(raw.description)),
    ...optional('design', asString(raw.design)),
    ...optional('acceptanceCriteria', asString(raw.acceptance_criteria)),
    ...optional('notes', asString(raw.notes)),
    status: mapStatus(raw.status),
    priority: mapPriority(raw.priority),
    issueType: mapIssueType(raw.issue_type),
    ...optional('assignee', asString(raw.assignee)),
    ...optional('owner', asString(raw.owner)),
    labels: asStringArray(raw.labels),
    dependencies,
    ...(comments ? { comments } : {}),
    createdAt: asString(raw.created_at) ?? '',
    updatedAt: asString(raw.updated_at) ?? '',
    ...optional('closedAt', asString(raw.closed_at)),
    ...optional('closeReason', asString(raw.close_reason)),
    ...optional('externalRef', asString(raw.external_ref))
  }
}

// Why: bd's per-issue JSON has no repo concept (it's a single local db) — the
// caller stamps repoId once the fetch resolves, mirroring how repoId is
// stamped onto GitLabWorkItem (see the repoId doc comment on BeadsWorkItem
// in beads-types.ts).
export function mapBdListItem(raw: unknown): BeadsWorkItem | null {
  if (!isRecord(raw)) {
    return null
  }
  const id = asString(raw.id)
  const title = asString(raw.title)
  if (!id || !title) {
    return null
  }
  return {
    id,
    title,
    status: mapStatus(raw.status),
    priority: mapPriority(raw.priority),
    issueType: mapIssueType(raw.issue_type),
    labels: asStringArray(raw.labels),
    ...optional('assignee', asString(raw.assignee)),
    updatedAt: asString(raw.updated_at) ?? '',
    repoId: ''
  }
}

// Why: `bd list --json` and `bd show --json` both emit a top-level JSON
// array (show wraps even a single result — see beads-types.ts). Callers that
// want "the one issue from `bd show`" take element 0 of this array; an empty
// array (no match) or a parse failure both collapse to `[]` rather than
// throwing, per the epic's defensive-mapping rule.
export function parseBdIssueArray(stdout: string): BeadsIssueInfo[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(stdout)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) {
    return []
  }
  return parsed.map(mapBdIssue).filter((issue): issue is BeadsIssueInfo => issue !== null)
}
