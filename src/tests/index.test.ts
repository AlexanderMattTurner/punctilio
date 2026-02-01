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
      [`a ${NBSP}b`, "a b", "space then nbsp keeps space"],
      [`a${NBSP} b`, `a${NBSP}b`, "nbsp then space keeps nbsp"],
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
})
