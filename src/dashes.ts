/**
 * Dash transformation: hyphens → em-dashes, en-dashes, minus signs.
 */

import { UNICODE_SYMBOLS, DEFAULT_SEPARATOR, LATIN_LETTERS, wordBoundaryStart, wordBoundaryEnd, getEscapedSeparator, cachedRegExp } from "./constants.js"

export type DashStyle = "american" | "british" | "none"

export interface DashOptions {
  /** Boundary marker for HTML element boundaries. Default: "\uE000\uE001" */
  separator?: string
  /** "american" (unspaced em), "british" (spaced en), "none". Default: "american" */
  dashStyle?: DashStyle
}

const { EN_DASH, EM_DASH, MINUS, LEFT_DOUBLE_QUOTE, RIGHT_DOUBLE_QUOTE, LEFT_SINGLE_QUOTE, RIGHT_SINGLE_QUOTE } = UNICODE_SYMBOLS

/**
 * Characters that, when preceding a number, prevent it from being
 * treated as the start of a number range. This prevents false positives
 * in model names like "Llama-2-7B" where "2-7" should not become "2–7".
 */
export const numberRangeDisallowedPrefixes = ["-", EN_DASH, EM_DASH, MINUS] as const

/**
 * Regex character-class fragment built from {@link numberRangeDisallowedPrefixes}.
 * Non-ASCII dashes are escaped to `\uXXXX` form so the fragment is safe to
 * embed inside a `[...]` class regardless of the regex source encoding.
 * Computed once at module load — the inputs are `const`.
 */
const DISALLOWED_PREFIX_CLASS_FRAGMENT = numberRangeDisallowedPrefixes
  .map((c) => (c === "-" ? c : `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`))
  .join("")

export const months = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
  "Jan", "Feb", "Mar", "Apr", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
].join("|")

/** Convert number ranges to en-dash (e.g., "1-5" → "1–5"). */
export function enDashNumberRange(text: string, options: DashOptions = {}): string {
  const chr = getEscapedSeparator(options)
  const wb = wordBoundaryStart(chr)
  const wbe = wordBoundaryEnd(chr)

  // Common currency symbols for price ranges
  const currencies = "$€£¥₹"

  // Build positive range pattern from readable components
  const phoneAreaCode = `(?<precedingAreaCode>\\d{3}-|\\(\\d{3}\\) ?)?`  // 555- or (555)
  // Lookbehind prevents matching after dashes, so Llama-2-7B and +44-20 don't en-dash.
  const notAfterDash = `(?<![${DISALLOWED_PREFIX_CLASS_FRAGMENT}${LATIN_LETTERS}.+])`
  const rangeStart = `(?<start>(?:p\\.?|[${currencies}])?\\d[\\d.,]*${chr}?)`  // p.10, $100, 1,000
  const rangeEnd = `(?<end>${chr}?[${currencies}]?\\d[\\d.,]*)`          // 20, $200, 2,000
  const moreSegments = `(?<following>(?:${chr}?[-${MINUS}]${chr}?\\d+)*)` // -4567 in phone numbers
  const unitSuffix = `(?<suffix>${chr}?(?:[AaPp][Mm]|[xKBTM]))?`         // am/pm, K/M/B

  // Positive ranges: 1-5, 5--10, $100-$200, €5-€10, p.10-15
  const positiveRangePattern = [
    phoneAreaCode, wb, notAfterDash, rangeStart, "-{1,3}", rangeEnd, moreSegments, unitSuffix, wbe
  ].join("")

  text = text.replace(
    cachedRegExp(positiveRangePattern, "g"),
    (...args) => {
      const groups = args.at(-1) as Record<string, string>
      if (groups.following) return args[0] as string
      const startNum = groups.start.replace(cachedRegExp(chr, "g"), "")
      const endNum = groups.end.replace(cachedRegExp(chr, "g"), "")
      if (/^(?:19|20)\d{2}$/.test(startNum) && /^(?:0[1-9]|1[0-2])$/.test(endNum)) return args[0] as string
      // Skip 3+4 digit phone-shaped patterns (555-1234, or the second half of
      // 555-123-4567). Thousands-grouped endings (1,234 / 1.234) keep their
      // internal separator and so fail /^\d{4}$/, falling through to convert
      // as ranges. Space/NNBSP/thin-space grouping isn't captured by the outer
      // range regex, so those variants currently aren't affected here.
      if (/^\d{3}$/.test(startNum) && /^\d{4}$/.test(endNum)) return args[0] as string
      // Skip US toll-free prefix pattern: 1-800, 1-888, 1-877, etc.
      // All US toll-free area codes start with 8 (800, 888, 877, 866, 855, 844, 833).
      // We only block 1-8XX to avoid false negatives on legitimate ranges like 1-100.
      if (/^1$/.test(startNum) && /^8\d{2}$/.test(endNum)) return args[0] as string
      return `${groups.precedingAreaCode ?? ""}${groups.start}${EN_DASH}${groups.end}${groups.suffix ?? ""}`
    }
  )

  // Negative ranges: −5-5 → −5–5, −5--2 → −5–−2
  // Separate regex because MINUS isn't a word char, so \b in ${wb} would match after it
  text = text.replace(
    cachedRegExp(
      `(?<![${LATIN_LETTERS}])(?<start>${MINUS}\\d[\\d.,]*${chr}?)-{1,3}?(?<neg>-)?(?<end>${chr}?\\d[\\d.,]*)(?<following>(?:${chr}?-${chr}?\\d+)*)(?<suffix>${chr}?[xKBTM])?${wbe}`,
      "g"
    ),
    (...args) => {
      const groups = args.at(-1) as Record<string, string>
      if (groups.following) return args[0] as string
      return `${groups.start}${EN_DASH}${groups.neg ? MINUS : ""}${groups.end}${groups.suffix ?? ""}`
    }
  )

  return text
}

