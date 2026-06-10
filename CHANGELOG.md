# Changelog

## Unreleased

### Added
- The rehype plugin now transforms text inside `<title>`, `<button>`, `<option>`, `<output>`, and custom elements (any tag name containing `-`, per the HTML custom-element naming rule). `skipTags` still takes precedence.
- New `--nbsp` CLI flag to force non-breaking space insertion regardless of file type; when neither `--nbsp` nor `--no-nbsp` is passed, the sink default applies (on for HTML, off for Markdown).

### Changed
- **BREAKING**: The CLI no longer rewrites files in place by default. Pass `--write` to rewrite files (Prettier semantics); without `--write` or `--check`, formatted output is printed to stdout, concatenated in file order. `--write` and `--check` are mutually exclusive, and the incremental cache only applies in `--write`/`--check` modes. The bundled `punctilio` pre-commit hook now runs `punctilio --write`.
- **BREAKING**: Markdown sinks (`remarkPunctilio`, `transformMarkdown`, the Prettier plugin, and the CLI for Markdown files) now default `nbsp` to `false`, since invisible U+00A0 characters written into Markdown source files break `grep`/Ctrl+F. Pass `nbsp: true` (or `--nbsp`) to opt back in. `transform()` and the HTML/rehype path keep `nbsp: true` as the default.
- **BREAKING**: `checkIdempotency` now defaults to `false` everywhere, so production users no longer pay the 2x transform cost to detect punctilio's own bugs. Pass `checkIdempotency: true` to re-enable the check (punctilio's test suite runs with it enabled).
- **BREAKING**: Node.js >= 20 is now required (the `commander` 14 dependency already required it; Node 18 is end-of-life).
- `transform()` and the CLI now reject unknown option/config keys instead of silently ignoring them.
- `formatErrorString` no longer writes full document content to stderr unless `PUNCTILIO_DEBUG` is set.
- Docs: expanded the known-limitations table (lookahead bounds, nested-quote depth, toll-free range heuristic, `(c)` evidence requirement, rehype element allowlist), documented CLI Markdown re-serialization and NBSP caveats, and added CONTRIBUTING.md and SECURITY.md.
- CI: benchmark score is now asserted in CI, and the README coverage badge is generated live from the coverage report on each push to `main`.

## [3.13.1] - 2026-06-08

### Fixed
- Idempotency for ranges preceded by a symbol-pass operator: `transform("5x10-20")` and `transform("+/-1-5")` no longer throw. The symbol pass rewrites the range-blocking `x` to `×` and `+/-` to `±`, which are now also excluded from number-range detection.
- Idempotency for orphan German quotes: `transform('word"', { punctuationStyle: "german" })` no longer throws. A lone German closing quote (U+201C/U+2018, which double as American openers) is no longer re-read as an opener on re-processing.

## [3.13.0] - 2026-06-06

### Added
- `dashWordJoiner(text)`: inserts a word joiner (U+2060) before unspaced em and en dashes that have preceding content, preventing either dash from appearing as the first glyph on a wrapped line. Both dashes share Unicode line-break class B2; spaced British-style en dashes are unaffected. Opt-in and composable like `nbspTransform`.
- `UNICODE_SYMBOLS.WORD_JOINER` (U+2060).

## [3.12.0] - 2026-06-01

### Added
- Export style constants for public use.

### Fixed
- Validate style options to prevent invalid configurations.
- Deduplicate CLI file arguments.
- Stabilize cache keys for consistent performance.

## [3.11.2] - 2026-05-23

### Fixed

- Prevent short-word cascade into multi-word atoms in non-breaking space handling.

## [3.11.1] - 2026-05-22

### Fixed

- Resolved template-sync.yaml conflict and removed orphaned hook during template synchronization.

## [3.11.0] - 2026-05-22

### Changed
- CLI cache entries are now keyed by cwd-relative paths instead of absolute paths, so the on-disk cache survives moving the project to a new location (or syncing it across machines with the same repo layout). Absolute-path entries left over from older versions are silently dropped on the next load to keep the cache file from growing forever.
- Prettier plugin promoted to top-level integration in documentation.

### Fixed
- CLI now writes a `Warning:` line to stderr when the incremental cache file is unparseable or missing the expected `files` key, instead of discarding silently. The cache is still rebuilt from scratch.

## [3.10.0] - 2026-05-21

### Added
- `punctilio` CLI: format Markdown and HTML files in place or via stdin. `--check` mode exits non-zero when a file would change, making it usable as a pre-commit hook.
- `.pre-commit-hooks.yaml` for direct integration with the pre-commit framework.
- `punctilio/html` entry point exporting `transformHtml`, mirroring the existing `punctilio/markdown` entry.
- Prettier plugin entry point for `punctilio` to format Markdown and HTML within Prettier workflows.
- CLI features: glob expansion, `.punctilioignore` support, cosmiconfig-based configuration, incremental `--cache` for fast repeated runs, and stdin processing via `-` positional argument.

### Changed
- CLI interface: `--stdin` replaced with `-` positional argument and `--stdin-filepath` option.

## [3.9.3] - 2026-05-21

### Fixed

- Fixed regex performance issue by converting optional-separator patterns to atomic-optional groups.

## [3.9.1] - 2026-05-18

