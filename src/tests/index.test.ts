import { transform, DEFAULT_SEPARATOR, countSeparators } from "../index.js"
import { ellipsis } from "../symbols.js"
import { niceQuotes } from "../quotes.js"
import { hyphenReplace } from "../dashes.js"
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
      const result = transform(input)
      expect(result).toContain(`${DEFAULT_SEPARATOR}${DEFAULT_SEPARATOR}${DEFAULT_SEPARATOR}`)
    })
  })

  describe("Unicode edge cases", () => {
    it.each([
      ['"café"', "café", "combining characters"],
      ['"Hello 👋 world"', "👋", "emoji"],
      ['"日本語"', "日本語", "CJK characters"],
      ['"שלום"', "שלום", "RTL text"],
      ["a\u200Bb", "a\u200Bb", "zero-width characters"],
    ])('handles %s in "%s"', (input, expectedContent) => {
      const result = transform(input)
      expect(result).toContain(expectedContent)
    })
  })
})

describe("performance", () => {
  it("handles 1000 dots without timeout", () => {
    const input = ".".repeat(1000)
    const start = Date.now()
    ellipsis(input)
    const elapsed = Date.now() - start
    expect(elapsed).toBeLessThan(1000)
  })

  it("handles 1000 quote pairs without timeout", () => {
    const input = '"a" '.repeat(1000)
    const start = Date.now()
    niceQuotes(input)
    const elapsed = Date.now() - start
    expect(elapsed).toBeLessThan(1000)
  })

  it("handles 1000 dashes without timeout", () => {
    const input = "a-b ".repeat(1000)
    const start = Date.now()
    hyphenReplace(input)
    const elapsed = Date.now() - start
    expect(elapsed).toBeLessThan(1000)
  })
})
