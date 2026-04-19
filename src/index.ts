/**
 * punctilio - Smart typography transformations
 *
 * A library for converting plain ASCII punctuation into typographically
 * correct Unicode characters. Handles smart quotes, em-dashes, en-dashes,
 * minus signs, ellipses, multiplication signs, and more.
 *
 * @packageDocumentation
 */

export { niceQuotes, classifyApostrophes, type QuoteOptions, type PunctuationStyle } from "./quotes.js"
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
   * Default: "\uE000\uE001" (Unicode Private Use Area)
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
   * How to handle quotes and punctuation placement.
   *
   * - `"american"` (default): Chicago style. Converts straight quotes to smart
   *   quotes, converts prime marks, and places periods/commas inside quotes.
   *   Example: "Hello." and "Hello,"
   * - `"british"`: Oxford style. Converts straight quotes to smart quotes,
   *   converts prime marks, and places periods/commas outside quotes.
   *   Example: "Hello". and "Hello",
   * - `"german"`: German style. Uses low-9 quote characters: „..." and ‚...'
   *   (U+201E/U+201C double, U+201A/U+2018 single). Punctuation outside quotes.
   * - `"french"`: French style. Uses guillemets with NBSP padding: «\u00A0...\u00A0»
   *   Single quotes remain as curly quotes. Punctuation outside quotes.
   * - `"none"`: Skip all quote and punctuation transforms entirely.
   *   Straight quotes, apostrophes, and prime marks are left unmodified.
   *
   * Default: "american"
   */
  punctuationStyle?: PunctuationStyle

  /**
   * How to style dashes.
   *
   * - `"american"` (default): Chicago style. Converts parenthetical dashes to
   *   unspaced em dashes (word—word), number ranges to en dashes (1–5),
   *   date ranges to en dashes (January–March), and hyphens to minus signs (−5).
   * - `"british"`: Oxford style. Converts parenthetical dashes to spaced en
   *   dashes (word – word), with the same number range, date range, and minus
   *   sign conversions.
   * - `"none"`: Skip all dash transforms entirely. Hyphens, number ranges,
   *   date ranges, and minus signs are left unmodified.
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
   * Whether to include arrow transforms (-> → →, <- → ←, <-> → ↔).
   * Only applies when `symbols` is true.
   * Default: true
   */
  includeArrows?: boolean

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
import { DEFAULT_SEPARATOR, UNICODE_SYMBOLS } from "./constants.js"

export { assertSeparatorAbsent, assertSeparatorCountPreserved, countSeparators, transformTextNodes } from "./utils.js"
export { DEFAULT_SEPARATOR, UNICODE_SYMBOLS } from "./constants.js"
export const MODIFIER_LETTER_APOSTROPHE = UNICODE_SYMBOLS.MODIFIER_LETTER_APOSTROPHE

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
  includeArrows: true,
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

  // Validate separator: must be non-empty and contain only BMP characters.
  // for...of iterates by code point; surrogate pairs (non-BMP) yield a
  // two-UTF16-unit string, so ch.length > 1 detects them.
  if (separator.length === 0) {
    throw new Error("Invalid separator: must not be empty.")
  }
  for (const ch of separator) {
    if (ch.length > 1) {
      throw new Error(
        `Invalid separator: must contain only BMP characters (no characters outside the Basic Multilingual Plane). ` +
        `Received "${separator}" which contains a non-BMP character.`
      )
    }
  }

  const original = text
  // Filter undefined so { nbsp: undefined } uses the default, not falsy override
  const definedOptions = Object.fromEntries(
    Object.entries(options).filter(([, v]) => v !== undefined)
  ) as TransformOptions
  const { symbols, fractions, degrees, superscript, ligatures, nbsp, collapseSpaces, checkIdempotency, ...separatorOpts } = { ...defaultOpts, ...definedOptions }

  text = hyphenReplace(text, separatorOpts)
  if (separatorOpts.punctuationStyle !== "none") {
    text = primeMarks(text, separatorOpts)
  }
  text = niceQuotes(text, separatorOpts)

  if (symbols) {
    text = symbolTransform(text, separatorOpts)
  }

  if (fractions) {
    text = fractionsTransform(text, separatorOpts)
  }

  if (degrees) {
    text = degreesTransform(text, separatorOpts)
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
