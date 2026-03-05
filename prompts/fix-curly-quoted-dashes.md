# Task: Fix Em-Dash Conversion Between Pre-Existing Curly Quotes

## Problem

When input already contains curly (smart) quotes with straight double-hyphens between them, the dash conversion works but the quote engine re-processes the curly quotes and flips their direction.

**Failing benchmark case:**
- Input: `"Hello"--"World"` (curly quotes already present, straight `--` between them)
- Expected: `"Hello"—"World"` (em-dash inserted, curly quotes preserved as-is)
- Got: `"Hello"—"World"` (em-dash correct, but quote directions changed)

Specifically, the input has:
- U+201C `"` before Hello (correct LEFT)
- U+201D `"` after Hello (correct RIGHT)
- U+201C `"` before World (correct LEFT)
- U+201D `"` after World (correct RIGHT)

But the output has the quotes re-processed as if they were straight quotes, changing some directions.

## Root Cause

The transform pipeline in `src/index.ts` runs:
1. `hyphenReplace` — converts `--` to `—` (correct)
2. `primeMarks` — no effect here
3. `niceQuotes` — **re-processes all quote characters**, including pre-existing curly quotes

The issue is in `src/quotes.ts`: the `convertDoubleQuotes` function matches `"` (straight double quote) using `["]` in its regex patterns, but the curly quotes `"` and `"` are not matched by these patterns. So the curly quotes should pass through unchanged... unless the pipeline order causes the curly quotes to interact with other patterns.

## Investigation Steps

1. Run `hyphenReplace('"Hello"--"World"')` in isolation — verify the `--` becomes `—` and quotes are unchanged
2. Run `niceQuotes('"Hello"—"World"')` in isolation — check if the curly quotes get altered
3. Check `convertDoubleQuotes` for any patterns that match curly quote characters directly
4. Check `applyPunctuationStyle` for patterns that match curly quotes — this is the likely culprit, since `periodOutsideRegex` and `commaOutsideRegex` explicitly match `RIGHT_DOUBLE_QUOTE` and could interact with the surrounding context

## Likely Fix

The issue is probably in `applyPunctuationStyle` which matches RIGHT_DOUBLE_QUOTE and RIGHT_SINGLE_QUOTE to move periods/commas. When the input has pre-existing curly quotes with `--` between them, the intermediate state after dash conversion has `"Hello"—"World"` where the American punctuation style rule tries to move things around.

The fix should ensure that pre-existing curly quotes are not re-processed. Options:

### Option A: Skip already-curly quotes in the quote engine

Before running `convertSingleQuotes`/`convertDoubleQuotes`, temporarily replace pre-existing curly quotes with placeholders, then restore them after. This is the cleanest approach since it preserves the user's intent.

```ts
function processQuotes(text: string, options: QuoteOptions): string {
  const sep = options.separator ?? DEFAULT_SEPARATOR
  // ... existing code ...

  // Preserve pre-existing curly quotes by replacing with placeholders
  const PLACEHOLDER_LDQ = "\uE001"  // or another PUA char
  const PLACEHOLDER_RDQ = "\uE002"
  // etc.
  text = text.replaceAll(LEFT_DOUBLE_QUOTE, PLACEHOLDER_LDQ)
  text = text.replaceAll(RIGHT_DOUBLE_QUOTE, PLACEHOLDER_RDQ)

  text = convertSingleQuotes(text, sep)
  text = convertDoubleQuotes(text, sep)
  text = applyPunctuationStyle(text, sep, punctuationStyle)

  // Restore pre-existing curly quotes
  text = text.replaceAll(PLACEHOLDER_LDQ, LEFT_DOUBLE_QUOTE)
  text = text.replaceAll(PLACEHOLDER_RDQ, RIGHT_DOUBLE_QUOTE)
  return text
}
```

**Caution:** The placeholder characters must not conflict with the separator (default U+E000). Use U+E001-U+E004 for the four curly quote types.

### Option B: Make applyPunctuationStyle more conservative

Only move periods/commas that were part of a quote boundary created in THIS pass (by tracking which quotes were newly inserted). More complex, harder to maintain.

**Recommendation: Option A** — it's simpler, more predictable, and aligns with the principle that punctilio should not alter text that's already typographically correct.

## Testing

Add to `src/tests/quotes.test.ts` or `src/tests/index.test.ts`:

```ts
describe("pre-existing curly quotes", () => {
  it.each([
    // Curly quotes with straight dashes between them
    ['\u201CHello\u201D--\u201CWorld\u201D', '\u201CHello\u201D\u2014\u201CWorld\u201D'],
    // Already-correct curly quotes should pass through unchanged
    ['\u201CHello,\u201D she said.', '\u201CHello,\u201D she said.'],
    // Mix of curly and straight quotes
    ['\u201CHello\u201D and "World"', '\u201CHello\u201D and \u201CWorld\u201D'],
  ])("preserves pre-existing curly quotes: %s", (input, expected) => {
    expect(transform(input)).toBe(expected)
  })
})
```

## Edge Cases to Consider

- Mixed curly and straight quotes in the same string
- Pre-existing curly quotes adjacent to straight quotes
- Pre-existing curly quotes with American-style punctuation that the user deliberately placed outside (British style in an American context)
- Idempotency: `transform(transform(x))` must still equal `transform(x)` — this is the key constraint
- The placeholder approach must handle the separator correctly — placeholders must not appear in the `assertSeparatorCountPreserved` check

## Files to Modify

1. `src/quotes.ts` — add placeholder logic in `processQuotes`
2. `src/tests/quotes.test.ts` — add tests for pre-existing curly quotes
3. `src/tests/index.test.ts` — add integration test for the benchmark case
