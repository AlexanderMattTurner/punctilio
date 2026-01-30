# punctilio

> *punctilio* (n.): a fine point of conduct or procedure

Smart typography for JavaScript. Converts ASCII punctuation to proper Unicode.

```typescript
import { transform } from 'punctilio'

transform('"Don\'t stop", she said - "it\'s 1-5 pages..."')
// → "Don't stop," she said—"it's 1–5 pages…"
```

## Install

```bash
npm install punctilio
```

## What it does

| Before | After |
|--------|-------|
| "hello" | "hello" |
| don't | don't |
| word--word | word—word |
| 1-5 | 1–5 |
| -5 | −5 |
| ... | … |
| 5x5 | 5×5 |
| != <= >= | ≠ ≤ ≥ |
| (c) (r) (tm) | © ® ™ |
| -> <- | → ← |
| 5'10" | 5′10″ |

## Options

```typescript
transform(text, {
  // Style
  punctuationStyle: 'american' | 'british' | 'none',  // default: 'american'
  dashStyle: 'american' | 'british' | 'none',         // default: 'american'

  // Features
  symbols: true,         // math, legal, arrows
  fractions: false,      // 1/2 → ½
  degrees: false,        // 20 C → 20 °C
  collapseSpaces: true,  // normalize whitespace
})
```

**American** (default): `"Hello,"` and `word—word`
**British**: `"Hello",` and `word – word`

## Why punctilio?

I built this for [my website](https://turntrout.com). I wrote a comprehensive test suite covering edge cases I encountered, then later benchmarked how existing libraries would have performed. They don't do well:

| Input | smartypants output | Correct |
|-------|-------------------|---------|
| `'Twas the night` | 'Twas the night | ✗ |
| `the '99 season` | the '99 season | ✗ |
| `rock 'n' roll` | rock 'n' roll | ✗ |

The `'` in these should be apostrophes ('), not opening quotes (').

### Feature comparison

| Feature | punctilio | smartypants | tipograph | smartquotes |
|---------|-----------|-------------|-----------|-------------|
| Smart quotes | ✓ | ✓ | ✓ | ✓ |
| Leading apostrophe | ✓ | ✗ | ✗ | ✓ |
| Em dash | ✓ | ✓ | ✗ | ✗ |
| En dash (ranges) | ✓ | ✗ | ✓ | ✗ |
| Minus sign | ✓ | ✗ | ✓ | ✗ |
| Ellipsis | ✓ | ✓ | ✓ | ✗ |
| Multiplication | ✓ | ✗ | ✗ | ✗ |
| Math symbols | ✓ | ✗ | ✓ | ✗ |
| Legal symbols | ✓ | ✗ | © only | ✗ |
| Arrows | ✓ | ✗ | ✓ | ✗ |
| Prime marks | ✓ | ✗ | ✓ | ✓ |
| Degrees | ✓ | ✗ | ✗ | ✗ |
| Fractions | ✓ | ✗ | ✗ | ✗ |
| Localization | ✓ | ✗ | ✗ | ✗ |

[Benchmark source](./benchmark.mjs) · [Test suite](./src/tests/)

### What others offer that punctilio doesn't

**tipograph** supports:
- Punctuation ligatures (`??` → `⁇`, `?!` → `⁈`)
- Non-English quote styles (German „", French «»)

I chose not to implement ligatures—they have poor font support and add visual complexity without clear benefit. Non-English localization is on the roadmap.

## License

MIT
