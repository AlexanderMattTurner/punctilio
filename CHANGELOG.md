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
