import { countSeparators, assertSeparatorCountPreserved, formatErrorString } from "../utils.js"
import { DEFAULT_SEPARATOR } from "../constants.js"

describe("countSeparators", () => {
  it.each([
    ["empty string", "", DEFAULT_SEPARATOR, 0],
    ["no separators", "hello world", DEFAULT_SEPARATOR, 0],
    ["single separator", `a${DEFAULT_SEPARATOR}b`, DEFAULT_SEPARATOR, 1],
    ["multiple separators", `${DEFAULT_SEPARATOR}a${DEFAULT_SEPARATOR}b${DEFAULT_SEPARATOR}`, DEFAULT_SEPARATOR, 3],
    ["consecutive separators", `${DEFAULT_SEPARATOR}${DEFAULT_SEPARATOR}${DEFAULT_SEPARATOR}`, DEFAULT_SEPARATOR, 3],
    ["custom separator", "a|b|c", "|", 2],
  ])("%s: counts correctly", (_desc, input, separator, expected) => {
    expect(countSeparators(input, separator)).toBe(expected)
  })

  it.each([
    [`a${DEFAULT_SEPARATOR}b`, 1],
    ["no separators", 0],
    [`${DEFAULT_SEPARATOR}${DEFAULT_SEPARATOR}`, 2],
  ])("uses DEFAULT_SEPARATOR when omitted: %s -> %i", (input, expected) => {
    expect(countSeparators(input)).toBe(expected)
  })
})

describe("assertSeparatorCountPreserved", () => {
  describe("does not throw when count preserved", () => {
    it.each([
      ["same count", `a${DEFAULT_SEPARATOR}b`, `x${DEFAULT_SEPARATOR}y`],
      ["zero count", "ab", "xy"],
      ["multiple preserved", `${DEFAULT_SEPARATOR}a${DEFAULT_SEPARATOR}b${DEFAULT_SEPARATOR}`, `${DEFAULT_SEPARATOR}x${DEFAULT_SEPARATOR}y${DEFAULT_SEPARATOR}`],
    ])("%s", (_desc, original, transformed) => {
      expect(() => assertSeparatorCountPreserved(original, transformed, DEFAULT_SEPARATOR, "test")).not.toThrow()
    })
  })

  describe("throws when count changes", () => {
    it.each([
      ["separator removed", `a${DEFAULT_SEPARATOR}b`, "ab", 1, 0],
      ["separator added", "ab", `a${DEFAULT_SEPARATOR}b`, 0, 1],
      ["multiple removed", `${DEFAULT_SEPARATOR}${DEFAULT_SEPARATOR}`, "", 2, 0],
    ])("%s: expected %i, got %i", (_desc, original, transformed, expectedCount, actualCount) => {
      expect(() => assertSeparatorCountPreserved(original, transformed, DEFAULT_SEPARATOR, "testFn"))
        .toThrow(`testFn altered separator count: expected ${expectedCount}, got ${actualCount}`)
    })
  })

  describe("default parameters", () => {
    it.each([
      ["throws when separator lost", `a${DEFAULT_SEPARATOR}b`, "ab", true],
      ["does not throw when preserved", `a${DEFAULT_SEPARATOR}b`, `x${DEFAULT_SEPARATOR}y`, false],
    ])("%s", (_desc, original, transformed, shouldThrow) => {
      if (shouldThrow) {
        expect(() => assertSeparatorCountPreserved(original, transformed)).toThrow()
      } else {
        expect(() => assertSeparatorCountPreserved(original, transformed)).not.toThrow()
      }
    })
  })
})

describe("formatErrorString", () => {
  it("returns JSON-stringified content for short strings", () => {
    const result = formatErrorString("short text", "test")
    expect(result).toBe('"short text"')
  })

  it("truncates strings over 2000 chars with label and length", () => {
    const longText = "x".repeat(2001)
    const result = formatErrorString(longText, "long-test")

    expect(result).toContain("[long-test:")
    expect(result).toContain("2001 chars total")
    expect(result).toContain("...")
  })

  it("includes first 2000 chars in truncated output", () => {
    const longText = "a".repeat(1500) + "b".repeat(1000)
    const result = formatErrorString(longText, "mixed")

    // Should contain all 1500 a's and first 500 b's (2000 total)
    const expected2000 = "a".repeat(1500) + "b".repeat(500)
    expect(result).toContain(JSON.stringify(expected2000))
    expect(result).toContain("2500 chars total")
  })

  it("writes full content to stderr in Node.js for long strings", () => {
    const originalWrite = process.stderr.write
    const written: string[] = []
    process.stderr.write = ((chunk: string) => {
      written.push(chunk)
      return true
    }) as typeof process.stderr.write

    try {
      const longText = "z".repeat(2001)
      formatErrorString(longText, "stderr-test")

      expect(written.length).toBe(1)
      expect(written[0]).toContain("punctilio stderr-test full content")
      expect(written[0]).toContain(longText)
    } finally {
      process.stderr.write = originalWrite
    }
  })

  it("does not write to stderr for short strings", () => {
    const originalWrite = process.stderr.write
    const written: string[] = []
    process.stderr.write = ((chunk: string) => {
      written.push(chunk)
      return true
    }) as typeof process.stderr.write

    try {
      formatErrorString("short", "test")
      expect(written.length).toBe(0)
    } finally {
      process.stderr.write = originalWrite
    }
  })

  it("handles strings at exactly the threshold", () => {
    const exactText = "x".repeat(2000)
    const result = formatErrorString(exactText, "exact")
    // At threshold, should return JSON-stringified (not truncated)
    expect(result).toBe(JSON.stringify(exactText))
  })
})
