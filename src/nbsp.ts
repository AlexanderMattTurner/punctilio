import { cachedRegExp, DEFAULT_SEPARATOR, LATIN_LETTERS, NBSP_CHARS, SPACE_CHARS, UNICODE_SYMBOLS } from "./constants.js"
import { boundaryCountAt, type ProseView, replaceAllInView, withProseView } from "./prose-view.js"

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

const SPACE = `[${SPACE_CHARS}]`

const UNICODE_UPPERCASE = "\\p{Lu}"

/** Only specific abbreviations are matched to avoid false positives. */
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


function resolveSeparator(options: NbspOptions): string {
  return options.separator ?? DEFAULT_SEPARATOR
}

/**
 * A v4 `${sep}?` slot tolerates exactly ONE node boundary at that position;
 * two adjacent boundaries blocked the match (the lookbehind/lookahead saw a
 * sentinel character it could not consume twice). This mirrors that: at most
 * one boundary at `offset`, and every interior boundary in the span must sit
 * at one of the allowed slot offsets.
 */
function boundariesOnlyAtSlots(view: ProseView, start: number, end: number, slots: number[]): boolean {
  for (const boundary of view.boundaries) {
    if (boundary <= start || boundary >= end) continue
    if (!slots.includes(boundary)) return false
  }
  for (const slot of slots) {
    if (boundaryCountAt(view, slot) > 1) return false
  }
  return true
}

// Skips when preceded by NBSP or back-to-back with the previous match,
// preventing 3+ words from binding into a single line-break atom.
export function nbspAfterShortWords(text: string, options: NbspOptions = {}): string {
  const separator = resolveSeparator(options)
  const pattern = cachedRegExp(
    `(?<=^|${SPACE}|${PUNCTUATION_OR_QUOTE}|>)(?<shortWord>[${LATIN_LETTERS}]{1,2})${SPACE}`,
    "gmu"
  )
  return withProseView(text, separator, (view) => {
    const clean = view.text
    let previousMatchEnd = -1
    replaceAllInView(
      view,
      pattern,
      (match, v) => {
        const offset = match.index
        if (offset === previousMatchEnd) return null
        // A boundary directly before the short word is a sentinel char that
        // fails the v4 `(?<=^|space|punct|>)` lookbehind.
        if (view.hasBoundary(offset)) return null
        if (offset > 0 && NBSP_CHARS.includes(clean[offset - 1])) return null
        previousMatchEnd = offset + match[0].length
        // Edit only the space so the boundary keeps its v4 side of the NBSP.
        v.replace(offset + match[0].length - 1, offset + match[0].length, NBSP)
        return null
      },
      {
        allowBoundaries: (match, v) =>
          boundariesOnlyAtSlots(v, match.index, match.index + match[0].length, [
            match.index + match[0].length - 1,
          ]),
      }
    )
  })
}

export function nbspBetweenNumberAndUnit(text: string, options: NbspOptions = {}): string {
  const separator = resolveSeparator(options)
  const pattern = cachedRegExp(
    `(?<digit>\\d)${SPACE}(?<unit>${UNIT_PATTERN})\\b`,
    "gm"
  )
  return withProseView(text, separator, (view) => {
    replaceAllInView(
      view,
      pattern,
      (match, v) => {
        // Edit only the space (after the single digit) so the marker boundaries
        // keep their v4 sides.
        v.replace(match.index + 1, match.index + 2, NBSP)
        return null
      },
      {
        // marker1 between digit and space (index+1); marker2 between space and
        // unit (index+2). The unit literal itself must be boundary-free, which
        // the default interior-boundary skip already enforces.
        allowBoundaries: (match, v) =>
          boundariesOnlyAtSlots(v, match.index, match.index + match[0].length, [
            match.index + 1,
            match.index + 2,
          ]),
      }
    )
  })
}

const MAX_LAST_WORD_LENGTH = 10

// Bounded so the lookbehind stays ReDoS-safe.
const MAX_MIDDLE_WORD_LENGTH = 15

const LATIN_LETTER_RE = cachedRegExp(`[${LATIN_LETTERS}]`, "u")

/**
 * Reproduces the v4 cascade lookbehind `(?<![NBSP][LATIN]{1,15})` over clean
 * text: blocks when an NBSP/NNBSP is followed by 1..15 Latin letters ending at
 * the space. A node boundary anywhere in that backward run breaks it — the v4
 * sentinel interrupted `[LATIN]{1,15}`, re-enabling the match.
 */
function cascadeBlocksLastWord(view: ProseView, spaceOffset: number): boolean {
  const text = view.text
  let j = spaceOffset - 1
  let run = 0
  while (j >= 0 && run < MAX_MIDDLE_WORD_LENGTH && !view.hasBoundary(j + 1) && LATIN_LETTER_RE.test(text[j])) {
    j--
    run++
  }
  if (run === 0 || view.hasBoundary(j + 1)) return false
  return j >= 0 && NBSP_CHARS.includes(text[j])
}

