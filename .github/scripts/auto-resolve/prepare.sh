#!/usr/bin/env bash
# Auto-resolve merge conflicts — PREPARE step.
#
# Merges the PR's base branch into the checked-out PR head, runs the
# deterministic pre-passes (regenerating derived files declared in
# config/auto-resolve-regen-rules.json, then a mergiraf structural merge of the
# remaining source conflicts), then partitions whatever is left so the LLM only
# ever sees hand-mergeable text conflicts it has a real chance of judging
# (written to $GITHUB_OUTPUT):
#   conflict_list=...   hand-mergeable text conflicts, for the LLM prompt
#   deferred_regen=...  generator-owned outputs whose source also conflicted;
#                       FINALIZE regenerates them after the LLM resolves the
#                       sources — the LLM never sees a generated artifact
#                       (always empty in a repo declaring no regen rules)
#   unresolvable=...    `-merge`-attributed (lockfile) or binary conflicts not
#                       owned by a generator: git leaves NO text markers and the
#                       working tree at "ours", so neither an LLM edit nor a
#                       regen can produce a correct resolution — the workflow
#                       hands off to a human BEFORE any LLM cost
#   modify_delete=...   the subset of conflict_list git left with NO markers
#                       because one side DELETED the path and the other modified
#                       it. Still resolved by the LLM, but under a keep-or-delete
#                       prompt: the only decision available is which side wins,
#                       and it is invisible in the PR's own diff once it lands
#   needs_llm=true      conflict_list is non-empty
#   needs_commit=true   there is a resolution (deterministic and/or LLM) to commit
#   no_op_head=...      set only on the clean-merge no-op exit: the pre-merge
#                       head SHA, so the workflow can hand that head's attempt
#                       mark back (this run resolved nothing)
#
# A conflict touching a PROTECTED path (by default this repo's Claude config or
# its CI machinery — override with AUTO_RESOLVE_PROTECTED_RE) is handed to the LLM
# like any other, and logged here. The LAND step re-derives the protected set from
# the conflicts it computed itself, so nothing is carried across for it to
# believe. Prepare itself never talks to
# GitHub — a run that ends up resolving nothing must say nothing. A clean merge
# is a no-op.
#
# The checkout runs `persist-credentials: false`, so git is authenticated
# out-of-band via an HTTP extraheader (the token is never written to .git/config).
set -euo pipefail

# shellcheck source=.github/scripts/auto-resolve/lib.sh
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

# True when one side DELETED the path and the other MODIFIED it (git's
# modify/delete): stage 1 (the merge base) exists, but only one of stage 2
# (ours) / stage 3 (theirs) does. `git ls-files -u` prints
# "<mode> <object> <stage>\t<path>" per stage.
#
# This classification is what stops the resolver from silently reverting a
# deletion. Git writes NO conflict markers for a modify/delete — it leaves the
# surviving side's content in the worktree verbatim — so an LLM given the
# ordinary marker-driven prompt reads the file, finds nothing to resolve, and
# exits successfully; the downstream leftover-marker check then sees a clean
# file and the run reports success, having resurrected a file the branch
# deliberately deleted. Naming these paths lets the rest of the pipeline demand
# an explicit keep-or-delete verdict per path instead.
# Callable only mid-merge (reads the index's unmerged stages).
is_modify_delete() {
  local stages
  stages="$(git ls-files -u -- "$1" | awk '{print $3}' | sort -u)"
  [[ "$stages" == *1* ]] && [[ "$stages" != *2* || "$stages" != *3* ]]
}

: "${BASE_REF:?BASE_REF required}"
: "${HEAD_REF:?HEAD_REF required}"
: "${GITHUB_TOKEN:?GITHUB_TOKEN required}"
out="${GITHUB_OUTPUT:?GITHUB_OUTPUT required}"

git_auth_header "$GITHUB_TOKEN"

git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"

# diff3 markers, which keep the merge-base section between `|||||||` and `=======`.
# This is what makes the structural pre-pass work AT ALL: mergiraf refuses a
# diff2 conflict outright ("Cannot solve conflicts in diff2 style") and returns
# no solution, so with git's default style every structural conflict would route
# to the paid model pass while the pre-pass reported nothing wrong. The extra
# section also gives the model the base text it otherwise has to infer.
git config merge.conflictStyle diff3

