import { DASH_STYLES, PUNCTUATION_STYLES, type TransformOptions, transformView, transform as transformWithoutChecks } from "../index.js"
import { resolveTransformOptions, TRANSFORM_OPTION_KEYS } from "../transform-options.js"
import { ellipsis } from "../symbols.js"
import { UNICODE_SYMBOLS } from "../constants.js"
import { buildMixedContent, SEP as DEFAULT_SEPARATOR, viewTransform } from "./test-helpers.js"

const {
  LEFT_DOUBLE_QUOTE,
  RIGHT_DOUBLE_QUOTE,
  LEFT_SINGLE_QUOTE,
  RIGHT_SINGLE_QUOTE,
  EM_DASH,
  EN_DASH,
  ELLIPSIS,
  MULTIPLICATION,
  NOT_EQUAL,
  PLUS_MINUS,
  LESS_EQUAL,
  GREATER_EQUAL,
  COPYRIGHT,
  NBSP,
  PRIME,
  DOUBLE_PRIME,
  TRADEMARK,
  REGISTERED,
  DEGREE,
  MINUS,
  FRACTION_1_2,
  SUPERSCRIPT_ST,
} = UNICODE_SYMBOLS

// Idempotency is a design guarantee (the fuzz suite is the systematic
// guard), so every transform call below re-runs on its own output and
// asserts a fixed point.
function transform(text: string, options: TransformOptions = {}): string {
  const first = transformWithoutChecks(text, options)
  expect(transformWithoutChecks(first, options)).toBe(first)
  return first
}

/** Runs the full pipeline over the multi-node view a marked string describes. */
function transformOverView(markedInput: string, options: TransformOptions = {}): string {
  return viewTransform((view) => transformView(view, options), markedInput, DEFAULT_SEPARATOR)
}

