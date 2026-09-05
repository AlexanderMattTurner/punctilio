#!/usr/bin/env bash
# Sync template files into the current repo, producing outputs consumed by
# .github/workflows/template-sync.yaml.
#
# Inputs (env):
#   SYNC_PATHS        Space-separated paths to sync from the template
#                     (path names containing spaces are NOT supported)
#   EXCLUDE_PATHS     Space-separated paths to exclude. An entry names one file
#                     or one directory, and a directory entry covers every file
#                     under it.
#   OPT_IN_PATHS      Space-separated paths the template only UPDATES, never
#                     INTRODUCES: absent from the child repo, they are skipped;
#                     present, they sync normally. Opting in is creating the file
#                     once; opting out is deleting it.
#   GITHUB_OUTPUT     Path to GitHub Actions output file
#
# Assumes a sibling `_template/` directory containing a checkout of the
# template repository at the desired ref. Reads `.template-version` (if
# present) for the previously synced SHA and overwrites it with the new one.
#
# Side effects:
#   - Creates/updates files inside the current repo to match the template
#   - Writes /tmp/conflict_files.txt, /tmp/conflict_report.md,
#     /tmp/deleted_files.txt, /tmp/auto_merged_files.txt,
#     /tmp/declined_files.txt, /tmp/inert_entries.txt
#   - Writes .template-sync-conflicts if there are unresolved conflicts
#   - Appends key=value lines to $GITHUB_OUTPUT

set -euo pipefail

# Re-exec from an immutable copy outside any synced path. This script lives
# under .github/scripts, a synced path, so mid-run the sync overwrites its own
# file. bash reads a running script incrementally and, after the trailing
# `main "$@"` returns, resumes reading top-level input at a saved byte offset;
# a longer replacement shifts that offset into the new file's bytes and bash
# executes a truncated fragment ("unexpected EOF while looking for matching
# quote"). The main() wrapper below defers execution but NOT that post-main
# resume, so it is not sufficient on its own. Running from a $TMPDIR copy the
# sync never touches removes the hazard entirely. The re-exec'd pass removes
# its own copy on exit (guard: only when $0 is the copy we created).
if [[ -z "${TEMPLATE_SYNC_REEXEC:-}" ]]; then
  _self_copy="$(mktemp)"
  cat "$0" >"$_self_copy"
  TEMPLATE_SYNC_REEXEC="$_self_copy" exec bash "$_self_copy" "$@"
fi
[[ "${TEMPLATE_SYNC_REEXEC:-}" == "$0" ]] && trap 'rm -f "$0"' EXIT

