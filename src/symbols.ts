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
  NBSP,
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

/** Convert "..." or ". . ." to "…". */
export function ellipsis(text: string, options: SymbolOptions = {}): string {
  const chr = options.separator
    ? escapeStringRegexp(options.separator)
    : ESCAPED_DEFAULT_SEPARATOR

  // Convert consecutive or spaced dots: ... or . . . → …
  // Captures preserve any separators between dots
  const pattern = new RegExp(`\\.[${SPACE_CHARS}]?(${chr})?\\.([${SPACE_CHARS}]?)(${chr})?\\.`, "g")
  text = text.replace(pattern, (_match, sep1, _space, sep2) => {
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

  // Match entire multiplication chains in one pass: "5 x 5 x 5" or "5x5x5"
  // Pattern matches: digit(s), then one or more (operator, digit(s)) groups
  const chainPattern = new RegExp(
    `(?<!\\d)(\\d+)((?:${chr}?\\s*[xX*]\\s*${chr}?\\d+)+)`,
    "g"
  )

  text = text.replace(chainPattern, (match, firstNum, rest) => {
    // Skip hexadecimal: 0x... or 0X...
    if (firstNum === "0" && /^x/i.test(rest)) return match

    // Replace all operators in the chain, preserving spacing
    const converted = rest.replace(
      new RegExp(`(${chr}?)(\\s*)[xX*](\\s*)(${chr}?)`, "g"),
      (_: string, pre: string, spaceBefore: string, spaceAfter: string, post: string) => {
        const space = spaceBefore || spaceAfter ? " " : ""
        return `${pre}${space}${MULTIPLICATION}${space}${post}`
      }
    )
    return `${firstNum}${converted}`
  })

  // Trailing multiplier: 5x (followed by word boundary - space, punctuation, etc.)
  const wbe = wordBoundaryEnd(chr)
  const trailingPattern = new RegExp(`(?<!\\d)(?<num>\\d+${chr}?)[xX*]${wbe}`, "g")
  text = text.replace(trailingPattern, (match, num: string) => {
    // Skip if this looks like start of hexadecimal
    if (num === "0") return match
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

  // Convert quotes to primes by scanning left-to-right and tracking quote balance.
  // Contractions (letter + quote + letter, e.g. it's, O'Brien) are skipped entirely.
  // A prime candidate (digit + quote + non-letter) converts only when no unmatched opening
  // quote precedes it; otherwise it's treated as a closing quote.
  // Examples: 5' → 5′ ✓, 10' x 12' → 10′ x 12′ ✓, don't measure 8' → 8′ ✓, 'Term 1' ✗
  const quotePrimePairs = [
    ["'", PRIME],
    ['"', DOUBLE_PRIME],
  ]

  for (const [quote, prime] of quotePrimePairs) {
    const eq = escapeStringRegexp(quote)
    // Alternatives matched in priority order (first match wins):
    const primeCandidate = `(?<digit>\\d)(?<sep>${chr}?)${eq}(?<afterSep>${chr}?)(?![${LATIN_LETTERS}])`
    const contraction = `(?<=[${LATIN_LETTERS}])(?<contraction>${eq})(?=[${LATIN_LETTERS}])`
    const trailing = `(?<=[${L}])(?<trailing>${eq})`
    const bareQuote = eq
    const combinedPattern = new RegExp(
      `${primeCandidate}|${contraction}|${trailing}|${bareQuote}`,
      "g"
    )
    let balance = 0
    text = text.replace(combinedPattern, (...args) => {
      const fullMatch = args[0] as string
      const groups = args[args.length - 1] as Record<string, string | undefined>
      if (groups.contraction !== undefined) {
        return fullMatch
      }
      if (groups.trailing !== undefined) {
        // Trailing apostrophe (e.g., dogs'): close if there's an opener, otherwise skip
        if (balance > 0) balance--
        return fullMatch
      }
      const { digit, sep, afterSep } = groups
      if (digit !== undefined) {
        // Prime candidate: convert only if no unmatched opening quote
        if (balance <= 0) {
          return `${digit}${sep}${prime}${afterSep}`
        }
        balance--
        return fullMatch
      }
      // Bare quote (preceded by space/start): opener or closer
      if (balance <= 0) {
        balance = 1
      } else {
        balance--
      }
      return fullMatch
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
  return text.replace(new RegExp(`[${SPACE_CHARS}]{2,}`, "g"), (match) => {
    // If any nbsp is present, prefer nbsp (more likely to be intentional)
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
