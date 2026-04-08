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
 * Asserts that a function scales reasonably (not quadratically) with input size.
 *
 * Runs the function on a large input after a JIT warmup pass and asserts it
 * completes within a generous time budget. Linear algorithms handle large
 * inputs in milliseconds; quadratic (or worse) algorithms blow the budget.
 *
 * This approach avoids the fragility of ratio-based comparisons, which are
 * sensitive to V8 string representation thresholds and CPU cache effects.
 *
 * Requires the input to be at least {@link MIN_INPUT_LENGTH} chars to
 * avoid trivially passing with tiny inputs.
 *
 * @param fn - The function to benchmark
 * @param buildInput - Builds an input string of approximately `n` units
 * @param startingN - Size parameter for the input (default: 100000)
 */
export function assertReasonableScaling(
  fn: (input: string) => unknown,
  buildInput: (n: number) => string,
  startingN: number = 100_000
): void {
  const input = buildInput(startingN)

  if (input.length < MIN_INPUT_LENGTH) {
    throw new Error(
      `Input is only ${input.length} chars (minimum: ${MIN_INPUT_LENGTH}). ` +
      `Increase startingN or use a buildInput that produces longer strings.`
    )
  }

  // Warmup so JIT compiles all code paths before timing.
  fn(input)

  const start = performance.now()
  fn(input)
  const elapsed = performance.now() - start

  // Linear algorithms process large inputs well under 5 seconds.
  // Quadratic (or worse) algorithms blow this budget at these sizes.
  expect(elapsed).toBeLessThan(5000)
}
