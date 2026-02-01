/**
 * Dash transformation: hyphens → em-dashes, en-dashes, minus signs.
 */

import { UNICODE_SYMBOLS, DEFAULT_SEPARATOR, ESCAPED_DEFAULT_SEPARATOR, wordBoundaryStart, wordBoundaryEnd } from "./constants.js"

export type DashStyle = "american" | "british" | "none"

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

export interface DashOptions {
  /** Boundary marker for HTML element boundaries. Default: "\uE000" */
  separator?: string
  /** "american" (unspaced em), "british" (spaced en), "none". Default: "american" */
  dashStyle?: DashStyle
}

const { EN_DASH, EM_DASH, MINUS, LEFT_DOUBLE_QUOTE, RIGHT_DOUBLE_QUOTE, LEFT_SINGLE_QUOTE, RIGHT_SINGLE_QUOTE } = UNICODE_SYMBOLS

/** Chars that prevent number range conversion when preceding (e.g., Llama-2-7B) */
export const numberRangeDisallowedPrefixes = ["-", EN_DASH, EM_DASH, MINUS] as const

export const months = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
].join("|")

/** Convert number ranges to en-dash. Skips >2 segments and ISO dates. */
export function enDashNumberRange(text: string, options: DashOptions = {}): string {
  const chr = options.separator ? escapeRegex(options.separator) : ESCAPED_DEFAULT_SEPARATOR
  const wb = wordBoundaryStart(chr)
  const wbe = wordBoundaryEnd(chr)

  // Escape dash-like chars for lookbehind: prevents matching after dashes (e.g., Llama-2-7B)
  const disallowed = numberRangeDisallowedPrefixes.map(c => c === "-" ? c : `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`).join("")

  // Positive ranges: 1-5, $100-$200, p.10-15
  text = text.replace(
    new RegExp(
      `${wb}(?<![${disallowed}a-zA-Z.])(?<start>(?:p\\.?|\\$)?\\d[\\d.,]*${chr}?)-(?<end>${chr}?\\$?\\d[\\d.,]*)(?!\\.\\d)(?<following>(?:${chr}?-${chr}?\\d+)*)(?<suffix>${chr}?[xKBTM])?${wbe}`,
      "g"
    ),
    (match, start, end, following, suffix = "") => {
      if (following) return match // >2 segments
      const s = start.replace(new RegExp(chr, "g"), "")
      const e = end.replace(new RegExp(chr, "g"), "")
      if (/^(?:19|20)\d{2}$/.test(s) && /^(?:0[1-9]|1[0-2])$/.test(e)) return match // ISO date
      return `${start}${EN_DASH}${end}${suffix || ""}`
    }
  )

  // Negative ranges: −5-5 → −5–5, −5--2 → −5–−2
  // Separate regex because MINUS isn't a word char, so \b in ${wb} would match after it
  text = text.replace(
    new RegExp(
      `(?<![a-zA-Z])(?<start>${MINUS}\\d[\\d.,]*${chr}?)-(?<neg>-)?(?<end>${chr}?\\d[\\d.,]*)(?<following>(?:${chr}?-${chr}?\\d+)*)(?<suffix>${chr}?[xKBTM])?${wbe}`,
      "g"
    ),
    (match, start, neg, end, following, suffix = "") => {
      if (following) return match
      return `${start}${EN_DASH}${neg ? MINUS : ""}${end}${suffix || ""}`
    }
  )

  return text
}

/** Convert month ranges to en-dash. */
export function enDashDateRange(text: string, options: DashOptions = {}): string {
  const chr = options.separator ? escapeRegex(options.separator) : ESCAPED_DEFAULT_SEPARATOR
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

/** Convert hyphens to minus signs in numeric contexts. */
export function minusReplace(text: string, options: DashOptions = {}): string {
  const chr = options.separator ?? DEFAULT_SEPARATOR
  return text.replaceAll(new RegExp(`(?<before>^|[\\s\\(${chr}""])-(?<num>\\s?\\d*\\.?\\d+)`, "gm"), `$<before>${MINUS}$<num>`)
}

/** Convert surrounded dashes to em/en dashes. */
function convertParentheticalDashes(text: string, sep: string, style: DashStyle): string {
  if (style === "none") return text
  const dash = style === "british" ? EN_DASH : EM_DASH
  const isSpaced = style === "british"

  text = text.replace(
    new RegExp(`(?<=[^\\s>]|^)(?:(?<m1>${sep}?)[ ]+|(?<m2>${sep}))[~${EN_DASH}${EM_DASH}-]+[ ]*(?<m3>${sep}?)(?:[ ]+|$)`, "g"),
    isSpaced ? `$<m1>$<m2> ${dash} $<m3>` : `$<m1>$<m2>${dash}$<m3>`
  )
  text = text.replace(
    new RegExp(`(?<=[A-Za-z])(?<m1>${sep}?)[~${EN_DASH}${EM_DASH}-]{2,}(?<m2>${sep}?)(?=[A-Za-z\\d ])|(?<=\\d)(?<m3>${sep}?)[~${EN_DASH}${EM_DASH}-]{2,}(?<m4>${sep}?)(?=[A-Za-z ])`, "g"),
    isSpaced ? `$<m1>$<m3> ${dash} $<m2>$<m4>` : `$<m1>$<m3>${dash}$<m2>$<m4>`
  )
  text = text.replace(new RegExp(`^(?<s>${sep})?[-]+ `, "gm"), `$<s>${dash} `)
  return text
}

/** Normalize em-dash spacing for American style. */
function normalizeEmDashSpacing(text: string, sep: string): string {
  const cq = `${RIGHT_SINGLE_QUOTE}${RIGHT_DOUBLE_QUOTE}`, oq = `${LEFT_SINGLE_QUOTE}${LEFT_DOUBLE_QUOTE}`
  const cp = `\\.\\?!…${cq}"\\'`

  // Remove spaces around em-dash between word chars
  text = text.replace(new RegExp(`(?<b>\\w${sep}?)[ ]+${EM_DASH}[ ]+(?<a>${sep}?\\w)`, "g"), `$<b>${EM_DASH}$<a>`)
  text = text.replace(new RegExp(`(?<b>\\w${sep}?)[ ]+${EM_DASH}(?<a>${sep}?\\w)`, "g"), `$<b>${EM_DASH}$<a>`)
  text = text.replace(new RegExp(`(?<b>\\w${sep}?)${EM_DASH}[ ]+(?<a>${sep}?\\w)`, "g"), `$<b>${EM_DASH}$<a>`)
  // Space between quotes: "Hello."—"World" → "Hello." — "World"
  text = text.replace(new RegExp(`(?<b>[${cq}]${sep}?) ?${EM_DASH} ?(?<a>${sep}?[${oq}])`, "g"), `$<b> ${EM_DASH} $<a>`)
  // Attribution: "quote."—Author → "quote." — Author
  text = text.replace(new RegExp(`(?<b>[${cp}]${sep}?)${EM_DASH}(?<a>${sep}?[A-Z\\[])`, "g"), `$<b> ${EM_DASH} $<a>`)
  // Start of line
  text = text.replace(new RegExp(`^(?<m>${sep}?)${EM_DASH}(?<a>[A-Z0-9])`, "gm"), `$<m>${EM_DASH} $<a>`)
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
