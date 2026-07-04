import { check } from "recheck"
import { transform } from "../index.js"
import { clearRegexCache, getCachedRegExps } from "../constants.js"

/**
 * Static (ESLint) ReDoS analyzers only see regex literals, but ~90% of
 * our patterns are dynamically composed via `cachedRegExp(template)`.
 * This test runs the actual compiled patterns through `recheck` after
 * exercising every transform with every option combination, so the
 * composition-time worst case is checked even though no static tool
 * can reach it.
 */

const SAMPLES = [
  'simple "text" with quotes',
  "pages 1-5 and dashes -- here",
  "wait... 5x5 != 25 (c) 2024",
  "Add 1/2 cup at 20 C",
  "1st 2nd 3rd 4th",
  "word ?! ?? !!",
  "Mr. Smith and Dr. Jones met J. K. Rowling.",
  "\n  indented line\n   another\n",
  "\"Don't stop,\" she said—'go on'.",
  "5'10\" 10° 90% ©2024",
  "Go -> click <- back <-> forward",
  "He is 5'10\" tall and walks 5 km in 2 hrs.",
  "See pages 1, 2, and 3-5 for details.",
  "Conference January-March 1990 and Jun-Dec 2024.",
  "Sale $100-$200, items 5K-10K, p.10-15.",
  "Call 555-1234 or (555) 123-4567 for help.",
] as const

const PUNCTUATION_STYLES = ["american", "british", "german", "french", "none"] as const
const DASH_STYLES = ["american", "british", "none"] as const

describe("regex safety (runtime introspection)", () => {
  beforeAll(() => {
    clearRegexCache()
    for (const sample of SAMPLES) {
      for (const punctuationStyle of PUNCTUATION_STYLES) {
        for (const dashStyle of DASH_STYLES) {
          transform(sample, {
            punctuationStyle,
            dashStyle,
            fractions: true,
            degrees: true,
            superscript: true,
            ligatures: true,
          })
        }
      }
    }
  })

  it("every dynamically composed regex is safe under recheck", async () => {
    const regexes = getCachedRegExps()
    expect(regexes.length).toBeGreaterThan(0)

    // Run sequentially with a 60 s per-regex budget. recheck combines a
    // static automaton with a random fuzzer; under the previous 5 s budget
    // and parallel `Promise.all` execution, contention occasionally let the
    // fuzzer land on a candidate counterexample that didn't reproduce under
    // a fresh run, flipping a regex from "safe" to "vulnerable". Sequential
    // execution and a generous budget make the analysis deterministic.
    const results = []
    for (const re of regexes) {
      results.push({
        source: re.source,
        flags: re.flags,
        result: await check(re.source, re.flags, { timeout: 60_000 }),
      })
    }

    const vulnerable = results.filter((r) => r.result.status === "vulnerable")
    if (vulnerable.length > 0) {
      const details = vulnerable
        .map((v) => `  /${v.source}/${v.flags}`)
        .join("\n")
      throw new Error(
        `recheck flagged ${vulnerable.length} cached regex(es) as ReDoS-vulnerable:\n${details}`,
      )
    }
  }, 600_000)

  // recheck only analyzes individual regexes; quadratic blowup can also live
  // in the hand-written scan loops that drive sticky regexes or run readers at
  // successive offsets (an O(n) run re-read at each of O(n) offsets). These
  // inputs each took multiple seconds — up to ~44 s for "1." at 80 KB — before
  // the scanners learned to jump past a failed digit run instead of advancing
  // one character. Linear scans finish in well under a second; the generous
  // budget only guards against CI jitter, not against a quadratic regression,
  // which overshoots it by an order of magnitude.
  it.each([
    ["digit run (multiplication scanner)", "1".repeat(80_000)],
    ["dotted digits (range scanner)", "1.".repeat(40_000)],
    ["comma digits (range scanner)", "1,".repeat(40_000)],
  ])("scan loops stay linear on pathological input: %s", (_name, input) => {
    const startMs = performance.now()
    transform(input)
    expect(performance.now() - startMs).toBeLessThan(5_000)
  })
})
