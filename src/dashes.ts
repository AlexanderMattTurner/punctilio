/**
 * Dash and hyphen transformation
 *
 * Converts hyphens and dashes to typographically correct em-dashes,
 * en-dashes, and minus signs based on context.
 */

import { UNICODE_SYMBOLS, DEFAULT_SEPARATOR, ESCAPED_DEFAULT_SEPARATOR, wordBoundaryStart, wordBoundaryEnd } from "./constants.js"

export type DashStyle = "american" | "british" | "none"

/**
 * Escapes special regex characters in a string.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

export interface DashOptions {
  /**
   * A boundary marker character used when transforming text that spans
   * multiple HTML elements. This character is treated as "transparent"
   * in the regex patterns.
   *
   * Should be a character that doesn't appear in your text.
   * Default: "\uE000" (Unicode Private Use Area)
   */
  separator?: string

  /**
   * How to style parenthetical dashes.
   *
   * - `"american"` (default): Unspaced em dash (word—word)
   * - `"british"`: Spaced en dash (word – word)
   * - `"none"`: Don't convert parenthetical dashes
   *
   * Default: "american"
   */
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
 * List of month names (full and abbreviated) for date range detection
 */
export const months = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
].join("|")

/**
 * Replaces hyphens with en-dashes in number ranges.
 * Uses marker-aware boundaries to avoid false matches when separators
 * appear between word characters.
 *
 * Allows suffixes which are common in numerical ranges
 * like "1-10x" (1x to 10x magnification).
 *
 * Handles:
 * - Positive ranges: "1-5" → "1–5"
 * - Negative to positive: "-5-5" → "−5–5"
 * - Negative to negative: "-5--2" → "−5–−2"
 *
 * Does NOT convert multi-segment patterns (phones, ISBNs, IPs) or ISO dates.
 */
export function enDashNumberRange(text: string, options: DashOptions = {}): string {
  const chr = options.separator
    ? escapeRegex(options.separator)
    : ESCAPED_DEFAULT_SEPARATOR
  const wb = wordBoundaryStart(chr)
  const wbe = wordBoundaryEnd(chr)

  // Disallow dash-like chars and letters before the start number
  const disallowed = numberRangeDisallowedPrefixes.map(c => c === "-" ? c : `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`).join("")
  text = text.replace(
    new RegExp(
      `${wb}(?<![${disallowed}a-zA-Z.])(?<startNum>(?:p\\.?|\\$)?\\d[\\d.,]*${chr}?)-(?<endNum>${chr}?\\$?\\d[\\d.,]*)(?!\\.\\d)(?<following>(?:${chr}?-${chr}?\\d+)*)(?<suffix>${chr}?[xKBTM])?${wbe}`,
      "g"
    ),
    (match, startNum, endNum, following, suffix = "") => {
      // Don't convert if more than 2 segments (phones, ISBNs, IPs, etc.)
      if (following) return match

      const cleanStart = startNum.replace(new RegExp(chr, "g"), "")
      const cleanEnd = endNum.replace(new RegExp(chr, "g"), "")

      // Don't convert ISO date patterns (YYYY-MM)
      if (/^(?:19|20)\d{2}$/.test(cleanStart) && /^(?:0[1-9]|1[0-2])$/.test(cleanEnd)) {
        return match
      }

      return `${startNum}${EN_DASH}${endNum}${suffix || ""}`
    }
  )

  // Negative number ranges: −5-5 → −5–5, −5--2 → −5–−2
  // Don't convert if more than 2 segments
  text = text.replace(
    new RegExp(
      `(?<![a-zA-Z])(?<startNum>${MINUS}\\d[\\d.,]*${chr}?)-(?<endNeg>-)?(?<endNum>${chr}?\\d[\\d.,]*)(?<following>(?:${chr}?-${chr}?\\d+)*)(?<suffix>${chr}?[xKBTM])?${wbe}`,
      "g"
    ),
    (match, startNum, endNeg, endNum, following, suffix = "") => {
      if (following) return match
      const endMinus = endNeg ? MINUS : ""
      return `${startNum}${EN_DASH}${endMinus}${endNum}${suffix || ""}`
    }
  )

  return text
}

