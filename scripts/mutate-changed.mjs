/**
 * Runs Stryker mutation testing on only the source files that changed on this
 * branch, so a local check finishes in seconds instead of mutating all of
 * src/. Combines committed changes (since the merge-base with the base branch)
 * with uncommitted working-tree edits, then narrows to mutable source files
 * (src/*.ts, excluding tests).
 *
 *   node scripts/mutate-changed.mjs            # diff against origin/main (or main)
 *   node scripts/mutate-changed.mjs develop    # diff against a different base ref
 *
 * The first argument is an explicit base ref only when it does not start with
 * `-`; any flags are forwarded to Stryker, so both of these work:
 *   node scripts/mutate-changed.mjs main --concurrency 2
 *   node scripts/mutate-changed.mjs --concurrency 2
 *
 * Mutation runs with `--incremental false` so a scoped run never overwrites the
 * shared incremental cache that the full `pnpm mutation` run relies on.
 *
 * CI keeps using `pnpm run mutation` with its own per-shard `--mutate`; this
 * script is a developer convenience and is intentionally separate.
 */

import { execFileSync, spawnSync } from "node:child_process"

const SRC_FILE = /^src\/.+\.ts$/
const isMutable = (file) => SRC_FILE.test(file) && !file.startsWith("src/tests/")

/** Returns the first ref in `candidates` that git can resolve, or null. */
function firstExistingRef(candidates) {
  for (const ref of candidates) {
    try {
      execFileSync("git", ["rev-parse", "--verify", "--quiet", ref], { stdio: "ignore" })
      return ref
    } catch {
      // Try the next candidate.
    }
  }
  return null
}

function gitLines(args) {
  return execFileSync("git", args, { encoding: "utf8" })
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
}

const argv = process.argv.slice(2)
// Treat the first argument as a base ref only when it isn't a flag, so
// forwarded Stryker flags don't get mistaken for a git ref.
const hasExplicitRef = argv[0] !== undefined && !argv[0].startsWith("-")
const strykerArgs = hasExplicitRef ? argv.slice(1) : argv
const baseRef = (hasExplicitRef ? argv[0] : undefined) ?? firstExistingRef(["origin/main", "main"])
if (!baseRef) {
  throw new Error("Could not resolve a base ref (tried origin/main, main). Pass one explicitly: node scripts/mutate-changed.mjs <ref>")
}

const committed = gitLines(["diff", "--name-only", "--diff-filter=ACMR", `${baseRef}...HEAD`])
const workingTree = gitLines(["diff", "--name-only", "--diff-filter=ACMR", "HEAD"])
const untracked = gitLines(["ls-files", "--others", "--exclude-standard"])

const changed = [...new Set([...committed, ...workingTree, ...untracked])].filter(isMutable)

if (changed.length === 0) {
  console.log(`No mutable source files changed since ${baseRef}; nothing to mutate.`)
  process.exit(0)
}

console.log(`Mutating ${changed.length} changed file(s) since ${baseRef}:`)
for (const file of changed) console.log(`  ${file}`)

const result = spawnSync(
  "npx",
  ["stryker", "run", "--mutate", changed.join(","), "--incremental", "false", ...strykerArgs],
  { stdio: "inherit", env: { ...process.env, STRYKER_RUN: "1" } },
)
process.exit(result.status ?? 1)
