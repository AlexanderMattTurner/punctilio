/**
 * Symbol and character transformations for common typography improvements.
 *
 * Handles ellipses, multiplication signs, mathematical symbols, and
 * common character sequences that should use proper Unicode glyphs.
 *
 * @module symbols
 */

import { UNICODE_SYMBOLS, ESCAPED_DEFAULT_SEPARATOR } from "./constants.js"

export interface SymbolOptions {
  /**
   * Boundary marker character for text spanning HTML elements.
   * Default: "\uE000" (Unicode Private Use Area)
   */
  separator?: string
  /**
   * Whether to include arrow transformations (-> to →, etc.).
   * Default: true
   */
  includeArrows?: boolean
}

/**
 * Escapes special regex characters in a string.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

const {
  ELLIPSIS,
  MULTIPLICATION,
  NOT_EQUAL,
  PLUS_MINUS,
  COPYRIGHT,
  REGISTERED,
  TRADEMARK,
  DEGREE,
  ARROW_RIGHT,
  ARROW_LEFT,
  ARROW_LEFT_RIGHT,
  APPROXIMATE,
  LESS_EQUAL,
  GREATER_EQUAL,
  PRIME,
  DOUBLE_PRIME,
  NBSP,
  SUPERSCRIPT_ST,
  SUPERSCRIPT_ND,
  SUPERSCRIPT_RD,
  SUPERSCRIPT_TH,
  DOUBLE_QUESTION,
  QUESTION_EXCLAMATION,
  EXCLAMATION_QUESTION,
  DOUBLE_EXCLAMATION,
} = UNICODE_SYMBOLS

/**
 * Converts three periods to a proper ellipsis character.
 *
 * @example
 * ```ts
 * ellipsis("Wait for it...")
 * // → "Wait for it…"
 * ```
 */
export function ellipsis(text: string, options: SymbolOptions = {}): string {
  const chr = options.separator
    ? escapeRegex(options.separator)
    : ESCAPED_DEFAULT_SEPARATOR

  // Capture groups preserve separators: .(sep1)?.(sep2)?.
  const pattern = new RegExp(`\\.(${chr})?\\.(${chr})?\\.`, "g")
  text = text.replace(pattern, (_match, sep1, sep2) => {
    // Preserve separators by appending them after the ellipsis
    return ELLIPSIS + (sep1 || "") + (sep2 || "")
  })

  text = text.replace(new RegExp(`${ELLIPSIS}(?=\\w)`, "gu"), `${ELLIPSIS} `)

  return text
}

/**
 * Converts ASCII multiplication patterns to proper multiplication sign (×).
 *
 * Handles:
 * - Dimensions: "5x5" → "5×5"
 * - Trailing multiplier: "5x" → "5×" (when followed by word boundary)
 * - Asterisk multiplication: "5*3" → "5×3" (when between numbers)
 */
export function multiplication(text: string, options: SymbolOptions = {}): string {
  const chr = options.separator
    ? escapeRegex(options.separator)
    : ESCAPED_DEFAULT_SEPARATOR

  // Dimensions with spaces: preserve spacing
  const loosePattern = new RegExp(`(?<leftNum>\\d${chr}?)\\s+[xX*]\\s+(?<rightNum>${chr}?\\d)`, "g")
  text = text.replace(loosePattern, `$<leftNum> ${MULTIPLICATION} $<rightNum>`)

  // Dimensions without spaces: keep tight
  const tightPattern = new RegExp(`(?<leftNum>\\d${chr}?)[xX*](?<rightNum>${chr}?\\d)`, "g")
  text = text.replace(tightPattern, `$<leftNum>${MULTIPLICATION}$<rightNum>`)

  // Trailing multiplier: 5x (followed by word boundary - space, punctuation, etc.)
  const trailingPattern = new RegExp(`(?<num>\\d${chr}?)[xX*]\\b`, "g")
  text = text.replace(trailingPattern, `$<num>${MULTIPLICATION}`)

  return text
}

/**
 * Converts ASCII mathematical symbols to proper Unicode equivalents.
 */
export function mathSymbols(text: string): string {
  return text
    .replace(/!=/g, NOT_EQUAL)
    .replace(/\+\/-/g, PLUS_MINUS)
    .replace(/\+-/g, PLUS_MINUS)
    .replace(/<=/g, LESS_EQUAL)
    .replace(/>=/g, GREATER_EQUAL)
    .replace(/~=/g, APPROXIMATE)
    .replace(/=~/g, APPROXIMATE)
}