/** Convert month ranges to en-dash (e.g., "January-March" → "January–March"). */
export function enDashDateRange(text: string, options: DashOptions = {}): string {
  const dashStyle = options.dashStyle ?? "american"
  if (dashStyle === "none") return text
  const chr = getEscapedSeparator(options)
  const wb = wordBoundaryStart(chr)
  const wbe = wordBoundaryEnd(chr)

  return text.replace(
    cachedRegExp(`${wb}(?<startMonth>${months})(?<startYear>${chr}? \\d{4})?(?<preSep>${chr}?)(?<preSpace> ?)-(?<postSpace> ?)(?<postSep>${chr}?)(?<endMonth>${months})(?<endYear> \\d{4})?${wbe}`, "g"),
    (...args) => {
      const groups = args.at(-1) as Record<string, string>
      const [pre, post] = dashStyle === "british" ? [" ", " "] : ["", ""]
      return `${groups.startMonth}${groups.startYear || ""}${groups.preSep}${pre}${EN_DASH}${post}${groups.postSep}${groups.endMonth}${groups.endYear || ""}`
    }
  )
}

/** Convert hyphens to minus signs in numeric contexts (e.g., "-5" → "−5"). */
export function minusReplace(text: string, options: DashOptions = {}): string {
  const chr = getEscapedSeparator(options)

  // Pattern 1a: Subtraction of negative number (e.g., "5 - -3" → "5 − −3")
  // Must come before Pattern 1b so the negative hyphen is consumed first
  text = text.replace(
    cachedRegExp(`(?<=\\d${chr}?) - -(?<num>${chr}?\\d*\\.?\\d+)`, "g"),
    ` ${MINUS} ${MINUS}$<num>`
  )

  // Pattern 1b: Spaced math subtraction (e.g., "5 - 3" → "5 − 3")
  // Only when preceded by a digit - this distinguishes "5 - 3" from "Safari) - 9"
  text = text.replace(
    cachedRegExp(`(?<=\\d${chr}?) - (?<num>${chr}?\\d*\\.?\\d+)`, "g"),
    ` ${MINUS} $<num>`
  )

  // Pattern 2: Direct negative numbers (e.g., "-5" → "−5", "(-3)" → "(−3)")
  // Match after: start of line, whitespace, (, or quotes (straight or curly)
  // No space allowed between hyphen and digit
  text = text.replace(
    cachedRegExp(`(?<before>^|[\\s\\("${LEFT_DOUBLE_QUOTE}${RIGHT_DOUBLE_QUOTE}])-(?<num>\\d*\\.?\\d+)`, "gm"),
    `$<before>${MINUS}$<num>`
  )

  // Pattern 2b: Direct negative numbers after separator boundary (e.g., <em>-5</em>)
  // Only when no word character precedes the separator — prevents both
  // "2{SEP}-3" in "1-2-3" and "GPT{SEP}-3" from being misidentified as negative 3
  text = text.replace(
    cachedRegExp(`(?<![\\d.,${LATIN_LETTERS}])(?<before>${chr})-(?<num>\\d*\\.?\\d+)`, "gm"),
    `$<before>${MINUS}$<num>`
  )

  return text
}

/**
 * Convert surrounded dashes to em/en dashes.
 * Handles patterns like "word - word" → "word—word" (Chicago) or "word – word" (Oxford).
 */
