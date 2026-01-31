> *punctilio* (n.): precise observance of formalities.

The best typography package for English.

```typescript
import { transform } from 'punctilio'

transform('"It\'s a beautiful thing, the destruction of words..." -- 1984')
// → “It’s a beautiful thing, the destruction of words…” — 1984
```

[![Test](https://github.com/alexander-turner/punctilio/actions/workflows/test.yml/badge.svg)](https://github.com/alexander-turner/punctilio/actions/workflows/test.yml)
[![Lint](https://github.com/alexander-turner/punctilio/actions/workflows/lint.yml/badge.svg)](https://github.com/alexander-turner/punctilio/actions/workflows/lint.yml)
[![Coverage](https://img.shields.io/badge/coverage-100%25-brightgreen)](https://github.com/alexander-turner/punctilio)
 

## Install

```bash
npm install punctilio
```

## Why punctilio?

As far as I can tell, `punctilio` is the most reliable and feature-complete. I built `punctilio` for [my website](https://turntrout.com/design). I wrote and sharpened the core regexes sporadically over several months, exhaustively testing edge cases. 

### Feature comparison

I tested `punctilio` 0.4 against [`smartypants`](https://www.npmjs.com/package/smartypants) 0.2.2, [`tipograph`](https://www.npmjs.com/package/tipograph) 0.7.4, and [`smartquotes`](https://www.npmjs.com/package/smartquotes) 2.3.2.[^python] These other packages have spotty feature coverage and inconsistent impact on text. For example, `smartypants` ignores leading apostrophes:

[^python]: The Python libraries I found were closely related to the JavaScript packages, so I don’t include Python tests. 

| Input | `smartypants` | `punctilio` |
|:-----:|:-----------------:|:-------:|
| 'Twas the night | ‘Twas the night ✗ | ’Twas the night ✓ |
| the '99 season | the ‘99 season ✗ | the ’99 season ✓ |
| rock 'n' roll | rock ‘n’ roll ✗ | rock ’n’ roll ✓ |

By running [`benchmark.mjs`](./benchmark.mjs), I graded all libraries on a subset of [my unit tests](./src/tests/), selected to represent a wide range of features. 

| Package | Score |
|--------:|:------|
| `punctilio` | 76/82 (93%) |
| `tipograph` | 48/82 (59%) |
| `smartquotes` | 30/82 (37%) |
| `smartypants` | 28/82 (34%) |

| Feature | Example | `smartypants` | `tipograph` | `smartquotes` | `punctilio` |
|--------:|:-------:|:-------:|:-------:|:-------:|:-------:|
| Smart quotes | "hello" → “hello” | ✓ | ✓ | ✓ | ✓ |
| Leading apostrophe | 'Twas → ’Twas | ✗ | ✗ | ✓ | ✓ |
| Em dash | -- → — | ✓ | ✗ | ✗ | ✓ |
| En dash (ranges) | 1-5 → 1–5 | ✗ | ✓ | ✗ | ✓ |
| Minus sign | -5 → −5 | ✗ | ✓ | ✗ | ✓ |
| Ellipsis | ... → … | ✓ | ✓ | ✗ | ✓ |
| Multiplication | 5x5 → 5×5 | ✗ | ✗ | ✗ | ✓ |
| Math symbols | != → ≠ | ✗ | ✓ | ✗ | ✓ |
| Legal symbols | (c) → © | ✗ | © only | ✗ | ✓ |
| Arrows | -> → → | ✗ | ✓ | ✗ | ✓ |
| Prime marks | 5'10" → 5′10″ | ✗ | ✓ | ✓ | ✓ |
| Degrees | 20 C → 20 °C | ✗ | ✗ | ✗ | ✓ |
| Fractions | 1/2 → ½ | ✗ | ✗ | ✗ | ✓ |
| Superscripts | 1st → 1ˢᵗ | ✗ | ✗ | ✗ | ✓ |
| Localization | American/British | ✗ | ✗ | ✗ | ✓ |
| Ligatures | ?? → ⁇ | ✗ | ✓ | ✗ | ✓ |
| Non-English quotes | „Hallo" (German) | ✗ | ✓ | ✗ | ✗ |

I don’t have a personal reason to use non-English localization, but others are welcome to make a pull request.

## Options

`punctilio` doesn't enable all transformations by default. Fractions and degrees tend to match too aggressively (getting the degrees correct requires semantic meaning), while superscript letters and punctuation ligatures have spotty font support—this README's font doesn't even support the example superscript! Furthermore, `ligatures=true` can change the meaning of text by collapsing question and exclamation marks.

```typescript
transform(text, {
  punctuationStyle: 'american' | 'british' | 'none',  // default: 'american'
  dashStyle: 'american' | 'british' | 'none',         // default: 'american'

  symbols: true,         // math, legal, arrows
  collapseSpaces: true,  // normalize whitespace
  fractions: false,      // 1/2 → ½
  degrees: false,        // 20 C → 20 °C
  superscript: false,    // 1st → 1ˢᵗ
  ligatures: false,      // ??? → ⁇, ?! → ⁈, !? → ⁉, !!! → !
})
```
