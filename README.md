# punctilio

> *punctilio* (n.): a fine point of conduct or procedure

Smart typography transformations for JavaScript/TypeScript. Converts ASCII punctuation to typographically correct Unicode characters. Originally built for [my personal website](https://turntrout.com/design).

## Features

- **Smart quotes**: `"straight"` → `"curly"` and `'apostrophes'` → `'apostrophes'`
- **Em dashes**: `word - word` or `word--word` → `word—word`
- **En dashes**: `1-5` → `1–5` (number ranges), `January-March` → `January–March` (date ranges)
- **Minus signs**: `-5` → `−5` (proper Unicode minus)
- **Handles edge cases**: contractions, possessives, nested quotes, year abbreviations ('99), "rock 'n' roll"

## Why another typography library?

Existing solutions like [SmartyPants](https://daringfireball.net/projects/smartypants/) struggle with:

- **Apostrophe ambiguity**: Is `'Twas` an opening quote or apostrophe? (It's an apostrophe)
- **Cross-element text**: When quotes span `<em>"Hello</em> world"`, most libraries fail
- **Context sensitivity**: `'99` (year) vs `'hello'` (quoted) vs `don't` (contraction)

`punctilio` handles these through thorough regex patterns and an optional separator character for processing text that spans HTML elements.

## Installation

```bash
npm install @alexander-turner/punctilio
# or
pnpm add @alexander-turner/punctilio
```

## Usage

### Basic

```typescript
import { transform, niceQuotes, hyphenReplace } from '@alexander-turner/punctilio'

// Apply all transformations
transform('"Hello," she said - "it\'s pages 1-5."')
// → "Hello," she said—"it's pages 1–5."

// Or use individual functions
niceQuotes('"Hello", she said.')
// → "Hello", she said.

hyphenReplace('word - word')
// → word—word
```

### With HTML Element Boundaries

When processing text that spans multiple HTML elements, use a separator character to mark boundaries:

```typescript
import { transform, DEFAULT_SEPARATOR } from '@alexander-turner/punctilio'

// Your HTML: <p>"Hello <em>world</em>"</p>
// Extract text with separator between elements:
const text = `"Hello ${DEFAULT_SEPARATOR}world${DEFAULT_SEPARATOR}"`

const result = transform(text, { separator: DEFAULT_SEPARATOR })
// → "Hello \uE000world\uE000"
// The separator is preserved; split on it to restore to your elements
```

For a complete implementation showing how to use this with a HAST (HTML AST) tree, see the [`transformElement` function in TurnTrout.com](https://github.com/alexander-turner/TurnTrout.com/blob/main/quartz/plugins/transformers/formatting_improvement_html.ts). I explain the philosophy behind this algorithm.

## API

### `transform(text, options?)`

Applies all typography transformations (quotes + dashes).

### `niceQuotes(text, options?)`

Converts straight quotes to curly quotes. Handles:
- Opening/closing double quotes: `"` → `"` or `"`
- Opening/closing single quotes: `'` → `'` or `'`
- Contractions: `don't` → `don't`
- Possessives: `dog's` → `dog's`
- Year abbreviations: `'99` → `'99`
- Special cases: `'n'` in "rock 'n' roll"

### `hyphenReplace(text, options?)`

Converts hyphens to proper dashes. Handles:
- Em dashes: `word - word` → `word—word`
- En dashes for number ranges: `1-5` → `1–5`
- En dashes for date ranges: `Jan-Mar` → `Jan–Mar`
- Minus signs: `-5` → `−5`
- Preserves: horizontal rules (`---`), compound words (`well-known`)

### `enDashNumberRange(text, options?)`

Converts number ranges only: `pages 10-20` → `pages 10–20`

### `enDashDateRange(text, options?)`

Converts month ranges only: `January-March` → `January–March`

### `minusReplace(text, options?)`

Converts hyphens to minus signs in numerical contexts: `-5` → `−5`

## License

MIT © Alexander Turner
