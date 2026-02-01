/**
 * Symbol transformations: ellipses, multiplication, math symbols, arrows.
 */

import escapeStringRegexp from "escape-string-regexp"
import { UNICODE_SYMBOLS, ESCAPED_DEFAULT_SEPARATOR, LATIN_LETTERS, wordBoundaryEnd, SPACE_CHARS, spaceBoundaryStart, spaceBoundaryEnd } from "./constants.js"

export interface SymbolOptions {
  /** Boundary marker for HTML element boundaries. Default: "\uE000" */
  separator?: string
  /** Include arrow transforms (-> → →). Default: true */
  includeArrows?: boolean
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
  SUPERSCRIPT_ST,
  SUPERSCRIPT_ND,
  SUPERSCRIPT_RD,
  SUPERSCRIPT_TH,
  DOUBLE_QUESTION,
  QUESTION_EXCLAMATION,
  EXCLAMATION_QUESTION,
} = UNICODE_SYMBOLS

/** Convert "..." to "…". */
export function ellipsis(text: string, options: SymbolOptions = {}): string {
  const chr = options.separator
    ? escapeStringRegexp(options.separator)
    : ESCAPED_DEFAULT_SEPARATOR

  // Capture groups preserve separators: .(sep1)?.(sep2)?.
  const pattern = new RegExp(`\\.(${chr})?\\.(${chr})?\\.`, "g")
  text = text.replace(pattern, (_match, sep1, sep2) => {
    // Preserve separators by appending them after the ellipsis
    return ELLIPSIS + (sep1 || "") + (sep2 || "")
  })

  text = text.replace(new RegExp(`${ELLIPSIS}(?=[${LATIN_LETTERS}\\d])`, "gu"), `${ELLIPSIS} `)

  return text
}

/** Convert "5x5" to "5×5". Skips hex (0x5F). */
export function multiplication(text: string, options: SymbolOptions = {}): string {
  const chr = options.separator
    ? escapeStringRegexp(options.separator)
    : ESCAPED_DEFAULT_SEPARATOR

  // Dimensions with spaces: preserve spacing
  const leftNumPattern = `(?<leftNum>\\d+${chr}?)`
  const rightNumPattern = `(?<rightNum>${chr}?\\d)`
  const loosePattern = new RegExp(`${leftNumPattern}\\s+[xX*]\\s+${rightNumPattern}`, "g")
  text = text.replace(loosePattern, `$<leftNum> ${MULTIPLICATION} $<rightNum>`)

  // Dimensions without spaces: keep tight
  // Use callback to skip hexadecimal patterns like "0x5F"
  const tightPattern = new RegExp(`${leftNumPattern}(?<op>[xX*])${rightNumPattern}`, "g")
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
  const trailingPattern = new RegExp(`${leftNumPattern}(?<op>[xX*])${wbe}`, "g")
  text = text.replace(trailingPattern, (match, num, op) => {
    // Skip if this looks like start of hexadecimal
    if (num === "0" && (op === "x" || op === "X")) {
      return match
    }
    return `${num}${MULTIPLICATION}`
  })

  return text
}

/** Math symbol replacement map: ASCII → Unicode */
const MATH_SYMBOL_MAP: [RegExp, string][] = [
  [/!=/g, NOT_EQUAL],
  [/\+\/-/g, PLUS_MINUS],
  [/\+-/g, PLUS_MINUS],
  [/<=/g, LESS_EQUAL],
  [/>=/g, GREATER_EQUAL],
  [/~=/g, APPROXIMATE],
  [/=~/g, APPROXIMATE],
]

/** Convert !=, <=, >=, +/-, ~= to Unicode equivalents. */
export function mathSymbols(text: string): string {
  for (const [pattern, replacement] of MATH_SYMBOL_MAP) {
    text = text.replace(pattern, replacement)
  }
  return text
}

/** Legal symbol replacement map: ASCII → Unicode */
const LEGAL_SYMBOL_MAP: [RegExp, string][] = [
  [/\(c\)/gi, COPYRIGHT],
  [/\(r\)/gi, REGISTERED],
  [/\(tm\)/gi, TRADEMARK],
]

/** Convert (c), (r), (tm) to ©, ®, ™. */
export function legalSymbols(text: string): string {
  for (const [pattern, replacement] of LEGAL_SYMBOL_MAP) {
    text = text.replace(pattern, replacement)
  }
  return text
}

/** Arrow pattern map: arrow shape → Unicode symbol */
const ARROW_MAP: [string, string][] = [
  [`<-+${"%CHR%"}?>`, ARROW_LEFT_RIGHT], // Bidirectional: <-> or <-->
  ["-+>", ARROW_RIGHT],                   // Right: -> or -->
  ["<-+", ARROW_LEFT],                    // Left: <- or <--
]

