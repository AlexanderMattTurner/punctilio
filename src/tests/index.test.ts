import { transform, DEFAULT_SEPARATOR, countSeparators } from "../index.js"
import { ellipsis } from "../symbols.js"
import { UNICODE_SYMBOLS, REGEX_SPECIAL_CHARS } from "../constants.js"

const {
  LEFT_DOUBLE_QUOTE,
  RIGHT_DOUBLE_QUOTE,
  RIGHT_SINGLE_QUOTE,
  EM_DASH: RAW_EM_DASH,
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
  WORD_JOINER,
} = UNICODE_SYMBOLS

// hyphenReplace prepends a word joiner before em dashes to prevent line wrapping
const EM_DASH = `${WORD_JOINER}${RAW_EM_DASH}`

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

  it("preserves separator character", () => {
    const sep = DEFAULT_SEPARATOR
    const input = `"Hello${sep}" - test`
    expect(transform(input, { separator: sep, nbsp: false })).toBe(`${LEFT_DOUBLE_QUOTE}Hello${sep}${RIGHT_DOUBLE_QUOTE}${EM_DASH}test`)
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

  describe("collapseSpaces option", () => {
    it.each([
      ["hello  world", "hello world", "multiple spaces"],
      [`foo${NBSP}${NBSP}bar`, `foo${NBSP}bar`, "multiple nbsp"],
      [`a ${NBSP}b`, `a${NBSP}b`, "mixed spaces prefer nbsp"],
      [`a${NBSP} b`, `a${NBSP}b`, "mixed spaces prefer nbsp"],
    ])("collapses %s by default", (input, expected) => {
      expect(transform(input, { nbsp: false })).toBe(expected)
    })

    it.each([
      ["hello  world", "hello  world", "multiple spaces"],
      [`foo${NBSP}${NBSP}bar`, `foo${NBSP}${NBSP}bar`, "multiple nbsp"],
    ])("preserves %s when disabled", (input, expected) => {
      expect(transform(input, { collapseSpaces: false, nbsp: false })).toBe(expected)
    })
  })

  describe("nbsp option", () => {
    it("inserts nbsp in typographically appropriate places", () => {
      expect(transform("Dr. Smith wrote Fig. 1 on p. 42", { nbsp: true }))
        .toBe(`Dr.${NBSP}Smith wrote Fig.${NBSP}1 on${NBSP}p.${NBSP}42`)
    })

    it("collapseSpaces cleans up after nbsp", () => {
      expect(transform("Prof. Wilson arrived", { nbsp: true }))
        .toBe(`Prof.${NBSP}Wilson${NBSP}arrived`)
    })

    it("is idempotent with nbsp enabled", () => {
      const input = "Dr. Smith has 5 kg of items in § 3"
      const first = transform(input, { nbsp: true })
      const second = transform(first, { nbsp: true })
      expect(second).toBe(first)
    })

    it("preserves separator count with nbsp enabled", () => {
      const sep = DEFAULT_SEPARATOR
      const input = `Dr.${sep} Smith has${sep} 5 kg`
      expect(() => transform(input, { nbsp: true, separator: sep })).not.toThrow()
    })
  })

  describe("separator preservation", () => {
    it.each([
      [`Wait.${DEFAULT_SEPARATOR}.${DEFAULT_SEPARATOR}. for it`, 2],
      [`"Hello${DEFAULT_SEPARATOR}" - ${DEFAULT_SEPARATOR}she${DEFAULT_SEPARATOR} said`, 3],
      [`.${DEFAULT_SEPARATOR}.${DEFAULT_SEPARATOR}.`, 2],
    ])('preserves %i separators in "%s"', (input, expectedCount) => {
      expect(() => transform(input, { separator: DEFAULT_SEPARATOR, nbsp: false })).not.toThrow()
      expect(countSeparators(transform(input, { separator: DEFAULT_SEPARATOR, nbsp: false }), DEFAULT_SEPARATOR)).toBe(expectedCount)
    })

    it("preserves separator in ellipsis", () => {
      const input = `.${DEFAULT_SEPARATOR}.${DEFAULT_SEPARATOR}.`
      const result = ellipsis(input, { separator: DEFAULT_SEPARATOR })
      expect(result.split(DEFAULT_SEPARATOR).length - 1).toBe(2)
    })

    it("preserves consecutive separators", () => {
      const input = `a${DEFAULT_SEPARATOR}${DEFAULT_SEPARATOR}${DEFAULT_SEPARATOR}b`
      expect(transform(input, { nbsp: false })).toBe(input)
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
      ["   ", " "],
    ])('handles empty/whitespace: "%s"', (input, expected) => {
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

  describe("Unicode edge cases", () => {
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

  describe("separator robustness", () => {
    const sep = DEFAULT_SEPARATOR

    it.each([
      [`${sep}"test"${sep}`, `${sep}${LEFT_DOUBLE_QUOTE}test${RIGHT_DOUBLE_QUOTE}${sep}`],
      [`"test${sep}word"`, `${LEFT_DOUBLE_QUOTE}test${sep}word${RIGHT_DOUBLE_QUOTE}`],
      [`${sep}${sep}"test"${sep}${sep}`, `${sep}${sep}${LEFT_DOUBLE_QUOTE}test${RIGHT_DOUBLE_QUOTE}${sep}${sep}`],
    ])('handles separator in quotes', (input, expected) => {
      expect(transform(input, { separator: sep, nbsp: false })).toBe(expected)
    })

    it.each([
      [`word${sep} - ${sep}word`, `word${sep}${EM_DASH}${sep}word`],
      [`1${sep}-${sep}5`, `1${sep}${EN_DASH}${sep}5`],
    ])('handles separator in dashes', (input, expected) => {
      expect(transform(input, { separator: sep, nbsp: false })).toBe(expected)
    })

    it("preserves exact separator count through transform", () => {
      const input = `${sep}text${sep}more${sep}text${sep}`
      const result = transform(input, { separator: sep, nbsp: false })
      const inputCount = (input.match(new RegExp(sep, "g")) || []).length
      const resultCount = (result.match(new RegExp(sep, "g")) || []).length
      expect(resultCount).toBe(inputCount)
    })

    it("handles input containing separator character", () => {
      const input = `Text with ${sep} in it`
      expect(() => transform(input, { separator: sep, nbsp: false })).not.toThrow()
    })

    it("handles separator in fractions", () => {
      const input = `1${sep}/2`
      expect(transform(input, { separator: sep, fractions: true, nbsp: false })).toBe(`${sep}${FRACTION_1_2}`)
    })

    it("handles separator in degrees", () => {
      const input = `72${sep} F`
      expect(transform(input, { separator: sep, degrees: true, nbsp: false })).toBe(`72${sep} ${DEGREE}F`)
    })
  })

  describe("additional idempotency", () => {
    it.each([
      '"Hello" - she said, "it\'s pages 1-5..."',
      'Product(tm) 5x5 at 72 F (c) 2024',
      "Add 1/2 cup - that's about 3/4 done",
      '1st place winner said "congrats!!"',
    ])('is idempotent: "%s"', (input) => {
      const first = transform(input, { fractions: true, degrees: true, superscript: true, ligatures: true })
      const second = transform(first, { fractions: true, degrees: true, superscript: true, ligatures: true })
      expect(second).toBe(first)
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

  describe("regex performance", () => {
    it("handles pathological quote patterns efficiently", () => {
      const input = '"a"'.repeat(50) + "'"
      const start = Date.now()
      transform(input)
      const duration = Date.now() - start
      expect(duration).toBeLessThan(1000)
    })

    it("handles pathological dash patterns efficiently", () => {
      const input = "1-2-3-4-5-6-7-8-9-10-11-12-13-14-15"
      const start = Date.now()
      transform(input)
      const duration = Date.now() - start
      expect(duration).toBeLessThan(1000)
    })

    it("handles 1000 unbalanced single quotes efficiently", () => {
      const input = "'".repeat(1000) + "a"
      const start = performance.now()
      transform(input)
      const duration = performance.now() - start
      expect(duration).toBeLessThan(500)
    })

    it("handles 500 chained number patterns efficiently", () => {
      const input = "1" + "-1".repeat(500)
      const start = performance.now()
      transform(input)
      const duration = performance.now() - start
      expect(duration).toBeLessThan(500)
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

  describe("separator validation", () => {
    const invalidSeparators = [
      ["🎉", "emoji (multi-codepoint)"],
      ["ab", "multi-character"],
      ["", "empty string"],
    ] as const

    it.each(invalidSeparators)("rejects %s separator (%s)", (sep) => {
      expect(() => transform('"Hello"', { separator: sep, nbsp: false })).toThrow(
        /Invalid separator.*must be a single character/
      )
    })

    const validSeparators = ["\uE000", "|", "\u2603"] // Default, pipe, snowman

    it.each(validSeparators)("accepts '%s' as separator", (sep) => {
      expect(() => transform('"Hello"', { separator: sep, nbsp: false })).not.toThrow()
    })
  })

  describe("regex-special separator characters", () => {
    it.each(REGEX_SPECIAL_CHARS)("handles '%s' as separator", (sep) => {
      expect(transform('"Hello"', { separator: sep, nbsp: false })).toEqual(
        `${LEFT_DOUBLE_QUOTE}Hello${RIGHT_DOUBLE_QUOTE}`
      )
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

  describe("large input handling", () => {
    it("handles 1MB of text", () => {
      const input = "Hello, world! ".repeat(70000)
      const start = performance.now()
      transform(input)
      expect(performance.now() - start).toBeLessThan(2000)
    })
  })

  describe("ReDoS resistance", () => {
    const MAX_TIMEOUT_MS = 100

    it.each([
      ["10000 single quotes", "'".repeat(10000)],
      ["10000 double quotes", '"'.repeat(10000)],
      ["1000 unbalanced quotes", '"Hello '.repeat(1000)],
      ["10000 hyphens", "-".repeat(10000)],
      ["alternating digits/hyphens", "1-2-3-4-5-6-7-8-9-0".repeat(500)],
      ["10000 dots", ".".repeat(10000)],
    ] as const)("handles %s", (_, input) => {
      const start = performance.now()
      transform(input)
      expect(performance.now() - start).toBeLessThan(MAX_TIMEOUT_MS)
    })
  })

  describe("word joiner and quote interaction", () => {
    it.each([
      // Closing quote followed by em dash
      ['"best year" - and more', `${LEFT_DOUBLE_QUOTE}best year${RIGHT_DOUBLE_QUOTE}${EM_DASH}and more`],
      // Opening quote preceded by em dash
      ['word - "hello"', `word${EM_DASH}${LEFT_DOUBLE_QUOTE}hello${RIGHT_DOUBLE_QUOTE}`],
      // Both sides
      ['"first" - "second"', `${LEFT_DOUBLE_QUOTE}first${RIGHT_DOUBLE_QUOTE}${EM_DASH}${LEFT_DOUBLE_QUOTE}second${RIGHT_DOUBLE_QUOTE}`],
      // Single quotes around em dash
      ["it's - isn't it", `it${RIGHT_SINGLE_QUOTE}s${EM_DASH}isn${RIGHT_SINGLE_QUOTE}t it`],
      // Multiple em dashes in one sentence with quotes
      ['"Wait" - stop - "go"', `${LEFT_DOUBLE_QUOTE}Wait${RIGHT_DOUBLE_QUOTE}${EM_DASH}stop${EM_DASH}${LEFT_DOUBLE_QUOTE}go${RIGHT_DOUBLE_QUOTE}`],
    ])('handles quotes with em dashes: "%s"', (input, expected) => {
      expect(transform(input, { nbsp: false })).toBe(expected)
    })

    it("word joiner is present before every em dash in output", () => {
      const input = '"first" - "second" - "third"'
      const result = transform(input, { nbsp: false })
      // Find all em dashes and check each has a word joiner before it
      for (let i = 0; i < result.length; i++) {
        if (result[i] === RAW_EM_DASH) {
          expect(result[i - 1]).toBe(WORD_JOINER)
        }
      }
    })

    it("separator + closing quote + em dash works correctly", () => {
      const sep = DEFAULT_SEPARATOR
      const input = `"Hello${sep}" - test`
      const result = transform(input, { separator: sep, nbsp: false })
      expect(result).toBe(`${LEFT_DOUBLE_QUOTE}Hello${sep}${RIGHT_DOUBLE_QUOTE}${EM_DASH}test`)
    })

    it("transform is idempotent with em dashes and quotes", () => {
      const inputs = [
        '"first" - "second"',
        '"Wait..." she said - "it\'s pages 1-5."',
        '\'99 - "the best year" - and more',
        '"Quote." - Author - "Another quote."',
      ]
      for (const input of inputs) {
        const first = transform(input, { nbsp: false })
        const second = transform(first, { nbsp: false })
        expect(second).toBe(first)
      }
    })

    it("style conversion roundtrip: American→British→American", () => {
      const input = '"Hello" - "World"'
      const american = transform(input, { dashStyle: "american", nbsp: false })
      const british = transform(american, { dashStyle: "british", nbsp: false })
      const backToAmerican = transform(british, { dashStyle: "american", nbsp: false })
      expect(backToAmerican).toBe(american)
    })
  })
})
