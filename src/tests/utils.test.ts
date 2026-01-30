import { countSeparators, assertSeparatorCountPreserved } from "../utils.js"
import { DEFAULT_SEPARATOR } from "../constants.js"

const S = DEFAULT_SEPARATOR

describe("countSeparators", () => {
  it.each([
    ["empty string", "", S, 0],
    ["no separators", "hello world", S, 0],
    ["single separator", `a${S}b`, S, 1],
    ["multiple separators", `${S}a${S}b${S}`, S, 3],
    ["consecutive separators", `${S}${S}${S}`, S, 3],
    ["custom separator", "a|b|c", "|", 2],
  ])("%s: counts correctly", (_desc, input, separator, expected) => {
    expect(countSeparators(input, separator)).toBe(expected)
  })

  it.each([
    [`a${S}b`, 1],
    ["no separators", 0],
    [`${S}${S}`, 2],
  ])("uses DEFAULT_SEPARATOR when omitted: %s -> %i", (input, expected) => {
    expect(countSeparators(input)).toBe(expected)
  })
})

describe("assertSeparatorCountPreserved", () => {
  describe("does not throw when count preserved", () => {
    it.each([
      ["same count", `a${S}b`, `x${S}y`],
      ["zero count", "ab", "xy"],
      ["multiple preserved", `${S}a${S}b${S}`, `${S}x${S}y${S}`],
    ])("%s", (_desc, original, transformed) => {
      expect(() => assertSeparatorCountPreserved(original, transformed, S, "test")).not.toThrow()
    })
  })

  describe("throws when count changes", () => {
    it.each([
      ["separator removed", `a${S}b`, "ab", 1, 0],
      ["separator added", "ab", `a${S}b`, 0, 1],
      ["multiple removed", `${S}${S}`, "", 2, 0],
    ])("%s: expected %i, got %i", (_desc, original, transformed, expectedCount, actualCount) => {
      expect(() => assertSeparatorCountPreserved(original, transformed, S, "testFn"))
        .toThrow(`testFn altered separator count: expected ${expectedCount}, got ${actualCount}`)
    })
  })

  describe("default parameters", () => {
    it("uses DEFAULT_SEPARATOR when separator omitted", () => {
      expect(() => assertSeparatorCountPreserved(`a${S}b`, "ab")).toThrow()
      expect(() => assertSeparatorCountPreserved(`a${S}b`, `x${S}y`)).not.toThrow()
    })

    it('uses "transform" as default name', () => {
      expect(() => assertSeparatorCountPreserved(`a${S}b`, "ab"))
        .toThrow(/^transform altered/)
    })
  })

  describe("error message formatting", () => {
    it("includes original and transformed text", () => {
      expect(() => assertSeparatorCountPreserved(`hello${S}world`, "helloworld", S, "test"))
        .toThrow(/Original:.*hello.*Transformed:.*helloworld/)
    })

    it("truncates strings longer than 100 characters", () => {
      const long = "x".repeat(150)
      expect(() => assertSeparatorCountPreserved(`${S}${long}`, long, S, "test"))
        .toThrow(/\.\.\./)
    })

    it("does not truncate strings under 100 characters", () => {
      const short = "x".repeat(50)
      expect(() => assertSeparatorCountPreserved(`${S}${short}`, short, S, "test"))
        .not.toThrow(/\.\.\./)
    })
  })
})
