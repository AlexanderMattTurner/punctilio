# punctilio

> *punctilio* (n.): a fine point of conduct or procedure

The best typography package for JavaScript. Converts ASCII punctuation to proper Unicode.

```typescript
import { transform } from 'punctilio'

transform('"Don\'t stop", she said - "it\'s 1-5 pages..."')
// → “Don't stop,” she said—“it’s 1–5 pages…”
```

[![Test](https://github.com/alexander-turner/punctilio/actions/workflows/test.yml/badge.svg)](https://github.com/alexander-turner/punctilio/actions/workflows/test.yml)
[![Lint](https://github.com/alexander-turner/punctilio/actions/workflows/lint.yml/badge.svg)](https://github.com/alexander-turner/punctilio/actions/workflows/lint.yml)
[![Coverage](https://img.shields.io/badge/coverage-100%25-brightgreen)](https://github.com/alexander-turner/punctilio)
 

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
  punctuationStyle: 'american' | 'british' | 'none',  // default: 'american'
  dashStyle: 'american' | 'british' | 'none',         // default: 'american'

  symbols: true,         // math, legal, arrows
  collapseSpaces: true,  // normalize whitespace
  fractions: false,      // 1/2 → ½
  degrees: false,        // 20 C → 20 °C
})
```

**American** (default): `"Hello,"` and `word—word`
**British**: `"Hello",` and `word – word`

## Why punctilio?

I built punctilio for [my website](https://turntrout.com/design). I wrote and sharpened the regexes over the course of months, exhaustively testing edge cases. 

As I'm making this package publicly available, I benchmarked how existing libraries would have performed. They don't do well:

| Input | smartypants  | punctilio |
|-------|-------------------|---------|
| 'Twas the night | ‘Twas the night ✗ | ’Twas the night  ✓  |
| the '99 season | the ’99 season ✗ | the **’**99 season ✓  |
| rock 'n' roll | rock ‘n’ roll ✗ | rock **’**n’ roll  ✓  |

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

### What other packages offer that punctilio doesn't

**tipograph** supports:
- Punctuation ligatures (`??` → `⁇`, `?!` → `⁈`)
- Non-English quote styles (German „", French «»)

I chose not to implement punctuation ligatures as they have poor font support and add visual complexity without clear benefit. I don't have a personal reason to use non-English localization, but others are welcome to make a pull request.
