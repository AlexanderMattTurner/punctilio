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
is_root() { [ "$(id -u)" = "0" ]; }

# Install a command via uv if missing
uv_install_if_missing() {
  local cmd="$1" pkg="${2:-$1}"
  if ! command -v "$cmd" &>/dev/null; then
    uv tool install --quiet "$pkg" || warn "Failed to install $pkg"
  fi
}

# Install a command via webi if missing
webi_install_if_missing() {
  local cmd="$1"
  if ! command -v "$cmd" &>/dev/null; then
    echo "Installing $cmd..."
    curl -sS "https://webi.sh/$cmd" | sh >/dev/null 2>&1 || warn "Failed to install $cmd"
  fi
}

#######################################
# PATH setup
#######################################

export PATH="$HOME/.local/bin:$PATH"
if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  echo "export PATH=\"\$HOME/.local/bin:\$PATH\"" >>"$CLAUDE_ENV_FILE"
fi

#######################################
# Tool installation (optional - warn on failure)
#######################################

echo "Installing tools..."

# Install shfmt for shell script formatting
webi_install_if_missing shfmt

# Install GitHub CLI for PR workflows
webi_install_if_missing gh

# Install jq for JSON processing (used by hooks)
webi_install_if_missing jq

# Install shellcheck for shell script linting (requires root)
if ! command -v shellcheck &>/dev/null && is_root; then
  if ! { apt-get update -qq && apt-get install -y -qq shellcheck; } 2>/dev/null; then
    warn "Failed to install shellcheck"
  fi
fi

#######################################
# Git setup
#######################################

cd "$PROJECT_DIR" || exit 1
git config core.hooksPath .hooks

#######################################
# GitHub CLI auth
#######################################

if ! command -v gh &>/dev/null; then
  warn "gh CLI not found"
elif [ -z "${GH_TOKEN:-}" ]; then
  warn "GH_TOKEN is not set — GitHub CLI requires authentication"
fi

#######################################
# GitHub repo detection for proxy environments
#######################################

# In Claude Code web sessions, git remotes use a local proxy URL like:
#   http://local_proxy@127.0.0.1:18393/git/owner/repo
# The gh CLI can't detect the GitHub repo from this, so we extract
# owner/repo and export GH_REPO to make all gh commands work.

if [ -z "${GH_REPO:-}" ]; then
  remote_url=$(git -C "$PROJECT_DIR" remote get-url origin 2>/dev/null || true)
  if [[ "$remote_url" =~ /git/([^/]+/[^/]+)$ ]]; then
    GH_REPO="${BASH_REMATCH[1]}"
    GH_REPO="${GH_REPO%.git}"
    export GH_REPO
    echo "Detected GitHub repo from proxy remote: $GH_REPO"
    if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
      echo "export GH_REPO=\"$GH_REPO\"" >>"$CLAUDE_ENV_FILE"
    fi
  fi
fi

#######################################
# Project dependencies
#######################################

# Always run install to ensure node_modules is in sync with lockfile
# (node_modules can be stale even when the lockfile is correct)
if [ -f "$PROJECT_DIR/package.json" ]; then
  echo "Installing Node dependencies..."
  if command -v pnpm &>/dev/null; then
    pnpm install --silent || warn "Failed to install Node dependencies"
  elif command -v npm &>/dev/null; then
    npm install --silent || warn "Failed to install Node dependencies"
  fi
fi

# Install Python dependencies if uv.lock exists
if [ -f "$PROJECT_DIR/uv.lock" ] && command -v uv &>/dev/null; then
  uv sync --quiet 2>/dev/null || warn "Failed to sync Python dependencies"
fi

if [ "$SETUP_WARNINGS" -gt 0 ]; then
  echo "Session setup complete with $SETUP_WARNINGS warning(s)" >&2
else
  echo "Session setup complete"
fi
