import { cachedRegExp, DEFAULT_SEPARATOR, getEscapedSeparator, LATIN_LETTERS, UNICODE_SYMBOLS, wordBoundaryEnd, wordBoundaryStart } from "./constants.js"
import { namedGroups } from "./utils.js"

export const DASH_STYLES = ["american", "british", "none"] as const
export type DashStyle = (typeof DASH_STYLES)[number]

export interface DashOptions {
  /** Boundary marker for HTML element boundaries. Default: "\uE000\uE001" */
  separator?: string
  /** "american" (unspaced em), "british" (spaced en), "none". Default: "american" */
  dashStyle?: DashStyle
}

const { EN_DASH, EM_DASH, MINUS, LEFT_DOUBLE_QUOTE, RIGHT_DOUBLE_QUOTE, LEFT_SINGLE_QUOTE, RIGHT_SINGLE_QUOTE } = UNICODE_SYMBOLS

// Prevents false-positive ranges in model names like "Llama-2-7B".
export const numberRangeDisallowedPrefixes = ["-", EN_DASH, EM_DASH, MINUS] as const

// Non-ASCII dashes escaped to \uXXXX for safe embedding in [...] classes.
const DISALLOWED_PREFIX_CLASS_FRAGMENT = numberRangeDisallowedPrefixes
  .map((c) => (c === "-" ? c : `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`))
  .join("")

const months: readonly string[] = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
  // Abbreviated "May" omitted — the full name is already 3 letters
  "Jan", "Feb", "Mar", "Apr", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
]

const monthPattern = months.join("|")

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
      const groups = namedGroups<{
        precedingAreaCode?: string
        start: string
        end: string
        following?: string
        suffix?: string
      }>(args)
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
      const groups = namedGroups<{
        start: string
        neg?: string
        end: string
        following?: string
        suffix?: string
      }>(args)
      if (groups.following) return args[0] as string
      return `${groups.start}${EN_DASH}${groups.neg ? MINUS : ""}${groups.end}${groups.suffix ?? ""}`
    }
  )

  return text
}

export function enDashDateRange(text: string, options: DashOptions = {}): string {
  const dashStyle = options.dashStyle ?? "american"
  if (dashStyle === "none") return text
  const chr = getEscapedSeparator(options)
  const wb = wordBoundaryStart(chr)
  const wbe = wordBoundaryEnd(chr)

  // Atomic-optional year groups (lookahead + backref). The capture inside
  // the lookahead is locked in once matched, so the year group commits
  // without backtracking.
  const startYear = `(?=(?<startYear>${chr}? \\d{4})?)\\k<startYear>`
  const endYear = `(?=(?<endYear> \\d{4})?)\\k<endYear>`
  return text.replace(
    cachedRegExp(`${wb}(?<startMonth>${monthPattern})${startYear}(?<preSep>${chr}?)(?<preSpace> ?)-(?<postSpace> ?)(?<postSep>${chr}?)(?<endMonth>${monthPattern})${endYear}${wbe}`, "g"),
    (...args) => {
      const groups = namedGroups<{
        startMonth: string
        startYear?: string
        preSep: string
        endMonth: string
        endYear?: string
        postSep: string
      }>(args)
      const [pre, post] = dashStyle === "british" ? [" ", " "] : ["", ""]
      return `${groups.startMonth}${groups.startYear || ""}${groups.preSep}${pre}${EN_DASH}${post}${groups.postSep}${groups.endMonth}${groups.endYear || ""}`
    }
  )
}

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
    cachedRegExp(`(?<before>^|[\\s\\("'${LEFT_DOUBLE_QUOTE}${RIGHT_DOUBLE_QUOTE}${LEFT_SINGLE_QUOTE}${RIGHT_SINGLE_QUOTE}])-(?<num>\\d*\\.?\\d+)`, "gm"),
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

