/**
 * Pin the README's pre-commit `rev:` to the version being released.
 *
 * Invoked from `scripts/version-bump.sh` after a successful `pnpm publish`,
 * so the version documented in the pre-commit example never lags behind what
 * is actually published. Reads the target version from the environment:
 *
 *   NEW_VERSION — the semver string, e.g. "1.2.3"
 *
 * Behavior:
 * - Rewrites only the `rev:` line inside punctilio's own pre-commit repo
 *   block, so nothing else in the README can be disturbed.
 * - If that block can't be found, warns and leaves the file untouched rather
 *   than failing: `npm publish` has already succeeded by this point, and a
 *   docs hiccup must not abort the surrounding bash script (which still needs
 *   to commit, push, and tag).
 * - Writes diagnostics to stderr; exits 0 even on unexpected errors.
 * - File write is atomic (temp file + rename) so a crash mid-write leaves the
 *   original README intact.
 */

import { readFileSync, renameSync, writeFileSync } from "node:fs"

const README_PATH = "README.md"
const SEMVER = /^\d+\.\d+\.\d+$/

/**
 * The `rev:` line inside punctilio's pre-commit repo block. Horizontal
 * whitespace and the single line break are matched explicitly (no `\s*` that
 * could span lines) so the match can't drift onto an unrelated `rev:`.
 */
const REV_LINE =
  /(?<prefix>repo:[^\S\n]*https:\/\/github\.com\/alexander-turner\/punctilio[^\S\n]*\n[^\S\n]*rev:[^\S\n]*)v\d+\.\d+\.\d+/

function warn(message: string): void {
  process.stderr.write(`README rev pin: ${message}\n`)
}

/** Write `contents` to `path` via a temp file + rename so the replacement is atomic. */
function atomicWrite(path: string, contents: string): void {
  const tmpPath = `${path}.tmp`
  writeFileSync(tmpPath, contents)
  renameSync(tmpPath, path)
}

function pinReadmeRev(): void {
  const version = process.env.NEW_VERSION
  if (!version || !SEMVER.test(version)) {
    warn(`missing or malformed NEW_VERSION (${String(version)}); skipping.`)
    return
  }

  const source = readFileSync(README_PATH, "utf8")
  if (!REV_LINE.test(source)) {
    warn(`pre-commit rev pattern not found in ${README_PATH}; leaving it unchanged.`)
    return
  }

  const updated = source.replace(REV_LINE, `$<prefix>v${version}`)
  if (updated === source) return

  atomicWrite(README_PATH, updated)
  process.stdout.write(`Pinned pre-commit rev to v${version} in ${README_PATH}\n`)
}

try {
  pinReadmeRev()
} catch (err) {
  // Exit 0 deliberately: npm publish has already succeeded at this point in
  // the release flow; a README hiccup must not abort the surrounding bash
  // script and skip the tag push.
  warn(`failed: ${err instanceof Error ? err.stack ?? err.message : String(err)}`)
}
