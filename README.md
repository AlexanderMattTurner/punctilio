> *punctilio* (n.): precise observance of formalities.

[![Test](https://github.com/alexander-turner/punctilio/actions/workflows/test.yml/badge.svg)](https://github.com/alexander-turner/punctilio/actions/workflows/test.yml)
[![Lint](https://github.com/alexander-turner/punctilio/actions/workflows/lint.yml/badge.svg)](https://github.com/alexander-turner/punctilio/actions/workflows/lint.yml)
[![Coverage](https://img.shields.io/badge/coverage-100%25-brightgreen)](https://github.com/alexander-turner/punctilio)

Pretty good at making your text pretty. The most feature-complete and reliable English typography package. `punctilio` transforms plain ASCII into typographically correct Unicode, even across HTML element boundaries.

**Smart quotes** · **Em/en dashes** · **Ellipses** · **Math symbols** · **Legal symbols** · **Arrows** · **Primes** · **Fractions** · **Superscripts** · **Ligatures** · **Non-breaking spaces** · **HTML-aware** · **Bri’ish localisation support** 

```typescript
import { transform } from 'punctilio'

transform('"It\'s a beautiful thing, the destruction of words..." -- 1984')
// → “It’s a beautiful thing, the destruction of words…”—1984
```

```bash
npm install punctilio
```

## Why punctilio?

As far as I can tell, `punctilio` is the most reliable and feature-complete. I built `punctilio` for [my website](https://turntrout.com/design). I wrote[^wrote] and sharpened the core regexes sporadically over several months, exhaustively testing edge cases. Eventually, I decided to spin off the functionality into its own package.

[^wrote]: While Claude is the number one contributor to this repository, that’s because Claude helped me port my existing code and added some features. The core regular expressions (e.g. dashes, quotes, multiplication signs) are human-written and were quite delicate. Those numerous commits don’t show in this repo’s history. 

I tested `punctilio` 1.2.9 against [`smartypants`](https://www.npmjs.com/package/smartypants) 0.2.2, [`tipograph`](https://www.npmjs.com/package/tipograph) 0.7.4, [`smartquotes`](https://www.npmjs.com/package/smartquotes) 2.3.2, [`typograf`](https://www.npmjs.com/package/typograf) 7.6.0, and [`retext-smartypants`](https://www.npmjs.com/package/retext-smartypants) 6.2.0.[^python] These other packages have spotty feature coverage and inconsistent impact on text. For example, `smartypants` mishandles quotes after em dashes (though quite hard to see in GitHub’s font) and lacks multiplication sign support.

[^python]: The Python libraries I found were closely related to the JavaScript packages. I tested them and found similar scores, so I don’t include separate Python results.

| Input | `smartypants` | `punctilio` |
|:-----:|:-----------------:|:-------:|
| 5x5 |	5x5 (✗) |	5×5 (✓) |

My [`benchmark.mjs`](https://github.com/alexander-turner/punctilio/blob/main/benchmark.mjs) measures how well libraries handle a [wide range of scenarios](https://github.com/alexander-turner/punctilio/blob/main/benchmark_cases.json). The benchmark normalizes stylistic differences (e.g. non-breaking vs regular space, British vs American dash spacing) for fair comparison.

| Package | Passed (of 159) |
|--------:|:----------------|
| `punctilio` | 154 (97%) |
| `tipograph` | 92 (58%) |
| `typograf` | 74 (47%) |
| `smartquotes` | 72 (45%) |
| `smartypants` | 68 (43%) |
| `retext-smartypants` | 65 (41%) |

| Feature | Example | `punctilio` | `smartypants` | `tipograph` | `smartquotes` | `typograf` |
|--------:|:-------:|:-------:|:-------:|:-------:|:-------:|:-------:|
| Smart quotes | <span class="no-formatting">"hello" → “hello”</span> | ✓ | ✓ | ✓ | ✓ | ✓ |
| Leading apostrophe | <span class="no-formatting">'Twas → ’Twas</span> | ✓ | ✗ | ✗ | ◐ | ✗ |
| Em dash | <span class="no-formatting">-- → —</span> | ✓ | ✓ | ✗ | ✗ | ✓ |
| En dash (ranges) | <span class="no-formatting">1-5 → 1–5</span> | ✓ | ✗ | ✓ | ✗ | ✗ |
| Minus sign | <span class="no-formatting">-5 → −5</span> | ✓ | ✗ | ✓ | ✗ | ✗ |
| Ellipsis | <span class="no-formatting">... → …</span> | ✓ | ✓ | ✓ | ✗ | ✓ |
| Multiplication | <span class="no-formatting">5x5 → 5×5</span> | ✓ | ✗ | ✗ | ✗ | ◐ |
| Math symbols | <span class="no-formatting">!= → ≠</span> | ✓ | ✗ | ◐ | ✗ | ◐ |
| Legal symbols | <span class="no-formatting">(c) 2004 → © 2004</span> | ✓ | ✗ | ◐ | ✗ | ✓ |
| Arrows | <span class="no-formatting">-> → →</span> | ✓ | ✗ | ◐ | ✗ | ◐ |
| Prime marks | <span class="no-formatting">5'10" → 5′10″</span> | ✓ | ✗ | ✓ | ✓ | ✗ |
| Degrees | <span class="no-formatting">20 C → 20 °C</span> | ✓ | ✗ | ✗ | ✗ | ✓ |
| Fractions | <span class="no-formatting">1/2 → ½</span> | ✓ | ✗ | ✗ | ✗ | ✓ |
| Superscripts | <span class="no-formatting">2nd → 2ⁿᵈ</span> | ✓ | ✗ | ✗ | ✗ | ✗ |
| English localization | <span class="no-formatting">American / British</span> | ✓ | ✗ | ✗ | ✗ | ✗ |
| Ligatures | <span class="no-formatting">?? → ⁇</span> | ✓ | ✗ | ✓ | ✗ | ✗ |
| Non-English quotes | <span class="no-formatting">„Hallo”</span> | ✗ | ✗ | ✓ | ✗ | ◐ |
| Non-breaking spaces | <span class="no-formatting">Chapter 1</span> | ✓ | ✗ | ✗ | ✗ | ✓ |

### Known limitations of `punctilio`

| Pattern | Behavior | Notes |
|:--------|:---------|:------|
| `'99 but 5' clearance` | `5'` not converted to `5′` | Leading apostrophe is indistinguishable from an opening quote without semantic understanding |
| `«Bonjour»` | Not spaced to `« Bonjour »` | French localization not supported |

## Test suite

Setting aside the benchmark, `punctilio`’s test suite includes 1,100+ tests at 100% branch coverage, including edge cases derived from competitor libraries ([`smartquotes`](https://github.com/kellym/smartquotes.js), [`retext-smartypants`](https://github.com/retextjs/retext-smartypants), [`typograf`](https://github.com/typograf/typograf)) and the [Standard Ebooks typography manual](https://standardebooks.org/manual/). I also verify that all transformations are stable when applied multiple times.

## Works with HTML DOMs via separation boundaries

Other typography libraries either transform plain strings or operate on AST nodes individually (`retext-smartypants` [can’t map changes back to HTML](https://github.com/rehypejs/rehype-retext)). But real HTML has text spanning multiple elements—if you concatenate text from `<em>Wait</em>...`, transform it, then try to split it back, you’ve lost track of where `</em>` belonged. 

`punctilio` introduces _separation boundaries_. First, insert a “separator” character (default: `U+E000`) at each element boundary before transforming (like at the start and end of an `<em>`). Every regex allows this character mid-pattern without breaking matches. For example, “`.[SEP]..`” still becomes “`…[SEP]`”. `punctilio` validates the output by ensuring the separator count remains the same. 

```typescript
import { transform, DEFAULT_SEPARATOR } from 'punctilio'

transform(`"Wait${DEFAULT_SEPARATOR}"`)
// → `“Wait”${DEFAULT_SEPARATOR}`
// The separator doesn’t block the information that this should be an end-quote!
```

For `rehype` / `unified` pipelines, use the built-in plugin which handles the separator logic automatically:

```typescript
import rehypePunctilio from 'punctilio/rehype'

unified()
  .use(rehypeParse)
  .use(rehypePunctilio)
  .use(rehypeStringify)
  .process('<p><em>"Wait</em>..." -- she said</p>')
// → <p><em>"Wait</em>…"—she said</p>
//  The opening quote inside <em> and the closing quote outside it
//  are both resolved correctly across the element boundary.
```

For manual DOM walking or custom transforms, use `transformElement` from `punctilio/rehype`. 

## Options

`punctilio` doesn't enable all transformations by default. Fractions and degrees tend to match too aggressively (perfectly applying the degree transformation requires semantic meaning). Superscript letters and punctuation ligatures have spotty font support. Furthermore, `ligatures = true` can change the meaning of text by collapsing question and exclamation marks. 

```typescript
transform(text, {
  punctuationStyle: 'american' | 'british' | 'none',  // default: 'american'
  dashStyle: 'american' | 'british' | 'none',         // default: 'american'

  symbols: true,           // ellipsis, math, legal, arrows
  collapseSpaces: true,    // normalize whitespace
  fractions: false,        // 1/2 → ½
  degrees: false,          // 20 C → 20 °C
  superscript: false,      // 1st → 1ˢᵗ
  ligatures: false,        // ??? → ⁇, ?! → ⁈, !? → ⁉, !!! → !
  nbsp: true,              // non-breaking spaces (after honorifics, between numbers and units, etc.)
  checkIdempotency: true,  // verify transform(transform(x)) === transform(x)
})
```

- Fully general prime mark conversion (e.g. `5'10"` → `5′10″`) requires semantic understanding to distinguish from closing quotes (e.g. `"Term 1"` should produce closing quotes). `punctilio` counts quotes to heuristically guess whether the matched number at the end of a quote (if not, it requires a prime mark). Other libraries like `tipograph` 0.7.4 use simpler patterns that make more mistakes.
- The `american` style follows the [Chicago Manual of Style](https://www.chicagomanualofstyle.org/):
  - Periods and commas go inside quotation marks (“Hello,” she said.)
  - Unspaced em-dashes between words (word—word)
- The `british` style follows [Oxford style](https://www.ox.ac.uk/sites/files/oxford/Style%20Guide%20quick%20reference%20A-Z.pdf):
  - Periods and commas go outside quotation marks (“Hello”, she said.)
  - Spaced en-dashes between words (word – word)
- Setting either style to `none` skips the entire transform category: `punctuationStyle: 'none'` preserves straight quotes, apostrophes, and prime marks; `dashStyle: 'none'` preserves all hyphens, number ranges, date ranges, and minus signs.
- `punctilio` is idempotent by design: `transform(transform(text))` always equals `transform(text)`. If performance is critical, set `checkIdempotency: false` to skip the verification pass.