function convertParentheticalDashes(text: string, sep: string, style: DashStyle): string {
  const localizedDash = style === "british" ? EN_DASH : EM_DASH
  const maybeSpace = style === "british" ? " " : ""
  const escapedSep = getEscapedSeparator({ separator: sep })

  // Convert spaced dashes: "word - word" or "word — word"
  // When a separator follows the dash, preserve trailing spaces (they belong to the next text segment).
  // A single plain hyphen directly before a word character (through optional separators) is a
  // suspended/hanging hyphen ("Yes-men and -women"), not a parenthetical dash — skip it.
  // Em/en dashes and multiple hyphens can have zero trailing spaces.
  // `sepAfter` and `trailing` share one optional unit so a whitespace run
  // can only be assigned to it as a whole, keeping the match unambiguous.
  const spacedDashPattern = cachedRegExp(
    `(?<=[^\\s]|^)(?<sepBefore>${escapedSep}?)[ ]+(?:[${EN_DASH}${EM_DASH}][-${EN_DASH}${EM_DASH}]*|-{2,}|-(?!${escapedSep}*[${LATIN_LETTERS}\\d]))(?!${escapedSep}?-*${escapedSep}?>)[ ]*(?:(?<sepAfter>${escapedSep})(?<trailing>[ ]*))?(?=\\S|$)`, "g"
  )
  text = text.replace(spacedDashPattern, (_match, sepBefore, sepAfter, trailing) => {
    // sepAfter and trailing are undefined when the optional group didn't match.
    sepAfter = sepAfter ?? ""
    trailing = trailing ?? ""
    // Trailing space after a separator belongs to the next text node — keep it
    // regardless of style. Without a separator, the trailing space is part of
    // the current node's whitespace around the dash and gets consumed.
    const keepTrailing = sepAfter ? trailing : ""
    return `${sepBefore}${maybeSpace}${localizedDash}${maybeSpace}${sepAfter}${keepTrailing}`
  })
  // Convert dashes at text node boundaries: separator alone precedes dash (e.g., "word{sep}– rest")
  // Requires space after the dash to avoid matching number ranges like "1{sep}-{sep}5"
  text = text.replace(
    cachedRegExp(`(?<=[^\\s])(?<sepBefore>${escapedSep})[${EN_DASH}${EM_DASH}-]+[ ]+(?<sepAfter>${escapedSep}?)`, "g"),
    `$<sepBefore>${maybeSpace}${localizedDash}${maybeSpace}$<sepAfter>`
  )
  // Convert multiple dashes: "word--word" or "word---word" or "quote"--"quote"
  // Upper bound of 50 prevents ReDoS on pathological runs of dashes.
  const quoteChars = `"'${LEFT_DOUBLE_QUOTE}${RIGHT_DOUBLE_QUOTE}${LEFT_SINGLE_QUOTE}${RIGHT_SINGLE_QUOTE}`
  text = text.replace(
    cachedRegExp(`(?<=[${LATIN_LETTERS}\\d${quoteChars}])(?<sepBefore>${escapedSep}?)[${EN_DASH}${EM_DASH}-]{2,50}(?<sepAfter>${escapedSep}?)(?=[${LATIN_LETTERS}${quoteChars} ])`, "g"),
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

// TODO: Handle interrupted-then-resumed speech within quotes, where Chicago
// allows a space after the dash: "Don't inter— Hey! Who threw that?"
function normalizeEmDashSpacing(text: string, sep: string): string {
  const escapedSep = getEscapedSeparator({ separator: sep })

  // Remove all spaces around em-dashes. The `\S|^` / `\S|$` boundary
  // anchors restrict the match to dashes adjacent to non-whitespace.
  text = text.replace(
    cachedRegExp(`(?<=\\S|^)(?<before>${escapedSep}?)[ ]*${EM_DASH}[ ]*(?<after>${escapedSep}?)(?=\\S|$)`, "g"),
    `$<before>${EM_DASH}$<after>`
  )

  // Preserve space after em-dash at start of line (e.g., attribution)
  text = text.replace(
    cachedRegExp(`^(?<sep>${escapedSep}?)${EM_DASH}(?<after>[A-Z0-9])`, "gm"),
    `$<sep>${EM_DASH} $<after>`
  )

  return text
}

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
