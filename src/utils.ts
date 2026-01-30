/**
 * Utility functions for text transformation validation.
 *
 * @module utils
 */

import { DEFAULT_SEPARATOR } from "./constants.js"

/**
 * Counts occurrences of a separator character in a string.
 */
export function countSeparators(text: string, separator: string = DEFAULT_SEPARATOR): number {
  let count = 0
  for (const char of text) {
    if (char === separator) count++
  }
  return count
}

/**
 * Validates that a transformation preserved the separator count.
 * Throws an error if separators were added or removed.
 *
 * @param original - The original text before transformation
 * @param transformed - The text after transformation
 * @param separator - The separator character to check (default: DEFAULT_SEPARATOR)
 * @param transformName - Name of the transform for error messages (default: "transform")
 * @throws Error if separator count changed
 */
export function assertSeparatorCountPreserved(
  original: string,
  transformed: string,
  separator: string = DEFAULT_SEPARATOR,
  transformName: string = "transform"
): void {
  const originalCount = countSeparators(original, separator)
  const transformedCount = countSeparators(transformed, separator)
  if (originalCount !== transformedCount) {
    const truncate = (s: string) => s.length > 100 ? s.slice(0, 100) + "..." : s
    throw new Error(
      `${transformName} altered separator count: expected ${originalCount}, got ${transformedCount}. ` +
      `Original: "${truncate(original)}", Transformed: "${truncate(transformed)}"`
    )
  }
}
