// Why: verbatim `bd --json` stdout samples captured against a real bd v1.1.0
// (Homebrew) sandbox repo, not hand-typed guesses — mappers.test.ts asserts
// against bd's actual snake_case field names and array-wrapping quirks.

/** `bd list --json` — full-shaped rows (not the lean list-view shape), one
 *  per issue, with raw dependency EDGES (`issue_id`/`depends_on_id`/`type`)
 *  rather than the embedded-issue shape `bd show` uses. */
export const bdListJson = `[
  {
    "id": "bd-fixture-sandbox-vr8",
    "title": "Third issue",
    "status": "in_progress",
    "priority": 0,
    "issue_type": "task",
    "owner": "brian@xenophon.dev",
    "created_at": "2026-07-10T20:07:55Z",
    "created_by": "Brian Cripe",
    "updated_at": "2026-07-10T20:08:14Z",
    "started_at": "2026-07-10T20:08:14Z",
    "dependencies": [
      {
        "issue_id": "bd-fixture-sandbox-vr8",
        "depends_on_id": "bd-fixture-sandbox-zk3",
        "type": "parent-child",
        "created_at": "2026-07-10T13:08:01Z",
        "created_by": "Brian Cripe",
        "metadata": "{}"
      }
    ],
    "dependency_count": 0,
    "dependent_count": 0,
    "comment_count": 0,
    "parent": "bd-fixture-sandbox-zk3"
  },
  {
    "id": "bd-fixture-sandbox-zk3",
    "title": "First issue",
    "description": "Some description",
    "status": "open",
    "priority": 1,
    "issue_type": "bug",
    "owner": "brian@xenophon.dev",
    "created_at": "2026-07-10T20:07:54Z",
    "created_by": "Brian Cripe",
    "updated_at": "2026-07-10T20:07:54Z",
    "labels": ["backend", "urgent"],
    "dependencies": [
      {
        "issue_id": "bd-fixture-sandbox-zk3",
        "depends_on_id": "bd-fixture-sandbox-ccl",
        "type": "blocks",
        "created_at": "2026-07-10T13:08:01Z",
        "created_by": "Brian Cripe",
        "metadata": "{}"
      }
    ],
    "dependency_count": 1,
    "dependent_count": 0,
    "comment_count": 1
  },
  {
    "id": "bd-fixture-sandbox-ccl",
    "title": "Second issue",
    "status": "open",
    "priority": 2,
    "issue_type": "feature",
    "owner": "brian@xenophon.dev",
    "created_at": "2026-07-10T20:07:55Z",
    "created_by": "Brian Cripe",
    "updated_at": "2026-07-10T20:07:55Z",
    "dependencies": [
      {
        "issue_id": "bd-fixture-sandbox-ccl",
        "depends_on_id": "bd-fixture-sandbox-vr8",
        "type": "discovered-from",
        "created_at": "2026-07-10T13:08:02Z",
        "created_by": "Brian Cripe",
        "metadata": "{}"
      }
    ],
    "dependency_count": 0,
    "dependent_count": 1,
    "comment_count": 0
  }
]`

/** `bd show <id> --json` (default, no `--include-comments`) — a single-issue
 *  ARRAY. Dependencies nest the full target issue plus a `dependency_type`
 *  field, unlike `bd list`'s flat edges. */
export const bdShowWithDependenciesJson = `[
  {
    "id": "bd-fixture-sandbox-zk3",
    "title": "First issue",
    "description": "Some description",
    "status": "open",
    "priority": 1,
    "issue_type": "bug",
    "owner": "brian@xenophon.dev",
    "created_at": "2026-07-10T20:07:54Z",
    "created_by": "Brian Cripe",
    "updated_at": "2026-07-10T20:07:54Z",
    "labels": ["backend", "urgent"],
    "dependencies": [
      {
        "id": "bd-fixture-sandbox-ccl",
        "title": "Second issue",
        "status": "open",
        "priority": 2,
        "issue_type": "feature",
        "owner": "brian@xenophon.dev",
        "created_at": "2026-07-10T20:07:55Z",
        "created_by": "Brian Cripe",
        "updated_at": "2026-07-10T20:07:55Z",
        "dependency_type": "blocks"
      },
      {
        "id": "bd-fixture-sandbox-sci",
        "title": "Fourth issue",
        "design": "Some design notes",
        "acceptance_criteria": "Some acceptance criteria",
        "notes": "Some notes",
        "status": "closed",
        "priority": 3,
        "issue_type": "chore",
        "assignee": "brian@xenophon.dev",
        "owner": "brian@xenophon.dev",
        "created_at": "2026-07-10T20:08:48Z",
        "created_by": "Brian Cripe",
        "updated_at": "2026-07-10T20:08:48Z",
        "closed_at": "2026-07-10T20:08:48Z",
        "close_reason": "Fixed in commit abc",
        "external_ref": "gh-42",
        "dependency_type": "waits-for"
      }
    ],
    "dependent_count": 1,
    "dependency_count": 2,
    "comment_count": 1
  }
]`

