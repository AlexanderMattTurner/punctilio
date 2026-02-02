import { transform, DEFAULT_SEPARATOR, countSeparators } from "../index.js"
import { ellipsis } from "../symbols.js"
import { UNICODE_SYMBOLS } from "../constants.js"

const {
  LEFT_DOUBLE_QUOTE,
  RIGHT_DOUBLE_QUOTE,
  RIGHT_SINGLE_QUOTE,
  EM_DASH,
  EN_DASH,
  ELLIPSIS,
  MULTIPLICATION,
  NOT_EQUAL,
  COPYRIGHT,
  NBSP,
} = UNICODE_SYMBOLS

describe("transform", () => {
  it("applies both quote and dash transformations", () => {
    const input = '"Hello," she said - "it\'s pages 1-5."'
    const expected = `${LEFT_DOUBLE_QUOTE}Hello,${RIGHT_DOUBLE_QUOTE} she said${EM_DASH}${LEFT_DOUBLE_QUOTE}it${RIGHT_SINGLE_QUOTE}s pages 1${EN_DASH}5.${RIGHT_DOUBLE_QUOTE}`
    expect(transform(input)).toBe(expected)
  })

  it("handles complex mixed content", () => {
    const input = 'I was born in \'99 - "the best year" - and pages 10-20 are my favorite.'
    const expected = `I was born in ${RIGHT_SINGLE_QUOTE}99${EM_DASH}${LEFT_DOUBLE_QUOTE}the best year${RIGHT_DOUBLE_QUOTE}${EM_DASH}and pages 10${EN_DASH}20 are my favorite.`
    expect(transform(input)).toBe(expected)
  })

  it("preserves separator character", () => {
    const sep = DEFAULT_SEPARATOR
    const input = `"Hello${sep}" - test`
    expect(transform(input, { separator: sep })).toBe(`${LEFT_DOUBLE_QUOTE}Hello${sep}${RIGHT_DOUBLE_QUOTE}${EM_DASH}test`)
  })

  describe("symbol transforms", () => {
    it("applies symbol transforms by default", () => {
      expect(transform('Wait... 5x5 != 25 (c) 2024')).toBe(`Wait${ELLIPSIS} 5${MULTIPLICATION}5 ${NOT_EQUAL} 25 ${COPYRIGHT} 2024`)
    })

    it("can disable symbol transforms", () => {
      expect(transform('Wait... 5x5 != 25', { symbols: false })).toBe('Wait... 5x5 != 25')
    })
  })

  describe("optional transforms", () => {
    it.each([
      ["fractions disabled", "1/2", {}, "1/2"],
      ["fractions enabled", "1/2", { fractions: true }, UNICODE_SYMBOLS.FRACTION_1_2],
      ["degrees disabled", "20 C", {}, "20 C"],
      ["degrees enabled", "20 C", { degrees: true }, `20 ${UNICODE_SYMBOLS.DEGREE}C`],
      ["superscript disabled", "1st", {}, "1st"],
      ["superscript enabled", "1st", { superscript: true }, `1${UNICODE_SYMBOLS.SUPERSCRIPT_ST}`],
      ["ligatures disabled", "??", {}, "??"],
      ["ligatures enabled", "??", { ligatures: true }, UNICODE_SYMBOLS.DOUBLE_QUESTION],
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
      ['"Hello".', "none", periodOutside, "none"],
    ] as const)("handles %s with %s style", (input, style, expected) => {
      expect(transform(input, style ? { punctuationStyle: style } : {})).toBe(expected)
    })
  })

  describe("collapseSpaces option", () => {
    it.each([
      ["hello  world", "hello world", "multiple spaces"],
      [`foo${NBSP}${NBSP}bar`, `foo${NBSP}bar`, "multiple nbsp"],
      [`a ${NBSP}b`, `a${NBSP}b`, "mixed spaces prefer nbsp"],
      [`a${NBSP} b`, `a${NBSP}b`, "mixed spaces prefer nbsp"],
    ])("collapses %s by default", (input, expected) => {
      expect(transform(input)).toBe(expected)
    })

    it.each([
      ["hello  world", "hello  world", "multiple spaces"],
      [`foo${NBSP}${NBSP}bar`, `foo${NBSP}${NBSP}bar`, "multiple nbsp"],
    ])("preserves %s when disabled", (input, expected) => {
      expect(transform(input, { collapseSpaces: false })).toBe(expected)
    })
  })

  describe("separator preservation", () => {
    it.each([
      [`Wait.${DEFAULT_SEPARATOR}.${DEFAULT_SEPARATOR}. for it`, 2],
      [`"Hello${DEFAULT_SEPARATOR}" - ${DEFAULT_SEPARATOR}she${DEFAULT_SEPARATOR} said`, 3],
      [`.${DEFAULT_SEPARATOR}.${DEFAULT_SEPARATOR}.`, 2],
    ])('preserves %i separators in "%s"', (input, expectedCount) => {
      expect(() => transform(input, { separator: DEFAULT_SEPARATOR })).not.toThrow()
      expect(countSeparators(transform(input, { separator: DEFAULT_SEPARATOR }), DEFAULT_SEPARATOR)).toBe(expectedCount)
    })

    it("preserves separator in ellipsis", () => {
      const input = `.${DEFAULT_SEPARATOR}.${DEFAULT_SEPARATOR}.`
      const result = ellipsis(input, { separator: DEFAULT_SEPARATOR })
      expect(result.split(DEFAULT_SEPARATOR).length - 1).toBe(2)
    })

    it("preserves consecutive separators", () => {
      const input = `a${DEFAULT_SEPARATOR}${DEFAULT_SEPARATOR}${DEFAULT_SEPARATOR}b`
      expect(transform(input)).toBe(input)
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
      expect(transform(input)).toBe(transform(input)) // idempotent
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
        ["-5", `−5`],
        ["(-5)", `(−5)`],
        // Prime marks - smartypants/typograf fail
        ['5\'10"', `5′10″`],
        ['He is 6\'2" tall', `He is 6′2″ tall`],
      ])('correctly transforms: "%s"', (input, expected) => {
        expect(transform(input, { symbols: true, degrees: true })).toBe(expected)
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
        expect(transform(input)).toBe(input)
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
        expect(transform(input)).toBe(input)
      })
    })
  })

  describe("complex real-world text", () => {
    it("handles dialogue with dashes and quotes", () => {
      const input = '"Wait," she said -- "I don\'t think that\'s right."'
      const result = transform(input)
      expect(result).toContain(LEFT_DOUBLE_QUOTE)
      expect(result).toContain(RIGHT_DOUBLE_QUOTE)
      expect(result).toContain(EM_DASH)
      expect(result).toContain(RIGHT_SINGLE_QUOTE) // apostrophe
    })

    it("handles technical documentation", () => {
      const input = 'The API returns x != y when a <= b and c >= d. Error tolerance: +-5%.'
      const expected = `The API returns x ${NOT_EQUAL} y when a ≤ b and c ≥ d. Error tolerance: ±5%.`
      expect(transform(input)).toBe(expected)
    })

    it("handles measurement text", () => {
      const input = 'He is 6\'2" tall.'
      const result = transform(input, { symbols: true })
      expect(result).toContain('′') // prime mark
      expect(result).toContain('″') // double prime
    })

    it("handles copyright notices", () => {
      const input = '(c) 2024 Company(tm). All rights reserved(r).'
      const result = transform(input)
      expect(result).toContain(COPYRIGHT)
      expect(result).toContain('™')
      expect(result).toContain('®')
    })
  })

  describe("known limitations", () => {
    // These document current behavior for edge cases
    it("documents prime mark vs closing quote ambiguity", () => {
      // When there's an open quote before a number, the quote after should close
      // not become a prime mark
      const input = '"Number 5"'
      const result = transform(input)
      // The 5" should be a closing quote, not a prime
      expect(result).toBe(`${LEFT_DOUBLE_QUOTE}Number 5${RIGHT_DOUBLE_QUOTE}`)
    })
  })

  describe("complex combined transformations", () => {
    it.each([
      [
        '"Wait..." she said - "it\'s pages 1-5."',
        `${LEFT_DOUBLE_QUOTE}Wait…${RIGHT_DOUBLE_QUOTE} she said${EM_DASH}${LEFT_DOUBLE_QUOTE}it${RIGHT_SINGLE_QUOTE}s pages 1–5.${RIGHT_DOUBLE_QUOTE}`,
      ],
      [
        "(c) 2024 - Room is 10x12, set to 72 F",
        `${COPYRIGHT} 2024${EM_DASH}Room is 10×12, set to 72 °F`,
      ],
    ])('handles complex transform: "%s"', (input, expected) => {
      expect(transform(input, { degrees: true })).toBe(expected)
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
      expect(transform(input)).toBe(expected)
    })
  })

  describe("very long inputs", () => {
    it("handles long repeated patterns", () => {
      const input = '"Hello" '.repeat(100)
      const result = transform(input)
      expect(result).toContain(LEFT_DOUBLE_QUOTE)
      expect(result).toContain(RIGHT_DOUBLE_QUOTE)
    })

    it("handles long continuous text", () => {
      const input = "word ".repeat(1000)
      const result = transform(input)
      expect(result).toBe(input.trim() + " ")
    })

    it("converts ALL quote pairs in repeated pattern", () => {
      const count = 50
      const input = '"Hello" '.repeat(count)
      const result = transform(input)
      const leftCount = (result.match(new RegExp(LEFT_DOUBLE_QUOTE, "g")) || []).length
      const rightCount = (result.match(new RegExp(RIGHT_DOUBLE_QUOTE, "g")) || []).length
      expect(leftCount).toBe(count)
      expect(rightCount).toBe(count)
    })

    it("converts ALL dashes in repeated pattern", () => {
      const count = 50
      const input = "pages 1-5 ".repeat(count)
      const result = transform(input)
      const enDashCount = (result.match(/–/g) || []).length
      expect(enDashCount).toBe(count)
    })

    it("converts ALL ellipses in repeated pattern", () => {
      const count = 50
      const input = "Wait... ".repeat(count)
      const result = transform(input)
      const ellipsisCount = (result.match(/…/g) || []).length
      expect(ellipsisCount).toBe(count)
    })
  })

  describe("Unicode edge cases", () => {
    it.each([
      ['"test\u200Bword"', `${LEFT_DOUBLE_QUOTE}test\u200Bword${RIGHT_DOUBLE_QUOTE}`],
      ['"test\u200Fword"', `${LEFT_DOUBLE_QUOTE}test\u200Fword${RIGHT_DOUBLE_QUOTE}`],
      ['"caf\u0065\u0301"', `${LEFT_DOUBLE_QUOTE}caf\u0065\u0301${RIGHT_DOUBLE_QUOTE}`],
    ])('handles Unicode edge case', (input, expected) => {
      expect(transform(input)).toBe(expected)
    })
  })

  describe("option combinations", () => {
    it("applies all optional transforms together", () => {
      const input = "1st place: 1/2 at 72 F - wow!!"
      const result = transform(input, {
        fractions: true,
        degrees: true,
        superscript: true,
        ligatures: true,
      })
      expect(result).toContain("ˢᵗ")
      expect(result).toContain("½")
      expect(result).toContain("°")
    })

    it("respects disabled transforms", () => {
      const input = "1/2 at 72 F"
      const result = transform(input, {
        fractions: false,
        degrees: false,
      })
      expect(result).not.toContain("½")
      expect(result).not.toContain("°")
    })
  })

  describe("separator robustness", () => {
    const sep = DEFAULT_SEPARATOR

    it.each([
      [`${sep}"test"${sep}`, `${sep}${LEFT_DOUBLE_QUOTE}test${RIGHT_DOUBLE_QUOTE}${sep}`],
      [`"test${sep}word"`, `${LEFT_DOUBLE_QUOTE}test${sep}word${RIGHT_DOUBLE_QUOTE}`],
      [`${sep}${sep}"test"${sep}${sep}`, `${sep}${sep}${LEFT_DOUBLE_QUOTE}test${RIGHT_DOUBLE_QUOTE}${sep}${sep}`],
    ])('handles separator in quotes', (input, expected) => {
      expect(transform(input, { separator: sep })).toBe(expected)
    })

    it.each([
      [`word${sep} - ${sep}word`, `word${sep}${EM_DASH}${sep}word`],
      [`1${sep}-${sep}5`, `1${sep}–${sep}5`],
    ])('handles separator in dashes', (input, expected) => {
      expect(transform(input, { separator: sep })).toBe(expected)
    })

    it("preserves exact separator count through transform", () => {
      const input = `${sep}text${sep}more${sep}text${sep}`
      const result = transform(input, { separator: sep })
      const inputCount = (input.match(new RegExp(sep, "g")) || []).length
      const resultCount = (result.match(new RegExp(sep, "g")) || []).length
      expect(resultCount).toBe(inputCount)
    })

    it("handles input containing separator character", () => {
      const input = `Text with ${sep} in it`
      expect(() => transform(input, { separator: sep })).not.toThrow()
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
      `1–5`,
      `Wait…`,
      `5×5`,
      `20 °C`,
      `${COPYRIGHT} 2024`,
    ])('stable for: "%s"', (input) => {
      expect(transform(input)).toBe(input)
    })
  })

  describe("style combinations", () => {
    it("applies American conventions throughout", () => {
      const input = '"Hello." - word - "World."'
      const result = transform(input, { punctuationStyle: "american", dashStyle: "american" })
      expect(result).toContain(`Hello.${RIGHT_DOUBLE_QUOTE}`)
      expect(result).toContain(EM_DASH)
      expect(result).not.toContain(` ${EM_DASH} `)
    })

    it("applies British conventions throughout", () => {
      const input = '"Hello." - word - "World."'
      const result = transform(input, { punctuationStyle: "british", dashStyle: "british" })
      expect(result).toContain(`${RIGHT_DOUBLE_QUOTE}.`)
      expect(result).toContain(` – `)
    })

    it("applies American punctuation with British dashes", () => {
      const input = '"Hello." - word'
      const result = transform(input, { punctuationStyle: "american", dashStyle: "british" })
      expect(result).toContain(`Hello.${RIGHT_DOUBLE_QUOTE}`)
      expect(result).toContain(` – `)
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
      expect(transform(input)).toBe(expected)
    })
  })

  describe("boundary conditions", () => {
    it.each([
      ['"start', `${LEFT_DOUBLE_QUOTE}start`],
      ["'start", `${RIGHT_SINGLE_QUOTE}start`],
      ["-5 start", `−5 start`],
      ["...start", `… start`],
      ['end"', `end${RIGHT_DOUBLE_QUOTE}`],
      ["end'", `end${RIGHT_SINGLE_QUOTE}`],
      ["end...", `end…`],
      ["5x", `5×`],
    ])('handles boundary: "%s"', (input, expected) => {
      expect(transform(input)).toBe(expected)
    })
  })

  describe("separator validation", () => {
    const invalidSeparators = [
      ["🎉", "emoji (multi-codepoint)"],
      ["ab", "multi-character"],
      ["", "empty string"],
    ] as const

    it.each(invalidSeparators)("rejects %s separator (%s)", (sep) => {
      expect(() => transform('"Hello"', { separator: sep })).toThrow(
        /Invalid separator.*must be a single character/
      )
    })

    const validSeparators = ["\uE000", "|", "\u2603"] // Default, pipe, snowman

    it.each(validSeparators)("accepts '%s' as separator", (sep) => {
      expect(() => transform('"Hello"', { separator: sep })).not.toThrow()
    })
  })

  describe("regex-special separator characters", () => {
    const regexSpecialChars = [".", "*", "+", "?", "^", "$", "[", "]", "\\", "|", "(", ")"]

    it.each(regexSpecialChars)("handles '%s' as separator", (sep) => {
      expect(transform('"Hello"', { separator: sep })).toEqual(
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
      expect(transform(input)).toEqual(expected)
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
})
