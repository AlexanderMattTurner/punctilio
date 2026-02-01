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

const { EN_DASH, EM_DASH, MINUS } = UNICODE_SYMBOLS

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
 */
export function enDashNumberRange(text: string, options: DashOptions = {}): string {
  const chr = options.separator
    ? escapeRegex(options.separator)
    : ESCAPED_DEFAULT_SEPARATOR
  const wb = wordBoundaryStart(chr)
  const wbe = wordBoundaryEnd(chr)
  return text.replace(
    new RegExp(
      `${wb}(?<![-a-zA-Z.])(?<startNum>(?:p\\.?|\\$)?\\d[\\d.,]*${chr}?)-(?<endNum>${chr}?\\$?\\d[\\d.,]*)(?!\\.\\d)(?<suffix>${chr}?[xKBTM])?${wbe}`,
      "g"
    ),
    `$<startNum>${EN_DASH}$<endNum>$<suffix>`
  )
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
  const multipleDashInWords = new RegExp(
    `(?<=[A-Za-z\\d])(?<markerBefore>${sep}?)[~${EN_DASH}${EM_DASH}-]{2,}(?<markerAfter>${sep}?)(?=[A-Za-z\\d ])`,
    "g"
  )
  const multiReplacement = spaced
    ? `$<markerBefore> ${dash} $<markerAfter>`
    : `$<markerBefore>${dash}$<markerAfter>`
  text = text.replace(multipleDashInWords, multiReplacement)

  // Handle dashes at start of line
  text = text.replace(new RegExp(`^(?<sepStart>${sep})?[-]+ `, "gm"), `$<sepStart>${dash} `)

  return text
}

/** Normalize spacing around em dashes for American style */
function normalizeEmDashSpacing(text: string, sep: string): string {
  const spacesAroundEM = new RegExp(
    `(?<markerBefore>${sep}?)[ ]*${EM_DASH}[ ]*(?<markerAfter>${sep}?)[ ]*`,
    "g"
  )
  text = text.replace(spacesAroundEM, `$<markerBefore>${EM_DASH}$<markerAfter>`)

  // Add space after em dash following quotation marks
  const postQuote = new RegExp(`(?<quote>[.!?]${sep}?['"'"]${sep}?|…)${spacesAroundEM.source}`, "g")
  text = text.replace(postQuote, `$<quote> $<markerBefore>${EM_DASH}$<markerAfter> `)

  // Preserve space after em dash at start of line
  const startOfLine = new RegExp(`^${spacesAroundEM.source}(?<after>[A-Z0-9])`, "gm")
  text = text.replace(startOfLine, `$<markerBefore>${EM_DASH}$<markerAfter> $<after>`)

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
