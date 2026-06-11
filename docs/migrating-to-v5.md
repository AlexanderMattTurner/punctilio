# Migrating to v5

v5 removes the sentinel-separator architecture. Passes no longer weave a
marker character through flattened text; they run over a _ProseView_ — a
boundary-aware view of an element's text nodes — and commit offset edits back
onto the source nodes. For most consumers the visible changes are:

1. [`transformElement` and marker characters are gone](#1-sentinel--marker-character-removal) — use `applyPasses`.
2. [Custom regexes become passes via `definePass`](#2-site-specific-regexes--definepass), with an explicit per-pattern boundary decision.
3. [Per-transform skip sets become `PassEntry` objects](#3-per-transform-skip-sets--passentry-objects).
4. [`primeMarks` is folded into `niceQuotes`](#4-standalone-primemarks--nicequotes).
5. [Several symbols and helpers were removed](#5-removed-symbols-and-replacements).
6. [Per-rule sub-passes left the root export](#6-sub-passes-left-the-root-contract).

Default-option `transform()` output is byte-identical to v4; no golden output
changed.

## 1. Sentinel / marker-character removal

`transformElement(element, fn, toSkip, markerChar)` flattened an element's
text nodes into one string joined by `markerChar`, ran `fn` over the marked
string, and split the result back. Both it and the `separator` option (on
`TransformOptions`, `QuoteOptions`, `DashOptions`, `SymbolOptions`,
`RehypePunctilioOptions`, `RemarkPunctilioOptions`, `MarkdownOptions`,
`HtmlOptions`, and the CLI config) are gone. There is no marker character
anywhere: node boundaries are tracked as offsets, so they can never collide
with content, leak into output, or be miscounted.

Before (v4):

```typescript
import { transformElement } from "punctilio/rehype"

transformElement(elt, (text) => myTransforms(text), toSkip, "")
```

After (v5):

```typescript
import { applyPasses } from "punctilio/rehype"

applyPasses(elt, [myPass, myOtherPass], { shouldSkip: toSkip })
```

`applyPasses(element, passes, options?)` owns the view lifecycle: it builds a
ProseView over the element's transformable text nodes (honoring
`options.shouldSkip` / `options.shouldSkipText`), runs each pass in order, and
commits each pass's edits before the next runs — so passes see each other's
committed output, exactly like `transform()`'s internal pipeline. You never
touch a ProseView directly.

Each entry in `passes` is either a built-in pass (`niceQuotes`,
`hyphenReplace`, `nbspTransform`, `symbolTransform`, ...), a pass you define
with [`definePass`](#2-site-specific-regexes--definepass), or a
[`PassEntry` object](#3-per-transform-skip-sets--passentry-objects) carrying
its own skip predicates.

If your transform function wrapped the whole punctilio pipeline rather than
individual passes, build the view's worth of options instead: `rehypePunctilio`
already accepts `shouldSkipText`, or call `proseViewOf(element, options)` and
pass the view to `transformView(view, transformOptions)`.

## 2. Site-specific regexes → `definePass`

In v4, custom regexes ran over marker-joined text, and every pattern had to be
written (or audited) around the marker character. In v5, wrap each regex in
`definePass` from the root export:

```typescript
import { definePass } from "punctilio"

const fahrenheit = definePass(/(?<deg>\d+) ?F\b/g, "$<deg> °F")
```

The returned pass has the same dual-input shape as the built-ins:

```typescript
fahrenheit("It hit 99F.")  // string in → "It hit 99 °F." out
fahrenheit(view)           // ProseView in → edits committed in place
```

String replacements support the `String.replace` forms `$$`, `$&`, `$1`–`$99`,
and `$<name>`. Any other `$` form (`$0`, `` $` ``, `$'`, a stray `$`) throws at
definition time, and a reference to a capture group the pattern doesn't define
throws at first use — nothing mis-substitutes silently. Function replacements
receive `(match, view)` and may return `null` to leave a match untouched.

Every pattern makes an explicit boundary decision via `options.boundaries`:

- `"skip"` (the default, and the safe choice): a match that contains an
  interior node boundary — i.e. spans two text nodes, like a word split by
  `<em>` — is left untouched. Start here for every pattern.
- `"allow"`: boundary-spanning matches are always replaced. The replacement
  text lands in the node where the match starts, collapsing the boundary after
  it (the later nodes' share of the match is deleted). Use this only when
  losing the inner element's claim on those characters is acceptable.
- a predicate `(match, view) => boolean`: decide per match. The view exposes
  `view.text`, `view.boundaries`, and `view.hasBoundary(offset)` so you can
  allow, say, a boundary between two words but not one inside a word.

```typescript
const arrowize = definePass(/->/g, "→", { boundaries: "allow" })
```

## 3. Per-transform skip sets → `PassEntry` objects

If one of your transforms skips extra elements (e.g. a fractions pass that
also skips `<a>`, so link text like `1/2` survives), wrap it in a `PassEntry`
object. The entry's predicates apply _in addition to_ the base options' for
that pass only:

```typescript
import { applyPasses } from "punctilio/rehype"

applyPasses(
  elt,
  [
    niceQuotes,
    hyphenReplace,
    { pass: fractionsPass, shouldSkip: (node) => node.tagName === "a" },
  ],
  { shouldSkip: toSkip },
)
```

An entry with its own `shouldSkip`/`shouldSkipText` gets a fresh view built
after the previous pass committed, over exactly the text nodes that survive
both predicate sets; the skipped nodes' text is invisible to that pass and
untouched by it. Consecutive entries with identical predicates share a view.

## 4. Standalone `primeMarks` → `niceQuotes`

`niceQuotes` now converts prime candidates (`5'10"` → `5′10″`) itself, before
quote classification, controlled by a `primes` option that defaults to `true`.
If you called `primeMarks` and then `niceQuotes`, drop the `primeMarks` call.
If you want quote conversion _without_ primes, pass `primes: false`:

```typescript
niceQuotes(text)                   // quotes + primes (v4: primeMarks + niceQuotes)
niceQuotes(text, { primes: false }) // quotes only (v4: bare niceQuotes)
```

`classifyApostrophes` never converts primes. `primeMarks` itself is no longer
exported from the root (see [section 6](#6-sub-passes-left-the-root-contract)).

## 5. Removed symbols and replacements

Removed in the sentinel-removal stage:

| Removed (v4) | Module | Replacement (v5) |
| --- | --- | --- |
| `separator` option (all option types and CLI config) | everywhere | None needed — boundaries are tracked as offsets |
| `checkIdempotency` option | `TransformOptions` and extensions | None — idempotency is guarded by the fuzz/fixed-point suites |
| `DEFAULT_SEPARATOR`, `REGEX_SPECIAL_CHARS` | constants | None needed |
| `transformTextNodes` | utils | `proseViewOf` + `transformView`, or `applyPasses` |
| `assertSeparatorAbsent`, `assertSeparatorCountPreserved`, `countSeparators` | utils | None needed |
| `runLegacyPass` | prose-view | Write passes against the view (`replaceAllInView`, `definePass`) |
| `NbspOptions` | nbsp | None (the type had no members left) |
| `transformElement` (+ `checkInvariance`) | rehype | `applyPasses(element, passes, { shouldSkip, shouldSkipText })` |
| `collectTransformableElements` | rehype | `collectProseBlocks(root, { skipTags, skipClasses, shouldSkip, transformAllElements })` |
| `withProseView(text, run, separator)` | prose-view | `withProseView(text, run)` (no separator parameter) |

Removed from the root export in this release (still available behaviors, new
spellings):

| Removed root export | Replacement |
| --- | --- |
| `enDashNumberRange`, `enDashDateRange`, `minusReplace` | Covered by `hyphenReplace` (root) |
| `nbspAfterCopyrightSymbols`, `nbspAfterHonorifics`, `nbspAfterReferenceAbbreviations`, `nbspAfterSectionSymbols`, `nbspAfterShortWords`, `nbspBeforeLastWord`, `nbspBetweenInitials`, `nbspBetweenNumberAndUnit` | Covered by `nbspTransform` (root) |
| `arrows`, `ellipsis`, `legalSymbols`, `mathSymbols`, `multiplication` | Covered by `symbolTransform` (root) |
| `degrees`, `fractions`, `superscriptOrdinal`, `punctuationLigatures`, `collapseSpaces` | `transform`/`transformView` with the matching option (`degrees`, `fractions`, `superscript`, `ligatures`, `collapseSpaces`) |
| `primeMarks` | `niceQuotes` (primes on by default; `primes: false` to opt out) |
| `HONORIFICS`, `UNITS`, `REFERENCE_ABBREVIATIONS`, `numberRangeDisallowedPrefixes` | Internal data, no longer part of the contract |
| `TRANSFORM_OPTION_KEYS` | Internal machinery, no longer part of the contract |

## 6. Sub-passes left the root contract

The root export now carries the composed passes (`niceQuotes`,
`classifyApostrophes`, `hyphenReplace`, `dashWordJoiner`, `nbspTransform`,
`symbolTransform`), the pipeline (`transform`, `transformView`), the view
toolkit (`buildProseView`, `withProseView`, `replaceAllInView`, `definePass`),
and the output-interpretation constants (`UNICODE_SYMBOLS`,
`MODIFIER_LETTER_APOSTROPHE`, `PUNCTUATION_STYLES`, `DASH_STYLES`). Per-rule
sub-passes (`ellipsis`, `fractions`, the individual nbsp rules, ...) and
internal data tables are module-internal: they still exist and are unit-tested
directly, but they are no longer part of the semver contract.

If you genuinely need a sub-pass as a standalone export, open an issue —
deliberately re-exporting one is a non-breaking (minor) change, and we'd
rather grow the contract on demand than promise every internal rule forever.
