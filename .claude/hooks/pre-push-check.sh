#!/bin/bash
# Pre-push/PR hook: Runs configured checks before pushing or creating PRs
# Only runs scripts that exist and are properly configured in package.json

set -uo pipefail

HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib-checks.sh
source "$HOOK_DIR/lib-checks.sh"

FAILED=0

run_check() {
  local name="$1" cmd="$2"
  local output
  if ! output=$($cmd 2>&1); then
    echo "=== $name FAILED ===" >&2
    echo "$output" >&2
    FAILED=1
  fi
}

# Node.js checks
has_script build && run_check "build" "pnpm build"
has_script lint && run_check "lint" "pnpm lint"
has_script check && run_check "typecheck" "pnpm check"

# Run tests if stop hook retries were exhausted (safety net)
PROJ_HASH=$(printf '%s' "$PROJECT_DIR" | sha256sum | cut -c1-16)
RETRY_DIR="/tmp/claude-stop-$(id -u)"
if [[ ! -f "${RETRY_DIR}/attempts-${PROJ_HASH}" ]]; then
  # No active retry counter means either first push or stop hook already passed
  has_script test && run_check "tests" "pnpm test"
fi

# Python checks
if [[ -f pyproject.toml ]] || [[ -f uv.lock ]]; then
  PREFIX=""
  [[ -f uv.lock ]] && exists uv && PREFIX="uv run "

  { exists ruff || [[ -n "$PREFIX" ]]; } && run_check "ruff" "${PREFIX}ruff check ."
fi

exit $FAILED