### Fixed
- Corrected `months` export and `NbspOptions` JSDoc
- Fixed documentation issues and decoupled `NbspOptions`

## [3.9.0] - 2026-05-17

### Changed
- Updated rehype plugin to skip `template` and `math`/`svg` tags, and add support for `dialog` and `details` tags.

### Fixed
- Hardened linear scaling tests against CI noise by internalizing months data.

## [3.8.5] - 2026-05-17

### Security

- Fixed 2 ReDoS-vulnerable regex patterns in dashes and quotes modules.

## [3.8.3] - 2026-05-13

### Fixed

- Prevent widow-protection cascade in short-word chains.

## [3.8.2] - 2026-05-13

### Fixed

- Fixed regex lookaheads across element boundaries

## [3.8.1] - 2026-05-13

### Fixed

- Fixed em-dash conversion to preserve leading space in the next text node across separator.

## [3.8.0] - 2026-05-11

### Added
- Deterministic ReDoS detection via static and runtime introspection for improved regex safety.

## [3.7.5] - 2026-05-11

### Changed
- `collapseSpaces` now preserves runs of whitespace at the start of a line (after `\n` or start-of-string), so indented blocks like HN-style code survive `transform()`. Mid-line runs still collapse.

## [3.7.4] - 2026-05-10

### Fixed
- Handle single-quoted negatives, hoist legal regexes, and exclude tests from package.
- Guard countSeparators and pin dependencies.
- Optimize rehype visitor and fix NNBSP collapse.
- Drop NODE_AUTH_TOKEN requirement for OIDC publishing.

## [3.7.3] - 2026-05-04

### Fixed
- Improve token validation for workflow file pushes (#162)

## [3.7.2] - 2026-04-26

### Fixed
- Hardened flaky performance test and optimized rehype plugin with regex caching.

## [3.7.1] - 2026-04-25

### Fixed

- Reduce false positives in degrees, multiplication, and legal symbols detection.

## [3.7.0] - 2026-04-25

### Added

- `shouldSkipText` hook on `flattenTextNodes`, `transformElement`, and the
  `rehypePunctilio` plugin options. Lets consumers opt individual text nodes
  out of transformation while keeping element-level collection intact. The
  predicate receives the text node and its ancestor element chain (root
  first, nearest last); returning `true` leaves the node's value untouched.
  Applied after element-level `shouldSkip`, so it is never invoked inside
  already-skipped elements. Backwards compatible.
- `TextNodeSkipPredicate` and `ElementTransformOptions` exported from
  `punctilio/rehype`.
- `NNBSP` (U+202F, NARROW NO-BREAK SPACE) added to `UNICODE_SYMBOLS`.

### Changed

- `punctuationStyle: "french"` now pads guillemets with U+202F (NARROW
  NO-BREAK SPACE) instead of U+00A0 (NO-BREAK SPACE), per Unicode CLDR's
  `fr` locale and the Imprimerie nationale's *Lexique des règles
  typographiques en usage à l'Imprimerie nationale*. The idempotency
  normalizer accepts either character as inner padding, so previously
  generated output re-processes correctly.

### Fixed

- `degrees()` no longer false-positives on compound identifiers like
  `C-compiler`, `C++`, `C#`, `F-score`, or `F#`. A negative lookahead
  now rejects C/F followed by hyphen+letter or `+`/`#`.
- `multiplication()` no longer false-positives on unsigned scientific
  notation (`1e5x3`, `3.5e10x2`) — ambiguous with model SKUs — or on
  model-name identifiers (`Surface5x3`, `RTX3060x2`, `iPhone5x`). Signed
  exponents (`1e-5x3`, `3.5E+10x2`) are unambiguously scientific and now
  convert. Stacked lookbehinds reject digit runs preceded by Latin
  letters or an unsigned exponent marker.
- Legal symbols `(c)`, `(r)`, `(tm)` are no longer converted inside
  URL-like path contexts (e.g., `example.com/path(r)` stays unchanged).
- Stale JSDoc for `punctuationStyle: "french"` updated from NBSP
  (U+00A0) to NNBSP (U+202F), matching the actual code behavior.
- Bare `555-1234` (three digits + hyphen + four digits with no thousands
  grouping) now preserves its hyphen rather than converting to an en-dash.
  Such sequences are most commonly 7-digit US phone numbers. Thousands-
  grouped endings (`555-1,234`, `555-1.234`) still convert as ranges, since
  the grouping disambiguates. No preceding area code is required anymore
  for the skip to fire.
- `Room is 10' x 12'` now converts to `Room is 10′ × 12′`. Prime marks
  attached to a digit run no longer interrupt the multiplication match, so
  dimension notation (Chicago §9.17) works through feet/inches marks.
- Dimension notation with length units attached to both operands — e.g.
  `5m × 5m`, `210mm × 297mm`, `1920px × 1080px`, `5 m × 5 m`, and three-
  way chains like `120 cm × 60 cm × 75 cm` — now converts correctly. The
  multiplication chain accepts an optional length/size unit (m, cm, mm,
  km, nm, pm, mi, ft, yd, in, px, pt, em, rem, vh, vw) after each digit
  run, with a word-boundary lookahead that avoids matching unit prefixes
  inside longer words (`5mold x 10 mold` is left untouched).