/** Convert -> and <-> to arrows. */
export function arrows(text: string, options: SymbolOptions = {}): string {
  const chr = options.separator
    ? escapeStringRegexp(options.separator)
    : ESCAPED_DEFAULT_SEPARATOR

  const start = spaceBoundaryStart(chr)
  const end = spaceBoundaryEnd(chr)

  for (const [arrowPattern, replacement] of ARROW_MAP) {
    const pattern = new RegExp(`${start}${arrowPattern.replace("%CHR%", chr)}${end}`, "g")
    text = text.replace(pattern, replacement)
  }

  return text
}

/** Convert "20 C" or "20 F" to "20 °C" or "20 °F". Only matches uppercase C/F. */
export function degrees(text: string, options: SymbolOptions = {}): string {
  const chr = options.separator
    ? escapeStringRegexp(options.separator)
    : ESCAPED_DEFAULT_SEPARATOR

  // Temperature with optional space before C or F (uppercase only)
  // Handles separator between digit and unit
  // Uses marker-aware boundary to avoid false matches like "20C\uE000elsius"
  const wbe = wordBoundaryEnd(chr)
  return text.replace(
    new RegExp(`(?<num>\\d${chr}?) ?(?<unit>[CF])${wbe}`, "g"),
    (_, num, unit) => `${num} ${DEGREE}${unit}`
  )
}

/** Convert 5'10" to 5′10″ (prime marks). Call before smart quotes. */
export function primeMarks(text: string, options: SymbolOptions = {}): string {
  const chr = options.separator
    ? escapeStringRegexp(options.separator)
    : ESCAPED_DEFAULT_SEPARATOR

  // Convert quotes to primes using quote balancing
  // Only convert if quotes are balanced (even count before) to avoid converting closing quotes
  // Examples: 5' → 5′ ✓, 12" → 12″ ✓, 'Term 1' → 'Term 1' ✓, "Term 1" → "Term 1" ✓
  const quotePrimePairs = [
    ["'", PRIME],
    ['"', DOUBLE_PRIME],
  ]

  for (const [quote, prime] of quotePrimePairs) {
    const pattern = new RegExp(
      `(?<digit>\\d)(?<sep>${chr}?)${quote}(?<afterSep>${chr}?)(?![${LATIN_LETTERS}])`,
      "g"
    )
    text = text.replace(pattern, (match, digit, sep, afterSep, offset) => {
      const textBefore = text.slice(0, offset)
      const quoteCount = (textBefore.match(new RegExp(quote, "g")) || []).length
      if (quoteCount % 2 === 0) {
        return `${digit}${sep}${prime}${afterSep}`
      }
      return match
    })
  }

  // Feet-inches pattern: convert " after ′ + digit (e.g., 5′10" → 5′10″)
  const feetInchesPattern = new RegExp(`(?<primeAndNum>${PRIME}${chr}?\\d${chr}?)"`, "g")
  text = text.replace(feetInchesPattern, `$<primeAndNum>${DOUBLE_PRIME}`)

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
    ? escapeStringRegexp(options.separator)
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
export function superscriptOrdinal(text: string, options: SymbolOptions = {}): string {
  const chr = options.separator
    ? escapeStringRegexp(options.separator)
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

/** Collapse multiple spaces to single space. Prefers nbsp if any nbsp is present. */
export function collapseSpaces(text: string): string {
  const { NBSP } = UNICODE_SYMBOLS
  // Match 2+ consecutive space characters (space or nbsp)
  return text.replace(new RegExp(`[${SPACE_CHARS}]{2,}`, "g"), (match) => {
    // If any nbsp is present, prefer nbsp (more likely intentional)
    return match.includes(NBSP) ? NBSP : " "
  })
}

/**
 * Punctuation ligature map: [first char, repeated char, replacement]
 * Pattern: first(sep)?repeated(?:sep?repeated)* → replacement
 * Order matters: handle mixed punctuation first, then repeated
 */
const PUNCTUATION_LIGATURE_MAP: [string, string, string][] = [
  ["\\?", "!", QUESTION_EXCLAMATION],  // ?!+ → ⁈
  ["!", "\\?", EXCLAMATION_QUESTION],  // !?+ → ⁉
  ["\\?", "\\?", DOUBLE_QUESTION],     // ??+ → ⁇
  ["!", "!", "!"],                      // !!+ → ! (normalize)
]

/** Convert ?? to ⁇, ?! to ⁈, !? to ⁉. Poor font support, disabled by default. */
export function punctuationLigatures(text: string, options: SymbolOptions = {}): string {
  const chr = options.separator
    ? escapeStringRegexp(options.separator)
    : ESCAPED_DEFAULT_SEPARATOR

  for (const [first, repeated, replacement] of PUNCTUATION_LIGATURE_MAP) {
    const pattern = new RegExp(`${first}(${chr})?${repeated}(?:${chr}?${repeated})*`, "g")
    text = text.replace(pattern, (_match, sep) => replacement + (sep || ""))
  }

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
