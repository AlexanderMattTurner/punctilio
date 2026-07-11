/**
 * Pure logic for pinning the README's pre-commit `rev:` to a released version.
 *
 * The filesystem/environment wrapper lives in `pin-readme-rev.ts`; keeping the
 * decision here lets it be unit-tested without touching disk.
 */

export const README_PATH = "README.md"

const SEMVER = /^\d+\.\d+\.\d+$/

/**
 * The `rev:` line inside punctilio's pre-commit repo block. Horizontal
 * whitespace and the single line break are matched explicitly (no `\s*` that
 * could span lines) so the match can't drift onto an unrelated `rev:`.
 */
export const REV_LINE =
  /(?<prefix>repo:[^\S\n]*https:\/\/github\.com\/AlexanderMattTurner\/punctilio[^\S\n]*\n[^\S\n]*rev:[^\S\n]*)v\d+\.\d+\.\d+/

export type PinOutcome =
  | { pinned: true; readme: string; message: string }
  | { pinned: false; message: string }

/**
 * Decide how to pin `readme` to `version`. Returns the rewritten README when a
 * change is needed, or a skip reason (malformed version, block not found, or
 * already current) otherwise — never throws and never reads the environment.
 */
export function pinReadmeRev(readme: string, version: string | undefined): PinOutcome {
  if (!version || !SEMVER.test(version)) {
    return { pinned: false, message: `missing or malformed NEW_VERSION (${String(version)}); skipping.` }
  }
  if (!REV_LINE.test(readme)) {
    return { pinned: false, message: `pre-commit rev pattern not found in ${README_PATH}; leaving it unchanged.` }
  }
  const updated = readme.replace(REV_LINE, `$<prefix>v${version}`)
  if (updated === readme) {
    return { pinned: false, message: `pre-commit rev already at v${version} in ${README_PATH}; nothing to do.` }
  }
  return { pinned: true, readme: updated, message: `Pinned pre-commit rev to v${version} in ${README_PATH}` }
}
