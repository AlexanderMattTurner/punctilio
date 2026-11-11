#!/usr/bin/env bash
# Locate the open security rollup PR (if any) by label, check out its branch,
# and merge the default branch into it. Writes outputs consumed by the
# security-vulnerability-scan workflow.
#
# Inputs (env):
#   GH_TOKEN          GitHub token for `gh`
#   DEFAULT_BRANCH    Repository default branch (e.g. "main")
#   GITHUB_OUTPUT     Path to GitHub Actions output file (optional)

set -euo pipefail

: "${GH_TOKEN:?GH_TOKEN must be set}"
: "${DEFAULT_BRANCH:?DEFAULT_BRANCH must be set}"
GITHUB_OUTPUT="${GITHUB_OUTPUT:-/dev/null}"

EXISTING_BRANCH=$(gh pr list --label "security-scan" --state open \
  --json headRefName --jq '.[0].headRefName // empty')

if [[ -n "$EXISTING_BRANCH" ]]; then
  echo "Found existing security PR branch: $EXISTING_BRANCH"
  timeout --kill-after=10 60 git fetch origin "$EXISTING_BRANCH"
  git checkout "$EXISTING_BRANCH"
  # actions/checkout clones at depth 1, which leaves the default branch with no
  # parents and so no merge base with the rollup branch.
  if [[ "$(git rev-parse --is-shallow-repository)" == true ]]; then
    timeout --kill-after=10 120 git fetch --unshallow origin "$DEFAULT_BRANCH"
  fi
  # The runner has no git identity, and a non-fast-forward merge must commit.
  if ! git -c user.name="github-actions[bot]" \
    -c user.email="41898282+github-actions[bot]@users.noreply.github.com" \
    merge "origin/$DEFAULT_BRANCH" --no-edit; then
    echo "::error::Merging origin/$DEFAULT_BRANCH into $EXISTING_BRANCH failed (see git's message above)."
    # A refused merge (e.g. unrelated histories in a shallow clone) starts no
    # merge, and an unconditional abort would exit 128 over the real error.
    if git rev-parse -q --verify MERGE_HEAD >/dev/null; then
      git merge --abort
    fi
    exit 1
  fi
  {
    echo "branch=$EXISTING_BRANCH"
    echo "exists=true"
  } >>"$GITHUB_OUTPUT"
else
  echo "No existing security PR found, will create new branch"
  echo "exists=false" >>"$GITHUB_OUTPUT"
fi
