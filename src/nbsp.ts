/**
 * Non-breaking space transformations for improved typography.
 *
 * Inserts non-breaking spaces (U+00A0) in positions where line breaks
 * would be typographically undesirable: after short words, between
 * numbers and units, before orphaned last words, etc.
 *
 * @module nbsp
 */

import { UNICODE_SYMBOLS, LATIN_LETTERS, SPACE_CHARS, NBSP_CHARS, wordBoundaryEnd, getEscapedSeparator, cachedRegExp } from "./constants.js"

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

export interface NbspOptions {
  /** Boundary marker for HTML element boundaries. Default: "\uE000\uE001" */
  separator?: string
}

/** Space pattern matching regular space, tab, and nbsp. */
const SPACE = `[${SPACE_CHARS}]`

const UNICODE_UPPERCASE = "\\p{Lu}"

/**
 * Common units for the number-unit nbsp pattern. Only matches these specific
 * abbreviations after a number to avoid false positives like "chapter 3 above".
 */
export const UNITS: readonly string[] = [
  // Length
  "km", "cm", "mm", "mi", "ft", "yd", "nm", "pm", "m",
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
  "kPa", "MPa", "psi", "ha", "Pa",
  // Typography / CSS
  "rem", "dpi", "px", "pt", "em", "vw", "vh",
  // Finance
  "MM", "M", "B", "T",
  // Misc
  "kcal", "mol", "cal", "dB",
  // Speed
  "mph", "kph", "fps",
  // Pressure
  "atm", "mbar",
  // Battery / charge
  "mAh", "Ah",
  // Torque
  "Nm",
  // Light
  "lm",
]

export const HONORIFICS: readonly string[] = [
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

export const REFERENCE_ABBREVIATIONS: readonly string[] = [
  // English / Latin
  "Fig", "Figs", "Vol", "No", "Nos",
  "p", "pp", "Ch", "Chap", "Sec",
  "Eq", "Eqs", "Art", "Tab", "Ex",
  // German
  "Abb", "Bd", "Nr", "Kap",
  // Romance (Spanish / Portuguese / Italian)
  "Cap",
]

// Precomputed regex fragments — sorted longest-first so the regex alternation
// matches the most specific unit before a shorter prefix (e.g. "mbar" before "m").
const UNIT_PATTERN = [...UNITS].sort((a, b) => b.length - a.length).join("|")
// Honorifics and abbreviations don't need longest-first sorting because
// the mandatory trailing `\.` disambiguates prefix overlaps (e.g. Mr\. vs Mrs\.).
const HONORIFIC_PATTERN = HONORIFICS.map((h) => `${h}\\.`).join("|")
const ABBREVIATION_PATTERN = REFERENCE_ABBREVIATIONS.map((a) => `${a}\\.`).join("|")
const PUNCTUATION_OR_QUOTE = `[.,!?:;)(${LEFT_DOUBLE_QUOTE}${RIGHT_DOUBLE_QUOTE}\u00AB\u00BB${LEFT_SINGLE_QUOTE}${RIGHT_SINGLE_QUOTE}"]`
const COPYRIGHT_SYMBOLS = `[${COPYRIGHT}${REGISTERED}${TRADEMARK}]`

/**
 * Adds non-breaking space after short words (1-2 letters) to prevent them from
 * being left alone at the end of a line.
 *
 * Skips when the short word is already preceded by an NBSP from an earlier
 * transform, or when this match immediately follows the previous one
 * (back-to-back short words in the same pass). Either case would bind three
 * or more words into a single line-break atom — defeating widow protection.
 *
 * @example "a cat" → "a\u00A0cat", "I am" → "I\u00A0am"
 */
export function nbspAfterShortWords(text: string, options: NbspOptions = {}): string {
  const sep = getEscapedSeparator(options)
  const pattern = cachedRegExp(
    `(?<=^|${SPACE}|${PUNCTUATION_OR_QUOTE}|>)(?<shortWord>[${LATIN_LETTERS}]{1,2})(?<marker>${sep}?)${SPACE}`,
    "gmu"
  )
  let previousMatchEnd = -1
  return text.replace(pattern, (match, shortWord: string, marker: string, offset: number) => {
    if (offset === previousMatchEnd) return match
    if (offset > 0 && NBSP_CHARS.includes(text[offset - 1])) return match
    previousMatchEnd = offset + match.length
    return `${shortWord}${marker}${NBSP}`
  })
}

/**
 * Adds non-breaking space between numbers and common units.
 *
 * @example "100 km" → "100\u00A0km", "5 kg" → "5\u00A0kg"
 */
export function nbspBetweenNumberAndUnit(text: string, options: NbspOptions = {}): string {
  const sep = getEscapedSeparator(options)
  const wbe = wordBoundaryEnd(sep)
  const pattern = cachedRegExp(
    `(?<digit>\\d)(?<marker1>${sep}?)${SPACE}(?<marker2>${sep}?)(?<unit>${UNIT_PATTERN})${wbe}`,
    "gm"
  )
  return text.replace(pattern, `$<digit>$<marker1>${NBSP}$<marker2>$<unit>`)
}

/**
 * Maximum length, in characters, of the "last word" that gets an NBSP
 * glued to its preceding space. Short enough that a typical English word
 * qualifies but an entire trailing URL or long token does not. Only affects
 * widow prevention at end-of-string and paragraph breaks.
 */
const MAX_LAST_WORD_LENGTH = 10

/**
 * Maximum word length, in characters, considered for the cascade check.
 * Bounded so the lookbehind in `nbspBeforeLastWord` stays ReDoS-safe.
 */
const MAX_MIDDLE_WORD_LENGTH = 15

/**
 * Adds non-breaking space before the last word to prevent widows.
 *
 * Only applies to final words of 1 to {@link MAX_LAST_WORD_LENGTH} characters,
 * at end of string or paragraph break (\n\n). Uses non-multiline mode so $
 * matches only the true end of string.
 *
 * Skips when the second-to-last word is already glued backwards via NBSP,
 * so the phrase doesn't become a 3-word non-breaking atom.
 */
export function nbspBeforeLastWord(text: string, options: NbspOptions = {}): string {
  const sep = getEscapedSeparator(options)
  const cascadeBlock = `(?<![${NBSP_CHARS}][${LATIN_LETTERS}]{1,${MAX_MIDDLE_WORD_LENGTH}})`
  // Use alternation instead of character classes for multi-char separator support
  const pattern = cachedRegExp(
    `${cascadeBlock}(?<=\\w|${sep})${SPACE}(?<lastWord>(?:(?!\\s)(?!${sep}).){1,${MAX_LAST_WORD_LENGTH}})(?<ending>${sep}?(?:\\n\\n|$))`,
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
  const sep = getEscapedSeparator(options)
  const pattern = cachedRegExp(
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
  const sep = getEscapedSeparator(options)
  const pattern = cachedRegExp(
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
  const sep = getEscapedSeparator(options)
  const pattern = cachedRegExp(
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
  const sep = getEscapedSeparator(options)
  const pattern = cachedRegExp(
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
  const sep = getEscapedSeparator(options)
  const pattern = cachedRegExp(
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
  // All nbsp patterns require a space, tab, or existing nbsp to match.
  // Short-circuit if the text contains none of these.
  if (!cachedRegExp(`[${SPACE_CHARS}]`, "").test(text)) return text

  for (const fn of NBSP_TRANSFORMS) {
    text = fn(text, options)
  }
  return text
}