# The EXPLICIT refspec is load-bearing. A bare `git fetch origin "$BASE_REF"`
# updates FETCH_HEAD but not necessarily refs/remotes/origin/<base> when the
# checkout was made with a narrowed fetch refspec — so the merge below reads a
# STALE origin/<base> and merges an out-of-date base, and no command fails. The
# run then reports a resolution against a base that has since moved.
git fetch --no-tags origin "+refs/heads/${BASE_REF}:refs/remotes/origin/${BASE_REF}"

# Captured before the merge: a clean merge (or fast-forward) moves HEAD, and the
# no-op exit must report the commit the mark-attempt step recorded, not the tip
# the merge produced — the release script hands the attempt back on exactly the
# SHA that was marked.
premerge_head="$(git rev-parse HEAD)"

no_op_exit() {
  # A no-op is reported as a WARNING, never a silent green: this step runs
  # because something upstream said the PR was conflicting, so a run that
  # resolves nothing means the two disagree. Silent, that disagreement is
  # invisible for as long as it persists.
  echo "::warning::auto-resolve/prepare: $1"
  {
    echo "needs_llm=false"
    echo "needs_commit=false"
    echo "no_op_head=${premerge_head}"
  } >>"$out"
  exit 0
}

# A clean `git merge` has THREE outcomes, and they need different answers.
# Treating all three as "nothing to do" strands a PR that git could merge, and
# treating all three as "push it" empties a PR that only fast-forwarded.
if git merge --no-edit "origin/${BASE_REF}"; then
  if git merge-base --is-ancestor "origin/${BASE_REF}" "$premerge_head"; then
    no_op_exit "${HEAD_REF} already contains ${BASE_REF}; nothing to merge."
  fi

  if [[ "$(git rev-list --count "${premerge_head}..HEAD")" -gt 0 ]] &&
    git merge-base --is-ancestor "$premerge_head" "origin/${BASE_REF}"; then
    # The merge FAST-FORWARDED: the PR branch had no commits of its own that the
    # base lacks, so HEAD moved onto the base tip. Pushing that would make the
    # pull request's diff empty. Refuse, loudly.
    no_op_exit "merging ${BASE_REF} fast-forwarded ${HEAD_REF}, which would empty the pull request; refusing to push."
  fi

  # Genuinely clean, and a real merge commit: git merged what the API called
  # conflicting. Push it — this is the case the old code stranded, having
  # already marked the head attempted so nothing retried it.
  echo "Merged ${BASE_REF} into ${HEAD_REF} with no conflicts — committing without Claude."
  {
    echo "needs_llm=false"
    echo "needs_commit=true"
  } >>"$out"
  exit 0
fi

# Optional deterministic pre-pass: when the repo defines a `resolve-generated`
# script, regenerate + stage conflicted fully-generated files so Claude only ever
# sees genuine source conflicts. Non-fatal on its own; skipped entirely (and the
# whole generated-file classification collapses to empty) when the repo has no
# such script.
if has_resolve_generated; then
  # shellcheck disable=SC2119  # no flags: this is the plain regenerate-everything run
  # echo-fallback-ok: regeneration is best-effort by design; the bundle step's unmerged check is the real gate
  run_resolve_generated || echo "resolve-generated made no change (or errored) — continuing."
else
  echo "no $RESOLVE_GENERATED_CONFIG — skipping the deterministic generated-file pre-pass."
fi

mapfile -t conflicts < <(git diff --name-only --diff-filter=U)
declare -A unmerged=()
for f in "${conflicts[@]}"; do unmerged["$f"]=1; done

# A resolve-generated pre-pass may also rewrite UNOWNED splice outputs in the
# working tree. Those bytes are not part of the deterministic resolution —
# restore them to the merged index state so the bundle step's out-of-set guard sees
# only the LLM's edits. (A worktree diff lists unmerged paths too; those are the
# conflicts themselves, not regen noise.) A no-op with no resolve-generated
# script, since then git diff --name-only lists only the conflicts.
while IFS= read -r f; do
  [[ -z "$f" || -n "${unmerged["$f"]:-}" ]] && continue
  git checkout -- "$f"
done < <(git diff --name-only)

