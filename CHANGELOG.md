# Changelog

## Unreleased

## [5.1.3] - 2026-07-11

### Fixed

- Permit same-offset pure insertions with opposite bind semantics.

## [5.1.1] - 2026-07-09

### Security

- Hardened CI workflow scripts and triage prompt configuration.

### Changed

- Updated GitHub Actions pins to use node24-compatible SHAs.

## [5.1.0] - 2026-07-09

### Added

- Swiss thousands separators now curl instead of prime (e.g. `1'234` → `1'234`).

### Fixed

- A single-quoted term before a colon now curls both quotes (e.g. `'love':` → `'love':`). The colon was missing from the single-quote ending contexts, so the closer stayed straight and the opener was then mis-labelled as an apostrophe, mangling both marks.
- A closing double quote before `]` now curls (e.g. `["foo"]` → `["foo"]`), matching the opener that already curls after `[`.
- The month-range en dash now recognizes the common four-letter abbreviation `Sept` (e.g. `Sept-Nov` → `Sept–Nov`), alongside `Sep`.
- The CLI preserves a file's CRLF line endings instead of rewriting the final line to LF. CRLF files previously gained mixed endings, which made `--check` report a change on every run and `--write` churn indefinitely.
- Orphan German single closers now freeze in place instead of curling unpredictably.
- An `x` no longer multiplies before a curly apostrophe in compound words.
- Removed opaque inline content is now treated as an impassable gap in view boundaries.
- Loose inline text in prose views is now transformed as its own block-adjacent run, improving layout accuracy.
- Range-scan failures are now classified to close all trailing-dash quadratic paths.
- Remaining quadratic paths when a dead dash ends a digit run are now closed.

### Performance

- Node-boundary checks in the dash, symbol, and non-breaking-space passes now binary-search only the boundaries inside each match span instead of scanning the entire boundary list per match, removing an O(matches × nodes) cost on inline-element-heavy HTML/Markdown views.

### Changed

- Dropped the unused `escape-string-regexp` runtime dependency.

## [5.0.10] - 2026-06-27

### Changed

- Last-word widow protection now wins over an aesthetic short-word glue on the second-to-last word. When the two conflict (e.g. a sentence ending "…in the head."), the short-word glue ("in"+NBSP+"the") yields so the final pair binds ("the"+NBSP+"head.") instead of orphaning the last word onto its own line. The non-breaking run stays two words, and semantic glues (honorifics, abbreviations, units) still hold.

## [5.0.9] - 2026-06-26


### Fixed

- `collectProseBlocks` no longer treats the whitespace text nodes a parser leaves between block siblings as direct text, so containers like `<blockquote>`/`<li>`/`<div>` recurse into their block children instead of merging them. This stops quote classification from pairing across a paragraph boundary (e.g. an interrupted line ending in `—"` no longer flips to an opening quote when the next paragraph starts with `"`).

## [5.0.8] - 2026-06-23

### Changed

