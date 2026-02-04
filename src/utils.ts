/**
 * Utility functions for text transformation validation.
 *
 * @module utils
 */

import { writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { DEFAULT_SEPARATOR } from "./constants.js"

/** Threshold above which strings are written to temp files in error messages. */
const ERROR_STRING_THRESHOLD = 500

/**
 * Formats a string for error messages. If the string exceeds the threshold,
 * writes it to a temp file and returns a reference to the file path.
 */
export function formatErrorString(content: string, label: string): string {
  if (content.length <= ERROR_STRING_THRESHOLD) {
    return JSON.stringify(content)
  }

  const timestamp = Date.now()
  const filename = `punctilio-error-${label}-${timestamp}.txt`
  const filepath = join(tmpdir(), filename)
  writeFileSync(filepath, content, "utf-8")
  return `[written to ${filepath}]`
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
