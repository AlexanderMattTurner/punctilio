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
  numberRangeDisallowedPrefixes,
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
  superscriptOrdinal,
  punctuationLigatures,
  symbolTransform,
  type SymbolOptions,
} from "./symbols.js"
export {
  nbspAfterShortWords,
  nbspBetweenNumberAndUnit,
  nbspBeforeLastWord,
  nbspAfterReferenceAbbreviations,
  nbspAfterSectionSymbols,
  nbspAfterHonorifics,
  nbspAfterCopyrightSymbols,
  nbspBetweenInitials,
  nbspTransform,
  UNITS,
  HONORIFICS,
  REFERENCE_ABBREVIATIONS,
  type NbspOptions,
} from "./nbsp.js"

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
   * - `"american"` (default): Chicago style. Periods and commas go inside quotes.
   *   Example: "Hello." and "Hello,"
   * - `"british"`: Oxford style. Periods and commas go outside quotes.
   *   Example: "Hello". and "Hello",
   * - `"none"`: Don't modify punctuation placement
   *
   * Default: "american"
   */
  punctuationStyle?: PunctuationStyle

  /**
   * How to style parenthetical dashes.
   *
   * - `"american"` (default): Chicago style. Unspaced em dash (word—word)
   * - `"british"`: Oxford style. Spaced en dash (word – word)
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

  /**
   * Whether to convert ordinal suffixes to Unicode superscript characters.
   * Transforms numbers like "1st", "2nd", "3rd", "4th" to "1ˢᵗ", "2ⁿᵈ", "3ʳᵈ", "4ᵗʰ".
   * Default: false
   */
  superscript?: boolean

  /**
   * Whether to convert repeated punctuation marks to Unicode ligature characters.
   * Squashes multiple marks: "???" → "⁇", "?!" → "⁈", "!?" → "⁉", "!!!" → "!"
   * Default: false (poor font support)
   */
  ligatures?: boolean

  /**
   * Whether to insert non-breaking spaces in typographically appropriate
   * locations (after short words, between numbers and units, before
   * last words to prevent widows, after honorifics, etc.).
   * Default: true
   */
  nbsp?: boolean

  /**
   * Whether to verify that the transformation is idempotent (running twice
   * produces the same result). When enabled, throws an error if the second
   * pass produces a different result than the first.
   *
   * Default: true
   */
  checkIdempotency?: boolean
}

import { niceQuotes } from "./quotes.js"
import { hyphenReplace } from "./dashes.js"
import { symbolTransform, fractions as fractionsTransform, degrees as degreesTransform, superscriptOrdinal as superscriptTransform, primeMarks, collapseSpaces as collapseSpacesTransform, punctuationLigatures as ligaturesTransform } from "./symbols.js"
import { nbspTransform as nbspTransformFn } from "./nbsp.js"
import { assertSeparatorCountPreserved, formatErrorString } from "./utils.js"
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
 * 5. fractions (disabled by default)
 * 6. degrees (disabled by default)
 * 7. superscript (disabled by default)
 * 8. ligatures (disabled by default)
 * 9. collapseSpaces (collapses multiple spaces into one)
 * 10. nbsp (non-breaking spaces, enabled by default)
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
const defaultOpts: Required<Omit<TransformOptions, "separator">> = {
  symbols: true,
  fractions: false,
  degrees: false,
  superscript: false,
  ligatures: false,
  nbsp: true,
  collapseSpaces: true,
  checkIdempotency: true,
  punctuationStyle: "american",
  dashStyle: "american",
}

export function transform(text: string, options: TransformOptions = {}): string {
  const separator = options.separator ?? DEFAULT_SEPARATOR

  // Validate separator: must be a single UTF-16 code unit (BMP character)
  // Multi-codepoint characters (surrogate pairs like emoji) cause issues with regex patterns
  if (separator.length !== 1) {
    throw new Error(
      `Invalid separator: must be a single character. ` +
      `Received "${separator}" (length: ${separator.length}). ` +
      `Use a single-codepoint character like the default "\\uE000".`
    )
  }

  const original = text
  const { symbols, fractions, degrees, superscript, ligatures, nbsp, collapseSpaces, checkIdempotency, ...separatorOpts } = { ...defaultOpts, ...options }

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

  if (superscript) {
    text = superscriptTransform(text, separatorOpts)
  }

  if (ligatures) {
    text = ligaturesTransform(text, separatorOpts)
  }

  if (collapseSpaces) {
    text = collapseSpacesTransform(text)
  }

  if (nbsp) {
    text = nbspTransformFn(text, separatorOpts)
  }

  assertSeparatorCountPreserved(original, text, separator, "transform")

  if (checkIdempotency) {
    const secondPass = transform(text, { ...options, checkIdempotency: false })
    /* istanbul ignore if -- defensive check that should never trigger */
    if (text !== secondPass) {
      throw new Error(
        `Transform is not idempotent.\n` +
        `First pass:  ${formatErrorString(text, "first-pass")}\n` +
        `Second pass: ${formatErrorString(secondPass, "second-pass")}\n` +
        `This is a bug in punctilio. Please file an issue at https://github.com/alexander-turner/punctilio/issues\n` +
        `Include the input text that caused this error.`
      )
    }
  }

  return text
}
