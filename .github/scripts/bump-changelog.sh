#!/usr/bin/env bash

# Rolls the [Unreleased] section of CHANGELOG.md into a new versioned section
# and updates the comparison links at the bottom of the file.
#
# Usage: bump-changelog.sh vX.Y.Z

set -euo pipefail

if [[ $# -ne 1 || ! "$1" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "usage: $0 vX.Y.Z" >&2
  exit 1
fi

VERSION="${1#v}"
DATE="$(date -u +%Y-%m-%d)"
CHANGELOG="CHANGELOG.md"
REPO_URL="https://github.com/dash0hq/otel-cicd-action"

UNRELEASED_CONTENT="$(awk '/^## \[Unreleased\]/{flag=1; next} /^## \[/{flag=0} flag' "$CHANGELOG")"
if [[ -z "$(printf '%s' "$UNRELEASED_CONTENT" | grep -v '^[[:space:]]*$' || true)" ]]; then
  echo "The [Unreleased] section of $CHANGELOG is empty; nothing to release." >&2
  exit 1
fi

PREVIOUS="$(grep -E '^\[unreleased\]: ' "$CHANGELOG" | grep -oE 'v[0-9]+\.[0-9]+\.[0-9]+' | head -1)"
if [[ -z "$PREVIOUS" ]]; then
  echo "Could not determine the previous version from the [unreleased] link in $CHANGELOG." >&2
  exit 1
fi

awk -v ver="$VERSION" -v date="$DATE" -v prev="$PREVIOUS" -v url="$REPO_URL" '
  /^## \[Unreleased\]$/ {
    print
    print ""
    print "## [" ver "] - " date
    next
  }
  /^\[unreleased\]: / {
    print "[unreleased]: " url "/compare/v" ver "...HEAD"
    print "[" ver "]: " url "/compare/" prev "...v" ver
    next
  }
  { print }
' "$CHANGELOG" > "$CHANGELOG.tmp"
mv "$CHANGELOG.tmp" "$CHANGELOG"

echo "Updated $CHANGELOG for v$VERSION (previous release: $PREVIOUS)."