/**
 * Converts ASCII representations of copyright, registered, and trademark
 * symbols to proper Unicode characters.
 */
export function legalSymbols(text: string): string {
  return text
    .replace(/\(c\)/gi, COPYRIGHT)
    .replace(/\(r\)/gi, REGISTERED)
    .replace(/\(tm\)/gi, TRADEMARK)
}

/**
 * Converts arrow character sequences to Unicode arrows.
 *
 * Handles:
 * - "->" or "-->" → "→"
 * - "<-" or "<--" → "←"
 * - "<->" or "<-->" → "↔"
 *
 * Note: Only converts when surrounded by spaces or at word boundaries
 * to avoid false matches in code or URLs.
 */
export function arrows(text: string, options: SymbolOptions = {}): string {
  const chr = options.separator
    ? escapeRegex(options.separator)
    : ESCAPED_DEFAULT_SEPARATOR

  // Bidirectional arrow first (to avoid partial matches)
  // Matches <-> or <--> with optional separator, requires boundary context
  text = text.replace(
    new RegExp(`(?<=[\\s${chr}]|^)<-{1,2}${chr}?>(?=[\\s${chr}]|$)`, "g"),
    ARROW_LEFT_RIGHT
  )

  // Right arrow: -> or --> with boundary context
  text = text.replace(
    new RegExp(`(?<=[\\s${chr}]|^)-{1,2}>(?=[\\s${chr}]|$)`, "g"),
    ARROW_RIGHT
  )

  // Left arrow: <- or <-- with boundary context
  text = text.replace(
    new RegExp(`(?<=[\\s${chr}]|^)<-{1,2}(?=[\\s${chr}]|$)`, "g"),
    ARROW_LEFT
  )

  return text
}

/**
 * Adds degree symbol in temperature contexts.
 *
 * Handles:
 * - "20 C" or "20C" → "20 °C" (Celsius)
 * - "68 F" or "68F" → "68 °F" (Fahrenheit)
 *
 * Only matches when followed by C or F (case insensitive) to avoid
 * false positives.
 */
export function degrees(text: string, options: SymbolOptions = {}): string {
  const chr = options.separator
    ? escapeRegex(options.separator)
    : ESCAPED_DEFAULT_SEPARATOR

  // Temperature with optional space before C or F
  // Handles separator between digit and unit
  return text.replace(
    new RegExp(`(?<num>\\d${chr}?) ?(?<unit>[CF])\\b`, "gi"),
    (_, num, unit) => `${num} ${DEGREE}${unit.toUpperCase()}`
  )
}

/**
 * Converts straight quotes after numbers to prime marks.
 *
 * Prime marks are used for:
 * - Feet and inches: 5'10" → 5′10″
 * - Arcminutes and arcseconds: 45° 30' 15" → 45° 30′ 15″
 *
 * This should be called BEFORE smart quote transformations to prevent
 * quotes in measurements from being curled.
 */
export function primeMarks(text: string, options: SymbolOptions = {}): string {
  const chr = options.separator
    ? escapeRegex(options.separator)
    : ESCAPED_DEFAULT_SEPARATOR

  // Single prime: Matches digit + optional separator + apostrophe
  // Lookahead ensures it's followed by: another digit, double quote, end of string, or punctuation
  // Examples: 5' (feet), 30' (arcminutes)
  const singlePrimePattern = new RegExp(
    `(?<numWithSep>\\d${chr}?)'(?=${chr}?(?:\\d|"|$|[\\s.,;:!?)]))`,
    "g"
  )
  text = text.replace(singlePrimePattern, `$<numWithSep>${PRIME}`)

  // Double prime Pattern 1: Feet-inches pattern
  // Matches: prime symbol + optional separator + digit + optional separator + double quote
  // Examples: 5′10" or 5'10" → 5′10″
  const feetInchesPattern = new RegExp(`(?<primeAndNum>${PRIME}${chr}?\\d${chr}?)"`, "g")
  text = text.replace(feetInchesPattern, `$<primeAndNum>${DOUBLE_PRIME}`)

  // Double prime Pattern 2: Standalone inches
  // Negative lookbehind: ensures no opening quote within 20 chars before the digit
  // Negative lookahead: ensures not followed by word characters
  // Matches: 12" wide ✓, but not: "Term 1" ✗
  const standaloneInchesPattern = new RegExp(
    `(?<!["\u201C]${chr}?[^"${chr}]{0,20})(?<numWithSep>\\d${chr}?)"(?!${chr}?[\\w])`,
    "g"
  )
  text = text.replace(standaloneInchesPattern, `$<numWithSep>${DOUBLE_PRIME}`)

  return text
}

