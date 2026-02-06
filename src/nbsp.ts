/**
 * Non-breaking space transformations for improved typography.
 *
 * Inserts non-breaking spaces (U+00A0) in positions where line breaks
 * would be typographically undesirable: after short words, between
 * numbers and units, before orphaned last words, etc.
 *
 * Based on richtypo patterns and the implementation in TurnTrout.com PR #472.
 *
 * @module nbsp
 */

import escapeStringRegexp from "escape-string-regexp"

import { UNICODE_SYMBOLS, ESCAPED_DEFAULT_SEPARATOR } from "./constants.js"
import type { SymbolOptions } from "./symbols.js"

const { NBSP } = UNICODE_SYMBOLS

// Re-export SymbolOptions under an nbsp-specific alias for consumers
// who want to type their nbsp function arguments. This avoids a duplicate
// interface while keeping the public API expressive.
export type NbspOptions = Pick<SymbolOptions, "separator">

/**
 * Get the escaped separator string from options, falling back to the default.
 */
function sep(options: NbspOptions): string {
  return options.separator
    ? escapeStringRegexp(options.separator)
    : ESCAPED_DEFAULT_SEPARATOR
}

/** Space pattern matching regular space, tab, and nbsp. */
const SPACE = `[ \\t${NBSP}]`

/** Unicode uppercase letter class (matches A-Z and accented capitals). */
const UNICODE_UPPERCASE = "\\p{Lu}"

/**
 * Common units for the number-unit nbsp pattern. Organized by category.
 * Only matches these specific unit abbreviations after a number to avoid
 * false positives like "chapter 3 above".
 */
const UNITS = [
  // Length
  "km", "m", "cm", "mm", "mi", "ft", "in", "yd", "nm", "pm",
  // Mass
  "kg", "g", "mg", "lb", "lbs", "oz", "t",
  // Volume
  "l", "L", "ml", "mL", "gal", "fl",
  // Time
  "s", "ms", "min", "h", "hr", "hrs",
  // Speed / frequency
  "Hz", "kHz", "MHz", "GHz", "THz", "rpm",
  // Digital
  "KB", "MB", "GB", "TB", "PB", "kB", "Mb", "Gb", "kbps", "Mbps", "Gbps",
  // Energy / power
  "W", "kW", "MW", "GW", "J", "kJ", "MJ", "Wh", "kWh", "MWh",
  // Temperature
  "K",
  // Electrical
  "V", "kV", "mV", "A", "mA",
  // Pressure / area
  "Pa", "kPa", "MPa", "bar", "psi", "ha",
  // Typography / CSS
  "px", "pt", "em", "rem", "vw", "vh", "dpi",
  // Misc
  "dB", "cal", "kcal", "mol",
]

/**
 * Adds non-breaking space after short words (1-2 letters) to prevent them from
 * being left alone at the end of a line.
 *
 * Matches words like: a, I, an, to, of, in, on, is, it, or, if, as, at, by, we, so, no, up, he, my, us
 *
 * @param text - The text to transform
 * @param options - Options including separator character
 * @returns Text with nbsp after short words
 */
export function nbspAfterShortWords(text: string, options: NbspOptions = {}): string {
  const chr = sep(options)
  // Punctuation and quote chars that can precede a short word.
  // No unnecessary escapes inside character class (u flag is strict).
  const punctuationOrQuote = "[.,!?:;)(\u201C\u201D\u00AB\u00BB\u2018\u2019\"]"
  const pattern = new RegExp(
    `(?<=^|${SPACE}|${punctuationOrQuote}|>)(?<shortWord>[a-zA-Z]{1,2})(?<marker>${chr}?)${SPACE}`,
    "gmu"
  )
  return text.replace(pattern, `$<shortWord>$<marker>${NBSP}`)
}

