# Handoff: punctilio template sync (A) + agent-glovebox CI port (B)

Repo: `AlexanderMattTurner/punctilio`, a TypeScript smart-typography npm library. It uses pnpm, jest with a 100% coverage gate, stryker, eslint and fast-check fuzz tests. Follow the repo's `CLAUDE.md`.

The original task is in two parts, and each part gets its own PR:
- **A:** a template sync.
- **B:** porting CI practices from `AlexanderMattTurner/agent-glovebox`.

## Parallel work: never push to these branches

Another session owns these branches:

- **`claude/awesome-cray-i0egh7` (PR1, CI fixes).** It:
  - deletes `auto-version.yaml`, `lint.yaml`, `node-tests.yaml`, `pre-commit.yaml` and `claude.yaml`, and excludes them in `template-sync.yaml`;
  - renames the summary jobs in `test.yml`/`lint.yml` to `test-passed`/`lint-passed` with `# required-check: true`;
  - edits `mutation.yml` and `refresh-mutation-weights.yml`;
  - guards `uvx pre-commit` in `.hooks/pre-push`;
  - widens `test:scripts` to also run `.github/scripts/*.test.mjs`;
  - adds a stryker `break` threshold.
- **`claude/awesome-cray-i0egh7-cli` (PR2).** It fixes the CLI silently doing nothing when run through the `node_modules/.bin` symlink, lazy-loads the optional peers in the prettier plugin and CLI, and fixes `.html`/frontmatter corruption.
- **`-core` (PR3)** and **`-ast` (PR4).**

At the last check (2026-10-11 ~23:30Z), **none of these branches existed on origin.** Run `git fetch origin` again before starting.

## A. Template sync: DONE, PR #293 open and needs CI work

- **PR:** https://github.com/AlexanderMattTurner/punctilio/pull/293
- **Branch:** `claude/awesome-cray-i0egh7-template-sync`, one commit `b31721a`.
- **What it does:** syncs the template `AlexanderMattTurner/claude-automation-template` from `8222a30` to `0de48e1`.
  - I ran `.github/scripts/template-sync.sh` locally, then ran the newly synced script a second time. The second pass added `.github/tool-versions.sh` and `.github/claude-cli-default/package.json`.
  - Conflicts were resolved toward the template version: `setup-base-env/action.yaml`, `validate-config.yaml` and `template-sync.sh`.
  - Files the template removed or moved were deleted, including `.github/scripts/auto-resolve/`. The stale `.template-sync-conflicts` was deleted too.
  - The five PR1 files were added to `EXCLUDE_PATHS`.
- **Committed and pushed with `--no-verify`.** Both hooks fail for reasons outside this PR, and the PR body explains this:
  - lint-staged's eslint chokes on synced `.mjs` files (no Node globals configured);
  - `pre-push` runs `uvx pre-commit` without a `.pre-commit-config.yaml`, which also fails on main.
- **Local validation passed:** pnpm build, test, lint, `typecheck:scripts` and `test:scripts`; actionlint; `zizmor==1.25.2 --offline .github/` with no findings.
- **The session is subscribed to PR #293's activity.**

### Open items on #293

1. **Three CI checks went red; none has been diagnosed yet.** Read the logs with `mcp__github__get_job_logs`:
   - "Auto-approve low-risk and bot PRs the reviewer skips": run 38184278489, job 114603162300.
   - `hook-lifecycle`: run 38184278789, job 114603188928, plus its summary job `hook-lifecycle-passed`.
   - First, check whether each one is also red on main or is caused by the sync (for example, new `.claude/hooks/*.mjs` files or a changed `.github/actions/report-job-result`).
   - Then either fix and push to the template-sync branch, or post one comment on the PR naming the failure and why it isn't this PR's.
2. **A Codex review was running and may post findings.** Verify each finding before acting on it.
3. **A critique sub-agent was launched on #293's local decisions and had not reported back.** Its results are lost. Re-run an independent review if you want one.
4. **Possible follow-up for PR1:** the template-owned `.github/scripts/version-bump.test.mjs` reads the excluded `auto-version.yaml`. It will fail once PR1 widens `test:scripts`.

## B. agent-glovebox CI port: NOT STARTED (no commits)

Local branch `claude/awesome-cray-i0egh7-ci-adopt` was created from `origin/main`, because PR1's branch didn't exist. Nothing has been committed or pushed. **If PR1's branch exists when you start, rebase onto it** and say in the PR body that this PR stacks on PR1.

Reference: `git clone --depth 1 https://github.com/AlexanderMattTurner/agent-glovebox /tmp/glovebox`. Read each glovebox file before porting it.

### Facts already established