/** `bd show <id> --json` for the child leg of the parent-child edge above —
 *  covers the `parent-child` dependency type + the `parent` field. */
export const bdShowParentChildJson = `[
  {
    "id": "bd-fixture-sandbox-vr8",
    "title": "Third issue",
    "status": "in_progress",
    "priority": 0,
    "issue_type": "task",
    "owner": "brian@xenophon.dev",
    "created_at": "2026-07-10T20:07:55Z",
    "created_by": "Brian Cripe",
    "updated_at": "2026-07-10T20:08:14Z",
    "started_at": "2026-07-10T20:08:14Z",
    "dependencies": [
      {
        "id": "bd-fixture-sandbox-zk3",
        "title": "First issue",
        "description": "Some description",
        "status": "open",
        "priority": 1,
        "issue_type": "bug",
        "owner": "brian@xenophon.dev",
        "created_at": "2026-07-10T20:07:54Z",
        "created_by": "Brian Cripe",
        "updated_at": "2026-07-10T20:07:54Z",
        "labels": ["backend", "urgent"],
        "dependency_type": "parent-child"
      }
    ],
    "parent": "bd-fixture-sandbox-zk3",
    "dependent_count": 1,
    "dependency_count": 1,
    "comment_count": 0
  }
]`

/** `bd show <id> --include-comments --json` — every snake_case field in the
 *  v1.1.0 issue struct populated at once (comments, labels, deps, dates). */
export const bdShowWithCommentsJson = `[
  {
    "id": "bd-fixture-sandbox-zk3",
    "title": "First issue",
    "description": "Some description",
    "status": "open",
    "priority": 1,
    "issue_type": "bug",
    "owner": "brian@xenophon.dev",
    "created_at": "2026-07-10T20:07:54Z",
    "created_by": "Brian Cripe",
    "updated_at": "2026-07-10T20:07:54Z",
    "labels": ["backend", "urgent"],
    "dependencies": [
      {
        "id": "bd-fixture-sandbox-ccl",
        "title": "Second issue",
        "status": "open",
        "priority": 2,
        "issue_type": "feature",
        "owner": "brian@xenophon.dev",
        "created_at": "2026-07-10T20:07:55Z",
        "created_by": "Brian Cripe",
        "updated_at": "2026-07-10T20:07:55Z",
        "dependency_type": "blocks"
      }
    ],
    "comments": [
      {
        "id": "019f4da5-1931-720b-b21a-6e3063ce90af",
        "issue_id": "bd-fixture-sandbox-zk3",
        "author": "Brian Cripe",
        "text": "This is a comment",
        "created_at": "2026-07-10T20:08:13Z"
      }
    ],
    "dependent_count": 1,
    "dependency_count": 1,
    "comment_count": 1
  }
]`

/** `bd show <closed-id> --json` — a fully closed/populated issue: every
 *  optional string field (design, acceptance_criteria, notes, assignee,
 *  closed_at, close_reason, external_ref) is present, and it has zero
 *  dependencies/comments (both counted fields omit the arrays entirely). */
export const bdShowClosedIssueJson = `[
  {
    "id": "bd-fixture-sandbox-sci",
    "title": "Fourth issue",
    "design": "Some design notes",
    "acceptance_criteria": "Some acceptance criteria",
    "notes": "Some notes",
    "status": "closed",
    "priority": 3,
    "issue_type": "chore",
    "assignee": "brian@xenophon.dev",
    "owner": "brian@xenophon.dev",
    "created_at": "2026-07-10T20:08:48Z",
    "created_by": "Brian Cripe",
    "updated_at": "2026-07-10T20:08:48Z",
    "closed_at": "2026-07-10T20:08:48Z",
    "close_reason": "Fixed in commit abc",
    "external_ref": "gh-42",
    "dependent_count": 0,
    "dependency_count": 0,
    "comment_count": 0
  }
]`

/** `bd show <missing-id> --json` — exit code 1, but stdout is still valid
 *  JSON: an error object, not an array. */
export const bdShowNotFoundJson = `{
  "error": "no issues found matching the provided IDs",
  "schema_version": 1
}`

/** `bd show <id> --json` when the id resolves to nothing — bd itself never
 *  emits `[]` for a single missing id (see bdShowNotFoundJson above), but
 *  batch `bd show <id1> <id2>` calls can filter down to nothing server-side.
 *  Kept as its own fixture so the empty-array path is covered explicitly. */
export const bdShowEmptyJson = `[]`