/**
 * Replaces hyphens with en-dashes in month/date ranges.
 * Supports formats like "January-March", "Jan-Mar", "February-April 2024",
 * and "October 2012 - December 2014".
 *
 * Spacing around the en-dash is controlled by dashStyle:
 * - "american" (default): No spaces (October 2012–December 2014)
 * - "british": Spaced (October 2012 – December 2014)
 * - "none": Preserve original spacing
 *
 * Uses marker-aware boundaries to avoid false matches when separators
 * appear between word characters.
 */
export function enDashDateRange(text: string, options: DashOptions = {}): string {
  const chr = options.separator
    ? escapeRegex(options.separator)
    : ESCAPED_DEFAULT_SEPARATOR
  const dashStyle = options.dashStyle ?? "american"
  const wb = wordBoundaryStart(chr)
  const wbe = wordBoundaryEnd(chr)

  const startPattern = `(?<startMonth>${months})(?<startYear>${chr}? \\d{4})?(?<preSep>${chr}?)`
  const endPattern = `(?<postSep>${chr}?)(?<endMonth>${months})(?<endYear> \\d{4})?`
  const dateRangeRegex = new RegExp(
    `${wb}${startPattern}(?<preSpace> ?)-(?<postSpace> ?)${endPattern}${wbe}`,
    "g"
  )

  return text.replace(dateRangeRegex, (...args) => {
    const groups = args.at(-1) as Record<string, string>
    const { startMonth, startYear = "", preSep, postSep, endMonth, endYear = "", preSpace, postSpace } = groups

    let pre: string, post: string
    if (dashStyle === "british") {
      pre = " "
      post = " "
    } else if (dashStyle === "none") {
      pre = preSpace
      post = postSpace
    } else {
      // american (default)
      pre = ""
      post = ""
    }

    return `${startMonth}${startYear}${preSep}${pre}${EN_DASH}${post}${postSep}${endMonth}${endYear}`
  })
}

/**
 * Replaces hyphens with proper minus signs (−) in numerical contexts.
 */
export function minusReplace(text: string, options: DashOptions = {}): string {
  const chr = options.separator ?? DEFAULT_SEPARATOR
  const minusRegex = new RegExp(`(?<beforeMinus>^|[\\s\\(${chr}""])-(?<number>\\s?\\d*\\.?\\d+)`, "gm")
  return text.replaceAll(minusRegex, `$<beforeMinus>${MINUS}$<number>`)
}

/** Convert surrounded dashes and multiple dashes to em/en dashes */
function convertParentheticalDashes(text: string, sep: string, style: DashStyle): string {
  if (style === "none") return text

  const dash = style === "british" ? EN_DASH : EM_DASH
  const spaced = style === "british"

  // Handle dashes with potential spaces
  const preDash = new RegExp(`(?:(?<markerBeforeTwo>${sep}?)[ ]+|(?<markerBeforeThree>${sep}))`)
  const surroundedDash = new RegExp(
    `(?<=[^\\s>]|^)${preDash.source}[~${EN_DASH}${EM_DASH}-]+[ ]*(?<markerAfter>${sep}?)(?<trailingSpace>[ ]+|$)`,
    "g"
  )
  const replacement = spaced
    ? `$<markerBeforeTwo>$<markerBeforeThree> ${dash} $<markerAfter>`
    : `$<markerBeforeTwo>$<markerBeforeThree>${dash}$<markerAfter>`
  text = text.replace(surroundedDash, replacement)

  // Handle multiple dashes within words (e.g., since--as)
  // But NOT when it's a number range pattern (digit--digit), which should become en-dash
  const multipleDashInWords = new RegExp(
    `(?<=[A-Za-z])(?<markerBefore>${sep}?)[~${EN_DASH}${EM_DASH}-]{2,}(?<markerAfter>${sep}?)(?=[A-Za-z\\d ])|(?<=\\d)(?<markerBefore2>${sep}?)[~${EN_DASH}${EM_DASH}-]{2,}(?<markerAfter2>${sep}?)(?=[A-Za-z ])`,
    "g"
  )
  const multiReplacement = spaced
    ? `$<markerBefore>$<markerBefore2> ${dash} $<markerAfter>$<markerAfter2>`
    : `$<markerBefore>$<markerBefore2>${dash}$<markerAfter>$<markerAfter2>`
  text = text.replace(multipleDashInWords, multiReplacement)

  // Handle dashes at start of line
  text = text.replace(new RegExp(`^(?<sepStart>${sep})?[-]+ `, "gm"), `$<sepStart>${dash} `)

  return text
}

