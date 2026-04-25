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
 * Compares ms/char at the two largest of 4 input sizes (4x vs 8x of startingN)
 * after a JIT warmup pass. For a linear algorithm, doubling input keeps ms/char
 * constant (ratio ~1). For a quadratic one, doubling input doubles ms/char (~2).
 *
 * Default startingN of 5000 produces inputs from ~5K to ~40K chars, which is
 * past V8's string allocation overhead inflection point where ms/char stabilizes.
 *
 * Each trial measures `fn` and a known-linear baseline back-to-back at both
 * sizes, then divides `fn`'s 8x/4x ratio by the baseline's. Shared platform
 * noise (CPU contention, scheduler jitter) inflates both numerator and
 * denominator and cancels out; only `fn`-specific super-linear growth pushes
 * the normalized ratio past 1. Min across trials picks the cleanest sample.
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

  // Warmup both with the largest input so JIT compiles all code paths.
  fn(input8x)
  linearBaseline(input8x)

  const minTrials = 5
  const minElapsedMs = 50
  let bestRatio = Infinity
  let totalElapsed = 0
  let trials = 0
  while (trials < minTrials || totalElapsed < minElapsedMs) {
    const startFn4 = performance.now()
    fn(input4x)
    const fnTime4 = performance.now() - startFn4

    const startBase4 = performance.now()
    linearBaseline(input4x)
    const baseTime4 = performance.now() - startBase4

    const startFn8 = performance.now()
    fn(input8x)
    const fnTime8 = performance.now() - startFn8

    const startBase8 = performance.now()
    linearBaseline(input8x)
    const baseTime8 = performance.now() - startBase8

    const fnRatio = (fnTime8 / input8x.length) / (fnTime4 / input4x.length)
    const baseRatio = (baseTime8 / input8x.length) / (baseTime4 / input4x.length)
    const ratio = fnRatio / baseRatio
    bestRatio = Math.min(bestRatio, ratio)
    totalElapsed += fnTime4 + fnTime8 + baseTime4 + baseTime8
    trials++
  }

  // After baseline-normalization: linear ≈ 1, quadratic ≈ 2.
  expect(bestRatio).toBeLessThan(1.5)
}