describe("transform", () => {
  it("applies both quote and dash transformations", () => {
    const input = '"Hello," she said - "it\'s pages 1-5."'
    const expected = `${LEFT_DOUBLE_QUOTE}Hello,${RIGHT_DOUBLE_QUOTE} she said${EM_DASH}${LEFT_DOUBLE_QUOTE}it${RIGHT_SINGLE_QUOTE}s pages 1${EN_DASH}5.${RIGHT_DOUBLE_QUOTE}`
    expect(transform(input, { nbsp: false })).toBe(expected)
  })

  it("handles complex mixed content", () => {
    const input = 'I was born in \'99 - "the best year" - and pages 10-20 are my favorite.'
    const expected = `I was born in ${RIGHT_SINGLE_QUOTE}99${EM_DASH}${LEFT_DOUBLE_QUOTE}the best year${RIGHT_DOUBLE_QUOTE}${EM_DASH}and pages 10${EN_DASH}20 are my favorite.`
    expect(transform(input, { nbsp: false })).toBe(expected)
  })

  it("transformView defaults its options", () => {
    expect(viewTransform((view) => transformView(view), '"Dr. Smith"'))
      .toBe(`${LEFT_DOUBLE_QUOTE}Dr.${NBSP}Smith${RIGHT_DOUBLE_QUOTE}`)
  })

  it("transforms across node boundaries", () => {
    const sep = DEFAULT_SEPARATOR
    const input = `"Hello${sep}" - test`
    expect(transformOverView(input, { nbsp: false })).toBe(`${LEFT_DOUBLE_QUOTE}Hello${sep}${RIGHT_DOUBLE_QUOTE}${EM_DASH}test`)
  })

  describe("symbol transforms", () => {
    it("applies symbol transforms by default", () => {
      expect(transform('Wait... 5x5 != 25 (c) 2024', { nbsp: false })).toBe(`Wait${ELLIPSIS} 5${MULTIPLICATION}5 ${NOT_EQUAL} 25 ${COPYRIGHT} 2024`)
    })

    it("can disable symbol transforms", () => {
      expect(transform('Wait... 5x5 != 25', { symbols: false, nbsp: false })).toBe('Wait... 5x5 != 25')
    })
  })

  describe("optional transforms", () => {
    it.each([
      ["fractions disabled", "1/2", { nbsp: false }, "1/2"],
      ["fractions enabled", "1/2", { fractions: true, nbsp: false }, UNICODE_SYMBOLS.FRACTION_1_2],
      ["degrees disabled", "20 C", { nbsp: false }, "20 C"],
      ["degrees enabled", "20 C", { degrees: true, nbsp: false }, `20 ${UNICODE_SYMBOLS.DEGREE}C`],
      ["superscript disabled", "1st", { nbsp: false }, "1st"],
      ["superscript enabled", "1st", { superscript: true, nbsp: false }, `1${UNICODE_SYMBOLS.SUPERSCRIPT_ST}`],
      ["ligatures disabled", "??", { nbsp: false }, "??"],
      ["ligatures enabled", "??", { ligatures: true, nbsp: false }, UNICODE_SYMBOLS.DOUBLE_QUESTION],
      ["nbsp enabled (default)", "Dr. Smith", {}, `Dr.${NBSP}Smith`],
      ["nbsp disabled", "Dr. Smith", { nbsp: false }, "Dr. Smith"],
    ] as const)("%s: %s → %s", (_desc, input, options, expected) => {
      expect(transform(input, options)).toBe(expected)
    })
  })

  describe("punctuationStyle option", () => {
    const periodOutside = `${LEFT_DOUBLE_QUOTE}Hello${RIGHT_DOUBLE_QUOTE}.`
    const periodInside = `${LEFT_DOUBLE_QUOTE}Hello.${RIGHT_DOUBLE_QUOTE}`

    it.each([
      ['"Hello".', undefined, periodInside, "american (default)"],
      ['"Hello."', "british", periodOutside, "british"],
      ['"Hello".', "none", '"Hello".', "none (skips all quote transforms)"],
    ] as const)("handles %s with %s style", (input, style, expected) => {
      expect(transform(input, { ...(style ? { punctuationStyle: style } : {}), nbsp: false })).toBe(expected)
    })

    it("none skips prime marks too", () => {
      expect(transform('5\'10"', { punctuationStyle: "none", nbsp: false })).toBe('5\'10"')
    })

    it("none skips all quote transforms while other transforms still apply", () => {
      expect(transform('"Wait..." she said', { punctuationStyle: "none", nbsp: false })).toBe(`"Wait${ELLIPSIS}" she said`)
    })
  })

  describe("german and french locale styles", () => {
    it.each([
      ['"Guten Tag"', `${UNICODE_SYMBOLS.DOUBLE_LOW_9_QUOTE}Guten Tag${LEFT_DOUBLE_QUOTE}`, { punctuationStyle: "german" as const, nbsp: false }],
      ['"Bonjour"', `${UNICODE_SYMBOLS.LEFT_GUILLEMET}${UNICODE_SYMBOLS.NNBSP}Bonjour${UNICODE_SYMBOLS.NNBSP}${UNICODE_SYMBOLS.RIGHT_GUILLEMET}`, { punctuationStyle: "french" as const, nbsp: false }],
      ["it's", `it${RIGHT_SINGLE_QUOTE}s`, { punctuationStyle: "german" as const, nbsp: false }],
      ["l'homme", `l${RIGHT_SINGLE_QUOTE}homme`, { punctuationStyle: "french" as const, nbsp: false }],
    ])('transforms "%s" with locale style', (input, expected, options) => {
      expect(transform(input, options)).toBe(expected)
    })

    it("german style is idempotent", () => {
      const input = '"Guten Tag"'
      const first = transform(input, { punctuationStyle: "german", nbsp: false })
      const second = transform(first, { punctuationStyle: "german", nbsp: false })
      expect(second).toBe(first)
    })

    it("french style is idempotent", () => {
      const input = '"Bonjour"'
      const first = transform(input, { punctuationStyle: "french", nbsp: false })
      const second = transform(first, { punctuationStyle: "french", nbsp: false })
      expect(second).toBe(first)
    })
  })

  describe("collapseSpaces option", () => {
    it.each([
      ["hello  world", "hello world", "multiple spaces"],
      [`foo${NBSP}${NBSP}bar`, `foo${NBSP}bar`, "multiple nbsp"],
      [`a ${NBSP}b`, `a${NBSP}b`, "mixed spaces prefer nbsp"],
      [`a${NBSP} b`, `a${NBSP}b`, "mixed spaces prefer nbsp"],
      ["hello\t\tworld", "hello world", "multiple tabs"],
      ["hello\t world", "hello world", "mixed tab and space"],
    ])("collapses %s by default", (input, expected) => {
      expect(transform(input, { nbsp: false })).toBe(expected)
    })

    it.each([
      ["hello  world", "hello  world", "multiple spaces"],
      [`foo${NBSP}${NBSP}bar`, `foo${NBSP}${NBSP}bar`, "multiple nbsp"],
      ["hello\t\tworld", "hello\t\tworld", "multiple tabs"],
    ])("preserves %s when disabled", (input, expected) => {
      expect(transform(input, { collapseSpaces: false, nbsp: false })).toBe(expected)
    })
  })

  describe("nbsp option", () => {
    it("inserts nbsp in typographically appropriate places", () => {
      expect(transform("Dr. Smith wrote Fig. 1 on p. 42", { nbsp: true }))
        .toBe(`Dr.${NBSP}Smith wrote Fig.${NBSP}1 on p.${NBSP}42`)
    })

    it("collapseSpaces cleans up after nbsp", () => {
      expect(transform("Prof. Wilson arrived", { nbsp: true }))
        .toBe(`Prof.${NBSP}Wilson arrived`)
    })

    it("is idempotent with nbsp enabled", () => {
      const input = "Dr. Smith has 5 kg of items in § 3"
      const first = transform(input, { nbsp: true })
      const second = transform(first, { nbsp: true })
      expect(second).toBe(first)
    })

    it("preserves node count with nbsp enabled", () => {
      const sep = DEFAULT_SEPARATOR
      const input = `Dr.${sep} Smith has${sep} 5 kg`
      expect(transformOverView(input, { nbsp: true }).split(sep)).toHaveLength(3)
    })
  })

  describe("node-count preservation", () => {
    it.each([
      [`Wait.${DEFAULT_SEPARATOR}.${DEFAULT_SEPARATOR}. for it`, 3],
      [`"Hello${DEFAULT_SEPARATOR}" - ${DEFAULT_SEPARATOR}she${DEFAULT_SEPARATOR} said`, 4],
      [`.${DEFAULT_SEPARATOR}.${DEFAULT_SEPARATOR}.`, 3],
    ])('preserves %i nodes in "%s"', (input, expectedCount) => {
      expect(transformOverView(input, { nbsp: false }).split(DEFAULT_SEPARATOR)).toHaveLength(expectedCount)
    })

    it("preserves node count in ellipsis", () => {
      const input = `.${DEFAULT_SEPARATOR}.${DEFAULT_SEPARATOR}.`
      const result = viewTransform(ellipsis, input)
      expect(result.split(DEFAULT_SEPARATOR)).toHaveLength(3)
    })

    it("preserves empty interior nodes", () => {
      const input = `a${DEFAULT_SEPARATOR}${DEFAULT_SEPARATOR}${DEFAULT_SEPARATOR}b`
      expect(transformOverView(input, { nbsp: false })).toBe(input)
    })
  })

  describe("Unicode edge cases", () => {
    it.each([
      '"café"',
      '"Hello 👋 world"',
      '"日本語"',
      '"שלום"',
      "a\u200Bb",
    ])('preserves content in "%s"', (input) => {
      expect(transform(input, { nbsp: false })).toBe(transform(input, { nbsp: false })) // idempotent
    })
  })

  // Tests derived from competitor libraries and benchmark cases
  describe("competitor-derived comprehensive tests", () => {
    // These tests document where punctilio excels over competitors
    describe("punctilio advantages (benchmark cases)", () => {
      it.each([
        // Leading apostrophes - smartypants/tipograph fail these
        ["'SUP", `${RIGHT_SINGLE_QUOTE}SUP`],
        ["Rock 'n' Roll", `Rock ${RIGHT_SINGLE_QUOTE}n${RIGHT_SINGLE_QUOTE} Roll`],
        ["I was born in '99", `I was born in ${RIGHT_SINGLE_QUOTE}99`],
        // Em dashes from surrounded hyphens - smartquotes fails
        ["This is a - hyphen.", `This is a${EM_DASH}hyphen.`],
        // Number ranges - smartypants/smartquotes/typograf fail
        ["Pages 1-5", `Pages 1${EN_DASH}5`],
        ["2000-2020", `2000${EN_DASH}2020`],
        // Date ranges - all competitors fail
        ["January-March", `January${EN_DASH}March`],
        // Minus signs - most competitors fail
        ["-5", `${MINUS}5`],
        ["(-5)", `(${MINUS}5)`],
        ["'-5'", `${LEFT_SINGLE_QUOTE}${MINUS}5${RIGHT_SINGLE_QUOTE}`],
        // Prime marks - smartypants/typograf fail
        ['5\'10"', `5${PRIME}10${DOUBLE_PRIME}`],
        ['He is 6\'2" tall', `He is 6${PRIME}2${DOUBLE_PRIME} tall`],
      ])('correctly transforms: "%s"', (input, expected) => {
        expect(transform(input, { symbols: true, degrees: true, nbsp: false })).toBe(expected)
      })
    })

    // Compound word preservation (all libraries should preserve these)
    describe("compound word preservation", () => {
      it.each([
        "well-known",
        "a browser- or OS-specific fashion",
        "re-read",
        "self-aware",
        "high-quality",
      ])('preserves compound word: "%s"', (input) => {
        expect(transform(input, { nbsp: false })).toBe(input)
      })
    })

    // Model name preservation (punctilio's unique strength)
    describe("model name preservation", () => {
      it.each([
        "Llama-2-7B",
        "Llama-3-8B-Instruct",
        "GPT-4",
        "Claude-3-Opus",
        "Qwen1.5-1.8B",
      ])('preserves model name: "%s"', (input) => {
        expect(transform(input, { nbsp: false })).toBe(input)
      })
    })
  })

  describe("complex real-world text", () => {
    it("handles dialogue with dashes and quotes", () => {
      const input = '"Wait," she said -- "I don\'t think that\'s right."'
      const expected = `${LEFT_DOUBLE_QUOTE}Wait,${RIGHT_DOUBLE_QUOTE} she said${EM_DASH}${LEFT_DOUBLE_QUOTE}I don${RIGHT_SINGLE_QUOTE}t think that${RIGHT_SINGLE_QUOTE}s right.${RIGHT_DOUBLE_QUOTE}`
      expect(transform(input, { nbsp: false })).toEqual(expected)
    })

    it("handles technical documentation", () => {
      const input = 'The API returns x != y when a <= b and c >= d. Error tolerance: +-5%.'
      const expected = `The API returns x ${NOT_EQUAL} y when a ${LESS_EQUAL} b and c ${GREATER_EQUAL} d. Error tolerance: ${PLUS_MINUS}5%.`
      expect(transform(input, { nbsp: false })).toBe(expected)
    })

    it("handles measurement text", () => {
      const input = 'He is 6\'2" tall.'
      const expected = `He is 6${PRIME}2${DOUBLE_PRIME} tall.`
      expect(transform(input, { symbols: true, nbsp: false })).toEqual(expected)
    })

    it("handles copyright notices", () => {
      const input = '(c) 2024 Company(tm). All rights reserved(r).'
      const expected = `${COPYRIGHT} 2024 Company${TRADEMARK}. All rights reserved${REGISTERED}.`
      expect(transform(input, { nbsp: false })).toEqual(expected)
    })
  })

  describe("known limitations", () => {
    // These document current behavior for edge cases
    it("documents prime mark vs closing quote ambiguity", () => {
      // When there's an open quote before a number, the quote after should close
      // not become a prime mark
      const input = '"Number 5"'
      const result = transform(input, { nbsp: false })
      // The 5" should be a closing quote, not a prime
      expect(result).toBe(`${LEFT_DOUBLE_QUOTE}Number 5${RIGHT_DOUBLE_QUOTE}`)
    })
  })

  describe("complex combined transformations", () => {
    it.each([
      [
        '"Wait..." she said - "it\'s pages 1-5."',
        `${LEFT_DOUBLE_QUOTE}Wait${ELLIPSIS}${RIGHT_DOUBLE_QUOTE} she said${EM_DASH}${LEFT_DOUBLE_QUOTE}it${RIGHT_SINGLE_QUOTE}s pages 1${EN_DASH}5.${RIGHT_DOUBLE_QUOTE}`,
      ],
      [
        "(c) 2024 - Room is 10x12, set to 72 F",
        `${COPYRIGHT} 2024${EM_DASH}Room is 10${MULTIPLICATION}12, set to 72 ${DEGREE}F`,
      ],
    ])('handles complex transform: "%s"', (input, expected) => {
      expect(transform(input, { degrees: true, nbsp: false })).toBe(expected)
    })
  })

  describe("empty and whitespace inputs", () => {
    it.each([
      ["", ""],
      [" ", " "],
      ["\n", "\n"],
      ["\t", "\t"],
      ["   ", "   "],
    ])('handles empty/whitespace: "%s"', (input, expected) => {
      expect(transform(input, { nbsp: false })).toBe(expected)
    })
  })

  describe("leading-of-line whitespace preservation", () => {
    it.each([
      ["  hello world", "  hello world"],
      ["    const x = 1;", "    const x = 1;"],
      ["a  b\n   c  d", "a b\n   c d"],
      ["line1\n\n  line2  word", "line1\n\n  line2 word"],
      ["\n  code   line", "\n  code line"],
    ])('preserves leading run on "%s"', (input, expected) => {
      expect(transform(input, { nbsp: false })).toBe(expected)
    })
  })

  describe("very long inputs", () => {
    it("handles long repeated patterns", () => {
      const input = '"Hello" '.repeat(100)
      const expected = `${LEFT_DOUBLE_QUOTE}Hello${RIGHT_DOUBLE_QUOTE} `.repeat(100)
      expect(transform(input, { nbsp: false })).toEqual(expected)
    })

    it("handles long continuous text", () => {
      const input = "word ".repeat(1000)
      const result = transform(input, { nbsp: false })
      expect(result).toBe(input.trim() + " ")
    })

    it("converts ALL quote pairs in repeated pattern", () => {
      const count = 50
      const input = '"Hello" '.repeat(count)
      const result = transform(input, { nbsp: false })
      const leftCount = (result.match(new RegExp(LEFT_DOUBLE_QUOTE, "g")) || []).length
      const rightCount = (result.match(new RegExp(RIGHT_DOUBLE_QUOTE, "g")) || []).length
      expect(leftCount).toBe(count)
      expect(rightCount).toBe(count)
    })

    it("converts ALL dashes in repeated pattern", () => {
      const count = 50
      const input = "pages 1-5 ".repeat(count)
      const result = transform(input, { nbsp: false })
      const enDashCount = (result.match(new RegExp(EN_DASH, "g")) || []).length
      expect(enDashCount).toBe(count)
    })

    it("converts ALL ellipses in repeated pattern", () => {
      const count = 50
      const input = "Wait... ".repeat(count)
      const result = transform(input, { nbsp: false })
      const ellipsisCount = (result.match(new RegExp(ELLIPSIS, "g")) || []).length
      expect(ellipsisCount).toBe(count)
    })
  })

  describe("Unicode control characters", () => {
    it.each([
      ['"test\u200Bword"', `${LEFT_DOUBLE_QUOTE}test\u200Bword${RIGHT_DOUBLE_QUOTE}`],
      ['"test\u200Fword"', `${LEFT_DOUBLE_QUOTE}test\u200Fword${RIGHT_DOUBLE_QUOTE}`],
      ['"caf\u0065\u0301"', `${LEFT_DOUBLE_QUOTE}caf\u0065\u0301${RIGHT_DOUBLE_QUOTE}`],
    ])('handles Unicode edge case', (input, expected) => {
      expect(transform(input, { nbsp: false })).toBe(expected)
    })
  })

  describe("option combinations", () => {
    it("applies all optional transforms together", () => {
      const input = "1st place: 1/2 at 72 F - wow!!"
      const expected = `1${SUPERSCRIPT_ST} place: ${FRACTION_1_2} at 72 ${DEGREE}F${EM_DASH}wow!`
      expect(transform(input, {
        fractions: true,
        degrees: true,
        superscript: true,
        ligatures: true,
        nbsp: false,
      })).toEqual(expected)
    })

    it("respects disabled transforms", () => {
      const input = "1/2 at 72 F"
      const expected = `${FRACTION_1_2} at 72 F`
      expect(transform(input, {
        fractions: true,
        degrees: false,
        nbsp: false,
      })).toEqual(expected)
    })
  })

  describe("boundary robustness", () => {
    const sep = DEFAULT_SEPARATOR

    it.each([
      [`${sep}"test"${sep}`, `${sep}${LEFT_DOUBLE_QUOTE}test${RIGHT_DOUBLE_QUOTE}${sep}`],
      [`"test${sep}word"`, `${LEFT_DOUBLE_QUOTE}test${sep}word${RIGHT_DOUBLE_QUOTE}`],
      [`${sep}${sep}"test"${sep}${sep}`, `${sep}${sep}${LEFT_DOUBLE_QUOTE}test${RIGHT_DOUBLE_QUOTE}${sep}${sep}`],
    ])('handles boundaries in quotes', (input, expected) => {
      expect(transformOverView(input, { nbsp: false })).toBe(expected)
    })

    it.each([
      [`word${sep} - ${sep}word`, `word${sep}${EM_DASH}${sep}word`],
      [`1${sep}-${sep}5`, `1${sep}${EN_DASH}${sep}5`],
    ])('handles boundaries in dashes', (input, expected) => {
      expect(transformOverView(input, { nbsp: false })).toBe(expected)
    })

    it("preserves the exact node count through the pipeline", () => {
      const input = `${sep}text${sep}more${sep}text${sep}`
      const result = transformOverView(input, { nbsp: false })
      expect(result.split(sep)).toHaveLength(input.split(sep).length)
    })

    it("handles boundaries in fractions", () => {
      const input = `1${sep}/2`
      expect(transformOverView(input, { fractions: true, nbsp: false })).toBe(`${sep}${FRACTION_1_2}`)
    })

    it("handles boundaries in degrees", () => {
      const input = `72${sep} F`
      expect(transformOverView(input, { degrees: true, nbsp: false })).toBe(`72${sep} ${DEGREE}F`)
    })
  })

  describe("additional idempotency", () => {
    it.each([
      '"Hello" - she said, "it\'s pages 1-5..."',
      'Product(tm) 5x5 at 72 F (c) 2024',
      "Add 1/2 cup - that's about 3/4 done",
      '1st place winner said "congrats!!"',
      // The symbol pass rewrites x→× and +/-→±; a range start preceded by the
      // resulting symbol must not en-dash on a second pass (regression: these
      // threw "Transform is not idempotent").
      "the 5x10-20 pack",
      "buy 3x5-10 cards",
      "give or take +/-1-5 units",
      // A tab in the whitespace around a dash must not defer conversion to a
      // later pass. (regression: these threw "Transform is not idempotent"
      // when collapseSpaces only ran after the dash pass.)
      "word \t- word",
      "word \t-- word",
      "a \t- b \t- c",
      "1-55x5",
      "wait...1-5 minutes",
      // fractions strip the "/" that legalSymbols' path heuristic keys on
      "1/2(tm) and 3/4(r)",
    ])('is idempotent: "%s"', (input) => {
      const first = transform(input, { fractions: true, degrees: true, superscript: true, ligatures: true })
      const second = transform(first, { fractions: true, degrees: true, superscript: true, ligatures: true })
      expect(second).toBe(first)
    })

    it("converts a dash padded by tab-and-space whitespace on the first pass", () => {
      // The mixed space+tab run collapses to one space, then the dash converts —
      // the same result a fully space-padded dash would already produce.
      expect(transform("word \t- word")).toBe(`word${EM_DASH}word`)
      expect(transform("word \t- word", { dashStyle: "british" })).toBe(`word ${EN_DASH} word`)
    })

    // The superscript pass turns trailing ordinal letters (st/nd/rd/th) into
    // non-word superscripts, which can flip a range's trailing word boundary.
    it.each([
      "5--1st",
      "items 1-52nd",
    ])('range abutting a superscript ordinal is idempotent: "%s"', (input) => {
      const first = transform(input, { superscript: true })
      expect(transform(first, { superscript: true })).toBe(first)
    })

    it.each([
      // Nested quotes with period — tests the multi-quote-jump fix
      [`"She said, 'Hello.'"`, "british" as const],
      [`"She said, 'Hello.'"`, "german" as const],
      [`"She said, 'Hello.'"`, "french" as const],
      // Leading apostrophe — tests the German RSQ normalization fix
      [`'Twas the night before Christmas.`, "german" as const],
    ])('is idempotent across styles: "%s" [%s]', (input, style) => {
      const first = transform(input, { punctuationStyle: style })
      const second = transform(first, { punctuationStyle: style })
      expect(second).toBe(first)
    })

    // The superscript pass turns trailing ordinal letters (st/nd/rd/th) into
    // non-word superscripts, which can flip a range's trailing word boundary.
    it.each([
      "5--1st",
      "items 1-52nd",
    ])('range abutting a superscript ordinal is idempotent: "%s"', (input) => {
      const first = transform(input, { superscript: true })
      expect(transform(first, { superscript: true })).toBe(first)
    })

    it.each([
      `${LEFT_DOUBLE_QUOTE}Hello${RIGHT_DOUBLE_QUOTE}`,
      `word${EM_DASH}word`,
      `1${EN_DASH}5`,
      `Wait${ELLIPSIS}`,
      `5${MULTIPLICATION}5`,
      `20${NBSP}${DEGREE}C`,
      `${COPYRIGHT}${NBSP}2024`,
    ])('stable for: "%s"', (input) => {
      expect(transform(input)).toBe(input)
    })
  })

  describe("style combinations", () => {
    it("applies American conventions throughout", () => {
      const input = '"Hello." - word - "World."'
      const expected = `${LEFT_DOUBLE_QUOTE}Hello.${RIGHT_DOUBLE_QUOTE}${EM_DASH}word${EM_DASH}${LEFT_DOUBLE_QUOTE}World.${RIGHT_DOUBLE_QUOTE}`
      expect(transform(input, { punctuationStyle: "american", dashStyle: "american", nbsp: false })).toEqual(expected)
    })

    it("applies British conventions throughout", () => {
      const input = '"Hello." - word - "World."'
      const expected = `${LEFT_DOUBLE_QUOTE}Hello${RIGHT_DOUBLE_QUOTE}. ${EN_DASH} word ${EN_DASH} ${LEFT_DOUBLE_QUOTE}World${RIGHT_DOUBLE_QUOTE}.`
      expect(transform(input, { punctuationStyle: "british", dashStyle: "british", nbsp: false })).toEqual(expected)
    })

    it("applies American punctuation with British dashes", () => {
      const input = '"Hello." - word'
      const expected = `${LEFT_DOUBLE_QUOTE}Hello.${RIGHT_DOUBLE_QUOTE} ${EN_DASH} word`
      expect(transform(input, { punctuationStyle: "american", dashStyle: "british", nbsp: false })).toEqual(expected)
    })

    it("skips all dash transforms with dashStyle none", () => {
      const input = '"Hello" - pages 1-5, -3'
      const expected = `${LEFT_DOUBLE_QUOTE}Hello${RIGHT_DOUBLE_QUOTE} - pages 1-5, -3`
      expect(transform(input, { dashStyle: "none", nbsp: false })).toEqual(expected)
    })

    it("skips everything with both set to none", () => {
      const input = '"Hello" - pages 1-5'
      expect(transform(input, { punctuationStyle: "none", dashStyle: "none", nbsp: false })).toBe(input)
    })

    it("skips quotes but applies dashes with mixed none", () => {
      const input = '"Hello" - pages 1-5'
      const expected = `"Hello"${EM_DASH}pages 1${EN_DASH}5`
      expect(transform(input, { punctuationStyle: "none", dashStyle: "american", nbsp: false })).toEqual(expected)
    })
  })

  // Regex-class super-linear behaviour is checked statically by
  // `eslint-plugin-regexp` (literals) and at runtime by `recheck` over every
  // compiled pattern in `regex-safety.test.ts`. This one big budget test
  // backs that up at the pipeline level — it catches non-regex algorithmic
  // regressions and any composed-regex polynomial that recheck missed.
  describe("end-to-end runtime budget", () => {
    // Stryker's instrumentation overhead makes wall-clock assertions meaningless, so skip under mutation runs.
    const itOutsideStryker = process.env.STRYKER_RUN ? it.skip : it
    itOutsideStryker("transforms 200k chars of mixed pathological content under budget", () => {
      const pathological =
        '"a"'.repeat(5_000) +              // quote stress
        "1" + "-1".repeat(5_000) +         // dash stress
        "'".repeat(5_000) + "a" +          // unbalanced single quotes
        "wait... ".repeat(2_000) +         // ellipsis stress
        "a b c d e f ".repeat(2_000) +     // nbsp short-word stress
        buildMixedContent(50_000)          // realistic content
      // Direct (single-run) transform: we're measuring runtime, and the
      // adversarial input intentionally exercises edge cases that don't
      // always converge in one pass.
      const allFeatures = { fractions: true, degrees: true, superscript: true, ligatures: true }

      // Warmup so JIT compiles all hot paths before timing.
      transformWithoutChecks(pathological, allFeatures)

      const start = performance.now()
      transformWithoutChecks(pathological, allFeatures)
      const elapsed = performance.now() - start

      // Linear runtime on ~200k chars takes ~0.5s on modern Node (the
      // idempotency guards in placement and the dash rules cost a measured
      // ~5x constant factor over the unguarded passes); quadratic blowup
      // would push it past tens of seconds. 15s tolerates CI worker
      // contention while still tripping on any polynomial regression.
      expect(elapsed).toBeLessThan(15_000)
    })
  })

  describe("special regex characters in input", () => {
    it.each([
      ['"test [bracket]"', `${LEFT_DOUBLE_QUOTE}test [bracket]${RIGHT_DOUBLE_QUOTE}`],
      ['"test (paren)"', `${LEFT_DOUBLE_QUOTE}test (paren)${RIGHT_DOUBLE_QUOTE}`],
      ['"test {brace}"', `${LEFT_DOUBLE_QUOTE}test {brace}${RIGHT_DOUBLE_QUOTE}`],
      ['"test $dollar"', `${LEFT_DOUBLE_QUOTE}test $dollar${RIGHT_DOUBLE_QUOTE}`],
      ['"test ^caret"', `${LEFT_DOUBLE_QUOTE}test ^caret${RIGHT_DOUBLE_QUOTE}`],
      ['"test .dot"', `${LEFT_DOUBLE_QUOTE}test .dot${RIGHT_DOUBLE_QUOTE}`],
      ['"test |pipe"', `${LEFT_DOUBLE_QUOTE}test |pipe${RIGHT_DOUBLE_QUOTE}`],
    ])('handles regex special chars: "%s"', (input, expected) => {
      expect(transform(input, { nbsp: false })).toBe(expected)
    })
  })

  describe("boundary conditions", () => {
    it.each([
      ['"start', `${LEFT_DOUBLE_QUOTE}start`],
      ["'start", `${RIGHT_SINGLE_QUOTE}start`],
      ["-5 start", `${MINUS}5 start`],
      ["...start", `${ELLIPSIS} start`],
      ['end"', `end${RIGHT_DOUBLE_QUOTE}`],
      ["end'", `end${RIGHT_SINGLE_QUOTE}`],
      ["end...", `end${ELLIPSIS}`],
      ["5x", `5${MULTIPLICATION}`],
    ])('handles boundary: "%s"', (input, expected) => {
      expect(transform(input, { nbsp: false })).toBe(expected)
    })
  })

  describe("multi-node boundary behavior", () => {
    const sep = DEFAULT_SEPARATOR

    it.each([
      ["quotes with boundary at node start", `${sep}"Hello"`, `${sep}${LEFT_DOUBLE_QUOTE}Hello${RIGHT_DOUBLE_QUOTE}`],
      ["em-dash with adjacent boundaries", `word${sep} - ${sep}word`, `word${sep}${EM_DASH}${sep}word`],
      ["ellipsis with boundaries between dots", `a.${sep}.${sep}.`, `a\u2026${sep}${sep}`],
      ["nbsp before last word with trailing empty node", `Hello world${sep}`, `Hello${NBSP}world${sep}`],
    ])("%s", (_desc, input, expected) => {
      expect(transformOverView(input, { nbsp: true })).toBe(expected)
    })
  })

  describe("Unicode preservation", () => {
    it.each([
      ["emoji", '"Hello 👋 World"', `${LEFT_DOUBLE_QUOTE}Hello 👋 World${RIGHT_DOUBLE_QUOTE}`],
      ["RTL text", '"שלום"', `${LEFT_DOUBLE_QUOTE}שלום${RIGHT_DOUBLE_QUOTE}`],
      ["zero-width space", '"Hello\u200BWorld"', `${LEFT_DOUBLE_QUOTE}Hello\u200BWorld${RIGHT_DOUBLE_QUOTE}`],
    ] as const)("preserves %s in input", (_, input, expected) => {
      expect(transform(input, { nbsp: false })).toEqual(expected)
    })
  })


  describe("idempotency across punctuation styles", () => {
    const mixedInput = `"Hello," she said -- "it's pages 1-5." Wait... 5x5 != 25. He's 5'10" tall.`

    it.each([
      ["american"],
      ["british"],
      ["german"],
      ["french"],
    ] as const)("idempotent with %s style", (style) => {
      const opts = { punctuationStyle: style, nbsp: false } as const
      const first = transformWithoutChecks(mixedInput, opts)
      const second = transformWithoutChecks(first, opts)
      expect(second).toBe(first)
    })
  })

  describe("edge case inputs", () => {
    it.each([
      ["empty string", "", ""],
      ["single space", " ", " "],
      ["newlines only", "\n\n\n", "\n\n\n"],
      ["tab only", "\t", "\t"],
      ["nbsp only", NBSP, NBSP],
    ])("handles %s", (_desc, input, expected) => {
      expect(transform(input)).toBe(expected)
    })
  })

  describe("edge cases", () => {
    it("handles empty string input", () => {
      expect(transform("")).toBe("")
      expect(transform("", { nbsp: false })).toBe("")
    })

    it("applies production defaults when called without an options argument", () => {
      expect(transformWithoutChecks('"Dr. Smith"')).toBe(`${LEFT_DOUBLE_QUOTE}Dr.${NBSP}Smith${RIGHT_DOUBLE_QUOTE}`)
    })

    it("treats undefined option values as absent (uses defaults)", () => {
      const input = '"Hello," she said.'
      const withDefault = transform(input)
      expect(transform(input, { nbsp: undefined })).toBe(withDefault)
    })

  })

  describe("option validation", () => {
    it.each([
      "American",
      "AMERICAN",
      "typo",
      "",
      "en-US",
    ])("rejects invalid punctuationStyle: %s", (style) => {
      expect(() => transform("hello", { punctuationStyle: style as never })).toThrow(
        /Invalid punctuationStyle/
      )
    })

    it("coalesces an explicit null style to the default (Required return contract)", () => {
      // JS callers outside the type system can pass null; it must not survive
      // into the resolved options, which are typed Required<TransformOptions>.
      const resolved = resolveTransformOptions({
        punctuationStyle: null as never,
        dashStyle: null as never,
      })
      expect(resolved.punctuationStyle).toBe("american")
      expect(resolved.dashStyle).toBe("american")
    })

    it("includes valid values in punctuationStyle error message", () => {
      expect.assertions(PUNCTUATION_STYLES.length)
      try {
        transform("hello", { punctuationStyle: "bad" as never })
      } catch (e) {
        const msg = (e as Error).message
        for (const style of PUNCTUATION_STYLES) {
          expect(msg).toContain(style)
        }
      }
    })

    it.each([
      "American",
      "BRITISH",
      "typo",
      "",
    ])("rejects invalid dashStyle: %s", (style) => {
      expect(() => transform("hello", { dashStyle: style as never })).toThrow(
        /Invalid dashStyle/
      )
    })

    it("includes valid values in dashStyle error message", () => {
      expect.assertions(DASH_STYLES.length)
      try {
        transform("hello", { dashStyle: "bad" as never })
      } catch (e) {
        const msg = (e as Error).message
        for (const style of DASH_STYLES) {
          expect(msg).toContain(style)
        }
      }
    })

    it.each([
      "american",
      "british",
      "german",
      "french",
      "none",
    ] as const)("accepts valid punctuationStyle: %s", (style) => {
      expect(() => transform("hello", { punctuationStyle: style })).not.toThrow()
    })

    it.each([
      "american",
      "british",
      "none",
    ] as const)("accepts valid dashStyle: %s", (style) => {
      expect(() => transform("hello", { dashStyle: style })).not.toThrow()
    })
  })

  describe("style constant exports", () => {
    it("exports PUNCTUATION_STYLES with all expected values", () => {
      expect(PUNCTUATION_STYLES).toEqual(["american", "british", "german", "french", "none"])
    })

    it("exports DASH_STYLES with all expected values", () => {
      expect(DASH_STYLES).toEqual(["american", "british", "none"])
    })
  })

  describe("option key validation", () => {
    it.each([
      "fraction", // typo of "fractions"
      "emphasisMarker", // markdown-only key
      "skipTags", // HTML-only key
    ])('rejects unknown option key "%s" listing the valid keys', (key) => {
      const callTransform = () => transform("hello", { [key]: true } as never)
      expect(callTransform).toThrow(`Unknown option "${key}" for transform`)
      expect(callTransform).toThrow("Valid options:")
      expect(callTransform).toThrow("symbols")
    })

    it.each(TRANSFORM_OPTION_KEYS.map((key) => [key]))(
      'accepts valid option key "%s"',
      (key) => {
        const value = key === "punctuationStyle" || key === "dashStyle" ? "american"
          : false
        expect(() => transform("hello", { [key]: value } as never)).not.toThrow()
      },
    )

    it("TRANSFORM_OPTION_KEYS matches the documented TransformOptions keys", () => {
      expect([...TRANSFORM_OPTION_KEYS].sort()).toEqual([
        "collapseSpaces",
        "dashStyle",
        "degrees",
        "fractions",
        "includeArrows",
        "ligatures",
        "nbsp",
        "punctuationStyle",
        "superscript",
        "symbols",
      ])
    })
  })

})
