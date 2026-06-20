/**
 * Shared test utilities for punctilio test suites.
 */

import seedrandom from "seedrandom"

import { buildProseView, type ProseNode, type ProseView } from "../prose-view.js"

/** Marker used in tests to write multi-node view fixtures as one string. */
export const SEP = "\uE000\uE001"

/**
 * Runs a view pass over the multi-node view described by `markedInput`
 * (node boundaries written as `marker`) and returns the per-node values
 * re-joined with `marker`, so expectations use the same notation.
 */
export function viewTransform(
  run: (view: ProseView) => void,
  markedInput: string,
  marker: string = SEP,
): string {
  const nodes: ProseNode[] = markedInput.split(marker).map((value) => ({ value }))
  const view = buildProseView(nodes)
  run(view)
  return nodes.map((node) => node.value).join(marker)
}

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