- ci: run template sync weekly instead of daily (#239)

## [5.0.7] - 2026-06-23

### Changed

- ci: remove @claude workflow and pin security scan to sonnet-4-6 (#238)

## [5.0.6] - 2026-06-23

### Changed

- docs(pr-creation): use pyright in the Python validation-commands example

## [5.0.3] - 2026-06-21

### Added

- New `mutation:changed` build task for diffing mutations against changed files.

### Changed

- Renamed "golden corpus" to "html-corpus" throughout the codebase for clarity.
- Refactored quote-classifier item-tester factory and set composition.
- Collapsed pass overload triples via `makeProsePass` helper function.
- Improved stacked-boundary check naming with `exceedsSingleBoundary`.

### Fixed

- Fixed incremental state and flag parsing in mutate-changed script.

### Removed

- Deleted dead code and centralized shared regex and constants across modules.

## [5.0.1] - 2026-06-20

### Added

- Pre-commit hook revision is now pinned in README, with a guide for migrating to v5 that highlights consumer takeaways.

### Changed

- README pre-commit revision pinning is now managed by a linted, typechecked script for improved maintainability.

## [5.0.0] - 2026-06-20

### Added
- Property-based fuzz suite (`src/tests/fuzz.test.ts`, [fast-check](https://fast-check.dev/)): transform idempotence over arbitrary unicode and option combinations, multi-node `ProseView` semantics against a flat-string oracle, `definePass` template semantics against `String.replace`, and HTML/Markdown round-trips. Runs with a fresh seed in every `pnpm test`; reproduce failures with `FUZZ_SEED`/`FUZZ_PATH`, soak with `FUZZ_RUNS`.
- Mutation testing ([Stryker](https://stryker-mutator.io/)): `pnpm mutation` locally, and a `mutation.yml` workflow that runs on every pull request, sharded across six size-balanced file groups with per-shard incremental caches and HTML report artifacts.
- New consumer API: `definePass()` and `applyPasses()` for composing custom punctuation transforms. See the v5 migration guide for details.

### Changed
- **Breaking change:** Trimmed root module exports to focus on the primary use cases; consumer-facing API redesign with `definePass`/`applyPasses`. Consult the v5 migration guide for upgrade instructions.

### Fixed
- Idempotency (`transform(transform(x)) === transform(x)`) for a long tail of inputs found by the new property-based fuzz suite, across all punctuation and dash styles and the string, view, HTML, and Markdown surfaces. The fixes share one principle — a rule's decision must survive the rewrites later passes apply — and cover: prime/quote balance disagreeing with the quote classifier (`'9'7`, `"9"7`); punctuation-placement moves changing contexts a re-run re-reads (rendered apostrophes joining closing runs, German orphan re-derivation, straight-quote and dash "walls", movable-punctuation chains, ending-context stripping across element boundaries); and earlier-pass gates flipped by later folds — ligatures (`"?!` → `"⁈`), ellipses, multiplication (`6x'` → `6×'`), superscript ordinals, fractions, degree spacing, NBSP-glued year ranges, and tab/space collapse before dashes (whitespace now also collapses at pipeline entry).
- Number ranges with temperature units now convert (`20-30C` → `20–30C`), matching the existing multiplier suffixes.
- Two quote-classifier misclassifications on the HTML/view path: a straight double quote that merely starts a text node (e.g. directly after `</a>`) now closes instead of opening when a later quote pair follows in the same block, and a quoted multi-digit number like `'37'` is a quote pair again rather than a decade elision (restoring the pre-4.1.1 output).
- Fraction glyphs are now treated as path context for fold-stable legal symbols.
- Superscript ordinals and × no longer trigger range conversion in dash rules.

## [4.3.0] - 2026-06-20

### Added
- ProseView boundary-aware edit layer with legacy pass adapter for improved view handling.
- Quote classifier role-based system to replace the previous regex pipeline for more robust quote detection.

### Changed
- Quote processing now uses a classifier-based approach instead of regex pipelines for better accuracy.

## [4.1.4] - 2026-06-17

### Fixed

- Closed remaining idempotency gaps in handling of ellipsis/range, fraction/legal, and German quotes.

## [4.1.3] - 2026-06-17

### Fixed
- `transform()` is now idempotent when a tab sits in the whitespace around a dash, e.g. `"word \t- word"`. The dash now converts on the first pass, matching the result a fully space-padded dash already produced; previously the tab blocked conversion until `collapseSpaces` normalized the whitespace to a plain space, so a second pass changed the output.

## [4.1.1] - 2026-06-10

### Changed
- Quote opener/closer/apostrophe classification and American punctuation
  placement now use single-pass, O(n) left-to-right scans with explicit quote
  balance instead of distance-bounded regexes. As a result, long quoted
  passages (previously capped at a 1,000-character opener lookahead), distant
  quoted punctuation such as `"…?"` (previously capped at 50 characters), and
  deeply nested quotes (previously capped at four levels) are all handled
  regardless of length or depth. Leading decade elisions (`'90s`, `'99`) now
  classify confidently as apostrophes.

## [4.1.0] - 2026-06-10

### Added
- New `transformAllElements` option on the rehype plugin. When `true`, it inverts the element model and transforms text inside every element except `skipTags`/`skipClasses` and the form-value elements `<textarea>`/`<input>`; `<select>` is skipped as a container while its `<option>` labels still transform. Defaults to `false`, preserving the curated allowlist.

### Fixed
- The toll-free range heuristic no longer over-matches. Only the seven real US toll-free prefixes (`1-800`, `1-888`, `1-877`, `1-866`, `1-855`, `1-844`, `1-833`) keep their hyphen; genuine ranges like `1-850` or `1-810` now en-dash as `1–850` / `1–810`.

## [4.0.0] - 2026-06-10

### Added
- The rehype plugin now transforms text inside `<title>`, `<button>`, `<option>`, `<output>`, and custom elements (any tag name containing `-`, per the HTML custom-element naming rule). `skipTags` still takes precedence.
- New `--nbsp` CLI flag to force non-breaking space insertion regardless of file type; when neither `--nbsp` nor `--no-nbsp` is passed, the sink default applies (on for HTML, off for Markdown).

### Changed
- **BREAKING**: The CLI no longer rewrites files in place by default. Pass `--write` to rewrite files (Prettier semantics); without `--write` or `--check`, formatted output is printed to stdout, concatenated in file order. `--write` and `--check` are mutually exclusive, and the incremental cache only applies in `--write`/`--check` modes. The bundled `punctilio` pre-commit hook now runs `punctilio --write`.
- **BREAKING**: Markdown sinks (`remarkPunctilio`, `transformMarkdown`, the Prettier plugin, and the CLI for Markdown files) now default `nbsp` to `false`, since invisible U+00A0 characters written into Markdown source files break `grep`/Ctrl+F. Pass `nbsp: true` (or `--nbsp`) to opt back in. `transform()` and the HTML/rehype path keep `nbsp: true` as the default.
- **BREAKING**: `checkIdempotency` now defaults to `false` everywhere, so production users no longer pay the 2x transform cost to detect punctilio's own bugs. Pass `checkIdempotency: true` to re-enable the check (punctilio's test suite runs with it enabled).
- **BREAKING**: Node.js >= 20 is now required (Node 18 is end-of-life).
- The `commander` runtime dependency is gone; CLI argument parsing now uses Node's built-in `util.parseArgs`. Two user-visible differences: `--skip-tag`/`--skip-class` no longer accept space-separated multi-values (`--skip-tag code pre`)—repeat the flag instead (`--skip-tag code --skip-tag pre`)—and help/usage-error wording is formatted slightly differently. Flags, exit codes, and semantics are otherwise unchanged.
- `transform()` and the CLI now reject unknown option/config keys instead of silently ignoring them.
- `formatErrorString` no longer writes full document content to stderr unless `PUNCTILIO_DEBUG` is set.
- Docs: expanded the known-limitations table (lookahead bounds, nested-quote depth), documented CLI Markdown re-serialization and NBSP caveats, and added CONTRIBUTING.md and SECURITY.md.
- CI: benchmark score is now asserted in CI, and the README coverage badge is generated live from the coverage report on each push to `main`.

### Fixed
- fix(ci): match conventional-commit type prefixes against subjects only
- fix(deps): resolve all audit findings via lockfile re-resolution

## [3.13.1] - 2026-06-08

### Fixed
- Idempotency for ranges preceded by a symbol-pass operator: `transform("5x10-20")` and `transform("+/-1-5")` no longer throw. The symbol pass rewrites the range-blocking `x` to `×` and `+/-` to `±`, which are now also excluded from number-range detection.
- Idempotency for ranges followed by a symbol-pass operator: `transform("1-55x5")` and `transform("5--1st", { superscript: true })` no longer throw. The multiplication (`x` → `×`) and superscript (`st`/`nd`/`rd`/`th` → superscripts) passes turn a range-blocking trailing word character into a non-word one; the range detector now rejects those trailing forms too.
- Idempotency for ellipses before number ranges: `transform("wait...1-5 minutes")` no longer throws. Ellipses are now folded before range detection, so the post-ellipsis space is present on the first pass.
- Idempotency for fractions before legal symbols: `transform("1/2(tm)", { fractions: true })` no longer throws. Fractions run before `legalSymbols`, so the converted `½` no longer leaves a `/` that the path-context heuristic mistook for a URL.
- Idempotency for orphan German quotes: `transform('word"', { punctuationStyle: "german" })` no longer throws. German normalization now collapses every German/curly quote to a straight quote and lets the pipeline re-classify by position, which also fixes lone closers adjacent to other quotes.

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
