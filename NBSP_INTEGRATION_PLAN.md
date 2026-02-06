# NBSP Integration Plan for Punctilio

## Context

[PR #472](https://github.com/alexander-turner/TurnTrout.com/pull/472) adds 8 NBSP functions directly inside TurnTrout.com's `formatting_improvement_html.ts`. These functions insert non-breaking spaces (`\u00A0`) in typographically appropriate places. The goal is to move this functionality into the punctilio library itself, where it belongs alongside the other typography transforms.

## Functions to Integrate

From the PR, the 8 NBSP functions are:

| Function | Purpose | Example |
|---|---|---|
| `nbspAfterShortWords` | Nbsp after 1-2 letter words | `a cat` → `a\u00A0cat` |
| `nbspBetweenNumberAndUnit` | Nbsp between number and unit | `100 km` → `100\u00A0km` |
| `nbspBeforeLastWord` | Prevent orphaned last words (widows) | `the end` → `the\u00A0end` |
| `nbspAfterReferenceAbbreviations` | Keep refs with numbers | `Fig. 1` → `Fig.\u00A01` |
| `nbspAfterSectionSymbols` | Keep § ¶ with numbers | `§ 5` → `§\u00A05` |
| `nbspAfterHonorifics` | Keep titles with names | `Dr. Smith` → `Dr.\u00A0Smith` |
| `nbspAfterCopyrightSymbols` | Keep ©®™ with year/name | `© 2024` → `©\u00A02024` |
| `nbspBetweenInitials` | Keep initials together | `J. K. Rowling` → `J.\u00A0K.\u00A0Rowling` |

## Step-by-step Plan

### Step 1: Create `src/nbsp.ts`

Create a new module following the existing pattern (like `src/symbols.ts`, `src/dashes.ts`):

- **Define an `NbspOptions` interface** extending the separator pattern:
  ```ts
  export interface NbspOptions {
    separator?: string
  }
  ```
- **Port all 8 functions**, adapting them to use punctilio's conventions:
  - Replace hardcoded `markerChar` (`\uE000`) references with the `separator` parameter pattern used throughout punctilio (see how `ellipsis()`, `multiplication()`, etc. use `options.separator` → `escapeStringRegexp` → fallback to `ESCAPED_DEFAULT_SEPARATOR`)
  - Replace hardcoded `const nbsp = "\u00A0"` with `UNICODE_SYMBOLS.NBSP` from `constants.ts`
  - Use punctilio's existing `SPACE_CHARS` pattern for matching spaces (already includes nbsp)
  - Keep the `notInTag` guard pattern -- it prevents matching inside HTML tags like `<a href="...">`
- **Create a composite function** `nbspTransform(text, options)` that calls all 8 functions in sequence (analogous to `symbolTransform()` composing `ellipsis`, `multiplication`, etc.)
- **Export all individual functions** and the composite for direct use

### Step 2: Add `nbsp` option to `TransformOptions` in `src/index.ts`

Add a new optional boolean to the `TransformOptions` interface:

```ts
/**
 * Whether to insert non-breaking spaces in typographically appropriate
 * locations (after short words, between numbers and units, before
 * last words to prevent widows, etc.).
 * Default: false
 */
nbsp?: boolean
```

Default to `false` because:
- Consistent with other "aggressive" optional transforms (`fractions`, `degrees`, `superscript`, `ligatures`)
- NBSP insertion changes rendered output in ways users should opt into
- The TurnTrout.com site explicitly enables it; other consumers may not want it

### Step 3: Wire into the `transform()` pipeline in `src/index.ts`

Insert the NBSP transform call into the pipeline. The correct position is **after all other transforms but before `collapseSpaces`**:

```
1. hyphenReplace
2. primeMarks
3. niceQuotes
4. symbolTransform (optional)
5. fractions (optional)
6. degrees (optional)
7. superscript (optional)
8. ligatures (optional)
9. nbspTransform (optional)  <-- NEW
10. collapseSpaces (optional)
```

Rationale: NBSP insertion should run on fully-transformed text (after quotes, dashes, symbols are finalized), and `collapseSpaces` should run last to clean up any doubled spaces that the nbsp functions might create.

### Step 4: Update exports in `src/index.ts`

Add re-exports for the new module:

```ts
export {
  nbspAfterShortWords,
  nbspBetweenNumberAndUnit,
  nbspBeforeLastWord,
  nbspAfterReferenceAbbreviations,
  nbspAfterSectionSymbols,
  nbspAfterHonorifics,
  nbspAfterCopyrightSymbols,
  nbspBetweenInitials,
  nbspTransform,
  type NbspOptions,
} from "./nbsp.js"
```

### Step 5: Create `src/tests/nbsp.test.ts`

Write tests following the existing patterns:
- **Unit tests** for each individual function (parametrized via `it.each`)
- **Separator-awareness tests**: verify each function works correctly when the separator character appears at text node boundaries (e.g., `Dr.\uE000 Smith` should still produce `Dr.\uE000\u00A0Smith`)
- **Negative cases**: verify no-op for already-correct input, content inside tag-like patterns, etc.
- **Integration test** in `index.test.ts`: verify `transform("Dr. Smith met at 5 PM", { nbsp: true })` produces expected nbsp characters
- **Idempotency**: covered automatically by the existing `checkIdempotency` mechanism in `transform()`
- Target **100% branch coverage** (required by jest config)

### Step 6: Ensure rehype plugin passes options through (no changes needed)

The rehype plugin already spreads `...transformOptions` into `transform()` calls (`rehype.ts:461`). Adding `nbsp: true` to `RehypePunctilioOptions` will automatically flow through. No code changes needed in `rehype.ts`, but add a **rehype integration test** in `rehype.test.ts` confirming NBSP insertion works end-to-end through HTML:

```ts
it("inserts nbsp when option enabled", () => {
  const html = '<p>Dr. Smith has 5 kg of items.</p>'
  // process with { nbsp: true } and verify nbsp chars present
})
```

### Step 7: Update `collapseSpaces` interaction

The existing `collapseSpaces` already handles nbsp correctly -- it prefers nbsp when collapsing sequences containing nbsp. Verify this interaction with a test:

```ts
it("collapseSpaces preserves single nbsp from nbspTransform", () => {
  const text = transform("Dr.  Smith", { nbsp: true })
  // Should have single nbsp, not double space
})
```

## Key Design Decisions

1. **Separate module** (`src/nbsp.ts`) rather than adding to `src/symbols.ts`: The NBSP functions are conceptually distinct from symbol replacement. They operate on spacing rather than character substitution. A dedicated module keeps the codebase organized.

2. **`notInTag` pattern**: The PR uses `(?<!<[^>]*)` to avoid matching inside HTML tags. This is essential for the rehype use case where raw HTML text may contain tag-like content. Port this as-is.

3. **`nbspBeforeLastWord` requires non-multiline mode**: The PR explicitly removes the `m` flag so `$` matches only the true end-of-string (not every newline). This prevents inserting nbsp into structural whitespace between HTML elements. This is critical to preserve.

4. **markerChar/separator awareness**: Every regex pattern must allow optional separator characters at text node boundaries. The PR already handles this -- port the patterns faithfully. The separator-aware patterns ensure `transform(text) == strip(transform(text_with_markers))` (the invariance check in `transformElement`).

## Downstream Impact on TurnTrout.com

After this integration, TurnTrout.com's `formatting_improvement_html.ts` can:
1. Remove all 8 local nbsp function definitions
2. Import `nbspTransform` (or individual functions) from `punctilio`
3. Either pass `{ nbsp: true }` to the punctilio rehype plugin, or continue calling nbsp functions directly in its custom pipeline (whichever fits its architecture better)
