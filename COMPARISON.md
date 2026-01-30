# Typography Library Comparison

Benchmark of punctilio vs competitors on 70 test cases.

## Results

| Package | Pass Rate |
|---------|-----------|
| punctilio | 70/70 (100%) |
| tipograph | 43/70 (61%) |
| smartquotes | 31/70 (44%) |
| smartypants | 30/70 (43%) |

**Caveat**: This uses punctilio's expected outputs as ground truth. Some cases have multiple valid interpretations (see below).

## Ambiguous Cases (style choices, not correctness)

| Case | punctilio choice | Alternative |
|------|------------------|-------------|
| `'SUP` | `'SUP` (apostrophe) | `'SUP` (opening quote) |
| `Rock 'n' Roll` | `'n'` (both apostrophes) | `'n'` (quoted word) |
| `"'sup"` | `"'sup"` (apostrophe) | `"'sup"` (nested quote) |
| `word — word` | `word—word` (closed) | `word — word` (open/British) |
| `---` | `—` (em dash) | `—-` or `— ` (various) |

For these ~5 cases, competitors using different conventions aren't "wrong."

## Feature Comparison

| Situation | punctilio | smartypants | tipograph | smartquotes |
|-----------|-----------|-------------|-----------|-------------|
| **Quotes** | | | | |
| Basic double/single quotes | ✓ | ✓ | ✓ | ✓ |
| Leading apostrophe (`'SUP`, `'99`) | ✓ | ✗ | ✗ | ✓ |
| Rock 'n' Roll | ✓ | ✗ | ✗ | ✗ |
| Nested with slang (`"'sup"`) | ✓ | ✗ | ✗ | ✗ |
| **Dashes** | | | | |
| Spaced hyphen → em dash | ✓ | ✗ | en dash | ✗ |
| Double/triple hyphen | ✓ | partial | ✓ | ✗ |
| Space removal around em dash | ✓ | ✗ | ✗ | ✗ |
| Number ranges → en dash | ✓ | ✗ | ✗ | ✗ |
| Date ranges → en dash | ✓ | ✗ | ✗ | ✗ |
| Minus signs | ✓ | ✗ | ✓ | ✗ |
| **Symbols** | | | | |
| Ellipsis | ✓ | ✓ | ✓ | ✗ |
| Multiplication (`×`) | ✓ | ✗ | partial | ✗ |
| Math (`≠ ≤ ≥ ±`) | ✓ | ✗ | partial | ✗ |
| Legal (`© ® ™`) | ✓ | ✗ | © only | ✗ |
| Arrows (`→ ← ↔`) | ✓ | ✗ | ✓ | ✗ |
| Prime marks (`′ ″`) | ✓ | ✗ | ✓ | ✓ |
| Degrees (`°C`) | ✓ | ✗ | ✗ | ✗ |
| Fractions (`½ ¼ ¾`) | ✓ | ✗ | ✗ | ✗ |
| **Unique to competitors** | | | | |
| Multiple space collapse | — | — | ✓ | — |
| Punctuation ligatures (`⁇ ⁈`) | — | — | ✓ | — |
| Language-specific quotes | — | — | ✓ | — |

## Key Differences

### smartypants
The original. Handles quotes, dashes (partially), ellipses. No extended symbols.

### tipograph
Most feature-rich competitor. Has math symbols, arrows, prime marks, and unique features like punctuation ligatures (`??` → `⁇`) and space normalization. However:
- Fails apostrophe ambiguity (treats `'SUP` as opening quote)
- Uses en dash instead of em dash for spaced hyphens
- No number/date range detection
- No fractions or degrees

### smartquotes
Focused on quotes + prime marks. Handles `5'10"` correctly but fails on Rock 'n' Roll. No symbol support.

## punctilio 0.3 Localization Options

```typescript
transform(text, {
  punctuationStyle: "american" | "british" | "none",  // comma/period placement
  dashStyle: "american" | "british" | "none"          // em dash vs spaced en dash
})
```

| Style | Punctuation | Dashes |
|-------|-------------|--------|
| American (default) | `"Hello,"` (inside) | `word—word` (unspaced em) |
| British | `"Hello",` (outside) | `word – word` (spaced en) |
| None | no change | no change |

## What competitors have that punctilio doesn't

| Feature | Available in |
|---------|--------------|
| Multiple space collapse | tipograph |
| Punctuation ligatures (`⁇ ⁈ ⁉`) | tipograph |
| Non-English quote styles (German „", Czech „") | tipograph |
| Exclamation collapse (`!!` → `!`) | tipograph |
