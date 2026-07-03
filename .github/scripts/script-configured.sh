#!/usr/bin/env bash
# Exit 0 iff package.json defines $1 as a script whose body does NOT contain
# the "ERROR: Configure" sentinel emitted by the unconfigured placeholder
# scripts in the template's package.json.
#
# Used by lint / test workflows to skip steps in repos that haven't filled
# in the placeholder scripts.

set -euo pipefail

: "${1:?script name required}"

# Use jq so the script name is never interpolated into an expression string.
val=$(jq -re --arg name "$1" '.scripts[$name]' package.json 2>/dev/null) || exit 1
! grep -q 'ERROR: Configure' <<<"$val"
