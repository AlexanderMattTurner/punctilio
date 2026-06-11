/**
 * Property-based fuzz suite (fast-check).
 *
 * Each test draws a fresh random seed, so CI genuinely explores new inputs on
 * every run. On failure fast-check prints the seed, path, and the shrunken
 * counterexample; reproduce locally with
 * `FUZZ_SEED=<seed> FUZZ_PATH=<path> pnpm test fuzz`.
 * `FUZZ_RUNS=<n>` overrides every property's run count (e.g. a large soak).
 */

import fc from "fast-check"

import {
  buildProseView,
  DASH_STYLES,
  definePass,
  PUNCTUATION_STYLES,
  transform,
  type TransformOptions,
  transformView,
} from "../index.js"
import { transformHtml } from "../html.js"
import { transformMarkdown } from "../markdown.js"
import { type ProseNode } from "../prose-view.js"

const ENV_SEED = process.env.FUZZ_SEED ? Number(process.env.FUZZ_SEED) : undefined

function fcParams(numRuns: number): fc.Parameters<unknown> {
  const runs = Number(process.env.FUZZ_RUNS ?? "") || numRuns
  if (ENV_SEED === undefined) {
    return { numRuns: runs }
  }
  return { numRuns: runs, seed: ENV_SEED, path: process.env.FUZZ_PATH, endOnFailure: true }
}

/** Characters weighted toward every transform trigger: quotes, dashes,
 * ellipses, primes, arrows, fractions, ordinals, units, and whitespace. */
const TYPOGRAPHY_CHAR = fc.constantFrom(
  ..."\"'`-–—.…!?xX*/\\<>()[]{}0123456789aAbBzZ   ,;:\n\t$%&#@^~_|+=",
)

/** Arbitrary text: plain ASCII, raw UTF-16 (including lone surrogates), and
 * typography-dense strings. */
const ARB_TEXT = fc.oneof(
  fc.string(),
  fc.string({ unit: "binary" }),
  fc.string({ maxLength: 60, unit: TYPOGRAPHY_CHAR }),
)

const ARB_OPTIONS: fc.Arbitrary<TransformOptions> = fc.record(
  {
    collapseSpaces: fc.boolean(),
    dashStyle: fc.constantFrom(...DASH_STYLES),
    degrees: fc.boolean(),
    fractions: fc.boolean(),
    includeArrows: fc.boolean(),
    ligatures: fc.boolean(),
    nbsp: fc.boolean(),
    punctuationStyle: fc.constantFrom(...PUNCTUATION_STYLES),
    superscript: fc.boolean(),
    symbols: fc.boolean(),
  },
  { requiredKeys: [] },
)

/** Splits `text` into 1..n chunks at offsets derived from `cuts`. */
function chunkText(text: string, cuts: number[]): string[] {
  const offsets = [...new Set(cuts.map((c) => c % (text.length + 1)))].sort((a, b) => a - b)
  const chunks: string[] = []
  let prev = 0
  for (const offset of offsets) {
    chunks.push(text.slice(prev, offset))
    prev = offset
  }
  chunks.push(text.slice(prev))
  return chunks
}

describe("fuzz: transform", () => {
  it("is idempotent for arbitrary text and options", () => {
    fc.assert(
      fc.property(ARB_TEXT, ARB_OPTIONS, (text, options) => {
        const once = transform(text, options)
        expect(transform(once, options)).toBe(once)
      }),
      fcParams(3000),
    )
  }, 300_000)

  it("with all opt-in passes enabled is idempotent", () => {
    const allOn: TransformOptions = { degrees: true, fractions: true, ligatures: true, superscript: true }
    fc.assert(
      fc.property(
        fc.string({ maxLength: 80, unit: TYPOGRAPHY_CHAR }),
        fc.constantFrom(...PUNCTUATION_STYLES),
        (text, punctuationStyle) => {
          const options = { ...allOn, punctuationStyle }
          const once = transform(text, options)
          expect(transform(once, options)).toBe(once)
        },
      ),
      fcParams(3000),
    )
  }, 300_000)
})

