/**
 * punctilio - Smart typography transformations
 *
 * A library for converting plain ASCII punctuation into typographically
 * correct Unicode characters. Handles smart quotes, em-dashes, en-dashes,
 * minus signs, ellipses, multiplication signs, and more.
 *
 * @packageDocumentation
 */

export { niceQuotes, type QuoteOptions, type PunctuationStyle } from "./quotes.js"
import type { PunctuationStyle } from "./quotes.js"
export {
  hyphenReplace,
  enDashNumberRange,
  enDashDateRange,
  minusReplace,
  months,
  type DashOptions,
  type DashStyle,
} from "./dashes.js"
import type { DashStyle } from "./dashes.js"
export {
  ellipsis,
  multiplication,
  mathSymbols,
  legalSymbols,
  arrows,
  degrees,
  fractions,
  primeMarks,
  collapseSpaces,
  symbolTransform,
  type SymbolOptions,
} from "./symbols.js"

export interface TransformOptions {
  /**
   * A boundary marker character used when transforming text that spans
   * multiple HTML elements. This character is treated as "transparent"
   * in the regex patterns.
   *
   * Should be a character that doesn't appear in your text.
   * Default: "\uE000" (Unicode Private Use Area)
   */
  separator?: string

  /**
   * Whether to include symbol transforms (ellipsis, multiplication, etc.)
   * Default: true
   */
  symbols?: boolean

  /**
   * Whether to collapse multiple consecutive spaces (including non-breaking
   * spaces) into a single space. Keeps the first space in the sequence.
   *
   * - `true` (default): "hello  world" → "hello world"
   * - `false`: Preserve multiple spaces
   *
   * Default: true
   */
  collapseSpaces?: boolean

  /**
   * How to handle punctuation placement around quotation marks.
   *
   * - `"american"` (default): Periods and commas go inside quotes
   *   Example: "Hello." and "Hello,"
   * - `"british"`: Periods and commas go outside quotes
   *   Example: "Hello". and "Hello",
   * - `"none"`: Don't modify punctuation placement
   *
   * Default: "american"
   */
  punctuationStyle?: PunctuationStyle

  /**
   * How to style parenthetical dashes.
   *
   * - `"american"` (default): Unspaced em dash (word—word)
   * - `"british"`: Spaced en dash (word – word)
   * - `"none"`: Don't convert parenthetical dashes
   *
   * Default: "american"
   */
  dashStyle?: DashStyle

  /**
   * Whether to include fraction transforms (1/2 → ½)
   * Default: false (can be aggressive)
   */
  fractions?: boolean

  /**
   * Whether to include degree symbol transforms (20 C → 20 °C)
   * Default: false (can be aggressive)
   */
  degrees?: boolean
}

import { niceQuotes } from "./quotes.js"
import { hyphenReplace } from "./dashes.js"
import { symbolTransform, fractions as fractionsTransform, degrees as degreesTransform, primeMarks, collapseSpaces as collapseSpacesTransform } from "./symbols.js"
import { assertSeparatorCountPreserved } from "./utils.js"
import { DEFAULT_SEPARATOR } from "./constants.js"

export { assertSeparatorCountPreserved, countSeparators } from "./utils.js"
export { DEFAULT_SEPARATOR } from "./constants.js"

/**
 * Applies all typography transformations: smart quotes, proper dashes,
 * and symbol improvements.
 *
 * This is a convenience function that applies transformations in sequence:
 * 1. hyphenReplace (em-dashes, en-dashes, minus signs)
 * 2. primeMarks (feet/inches, arcminutes/arcseconds)
 * 3. niceQuotes (smart quotes)
 * 4. symbolTransform (ellipses, multiplication, math symbols, legal symbols, arrows)
 * 5. collapseSpaces (collapses multiple spaces into one)
 * 6. fractions (disabled by default)
 * 7. degrees (disabled by default)
 *
 * @param text - The text to transform
 * @param options - Configuration options
 * @returns The text with all typography improvements applied
 *
 * @example
 * ```ts
 * import { transform } from 'punctilio'
 *
 * transform('"Hello," she said - "it\'s pages 1-5."')
 * // → '"Hello," she said—"it's pages 1–5."'
 *
 * transform('Wait... 5x5 != 25 (c) 2024')
 * // → 'Wait… 5×5 ≠ 25 © 2024'
 *
 * transform('Add 1/2 cup', { fractions: true })
 * // → 'Add ½ cup'
 * ```
 */
export function transform(text: string, options: TransformOptions = {}): string {
  const separator = options.separator ?? DEFAULT_SEPARATOR
  const original = text
  const { symbols = true, fractions = false, degrees = false, collapseSpaces = true, ...separatorOpts } = options

  text = hyphenReplace(text, separatorOpts)
  text = primeMarks(text, separatorOpts)
  text = niceQuotes(text, separatorOpts)

  if (symbols) {
    text = symbolTransform(text, separatorOpts)
  }

  if (fractions) {
    text = fractionsTransform(text)
  }

  if (degrees) {
    text = degreesTransform(text)
  }

  if (collapseSpaces) {
    text = collapseSpacesTransform(text)
  }

  assertSeparatorCountPreserved(original, text, separator, "transform")

  return text
}
