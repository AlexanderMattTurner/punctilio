> *punctilio* (n.): precise observance of formalities.

A comprehensive JavaScript typography package.

```typescript
import { transform } from 'punctilio'

transform('"It\'s a beautiful thing, the destruction of words..." -- 1984')
// → "It's a beautiful thing, the destruction of words…" — 1984
```

[![Test](https://github.com/alexander-turner/punctilio/actions/workflows/test.yml/badge.svg)](https://github.com/alexander-turner/punctilio/actions/workflows/test.yml)
[![Lint](https://github.com/alexander-turner/punctilio/actions/workflows/lint.yml/badge.svg)](https://github.com/alexander-turner/punctilio/actions/workflows/lint.yml)
[![Coverage](https://img.shields.io/badge/coverage-100%25-brightgreen)](https://github.com/alexander-turner/punctilio)
 

## Install

```bash
npm install punctilio
```

## Options

```typescript
transform(text, {
  punctuationStyle: 'american' | 'british' | 'none',  // default: 'american'
  dashStyle: 'american' | 'british' | 'none',         // default: 'american'

  symbols: true,         // math, legal, arrows
  collapseSpaces: true,  // normalize whitespace
  fractions: false,      // 1/2 → ½
  degrees: false,        // 20 C → 20 °C
  superscript: false,    // 1st → 1ˢᵗ
})
```

## Why punctilio?

I built `punctilio` for [my website](https://turntrout.com/design). I wrote and sharpened the core regexes sporadically over several months, exhaustively testing edge cases.

### Feature comparison

I tested `punctilio` 0.4 against JavaScript typography packages: [`smartypants`](https://www.npmjs.com/package/smartypants) 0.2.2, [`@tremby/smartypants`](https://www.npmjs.com/package/@tremby/smartypants) 0.1.0, [`tipograph`](https://www.npmjs.com/package/tipograph) 0.7.4, and [`smartquotes`](https://www.npmjs.com/package/smartquotes) 2.3.2.

**Note on Python**: The original SmartyPants was written in Python by John Gruber (2003). All JavaScript implementations are ports of this original. See [`benchmark_python.py`](./benchmark_python.py) for Python package comparison.

**Benchmark methodology**: To ensure fairness, each package is tested with its optimal configuration, and the benchmark includes tests for features that competitors excel at (ligatures, non-English quotes) where `punctilio` has gaps.

For example, `smartypants` ignores leading apostrophes:

| Input | `smartypants` | `punctilio` |
|-------|-------------------|---------|
| 'Twas the night | ‘Twas the night ✗ | ’Twas the night ✓ |
| the '99 season | the ‘99 season ✗ | the ’99 season ✓ |
| rock 'n' roll | rock ‘n’ roll ✗ | rock ’n’ roll ✓ |

By running [`benchmark.mjs`](./benchmark.mjs), I graded all libraries on a subset of [my unit tests](./src/tests/), plus tests for features that competitors excel at. Run `node benchmark.mjs` to see the latest scores.

| Package | Score |
|---------|-------|
| `punctilio` | 76/82 (92.7%) |
| `tipograph` | 48/82 (58.5%) |
| `smartquotes` | 30/82 (36.6%) |
| `@tremby/smartypants` | 29/82 (35.4%) |
| `smartypants` | 28/82 (34.1%) |

| Feature | Example | `smartypants` | `@tremby/smartypants` | `tipograph` | `smartquotes` | `punctilio` |
|---------|---------|---------------|----------------------|-------------|---------------|-------------|
| Smart quotes | "hello" → "hello" | ✓ | ✓ | ✓ | ✓ | ✓ |
| Leading apostrophe | 'Twas → 'Twas | ✗ | ✗ | ✗ | ✓ | ✓ |
| Em dash | -- → — | ✓ | ✓ | ✗ | ✗ | ✓ |
| En dash (ranges) | 1-5 → 1–5 | ✗ | ✗ | ✓ | ✗ | ✓ |
| Minus sign | -5 → −5 | ✗ | ✗ | ✓ | ✗ | ✓ |
| Ellipsis | ... → … | ✓ | ✓ | ✓ | ✗ | ✓ |
| Multiplication | 5x5 → 5×5 | ✗ | ✗ | ✗ | ✗ | ✓ |
| Math symbols | != → ≠ | ✗ | ✗ | ✓ | ✗ | ✓ |
| Legal symbols | (c) → © | ✗ | ✗ | © only | ✗ | ✓ |
| Arrows | -> → → | ✗ | ✗ | ✓ | ✗ | ✓ |
| Prime marks | 5'10" → 5′10″ | ✗ | ✗ | ✓ | ✓ | ✓ |
| Degrees | 20 C → 20 °C | ✗ | ✗ | ✗ | ✗ | ✓ |
| Fractions | 1/2 → ½ | ✗ | ✗ | ✗ | ✗ | ✓ |
| Superscripts | 1st → 1ˢᵗ | ✗ | ✗ | ✗ | ✗ | ✓ |
| Localization | American/British | ✗ | ✗ | ✗ | ✗ | ✓ |
| **Ligatures** | ?? → ⁇ | ✗ | ✗ | ✓ | ✗ | ✗ |
| **Non-English quotes** | „Hallo" (German) | ✗ | ✗ | ✓ | ✗ | ✗ |

### What other packages offer that `punctilio` doesn't

`tipograph` supports:
- Punctuation ligatures (?? → ⁇, ?! → ⁈)
- Non-English quote styles (German „", French «»)

I chose not to implement punctuation ligatures as they have poor font support and add visual complexity. Non-English localization is a valid use case that `punctilio` doesn't currently support—pull requests welcome.
