/**
 * Shared test utilities for punctilio test suites.
 */

import seedrandom from "seedrandom"

/**
 * Fragments covering every transform type: quotes, dashes, apostrophes,
 * ellipses, multiplication, math symbols, legal symbols, arrows, primes,
 * fractions, degrees, ordinals, nbsp-triggering short words, and plain text.
 */
const FRAGMENTS = [
  `"Hello," she said. `,
  `It's a beautiful day -- isn't it? `,
  `Wait... `,
  `The temperature was 20 C. `,
  `5x5 != 25. `,
  `Add 1/2 cup. `,
  `He's 5'10" tall. `,
  `(c) 2024 Acme Corp. `,
  `See p. 42 for details. `,
  `Dr. Smith arrived. `,
  `The 1st place winner. `,
  `Go -> click -> done. `,
  `Really?! No way!! `,
  `A B C D E F G H. `,
  `Pages 10-20 contain important info. `,
  `January-March was cold. `,
  `The value is -5. `,
  `"Don't stop," he said, "keep going." `,
  `J. K. Rowling wrote it. `,
  `100 km in 2 hrs. `,
]

/**
 * Builds a deterministic pseudo-random string of approximately `charCount`
 * characters by randomly sampling from FRAGMENTS using a seeded PRNG.
 *
 * @param charCount - Approximate desired character count
 * @param seed - PRNG seed (default: "42")
 */
export function buildMixedContent(charCount: number, seed: string = "42"): string {
  const random = seedrandom(seed)
  let result = ""
  while (result.length < charCount) {
    const index = Math.floor(random() * FRAGMENTS.length)
    result += FRAGMENTS[index]
  }
  return result
}

/**
 * Provably linear baseline: a single regex pass that touches every char and
 * exercises the same V8 String.replace path the production transforms use.
 * Its ms/char ratio is the platform's "what linear looks like right now"
 * fingerprint — we divide fn's ratio by it to cancel shared CPU/GC noise.
 */
const linearBaseline = (s: string): string => s.replace(/[a-z]/gi, "x")

/**
 * Asserts that a function scales linearly (not quadratically) with input size.
 *
 * Uses three input sizes (2x, 4x, 8x of startingN) and fits an OLS regression
 * of `log(time/char)` vs `log(size)`. For O(n) the slope is ~0 (constant
 * ms/char). For O(n²) the slope is ~1 (ms/char grows linearly with n).
 * Three points make the fit robust to a single noisy measurement at any size.
 *
 * Each trial interleaves fn and baseline measurements at all sizes in a single
 * tight loop, so GC pauses and scheduler jitter affect both equally. The fn's
 * slope is normalized by the baseline's slope, cancelling platform-wide drift.
 * The median across trials is used (resistant to outliers unlike min/max).
 *
 * @param fn - The function to benchmark
 * @param buildInput - Builds an input string of approximately `n` units
 * @param startingN - Size parameter for the smallest input (default: 5000)
 */
export function assertLinearScaling(
  fn: (input: string) => unknown,
  buildInput: (n: number) => string,
  startingN: number = 5000
): void {
  const multipliers = [2, 4, 8]
  const inputs = multipliers.map((m) => buildInput(startingN * m))
  const sizes = inputs.map((s) => s.length)
  const logSizes = sizes.map(Math.log)

  // Warmup with the largest input so JIT compiles all code paths.
  fn(inputs[2])
  linearBaseline(inputs[2])

  const minBatchMs = 8
  function timedBatch(f: (s: string) => unknown, input: string): number {
    let iterations = 0
    const start = performance.now()
    let elapsed = 0
    while (elapsed < minBatchMs) {
      f(input)
      iterations++
      elapsed = performance.now() - start
    }
    return elapsed / iterations
  }

  // OLS slope of y vs x (both arrays of the same length).
  function slope(x: number[], y: number[]): number {
    const n = x.length
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0
    for (let i = 0; i < n; i++) {
      sumX += x[i]
      sumY += y[i]
      sumXY += x[i] * y[i]
      sumXX += x[i] * x[i]
    }
    return (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX)
  }

  const minTrials = 10
  const minElapsedMs = 500
  const ratios: number[] = []
  let totalElapsed = 0

  while (ratios.length < minTrials || totalElapsed < minElapsedMs) {
    const fnTimes: number[] = []
    const baseTimes: number[] = []

    // Interleave fn and baseline at each size so GC/scheduler noise
    // hits both measurements in the same thermal/load context.
    for (let i = 0; i < inputs.length; i++) {
      const ft = timedBatch(fn, inputs[i])
      const bt = timedBatch(linearBaseline, inputs[i])
      fnTimes.push(ft)
      baseTimes.push(bt)
      totalElapsed += ft + bt
    }

    const fnLogRates = fnTimes.map((t, i) => Math.log(t / sizes[i]))
    const baseLogRates = baseTimes.map((t, i) => Math.log(t / sizes[i]))

    const fnSlope = slope(logSizes, fnLogRates)
    const baseSlope = slope(logSizes, baseLogRates)
    ratios.push(fnSlope - baseSlope)
  }

  // Median is resistant to outliers (unlike min which rewards lucky noise).
  ratios.sort((a, b) => a - b)
  const median = ratios[Math.floor(ratios.length / 2)]

  // Linear: slope ≈ 0 (normalized). Quadratic: slope ≈ 1.
  // Threshold 0.5 sits comfortably between the two.
  expect(median).toBeLessThan(0.5)
}
