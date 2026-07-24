#!/bin/bash
# Session setup script for Claude Code
# Installs dependencies and configures environment for git hooks

set -uo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"

#######################################
# Helpers
#######################################

SETUP_WARNINGS=0
warn() {
  echo "WARNING: $1" >&2
  SETUP_WARNINGS=$((SETUP_WARNINGS + 1))
}
is_root() { [[ "$(id -u)" = "0" ]]; }

# Append `export NAME=VALUE` to CLAUDE_ENV_FILE with VALUE shell-quoted via
# bash's @Q operator. Interpolating a value straight into a double-quoted
# string (e.g. "export X=\"$val\"") is not escaping it — a value containing a
# `"` or `$` becomes arbitrary code in whatever later sources this file.
emit_export() {
  local name="$1" value="$2"
  [[ -n "${CLAUDE_ENV_FILE:-}" ]] || return 0
  echo "export $name=${value@Q}" >>"$CLAUDE_ENV_FILE"
}

# Append `export PATH=<quoted dir>:$PATH` — like emit_export, but $PATH must
# stay unexpanded so it resolves against whatever PATH is active when the
# file is later sourced, not the PATH at generation time.
emit_path_prepend() {
  local dir="$1"
  [[ -n "${CLAUDE_ENV_FILE:-}" ]] || return 0
  echo "export PATH=${dir@Q}:\$PATH" >>"$CLAUDE_ENV_FILE"
}

# Install a command via uv if missing
uv_install_if_missing() {
  local cmd="$1" pkg="${2:-$1}"
  if ! command -v "$cmd" &>/dev/null; then
    uv tool install --quiet "$pkg" || warn "Failed to install $pkg"
  fi
}

# Install a command via webi if missing
# $1 = command name, $2 = optional webi package specifier (e.g. tool@version)
# Hardened: HTTPS-only, shebang validation, version pinning via $2
webi_install_if_missing() {
  local cmd="$1" pkg="${2:-$1}"
  if ! command -v "$cmd" &>/dev/null; then
    local installer
    installer=$(mktemp "${TMPDIR:-/tmp}/webi-${cmd}-XXXXXX.sh")
    # webi.sh serves a per-tool bootstrap generated on the fly, so there is no
    # stable digest to pin; we harden with HTTPS-only (--proto =https), the
    # shebang check below, and a version-pinned $pkg instead.
    # pin-exempt: webi.sh bootstrap is generated per-request, no stable digest
    if curl --proto '=https' -fsSL "https://webi.sh/$pkg" -o "$installer" 2>/dev/null; then
      first_line="$(head -n 1 "$installer")"
      if grep -q '^#!' <<<"$first_line"; then
        sh "$installer" >/dev/null 2>&1 || warn "Failed to install $cmd"
      else
        warn "Installer for $cmd is not a shell script (missing shebang) — skipping"
      fi
    else
      warn "Failed to download installer for $cmd"
    fi
    rm -f "$installer"
  fi
}

#######################################
# Hook syntax validation
#######################################

# A hook script with a syntax error (e.g. unresolved merge conflict markers)
# exits non-zero before any logic runs, which Claude Code treats as a block.
# Surface broken hooks at session start so they can be fixed before the first
# tool call dies with no explanation.
_check_hook_syntax() {
  local dir file out
  for dir in "$PROJECT_DIR/.claude/hooks" "$PROJECT_DIR/.hooks"; do
    [[ -d "$dir" ]] || continue
    while IFS= read -r -d '' file; do
      # Filter — only extensions this function knows how to syntax-check are
      # handled; any other file is correctly skipped.
      # case-default-ok: no-match is the intended no-op, not a missed case.
      case "$file" in
      *.sh | *.bash)
        if ! out=$(bash -n "$file" 2>&1); then
          warn "hook has bash syntax error: ${file#"$PROJECT_DIR/"}"
          [[ -n "$out" ]] && echo "$out" >&2
        fi
        ;;
      *.py)
        if command -v python3 &>/dev/null && ! out=$(python3 -m py_compile "$file" 2>&1); then
          warn "hook has python syntax error: ${file#"$PROJECT_DIR/"}"
          [[ -n "$out" ]] && echo "$out" >&2
        fi
        ;;
      esac
    done < <(find "$dir" -maxdepth 1 -type f -print0)
  done
}

_check_hook_syntax

#######################################
# PATH setup
#######################################

export PATH="$HOME/.local/bin:$PATH"
emit_path_prepend "$HOME/.local/bin"

#######################################
# Tool installation (optional - warn on failure)
#######################################

# Install tools quietly — only warn on failure (versions pinned for supply-chain safety)
webi_install_if_missing shfmt shfmt@3
webi_install_if_missing gh gh@2
webi_install_if_missing jq jq@1.7
if ! command -v shellcheck &>/dev/null && is_root; then
  { apt-get update -qq && apt-get install -y -qq shellcheck; } || warn "Failed to install shellcheck"
fi

