#!/bin/bash
# Auto version bump using Claude API to analyze commits
set -e

# Get the most recent commit message
LAST_COMMIT=$(git log -1 --pretty=%B)

# Check if the most recent commit is already a version bump
if [[ "$LAST_COMMIT" == chore:\ bump\ version* ]]; then
  echo "Most recent commit is already a version bump. Skipping."
  exit 0
fi

# Get current version from package.json
CURRENT_VERSION=$(node -p "require('./package.json').version")
echo "Current version: $CURRENT_VERSION"

# Get commits since last version bump
LAST_BUMP_COMMIT=$(git log --oneline --grep="^chore: bump version" -1 --format="%H" 2>/dev/null || echo "")

if [ -n "$LAST_BUMP_COMMIT" ]; then
  COMMITS=$(git log "$LAST_BUMP_COMMIT"..HEAD --pretty=format:"- %s" --no-merges)
  DIFF_STAT=$(git diff --stat "$LAST_BUMP_COMMIT"..HEAD 2>/dev/null || echo "Unable to get diff")
else
  COMMITS=$(git log -1 --pretty=format:"- %s" --no-merges)
  DIFF_STAT=$(git show --stat HEAD 2>/dev/null || echo "Unable to get diff")
fi

echo "Commits to analyze:"
echo "$COMMITS"

# Call Claude API to determine version bump
PROMPT="You are analyzing commits for a semantic version bump. Current version: $CURRENT_VERSION

Recent commits:
$COMMITS

Changes summary:
$DIFF_STAT

Rules:
- MAJOR: Breaking changes (API changes, removed features, incompatible changes)
- MINOR: New features, new exports, new options (backwards compatible)
- PATCH: Bug fixes, documentation, refactoring, performance improvements

Respond with ONLY one word: major, minor, or patch"

RESPONSE=$(curl -s https://api.anthropic.com/v1/messages \
  -H "Content-Type: application/json" \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -d "$(jq -n \
    --arg prompt "$PROMPT" \
    '{
      model: "claude-sonnet-4-20250514",
      max_tokens: 10,
      messages: [{role: "user", content: $prompt}]
    }')")

# Extract the bump level from Claude's response
BUMP=$(echo "$RESPONSE" | jq -r '.content[0].text' | tr '[:upper:]' '[:lower:]' | tr -d '[:space:]')

# Validate response
if [[ "$BUMP" != "major" && "$BUMP" != "minor" && "$BUMP" != "patch" ]]; then
  echo "Unexpected response from Claude: $BUMP"
  echo "Full response: $RESPONSE"
  echo "Defaulting to patch"
  BUMP="patch"
fi

echo "Claude determined bump level: $BUMP"

# Parse version components
IFS='.' read -r MAJOR MINOR PATCH_NUM <<< "$CURRENT_VERSION"

# Calculate new version
case $BUMP in
  major)
    NEW_VERSION="$((MAJOR + 1)).0.0"
    ;;
  minor)
    NEW_VERSION="${MAJOR}.$((MINOR + 1)).0"
    ;;
  patch)
    NEW_VERSION="${MAJOR}.${MINOR}.$((PATCH_NUM + 1))"
    ;;
esac

echo "New version: $NEW_VERSION"

# Update package.json using node to preserve formatting
node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
pkg.version = '$NEW_VERSION';
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
"

echo "Updated package.json to version $NEW_VERSION"

# Configure git
git config user.name "github-actions[bot]"
git config user.email "github-actions[bot]@users.noreply.github.com"

# Commit and push
git add package.json
git commit -m "chore: bump version to $NEW_VERSION"
git push

echo "Version bump complete!"