describe("fuzz: transformView over multi-node views", () => {
  it("is a fixed point and keeps view text equal to the joined node values", () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 60, unit: TYPOGRAPHY_CHAR }),
        fc.array(fc.nat(), { maxLength: 3 }),
        ARB_OPTIONS,
        (text, cuts, options) => {
          const nodes: ProseNode[] = chunkText(text, cuts).map((value) => ({ value }))
          const view = buildProseView(nodes)
          transformView(view, options)
          const once = nodes.map((node) => node.value)
          expect(view.text).toBe(once.join(""))

          transformView(buildProseView(nodes), options)
          expect(nodes.map((node) => node.value)).toEqual(once)
        },
      ),
      fcParams(2000),
    )
  }, 300_000)

  it("over a single node matches the plain-string transform", () => {
    fc.assert(
      fc.property(ARB_TEXT, ARB_OPTIONS, (text, options) => {
        const node: ProseNode = { value: text }
        const view = buildProseView([node])
        transformView(view, options)
        expect(node.value).toBe(transform(text, options))
      }),
      fcParams(1500),
    )
  }, 300_000)
})

describe("fuzz: ProseView commit semantics", () => {
  // Non-overlapping [start, end) ranges paired from sorted unique offsets.
  function rangesFrom(text: string, rawOffsets: number[]): [number, number][] {
    const offsets = [...new Set(rawOffsets.map((o) => o % (text.length + 1)))].sort((a, b) => a - b)
    const ranges: [number, number][] = []
    for (let i = 0; i + 1 < offsets.length; i += 2) {
      ranges.push([offsets[i], offsets[i + 1]])
    }
    return ranges
  }

  it("distributes arbitrary non-overlapping edits like flat-string splicing", () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 60 }),
        fc.array(fc.nat(), { maxLength: 8 }),
        fc.array(fc.nat(), { maxLength: 3 }),
        fc.array(fc.string({ maxLength: 5 }), { maxLength: 8 }),
        (text, rawOffsets, cuts, replacements) => {
          const ranges = rangesFrom(text, rawOffsets)
          const replacementAt = (i: number): string =>
            replacements.length > 0 ? replacements[i % replacements.length] : ""

          let expected = text
          for (let i = ranges.length - 1; i >= 0; i--) {
            const [start, end] = ranges[i]
            expected = expected.slice(0, start) + replacementAt(i) + expected.slice(end)
          }

          const nodes: ProseNode[] = chunkText(text, cuts).map((value) => ({ value }))
          const view = buildProseView(nodes)
          ranges.forEach(([start, end], i) => view.replace(start, end, replacementAt(i)))
          view.commit()

          expect(nodes.map((node) => node.value).join("")).toBe(expected)
          expect(view.text).toBe(expected)

          const boundaries = [...view.boundaries]
          expect(boundaries).toHaveLength(nodes.length - 1)
          for (const boundary of boundaries) {
            expect(view.hasBoundary(boundary)).toBe(true)
          }
          for (let offset = 0; offset <= view.text.length; offset++) {
            expect(view.hasBoundary(offset)).toBe(boundaries.includes(offset))
          }
        },
      ),
      fcParams(3000),
    )
  }, 300_000)
})