/**
 * Map of ASCII fractions to Unicode fraction characters.
 * Pre-computed to avoid repeated object allocation.
 */
const FRACTION_MAP: Record<string, string> = {
  "1/4": UNICODE_SYMBOLS.FRACTION_1_4,
  "1/2": UNICODE_SYMBOLS.FRACTION_1_2,
  "3/4": UNICODE_SYMBOLS.FRACTION_3_4,
  "1/3": UNICODE_SYMBOLS.FRACTION_1_3,
  "2/3": UNICODE_SYMBOLS.FRACTION_2_3,
  "1/5": UNICODE_SYMBOLS.FRACTION_1_5,
  "2/5": UNICODE_SYMBOLS.FRACTION_2_5,
  "3/5": UNICODE_SYMBOLS.FRACTION_3_5,
  "4/5": UNICODE_SYMBOLS.FRACTION_4_5,
  "1/6": UNICODE_SYMBOLS.FRACTION_1_6,
  "5/6": UNICODE_SYMBOLS.FRACTION_5_6,
  "1/8": UNICODE_SYMBOLS.FRACTION_1_8,
  "3/8": UNICODE_SYMBOLS.FRACTION_3_8,
  "5/8": UNICODE_SYMBOLS.FRACTION_5_8,
  "7/8": UNICODE_SYMBOLS.FRACTION_7_8,
}

/**
 * Converts common fractions to Unicode fraction characters.
 *
 * Handles: 1/4, 1/2, 3/4, 1/3, 2/3, 1/5, 2/5, 3/5, 4/5,
 * 1/6, 5/6, 1/8, 3/8, 5/8, 7/8
 *
 * Only converts when the fraction is surrounded by word boundaries
 * to avoid breaking URLs, file paths, or dates.
 *
 * @example
 * ```ts
 * fractions("Add 1/2 cup of flour")
 * // → "Add ½ cup of flour"
 *
 * fractions("About 3/4 complete")
 * // → "About ¾ complete"
 * ```
 */
export function fractions(text: string, options: SymbolOptions = {}): string {
  const chr = options.separator
    ? escapeRegex(options.separator)
    : ESCAPED_DEFAULT_SEPARATOR

  for (const [ascii, unicode] of Object.entries(FRACTION_MAP)) {
    // Negative lookbehind/lookahead: ensures fraction is not part of a larger number
    // Named captures preserve separators before and after the slash
    const [numerator, denominator] = ascii.split("/")
    const pattern = new RegExp(
      `(?<!\\d)${numerator}(?<sepBefore>${chr}?)/(?<sepAfter>${chr}?)${denominator}(?!\\d)`,
      "g"
    )
    // Preserve separators around the fraction Unicode character
    text = text.replace(pattern, `$<sepBefore>${unicode}$<sepAfter>`)
  }

  return text
}

/**
 * Map of ordinal suffixes to their Unicode superscript equivalents.
 */
const ORDINAL_MAP: Record<string, string> = {
  st: SUPERSCRIPT_ST,
  nd: SUPERSCRIPT_ND,
  rd: SUPERSCRIPT_RD,
  th: SUPERSCRIPT_TH,
}

/**
 * Converts ordinal suffixes to Unicode superscript characters.
 *
 * Handles ordinal numbers like:
 * - "1st" → "1ˢᵗ"
 * - "2nd" → "2ⁿᵈ"
 * - "3rd" → "3ʳᵈ"
 * - "4th" → "4ᵗʰ"
 *
 * Works with any number ending in appropriate suffixes (21st, 42nd, 103rd, etc.)
 *
 * @example
 * ```ts
 * superscript("The 1st place winner")
 * // → "The 1ˢᵗ place winner"
 *
 * superscript("Born on the 30th of June")
 * // → "Born on the 30ᵗʰ of June"
 * ```
 */
