/**
 * Dash transformation: hyphens → em-dashes, en-dashes, minus signs.
 */

import escapeStringRegexp from "escape-string-regexp"
import { UNICODE_SYMBOLS, DEFAULT_SEPARATOR, ESCAPED_DEFAULT_SEPARATOR, LATIN_LETTERS, wordBoundaryStart, wordBoundaryEnd } from "./constants.js"

export type DashStyle = "american" | "british" | "none"

export interface DashOptions {
  /** Boundary marker for HTML element boundaries. Default: "\uE000" */
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

export const months = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
].join("|")

/** Convert number ranges to en-dash (e.g., "1-5" → "1–5"). */
export function enDashNumberRange(text: string, options: DashOptions = {}): string {
  const chr = options.separator ? escapeStringRegexp(options.separator) : ESCAPED_DEFAULT_SEPARATOR
  const wb = wordBoundaryStart(chr)
  const wbe = wordBoundaryEnd(chr)

  // Escape dash-like chars for lookbehind: prevents matching after dashes (e.g., Llama-2-7B)
  const disallowed = numberRangeDisallowedPrefixes.map(c => c === "-" ? c : `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`).join("")

  // Common currency symbols for price ranges
  const currencies = "$€£¥₹"

  // Build positive range pattern from readable components
  const phoneAreaCode = `(?<precedingAreaCode>\\d{3}-|\\(\\d{3}\\) ?)?`  // 555- or (555)
  const notAfterDash = `(?<![${disallowed}${LATIN_LETTERS}.])`           // prevent Llama-2-7B
  const rangeStart = `(?<start>(?:p\\.?|[${currencies}])?\\d[\\d.,]*${chr}?)`  // p.10, $100, 1,000
  const rangeEnd = `(?<end>${chr}?[${currencies}]?\\d[\\d.,]*)`          // 20, $200, 2,000
  const moreSegments = `(?<following>(?:${chr}?-${chr}?\\d+)*)`          // -4567 in phone numbers
  const unitSuffix = `(?<suffix>${chr}?(?:[AaPp][Mm]|[xKBTM]))?`         // am/pm, K/M/B

  // Positive ranges: 1-5, $100-$200, €5-€10, p.10-15
  const positiveRangePattern = [
    phoneAreaCode, wb, notAfterDash, rangeStart, "-", rangeEnd, moreSegments, unitSuffix, wbe
  ].join("")

  text = text.replace(
    new RegExp(positiveRangePattern, "g"),
    (match, precedingAreaCode, start, end, following, suffix = "") => {
      if (following) return match
      const startNum = start.replace(new RegExp(chr, "g"), "")
      const endNum = end.replace(new RegExp(chr, "g"), "")
      if (/^(?:19|20)\d{2}$/.test(startNum) && /^(?:0[1-9]|1[0-2])$/.test(endNum)) return match
      // Skip phone number patterns: 3 digits followed by 4 digits with preceding area code
      // e.g., 555-123-4567 or (555) 123-4567 where we're matching the "123-4567" part
      if (precedingAreaCode && /^\d{3}$/.test(startNum) && /^\d{4}$/.test(endNum)) return match
      // Skip US country code + area code pattern: 1-800, 1-888, etc.
      // These look like truncated phone numbers, not ranges
      if (/^1$/.test(startNum) && /^\d{3}$/.test(endNum)) return match
      return `${precedingAreaCode || ""}${start}${EN_DASH}${end}${suffix || ""}`
    }
  )

  // Negative ranges: −5-5 → −5–5, −5--2 → −5–−2
  // Separate regex because MINUS isn't a word char, so \b in ${wb} would match after it
  text = text.replace(
    new RegExp(
      `(?<![${LATIN_LETTERS}])(?<start>${MINUS}\\d[\\d.,]*${chr}?)-(?<neg>-)?(?<end>${chr}?\\d[\\d.,]*)(?<following>(?:${chr}?-${chr}?\\d+)*)(?<suffix>${chr}?[xKBTM])?${wbe}`,
      "g"
    ),
    (match, start, neg, end, following, suffix = "") => {
      if (following) return match
      return `${start}${EN_DASH}${neg ? MINUS : ""}${end}${suffix || ""}`
    }
  )

  return text
}

/** Convert month ranges to en-dash (e.g., "January-March" → "January–March"). */
export function enDashDateRange(text: string, options: DashOptions = {}): string {
  const chr = options.separator ? escapeStringRegexp(options.separator) : ESCAPED_DEFAULT_SEPARATOR
  const dashStyle = options.dashStyle ?? "american"
  const wb = wordBoundaryStart(chr)
  const wbe = wordBoundaryEnd(chr)

  return text.replace(
    new RegExp(`${wb}(?<startMonth>${months})(?<startYear>${chr}? \\d{4})?(?<preSep>${chr}?)(?<preSpace> ?)-(?<postSpace> ?)(?<postSep>${chr}?)(?<endMonth>${months})(?<endYear> \\d{4})?${wbe}`, "g"),
    (...args) => {
      const g = args.at(-1) as Record<string, string>
      const [pre, post] = dashStyle === "british" ? [" ", " "] : dashStyle === "none" ? [g.preSpace, g.postSpace] : ["", ""]
      return `${g.startMonth}${g.startYear || ""}${g.preSep}${pre}${EN_DASH}${post}${g.postSep}${g.endMonth}${g.endYear || ""}`
    }
  )
}

