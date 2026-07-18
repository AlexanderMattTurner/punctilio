import { jest } from "@jest/globals"
import { assertKnownOptionKeys, formatErrorString, omitKeys, stableStringify } from "../utils.js"
import { cachedRegExp, clearRegexCache, getCachedRegExps, MAX_REGEX_CACHE_SIZE } from "../constants.js"

describe("cachedRegExp", () => {
  afterEach(() => {
    clearRegexCache()
  })

  it("evicts the oldest entries once the cache is full", () => {
    // Fill past the point where the LRU has purged its oldest generation. The
    // backing QuickLRU retains up to 2×maxSize before a purge, so overshoot that.
    const total = 2 * MAX_REGEX_CACHE_SIZE + 50
    for (let i = 0; i < total; i++) {
      expect(cachedRegExp(`unique-pattern-${i}`, "g")).toBeInstanceOf(RegExp)
    }

    const cached = getCachedRegExps()
    const sources = new Set(cached.map((re) => re.source))
    // The cache stays bounded, the earliest patterns are gone, and the most
    // recent one is retained — the behavior a size cap is supposed to give.
    expect(cached.length).toBeLessThanOrEqual(2 * MAX_REGEX_CACHE_SIZE)
    expect(sources.has("unique-pattern-0")).toBe(false)
    expect(sources.has(`unique-pattern-${total - 1}`)).toBe(true)
  })
})

describe("formatErrorString", () => {
  let stderrOutput: string[]

  // Replaces process.env so PUNCTILIO_DEBUG has exactly the given value
  // (removed when undefined); jest.restoreAllMocks undoes the replacement.
  function setDebugEnv(value: string | undefined): void {
    const env = { ...process.env }
    delete env.PUNCTILIO_DEBUG
    if (value !== undefined) env.PUNCTILIO_DEBUG = value
    jest.replaceProperty(process, "env", env)
  }

  beforeEach(() => {
    stderrOutput = []
    setDebugEnv(undefined)
    jest.spyOn(process.stderr, "write").mockImplementation((chunk: string | Uint8Array) => {
      stderrOutput.push(String(chunk))
      return true
    })
  })

  afterEach(() => {
    jest.restoreAllMocks()
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

  it("writes full content to stderr for long strings when PUNCTILIO_DEBUG is set", () => {
    setDebugEnv("1")
    const longText = "z".repeat(2001)
    formatErrorString(longText, "stderr-test")

    expect(stderrOutput).toHaveLength(1)
    expect(stderrOutput[0]).toContain("punctilio stderr-test full content")
    expect(stderrOutput[0]).toContain(longText)
  })

  it.each([
    ["unset", undefined],
    ["set to an empty string", ""],
  ])("skips the stderr dump for long strings when PUNCTILIO_DEBUG is %s", (_desc, value) => {
    setDebugEnv(value)
    const longText = "z".repeat(2001)
    const result = formatErrorString(longText, "quiet-test")

    expect(result).toContain("2001 chars total")
    expect(stderrOutput).toHaveLength(0)
  })

  it("handles strings at exactly the threshold", () => {
    const exactText = "x".repeat(2000)
    const result = formatErrorString(exactText, "exact")
    expect(result).toBe(JSON.stringify(exactText))
    expect(stderrOutput).toHaveLength(0)
  })
})

describe("stableStringify", () => {
  it("sorts object keys alphabetically", () => {
    expect(stableStringify({ b: 1, a: 2 })).toBe(stableStringify({ a: 2, b: 1 }))
  })

  it("filters out undefined values", () => {
    expect(stableStringify({ a: 1, b: undefined })).toBe(stableStringify({ a: 1 }))
  })

  it("sorts array values for order-independent cache keys", () => {
    expect(stableStringify({ tags: ["pre", "code"] })).toBe(stableStringify({ tags: ["code", "pre"] }))
  })

  it("does not mutate the original array", () => {
    const opts = { tags: ["pre", "code", "a"] }
    stableStringify(opts)
    expect(opts.tags).toEqual(["pre", "code", "a"])
  })
})

describe("assertKnownOptionKeys", () => {
  it.each([
    ["empty options", {}],
    ["all valid keys", { alpha: 1, beta: 2 }],
  ])("does not throw: %s", (_desc, options) => {
    expect(() => assertKnownOptionKeys(options, ["alpha", "beta"], "testFn")).not.toThrow()
  })

  it("throws naming the unknown key, context, and sorted valid keys", () => {
    expect(() => assertKnownOptionKeys({ alpha: 1, gamma: 2 }, ["beta", "alpha"], "testFn"))
      .toThrow('Unknown option "gamma" for testFn. Valid options: alpha, beta.')
  })
})

describe("omitKeys", () => {
  it("removes listed keys and keeps the rest", () => {
    expect(omitKeys({ a: 1, b: 2, c: 3 }, ["b"])).toEqual({ a: 1, c: 3 })
  })

  it("returns an equal copy when no keys match", () => {
    const original = { a: 1 }
    const result = omitKeys(original, ["z"])
    expect(result).toEqual(original)
    expect(result).not.toBe(original)
  })
})
