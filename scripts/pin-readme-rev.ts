/**
 * Pin the README's pre-commit `rev:` to the version being released.
 *
 * Invoked from `scripts/version-bump.sh` after a successful `pnpm publish`, so
 * the version documented in the pre-commit example never lags behind what is
 * actually published. Reads the target version from `NEW_VERSION` and delegates
 * the decision to `pinReadmeRev`; this file only does IO.
 *
 * Behavior:
 * - Rewrites only the `rev:` line inside punctilio's own pre-commit repo block.
 * - On any skip (missing/malformed version, block not found, already current)
 *   or unexpected error it warns to stderr and exits 0: `npm publish` has
 *   already succeeded by this point, and a docs hiccup must not abort the
 *   surrounding bash script (which still needs to commit, push, and tag).
 * - File write is atomic (temp file + rename) so a crash mid-write leaves the
 *   original README intact.
 */

import { readFileSync, renameSync, writeFileSync } from "node:fs"

import { pinReadmeRev, README_PATH } from "./pin-readme-rev.impl.js"

/** Write `contents` to `path` via a temp file + rename so the replacement is atomic. */
function atomicWrite(path: string, contents: string): void {
  const tmpPath = `${path}.tmp`
  writeFileSync(tmpPath, contents)
  renameSync(tmpPath, path)
}

try {
  const outcome = pinReadmeRev(readFileSync(README_PATH, "utf8"), process.env.NEW_VERSION)
  if (outcome.pinned) {
    atomicWrite(README_PATH, outcome.readme)
    process.stdout.write(`${outcome.message}\n`)
  } else {
    process.stderr.write(`README rev pin: ${outcome.message}\n`)
  }
} catch (err) {
  // Exit 0 deliberately: npm publish has already succeeded at this point in the
  // release flow; a README hiccup must not abort the surrounding bash script.
  process.stderr.write(
    `README rev pin: failed: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`,
  )
}
