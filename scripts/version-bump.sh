#!/bin/bash

# Get the git diff since last tag
LAST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "v0.0.0")
CHANGES=$(git log ${LAST_TAG}..HEAD --oneline --no-merges)

if [ -z "$CHANGES" ]; then
  echo "No changes since last tag. Skipping version bump."
  exit 0
fi

echo "Changes since ${LAST_TAG}:"
echo "$CHANGES"
echo ""

# Use AI to determine version bump type
PROMPT="Based on these git commit messages, determine if this should be a MAJOR, MINOR, or PATCH version bump according to semantic versioning:

${CHANGES}

Rules:
- MAJOR: Breaking changes, incompatible API changes
- MINOR: New features, backwards-compatible functionality
- PATCH: Bug fixes, backwards-compatible fixes

Respond with ONLY one word: MAJOR, MINOR, or PATCH"

# Call Roo AI to determine version bump
BUMP_TYPE=$(roo ask "$PROMPT" 2>/dev/null | grep -oE "MAJOR|MINOR|PATCH" | head -1)

# Fallback to PATCH if AI call fails
if [ -z "$BUMP_TYPE" ]; then
  echo "⚠️  AI version detection failed, defaulting to PATCH"
  BUMP_TYPE="PATCH"
fi

echo "🤖 AI determined version bump type: $BUMP_TYPE"

# Perform the version bump
case $BUMP_TYPE in
  MAJOR)
    pnpm version major --no-git-tag-version
    ;;
  MINOR)
    pnpm version minor --no-git-tag-version
    ;;
  PATCH)
    pnpm version patch --no-git-tag-version
    ;;
esac

# Get the new version
NEW_VERSION=$(node -p "require('./package.json').version")
echo "📦 New version: $NEW_VERSION"

# Commit the version bump
git add package.json
git commit -m "chore: bump version to $NEW_VERSION"

# Create a git tag
git tag "v$NEW_VERSION"

echo "✅ Version bumped to $NEW_VERSION and tagged"
