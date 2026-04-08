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

const MIN_INPUT_LENGTH = 10_000

/**
 * Asserts that a function scales linearly (not quadratically) with input size.
 *
 * Measures ms/char at two sizes (1x, 2x) after a JIT warmup pass, using the
 * minimum time across iterations (immune to GC pauses). For a linear algorithm,
 * doubling input keeps ms/char constant (ratio ~1). For a quadratic one,
 * doubling input doubles ms/char (ratio ~2).
 *
 * Requires the 1x input to be at least {@link MIN_INPUT_LENGTH} chars to
 * avoid noise from small-input overhead.
 *
 * @param fn - The function to benchmark
 * @param buildInput - Builds an input string of approximately `n` units
 * @param startingN - Size parameter for the smaller input (default: 40000)
 */
export function assertLinearScaling(
  fn: (input: string) => unknown,
  buildInput: (n: number) => string,
  startingN: number = 40_000
): void {
  const input1x = buildInput(startingN)
  const input2x = buildInput(startingN * 2)

  if (input1x.length < MIN_INPUT_LENGTH) {
    throw new Error(
      `1x input is only ${input1x.length} chars (minimum: ${MIN_INPUT_LENGTH}). ` +
      `Increase startingN or use a buildInput that produces longer strings.`
    )
  }

  // Warmup with the larger input so JIT compiles all code paths before timing.
  fn(input2x)

  function measureMinMsPerChar(input: string): number {
    const minIterations = 5
    const minElapsedMs = 50
    let best = Infinity
    let totalElapsed = 0
    let iterations = 0
    while (iterations < minIterations || totalElapsed < minElapsedMs) {
      const start = performance.now()
      fn(input)
      const elapsed = performance.now() - start
      best = Math.min(best, elapsed)
      totalElapsed += elapsed
      iterations++
    }
    return best / input.length
  }

  const rate1x = measureMinMsPerChar(input1x)
  const rate2x = measureMinMsPerChar(input2x)

  // For linear: rate2x / rate1x ≈ 1. For quadratic: ≈ 2.
  expect(rate2x / rate1x).toBeLessThan(1.5)
}
