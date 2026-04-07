import { jest } from "@jest/globals"
import { assertSeparatorAbsent, countSeparators, assertSeparatorCountPreserved, formatErrorString } from "../utils.js"
import { DEFAULT_SEPARATOR, cachedRegExp } from "../constants.js"

describe("assertSeparatorAbsent", () => {
  it.each([
    ["no values", [], DEFAULT_SEPARATOR],
    ["clean values", ["hello", "world"], DEFAULT_SEPARATOR],
  ])("does not throw: %s", (_desc, values, separator) => {
    expect(() => assertSeparatorAbsent(values, separator)).not.toThrow()
  })

  it.each([
    ["default separator", [`hello${DEFAULT_SEPARATOR}world`], DEFAULT_SEPARATOR, /U\+E000 U\+E001/],
    ["custom separator", ["hello|world"], "|", /U\+007C/],
    ["separator in middle element", ["clean", `has${DEFAULT_SEPARATOR}sep`, "also clean"], DEFAULT_SEPARATOR, /separator sequence/],
  ])("throws: %s", (_desc, values, separator, expectedPattern) => {
    expect(() => assertSeparatorAbsent(values, separator)).toThrow(expectedPattern)
  })
})

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

describe("cachedRegExp", () => {
  it("evicts oldest entry when cache exceeds max size", () => {
    // Fill the cache well beyond 1000 entries with unique patterns
    for (let i = 0; i < 1010; i++) {
      const re = cachedRegExp(`unique-pattern-${i}`, "g")
      expect(re).toBeInstanceOf(RegExp)
    }
    // Verify the cache still works correctly after eviction
    const re = cachedRegExp("unique-pattern-1009", "g")
    expect(re.source).toBe("unique-pattern-1009")
  })
})

describe("formatErrorString", () => {
  let stderrOutput: string[]
  let stderrSpy: jest.SpiedFunction<typeof process.stderr.write>

  beforeEach(() => {
    stderrOutput = []
    stderrSpy = jest.spyOn(process.stderr, "write").mockImplementation((chunk: string | Uint8Array) => {
      stderrOutput.push(String(chunk))
      return true
    })
  })

  afterEach(() => {
    stderrSpy.mockRestore()
  })

  it("returns JSON-stringified content for short strings", () => {
    const result = formatErrorString("short text", "test")
    expect(result).toBe('"short text"')
    expect(stderrOutput).toHaveLength(0)
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

    const expected2000 = "a".repeat(1500) + "b".repeat(500)
    expect(result).toContain(JSON.stringify(expected2000))
    expect(result).toContain("2500 chars total")
  })

  it("writes full content to stderr in Node.js for long strings", () => {
    const longText = "z".repeat(2001)
    formatErrorString(longText, "stderr-test")

    expect(stderrOutput).toHaveLength(1)
    expect(stderrOutput[0]).toContain("punctilio stderr-test full content")
    expect(stderrOutput[0]).toContain(longText)
  })

  it("handles strings at exactly the threshold", () => {
    const exactText = "x".repeat(2000)
    const result = formatErrorString(exactText, "exact")
    expect(result).toBe(JSON.stringify(exactText))
    expect(stderrOutput).toHaveLength(0)
  })
})