# Python projects: the pre-commit and pre-push hooks shell out to ruff, which
# isn't a project dependency. Install it (pinned to match .pre-commit-config.yaml
# so local hooks format identically to CI). Skip for non-Python repos.
# VERSION PINS: keep in sync with .pre-commit-config.yaml (ruff-pre-commit rev:
# and zizmor additional_dependencies:). A contract test in tests/test_version_sync.py
# enforces this.
if { [[ -f "$PROJECT_DIR/pyproject.toml" ]] || [[ -f "$PROJECT_DIR/uv.lock" ]]; } && command -v uv &>/dev/null; then
  uv_install_if_missing ruff "ruff==0.14.5"
  uv_install_if_missing zizmor "zizmor==1.25.2"
fi

#######################################
# Git setup
#######################################

cd "$PROJECT_DIR" || exit 1
git config core.hooksPath .hooks

# Pre-fetch the base branch so diffs against $CLAUDE_CODE_BASE_REF work
# immediately (e.g. when creating PRs). Failure is non-fatal.
if [[ -n "${CLAUDE_CODE_BASE_REF:-}" ]]; then
  git fetch origin "$CLAUDE_CODE_BASE_REF" --quiet 2>/dev/null ||
    warn "Failed to fetch base branch $CLAUDE_CODE_BASE_REF"
fi

#######################################
# GitHub CLI auth
#######################################

if ! command -v gh &>/dev/null; then
  warn "gh CLI not found"
elif [[ -z "${GH_TOKEN:-}" ]]; then
  warn "GH_TOKEN is not set — GitHub CLI requires authentication"
fi

#######################################
# GitHub repo detection for proxy environments
#######################################

# In Claude Code web sessions, git remotes use a local proxy URL like:
#   http://local_proxy@127.0.0.1:18393/git/owner/repo
# The gh CLI can't detect the GitHub repo from this, so we extract
# owner/repo and export GH_REPO to make all gh commands work.

if [[ -z "${GH_REPO:-}" ]]; then
  remote_url=$(git -C "$PROJECT_DIR" remote get-url origin 2>/dev/null)
  # Anchor to the real local-proxy host authority — the same predicate the
  # web-session permission grant below uses. A bare /git/owner/repo suffix on a
  # hostile origin (e.g. https://attacker.example/git/evil/repo) must not be
  # allowed to redirect every subsequent gh command at an attacker's repo.
  # BASH_REMATCH[1] is the optional port group; owner/repo is [2].
  if [[ "$remote_url" =~ ^https?://[^/@]*@127\.0\.0\.1(:[0-9]+)?/git/([^/]+/[^/]+)$ ]]; then
    GH_REPO="${BASH_REMATCH[2]}"
    GH_REPO="${GH_REPO%.git}"
    export GH_REPO
    emit_export GH_REPO "$GH_REPO"
  fi
fi

#######################################
# Web-session permissions
#######################################

# In web sessions (detected by proxy remote URL), grant Claude Code
# permission to modify its own .claude/ folder without prompting.
remote_url="${remote_url:-$(git -C "$PROJECT_DIR" remote get-url origin 2>/dev/null)}"
if [[ "$remote_url" =~ ^https?://[^/@]*@127\.0\.0\.1(:[0-9]+)?/git/ ]]; then
  local_settings="$PROJECT_DIR/.claude/settings.local.json"
  if [[ ! -f "$local_settings" ]]; then
    cat >"$local_settings" <<'SETTINGS'
{
  "permissions": {
    "allow": [
      "Edit(.claude/**)",
      "Write(.claude/**)",
      "Read(.claude/**)",
      "Bash(pnpm build)",
      "Bash(pnpm check:*)",
      "Bash(pnpm format)",
      "Bash(pnpm install)",
      "Bash(pnpm lint:*)",
      "Bash(pnpm test:*)",
      "Bash(pre-commit run:*)",
      "Bash(uv run pytest:*)"
    ]
  }
}
SETTINGS
  fi
fi

#######################################
# Project dependencies
#######################################

if [[ -f "$PROJECT_DIR/package.json" ]]; then
  # Always run install (git hooks are configured in package.json postinstall)
  if command -v pnpm &>/dev/null; then
    pnpm install --silent || warn "Failed to install Node dependencies"
  elif command -v npm &>/dev/null; then
    npm install --silent || warn "Failed to install Node dependencies"
  fi
fi

if [[ -f "$PROJECT_DIR/uv.lock" ]] && command -v uv &>/dev/null; then
  uv sync --quiet || warn "Failed to sync Python dependencies"
  # Add .venv/bin to PATH so Python tools are available to hooks
  if [[ -d "$PROJECT_DIR/.venv/bin" ]]; then
    export PATH="$PROJECT_DIR/.venv/bin:$PATH"
    emit_path_prepend "$PROJECT_DIR/.venv/bin"
  fi
fi

if [[ "$SETUP_WARNINGS" -gt 0 ]]; then
  echo "Setup done with $SETUP_WARNINGS warning(s) — see above" >&2
fi
