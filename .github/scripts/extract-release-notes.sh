#!/usr/bin/env bash

# Prints the CHANGELOG.md section for the given version, for use as the
# GitHub Release body.
#
# Usage: extract-release-notes.sh vX.Y.Z

set -euo pipefail

if [[ $# -ne 1 || ! "$1" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "usage: $0 vX.Y.Z" >&2
  exit 1
fi

VERSION="${1#v}"
CHANGELOG="CHANGELOG.md"

NOTES="$(awk -v ver="$VERSION" '
  $0 ~ ("^## \\[" ver "\\]") { flag=1; next }
  /^## \[/ { flag=0 }
  /^\[unreleased\]: / { flag=0 }
  flag
' "$CHANGELOG")"

if [[ -z "$(printf '%s' "$NOTES" | grep -v '^[[:space:]]*$' || true)" ]]; then
  echo "No changelog section found for v$VERSION in $CHANGELOG." >&2
  exit 1
fi

printf '%s\n' "$NOTES"