/**
 * Adds non-breaking space between numbers and common units to prevent awkward
 * line breaks.
 *
 * Uses an explicit unit list to avoid false positives on digit-space-word
 * sequences that aren't number-unit pairs (e.g., "chapter 3 above").
 *
 * @example "100 km" → "100\u00A0km", "5 kg" → "5\u00A0kg"
 *
 * @param text - The text to transform
 * @param options - Options including separator character
 * @returns Text with nbsp between numbers and units
 */
export function nbspBetweenNumberAndUnit(text: string, options: NbspOptions = {}): string {
  const chr = sep(options)
  const unitPattern = UNITS.join("|")
  const pattern = new RegExp(
    `(?<digit>\\d)(?<marker1>${chr}?)${SPACE}(?<marker2>${chr}?)(?<unit>${unitPattern})\\b`,
    "gm"
  )
  return text.replace(pattern, `$<digit>$<marker1>${NBSP}$<marker2>$<unit>`)
}

/**
 * Adds non-breaking space before the last word to prevent orphaned words (widows)
 * at the end of paragraphs.
 *
 * Only applies to short final words (1-10 characters) to avoid affecting long words.
 * Only matches at end of string or double newline (paragraph break), not at every line ending.
 *
 * @param text - The text to transform
 * @param options - Options including separator character
 * @returns Text with nbsp before last word
 */
export function nbspBeforeLastWord(text: string, options: NbspOptions = {}): string {
  const chr = sep(options)
  // Use non-multiline mode so $ only matches at true end of string.
  // Require the space to be preceded by a word character (not just whitespace).
  // Exclude separator from word match to avoid including it as part of the word.
  const pattern = new RegExp(
    `(?<=[\\w${chr}])${SPACE}(?<lastWord>[^\\s${chr}]{1,10})(?<ending>${chr}?(?:\\n\\n|$))`,
    "g"
  )
  return text.replace(pattern, `${NBSP}$<lastWord>$<ending>`)
}

/**
 * Adds non-breaking space after reference abbreviations to keep them with their numbers.
 *
 * @example "Fig. 1" → "Fig.\u00A01", "p. 42" → "p.\u00A042", "Vol. 2" → "Vol.\u00A02"
 *
 * Covers: Fig., Figs., Vol., No., Nos., p., pp., Ch., Chap., Sec., Eq., Eqs., Art., Tab., Ex.
 *
 * @param text - The text to transform
 * @param options - Options including separator character
 * @returns Text with nbsp after reference abbreviations
 */
export function nbspAfterReferenceAbbreviations(text: string, options: NbspOptions = {}): string {
  const chr = sep(options)
  const abbreviations = [
    "Fig\\.",
    "Figs\\.",
    "Vol\\.",
    "No\\.",
    "Nos\\.",
    "p\\.",
    "pp\\.",
    "Ch\\.",
    "Chap\\.",
    "Sec\\.",
    "Eq\\.",
    "Eqs\\.",
    "Art\\.",
    "Tab\\.",
    "Ex\\.",
  ]
  const pattern = new RegExp(
    `(?<abbrev>${abbreviations.join("|")})(?<marker>${chr}?)${SPACE}(?=${chr}?\\d)`,
    "g"
  )
  return text.replace(pattern, `$<abbrev>$<marker>${NBSP}`)
}

/**
 * Adds non-breaking space after section (§) and paragraph (¶) symbols.
 *
 * @example "§ 5" → "§\u00A05", "¶ 3" → "¶\u00A03"
 *
 * @param text - The text to transform
 * @param options - Options including separator character
 * @returns Text with nbsp after section symbols
 */
export function nbspAfterSectionSymbols(text: string, options: NbspOptions = {}): string {
  const chr = sep(options)
  const pattern = new RegExp(
    `(?<symbol>[§¶])(?<marker>${chr}?)${SPACE}(?=${chr}?\\d)`,
    "g"
  )
  return text.replace(pattern, `$<symbol>$<marker>${NBSP}`)
}

