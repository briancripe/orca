#!/usr/bin/env sh
# Rebuild the personal `local-beadhive` integration branch from fresh main + active topics.
#
# This branch is a disposable BUILD ARTIFACT: never develop on it. All real work lives on
# feat/* topic branches (contributed upstream) or on local-build-tools (local-only).
#
# Run it from the git object, NOT as a checked-out file, so the working-tree reset below
# can't yank the script out from under a running process:
#
#     git show local-build-tools:rebuild-beadhive.sh | sh
#
# Prereq: click "Sync fork" on GitHub first so origin/main is at upstream HEAD.
set -eu

# Single source of truth for what gets stacked. local-build-tools carries this script plus any
# local-only build patches you don't intend to PR. Drop a feat/* branch here once its PR merges
# upstream (its commits then arrive via main) or is rejected.
ACTIVE="local-build-tools feat/cli-repo-group-management feat/beads-task-source"

git fetch origin
git switch -C local-beadhive origin/main   # reset integration branch to fresh main
for b in $ACTIVE; do
  echo ">>> merging $b"
  git merge --no-ff --no-edit "$b"         # sequential so conflicts resolve per-branch; rerere replays
done
echo ">>> local-beadhive rebuilt on $(git rev-parse --short origin/main) with: $ACTIVE"
