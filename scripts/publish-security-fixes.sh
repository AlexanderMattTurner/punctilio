#!/usr/bin/env bash
# Publish the commits the weekly security-scan agent made: push its branch, open
# or update the rollup PR, and close the Dependabot PRs it subsumed.
#
# The agent reads attacker-influenceable text, so it runs with a read-only
# GITHUB_TOKEN and hands over only DATA (in PUBLISH_DIR). This script runs in a
# separate job from a fresh checkout of the default branch, and it alone holds
# the push token. It validates every piece of that data before acting on it.
#
# Inputs (env):
#   PUSH_TOKEN        PAT whose pushes and PRs trigger CI (GITHUB_TOKEN's don't)
#   DEFAULT_BRANCH    Repository default branch (e.g. "main")
#   EXISTING_BRANCH   Branch of the open security-scan PR, or empty
#   PUBLISH_DIR       Directory holding the agent's handoff:
#                       branch.txt          the branch the agent committed on
#                       commits.bundle      git bundle of those commits (HEAD)
#                       pr-body.md          the PR description
#                       superseded-prs.txt  optional; one Dependabot PR number per line

set -euo pipefail

: "${PUSH_TOKEN:?PUSH_TOKEN must be set}"
: "${DEFAULT_BRANCH:?DEFAULT_BRANCH must be set}"
: "${PUBLISH_DIR:?PUBLISH_DIR must be set}"
EXISTING_BRANCH="${EXISTING_BRANCH:-}"

die() {
  echo "::error::$*" >&2
  exit 1
}

for file in branch.txt commits.bundle pr-body.md; do
  [[ -f "${PUBLISH_DIR}/${file}" ]] || die "The agent's handoff is missing ${file}."
done

branch=$(<"${PUBLISH_DIR}/branch.txt")
# The existing branch comes from any open PR labelled security-scan, so it gets
# the same name check: a mislabelled PR must not aim this push at another branch.
[[ "$branch" =~ ^security-fixes/[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] ||
  die "Refusing to push the agent's branch '${branch}': expected security-fixes/YYYY-MM-DD."
[[ -z "$EXISTING_BRANCH" || "$branch" == "$EXISTING_BRANCH" ]] ||
  die "The agent committed on '${branch}', not the existing rollup branch '${EXISTING_BRANCH}'."

git bundle verify --quiet "${PUBLISH_DIR}/commits.bundle"
# allow-unbounded: fetches from the local bundle file, never the network.
git fetch --quiet "${PUBLISH_DIR}/commits.bundle" HEAD
tip=$(git rev-parse FETCH_HEAD)

# A push with this token starts CI, and same-repo PR workflows run with the
# repository's secrets. Refuse any change to code CI executes, so the agent
# cannot turn its branch into a workflow that reads them.
changed_ci_code=$(git diff --name-only "origin/${DEFAULT_BRANCH}...${tip}" -- \
  .github/workflows .github/actions .github/scripts scripts .hooks .claude)
[[ -z "$changed_ci_code" ]] ||
  die "The agent's commits touch CI code, which this publisher never pushes: ${changed_ci_code//$'\n'/, }"

# Hand the token to git through the environment, not argv or .git/config.
basic_auth=$(printf 'x-access-token:%s' "$PUSH_TOKEN" | base64 -w0)
echo "::add-mask::${basic_auth}"
GIT_CONFIG_COUNT=1 \
  GIT_CONFIG_KEY_0="http.https://github.com/.extraheader" \
  GIT_CONFIG_VALUE_0="AUTHORIZATION: basic ${basic_auth}" \
  timeout --kill-after=10 120 git push origin "${tip}:refs/heads/${branch}"

export GH_TOKEN="$PUSH_TOKEN"
pr_number=$(gh pr list --head "$branch" --state open --json number --jq '.[0].number // empty')
if [[ -n "$pr_number" ]]; then
  gh pr edit "$pr_number" --body-file "${PUBLISH_DIR}/pr-body.md"
else
  gh pr create \
    --base "$DEFAULT_BRANCH" \
    --head "$branch" \
    --title "fix(security): weekly vulnerability remediation" \
    --label "security-scan" \
    --body-file "${PUBLISH_DIR}/pr-body.md"
  pr_number=$(gh pr view "$branch" --json number --jq '.number')
fi
echo "Rollup PR: #${pr_number}"

superseded="${PUBLISH_DIR}/superseded-prs.txt"
[[ -f "$superseded" ]] || exit 0
while IFS= read -r line || [[ -n "$line" ]]; do
  [[ -z "$line" ]] && continue
  [[ "$line" =~ ^[0-9]+$ ]] || die "superseded-prs.txt holds a non-numeric line: '${line}'."
  # Only an open Dependabot PR may be closed on the agent's word. A fork can
  # name its branch dependabot/*, so the author and head repository count too.
  if ! head_ref=$(gh pr view "$line" --json state,headRefName,isCrossRepository,author --jq \
    'select(.state == "OPEN" and .isCrossRepository == false and (.author.login == "app/dependabot" or .author.login == "dependabot[bot]")) | .headRefName'); then
    echo "::warning::Not closing #${line}: could not look it up."
    continue
  fi
  if [[ "$head_ref" != dependabot/* ]]; then
    echo "::warning::Not closing #${line}: it is not an open Dependabot PR."
    continue
  fi
  gh pr close "$line" --comment "Superseded by #${pr_number}."
done <"$superseded"
