> _punctilio_ (n.): precise observance of formalities.

[![Test](https://github.com/alexander-turner/punctilio/actions/workflows/test.yml/badge.svg)](https://github.com/alexander-turner/punctilio/actions/workflows/test.yml)
[![Lint](https://github.com/alexander-turner/punctilio/actions/workflows/lint.yml/badge.svg)](https://github.com/alexander-turner/punctilio/actions/workflows/lint.yml)
[![Coverage](https://img.shields.io/endpoint?url=https%3A%2F%2Fraw.githubusercontent.com%2Falexander-turner%2Fpunctilio%2Fbadges%2Fcoverage.json)](https://github.com/alexander-turner/punctilio/actions/workflows/coverage-badge.yml)

Pretty good at making your text pretty. The most feature-complete and reliable English typography package. `punctilio` transforms plain ASCII into typographically correct Unicode, even across HTML element boundaries. Try it live at [`turntrout.com/punctilio`](https://turntrout.com/punctilio).

**Smart quotes** · **Em/en dashes** · **Ellipses** · **Math symbols** · **Legal symbols** · **Arrows** · **Primes** · **Fractions** · **Superscripts** · **Ligatures** · **Non-breaking spaces** · **HTML-aware** · **Markdown support** · **Bri’ish, German, and French localisation support**

```typescript
import { transform } from "punctilio";

transform(`"It's a beautiful thing, the destruction of words..." -- 1984`);
// → “It’s a beautiful thing, the destruction of words…”—1984
```

`punctilio` accepts three input formats: text, Markdown, and HTML. Use it as a library, a [CLI](#cli), a [pre-commit hook](#pre-commit), or—for a zero-friction install in any project that already runs Prettier—a [Prettier plugin](#prettier-plugin).

```bash
npm install punctilio
```

## Why punctilio?

As far as I can tell, `punctilio` is the most reliable and feature-complete. I built `punctilio` for [my website](https://turntrout.com/design). I wrote[^wrote] and sharpened the core regexes sporadically over several months, exhaustively testing edge cases. Eventually, I decided to spin off the functionality into its own package.

[^wrote]: While Claude is the number one contributor to this repository, that’s because Claude helped me port my existing code and added some features. The core regular expressions (e.g. dashes, quotes, multiplication signs) are human-written and were quite delicate. Those numerous commits don’t show in this repo’s history.

I tested `punctilio` against [`smartypants`](https://www.npmjs.com/package/smartypants) 0.2.2, [`tipograph`](https://www.npmjs.com/package/tipograph) 0.7.4, [`smartquotes`](https://www.npmjs.com/package/smartquotes) 2.3.2, [`typograf`](https://www.npmjs.com/package/typograf) 7.7.0, and [`retext-smartypants`](https://www.npmjs.com/package/retext-smartypants) 6.2.0.[^python] These other packages have spotty feature coverage and inconsistent impact on text. For example, `smartypants` mishandles quotes after em dashes (though quite hard to see in GitHub’s font) and lacks multiplication sign support.

[^python]: The Python libraries I found were closely related to the JavaScript packages. I tested them and found similar scores, so I don’t include separate Python results.

|                 Input                  |               `smartypants`                | `punctilio` |
| :------------------------------------: | :----------------------------------------: | :---------: |
| <span class="no-formatting">5x5</span> | <span class="no-formatting">5x5</span> (✗) |   5×5 (✓)   |

My [`benchmark.mjs`](https://github.com/alexander-turner/punctilio/blob/main/benchmark.mjs) measures how well libraries handle a [wide range of scenarios](https://github.com/alexander-turner/punctilio/blob/main/benchmark_cases.json). The benchmark normalizes stylistic differences (e.g. non-breaking vs regular space, British vs American dash spacing) for fair comparison. 

|              Package | Passed (of 151) |
| -------------------: | :-------------- |
|          `punctilio` | 150 (99%)       |
|          `tipograph` | 89 (59%)        |
|        `smartquotes` | 77 (51%)        |
|        `smartypants` | 72 (48%)        |
| `retext-smartypants` | 69 (46%)        |
|           `typograf` | 64 (42%)        |

_Note on benchmark construction: I assembled the initial cases myself. I then sought out cases where `punctilio` failed and competitors succeeded, and improved `punctilio` to succeed there as well. The benchmark may nonetheless remain biased towards `punctilio`._

|              Feature |                        Example                        | `punctilio` | `smartypants` | `tipograph` | `smartquotes` | `typograf` |
| -------------------: | :---------------------------------------------------: | :---------: | :-----------: | :---------: | :-----------: | :--------: |
|         Smart quotes | <span class="no-formatting">"hello" → “hello”</span>  |      ✓      |       ✓       |      ✓      |       ✓       |     ✓      |
|   Leading apostrophe |   <span class="no-formatting">'Twas → ’Twas</span>    |      ✓      |       ✗       |      ✗      |       ◐       |     ✗      |
|              Em dash |       <span class="no-formatting">-- → —</span>       |      ✓      |       ✓       |      ✗      |       ✗       |     ✓      |
|     En dash (ranges) |     <span class="no-formatting">1-5 → 1–5</span>      |      ✓      |       ✗       |      ✓      |       ✗       |     ✗      |
|           Minus sign |      <span class="no-formatting">-5 → −5</span>       |      ✓      |       ✗       |      ✓      |       ✗       |     ✗      |
|             Ellipsis |      <span class="no-formatting">... → …</span>       |      ✓      |       ✓       |      ✓      |       ✗       |     ✓      |
|       Multiplication |     <span class="no-formatting">5x5 → 5×5</span>      |      ✓      |       ✗       |      ✗      |       ✗       |     ◐      |
|         Math symbols |       <span class="no-formatting">!= → ≠</span>       |      ✓      |       ✗       |      ◐      |       ✗       |     ◐      |
|        Legal symbols | <span class="no-formatting">(c) 2004 → © 2004</span> |      ✓      |       ✗       |      ◐      |       ✗       |     ✓      |
|               Arrows |       <span class="no-formatting">-> → →</span>       |      ✓      |       ✗       |      ◐      |       ✗       |     ◐      |
|          Prime marks |   <span class="no-formatting">5'10" → 5′10″</span>    |      ✓      |       ✗       |      ✓      |       ✓       |     ✗      |
|              Degrees |    <span class="no-formatting">20 C → 20 °C</span>    |      ✓      |       ✗       |      ✗      |       ✗       |     ✓      |
|            Fractions |      <span class="no-formatting">1/2 → ½</span>       |      ✓      |       ✗       |      ✗      |       ✗       |     ✓      |
|         Superscripts |     <span class="no-formatting">2nd → 2ⁿᵈ</span>      |      ✓      |       ✗       |      ✗      |       ✗       |     ✗      |
| English localization | <span class="no-formatting">American / British</span> |      ✓      |       ✗       |      ✗      |       ✗       |     ✗      |
|            Ligatures |       <span class="no-formatting">?? → ⁇</span>       |      ✓      |       ✗       |      ✓      |       ✗       |     ✗      |
|   Non-English quotes |      <span class="no-formatting">„Hallo“</span>       |      ✓      |       ✗       |      ✓      |       ✗       |     ◐      |
|  Non-breaking spaces |     <span class="no-formatting">Chapter 1</span>      |      ✓      |       ✗       |      ✗      |       ✗       |     ✓      |

### Known limitations of `punctilio`

| Input | Behavior | Why |
| :--- | :--- | :--- |
| `'99 but 5' clearance` | `5'` stays straight | A leading apostrophe and an opening quote are indistinguishable without semantics |


## Test suite

Setting aside the benchmark, `punctilio`’s test suite runs at 100% branch coverage with well over a thousand tests, including edge cases derived from competitor libraries ([`smartquotes`](https://github.com/kellym/smartquotes.js), [`retext-smartypants`](https://github.com/retextjs/retext-smartypants), [`typograf`](https://github.com/typograf/typograf)) and the [Standard Ebooks typography manual](https://standardebooks.org/manual/). The 100% figure isn’t hand-maintained: Jest’s `coverageThreshold` requires 100% branches, functions, lines, and statements, CI fails below that, and the coverage badge above is regenerated from the actual coverage report on every push to `main`. I also verify that all transformations are stable when applied multiple times. Uses [`recheck`](https://makenowjust-labs.github.io/recheck/) to statically verify the absence of inefficient RegEx patterns.

## Works with HTML DOMs via boundary-aware views

Perhaps the most innovative feature of the library is that it properly handles DOMs! Other typography libraries take one of two approaches, both with drawbacks. 

1.  String-based libraries (like [`smartypants`](https://www.npmjs.com/package/smartypants)) transform plain text but are unaware of HTML structure. If you flatten text from `"<em>"Wait</em>"` into `"Wait"`, transform the text so that it has smart quotes (`“Wait”`), and then try to convert back—you've lost track of where the `</em>` belongs. 
2.  AST-based libraries (like [`rehype-retext`](https://github.com/rehypejs/rehype-retext)) process each text node individually, preserving structure but losing cross-node information. A quote that opens inside `<em>"Wait</em>` and closes outside it `"` spans two text nodes. Processed independently, the library can't tell whether the final `"` is opening or closing, because it never sees both at once. 

`punctilio` gets the best of both worlds with a _ProseView_: a view over a sequence of text nodes that exposes their concatenated text plus the offsets where one node ends and the next begins.

1.  Every pass scans the full concatenated text, so cross-node context (the closing `"` above) is always visible.
2.  Passes consult the node boundaries explicitly — a rule can treat a boundary as transparent, as a word boundary, or as a blocker, matching what the markup means.
3.  Edits are queued by offset and committed back onto the source text nodes, so the HTML structure is never lost and never has to be re-derived.

For `rehype` / `unified` pipelines, use the built-in plugin which handles all of this automatically:

```typescript
import rehypePunctilio from "punctilio/rehype";

unified()
  .use(rehypeParse)
  .use(rehypePunctilio)
  .use(rehypeStringify)
  .process('<p><em>"Wait</em>..." -- she said</p>');
// → <p><em>“Wait</em>…”—she said</p>
//  The opening quote inside <em> and the closing quote outside it
//  are both resolved correctly across the element boundary.
```

* For Markdown ASTs via `remark`, use `remarkPunctilio` which builds the same boundary-aware views over inline text nodes, or use `transformMarkdown` for a simpler Markdown-to-Markdown pipeline.
* For manual DOM walking or custom transforms, use `collectProseBlocks` and `proseViewOf` from `punctilio/rehype` to build a `ProseView` over an element’s text nodes, then run any pass (or `transformView`) over it.

## Options

`punctilio` doesn’t enable all transformations by default. Fractions and degrees tend to match too aggressively (perfectly applying the degree transformation requires semantic meaning). Superscript letters and punctuation ligatures have spotty font support. Furthermore, `ligatures = true` can change the meaning of text by collapsing question and exclamation marks.

```typescript
transform(text, {
  punctuationStyle: "american" | "british" | "german" | "french" | "none", // default: 'american'
  dashStyle: "american" | "british" | "none", // default: 'american'

  symbols: true, // ellipsis, math, legal, arrows
  includeArrows: true, // arrow transforms (-> → →); only applies when symbols is true
  collapseSpaces: true, // normalize whitespace
  fractions: false, // 1/2 → ½
  degrees: false, // 20 C → 20 °C
  superscript: false, // 1st → 1ˢᵗ
  ligatures: false, // ??? → ⁇, ?! → ⁈, !? → ⁉, !!! → !
  nbsp: true, // non-breaking spaces (after honorifics, between numbers and units, etc.)
});
```

Markdown sinks (`remarkPunctilio`, `transformMarkdown`, the Prettier plugin, and the CLI for Markdown files) default `nbsp` to `false` instead, because invisible U+00A0 characters in Markdown source files break `grep` and Ctrl+F. Pass `nbsp: true` (or the `--nbsp` CLI flag) to opt in.

The `rehype` plugin accepts additional options. Elements matching any `skipTags` tag name or carrying any `skipClasses` class are left untransformed (values shown are the defaults for `skipTags`):

```typescript
rehypePunctilio({
  skipTags: ["code", "pre", "script", "style", "kbd", "var", "samp", "template", "math", "svg"],
  skipClasses: ["no-formatting"],
  transformAllElements: false, // see below
});
```

By default the plugin transforms text only inside a curated allowlist of prose-bearing elements (plus custom elements). Set `transformAllElements: true` to invert the model and transform text inside *every* element except those in `skipTags`/`skipClasses` and the form-value elements `<textarea>` and `<input>` (whose text is a literal control value, not prose). `<select>` is skipped as a container, but its `<option>` labels are still transformed. `skipTags` and `skipClasses` continue to take precedence in this mode.

For finer-grained control, `shouldSkipText` opts specific text nodes out of transformation without skipping their enclosing element. The predicate receives the text node and its ancestor chain (root first, nearest last); returning `true` leaves the node’s value untouched. `shouldSkipText` runs after element-level skipping—it is never called for text inside an already-skipped element.

```typescript
rehypePunctilio({
  // Skip anchor text that equals its href (URL-like link text).
  shouldSkipText: (textNode, ancestors) => {
    const parent = ancestors[ancestors.length - 1];
    if (parent?.tagName !== "a") return false;
    const href = parent.properties?.href;
    return typeof href === "string" && href === textNode.value;
  },
});
```

## Integrations

### Prettier plugin

Drop `punctilio` into any project that already uses [Prettier](https://prettier.io)—typography fixes ride along on every Prettier run, with no extra build step. The plugin extends Prettier’s Markdown parser, so Prettier keeps owning whitespace and Markdown layout while `punctilio` rewrites the prose inside.

```jsonc
// .prettierrc
{
  "plugins": ["punctilio/prettier-plugin"]
}
```

```jsonc
// .punctiliorc.json (optional — same keys as the library options)
{
  "punctuationStyle": "british",
  "dashStyle": "british",
  "nbsp": true
}
```

```bash
prettier --write 'docs/**/*.md'
# "Hello" -- world.    →    “Hello” – world.
```

Code spans, fenced code blocks, and inline HTML are left untouched. The plugin currently transforms Markdown (`*.md`, `*.mdx` via the markdown parser); for HTML files, use the [CLI](#cli) or the [`rehype` plugin](#works-with-html-doms-via-separation-boundaries) below.

### CLI

```bash
punctilio README.md                          # print formatted output to stdout
punctilio --write README.md 'docs/**/*.md'   # format in place; globs expand internally
punctilio --check README.md                  # exit 1 if it would change anything
echo '"Hi" -- there' | punctilio - --type md
```

Two caveats before pointing the CLI (or the [pre-commit hook](#pre-commit) below) at an existing repo. First, the Markdown path re-serializes the whole document through `remark-stringify`, so the first run may produce formatting diffs beyond typography—escaping, list markers, and link syntax get normalized. Like Prettier, the output then stays stable on subsequent runs. If you already use Prettier, the [Prettier plugin](#prettier-plugin) avoids this double-formatting entirely, since Prettier keeps owning the printing.

Second, non-breaking spaces (U+00A0) are invisible in source files: they render fine, but they aren’t regular spaces, so Ctrl+F and `grep` matches against the source can miss. Markdown files therefore default to `nbsp` off; pass `--nbsp` (or set `nbsp: true` in config) to opt in. HTML files keep the default of `nbsp` on; pass `--no-nbsp` to keep them ASCII-spaced.

### pre-commit

A `.pre-commit-hooks.yaml` ships in the package, so [pre-commit](https://pre-commit.com) users can wire `punctilio` in directly:

```yaml
# .pre-commit-config.yaml
repos:
  - repo: https://github.com/alexander-turner/punctilio
    rev: v3.10.0
    hooks:
      - id: punctilio          # rewrites *.md / *.html in place
      - id: punctilio-check    # or: fail without writing (CI-friendly)
```


## Notes 

- Fully general prime mark conversion (e.g. <span class="no-formatting">5'10" → 5′10″</span>) requires semantic understanding to distinguish from closing quotes (e.g. `"Term 1"` should produce closing quotes). `punctilio` heuristically tracks quote balance to distinguish a prime after a number from a closing quote (`"Term 1"`). Simpler libraries like `tipograph` 0.7.4 make more mistakes here.
- The `american` style follows the [Chicago Manual of Style](https://www.chicagomanualofstyle.org/):
  - Periods and commas go inside quotation marks (“Hello,” she said.)
  - Unspaced em-dashes between words (word—word)
- The `british` style follows [Oxford style](https://www.ox.ac.uk/sites/files/oxford/Style%20Guide%20quick%20reference%20A-Z.pdf):
  - Periods and commas go outside quotation marks (“Hello”, she said.)
  - Spaced en-dashes between words (word – word)
- The `german` style uses low-9 quotes: „double“ (U+201E/U+201C) and ‚single‘ (U+201A/U+2018).
  - Punctuation outside quotes
- The `french` style uses guillemets padded with a narrow no-break space (U+202F), per Unicode CLDR's `fr` locale and the Imprimerie nationale's *Lexique des règles typographiques*: « Bonjour ».
  - Single quotes remain as curly quotes
  - Punctuation outside quotes
- Setting either style to `none` skips the entire transform category: `punctuationStyle: 'none'` preserves straight quotes, apostrophes, and prime marks; `dashStyle: 'none'` preserves all hyphens, number ranges, date ranges, and minus signs.
- `punctilio` is idempotent by design: `transform(transform(text))` always equals `transform(text)`. The test suite verifies the fixed point on every case plus fuzzed mixed content.
- Use `classifyApostrophes(text)` to distinguish apostrophes from closing single quotes. It returns text with apostrophes as U+02BC (MODIFIER LETTER APOSTROPHE) and closing quotes as U+2019 (RIGHT SINGLE QUOTATION MARK). Per the [Unicode Standard](https://www.unicode.org/versions/Unicode16.0.0/core-spec/chapter-6/#G30602), `transform()` and `niceQuotes()` use U+2019 for both in their output.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for release history.
