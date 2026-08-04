# shellcheck shell=bash
# Contract: sourced into strict-mode (set -euo pipefail) callers; do not re-set
# shell options. Callers provide `retry` (lib-ci-retry.sh).
#
# A per-head mark as a commit STATUS, shared by every sweep that must do a thing
# at most once per head per time window (the auto-resolver's attempt mark). A
# status attaches to the commit, so pushing new commits clears it by
# construction — nothing to clean up. This file WRITES marks; the reader that
# applies a TTL to them is auto-resolve/discover.py, so a transient failure
# self-heals after that window instead of stranding the head forever.
#
# A mark can also be RELEASED before its TTL, for the case the TTL is too blunt
# for: the marked run turned out to do nothing at all, so it consumed a budget it
# never spent. The release is a status of its own on a `-released` context rather
# than a non-success state on the mark's context, because a red status on a PR
# head is not inert — GitHub reports the head UNSTABLE, which is an input the
# auto-merge machinery reads.

if [[ -z "${_COMMIT_STATUS_MARK_SOURCED:-}" ]]; then
  _COMMIT_STATUS_MARK_SOURCED=1

  # shellcheck source=lib/shared-names.bash disable=SC1091
  source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/shared-names.bash"

  # The release convention, taken from shared-names.json because the reader that
  # consults it is in another language (auto-resolve/discover.py). Spelling it
  # twice is silent in production: a release posted to a context nothing consults
  # is indistinguishable from no release at all, until a PR sits out a TTL nobody
  # can explain.
  _commit_status_mark_released_context() {
    printf '%s%s' "$1" "$_COMMIT_STATUS_RELEASED_SUFFIX"
  }

  # commit_status_mark_set REPO SHA CONTEXT DESCRIPTION — record the mark.
  # Best-effort: failing to mark must not fail the action that is otherwise
  # proceeding, and the worst case is one repeated action next window.
  commit_status_mark_set() {
    if (($# != 4)); then
      echo "commit_status_mark_set: usage: commit_status_mark_set REPO SHA CONTEXT DESCRIPTION" >&2
      return 2
    fi
    retry gh api --method POST "repos/$1/statuses/$2" \
      -f "state=success" \
      -f "context=$3" \
      -f "description=$4" >/dev/null || true
  }

  # commit_status_mark_release REPO SHA CONTEXT DESCRIPTION — cancel the mark on
  # SHA so the next sweep may act on it again before the TTL. Best-effort like
  # the set: a release that fails leaves the head marked until its TTL, which is
  # the behaviour releasing improves on, never a worse one.
  commit_status_mark_release() {
    if (($# != 4)); then
      echo "commit_status_mark_release: usage: commit_status_mark_release REPO SHA CONTEXT DESCRIPTION" >&2
      return 2
    fi
    commit_status_mark_set "$1" "$2" "$(_commit_status_mark_released_context "$3")" "$4"
  }
fi
