import { transform, DEFAULT_SEPARATOR } from "../index.js"

// Unicode characters
const LDQ = "\u201C" // " left double quote
const RDQ = "\u201D" // " right double quote
const RSQ = "\u2019" // ' right single quote
const EM = "\u2014" // — em dash
const EN = "\u2013" // – en dash
const ELLIPSIS = "\u2026" // …
const MULT = "\u00D7" // ×
const NE = "\u2260" // ≠
const COPYRIGHT = "\u00A9" // ©

describe("transform", () => {
  it("applies both quote and dash transformations", () => {
    const input = '"Hello," she said - "it\'s pages 1-5."'
    const expected = `${LDQ}Hello${RDQ}, she said${EM}${LDQ}it${RSQ}s pages 1${EN}5.${RDQ}`
    expect(transform(input)).toBe(expected)
  })

  it("handles complex mixed content", () => {
    const input = 'I was born in \'99 - "the best year" - and pages 10-20 are my favorite.'
    const expected = `I was born in ${RSQ}99${EM}${LDQ}the best year${RDQ}${EM}and pages 10${EN}20 are my favorite.`
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
      expect(result).toContain(MULT)
      expect(result).toContain(NE)
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
      expect(result).toContain("\u00BD") // ½
    })

    it("does not apply degrees by default", () => {
      const input = 'Temperature: 20 C'
      const result = transform(input)
      expect(result).not.toContain("\u00B0")
    })

    it("applies degrees when enabled", () => {
      const input = 'Temperature: 20 C'
      const result = transform(input, { degrees: true })
      expect(result).toContain("\u00B0C")
    })
  })
})

describe("DEFAULT_SEPARATOR", () => {
  it("is the Unicode Private Use Area character U+E000", () => {
    expect(DEFAULT_SEPARATOR).toBe("\uE000")
  })
})
