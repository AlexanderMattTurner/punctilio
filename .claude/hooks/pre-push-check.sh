#!/bin/bash
# Runs the configured checks (package.json build/lint/check/test, then ruff) and
# exits 1 when any fails. push-gate.mjs runs it before a push or a PR create and
# turns that exit into a deny body: an exit 1 from a PreToolUse hook does NOT
# block in Claude Code, so this script is never registered as a hook itself.

set -uo pipefail

HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=lib-checks.sh
source "$HOOK_DIR/lib-checks.sh"

FAILED=0

run_check() {
  local name="$1"
  shift
  local output
  if ! output=$("$@" 2>&1); then
    echo "=== $name FAILED ===" >&2
    echo "$output" >&2
    FAILED=1
  fi
}

# Node.js checks
if [[ -f package.json ]] && ! exists jq; then
  echo "=== node scripts FAILED ===" >&2
  echo "jq is required to detect which package.json scripts are configured, but is not installed." >&2
  FAILED=1
else
  has_script build && run_check "build" pnpm build
  has_script lint && run_check "lint" pnpm lint
  has_script check && run_check "typecheck" pnpm check
  has_script test && run_check "tests" pnpm test
fi

# Python checks. .hooks/ruff.sh runs ruff at the pre-commit pin CI uses; a PATH
# ruff of another version enables other rules, so it denies a push CI passes.
if [[ -f pyproject.toml ]] || [[ -f uv.lock ]]; then
  run_check "ruff" "$BASH" "$HOOK_DIR/../../.hooks/ruff.sh" check .
fi

exit "$FAILED"
