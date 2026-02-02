> *punctilio* (n.): precise observance of formalities.

The best typography package for English.

```typescript
import { transform } from 'punctilio'

transform('"It\'s a beautiful thing, the destruction of words..." -- 1984')
// → “It’s a beautiful thing, the destruction of words…”—1984
```

[![Test](https://github.com/alexander-turner/punctilio/actions/workflows/test.yml/badge.svg)](https://github.com/alexander-turner/punctilio/actions/workflows/test.yml)
[![Lint](https://github.com/alexander-turner/punctilio/actions/workflows/lint.yml/badge.svg)](https://github.com/alexander-turner/punctilio/actions/workflows/lint.yml)
[![Coverage](https://img.shields.io/badge/coverage-100%25-brightgreen)](https://github.com/alexander-turner/punctilio)
 
```bash
npm install punctilio
```

## Why punctilio?

As far as I can tell, `punctilio` is the most reliable and feature-complete. I built `punctilio` for [my website](https://turntrout.com/design). I wrote[^wrote] and sharpened the core regexes sporadically over several months, exhaustively testing edge cases. Eventually, I decided to spin off the functionality into its own package.

[^wrote]: While Claude is the number one contributor to this repository, that’s just because Claude has helped me port my existing code and add minor features. The core regular expressions (e.g. dashes, quotes, multiplication signs) are human-written. Those numerous commits don’t show in this repo’s history.

I tested `punctilio` 1.2.9 against [`smartypants`](https://www.npmjs.com/package/smartypants) 0.2.2, [`tipograph`](https://www.npmjs.com/package/tipograph) 0.7.4, [`smartquotes`](https://www.npmjs.com/package/smartquotes) 2.3.2, [`typograf`](https://www.npmjs.com/package/typograf) 7.6.0, and [`retext-smartypants`](https://www.npmjs.com/package/retext-smartypants) 6.2.0.[^python] These other packages have spotty feature coverage and inconsistent impact on text. For example, `smartypants` mishandles quotes after em dashes (though quite hard to see in GitHub’s font) and lacks multiplication sign support.

[^python]: The Python libraries I found were closely related to the JavaScript packages. I tested them and found similar scores, so I don’t include separate Python results.

| Input | `smartypants` | `punctilio` |
|:-----:|:-----------------:|:-------:|
| She said—"Hi!" | She said—”Hi!” (✗) | She said—“Hi!” (✓) |
| 5x5 |	5x5 (✗) |	5×5 (✓) |

My [`benchmark.mjs`](https://github.com/alexander-turner/punctilio/blob/main/benchmark.mjs) measures how well libraries handle a [wide range of scenarios](https://github.com/alexander-turner/punctilio/blob/main/benchmark_cases.json). The benchmark normalizes stylistic differences (e.g. non-breaking vs regular space, British vs American dash spacing) for fair comparison.

| Package | Passed (of 154) |
|--------:|:----------------|
| `punctilio` | 149 (97%) |
| `tipograph` | 88 (57%) |
| `typograf` | 74 (48%) |
| `smartypants` | 68 (44%) |
| `smartquotes` | 67 (44%) |
| `retext-smartypants` | 65 (42%) |

| Feature | Example | `punctilio` | `smartypants` | `tipograph` | `smartquotes` | `typograf` |
|--------:|:-------:|:-------:|:-------:|:-------:|:-------:|:-------:|
| Smart quotes | "hello" → “hello” | ✓ | ✓ | ✓ | ✓ | ✓ |
| Leading apostrophe | 'Twas → ’Twas | ✓ | ✗ | ✗ | ~ | ✗ |
| Em dash | -- → — | ✓ | ✓ | ✗ | ✗ | ✓ |
| En dash (ranges) | 1-5 → 1–5 | ✓ | ✗ | ✓ | ✗ | ✗ |
| Minus sign | -5 → −5 | ✓ | ✗ | ✓ | ✗ | ✗ |
| Ellipsis | ... → … | ✓ | ✓ | ✓ | ✗ | ✓ |
| Multiplication | 5x5 → 5×5 | ✓ | ✗ | ✗ | ✗ | ~ |
| Math symbols | != → ≠ | ✓ | ✗ | ~ | ✗ | ~ |
| Legal symbols | (c) → © | ✓ | ✗ | ~ | ✗ | ✓ |
| Arrows | -> → → | ✓ | ✗ | ~ | ✗ | ~ |
| Prime marks | 5'10" → 5′10″ | ✓ | ✗ | ✓ | ✓ | ✗ |
| Degrees | 20 C → 20 °C | ✓ | ✗ | ✗ | ✗ | ✓ |
| Fractions | 1/2 → ½ | ✓ | ✗ | ✗ | ✗ | ✓ |
| Superscripts | 2nd → 2ⁿᵈ | ✓ | ✗ | ✗ | ✗ | ✗ |
| English localization | American/British | ✓ | ✗ | ✗ | ✗ | ✗ |
| Ligatures | ?? → ⁇ | ✓ | ✗ | ✓ | ✗ | ✗ |
| Non-English quotes | „Hallo” (German) | ✗ | ✗ | ✓ | ✗ | ~ |
| Non-breaking spaces | Chapter 1 | ✗ | ✗ | ✗ | ✗ | ✓ |

`typograf` uniquely inserts non-breaking spaces to prevent bad line breaks (e.g. before numbers, after colons). I might add this to `punctilio` in the future. `punctilio`’s other missing feature is non-English quote support—feel free to make a pull request!

### Known limitations of `punctilio`

| Pattern | Behavior | Notes |
|:--------|:---------|:------|
| `10' x 12'` | Second `'` not converted | Quote balancing prevents double prime conversion |
| `No. 3` | Doesn't replace normal space with a non-breaking one | Requires major new feature |
| German/French quotes | Not supported | `« Bonjour »` requires language detection |

## Test suite

Setting aside the benchmark, `punctilio`’s test suite includes 600+ tests at 100% branch coverage, including edge cases derived from competitor libraries ([`smartquotes`](https://github.com/kellym/smartquotes.js), [`retext-smartypants`](https://github.com/retextjs/retext-smartypants), [`typograf`](https://github.com/typograf/typograf)), and the [Standard Ebooks typography manual](https://standardebooks.org/manual/). Key test categories:

- _Quote handling_: Unicode text, nested quotes, contractions, Irish names (O’Brien), leading apostrophes (’99, ’twas)
- _Dash transformations_: Year/page/score ranges, model name preservation (Llama-2-7B, GPT-4), phone numbers, ISBNs
- _Symbol transforms_: Measurements (6′2″), coordinates (40° 44′ N), temperatures, fractions, math symbols
- _Idempotency_: All transformations are verified to be stable when applied multiple times
- _Separator boundaries_: Tests verify HTML DOM integration doesn’t break patterns

## Works with HTML DOMs via separation boundaries

Other typography libraries either transform plain strings or operate on AST nodes individually (`retext-smartypants` [can’t map changes back to HTML](https://github.com/rehypejs/rehype-retext)). But real HTML has text spanning multiple elements—if you concatenate text from `<em>Wait</em>...`, transform it, then try to split it back, youve lost track of where `</em>` belonged. 

`punctilio` introduces _separation boundaries_. First, insert a “separator” character (default: `U+E000`) at each element boundary before transforming (like at the start and end of an `<em>`). Every regex allows this character mid-pattern without breaking matches. For example, `.[SEP]..` still becomes `…[SEP]`. `punctilio` validates the output by ensuring the separator count remains the same. 

```typescript
import { transform, DEFAULT_SEPARATOR } from 'punctilio'

transform(`"Wait${DEFAULT_SEPARATOR}"`)
// → `“Wait”${DEFAULT_SEPARATOR}`
// The separator doesn’t block the information that this should be an end-quote!
```

For rehype/unified pipelines, use the built-in plugin (handles the separator logic automatically):

```typescript
import rehypePunctilio from 'punctilio/rehype'

unified()
  .use(rehypeParse)
  .use(rehypePunctilio, { dashStyle: 'american' })
  .use(rehypeStringify)
  .process('<p>"Hello..." -- world</p>')
// → <p>"Hello…"—world</p>
```

For manual DOM walking or custom transforms, use `transformElement` from `punctilio/rehype`. Note: `punctilio` transforms plain text or HTML—not raw Markdown. 

## Options

`punctilio` doesn’t enable all transformations by default. Fractions and degrees tend to match too aggressively (perfectly applying the degree transformation requires semantic meaning). Superscript letters and punctuation ligatures have spotty font support—on GitHub, this README’s font doesn’t even support the example superscript! Furthermore, `ligatures = true` can change the meaning of text by collapsing question and exclamation marks.

```typescript
transform(text, {
  punctuationStyle: 'american' | 'british' | 'none',  // default: 'american'
  dashStyle: 'american' | 'british' | 'none',         // default: 'american'

  symbols: true,           // math, legal, arrows, primes
  collapseSpaces: true,    // normalize whitespace
  fractions: false,        // 1/2 → ½
  degrees: false,          // 20 C → 20 °C
  superscript: false,      // 1st → 1ˢᵗ
  ligatures: false,        // ??? → ⁇, ?! → ⁈, !? → ⁉, !!! → !
  checkIdempotency: true,  // verify transform(transform(x)) === transform(x)
})
```

- Prime marks (`5'10"` → `5′10″`) require semantic understanding to distinguish from closing quotes (e.g. `"Term 1"` should produce closing quotes). `punctilio` counts quotes to heuristically guess whether the matched number at the end of a quote (if not, it requires a prime mark). Other libraries like `tipograph` 0.7.4 use simpler patterns that make more mistakes. That said, `punctilio` is still not perfect and will sometimes wrongly convert to ending quotation marks: `transform('I said "5" sounds right"')` will wrongly produce a closed double quote after the 5” instead of a double prime (correct).
- The `american` style follows the [Chicago Manual of Style](https://www.chicagomanualofstyle.org/):
  - Periods and commas go inside quotation marks (“Hello,” she said.)
  - Unspaced em-dashes between words (word—word)
- The `british` style follows [Oxford style](https://www.ox.ac.uk/sites/files/oxford/Style%20Guide%20quick%20reference%20A-Z.pdf):
  - Periods and commas go outside quotation marks (“Hello”, she said.)
  - Spaced en-dashes between words (word – word)
- `punctilio` is idempotent by design: `transform(transform(text))` always equals `transform(text)`. If performance is critical, set `checkIdempotency: false` to skip the verification pass.
