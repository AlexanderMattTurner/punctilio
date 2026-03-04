#!/bin/bash

# Install git hooks from scripts/hooks to .git/hooks
# Only runs in the punctilio repo itself — not when installed as a dependency.

HOOKS_DIR="scripts/hooks"
GIT_HOOKS_DIR=".git/hooks"

# Guard: only install hooks when running inside the punctilio repo.
# When installed as a dependency, scripts/hooks won't exist.
if [ ! -d "$HOOKS_DIR" ]; then
  exit 0
fi

if [ ! -d "$GIT_HOOKS_DIR" ]; then
  echo "❌ .git/hooks directory not found. Are you in a git repository?"
  exit 1
fi

echo "📦 Installing git hooks..."

for hook in "$HOOKS_DIR"/*; do
  if [ -f "$hook" ]; then
    hook_name=$(basename "$hook")
    target="$GIT_HOOKS_DIR/$hook_name"
    
    # Copy the hook
    cp "$hook" "$target"
    
    # Make it executable
    chmod +x "$target"
    
    # Remove extended attributes (macOS)
    if command -v xattr &> /dev/null; then
      xattr -c "$target" 2>/dev/null || true
    fi
    
    echo "✅ Installed $hook_name"
  fi
done

echo "🎉 All hooks installed successfully!"
echo ""
echo "Installed hooks:"
ls -la "$GIT_HOOKS_DIR" | grep -v ".sample" | grep "^-rwx"
