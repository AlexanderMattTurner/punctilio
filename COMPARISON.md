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

| Feature | punctilio | smartypants | tipograph | smartquotes |
|---------|-----------|-------------|-----------|-------------|
| Smart quotes | ✓ | ✓ | ✓ | ✓ |
| Contractions | ✓ | ✓ | ✓ | ✓ |
| Leading apostrophe | ✓ | ✗ | ✗ | ✓ |
| Em dash | ✓ | ✓ | ✗ | ✗ |
| En dash (ranges) | ✓ | ✗ | ✓ | ✗ |
| Minus sign | ✓ | ✗ | ✓ | ✗ |
| Ellipsis | ✓ | ✓ | ✓ | ✗ |
| Multiplication × | ✓ | ✗ | ✗ | ✗ |
| Math ≠ | ✓ | ✗ | ✓ | ✗ |
| Math ≤ ≥ | ✓ | ✗ | ✓ | ✗ |
| Math ± | ✓ | ✗ | ✓ | ✗ |
| Copyright © | ✓ | ✗ | ✓ | ✗ |
| Registered ® | ✓ | ✗ | ✓ | ✗ |
| Trademark ™ | ✓ | ✗ | ✓ | ✗ |
| Arrows → | ✓ | ✗ | ✓ | ✗ |
| Prime marks ′″ | ✓ | ✗ | ✓ | ✓ |
| Degrees ° | ✓ | ✗ | ✗ | ✗ |
| Fractions ½ | ✓ | ✗ | ✗ | ✗ |
| **Total** | **18/18** | **4/18** | **12/18** | **5/18** |

## Localization (punctilio 0.3)

```typescript
transform(text, {
  punctuationStyle: "american" | "british" | "none",
  dashStyle: "american" | "british" | "none"
})
```

| Style | Punctuation | Dashes |
|-------|-------------|--------|
| American (default) | `"Hello,"` | `word—word` |
| British | `"Hello",` | `word – word` |

## Ambiguous Cases

These vary by style guide—not correctness:

| Input | American | British |
|-------|----------|---------|
| `"Hi", she said` | `"Hi," she said` | `"Hi", she said` |
| `word - word` | `word—word` | `word – word` |

## What competitors offer that punctilio doesn't

| Feature | Package |
|---------|---------|
| Punctuation ligatures `⁇ ⁈` | tipograph |
| Multiple space collapse | tipograph |
| Non-English quotes `„" «»` | tipograph |