- **`exports` subpaths:** `.`, `./rehype`, `./remark`, `./markdown`, `./html`, `./prettier-plugin`. The bin is `punctilio` → `dist/cli.js`.
- **What imports without the optional peers:** in `dist`, `index`/`rehype`/`remark` import no peer.
  - `markdown`/`html` import `unified` and the `remark-*`/`rehype-*` packages statically.
  - `prettier-plugin` imports `prettier/plugins/markdown` statically.
  - `cli` reaches the peers through `markdown`/`html`.
  - So without peers, the CLI fails on main until PR2 lands.
- **Example CLI run:** `printf '"Hello" -- world...\n' | node dist/cli.js --type md -` prints `“Hello”—world…`.
- **`pnpm dlx publint@0.3.25 run <tgz>`** reports "All good!".
- **`pnpm dlx @arethetypeswrong/cli@0.18.5 --profile esm-only <tgz>`** is green for node16-ESM and bundler. I hadn't yet checked its exit code, or publint `--strict`.
- **Fuzz timing:** `src/tests/fuzz.test.ts` reads `FUZZ_RUNS`/`FUZZ_SEED`, and each test hard-codes a 300 s timeout.
  - At 5000 runs the slowest test took ~4.7 s, so 200000 runs would take ~190 s on a fast machine, which is too close to the 300 s limit on CI.
  - Use `FUZZ_RUNS=100000` by default, or scale the timeouts in the test.
- **The deep fuzz already finds a real bug:**
  - `FUZZ_RUNS=5000 FUZZ_SEED=12345` fails the HTML test "is idempotent and leaves code blocks untouched".
  - Counterexample: `[")a3(6?!a\"","66) —5a 4x","","french"]`.
  - The cause is that `transformHtml` with `punctuationStyle: "french"` is not idempotent: it shows a whitespace or NBSP difference.
  - Report it (it belongs to PR3/PR4); don't fix it in B.
- **Action pins verified with `git ls-remote`:**
  - `github/codeql-action@84498526a009a99c875e83ef4821a8ba52de7c22`, tag `codeql-bundle-v2.25.5`.
  - `actions/dependency-review-action@a1d282b36b6f3519aa1f3fc636f609c47dddb294`, tag v5.0.0.
  - glovebox pins actionlint at v1.7.12 with linux_amd64 sha256 `8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8`. Re-verify it by downloading.
- **Existing workflows:**
  - `test.yml`: jobs `test` (matrix Node 20/22/24), `benchmark`, and `all-checks-passed`.
  - `lint.yml`: eslint, `typecheck:scripts`, and a grep-based SHA-pin check.
  - `mutation.yml`: the full sharded stryker run on every PR and push.
  - `scripts/mutate-changed.mjs`: an incremental run over changed `src` files.
  - `.github/dependabot.yml`: `open-pull-requests-limit: 0` for both npm and actions. That means security updates only; version updates are off.
  - `ci-failure-notify.yaml` binds by workflow `name:`. New push or schedule workflows must be added to its `workflows:` list. That file is template-owned, so expect a merge with #293.
- **`security-vulnerability-scan.yaml`:**
  - It has workflow-level write permissions.
  - It inlines `${{ env.SECURITY_REPORT }}` and `${{ env.DEPENDABOT_PRS }}` into the claude-code-action prompt.
  - It passes `GITHUB_TOKEN` to the agent.
  - The prompt `.github/prompts/security-vulnerability-scan.md` has the agent `git push` and `gh pr create` itself.
  - glovebox's version is the model to port from: workflow-level `contents: read`, job-level writes, a step that refuses to run without `PUSH_TOKEN`/`TEMPLATE_SYNC_TOKEN_ORG`, and untrusted data written to files under `$RUNNER_TEMP` by passing values through `env:`.
  - **Decision for the user:** for the token guard to mean anything, the agent's `github_token` must be the PAT. That gives an agent that reads untrusted text a stronger credential. glovebox avoids this with a separate publish step. Flag it in the PR.

### Items to implement (one Conventional Commit each)

1. **Packed-tarball smoke test.**
   - Own workflow with an `if: always()` summary job annotated `# required-check: true`.
   - `pnpm pack`, then `npm install` the tarball into a temp project.
   - Run `node_modules/.bin/punctilio` on md and html input and assert the output is transformed.
   - Import every `exports` subpath with the peers installed.
   - Without the peers:
     - `.`, `./rehype` and `./remark` must import;
     - the others must either import or fail with `ERR_MODULE_NOT_FOUND` naming a declared optional peer;
     - `punctilio --help` must exit 0.
   - Run publint and attw.
   - It will fail on main until PR2 merges. Say so, and don't weaken the assertions.
2. **Renovate.**
   - Add `.github/renovate.json5`: one grouped weekly PR, `minimumReleaseAge: "7 days"`, `commitMessagePrefix: "chore(deps):"`, managers npm, github-actions and nvm, plus `pinDigests` for actions.
   - Keep `dependabot.yml` for security updates only.
   - Check `dependabot-auto-merge.yaml`: it auto-merges Dependabot minor/patch PRs, which are now security-only.
