# punctilio

> *punctilio* (n.): a fine point of conduct or procedure

Smart typography transformations for JavaScript/TypeScript. Converts ASCII punctuation to typographically correct Unicode characters. Originally built for [my personal website](https://turntrout.com/design).

## Features

- **Smart quotes**: `"straight"` → `"curly"` and `'apostrophes'` → `'apostrophes'`
- **Em dashes**: `word - word` or `word--word` → `word—word`
- **En dashes**: `1-5` → `1–5` (number ranges), `January-March` → `January–March` (date ranges)
- **Minus signs**: `-5` → `−5` (proper Unicode minus)
- **Ellipsis**: `...` → `…`
- **Multiplication**: `5x5` → `5×5`, `3*4` → `3×4`
- **Math symbols**: `!=` → `≠`, `+-` → `±`, `<=` → `≤`, `>=` → `≥`, `~=` → `≈`
- **Legal symbols**: `(c)` → `©`, `(r)` → `®`, `(tm)` → `™`
- **Arrows**: `->` → `→`, `<-` → `←`, `<->` → `↔`
- **Prime marks**: `5'10"` → `5′10″` (feet/inches, arcminutes/arcseconds)
- **Fractions** (optional): `1/2` → `½`, `3/4` → `¾`
- **Degrees** (optional): `20 C` → `20 °C`
- **Handles edge cases**: contractions, possessives, nested quotes, year abbreviations ('99), "rock 'n' roll"

## Why another typography library?

Existing solutions like [SmartyPants](https://daringfireball.net/projects/smartypants/) struggle with:

- **Apostrophe ambiguity**: Is `'Twas` an opening quote or apostrophe? (It's an apostrophe)
- **Cross-element text**: When quotes span `<em>"Hello</em> world"`, most libraries fail
- **Context sensitivity**: `'99` (year) vs `'hello'` (quoted) vs `don't` (contraction)

`punctilio` handles these through thorough regex patterns and an optional separator character for processing text that spans HTML elements.

## Installation

```bash
npm install punctilio
# or
pnpm add punctilio
```

## Usage

### Basic

```typescript
import { transform, niceQuotes, hyphenReplace } from 'punctilio'

// Apply all transformations
transform('"Hello," she said - "it\'s pages 1-5."')
// → "Hello," she said—"it's pages 1–5."

// Symbol transforms are included by default
transform('Wait... 5x5 != 25 (c) 2024')
// → Wait… 5×5 ≠ 25 © 2024

// Or use individual functions
niceQuotes('"Hello", she said.')
// → "Hello", she said.

hyphenReplace('word - word')
// → word—word
```

### Transform Options

```typescript
import { transform } from 'punctilio'

// Enable optional transforms
transform('Add 1/2 cup at 20 C', {
  fractions: true,  // 1/2 → ½
  degrees: true     // 20 C → 20 °C
})
// → Add ½ cup at 20 °C

// Disable symbol transforms if you only want quotes/dashes
transform('5x5 = 25', { symbols: false })
// → 5x5 = 25 (unchanged)
```

### With HTML Element Boundaries

When processing text that spans multiple HTML elements, use a separator character to mark boundaries:

```typescript
import { transform, DEFAULT_SEPARATOR } from 'punctilio'

// Your HTML: <p>"Hello <em>world</em>"</p>
// Extract text with separator between elements:
const text = `"Hello ${DEFAULT_SEPARATOR}world${DEFAULT_SEPARATOR}"`

const result = transform(text, { separator: DEFAULT_SEPARATOR })
// → "Hello \uE000world\uE000"
// The separator is preserved; split on it to restore to your elements
```

For a complete implementation showing how to use this with a HAST (HTML AST) tree, see the [`transformElement` function in TurnTrout.com](https://github.com/alexander-turner/TurnTrout.com/blob/main/quartz/plugins/transformers/formatting_improvement_html.ts).

## API

### `transform(text, options?)`

Applies all typography transformations. Options:
- `separator`: Boundary marker for HTML elements (default: `"\uE000"`)
- `symbols`: Include symbol transforms (default: `true`)
- `fractions`: Convert common fractions like 1/2 → ½ (default: `false`)
- `degrees`: Convert temperature notation like 20 C → 20 °C (default: `false`)

### Quote Functions

#### `niceQuotes(text, options?)`

Converts straight quotes to curly quotes. Handles:
- Opening/closing double quotes: `"` → `"` or `"`
- Opening/closing single quotes: `'` → `'` or `'`
- Contractions: `don't` → `don't`
- Possessives: `dog's` → `dog's`
- Year abbreviations: `'99` → `'99`
- Special cases: `'n'` in "rock 'n' roll"

### Dash Functions

#### `hyphenReplace(text, options?)`

Converts hyphens to proper dashes. Handles:
- Em dashes: `word - word` → `word—word`
- En dashes for number ranges: `1-5` → `1–5`
- En dashes for date ranges: `Jan-Mar` → `Jan–Mar`
- Minus signs: `-5` → `−5`
- Preserves: horizontal rules (`---`), compound words (`well-known`)

#### `enDashNumberRange(text, options?)`

Converts number ranges only: `pages 10-20` → `pages 10–20`

#### `enDashDateRange(text, options?)`

Converts month ranges only: `January-March` → `January–March`

#### `minusReplace(text, options?)`

Converts hyphens to minus signs in numerical contexts: `-5` → `−5`

### Symbol Functions

#### `ellipsis(text, options?)`

Converts three periods to ellipsis: `...` → `…`

#### `multiplication(text, options?)`

Converts multiplication patterns: `5x5` → `5×5`, `3*4` → `3×4`

#### `mathSymbols(text)`

Converts math operators:
- `!=` → `≠`
- `+-` or `+/-` → `±`
- `<=` → `≤`
- `>=` → `≥`
- `~=` or `=~` → `≈`

#### `legalSymbols(text)`

Converts legal symbols:
- `(c)` → `©`
- `(r)` → `®`
- `(tm)` → `™`

#### `arrows(text, options?)`

Converts arrow patterns:
- `->` or `-->` → `→`
- `<-` or `<--` → `←`
- `<->` or `<-->` → `↔`

#### `primeMarks(text, options?)`

Converts straight quotes after numbers to prime marks:
- `5'10"` → `5′10″` (feet and inches)
- `45° 30' 15"` → `45° 30′ 15″` (coordinates)

#### `fractions(text)`

Converts common fractions: `1/2` → `½`, `1/4` → `¼`, `3/4` → `¾`, etc.

#### `degrees(text)`

Converts temperature notation: `20 C` → `20 °C`, `68 F` → `68 °F`

#### `symbolTransform(text, options?)`

Applies all symbol transforms except fractions and degrees.

### Constants

- `DEFAULT_SEPARATOR`: The default separator character (`"\uE000"`)
- `months`: Regex-ready string of month names for date range detection

## Character Reference

| Input | Output | Unicode | Name |
|-------|--------|---------|------|
| `"` | `"` | U+201C | Left double quotation mark |
| `"` | `"` | U+201D | Right double quotation mark |
| `'` | `'` | U+2018 | Left single quotation mark |
| `'` | `'` | U+2019 | Right single quotation mark (apostrophe) |
| `--` | `—` | U+2014 | Em dash |
| `-` (range) | `–` | U+2013 | En dash |
| `-` (negative) | `−` | U+2212 | Minus sign |
| `...` | `…` | U+2026 | Ellipsis |
| `x` (multiply) | `×` | U+00D7 | Multiplication sign |
| `!=` | `≠` | U+2260 | Not equal |
| `+-` | `±` | U+00B1 | Plus-minus |
| `<=` | `≤` | U+2264 | Less than or equal |
| `>=` | `≥` | U+2265 | Greater than or equal |
| `(c)` | `©` | U+00A9 | Copyright |
| `(r)` | `®` | U+00AE | Registered |
| `(tm)` | `™` | U+2122 | Trademark |
| `->` | `→` | U+2192 | Right arrow |
| `<-` | `←` | U+2190 | Left arrow |
| `<->` | `↔` | U+2194 | Left-right arrow |
| `'` (after digit) | `′` | U+2032 | Prime (feet, arcminutes) |
| `"` (after digit) | `″` | U+2033 | Double prime (inches, arcseconds) |

## License

MIT © Alexander Turner
