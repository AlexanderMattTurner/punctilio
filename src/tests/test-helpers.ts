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
 * Asserts that a function scales linearly (not quadratically) with input size.
 *
 * Measures ms/char at 4 input sizes (1x, 2x, 4x, 8x) after a JIT warmup pass.
 * Compares the two largest sizes (4x vs 8x) which have the best signal-to-noise
 * ratio. For a linear algorithm, doubling input keeps ms/char constant (ratio ~1).
 * For a quadratic one, doubling input doubles ms/char (ratio ~2).
 *
 * Default startingN of 5000 produces inputs from ~5K to ~40K chars, which is
 * past V8's string allocation overhead inflection point where ms/char stabilizes.
 *
 * Uses the median of at least 5 runs (min 20ms total) per size. The median is
 * robust to GC pauses and scheduling noise that inflate individual runs, making
 * the ratio stable in noisy CI environments.
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
  const multipliers = [1, 2, 4, 8]

  // Warmup with the largest input so JIT compiles all code paths before timing.
  fn(buildInput(startingN * multipliers[multipliers.length - 1]))

  function measureMsPerChar(mult: number): number {
    const input = buildInput(startingN * mult)
    const minIterations = 5
    const minElapsedMs = 20
    const times: number[] = []
    let totalElapsed = 0
    while (times.length < minIterations || totalElapsed < minElapsedMs) {
      const start = performance.now()
      fn(input)
      const elapsed = performance.now() - start
      times.push(elapsed)
      totalElapsed += elapsed
    }
    times.sort((a, b) => a - b)
    const median = times[Math.floor(times.length / 2)]
    return median / input.length
  }

  // Measure all sizes (exercises the function at various scales)
  const msPerChar = multipliers.map(measureMsPerChar)

  // Compare the two largest inputs (best SNR, per-call overhead is negligible).
  // For linear: rate_8x / rate_4x ≈ 1. For quadratic: ≈ 2.
  const rate4x = msPerChar[2]
  const rate8x = msPerChar[3]
  expect(rate8x / rate4x).toBeLessThan(1.5)
}