describe("fuzz: definePass replacement templates", () => {
  const PATTERNS = [
    { groups: { indexed: 2, named: ["lo", "hi"] }, source: "(?<lo>\\d)-(?<hi>\\d)" },
    { groups: { indexed: 1, named: ["word"] }, source: "(?<word>[a-z]+)" },
  ] as const

  const ARB_INPUT = fc.string({ maxLength: 40, unit: fc.constantFrom(..."ab z01-9 -") })

  function arbTemplate(pattern: (typeof PATTERNS)[number]): fc.Arbitrary<string> {
    const tokens = [
      "x",
      "-",
      " ",
      "$$",
      "$&",
      ...Array.from({ length: pattern.groups.indexed }, (_, i) => `$${i + 1}`),
      ...pattern.groups.named.map((name) => `$<${name}>`),
    ]
    return fc.array(fc.constantFrom(...tokens), { maxLength: 6 }).map((parts) => parts.join(""))
  }

  it.each(PATTERNS.map((pattern) => [pattern.source, pattern] as const))(
    "matches String.replace for /%s/g on single-node input",
    (_source, pattern) => {
      fc.assert(
        fc.property(ARB_INPUT, arbTemplate(pattern), (input, template) => {
          const pass = definePass(new RegExp(pattern.source, "g"), template)
          expect(pass(input)).toBe(input.replace(new RegExp(pattern.source, "g"), template))
        }),
        fcParams(2000),
      )
    },
    300_000,
  )

  it("with boundaries: \"allow\" matches String.replace across node splits", () => {
    const pattern = PATTERNS[0]
    fc.assert(
      fc.property(ARB_INPUT, arbTemplate(pattern), fc.array(fc.nat(), { maxLength: 3 }), (input, template, cuts) => {
        const expected = input.replace(new RegExp(pattern.source, "g"), template)
        const pass = definePass(new RegExp(pattern.source, "g"), template, { boundaries: "allow" })
        const nodes: ProseNode[] = chunkText(input, cuts).map((value) => ({ value }))
        const view = buildProseView(nodes)
        pass(view)
        expect(nodes.map((node) => node.value).join("")).toBe(expected)
      }),
      fcParams(2000),
    )
  }, 300_000)
})

describe("fuzz: transformHtml", () => {
  // `<` and `&` are left to the HTML parser's own normalization; the
  // typography passes are the subject here.
  const ARB_HTML_TEXT = fc.string({
    maxLength: 40,
    unit: fc.constantFrom(..."\"'-–—.!?x/()0123456789abz ,;:"),
  })

  it("is idempotent and leaves code blocks untouched", async () => {
    await fc.assert(
      fc.asyncProperty(
        ARB_HTML_TEXT,
        ARB_HTML_TEXT,
        ARB_HTML_TEXT,
        fc.constantFrom(...PUNCTUATION_STYLES),
        async (a, b, code, punctuationStyle) => {
          const html = `<p>${a}<em>${b}</em></p><pre><code>${code}</code></pre>`
          const once = await transformHtml(html, { punctuationStyle })
          expect(await transformHtml(once, { punctuationStyle })).toBe(once)
          expect(once).toContain(`<pre><code>${code}</code></pre>`)
        },
      ),
      fcParams(300),
    )
  }, 300_000)
})

describe("fuzz: transformMarkdown", () => {
  const ARB_MARKDOWN_TEXT = fc.string({
    maxLength: 50,
    unit: fc.constantFrom(..."\"'-.!?x/()0123456789abz ,;:\n*_`[]#>"),
  })

  it("is idempotent", async () => {
    await fc.assert(
      fc.asyncProperty(ARB_MARKDOWN_TEXT, async (text) => {
        const once = await transformMarkdown(text)
        expect(await transformMarkdown(once)).toBe(once)
      }),
      fcParams(300),
    )
  }, 300_000)

  it("leaves inline code spans untouched", async () => {
    // Edge whitespace and empty spans change the Markdown code-span syntax
    // itself; the property targets the typography passes, not the parser.
    const ARB_CODE = fc
      .string({ maxLength: 20, minLength: 1, unit: fc.constantFrom(..."\"'-.!?x 0123456789abz") })
      .filter((code) => code === code.trim() && code.length > 0)
    await fc.assert(
      fc.asyncProperty(ARB_CODE, async (code) => {
        const once = await transformMarkdown(`before \`${code}\` after`)
        expect(once).toContain(`\`${code}\``)
      }),
      fcParams(300),
    )
  }, 300_000)
})
