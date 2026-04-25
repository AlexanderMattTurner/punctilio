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
 * Compares ms/char at the two largest of 4 input sizes (4x vs 8x of startingN)
 * after a JIT warmup pass. For a linear algorithm, doubling input keeps ms/char
 * constant (ratio ~1). For a quadratic one, doubling input doubles ms/char (~2).
 *
 * Default startingN of 5000 produces inputs from ~5K to ~40K chars, which is
 * past V8's string allocation overhead inflection point where ms/char stabilizes.
 *
 * Interleaves 4x and 8x measurements so both experience the same CPU load at
 * each moment, then takes the minimum per-trial ratio. This is immune to both
 * transient noise (GC pauses) and persistent noise (CPU contention from other
 * CI jobs), since the ratio within each trial cancels out shared slowdowns.
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
  const input4x = buildInput(startingN * 4)
  const input8x = buildInput(startingN * 8)

  // Warmup with the largest input so JIT compiles all code paths before timing.
  fn(input8x)

  const minTrials = 5
  const minElapsedMs = 50
  let bestRatio = Infinity
  let totalElapsed = 0
  let trials = 0
  while (trials < minTrials || totalElapsed < minElapsedMs) {
    const start4 = performance.now()
    fn(input4x)
    const time4 = performance.now() - start4

    const start8 = performance.now()
    fn(input8x)
    const time8 = performance.now() - start8

    const ratio = (time8 / input8x.length) / (time4 / input4x.length)
    bestRatio = Math.min(bestRatio, ratio)
    totalElapsed += time4 + time8
    trials++
  }

  // For linear: ratio ≈ 1. For quadratic: ≈ 2.
  expect(bestRatio).toBeLessThan(1.5)
}
