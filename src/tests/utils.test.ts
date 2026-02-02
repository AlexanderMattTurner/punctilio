import { existsSync, readFileSync, unlinkSync } from "node:fs"
import { tmpdir } from "node:os"

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

  it("writes to temp file for strings over 500 chars", () => {
    const longText = "x".repeat(501)
    const result = formatErrorString(longText, "long-test")

    expect(result).toMatch(/^\[written to .+punctilio-error-long-test-\d+\.txt\]$/)

    // Extract filepath and verify file contents
    const match = result.match(/\[written to (?<path>.+)\]/)
    const filepath = match?.groups?.path ?? ""
    expect(filepath).not.toBe("")
    expect(existsSync(filepath)).toBe(true)
    expect(readFileSync(filepath, "utf-8")).toBe(longText)

    // Cleanup
    unlinkSync(filepath)
  })

  it("writes to temp directory", () => {
    const longText = "y".repeat(600)
    const result = formatErrorString(longText, "tmpdir")

    const match = result.match(/\[written to (?<path>.+)\]/)
    const filepath = match?.groups?.path ?? ""
    expect(filepath).not.toBe("")
    expect(filepath.startsWith(tmpdir())).toBe(true)

    unlinkSync(filepath)
  })
})
