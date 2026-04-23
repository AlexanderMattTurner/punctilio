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
