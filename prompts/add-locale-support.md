# Task: Add German and French Locale Support

## Goal

Extend punctilio's quote transformation to support German and French quote styles, addressing 3 of the 6 remaining benchmark failures.

## Current State

- `PunctuationStyle` in `src/quotes.ts` supports `"american"` | `"british"` | `"none"`
- American: "..." and '...' (U+201C/U+201D, U+2018/U+2019)
- British: same curly quotes, but periods/commas placed outside
- The benchmark expects:
  - German: „Guten Tag" (U+201E low-9 opener, U+201C closer) and ‚Hallo' (U+201A/U+2018)
  - French: « Bonjour » (U+00AB/U+00BB guillemets with NBSP inside)

## Requirements

### 1. Extend `PunctuationStyle` type

In `src/quotes.ts`, add `"german"` and `"french"` to the union type:

```ts
export type PunctuationStyle = "american" | "british" | "german" | "french" | "none"
```

### 2. German quotes (`"german"`)

- Double quotes: `"..."` → `„..."` (U+201E opener, U+201C closer)
- Single quotes: `'...'` → `‚...'` (U+201A opener, U+2018 closer)
- Punctuation placement: outside quotes (like British)
- Apostrophes/contractions: still U+2019 (same as all styles)

Strategy: reuse the existing quote-conversion pipeline, then post-process to swap characters:
- U+201C (LEFT DOUBLE) → U+201E (DOUBLE LOW-9)
- U+201D (RIGHT DOUBLE) → U+201C (LEFT DOUBLE, used as closer in German)
- U+2018 (LEFT SINGLE) → U+201A (SINGLE LOW-9)
- U+2019 (RIGHT SINGLE) → U+2018 (LEFT SINGLE, used as closer in German)

Important: only swap actual quote characters, NOT apostrophes. The internal MLA (U+02BC) distinction in `processQuotes` makes this possible — at the point where you'd do the swap, apostrophes are still U+02BC.

### 3. French quotes (`"french"`)

- Double quotes: `"..."` → `«\u00A0...\u00A0»` (guillemets with NBSP padding)
- Single quotes: leave as curly quotes (French doesn't use single guillemets for quotes)
- Punctuation placement: outside quotes (like British)
- Apostrophes/contractions: still U+2019

Strategy: reuse the existing pipeline, then post-process:
- U+201C (LEFT DOUBLE) → `«\u00A0` (guillemet + NBSP)
- U+201D (RIGHT DOUBLE) → `\u00A0»` (NBSP + guillemet)

### 4. Add constants

In `src/constants.ts`, add to `UNICODE_SYMBOLS`:

```ts
DOUBLE_LOW_9_QUOTE: "\u201E",     // „
SINGLE_LOW_9_QUOTE: "\u201A",     // ‚
LEFT_GUILLEMET: "\u00AB",          // «
RIGHT_GUILLEMET: "\u00BB",        // »
```

### 5. Update `applyPunctuationStyle`

German and French both place punctuation outside quotes (same as British).

### 6. Update `TransformOptions` in `src/index.ts`

Update the JSDoc for `punctuationStyle` to document the new options.

### 7. Update benchmark expectations

The benchmark_cases.json already has the expected outputs for German and French. After implementation, punctilio should pass those cases, improving from 152/157 to 155/157.

## Testing

Add parametrized tests to `src/tests/quotes.test.ts`:

```ts
describe.each([
  // German double quotes
  ['"Guten Tag"', '„Guten Tag"', { punctuationStyle: "german" }],
  ['"Hello," she said.', '„Hello", she said.', { punctuationStyle: "german" }],
  // German single quotes
  ["'Hallo'", "‚Hallo'", { punctuationStyle: "german" }],
  // German apostrophes stay as RSQ
  ["it's", "it\u2019s", { punctuationStyle: "german" }],
  // French double quotes
  ['"Bonjour"', '«\u00A0Bonjour\u00A0»', { punctuationStyle: "french" }],
  // French apostrophes stay as RSQ
  ["l'homme", "l\u2019homme", { punctuationStyle: "french" }],
])("locale quotes: %s → %s", (input, expected, options) => {
  expect(transform(input, options)).toBe(expected)
})
```

## Architecture Notes

- The post-processing approach (convert to American first, then remap) is strongly preferred over duplicating the quote-matching logic. The existing quote regex is complex and battle-tested — don't rewrite it per locale.
- The MLA (U+02BC) intermediate representation is key to making the German swap work correctly: apostrophes are U+02BC during processing, so the U+2019→U+2018 swap only hits actual closing quotes.
- French NBSP inside guillemets is standard French typography. The NBSP prevents line breaks between the guillemet and the text.

## Files to Modify

1. `src/constants.ts` — add new Unicode constants
2. `src/quotes.ts` — extend PunctuationStyle, add post-processing in processQuotes
3. `src/index.ts` — update JSDoc
4. `src/tests/quotes.test.ts` — add locale tests
5. `src/tests/index.test.ts` — add integration tests with transform()
6. `benchmark_cases.json` — no changes needed (expectations already correct)
