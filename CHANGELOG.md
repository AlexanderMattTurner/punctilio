# Changelog

## Unreleased

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
- `multiplication()` no longer false-positives on scientific notation
  like `1e5x3`, `3.5E10x2`, `1e-5x3`, or `1e+5x3`. Stacked
  lookbehinds reject digit runs preceded by exponent markers,
  including signed exponents (`e-`, `E+`).
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
