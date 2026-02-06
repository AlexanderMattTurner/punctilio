/**
 * Non-breaking space transformations for improved typography.
 *
 * Inserts non-breaking spaces (U+00A0) in positions where line breaks
 * would be typographically undesirable: after short words, between
 * numbers and units, before orphaned last words, etc.
 *
 * @module nbsp
 */

import escapeStringRegexp from "escape-string-regexp"

import { UNICODE_SYMBOLS, ESCAPED_DEFAULT_SEPARATOR } from "./constants.js"
import type { SymbolOptions } from "./symbols.js"

const { NBSP } = UNICODE_SYMBOLS

export type NbspOptions = Pick<SymbolOptions, "separator">

function sep(options: NbspOptions): string {
  return options.separator
    ? escapeStringRegexp(options.separator)
    : ESCAPED_DEFAULT_SEPARATOR
}

/** Space pattern matching regular space, tab, and nbsp. */
const SPACE = `[ \\t${NBSP}]`

const UNICODE_UPPERCASE = "\\p{Lu}"

/**
 * Common units for the number-unit nbsp pattern. Only matches these specific
 * abbreviations after a number to avoid false positives like "chapter 3 above".
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
 * @example "a cat" → "a\u00A0cat", "I am" → "I\u00A0am"
 */
export function nbspAfterShortWords(text: string, options: NbspOptions = {}): string {
  const chr = sep(options)
  const punctuationOrQuote = "[.,!?:;)(\u201C\u201D\u00AB\u00BB\u2018\u2019\"]"
  const pattern = new RegExp(
    `(?<=^|${SPACE}|${punctuationOrQuote}|>)(?<shortWord>[a-zA-Z]{1,2})(?<marker>${chr}?)${SPACE}`,
    "gmu"
  )
  return text.replace(pattern, `$<shortWord>$<marker>${NBSP}`)
}

/**
 * Adds non-breaking space between numbers and common units.
 *
 * @example "100 km" → "100\u00A0km", "5 kg" → "5\u00A0kg"
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
 * Adds non-breaking space before the last word to prevent widows.
 *
 * Only applies to final words of 1-10 characters, at end of string or
 * paragraph break (\n\n). Uses non-multiline mode so $ matches only the
 * true end of string.
 */
export function nbspBeforeLastWord(text: string, options: NbspOptions = {}): string {
  const chr = sep(options)
  const pattern = new RegExp(
    `(?<=[\\w${chr}])${SPACE}(?<lastWord>[^\\s${chr}]{1,10})(?<ending>${chr}?(?:\\n\\n|$))`,
    "g"
  )
  return text.replace(pattern, `${NBSP}$<lastWord>$<ending>`)
}

/**
 * Adds non-breaking space after reference abbreviations (Fig., Vol., p., etc.)
 * when followed by a number.
 *
 * @example "Fig. 1" → "Fig.\u00A01", "p. 42" → "p.\u00A042"
 */
export function nbspAfterReferenceAbbreviations(text: string, options: NbspOptions = {}): string {
  const chr = sep(options)
  const abbreviations = [
    "Fig\\.", "Figs\\.", "Vol\\.", "No\\.", "Nos\\.",
    "p\\.", "pp\\.", "Ch\\.", "Chap\\.", "Sec\\.",
    "Eq\\.", "Eqs\\.", "Art\\.", "Tab\\.", "Ex\\.",
  ]
  const pattern = new RegExp(
    `(?<abbrev>${abbreviations.join("|")})(?<marker>${chr}?)${SPACE}(?=${chr}?\\d)`,
    "g"
  )
  return text.replace(pattern, `$<abbrev>$<marker>${NBSP}`)
}

/**
 * Adds non-breaking space after section (§) and paragraph (¶) symbols
 * when followed by a number.
 *
 * @example "§ 5" → "§\u00A05"
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
 * Adds non-breaking space after honorific titles when followed by a capitalized name.
 *
 * @example "Dr. Smith" → "Dr.\u00A0Smith", "Mr. Jones" → "Mr.\u00A0Jones"
 */
export function nbspAfterHonorifics(text: string, options: NbspOptions = {}): string {
  const chr = sep(options)
  const honorifics = [
    "Mr\\.", "Mrs\\.", "Ms\\.", "Dr\\.", "Prof\\.", "Rev\\.",
    "St\\.", "Sr\\.", "Jr\\.", "Hon\\.", "Gov\\.", "Sen\\.", "Rep\\.",
  ]
  const pattern = new RegExp(
    `(?<honorific>${honorifics.join("|")})(?<marker>${chr}?)${SPACE}(?=${chr}?${UNICODE_UPPERCASE})`,
    "gu"
  )
  return text.replace(pattern, `$<honorific>$<marker>${NBSP}`)
}

/**
 * Adds non-breaking space after copyright (©), registered (®), and trademark (™)
 * symbols when followed by a year or capitalized name.
 *
 * @example "© 2024" → "©\u00A02024", "® Brand" → "®\u00A0Brand"
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
 * Adds non-breaking space between initials (e.g., "J. K. Rowling").
 *
 * @example "J. K. Rowling" → "J.\u00A0K.\u00A0Rowling"
 */
export function nbspBetweenInitials(text: string, options: NbspOptions = {}): string {
  const chr = sep(options)
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
 * also matching "No" as a 2-letter short word.
 */
export function nbspTransform(text: string, options: NbspOptions = {}): string {
  text = nbspAfterHonorifics(text, options)
  text = nbspAfterReferenceAbbreviations(text, options)
  text = nbspAfterSectionSymbols(text, options)
  text = nbspAfterCopyrightSymbols(text, options)
  text = nbspBetweenInitials(text, options)
  text = nbspBetweenNumberAndUnit(text, options)
  text = nbspAfterShortWords(text, options)
  text = nbspBeforeLastWord(text, options)
  return text
}
