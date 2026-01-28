#!/bin/bash

# Install git hooks from scripts/hooks to .git/hooks

HOOKS_DIR="scripts/hooks"
GIT_HOOKS_DIR=".git/hooks"

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
    
    echo "✅ Installed $hook_name"
  fi
done

echo "🎉 All hooks installed successfully!"
echo ""
echo "Installed hooks:"
ls -la "$GIT_HOOKS_DIR" | grep -v ".sample" | grep "^-rwx"