function convertParentheticalDashes(text: string, sep: string, style: DashStyle): string {
  const localizedDash = style === "british" ? EN_DASH : EM_DASH
  const maybeSpace = style === "british" ? " " : ""
  const escapedSep = getEscapedSeparator({ separator: sep })

  // Convert spaced dashes: "word - word" or "word — word"
  // When a separator follows the dash, preserve trailing spaces (they belong to the next text segment).
  // A single plain hyphen directly before a word character (through optional separators) is a
  // suspended/hanging hyphen ("Yes-men and -women"), not a parenthetical dash — skip it.
  // Em/en dashes and multiple hyphens can have zero trailing spaces.
  const spacedDashPattern = cachedRegExp(
    `(?<=[^\\s]|^)(?<sepBefore>${escapedSep}?)[ ]+(?:[${EN_DASH}${EM_DASH}][-${EN_DASH}${EM_DASH}]*|-{2,}|-(?!${escapedSep}*[${LATIN_LETTERS}\\d]))(?!-*>)[ ]*(?<sepAfter>${escapedSep}?)(?<trailing>[ ]*)(?=\\S|$)`, "g"
  )
  text = text.replace(spacedDashPattern, (_match, sepBefore, sepAfter, trailing) => {
    // For British style (spaced en-dash), preserve trailing spaces after separator
    // For American style (unspaced em-dash), consume trailing spaces (em-dash replaces surrounding space)
    const keepTrailing = maybeSpace && sepAfter ? trailing : ""
    return `${sepBefore}${maybeSpace}${localizedDash}${maybeSpace}${sepAfter}${keepTrailing}`
  })
  // Convert dashes at text node boundaries: separator alone precedes dash (e.g., "word{sep}– rest")
  // Requires space after the dash to avoid matching number ranges like "1{sep}-{sep}5"
  text = text.replace(
    cachedRegExp(`(?<=[^\\s])(?<sepBefore>${escapedSep})[${EN_DASH}${EM_DASH}-]+[ ]+(?<sepAfter>${escapedSep}?)`, "g"),
    `$<sepBefore>${maybeSpace}${localizedDash}${maybeSpace}$<sepAfter>`
  )
  // Convert multiple dashes: "word--word" or "word---word" or "quote"--"quote"
  const quoteChars = `"'${LEFT_DOUBLE_QUOTE}${RIGHT_DOUBLE_QUOTE}${LEFT_SINGLE_QUOTE}${RIGHT_SINGLE_QUOTE}`
  text = text.replace(
    cachedRegExp(`(?<=[${LATIN_LETTERS}\\d${quoteChars}])(?<sepBefore>${escapedSep}?)[${EN_DASH}${EM_DASH}-]{2,}(?<sepAfter>${escapedSep}?)(?=[${LATIN_LETTERS}${quoteChars} ])`, "g"),
    `$<sepBefore>${maybeSpace}${localizedDash}${maybeSpace}$<sepAfter>`
  )
  // Convert dashes at start of line
  text = text.replace(cachedRegExp(`^(?<leadingSep>${escapedSep})?[-]+ `, "gm"), `$<leadingSep>${localizedDash} `)
  // British: convert unspaced em-dashes to spaced en-dashes (word—word → word – word)
  if (style === "british") {
    text = text.replace(
      cachedRegExp(`(?<=[${LATIN_LETTERS}.!?'"])(?<sepBefore>${escapedSep}?)${EM_DASH}(?<sepAfter>${escapedSep}?)(?=[${LATIN_LETTERS}])`, "g"),
      `$<sepBefore>${maybeSpace}${localizedDash}${maybeSpace}$<sepAfter>`
    )
  }
  return text
}

/**
 * Normalize em-dash spacing for Chicago style (American).
 * Removes all spaces around em-dashes per Chicago Manual of Style.
 *
 * TODO: Handle interrupted-then-resumed speech within quotes, where Chicago
 * allows a space after the dash: "Don't inter— Hey! Who threw that?"
 */
function normalizeEmDashSpacing(text: string, sep: string): string {
  const escapedSep = getEscapedSeparator({ separator: sep })

  // Remove all spaces around em-dashes
  text = text.replace(
    cachedRegExp(`(?<before>${escapedSep}?)[ ]*${EM_DASH}[ ]*(?<after>${escapedSep}?)`, "g"),
    `$<before>${EM_DASH}$<after>`
  )

  // Preserve space after em-dash at start of line (e.g., attribution)
  text = text.replace(
    cachedRegExp(`^(?<sep>${escapedSep}?)${EM_DASH}(?<after>[A-Z0-9])`, "gm"),
    `$<sep>${EM_DASH} $<after>`
  )

  return text
}

/** Full dash transformation. */
export function hyphenReplace(text: string, options: DashOptions = {}): string {
  const sep = options.separator ?? DEFAULT_SEPARATOR
  const style = options.dashStyle ?? "american"
  if (style === "none") return text
  text = minusReplace(text, options)
  text = enDashDateRange(text, options)
  text = enDashNumberRange(text, options)
  text = convertParentheticalDashes(text, sep, style)
  if (style === "american") text = normalizeEmDashSpacing(text, sep)
  return text
}
