/**
 * Symbol transformations: ellipses, multiplication, math symbols, arrows.
 */

import { UNICODE_SYMBOLS, ESCAPED_DEFAULT_SEPARATOR, wordBoundaryEnd } from "./constants.js"

export interface SymbolOptions {
  /** Boundary marker for HTML element boundaries. Default: "\uE000" */
  separator?: string
  /** Include arrow transforms (-> → →). Default: true */
  includeArrows?: boolean
}

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
  EXCLAMATION_QUESTION
} = UNICODE_SYMBOLS

/** Convert "..." to "…". */
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

/** Convert "5x5" to "5×5". Skips hex (0x5F). */
export function multiplication(text: string, options: SymbolOptions = {}): string {
  const chr = options.separator
    ? escapeRegex(options.separator)
    : ESCAPED_DEFAULT_SEPARATOR

  // Dimensions with spaces: preserve spacing
  const loosePattern = new RegExp(`(?<leftNum>\\d${chr}?)\\s+[xX*]\\s+(?<rightNum>${chr}?\\d)`, "g")
  text = text.replace(loosePattern, `$<leftNum> ${MULTIPLICATION} $<rightNum>`)

  // Dimensions without spaces: keep tight
  // Use callback to skip hexadecimal patterns like "0x5F"
  const tightPattern = new RegExp(`(?<leftNum>\\d+${chr}?)(?<op>[xX*])(?<rightNum>${chr}?\\d)`, "g")
  text = text.replace(tightPattern, (match, leftNum, op, rightNum) => {
    // Skip if this looks like a hexadecimal: single 0 followed by x/X
    if (leftNum === "0" && (op === "x" || op === "X")) {
      return match // Don't convert hex literals
    }
    return `${leftNum}${MULTIPLICATION}${rightNum}`
  })

  // Trailing multiplier: 5x (followed by word boundary - space, punctuation, etc.)
  // Uses marker-aware boundary to avoid false matches like "5x\uE000tra"
  const wbe = wordBoundaryEnd(chr)
  const trailingPattern = new RegExp(`(?<num>\\d+${chr}?)(?<op>[xX*])${wbe}`, "g")
  text = text.replace(trailingPattern, (match, num, op) => {
    // Skip if this looks like start of hexadecimal
    if (num === "0" && (op === "x" || op === "X")) {
      return match
    }
    return `${num}${MULTIPLICATION}`
  })

  return text
}

/** Convert !=, <=, >=, +/-, ~= to Unicode equivalents. */
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

/** Convert (c), (r), (tm) to ©, ®, ™. */
export function legalSymbols(text: string): string {
  return text
    .replace(/\(c\)/gi, COPYRIGHT)
    .replace(/\(r\)/gi, REGISTERED)
    .replace(/\(tm\)/gi, TRADEMARK)
}

/** Convert ->, <-, <-> to arrows. Skips HTML comments (-->). */
export function arrows(text: string, options: SymbolOptions = {}): string {
  const chr = options.separator
    ? escapeRegex(options.separator)
    : ESCAPED_DEFAULT_SEPARATOR

  // Bidirectional arrow: <-> (single dash only to avoid HTML comment issues)
  // Matches <-> with optional separator, requires boundary context
  text = text.replace(
    new RegExp(`(?<=[\\s${chr}]|^)<-${chr}?>(?=[\\s${chr}]|$)`, "g"),
    ARROW_LEFT_RIGHT
  )

  // Right arrow: -> (single dash only to avoid matching --> in HTML comments)
  text = text.replace(
    new RegExp(`(?<=[\\s${chr}]|^)->(?=[\\s${chr}]|$)`, "g"),
    ARROW_RIGHT
  )

  // Left arrow: <- (single dash only)
  text = text.replace(
    new RegExp(`(?<=[\\s${chr}]|^)<-(?=[\\s${chr}]|$)`, "g"),
    ARROW_LEFT
  )

  return text
}

/** Convert "20C" to "20 °C". */
export function degrees(text: string, options: SymbolOptions = {}): string {
  const chr = options.separator
    ? escapeRegex(options.separator)
    : ESCAPED_DEFAULT_SEPARATOR

  // Temperature with optional space before C or F
  // Handles separator between digit and unit
  // Uses marker-aware boundary to avoid false matches like "20C\uE000elsius"
  const wbe = wordBoundaryEnd(chr)
  return text.replace(
    new RegExp(`(?<num>\\d${chr}?) ?(?<unit>[CF])${wbe}`, "gi"),
    (_, num, unit) => `${num} ${DEGREE}${unit.toUpperCase()}`
  )
}

/** Convert 5'10" to 5′10″ (prime marks). Call before smart quotes. */
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

/** Convert 1/2, 1/4, etc. to ½, ¼, etc. */
export function fractions(text: string, options: SymbolOptions = {}): string {
  const chr = options.separator
    ? escapeRegex(options.separator)
    : ESCAPED_DEFAULT_SEPARATOR

  for (const [ascii, unicode] of Object.entries(FRACTION_MAP)) {
    // Negative lookbehind/lookahead: ensures fraction is not part of a larger number or path
    // - (?<![/.\d]) prevents matching after slashes, dots, or digits
    // - (?![/\d]|\.\d) prevents matching before slashes, digits, or decimal points
    // Named captures preserve separators before and after the slash
    const [numerator, denominator] = ascii.split("/")
    const pattern = new RegExp(
      `(?<![/\\.\\d])${numerator}(?<sepBefore>${chr}?)/(?<sepAfter>${chr}?)${denominator}(?![/\\d]|\\.\\d)`,
      "g"
    )
    // Preserve separators around the fraction Unicode character
    text = text.replace(pattern, `$<sepBefore>${unicode}$<sepAfter>`)
  }

  return text
}

const ORDINAL_MAP: Record<string, string> = {
  st: SUPERSCRIPT_ST,
  nd: SUPERSCRIPT_ND,
  rd: SUPERSCRIPT_RD,
  th: SUPERSCRIPT_TH,
}

/** Convert 1st, 2nd, 3rd, 4th to superscript ordinals. */
export function superscript(text: string, options: SymbolOptions = {}): string {
  const chr = options.separator
    ? escapeRegex(options.separator)
    : ESCAPED_DEFAULT_SEPARATOR

  // Match number + optional separator + ordinal suffix at word boundary
  // Use case-insensitive matching for the suffix
  // Uses marker-aware boundary to avoid false matches like "1st\uE000ly"
  const wbe = wordBoundaryEnd(chr)
  const pattern = new RegExp(
    `(?<num>\\d${chr}?)(?<suffix>st|nd|rd|th)${wbe}`,
    "gi"
  )

  return text.replace(pattern, (_match, num, suffix) => {
    const superscriptSuffix = ORDINAL_MAP[suffix.toLowerCase()]
    return num + superscriptSuffix
  })
}

/** Collapse multiple spaces to single space. */
export function collapseSpaces(text: string): string {
  return text.replace(new RegExp(`(?<first>[ ${NBSP}])[ ${NBSP}]+`, "g"), "$<first>")
}

/** Convert ?? to ⁇, ?! to ⁈, !? to ⁉. Poor font support, disabled by default. */
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

/** Apply all symbol transforms. degrees/fractions excluded (too aggressive). */
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
