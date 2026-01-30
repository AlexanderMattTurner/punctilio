#!/bin/bash
# Auto version bump based on commit messages
# Uses conventional commit patterns to determine bump level

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

# Parse version components
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT_VERSION"

# Analyze commits since last version bump to determine bump level
# Look at commits since last "chore: bump version" commit
LAST_BUMP_COMMIT=$(git log --oneline --grep="^chore: bump version" -1 --format="%H" 2>/dev/null || echo "")

if [ -n "$LAST_BUMP_COMMIT" ]; then
  COMMITS=$(git log "$LAST_BUMP_COMMIT"..HEAD --pretty=%B --no-merges)
else
  # If no previous bump commit, just look at the last commit
  COMMITS=$(git log -1 --pretty=%B --no-merges)
fi

# Determine bump level based on commit patterns
BUMP="patch"

# Check for breaking changes (MAJOR)
if echo "$COMMITS" | grep -qiE "(BREAKING CHANGE|^feat!:|^fix!:|breaking:)"; then
  BUMP="major"
# Check for new features (MINOR)
elif echo "$COMMITS" | grep -qiE "^feat(\(.+\))?:"; then
  BUMP="minor"
# Check for new exports, new options, new functionality
elif echo "$COMMITS" | grep -qiE "(new feature|new export|new option|add.*feature)"; then
  BUMP="minor"
fi

# Calculate new version
case $BUMP in
  major)
    NEW_VERSION="$((MAJOR + 1)).0.0"
    ;;
  minor)
    NEW_VERSION="${MAJOR}.$((MINOR + 1)).0"
    ;;
  patch)
    NEW_VERSION="${MAJOR}.${MINOR}.$((PATCH + 1))"
    ;;
esac

echo "Bump level: $BUMP"
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