/** Convert hyphens to minus signs in numeric contexts (e.g., "-5" → "−5"). */
export function minusReplace(text: string, options: DashOptions = {}): string {
  const chr = escapeStringRegexp(options.separator ?? DEFAULT_SEPARATOR)

  // Pattern 1: Spaced math subtraction (e.g., "5 - 3" → "5 − 3")
  // Only when preceded by a digit - this distinguishes "5 - 3" from "Safari) - 9"
  text = text.replaceAll(
    new RegExp(`(?<=\\d${chr}?) - (?<num>${chr}?\\d*\\.?\\d+)`, "g"),
    ` ${MINUS} $<num>`
  )

  // Pattern 2: Direct negative numbers (e.g., "-5" → "−5", "(-3)" → "(−3)")
  // Match after: start of line, whitespace, (, separator, or quotes (straight or curly)
  // No space allowed between hyphen and digit
  text = text.replaceAll(
    new RegExp(`(?<before>^|[\\s\\("${chr}${LEFT_DOUBLE_QUOTE}${RIGHT_DOUBLE_QUOTE}])-(?<num>\\d*\\.?\\d+)`, "gm"),
    `$<before>${MINUS}$<num>`
  )

  return text
}

/**
 * Convert surrounded dashes to em/en dashes.
 * Handles patterns like "word - word" → "word—word" (Chicago) or "word – word" (Oxford).
 */
function convertParentheticalDashes(text: string, sep: string, style: DashStyle): string {
  if (style === "none") return text
  const localizedDash = style === "british" ? EN_DASH : EM_DASH
  const maybeSpace = style === "british" ? " " : ""
  const escapedSep = escapeStringRegexp(sep)

  // Convert spaced dashes: "word - word" or "word — word"
  text = text.replace(
    new RegExp(`(?<=[^\\s]|^)(?:(?<sepBefore>${escapedSep}?)[ ]+|(?<sepOnly>${escapedSep}))[~${EN_DASH}${EM_DASH}-]+[ ]*(?<sepAfter>${escapedSep}?)(?:[ ]+|$)`, "g"),
    `$<sepBefore>$<sepOnly>${maybeSpace}${localizedDash}${maybeSpace}$<sepAfter>`
  )
  // Convert multiple dashes: "word--word" or "word---word" or "quote"--"quote"
  const quoteChars = `"'${LEFT_DOUBLE_QUOTE}${RIGHT_DOUBLE_QUOTE}${LEFT_SINGLE_QUOTE}${RIGHT_SINGLE_QUOTE}`
  text = text.replace(
    new RegExp(`(?<=[${LATIN_LETTERS}\\d${quoteChars}])(?<sepBefore>${escapedSep}?)[~${EN_DASH}${EM_DASH}-]{2,}(?<sepAfter>${escapedSep}?)(?=[${LATIN_LETTERS}${quoteChars} ])`, "g"),
    `$<sepBefore>${maybeSpace}${localizedDash}${maybeSpace}$<sepAfter>`
  )
  // Convert dashes at start of line
  text = text.replace(new RegExp(`^(?<leadingSep>${escapedSep})?[-]+ `, "gm"), `$<leadingSep>${localizedDash} `)
  // British: convert unspaced em-dashes to spaced en-dashes (word—word → word – word)
  if (style === "british") {
    text = text.replace(
      new RegExp(`(?<=[${LATIN_LETTERS}.!?'"])(?<sepBefore>${escapedSep}?)${EM_DASH}(?<sepAfter>${escapedSep}?)(?=[${LATIN_LETTERS}])`, "g"),
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
  const escapedSep = escapeStringRegexp(sep)

  // Remove all spaces around em-dashes
  text = text.replace(
    new RegExp(`(?<before>${escapedSep}?)[ ]*${EM_DASH}[ ]*(?<after>${escapedSep}?)`, "g"),
    `$<before>${EM_DASH}$<after>`
  )

  // Preserve space after em-dash at start of line (e.g., attribution)
  text = text.replace(
    new RegExp(`^(?<sep>${escapedSep}?)${EM_DASH}(?<after>[A-Z0-9])`, "gm"),
    `$<sep>${EM_DASH} $<after>`
  )

  return text
}

/** Full dash transformation. */
export function hyphenReplace(text: string, options: DashOptions = {}): string {
  const sep = options.separator ?? DEFAULT_SEPARATOR
  const style = options.dashStyle ?? "american"
  text = minusReplace(text, options)
  text = convertParentheticalDashes(text, sep, style)
  if (style === "american") text = normalizeEmDashSpacing(text, sep)
  text = enDashNumberRange(text, options)
  text = enDashDateRange(text, options)
  return text
}