/**
 * Adds non-breaking space after honorific titles to keep them with names.
 *
 * @example "Dr. Smith" → "Dr.\u00A0Smith", "Mr. Jones" → "Mr.\u00A0Jones"
 *
 * Covers: Mr., Mrs., Ms., Dr., Prof., Rev., St. (Saint), Sr., Jr., Hon., Gov., Sen., Rep.
 *
 * @param text - The text to transform
 * @param options - Options including separator character
 * @returns Text with nbsp after honorifics
 */
export function nbspAfterHonorifics(text: string, options: NbspOptions = {}): string {
  const chr = sep(options)
  const honorifics = [
    "Mr\\.",
    "Mrs\\.",
    "Ms\\.",
    "Dr\\.",
    "Prof\\.",
    "Rev\\.",
    "St\\.",
    "Sr\\.",
    "Jr\\.",
    "Hon\\.",
    "Gov\\.",
    "Sen\\.",
    "Rep\\.",
  ]
  const pattern = new RegExp(
    `(?<honorific>${honorifics.join("|")})(?<marker>${chr}?)${SPACE}(?=${chr}?${UNICODE_UPPERCASE})`,
    "gu"
  )
  return text.replace(pattern, `$<honorific>$<marker>${NBSP}`)
}

/**
 * Adds non-breaking space after copyright (©), registered (®), and trademark (™) symbols
 * when followed by a year or company name.
 *
 * @example "© 2024" → "©\u00A02024", "® Brand" → "®\u00A0Brand"
 *
 * @param text - The text to transform
 * @param options - Options including separator character
 * @returns Text with nbsp after copyright symbols
 */
export function nbspAfterCopyrightSymbols(text: string, options: NbspOptions = {}): string {
  const chr = sep(options)
  const pattern = new RegExp(
    `(?<symbol>[©®™])(?<marker>${chr}?)${SPACE}(?=${chr}?[\\d${UNICODE_UPPERCASE}])`,
    "gu"
  )
  return text.replace(pattern, `$<symbol>$<marker>${NBSP}`)
}

/**
 * Adds non-breaking space between initials to keep them together.
 *
 * @example "J. K. Rowling" → "J.\u00A0K.\u00A0Rowling"
 *
 * @param text - The text to transform
 * @param options - Options including separator character
 * @returns Text with nbsp between initials
 */
export function nbspBetweenInitials(text: string, options: NbspOptions = {}): string {
  const chr = sep(options)
  // Match a single uppercase letter followed by a period, then a space,
  // then another uppercase letter (either another initial or start of name).
  const pattern = new RegExp(
    `(?<initial>${UNICODE_UPPERCASE}\\.)(?<marker>${chr}?)${SPACE}(?=${chr}?${UNICODE_UPPERCASE})`,
    "gu"
  )
  return text.replace(pattern, `$<initial>$<marker>${NBSP}`)
}

/**
 * Apply all non-breaking space transformations in sequence.
 *
 * **Ordering matters:** Specific patterns (honorifics, abbreviations, initials)
 * run first so they claim their matches before the generic `nbspAfterShortWords`
 * runs. For example, "No. 5" is matched by `nbspAfterReferenceAbbreviations`
 * (inserting nbsp after the period), which prevents `nbspAfterShortWords` from
 * also matching "No" as a 2-letter short word. Similarly, `nbspBeforeLastWord`
 * runs last since it operates on the final word boundary and shouldn't interfere
 * with more specific patterns.
 *
 * @param text - The text to transform
 * @param options - Options including separator character
 * @returns Text with all nbsp transformations applied
 */
export function nbspTransform(text: string, options: NbspOptions = {}): string {
  // Specific patterns first (claim their nbsp before generic patterns run)
  text = nbspAfterHonorifics(text, options)
  text = nbspAfterReferenceAbbreviations(text, options)
  text = nbspAfterSectionSymbols(text, options)
  text = nbspAfterCopyrightSymbols(text, options)
  text = nbspBetweenInitials(text, options)
  text = nbspBetweenNumberAndUnit(text, options)
  // Generic patterns last
  text = nbspAfterShortWords(text, options)
  text = nbspBeforeLastWord(text, options)
  return text
}
