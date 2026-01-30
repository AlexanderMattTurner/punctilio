import { transform, DEFAULT_SEPARATOR, countSeparators } from "../index.js"
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
    const result = transform(input, { separator: sep })
    expect(result).toContain(sep)
  })

  describe("symbol transforms", () => {
    it("applies symbol transforms by default", () => {
      const input = 'Wait... 5x5 != 25 (c) 2024'
      const result = transform(input)
      expect(result).toContain(ELLIPSIS)
      expect(result).toContain(MULTIPLICATION)
      expect(result).toContain(NOT_EQUAL)
      expect(result).toContain(COPYRIGHT)
    })

    it("can disable symbol transforms", () => {
      const input = 'Wait... 5x5 != 25'
      const result = transform(input, { symbols: false })
      expect(result).toContain("...")
      expect(result).toContain("5x5")
      expect(result).toContain("!=")
    })
  })

  describe("optional transforms", () => {
    it("does not apply fractions by default", () => {
      const input = 'Add 1/2 cup'
      const result = transform(input)
      expect(result).toContain("1/2")
    })

    it("applies fractions when enabled", () => {
      const input = 'Add 1/2 cup'
      const result = transform(input, { fractions: true })
      expect(result).toContain(UNICODE_SYMBOLS.FRACTION_1_2)
    })

    it("does not apply degrees by default", () => {
      const input = 'Temperature: 20 C'
      const result = transform(input)
      expect(result).not.toContain(UNICODE_SYMBOLS.DEGREE)
    })

    it("applies degrees when enabled", () => {
      const input = 'Temperature: 20 C'
      const result = transform(input, { degrees: true })
      expect(result).toContain(`${UNICODE_SYMBOLS.DEGREE}C`)
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

  describe("separator preservation", () => {
    const S = DEFAULT_SEPARATOR

    it.each([
      [`Wait.${S}.${S}. for it`, 2],
      [`"Hello${S}" - ${S}she${S} said`, 3],
      [`.${S}.${S}.`, 2],
    ])('preserves %i separators in "%s"', (input, expectedCount) => {
      expect(() => transform(input, { separator: S })).not.toThrow()
      expect(countSeparators(transform(input, { separator: S }), S)).toBe(expectedCount)
    })
  })
})
