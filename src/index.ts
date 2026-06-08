export { DEFAULT_SEPARATOR, UNICODE_SYMBOLS } from "./constants.js"
import { DASH_STYLES, type DashStyle } from "./dashes.js"
import { PUNCTUATION_STYLES, type PunctuationStyle } from "./quotes.js"
export {
  DASH_STYLES,
  type DashOptions,
  type DashStyle,
  dashWordJoiner,
  enDashDateRange,
  enDashNumberRange,
  hyphenReplace,
  minusReplace,
  numberRangeDisallowedPrefixes,
} from "./dashes.js"
export {
  HONORIFICS,
  nbspAfterCopyrightSymbols,
  nbspAfterHonorifics,
  nbspAfterReferenceAbbreviations,
  nbspAfterSectionSymbols,
  nbspAfterShortWords,
  nbspBeforeLastWord,
  nbspBetweenInitials,
  nbspBetweenNumberAndUnit,
  type NbspOptions,
  nbspTransform,
  REFERENCE_ABBREVIATIONS,
  UNITS,
} from "./nbsp.js"
export { classifyApostrophes, niceQuotes, PUNCTUATION_STYLES, type PunctuationStyle, type QuoteOptions } from "./quotes.js"

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
   * Runs at the start of a line (after `\n` or start-of-string) are preserved
   * so indented blocks (e.g. HN-style code) survive.
   *
   * - `true` (default): "hello  world" → "hello world"; "  indented" → "  indented"
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
   * - `"french"`: French style. Uses guillemets with NNBSP padding: «\u202F...\u202F»
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
   * pass produces a different result than the first. The check doubles the
   * cost of every transform and only detects punctilio's own bugs, so it is
   * off by default; enable it in test suites or when debugging.
   *
   * Default: false
   */
  checkIdempotency?: boolean

}

import { niceQuotes } from "./quotes.js"
import { hyphenReplace } from "./dashes.js"
import { collapseSpaces as collapseSpacesTransform, degrees as degreesTransform, ellipsis as ellipsisTransform, fractions as fractionsTransform, punctuationLigatures as ligaturesTransform, primeMarks, superscriptOrdinal as superscriptTransform, symbolTransform } from "./symbols.js"
import { nbspTransform as nbspTransformFn } from "./nbsp.js"
import { assertKnownOptionKeys, assertSeparatorCountPreserved, filterUndefined, formatErrorString } from "./utils.js"
import { DEFAULT_SEPARATOR, ISSUES_URL, UNICODE_SYMBOLS } from "./constants.js"

export {
  arrows,
  collapseSpaces,
  degrees,
  ellipsis,
  fractions,
  legalSymbols,
  mathSymbols,
  multiplication,
  primeMarks,
  punctuationLigatures,
  superscriptOrdinal,
  type SymbolOptions,
  symbolTransform,
} from "./symbols.js"
export { assertSeparatorAbsent, assertSeparatorCountPreserved, countSeparators, transformTextNodes } from "./utils.js"
export const MODIFIER_LETTER_APOSTROPHE = UNICODE_SYMBOLS.MODIFIER_LETTER_APOSTROPHE

const defaultOpts: Required<Omit<TransformOptions, "separator">> = {
  symbols: true,
  includeArrows: true,
  fractions: false,
  degrees: false,
  superscript: false,
  ligatures: false,
  nbsp: true,
  collapseSpaces: true,
  checkIdempotency: false,
  punctuationStyle: "american",
  dashStyle: "american",
}

/** Runtime list of valid `transform()` option keys, derived from the option
 * defaults so it cannot drift from {@link TransformOptions}. */
export const TRANSFORM_OPTION_KEYS: readonly string[] = [
  ...Object.keys(defaultOpts),
  "separator",
]