if [[ ${#conflicts[@]} -eq 0 ]]; then
  echo "All conflicts resolved deterministically — committing without Claude."
  {
    echo "needs_llm=false"
    echo "needs_commit=true"
  } >>"$out"
  exit 0
fi

# Generator-owned paths: the ownership oracle deciding which conflicts are
# GENERATED, and so have no correct hand resolution.
#
# This FAILS CLOSED. An oracle that answers "nothing is owned" when it breaks
# misroutes exactly the paths it exists to route: a generated artifact would
# reach the model, which would hand-edit it into a state matching neither the
# sources nor what the generator produces. So a non-zero exit here aborts the
# run rather than degrading into an empty owned set.
#
# A trailing-slash entry is a PREFIX — the rule generates that whole subtree,
# which covers output directories whose filenames it cannot enumerate ahead of
# time, and paths present on only one side of the merge.
declare -A owned=()
owned_prefixes=()
if has_resolve_generated; then
  owned_out="$(run_resolve_generated --owned)" || {
    echo "auto-resolve/prepare: the ownership oracle (resolve-generated --owned) failed." >&2
    echo "  Refusing to continue: treating its silence as 'nothing is generated' would hand a" >&2
    echo "  generated artifact to the model to hand-edit. Fix ${RESOLVE_GENERATED_CONFIG}." >&2
    exit 1
  }
  while IFS= read -r f; do
    [[ -z "$f" ]] && continue
    if [[ "$f" == */ ]]; then owned_prefixes+=("$f"); else owned["$f"]=1; fi
  done <<<"$owned_out"
fi

is_owned() {
  [[ -n "${owned["$1"]:-}" ]] && return 0
  local p
  for p in "${owned_prefixes[@]}"; do
    [[ "$1" == "$p"* ]] && return 0
  done
  return 1
}

# Partition. An owned conflict means its source ALSO conflicted (the pre-pass
# already resolved the clean-source ones) — the bundle step regenerates it after the
# LLM resolves the source. A `-merge`-attributed or binary conflict has no
# markers to resolve and no generator to rerun: only a human (relocking,
# re-exporting the asset) can produce the right content.
#
# A modify/delete conflict also has no markers, but it DOES have a resolution an
# LLM can reach — keep the file or honour the deletion — so it stays in
# conflict_list and is ALSO named in `modify_delete`, so the rest of the pipeline
# can demand an explicit verdict per path. Left in the ordinary marker-driven
# class alone it would be the pipeline's most dangerous case, because the
# marker-free file git leaves behind LOOKS resolved.
llm_list=()
deferred_regen=()
unresolvable=()
modify_delete=()
structural_candidates=()
for f in "${conflicts[@]}"; do
  if is_owned "$f"; then
    deferred_regen+=("$f")
  elif is_unmergeable "$f"; then
    unresolvable+=("$f")
  else
    if is_modify_delete "$f"; then
      modify_delete+=("$f")
    else
      # Modify/delete paths are excluded from the structural pass BY
      # CONSTRUCTION, not filtered out afterwards. Git writes no markers for
      # one — it leaves the surviving side's content verbatim — so a
      # marker-free result there is not a solve, and staging it would silently
      # resurrect a file the branch deliberately deleted, without the model
      # ever seeing the path.
      structural_candidates+=("$f")
    fi
    llm_list+=("$f")
  fi
done

if [[ ${#unresolvable[@]} -gt 0 ]]; then
  echo "Unmergeable conflict(s) '${unresolvable[*]}' — no textual resolution exists; handing off to a human."
  {
    echo "needs_llm=false"
    echo "needs_commit=false"
    echo "unresolvable=${unresolvable[*]}"
  } >>"$out"
  exit 0
fi

# A conflict in any of these touches something sensitive — this repo's Claude
# configuration (.claude/: hooks, skills, settings) or ALL of its CI machinery
# (.github/ — workflows, scripts, and the composite actions that run with the
# job's write token). These are still handed to the LLM; the land step flags them for
# human review in the comment posted with the pushed resolution.
#
# Override the protected set with AUTO_RESOLVE_PROTECTED_RE (an ERE tested against
# each conflicted path): a repo with more sensitive trees widens it (e.g.
# '^(\.claude/|\.github/|infra/|secrets/)'); the default keeps this template's two
# areas. The predicate is shared with the land step, so both read one definition.
protected_hits=()
while IFS= read -r f; do
  [[ -n "$f" ]] && protected_hits+=("$f")
done < <(protected_matches "${conflicts[@]}")
if [[ ${#protected_hits[@]} -gt 0 ]]; then
  echo "Conflict in protected path(s) '${protected_hits[*]}' — the land step will flag for human review; still auto-resolving."
fi

# Structural pre-pass: a syntax-aware merge. Where git compares lines, mergiraf
# parses both sides and merges by syntax node, so two branches that each add a
# different import, a different key to the same object, or move a declaration
# past one another are merged rather than conflicting. Every file it fully
# solves is staged here and never reaches the paid model pass.
#
# A file counts as solved only on exit 0 AND a marker-free result. `-p` prints to
# stdout and leaves the file untouched, so anything less than a full solve
# reaches the model byte-identical to what git wrote.
#
# The binary is REQUIRED once there is a source conflict. A missing tool that
# silently routed every structural conflict to the paid pass is the inert-feature
# failure: nothing goes red, the feature is simply dead, and the only symptom is
# the bill. Override with MERGIRAF_BIN for tests.
if [[ ${#structural_candidates[@]} -gt 0 ]]; then
  mergiraf_bin="${MERGIRAF_BIN:-mergiraf}"
  command -v "$mergiraf_bin" >/dev/null || {
    echo "auto-resolve/prepare: '${mergiraf_bin}' not found on PATH. The resolve job installs it" >&2
    echo "  via .github/scripts/install-mergiraf.sh; refusing to silently skip the structural" >&2
    echo "  pre-pass and route every structural conflict to the paid model pass." >&2
    exit 1
  }
  mergiraf_scratch="$(mktemp -d)"
  trap 'rm -rf "$mergiraf_scratch"' EXIT
  structurally_solved=()
  still_conflicted=()
  for f in "${structural_candidates[@]}"; do
    # -s (non-empty) is load-bearing, not belt-and-braces. mergiraf exits 0 and
    # prints NOTHING when it cannot generate a solution, so an exit-status and
    # marker-absence test alone accepts an empty result — and this loop would
    # then overwrite the conflicted file with nothing, stage it, and drop it
    # from the model's list. Silent data loss, reported as a structural solve.
    if timeout 60 "$mergiraf_bin" solve -p "./${f}" >"$mergiraf_scratch/solved" 2>"$mergiraf_scratch/log" &&
      [[ -s "$mergiraf_scratch/solved" ]] &&
      ! grep -q '^<<<<<<<' "$mergiraf_scratch/solved"; then
      cat "$mergiraf_scratch/solved" >"$f"
      git add "./${f}"
      structurally_solved+=("$f")
    else
      still_conflicted+=("$f")
    fi
  done
  # Both halves are logged, because together they are the only measurement of
  # what this pass is worth: solved / (solved + left) over a run of real
  # resolves is the share of structural conflicts that never cost a model call.
  if [[ ${#still_conflicted[@]} -gt 0 ]]; then
    echo "mergiraf left ${#still_conflicted[@]} conflict(s) for the model: ${still_conflicted[*]}"
  fi
  if [[ ${#structurally_solved[@]} -gt 0 ]]; then
    echo "mergiraf structurally resolved ${#structurally_solved[@]} conflict(s): ${structurally_solved[*]}"
    # Drop the solved paths from the model's list, keeping every other member
    # (the modify/delete paths never entered structural_candidates).
    remaining=()
    for f in "${llm_list[@]}"; do
      solved=false
      for s in "${structurally_solved[@]}"; do [[ "$f" == "$s" ]] && solved=true && break; done
      [[ "$solved" == true ]] || remaining+=("$f")
    done
    llm_list=("${remaining[@]}")
  fi
fi

needs_llm=false
[[ ${#llm_list[@]} -gt 0 ]] && needs_llm=true
echo "Handing ${#llm_list[@]} source conflict(s) to Claude: ${llm_list[*]:-<none>}"
if [[ ${#deferred_regen[@]} -gt 0 ]]; then
  echo "Deferring ${#deferred_regen[@]} generated file(s) to post-LLM regeneration: ${deferred_regen[*]}"
fi
if [[ ${#modify_delete[@]} -gt 0 ]]; then
  echo "Modify/delete conflict(s) '${modify_delete[*]}' — each needs an explicit keep-or-delete verdict from the resolver."
fi
{
  echo "needs_llm=${needs_llm}"
  echo "needs_commit=true"
  echo "conflict_list=${llm_list[*]:-}"
  echo "deferred_regen=${deferred_regen[*]:-}"
  echo "modify_delete=${modify_delete[*]:-}"
} >>"$out"
