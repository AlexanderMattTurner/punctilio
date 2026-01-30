# Typography Library Comparison

Benchmark of punctilio 0.3 vs competitors on 70 test cases.

## Scores

| Package | Score |
|---------|-------|
| punctilio | 70/70 (100%) |
| tipograph | 42/70 (60%) |
| smartquotes | 30/70 (43%) |
| smartypants | 29/70 (41%) |

## Feature Matrix

| Feature | Example | punctilio | smartypants | tipograph | smartquotes |
|---------|---------|-----------|-------------|-----------|-------------|
| Smart quotes | `"hello"` → `"hello"` | ✓ | ✓ | ✓ | ✓ |
| Contractions | `don't` → `don't` | ✓ | ✓ | ✓ | ✓ |
| Leading apostrophe | `'twas` → `'twas` | ✓ | ✗ | ✗ | ✓ |
| Em dash | `word--word` → `word—word` | ✓ | ✓ | ✗ | ✗ |
| En dash (ranges) | `1-5` → `1–5` | ✓ | ✗ | ✓ | ✗ |
| Minus sign | `-5` → `−5` | ✓ | ✗ | ✓ | ✗ |
| Ellipsis | `...` → `…` | ✓ | ✓ | ✓ | ✗ |
| Multiplication | `5x5` → `5×5` | ✓ | ✗ | ✗ | ✗ |
| Not equal | `!=` → `≠` | ✓ | ✗ | ✓ | ✗ |
| Comparison | `<=` → `≤` | ✓ | ✗ | ✓ | ✗ |
| Plus-minus | `+-5` → `±5` | ✓ | ✗ | ✓ | ✗ |
| Copyright | `(c)` → `©` | ✓ | ✗ | ✓ | ✗ |
| Registered | `(r)` → `®` | ✓ | ✗ | ✗ | ✗ |
| Trademark | `(tm)` → `™` | ✓ | ✗ | ✗ | ✗ |
| Arrows | `->` → `→` | ✓ | ✗ | ✓ | ✗ |
| Prime marks | `5'10"` → `5′10″` | ✓ | ✗ | ✓ | ✓ |
| Degrees | `20 C` → `20 °C` | ✓ | ✗ | ✗ | ✗ |
| Fractions | `1/2` → `½` | ✓ | ✗ | ✗ | ✗ |
| **Total** | | **18/18** | **4/18** | **12/18** | **5/18** |

## Localization (punctilio 0.3)

```typescript
transform(text, {
  punctuationStyle: "american" | "british" | "none",
  dashStyle: "american" | "british" | "none"
})
```

| Style | Punctuation | Dashes |
|-------|-------------|--------|
| American | `"Hi",` → `"Hi,"` | `a - b` → `a—b` |
| British | `"Hi",` → `"Hi",` | `a - b` → `a – b` |

## What competitors offer that punctilio doesn't

| Feature | Example | Package |
|---------|---------|---------|
| Punctuation ligatures | `??` → `⁇` | tipograph |
| Space collapse | `a    b` → `a b` | tipograph |
| Non-English quotes | `"hi"` → `„hi"` | tipograph |