# Wrap all logic in main(), called as the final line. bash reads a running
# script incrementally from disk, not all at once — this script overwrites
# its own file when SYNC_PATHS includes the directory it lives in, so any
# top-level statement below the self-overwrite would read shifted bytes.
# Deferring everything behind main() forces bash to parse through this
# file's closing brace and the trailing `main "$@"` call before executing
# any of it.
main() {

  SYNC_PATHS="${SYNC_PATHS:-}"
  EXCLUDE_PATHS="${EXCLUDE_PATHS:-}"
  OPT_IN_PATHS="${OPT_IN_PATHS:-}"
  : "${GITHUB_OUTPUT:?GITHUB_OUTPUT must be set}"

  # Allow tests to point at alternative temp dirs.
  WORK_DIR="${TEMPLATE_SYNC_WORK_DIR:-/tmp}"
  CONFLICT_FILES="$WORK_DIR/conflict_files.txt"
  CONFLICT_REPORT="$WORK_DIR/conflict_report.md"
  DELETED_FILES="$WORK_DIR/deleted_files.txt"
  AUTO_MERGED_FILES="$WORK_DIR/auto_merged_files.txt"
  DOWNGRADE_FILES="$WORK_DIR/downgrade_files.txt"
  DOWNGRADE_REPORT="$WORK_DIR/downgrade_report.md"
  DECLINED_FILES="$WORK_DIR/declined_files.txt"
  INERT_ENTRIES="$WORK_DIR/inert_entries.txt"
  PREV_TEMPLATE_FILES="$WORK_DIR/prev_template_files.txt"

  : >"$CONFLICT_FILES"
  : >"$CONFLICT_REPORT"
  : >"$DELETED_FILES"
  : >"$AUTO_MERGED_FILES"
  : >"$DOWNGRADE_FILES"
  : >"$DOWNGRADE_REPORT"
  : >"$DECLINED_FILES"
  : >"$INERT_ENTRIES"
  # WORK_DIR persists between runs, so a stale list from an earlier run would
  # otherwise feed the deleted-in-template scan below.
  : >"$PREV_TEMPLATE_FILES"

  # An EXCLUDE_PATHS entry names one file or one directory, and a directory
  # entry covers every file under it. The `/`* arm is what makes the directory
  # form work: the sync tests one file path at a time, so a directory entry
  # never equals the path of a file inside it, and an equality-only test syncs
  # every file the entry was written to keep out.
  is_excluded() {
    local candidate="$1" exclude
    for exclude in $EXCLUDE_PATHS; do
      [[ "$candidate" = "$exclude" || "$candidate" = "$exclude"/* ]] && return 0
    done
    return 1
  }

  # PROBLEM CLASS — a template file the adopter deleted comes back on the next
  # sync. Case 1 copies in any template file the adopter does not have, so a
  # deletion there survives only until the next sync run: one sync restored 44
  # files an adopter had already removed more than once. This refusal is what
  # makes that deletion hold.
  #
  # The evidence is the adopter's own history, not the template's tree. A commit
  # that deleted the path IS the adopter saying it does not want the file. The
  # template tree at PREV_SHA only says the file was available then, which is
  # also true of every template file the adopter never adopted — reading that as
  # a deletion would decline a genuinely new file forever. A path with no
  # deletion commit was never there, so it is new and still arrives. The sync
  # checks out with fetch-depth: 0; a shallow checkout finds no deletion and
  # falls back to copying in.
  was_deleted_here() {
    [[ -n "$(git log --diff-filter=D --format=%H -1 -- "$1")" ]]
  }

  # PROBLEM CLASS — a configuration entry that is accepted and matches nothing.
  # An EXCLUDE_PATHS or OPT_IN_PATHS entry naming a path the template does not
  # ship covers nothing, and it fails silently: the entry sits in the list, the
  # sync treats the file as unlisted, and the list reads as though it covers it.
  # This warning is what makes a misspelled or stale entry visible. Read the
  # template tree before the run deletes it.
  report_inert_entries() {
    local entry
    for entry in $EXCLUDE_PATHS $OPT_IN_PATHS; do
      [[ -e "_template/$entry" ]] && continue
      echo "::warning::list entry names nothing in the template: $entry"
      echo "$entry" >>"$INERT_ENTRIES"
    done
  }

  # A file the template may update but must never introduce. Some template
  # features are only correct in a repo that has no equivalent of its own — the
  # release workflow is the case that motivated this: a consumer with its own
  # publisher that also received auto-version.yaml ended up with two workflows
  # racing the same semver bump on every push to the default branch.
  # An OPT_IN_PATHS entry names one file or one directory, on the same terms as
  # is_excluded above.
  is_opt_in() {
    local candidate="$1" opt_in
    for opt_in in $OPT_IN_PATHS; do
      [[ "$candidate" = "$opt_in" || "$candidate" = "$opt_in"/* ]] && return 0
    done
    return 1
  }

  # Generate a random sentinel suffix. Prefers /proc/sys/kernel/random/uuid
  # (always present on Linux runners and inside containers) but falls back to
  # `uuidgen` or $RANDOM so the script works in stripped-down environments.
  random_token() {
    if [[ -r /proc/sys/kernel/random/uuid ]]; then
      cat /proc/sys/kernel/random/uuid
    elif command -v uuidgen >/dev/null 2>&1; then
      uuidgen
    else
      printf '%s_%s_%s' "$$" "$RANDOM" "$RANDOM"
    fi
  }

  # Emit a multi-line GITHUB_OUTPUT block using a random-suffixed sentinel so
  # user-controlled content can't accidentally terminate the block early.
  emit_multiline_output() {
    local key="$1" content="$2" sentinel
    sentinel="EOF_$(random_token)"
    {
      echo "${key}<<${sentinel}"
      printf '%s\n' "$content"
      echo "$sentinel"
    } >>"$GITHUB_OUTPUT"
  }

  # Say WHY the tree changed: name each template commit that moved a file THIS
  # sync actually rewrote, and the files it moved. The old body pasted a raw
  # `git log --oneline` of the whole template, most of whose commits touch paths
  # this repo never syncs — so the reader could not tell which commit explains
  # any given file. Runs before `rm -rf _template`, and after the worktree
  # carries the sync, because it needs both.
  #
  # A file with no commit in range is listed apart rather than dropped: it is
  # real (a path synced for the first time, or a history the template rewrote),
  # and silence about it would read as "nothing else changed".
  emit_attributed_changelog() {
    local changed body="" attributed unexplained kept=0 skipped=0
    local -a range
    changed="$WORK_DIR/changed_here.txt"
    attributed="$WORK_DIR/attributed.txt"
    # `sed`, not `grep -v`: an all-filtered list makes grep exit 1 and `set -e`
    # would kill the run. `.template-version` is rewritten above and the template
    # ships none, so no commit can ever explain it; `_template` is this script's
    # own untracked checkout, which `--others` reports and `rm -rf` removes a few
    # lines below. Both would land in the unexplained list on every single sync.
    {
      git diff --name-only
      git ls-files --others --exclude-standard
    } | sed -e '/^\.template-version$/d' -e '\#^_template/\?$#d' | sort -u >"$changed"
    [[ -s "$changed" ]] || return 0
    local changed_list
    changed_list="$(tr '\n' ' ' <"$changed")"
    echo "changed_files=$changed_list" >>"$GITHUB_OUTPUT"

    [[ -n "$PREV_SHA" && "$PREV_SHA" != "$TEMPLATE_SHA" ]] || return 0
    if git -C _template cat-file -e "$PREV_SHA" 2>/dev/null; then
      range=("${PREV_SHA}..${TEMPLATE_SHA}")
    else
      echo "::warning::Previous template SHA $PREV_SHA is not in template history (force-push or rebase); attributing over the last 20 commits instead"
      range=(-20 "$TEMPLATE_SHA")
      body+="\`$PREV_SHA\` is no longer in the template's history, so this reads the last 20 commits rather than a range."$'\n\n'
    fi

    : >"$attributed"
    local sha subject touched
    while IFS=$'\t' read -r sha subject; do
      [[ -n "$sha" ]] || continue
      # Files this commit touched that this sync also rewrote here. `comm -12`
      # over two sorted lists, so a commit touching only unsynced paths yields
      # nothing and is skipped.
      touched=$(comm -12 \
        <(git -C _template show --pretty=format: --name-only "$sha" | sed '/^$/d' | sort -u) \
        "$changed")
      if [[ -z "$touched" ]]; then
        skipped=$((skipped + 1))
        continue
      fi
      kept=$((kept + 1))
      body+="- \`${sha}\` ${subject}"$'\n'
      while IFS= read -r f; do
        [[ -n "$f" ]] || continue
        body+="  - \`${f}\`"$'\n'
        echo "$f" >>"$attributed"
      done <<<"$touched"
      # --no-merges: `git show --name-only` prints nothing for a merge commit, so
      # a merge would count as "touched nothing here" while being exactly the
      # commit that carried the files. Its branch commits are already in range.
    done < <(git -C _template log --no-merges --format='%h%x09%s' "${range[@]}")

    unexplained=$(comm -23 "$changed" <(sort -u "$attributed"))
    if [[ -n "$unexplained" ]]; then
      body+=$'\n'"Changed here with no commit in that range — a path synced for the first time, or one whose template history moved:"$'\n'
      while IFS= read -r f; do
        [[ -n "$f" ]] || continue
        body+="- \`${f}\`"$'\n'
      done <<<"$unexplained"
    fi
    [[ "$skipped" -eq 0 ]] || body+=$'\n'"${skipped} other template commit(s) in that range touched nothing this repo syncs."$'\n'
    [[ "$kept" -eq 0 && -z "$unexplained" ]] || emit_multiline_output "changelog" "$body"
  }

  # Count non-blank lines present in the pre-sync local file but absent from a
  # candidate result. A clean 3-way merge should preserve every adopter line; a
  # nonzero count means the merge REMOVED content the adopter had — the silent
  # downgrade this report exists to surface. Order-insensitive (sorted comm) so a
  # merely-moved line does not count. grep -c exits 1 with "0" when nothing
  # matches, so the ||-default keeps set -e from aborting on an all-preserved file.
  count_dropped_lines() {
    local local_f="$1" result_f="$2" n
    n=$(comm -23 <(sort "$local_f") <(sort "$result_f") |
      grep -cv '^[[:space:]]*$') || n=0
    printf '%s' "${n:-0}"
  }

  #############################################
  # Version tracking
  #############################################

  TEMPLATE_SHA=$(git -C _template rev-parse HEAD)
  TEMPLATE_SHA_SHORT="${TEMPLATE_SHA:0:7}"
  {
    echo "template_sha=$TEMPLATE_SHA"
    echo "template_sha_short=$TEMPLATE_SHA_SHORT"
  } >>"$GITHUB_OUTPUT"

  PREV_SHA=""
  if [[ -f .template-version ]]; then
    PREV_SHA=$(cat .template-version)
    echo "Previous template version: $PREV_SHA"
  else
    echo "No previous template version found (first sync)"
  fi
  echo "Current template version: $TEMPLATE_SHA"

  echo "$TEMPLATE_SHA" >.template-version

  #############################################
  # File processing
  #############################################

  # Resolve a single file's sync outcome using a 3-way merge strategy:
  #
  #   base     = the file at PREV_SHA in the template (last known common ancestor)
  #   local    = the current file in the child repo
  #   template = the file at HEAD in the template
  #
  # Decision tree:
  #   1. File is new in template → copy it in.
  #   2. Files are already identical → no-op.
  #   3. No merge base (first sync or lost history) → apply template, record conflict.
  #   4. Template is unchanged since base → local diverged alone; keep local.
  #   5. Local is unchanged since base → template advanced alone; adopt template.
  #   6. Both sides changed → attempt a 3-way merge:
  #      a. Clean merge → write merged result.
  #      b. Conflict → write conflict markers for Claude to resolve.
  process_file() {
    local rel_path="$1"
    local template_file="_template/$rel_path"

    # Case 0: the child deliberately made this path a symlink (e.g. a dotfiles
    # repo pointing .claude/settings.json at another repo it clones at runtime).
    # Never overwrite it — cp through a dangling symlink errors out, and cp
    # through a live one would clobber the link's target instead of the link.
    # Leave the local structure alone.
    if [[ -L "$rel_path" ]]; then
      echo "Skipping symlink: $rel_path (local structure preserved)"
      return
    fi

    local parent_dir
    parent_dir=$(dirname "$rel_path")

    # Case 0: the child deliberately made this path — or an ancestor directory —
    # a symlink (e.g. a dotfiles repo pointing .claude/settings.json or
    # .claude/hooks/ at another repo it clones at runtime). Never write it: cp
    # through a dangling link errors out, through a live one it escapes into the
    # link target, and mkdir -p on a symlinked directory fails outright. Leave
    # the local structure alone; checked before the mkdir below.
    if [[ -L "$rel_path" ]]; then
      echo "Skipping symlink: $rel_path (local structure preserved)"
      return
    fi
    local ancestor="$parent_dir"
    while [[ "$ancestor" != "." && "$ancestor" != "/" && -n "$ancestor" ]]; do
      if [[ -L "$ancestor" ]]; then
        echo "Skipping under symlinked dir: $rel_path ($ancestor is a symlink)"
        return
      fi
      ancestor=$(dirname "$ancestor")
    done

    if [[ "$parent_dir" != "." ]]; then
      mkdir -p "$parent_dir"
      [[ -d "$parent_dir" ]] || {
        echo "::error::could not create $parent_dir for $rel_path" >&2
        return 1
      }
    fi

    # Case 1: absent locally — a new template file, unless the adopter removed it.
    if [[ ! -f "$rel_path" ]]; then
      if is_opt_in "$rel_path"; then
        echo "Opt-in only, not present locally: $rel_path (skipping — copy it from the template to adopt it)"
        return
      fi
      if was_deleted_here "$rel_path"; then
        echo "Declined: $rel_path (deleted in the adopter since the last sync; not re-added)"
        echo "$rel_path" >>"$DECLINED_FILES"
        return
      fi
      cp "$template_file" "$rel_path"
      echo "Added: $rel_path"
      return
    fi

    # Case 2: already identical.
    if diff -q "$rel_path" "$template_file" >/dev/null 2>&1; then
      return
    fi

    # Case 3: no merge base — first sync or history unavailable.
    if [[ -z "$PREV_SHA" ]]; then
      record_no_base_conflict "$rel_path" "$template_file"
      return
    fi

    local safe_name
    safe_name=$(echo "$rel_path" | tr '/' '_')
    local base_file="$WORK_DIR/merge_base_${safe_name}"

    if ! git -C _template show "${PREV_SHA}:${rel_path}" >"$base_file" 2>/dev/null; then
      rm -f "$base_file"
      record_no_base_conflict "$rel_path" "$template_file"
      return
    fi

    # Case 4: template unchanged since base — local diverged alone; keep local.
    if diff -q "$base_file" "$template_file" >/dev/null 2>&1; then
      echo "Unchanged in template: $rel_path (keeping local version)"
      rm -f "$base_file"
      return
    fi

    # Case 5: local unchanged since base — template advanced alone; adopt it.
    if diff -q "$base_file" "$rel_path" >/dev/null 2>&1; then
      cp "$template_file" "$rel_path"
      echo "Updated: $rel_path (local was unmodified)"
      rm -f "$base_file"
      return
    fi

    # Case 6: both sides changed — attempt a 3-way merge.
    local merge_result="$WORK_DIR/merge_result_${safe_name}"
    cp "$rel_path" "$merge_result"

    # --diff3 keeps the merge-base section between `|||||||` and `=======` in a
    # conflict. It is what lets the structural resolver work on the result at
    # all: mergiraf refuses a diff2-style conflict outright and returns no
    # solution, so without this every sync conflict would need a model or a
    # human. It also shows a human reviewer what the text was before either side
    # touched it.
    if git merge-file --diff3 -L "local" -L "base" -L "template" \
      "$merge_result" "$base_file" "$template_file" 2>/dev/null; then
      # Detect a silent downgrade: the merge base here is the single repo-wide
      # PREV_SHA, which can be STALE for a file first synced at a different
      # template SHA. A stale base makes git report a "clean" merge while
      # actually dropping adopter-modified lines. Measure that against the
      # pre-sync local ($rel_path, not yet overwritten) and surface it loudly so
      # the reviewer never trusts "auto-merged" to mean "nothing lost".
      local dropped
      dropped=$(count_dropped_lines "$rel_path" "$merge_result")
      cp "$merge_result" "$rel_path"
      echo "Auto-merged: $rel_path (clean 3-way merge)"
      echo "$rel_path" >>"$AUTO_MERGED_FILES"
      if [[ "${dropped:-0}" -gt 0 ]]; then
        echo "$rel_path" >>"$DOWNGRADE_FILES"
        # %s are printf specifiers, not shell expansions; single quotes are correct.
        # shellcheck disable=SC2016
        printf -- '- `%s` — auto-merge dropped %s line(s) present in the local copy\n' \
          "$rel_path" "$dropped" >>"$DOWNGRADE_REPORT"
      fi
      rm -f "$base_file" "$merge_result"
      return
    fi

    # Case 6b: conflict markers produced — keep them for Claude to resolve.
    cp "$merge_result" "$rel_path"
    echo "CONFLICT (merge markers): $rel_path"
    echo "$rel_path" >>"$CONFLICT_FILES"
    {
      echo "### \`$rel_path\`"
      echo ""
      echo "3-way merge produced **conflict markers** (\`<<<<<<<\`/\`=======\`/\`>>>>>>>\`)."
      echo "Resolve them: keep local customizations, adopt template improvements."
      echo ""
      echo "<details>"
      echo "<summary>View file with conflict markers</summary>"
      echo ""
      echo "\`\`\`"
      head -500 "$rel_path"
      echo "\`\`\`"
      echo "</details>"
      echo ""
    } >>"$CONFLICT_REPORT"
    rm -f "$base_file" "$merge_result"
  }

  record_no_base_conflict() {
    local rel_path="$1" template_file="$2"
    echo "CONFLICT (no base): $rel_path"
    echo "$rel_path" >>"$CONFLICT_FILES"
    {
      echo "### \`$rel_path\`"
      echo ""
      echo "No merge base available (first sync or file history unavailable)."
      echo "Template version has been applied. Restore any important local customizations."
      echo ""
      echo "<details>"
      echo "<summary>Diff (old local → new template)</summary>"
      echo ""
      echo "\`\`\`diff"
      # diff exits 0 (identical) or 1 (differs); anything higher is a real error.
      # Capture into a variable so truncating with `head` can't SIGPIPE the diff.
      diff_rc=0
      diff_out=$(diff -u "$rel_path" "$template_file") || diff_rc=$?
      [[ "${diff_rc:-0}" -le 1 ]] || exit "${diff_rc}"
      head -500 <<<"$diff_out"
      echo "\`\`\`"
      echo "</details>"
      echo ""
    } >>"$CONFLICT_REPORT"
    cp "$template_file" "$rel_path"
  }

  #############################################
  # Detect deleted files + process sync paths
  #############################################

  # A path is "deleted" only if it existed in the template at PREV_SHA but no
  # longer exists at the current template HEAD. This avoids false positives for
  # project-specific files that were never in the template.
  if [[ -n "$PREV_SHA" ]]; then
    if ! git -C _template ls-tree -r --name-only "$PREV_SHA" 2>/dev/null >"$PREV_TEMPLATE_FILES"; then
      : >"$PREV_TEMPLATE_FILES" # PREV_SHA not in template history; treat as no prior files
    fi
  fi

  for path in $SYNC_PATHS; do
    is_excluded "$path" && continue

    if [[ -n "$PREV_SHA" ]]; then
      while IFS= read -r prev_file; do
        case "$prev_file" in "$path" | "$path/"*) ;; *) continue ;; esac
        is_excluded "$prev_file" && continue
        if [[ ! -f "_template/$prev_file" ]]; then
          echo "DELETED in template: $prev_file"
          echo "$prev_file" >>"$DELETED_FILES"
        fi
      done <"$PREV_TEMPLATE_FILES"
    fi

    if [[ ! -e "_template/$path" ]]; then
      echo "Warning: $path not found in template, skipping"
      continue
    fi

    if [[ -d "_template/$path" ]]; then
      while IFS= read -r template_file; do
        rel_path="${template_file#_template/}"
        is_excluded "$rel_path" && continue
        process_file "$rel_path"
      done < <(find "_template/$path" -type f)
    else
      process_file "$path"
    fi
  done

  report_inert_entries
  emit_attributed_changelog
  rm -rf _template

  #############################################
  # Set outputs
  #############################################

  if [[ -s "$AUTO_MERGED_FILES" ]]; then
    auto_merged=$(tr '\n' ' ' <"$AUTO_MERGED_FILES")
    echo "auto_merged_files=$auto_merged" >>"$GITHUB_OUTPUT"
  fi

  if [[ -s "$INERT_ENTRIES" ]]; then
    inert=$(tr '\n' ' ' <"$INERT_ENTRIES")
    echo "inert_entries=$inert" >>"$GITHUB_OUTPUT"
  fi

  if [[ -s "$DECLINED_FILES" ]]; then
    declined=$(tr '\n' ' ' <"$DECLINED_FILES")
    echo "declined_files=$declined" >>"$GITHUB_OUTPUT"
  fi

  # Downgrade risk: files whose "clean" auto-merge dropped adopter content. This
  # is the loud counterpart to the silent regression the sync used to ship — the
  # PR body renders it as a prominent "adopter is ahead" section so the reviewer
  # eyeballs exactly these files instead of trusting the auto-merge.
  if [[ -s "$DOWNGRADE_FILES" ]]; then
    downgrade=$(tr '\n' ' ' <"$DOWNGRADE_FILES")
    {
      echo "has_downgrades=true"
      echo "downgrade_files=$downgrade"
    } >>"$GITHUB_OUTPUT"
    downgrade_report_content="$(cat "$DOWNGRADE_REPORT")"
    emit_multiline_output "downgrade_report" "$downgrade_report_content"
  else
    echo "has_downgrades=false" >>"$GITHUB_OUTPUT"
  fi

  if [[ -s "$CONFLICT_FILES" ]]; then
    # paste, not `tr '\n' ' '`: the file ends in a newline, so tr leaves a
    # TRAILING space. That space reaches .template-sync-conflicts below, where
    # pre-commit's trailing-whitespace hook rewrites the file and fails the run —
    # on every consumer that has a conflict.
    conflicts=$(paste -sd' ' "$CONFLICT_FILES")
    {
      echo "has_conflicts=true"
      echo "conflict_files=$conflicts"
    } >>"$GITHUB_OUTPUT"
    # Cap the total conflict report before it becomes the PR body. GitHub passes
    # the body to the create-pull-request action through the environment, and a
    # body over the exec arg/env limit aborts PR creation with E2BIG ("Argument
    # list too long") before it starts -- reached when many files have no merge
    # base (each contributes a full old->new diff). The complete conflicted-file
    # list is preserved in .template-sync-conflicts, so truncating the narrative
    # detail here loses nothing load-bearing.
    max_report_bytes=60000
    if [[ "$(wc -c <"$CONFLICT_REPORT")" -gt "$max_report_bytes" ]]; then
      capped="${CONFLICT_REPORT}.capped"
      head -c "$max_report_bytes" "$CONFLICT_REPORT" | sed '$d' >"$capped"
      printf '\n\n_Conflict report truncated at %d KB. Every conflicted file is listed in .template-sync-conflicts._\n' "$((max_report_bytes / 1000))" >>"$capped"
      mv "$capped" "$CONFLICT_REPORT"
    fi
    conflict_report_content="$(cat "$CONFLICT_REPORT")"
    emit_multiline_output "conflict_report" "$conflict_report_content"
    echo "Template updates available for: $conflicts" >.template-sync-conflicts
  else
    echo "has_conflicts=false" >>"$GITHUB_OUTPUT"
    rm -f .template-sync-conflicts
  fi

  if [[ -s "$DELETED_FILES" ]]; then
    deleted=$(tr '\n' ' ' <"$DELETED_FILES")
    {
      echo "has_deletions=true"
      echo "deleted_files=$deleted"
    } >>"$GITHUB_OUTPUT"
  else
    echo "has_deletions=false" >>"$GITHUB_OUTPUT"
  fi

  if git diff --quiet && [[ -z "$(git ls-files --others --exclude-standard)" ]]; then
    echo "has_changes=false" >>"$GITHUB_OUTPUT"
  else
    changed_paths=$({
      git diff --name-only
      git ls-files --others --exclude-standard
    } | tr '\n' ' ')
    {
      echo "has_changes=true"
      echo "changed_paths=$changed_paths"
    } >>"$GITHUB_OUTPUT"
  fi
}

main "$@"