export function superscript(text: string, options: SymbolOptions = {}): string {
  const chr = options.separator
    ? escapeRegex(options.separator)
    : ESCAPED_DEFAULT_SEPARATOR

  // Match number + optional separator + ordinal suffix at word boundary
  // Use case-insensitive matching for the suffix
  const pattern = new RegExp(
    `(?<num>\\d${chr}?)(?<suffix>st|nd|rd|th)\\b`,
    "gi"
  )

  return text.replace(pattern, (_match, num, suffix) => {
    const superscriptSuffix = ORDINAL_MAP[suffix.toLowerCase()]
    return num + superscriptSuffix
  })
}

/**
 * Collapses multiple consecutive spaces (including non-breaking spaces) into a single space.
 *
 * When multiple spaces or non-breaking spaces appear in sequence, this function
 * keeps only the first space character, preserving its type.
 *
 * @example
 * ```ts
 * collapseSpaces("hello  world")
 * // → "hello world"
 *
 * collapseSpaces("foo\u00A0\u00A0bar")  // two nbsp
 * // → "foo\u00A0bar"  // single nbsp
 *
 * collapseSpaces("a \u00A0b")  // space followed by nbsp
 * // → "a b"  // keeps the first (regular space)
 * ```
 */
export function collapseSpaces(text: string): string {
  return text.replace(new RegExp(`(?<first>[ ${NBSP}])[ ${NBSP}]+`, "g"), "$<first>")
}

/**
 * Converts repeated punctuation marks to Unicode ligature characters,
 * squashing multiple marks to a single character.
 *
 * Handles:
 * - "??" or "???" etc → "⁇" (squashed to double question mark ligature)
 * - "?!" or "?!!" etc → "⁈" (question exclamation mark)
 * - "!?" or "!??" etc → "⁉" (exclamation question mark)
 * - "!!" or "!!!" etc → "!" (squashed to single exclamation)
 *
 * Note: These ligatures have poor font support, so this function is
 * disabled by default.
 */
export function punctuationLigatures(text: string, options: SymbolOptions = {}): string {
  const chr = options.separator
    ? escapeRegex(options.separator)
    : ESCAPED_DEFAULT_SEPARATOR

  // Order matters: handle mixed punctuation first, then repeated
  // Patterns capture separators between characters and preserve them after the ligature

  // ?!+ → ⁈ (question followed by one or more exclamation marks)
  text = text.replace(
    new RegExp(`\\?(${chr})?!(?:${chr}?!)*`, "g"),
    (_match, sep) => QUESTION_EXCLAMATION + (sep || "")
  )

  // !?+ → ⁉ (exclamation followed by one or more question marks)
  text = text.replace(
    new RegExp(`!(${chr})?\\?(?:${chr}?\\?)*`, "g"),
    (_match, sep) => EXCLAMATION_QUESTION + (sep || "")
  )

  // ??+ → ⁇ (two or more question marks squashed to ligature)
  text = text.replace(
    new RegExp(`\\?(${chr})?\\?(?:${chr}?\\?)*`, "g"),
    (_match, sep) => DOUBLE_QUESTION + (sep || "")
  )

  // !!+ → ! (two or more exclamation marks squashed to single)
  text = text.replace(
    new RegExp(`!(${chr})?!(?:${chr}?!)*`, "g"),
    (_match, sep) => "!" + (sep || "")
  )

  return text
}

/**
 * Applies all symbol transformations.
 *
 * Runs in order:
 * 1. ellipsis
 * 2. multiplication
 * 3. mathSymbols
 * 4. legalSymbols
 * 5. arrows
 *
 * Note: `degrees` and `fractions` are not included by default as they
 * may be too aggressive for some use cases. Call them explicitly if needed.
 *
 * @example
 * ```ts
 * symbolTransform("Wait... 5x5 != 20 (c) 2024")
 * // → "Wait… 5×5 ≠ 20 © 2024"
 * ```
 */
export function symbolTransform(text: string, options: SymbolOptions = {}): string {
  text = ellipsis(text, options)
  text = multiplication(text, options)
  text = mathSymbols(text)
  text = legalSymbols(text)
  if (options.includeArrows !== false) {
    text = arrows(text, options)
  }
  return text
}
