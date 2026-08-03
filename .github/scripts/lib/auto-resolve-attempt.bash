# shellcheck shell=bash
# Contract: sourced into strict-mode (set -euo pipefail) callers; do not re-set shell options.
#
# The auto-resolver's ONE-ATTEMPT-PER-HEAD mark, shared by the two sides that must
# agree on it: the resolve job marks the head commit it ran against, and discover
# skips any PR whose current head already carries the mark.
#
# Why a commit STATUS rather than a label or a comment: the thing being recorded is
# a property of one tree, so it has to be keyed by the SHA of that tree. A label is
# PR-scoped and would still be there after the branch moved; a marker comment is
# both noisy and unkeyed. A status attaches to the commit, so pushing new commits
# clears it by construction — nothing to clean up.
#
# What it prevents: a push to the base branch re-flips every open PR to
# CONFLICTING, and without this mark the resolver re-runs a paid model resolution
# against the exact tree that just failed, once per push, forever.
#
# ── Why the mark EXPIRES ─────────────────────────────────────────────────────
#
# The mark is written BEFORE the resolution runs, on purpose: the runs worth
# stopping are the ones that end badly and never reach a step at the end. That
# also means it cannot distinguish "this tree was resolved" from "the resolver
# was broken when it looked at this tree" — so a permanent mark converts ANY
# resolver defect, including one nobody has diagnosed yet, into a PR stranded
# until a human pushes a commit or dispatches a catch-up (a swallowed merge
# failure in the resolver once marked and then refused every conflicting PR,
# and each one stayed marked after the fix landed).
#
# So the mark carries a TTL instead. A head is skipped only while its newest mark
# is younger than AUTO_RESOLVE_ATTEMPT_TTL_HOURS; after that the resolver may try
# again. This file only WRITES the mark — discover.py reads it, applies the TTL,
# and owns that knob, so the two never disagree about what fresh means.
# This keeps the crash-loop bound the mark exists for — spend per head is
# capped at (commit-age window / TTL) attempts — while making every failure class
# self-healing: whatever broke, once the fix is on the base ref the next scan past
# the TTL picks the PR up with no human action.
#
# ── Why a run can RELEASE its own mark ───────────────────────────────────────
#
# The TTL is the right instrument for a run that spent something and failed. It
# is the wrong one for a run that spent NOTHING: prepare's no-op exit (the base
# merges cleanly, so there was never a conflict to resolve) means this tree was
# never resolved at all, so the mark records an attempt that did not happen and
# suppresses every later scan for a full TTL. The resolver's own land push
# re-triggers this workflow, and a run starting after that push checks out the
# just-resolved head, finds the base already merged, and would burn the fresh
# head's budget while the base keeps moving underneath it. Releasing on a no-op
# is what keeps the resolver from disabling itself on the PRs it just resolved.
#
# The outer bound is the commit-age window in auto-resolve/discover.py: a branch
# nobody has touched leaves the candidate set entirely, so retries only ever
# accrue to branches someone is actively working on.

# shellcheck source=lib/shared-names.bash disable=SC1091
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/shared-names.bash"
# shellcheck source=lib/commit-status-mark.bash disable=SC1091
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/commit-status-mark.bash"

AUTO_RESOLVE_ATTEMPT_CONTEXT="$_COMMIT_STATUS_AUTO_RESOLVE_ATTEMPT"

# auto_resolve_mark_attempt REPO SHA DESCRIPTION — record that an attempt ran
# against SHA.
auto_resolve_mark_attempt() {
  commit_status_mark_set "$1" "$2" "$AUTO_RESOLVE_ATTEMPT_CONTEXT" "$3"
}

# auto_resolve_release_attempt REPO SHA DESCRIPTION — give SHA's attempt back,
# for a run that resolved nothing at all (see the release rationale above).
auto_resolve_release_attempt() {
  commit_status_mark_release "$1" "$2" "$AUTO_RESOLVE_ATTEMPT_CONTEXT" "$3"
}
