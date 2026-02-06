/**
 * Utility functions for text transformation validation.
 *
 * @module utils
 */

import { DEFAULT_SEPARATOR } from "./constants.js"

/** Threshold above which strings are truncated in error messages. */
const ERROR_STRING_THRESHOLD = 2000

/**
 * Formats a string for error messages. If the string exceeds the threshold,
 * truncates it and shows the total length.
 *
 * In Node.js environments, also writes the full content to stderr
 * so it's available in build logs for debugging.
 */
export function formatErrorString(content: string, label: string): string {
  if (content.length <= ERROR_STRING_THRESHOLD) {
    return JSON.stringify(content)
  }

  // In Node.js, write full content to stderr for debugging
  try {
    if (typeof globalThis.process?.stderr?.write === "function") {
      globalThis.process.stderr.write(
        `\n[punctilio ${label} full content (${content.length} chars)]:\n${content}\n\n`
      )
    }
  } catch {
    // Ignore — not in Node.js or stderr unavailable
  }

  const truncated = content.slice(0, ERROR_STRING_THRESHOLD)
  return `[${label}: ${JSON.stringify(truncated)}... (${content.length} chars total)]`
}

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
    throw new Error(
      `${transformName} altered separator count: expected ${originalCount}, got ${transformedCount}.\n` +
      `This is a bug in punctilio. Please file an issue at https://github.com/alexander-turner/punctilio/issues\n` +
      `Include the input text that caused this error.`
    )
  }
}
