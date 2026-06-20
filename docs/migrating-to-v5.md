# Migrating to v5

## Main takeaways

**If you only call `transform()`, the CLI, or the `rehype`/`remark`/`markdown`
plugins with their default options, you don't need to change anything.** v5's
output is byte-identical to v4 except for two deliberate quote fixes (below),
so for most consumers upgrading is just bumping the version.

You only need to make changes if you touched punctilio's internals. Use this
table to find out:

| Did you… | Then in v5… |
| --- | --- |
| set the `separator` option anywhere? | Delete it — it no longer exists (and isn't needed). |
| set `checkIdempotency`? | Delete it — the option is gone. |
| call `primeMarks` (usually before `niceQuotes`)? | Delete the `primeMarks` call — `niceQuotes` now does primes itself. Pass `primes: false` to opt out. |
| import a single rule like `ellipsis`, `fractions`, `arrows`, `minusReplace`, or an `nbspAfter…` helper? | Use the composed pass (`symbolTransform`, `nbspTransform`, `hyphenReplace`) or the matching `transform()` option instead — see the [removed-exports tables](#5-removed-symbols-and-replacements). |
| call `transformElement(...)` to process your own HTML nodes? | Switch to [`applyPasses(element, passes, options)`](#1-sentinel--marker-character-removal). |
| run your own regexes over punctilio's flattened text? | Wrap each one in [`definePass`](#2-site-specific-regexes--definepass). |

The two intentional output changes (both restoring more correct behavior):

1. A straight double quote that merely starts a text node (e.g. right after
   `</a>`) now **closes** instead of opening, when a later quote pair follows
   in the same block.
2. A quoted multi-digit number like `'37'` is a **quote pair** again, not a
   decade elision — restoring the pre-4.1.1 output.

That's everything a consumer needs. The rest of this document explains the
underlying change and gives precise before/after recipes for each case.

## Why it changed (optional background)

**The problem.** Punctilio often transforms text that HTML has split across
several text nodes — the word in `so<em>met</em>hing`, for example, is three
separate nodes. A rule like curly-quoting or dash conversion has to read the
whole string `something` to decide correctly, but then it has to write each
edit back into the _right_ original node. So every rule needs two things at
once: one combined string to read, and a way to map any position in that
string back to the node it came from.

**The v4 answer: a marker character (the "sentinel").** Punctilio glued the
nodes into one string, inserting a special marker character at each node
boundary — a stand-in that means "a node edge is here." Rules ran over that
glued string, and afterward punctilio split on the marker to hand each
node back its share of the edited text.

The trouble is that the boundary was now a real character living _inside_ the
text, and that's fragile in three ways:

- it can **collide** with a marker character that was already in the content;
- it can **leak** into the output if a rule fails to strip it;
- it can be **miscounted** when a rule's match spans it, throwing off the
  split that maps text back to nodes.

**The v5 answer: a ProseView.** v5 deletes the marker. A rule still reads one
combined string, but the node boundaries now live _beside_ the string as a
list of numeric positions (offsets), not as characters within it. The view
answers "which node does offset _N_ belong to?" by arithmetic, and a rule
expresses an edit as "replace characters _X_–_Y_," which the view commits onto
the underlying nodes.

Because a boundary is a position rather than a character, it simply can't
collide, leak, or be miscounted — the three failure modes are gone by
construction. Everything else in this guide — `applyPasses` owning the view,
`definePass` asking what to do when a match crosses a boundary, `PassEntry`
skip sets — follows from that one shift.

## Detailed migration reference

The breaking changes in full:

1. [`transformElement` and marker characters are gone](#1-sentinel--marker-character-removal) — use `applyPasses`.
2. [Custom regexes become passes via `definePass`](#2-site-specific-regexes--definepass), with an explicit per-pattern boundary decision.
3. [Per-transform skip sets become `PassEntry` objects](#3-per-transform-skip-sets--passentry-objects).
4. [`primeMarks` is folded into `niceQuotes`](#4-standalone-primemarks--nicequotes).
5. [Several symbols and helpers were removed](#5-removed-symbols-and-replacements).
6. [Per-rule sub-passes left the root export](#6-sub-passes-left-the-root-contract).

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