/** Normalize spacing around em dashes for American style */
function normalizeEmDashSpacing(text: string, sep: string): string {
  // Only use curly quotes here - straight quotes will be converted by niceQuotes afterward
  // Using straight quotes would cause idempotency issues since they get converted
  const closingQuotes = `${RIGHT_SINGLE_QUOTE}${RIGHT_DOUBLE_QUOTE}`
  const openingQuotes = `${LEFT_SINGLE_QUOTE}${LEFT_DOUBLE_QUOTE}`
  // Closing punctuation that typically precedes attribution
  const closingPunctuation = `\\.\\?!…${RIGHT_SINGLE_QUOTE}${RIGHT_DOUBLE_QUOTE}"\\'`

  // Remove spaces around em-dashes ONLY between word characters (not after punctuation)
  // This preserves "attribution" patterns like: "quote" — Author
  // Pattern: word char, spaces, em-dash, spaces, word char
  const spacesAroundEM = new RegExp(
    `(?<before>\\w${sep}?)[ ]+${EM_DASH}[ ]+(?<after>${sep}?\\w)`,
    "g"
  )
  text = text.replace(spacesAroundEM, `$<before>${EM_DASH}$<after>`)

  // Also remove just leading or trailing spaces when between word chars
  const leadingSpace = new RegExp(
    `(?<before>\\w${sep}?)[ ]+${EM_DASH}(?<after>${sep}?\\w)`,
    "g"
  )
  text = text.replace(leadingSpace, `$<before>${EM_DASH}$<after>`)

  const trailingSpace = new RegExp(
    `(?<before>\\w${sep}?)${EM_DASH}[ ]+(?<after>${sep}?\\w)`,
    "g"
  )
  text = text.replace(trailingSpace, `$<before>${EM_DASH}$<after>`)

  // Add space before and after em dash when between closing and opening quotes
  // e.g., "Hello."—"World" → "Hello." — "World"
  // Match both spaced and unspaced for idempotency
  const quoteDashQuote = new RegExp(
    `(?<before>[${closingQuotes}]${sep}?) ?${EM_DASH} ?(?<after>${sep}?[${openingQuotes}])`,
    "g"
  )
  text = text.replace(quoteDashQuote, `$<before> ${EM_DASH} $<after>`)

  // Add spaces for attribution patterns: punctuation + em-dash + capital letter or [
  // e.g., "quote."—Author → "quote." — Author
  const attributionPattern = new RegExp(
    `(?<before>[${closingPunctuation}]${sep}?)${EM_DASH}(?<after>${sep}?[A-Z\\[])`,
    "g"
  )
  text = text.replace(attributionPattern, `$<before> ${EM_DASH} $<after>`)

  // Preserve space after em dash at start of line followed by capital letter
  const startOfLine = new RegExp(`^(?<markerBefore>${sep}?)${EM_DASH}(?<after>[A-Z0-9])`, "gm")
  text = text.replace(startOfLine, `$<markerBefore>${EM_DASH} $<after>`)

  return text
}

/**
 * Comprehensive dash replacement for typographic correctness.
 */
export function hyphenReplace(text: string, options: DashOptions = {}): string {
  const sep = options.separator ?? DEFAULT_SEPARATOR
  const dashStyle = options.dashStyle ?? "american"

  text = minusReplace(text, options)
  text = convertParentheticalDashes(text, sep, dashStyle)

  if (dashStyle === "american") {
    text = normalizeEmDashSpacing(text, sep)
  }

  text = enDashNumberRange(text, options)
  text = enDashDateRange(text, options)

  return text
}