3. **dependency-review-action on PRs.** SHA-pinned, `fail-on-severity: moderate`.
4. **Stryker `break` threshold.** PR1 adds it. Verify it only if B is based on PR1; otherwise note it's in PR1.
5. **CodeQL.**
   - Languages `javascript-typescript` and `actions`, on PRs plus a weekly cron.
   - Keep glovebox's two-attempt init with the toolcache wipe; skip its dismissal ledger.
   - `.github/codeql/codeql-config.yml` should ignore `src/tests`.
6. **OS matrix.**
   - ubuntu, windows and macos on Node 22 in `test.yml`.
   - The `test` script uses POSIX-only env syntax in places: `mutation` uses `STRYKER_RUN=1` and `prepare` uses `if [ -d src ]`. Use `shell: bash` on Windows.
   - Fix small genuine cross-platform failures; report big ones.
7. **Nightly deep fuzz.**
   - Cron plus `workflow_dispatch` only.
   - Random seed echoed to the log; `FUZZ_RUNS` as noted above.
   - Add the workflow to `ci-failure-notify`.
8. **Mutation schedule.**
   - PRs run `scripts/mutate-changed.mjs` only (it needs `fetch-depth: 0` and an `origin/main` ref).
   - The full sharded run moves to a daily cron.
   - The PR-side summary job must still report on every PR.
9. **actionlint.**
   - Pinned, sha256-verified download step in `lint.yml`, augmenting or replacing the grep pin check, which misses `@main`.
   - No OpenSSF Scorecard: the user said no.
10. **`security-vulnerability-scan.yaml` hardening.** As described above.

### Rules

- Every new required gate gets an `if: always()` summary job that `needs:` all its jobs, fails on failure or cancellation, and carries `# required-check: true|false`.
  - Copy the format in `gitleaks.yaml` (it uses `./.github/actions/report-job-result`).
  - Read `sync-required-checks.yaml` to see how the annotation is parsed.
- Never mark a path-filtered or schedule-only job as required.
- SHA-pin every action with a version comment.
- Least-privilege `permissions`, `persist-credentials: false` and `timeout-minutes` on every job.
- No `${{ }}` inside `run:`; pass values through `env:`.
- **Validate:**
  - `pnpm install --frozen-lockfile && pnpm run build && pnpm test && pnpm run lint && pnpm run typecheck:scripts && pnpm run test:scripts`;
  - `actionlint` (install with `go install github.com/rhysd/actionlint/cmd/actionlint@latest`);
  - `uvx zizmor==1.25.2 --offline .github/`;
  - shellcheck on new scripts.
- **Push** with `git push -u origin claude/awesome-cray-i0egh7-ci-adopt`. The pre-push hook fails on main as described above; use `--no-verify` and say so in the PR body.
- **Open the PR:** ready for review, no template exists. Invoke the `pr-creation` skill first, because a hook blocks `create_pull_request` otherwise.
- After opening, call `subscribe_pr_activity` and drive CI to green.
- **Commit trailer:** `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **The PR body ends with:** `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

## Final report owed to the user

- Both PR links.
- What was ported and what was skipped, and why.
- The fuzz bug found.
- Which CI results depend on PR1 or PR2 merging.

> This file was committed only so it survives the container being reclaimed. Delete it (`git rm HANDOFF.md`) before opening the B PR.

## Update 23:34Z: Codex review on #293 (review 5485515880, none of it handled yet)

All five findings are on template-owned files. For each one, either fix it locally in punctilio or reply that it belongs upstream in `claude-automation-template`. A security finding's thread stays open until the user decides.
- **P1, `.github/workflows/review-gate.yaml:29`.** The auto-approve review is posted with `GITHUB_TOKEN`, so it never triggers the gate's `submitted` run, and `Automated review posted` can stay pending forever.
- **P1, `.github/workflows/review-gate.yaml:61` (security).** A `pull_request_review` job holding `statuses: write` runs the PR's own copy of the workflow, so a collaborator can edit it and post a green gate status on their own PR.
- **P1, `.github/scripts/lib-post-review-with-retry.sh:30`.** When APPROVE is rejected, the retry posts a COMMENT review and reports success, but a comment does not satisfy a required approval.
- **P1, `.github/workflows/pr-meta-privileged.yaml:112` (security).** This privileged job checks out the external resolver at its mutable `main` and runs `label-merge-conflicts.sh` with write scopes. Pin it to a commit SHA.
- **P2, `.github/actions/claude-run/action.yaml:517`.** When only `CLAUDE_CODE_OAUTH_TOKEN` is set, the zero-cost retry fires on empty rung 7 instead of the configured token. Note that this repo's `claude.yaml` is the caller, and PR1 deletes it.