// Skips when the second-to-last word is already glued backwards via NBSP.
export function nbspBeforeLastWord(text: string, options: NbspOptions = {}): string {
  const separator = resolveSeparator(options)
  // The v4 `(?<=\w|sep)` lookbehind and the `[NBSP][LATIN]{1,15}` cascade
  // lookbehind are enforced in the replacer, where boundaries are visible.
  const pattern = cachedRegExp(
    `${SPACE}(?<lastWord>(?:(?!\\s).){1,${MAX_LAST_WORD_LENGTH}})(?<ending>\\n\\n|$)`,
    "g"
  )
  return withProseView(text, separator, (view) => {
    const clean = view.text
    replaceAllInView(
      view,
      pattern,
      (match, v) => {
        const start = match.index
        const end = start + match[0].length
        // `(?<=\w|sep)`: a word char before the space, or a boundary there.
        const precededByWord = start > 0 && /\w/.test(clean[start - 1])
        if (!precededByWord && !view.hasBoundary(start)) return null
        if (cascadeBlocksLastWord(v, start)) return null
        // The `ending` group's `sep?` tolerates exactly one boundary at the slot
        // before `\n\n`/end-of-text; two adjacent boundaries blocked v4. The
        // end-of-text slot sits at the match end (never an interior boundary),
        // so the cap is checked here rather than only in allowBoundaries.
        if (boundaryCountAt(v, end - match.groups!.ending.length) > 1) return null
        // Edit only the leading space so the lastWord/ending (and any boundary
        // before \n\n) keep their v4 positions.
        v.replace(start, start + 1, NBSP)
        return null
      },
      {
        // The space-lookbehind boundary (== match.index) is not interior. The
        // last word is `(?:(?!\s)(?!sep).)`, so an interior boundary inside it
        // blocks the match (the default skip). The only interior slot is the
        // `ending` group's `sep?` before a `\n\n`: one boundary tolerated.
        allowBoundaries: (match, v) => {
          const end = match.index + match[0].length
          const endingSlot = end - match.groups!.ending.length
          return boundariesOnlyAtSlots(v, match.index, end, [endingSlot])
        },
      }
    )
  })
}

/**
 * Shared driver for the abbreviation-family rules: `(thing)(SPACE)(?=context)`
 * where the v4 marker slot (between thing and space) and the lookahead slot
 * (between space and context) each tolerate one boundary.
 */
function nbspBeforeContext(
  text: string,
  separator: string,
  thingPattern: string,
  contextPattern: string,
  flags: string,
  thingGroup: string,
): string {
  const pattern = cachedRegExp(
    `(?<${thingGroup}>${thingPattern})${SPACE}(?=${contextPattern})`,
    flags
  )
  return withProseView(text, separator, (view) => {
    const clean = view.text
    pattern.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = pattern.exec(clean)) !== null) {
      const start = match.index
      const end = start + match[0].length
      // marker slot between the `thing` literal and the space (offset = end - 1);
      // lookahead slot `(?=sep?context)` at the match end. Each tolerates one
      // boundary; the literal itself must be boundary-free.
      const allowed =
        boundariesOnlyAtSlots(view, start, end, [end - 1]) && boundaryCountAt(view, end) <= 1
      if (!allowed) {
        // A boundary broke the (possibly longer) literal; let the scan re-anchor
        // one position later so a shorter sub-abbreviation can still match, as
        // the v4 sentinel-aware regex did.
        pattern.lastIndex = start + 1
        continue
      }
      // Edit only the trailing space so the marker/lookahead boundaries keep
      // their v4 sides.
      view.replace(end - 1, end, NBSP)
    }
  })
}

export function nbspAfterReferenceAbbreviations(text: string, options: NbspOptions = {}): string {
  return nbspBeforeContext(text, resolveSeparator(options), ABBREVIATION_PATTERN, "\\d", "g", "abbrev")
}

export function nbspAfterSectionSymbols(text: string, options: NbspOptions = {}): string {
  return nbspBeforeContext(text, resolveSeparator(options), "[\u00A7\u00B6]", "\\d", "g", "symbol")
}

export function nbspAfterHonorifics(text: string, options: NbspOptions = {}): string {
  return nbspBeforeContext(text, resolveSeparator(options), HONORIFIC_PATTERN, UNICODE_UPPERCASE, "gu", "honorific")
}

export function nbspAfterCopyrightSymbols(text: string, options: NbspOptions = {}): string {
  return nbspBeforeContext(text, resolveSeparator(options), COPYRIGHT_SYMBOLS, `[\\d${UNICODE_UPPERCASE}]`, "gu", "symbol")
}

export function nbspBetweenInitials(text: string, options: NbspOptions = {}): string {
  return nbspBeforeContext(text, resolveSeparator(options), `${UNICODE_UPPERCASE}\\.`, UNICODE_UPPERCASE, "gu", "initial")
}

type NbspFn = (text: string, options: NbspOptions) => string

// Specific patterns first so they claim matches before generic nbspAfterShortWords.
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

export function nbspTransform(text: string, options: NbspOptions = {}): string {
  // All nbsp patterns require a space, tab, or existing nbsp to match.
  // Short-circuit if the text contains none of these.
  if (!cachedRegExp(`[${SPACE_CHARS}]`, "").test(text)) return text

  for (const fn of NBSP_TRANSFORMS) {
    text = fn(text, options)
  }
  return text
}
