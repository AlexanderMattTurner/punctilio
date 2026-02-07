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

import { UNICODE_SYMBOLS, ESCAPED_DEFAULT_SEPARATOR, LATIN_LETTERS, wordBoundaryEnd } from "./constants.js"
import type { SymbolOptions } from "./symbols.js"

const {
  NBSP,
  LEFT_DOUBLE_QUOTE,
  RIGHT_DOUBLE_QUOTE,
  LEFT_SINGLE_QUOTE,
  RIGHT_SINGLE_QUOTE,
  COPYRIGHT,
  REGISTERED,
  TRADEMARK,
} = UNICODE_SYMBOLS

export type NbspOptions = Pick<SymbolOptions, "separator">

function escapedSeparator(options: NbspOptions): string {
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
export const UNITS = [
  // Length
  "km", "cm", "mm", "mi", "ft", "in", "yd", "nm", "pm", "m",
  // Mass
  "kg", "mg", "lbs", "lb", "oz", "g", "t",
  // Volume
  "ml", "mL", "gal", "fl", "l", "L",
  // Time
  "min", "ms", "hr", "hrs", "h", "s",
  // Speed / frequency
  "kHz", "MHz", "GHz", "THz", "rpm", "Hz",
  // Digital
  "kbps", "Mbps", "Gbps", "KB", "MB", "GB", "TB", "PB", "kB", "Mb", "Gb",
  // Energy / power
  "kWh", "MWh", "kW", "MW", "GW", "kJ", "MJ", "Wh", "W", "J",
  // Temperature
  "K",
  // Electrical
  "kV", "mV", "mA", "V", "A",
  // Pressure / area
  "kPa", "MPa", "bar", "psi", "ha", "Pa",
  // Typography / CSS
  "rem", "dpi", "px", "pt", "em", "vw", "vh",
  // Finance
  "MM", "M", "B", "T",
  // Misc
  "kcal", "mol", "cal", "dB",
]

export const HONORIFICS = [
  // English
  "Mr", "Mrs", "Ms", "Dr", "Prof", "Rev",
  "St", "Sr", "Jr", "Hon", "Gov", "Sen", "Rep",
  // French
  "Mme", "Mlle", "Mgr",
  // German / Nordic
  "Hr", "Fr",
  // Spanish / Portuguese
  "Sra", "Srta",
  // Italian
  "Sig", "Dott",
  // Dutch
  "Dhr", "Mevr",
]

export const REFERENCE_ABBREVIATIONS = [
  // English / Latin
  "Fig", "Figs", "Vol", "No", "Nos",
  "p", "pp", "Ch", "Chap", "Sec",
  "Eq", "Eqs", "Art", "Tab", "Ex",
  // German
  "Abb", "Bd", "Nr", "Kap",
  // Romance (Spanish / Portuguese / Italian)
  "Cap",
]

// Precomputed regex fragments
const UNIT_PATTERN = UNITS.join("|")
const HONORIFIC_PATTERN = HONORIFICS.map((h) => `${h}\\.`).join("|")
const ABBREVIATION_PATTERN = REFERENCE_ABBREVIATIONS.map((a) => `${a}\\.`).join("|")
const PUNCTUATION_OR_QUOTE = `[.,!?:;)(${LEFT_DOUBLE_QUOTE}${RIGHT_DOUBLE_QUOTE}\u00AB\u00BB${LEFT_SINGLE_QUOTE}${RIGHT_SINGLE_QUOTE}"]`
const COPYRIGHT_SYMBOLS = `[${COPYRIGHT}${REGISTERED}${TRADEMARK}]`

/**
 * Adds non-breaking space after short words (1-2 letters) to prevent them from
 * being left alone at the end of a line.
 *
 * @example "a cat" → "a\u00A0cat", "I am" → "I\u00A0am"
 */
export function nbspAfterShortWords(text: string, options: NbspOptions = {}): string {
  const sep = escapedSeparator(options)
  const pattern = new RegExp(
    `(?<=^|${SPACE}|${PUNCTUATION_OR_QUOTE}|>)(?<shortWord>[${LATIN_LETTERS}]{1,2})(?<marker>${sep}?)${SPACE}`,
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
  const sep = escapedSeparator(options)
  const wbe = wordBoundaryEnd(sep)
  const pattern = new RegExp(
    `(?<digit>\\d)(?<marker1>${sep}?)${SPACE}(?<marker2>${sep}?)(?<unit>${UNIT_PATTERN})${wbe}`,
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
  const sep = escapedSeparator(options)
  const pattern = new RegExp(
    `(?<=[\\w${sep}])${SPACE}(?<lastWord>[^\\s${sep}]{1,10})(?<ending>${sep}?(?:\\n\\n|$))`,
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
  const sep = escapedSeparator(options)
  const pattern = new RegExp(
    `(?<abbrev>${ABBREVIATION_PATTERN})(?<marker>${sep}?)${SPACE}(?=${sep}?\\d)`,
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
  const sep = escapedSeparator(options)
  const pattern = new RegExp(
    `(?<symbol>[§¶])(?<marker>${sep}?)${SPACE}(?=${sep}?\\d)`,
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
  const sep = escapedSeparator(options)
  const pattern = new RegExp(
    `(?<honorific>${HONORIFIC_PATTERN})(?<marker>${sep}?)${SPACE}(?=${sep}?${UNICODE_UPPERCASE})`,
    "gu"
  )
  return text.replace(pattern, `$<honorific>$<marker>${NBSP}`)
}

/**
 * Adds non-breaking space after copyright, registered, and trademark
 * symbols when followed by a year or capitalized name.
 *
 * @example "© 2024" → "©\u00A02024", "® Brand" → "®\u00A0Brand"
 */
export function nbspAfterCopyrightSymbols(text: string, options: NbspOptions = {}): string {
  const sep = escapedSeparator(options)
  const pattern = new RegExp(
    `(?<symbol>${COPYRIGHT_SYMBOLS})(?<marker>${sep}?)${SPACE}(?=${sep}?[\\d${UNICODE_UPPERCASE}])`,
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
  const sep = escapedSeparator(options)
  const pattern = new RegExp(
    `(?<initial>${UNICODE_UPPERCASE}\\.)(?<marker>${sep}?)${SPACE}(?=${sep}?${UNICODE_UPPERCASE})`,
    "gu"
  )
  return text.replace(pattern, `$<initial>$<marker>${NBSP}`)
}

type NbspFn = (text: string, options: NbspOptions) => string

/**
 * Ordered list of nbsp transforms. Specific patterns (honorifics, abbreviations,
 * initials) come first so they claim their matches before the generic
 * `nbspAfterShortWords`. For example, "No. 5" is matched by
 * `nbspAfterReferenceAbbreviations` first, preventing `nbspAfterShortWords`
 * from also matching "No" as a 2-letter short word.
 */
const NBSP_TRANSFORMS: NbspFn[] = [
  nbspAfterHonorifics,
  nbspAfterReferenceAbbreviations,
  nbspAfterSectionSymbols,
  nbspAfterCopyrightSymbols,
  nbspBetweenInitials,
  nbspBetweenNumberAndUnit,
  nbspAfterShortWords,
  nbspBeforeLastWord,
]

/** Apply all non-breaking space transformations in sequence. */
export function nbspTransform(text: string, options: NbspOptions = {}): string {
  for (const fn of NBSP_TRANSFORMS) {
    text = fn(text, options)
  }
  return text
}
