#!/bin/bash
# Session setup script for Claude Code
# Installs dependencies and configures environment

set -uo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"

#######################################
# Helpers
#######################################

warn() { echo "Warning: $1" >&2; }

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
webi_install_if_missing shfmt
webi_install_if_missing gh

#######################################
# GitHub CLI auth
#######################################

if [ -n "${GH_TOKEN:-}" ] && command -v gh &>/dev/null; then
  echo "Configuring GitHub authentication..."
  echo "$GH_TOKEN" | gh auth login --with-token 2>&1 || warn "Failed to authenticate with GitHub"
fi

#######################################
# Project dependencies
#######################################

cd "$PROJECT_DIR" || exit 1

if [ ! -d "$PROJECT_DIR/node_modules" ]; then
  echo "Installing Node dependencies..."
  pnpm install --silent || warn "Failed to install Node dependencies"
fi

echo "Session setup complete"