export function transform(text: string, options: TransformOptions = {}): string {
  assertKnownOptionKeys(options, TRANSFORM_OPTION_KEYS, "transform")

  const separator = options.separator ?? DEFAULT_SEPARATOR

  if (separator.length === 0) {
    throw new Error("Invalid separator: must not be empty.")
  }
  // Non-BMP characters are encoded in UTF-16 as surrogate pairs in the range
  // U+D800–U+DFFF. A surrogate code unit (paired or lone) means the separator
  // would survive some regexes as a single char and split others as two units.
  if (/[\uD800-\uDFFF]/.test(separator)) {
    throw new Error(
      `Invalid separator: must contain only BMP characters (no characters outside the Basic Multilingual Plane). ` +
      `Received "${separator}" which contains a non-BMP character.`
    )
  }

  const punctuationStyle = options.punctuationStyle ?? "american"
  if (!PUNCTUATION_STYLES.includes(punctuationStyle as typeof PUNCTUATION_STYLES[number])) {
    throw new Error(
      `Invalid punctuationStyle: "${punctuationStyle}". ` +
      `Must be one of: ${PUNCTUATION_STYLES.join(", ")}.`
    )
  }

  const dashStyle = options.dashStyle ?? "american"
  if (!DASH_STYLES.includes(dashStyle as typeof DASH_STYLES[number])) {
    throw new Error(
      `Invalid dashStyle: "${dashStyle}". ` +
      `Must be one of: ${DASH_STYLES.join(", ")}.`
    )
  }

  const original = text
  const { symbols, fractions, degrees, superscript, ligatures, nbsp, collapseSpaces, checkIdempotency, ...pipelineOpts } = { ...defaultOpts, ...filterUndefined(options) }

  // Collapse whitespace before the whitespace-sensitive dash and symbol passes.
  // Those passes recognize dashes by their surrounding spaces (`[ ]+`), so a tab
  // mixed into a space run (e.g. "word \t- word") would block conversion on the
  // first pass; collapsing it to a single space afterwards would then let a
  // second pass convert the dash, breaking idempotency. Normalizing first means
  // every pass sees the same spacing.
  if (collapseSpaces) {
    text = collapseSpacesTransform(text)
  }

  // Fold ellipses before range detection so that "...1-5" gains its post-ellipsis
  // space ("… 1-5") before enDashNumberRange runs. Otherwise the first pass sees a
  // range blocked by the leading dot and the second pass sees it preceded by a
  // space and en-dashes it, breaking idempotency. ellipsis is idempotent, so the
  // later symbolTransform call repeats it harmlessly.
  if (symbols) {
    text = ellipsisTransform(text, pipelineOpts)
  }

  text = hyphenReplace(text, pipelineOpts)
  if (pipelineOpts.punctuationStyle !== "none") {
    text = primeMarks(text, pipelineOpts)
  }
  text = niceQuotes(text, pipelineOpts)

  // Fractions run before symbolTransform so that "1/2(tm)" → "½(tm)" before
  // legalSymbols inspects it. Otherwise the unconverted "/" looks like a path
  // segment and suppresses the (tm) → ™ conversion on the first pass, while the
  // second pass (no "/") converts it, breaking idempotency.
  if (fractions) {
    text = fractionsTransform(text, pipelineOpts)
  }

  if (symbols) {
    text = symbolTransform(text, pipelineOpts)
  }

  if (degrees) {
    text = degreesTransform(text, pipelineOpts)
  }

  if (superscript) {
    text = superscriptTransform(text, pipelineOpts)
  }

  if (ligatures) {
    text = ligaturesTransform(text, pipelineOpts)
  }

  // Collapse again after the quote passes: localized styles (French guillemets,
  // German low-9 quotes) pad with narrow/no-break spaces that can land next to
  // an existing space, forming a run the up-front collapse never saw.
  if (collapseSpaces) {
    text = collapseSpacesTransform(text)
  }

  if (nbsp) {
    text = nbspTransformFn(text, pipelineOpts)
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
        `This is a bug in punctilio. Please file an issue at ${ISSUES_URL}\n` +
        `Include the input text that caused this error.\n` +
        `To suppress this check, pass { checkIdempotency: false }.`
      )
    }
  }

  return text
}
