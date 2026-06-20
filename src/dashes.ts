import { cachedRegExp, DEFAULT_SEPARATOR, LATIN_LETTERS, UNICODE_SYMBOLS } from "./constants.js"
import { boundaryCountAt, type ProseView, replaceAllInView, type ReplaceAllOptions, withProseView } from "./prose-view.js"
import { namedGroups } from "./utils.js"

export const DASH_STYLES = ["american", "british", "none"] as const
export type DashStyle = (typeof DASH_STYLES)[number]

export interface DashOptions {
  /** Boundary marker for HTML element boundaries. Default: "" */
  separator?: string
  /** "american" (unspaced em), "british" (spaced en), "none". Default: "american" */
  dashStyle?: DashStyle
}

const { EN_DASH, EM_DASH, MINUS, MULTIPLICATION, PLUS_MINUS, SUPERSCRIPT_ST, SUPERSCRIPT_ND, SUPERSCRIPT_RD, SUPERSCRIPT_TH, LEFT_DOUBLE_QUOTE, RIGHT_DOUBLE_QUOTE, LEFT_SINGLE_QUOTE, RIGHT_SINGLE_QUOTE } = UNICODE_SYMBOLS

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

const WORD_CHAR_RE = /\w/
const LATIN_LETTER_RE = new RegExp(`[${LATIN_LETTERS}]`)

/**
 * Runs one boundary-gated regex pass over the view and commits it immediately.
 * v4 chained `text.replace` calls, each operating on the previous pass's full
 * output; committing after every pass reproduces that sequencing so a later
 * pass sees the earlier edits and never queues an overlapping edit.
 */
function pass(
  view: ProseView,
  regex: RegExp,
  replacer: (match: RegExpExecArray, view: ProseView) => string | null,
  options?: ReplaceAllOptions,
): void {
  replaceAllInView(view, regex, replacer, options)
  view.commit()
}

// ---------------------------------------------------------------------------
// Boundary-tolerance helpers over a ProseView
//
// v4 wove `${escapedSep}?` into patterns to tolerate the sentinel at specific
// positions. Over a clean ProseView, `replaceAllInView` skips any match with an
// interior boundary unless `allowBoundaries` opts in. Each pass below builds an
// `allowBoundaries` callback that admits a match only when every interior
// boundary sits at a position where the v4 pattern carried a separator weave.
// ---------------------------------------------------------------------------

/** Interior boundary offsets of a match, strictly inside (matchStart, matchEnd). */
function interiorBoundaryOffsets(match: RegExpExecArray, view: ProseView): number[] {
  const start = match.index
  const end = match.index + match[0].length
  const offsets: number[] = []
  for (const boundary of view.boundaries) {
    if (boundary > start && boundary < end) offsets.push(boundary)
    else if (boundary >= end) break
  }
  return offsets
}

/**
 * True iff every interior boundary of the match lands on a tolerated offset,
 * with no offset carrying more boundaries than its budget. A v4 `${chr}?` slot
 * tolerates exactly one boundary; two stacked boundaries (an empty fragment)
 * exceed the single-separator budget and block the match, as in v4.
 */
function interiorBoundariesAllowed(
  match: RegExpExecArray,
  view: ProseView,
  tolerated: Map<number, number>,
): boolean {
  const counts = new Map<number, number>()
  for (const offset of interiorBoundaryOffsets(match, view)) {
    counts.set(offset, (counts.get(offset) ?? 0) + 1)
  }
  for (const [offset, count] of counts) {
    const budget = tolerated.get(offset)
    if (budget === undefined || count > budget) return false
  }
  return true
}

/** Separators tolerated by the word-boundary helpers (mirrors constants.ts). */
const MAX_BOUNDARY_SEPARATORS = 3

/**
 * Reproduces `wordBoundaryStart` = `(?<!\w${sep}{0,3})\b` at the marked position
 * `matchStart` (the start char is a word char — a digit). The `\b` requires a
 * non-word char to its left (a separator counts as non-word); the negative
 * lookbehind additionally blocks when a word char sits within
 * {@link MAX_BOUNDARY_SEPARATORS} stacked boundaries to the left.
 */
function wordBoundaryStartOk(view: ProseView, matchStart: number): boolean {
  if (matchStart === 0) return true
  const nb = boundaryCountAt(view, matchStart)
  const prev = view.text[matchStart - 1]
  const prevWord = prev !== undefined && WORD_CHAR_RE.test(prev)
  if (nb === 0) return !prevWord // `\b` needs a non-word char immediately left
  // A separator sits left (non-word) so `\b` holds; the lookbehind blocks only
  // when a word char is within ≤MAX boundaries.
  return !prevWord || nb > MAX_BOUNDARY_SEPARATORS
}

/**
 * Reproduces `wordBoundaryEnd` = `\b(?!${sep}{0,3}\w)` at the marked position
 * `pos`. The `\b` requires a word/non-word transition (a separator counts as
 * non-word); the negative lookahead blocks when a word char sits within
 * {@link MAX_BOUNDARY_SEPARATORS} stacked boundaries to the right.
 */
function wordBoundaryEndOk(view: ProseView, pos: number): boolean {
  const text = view.text
  // `wordBoundaryEndOk` is only ever called at the end of a digit run, so `pos`
  // is always ≥ 1 and `text[pos - 1]` is a real char.
  const prevChar = text[pos - 1] as string
  const leftWord = WORD_CHAR_RE.test(prevChar)
  const nb = boundaryCountAt(view, pos)
  const nextClean = text[pos]
  const nextCleanWord = nextClean !== undefined && WORD_CHAR_RE.test(nextClean)
  // The marked char right after pos is a separator when nb > 0 (non-word).
  const rightWord = nb > 0 ? false : nextCleanWord
  if (leftWord === rightWord) return false // no `\b`
  // `(?!${sep}{0,3}\w)`: a word char within ≤3 boundaries to the right blocks.
  return !(nb <= MAX_BOUNDARY_SEPARATORS && nextCleanWord)
}

// ---------------------------------------------------------------------------
// Number ranges
// ---------------------------------------------------------------------------

const CURRENCY_RE = /[$€£¥₹]/

/** Convert number ranges to en-dash (e.g., "1-5" → "1–5"). */
export function enDashNumberRange(text: string, options: DashOptions = {}): string {
  const separator = options.separator ?? DEFAULT_SEPARATOR
  return withProseView(text, separator, (view) => {
    convertPositiveRanges(view)
    convertNegativeRanges(view)
  })
}

/**
 * v4's positive-range regex was `phoneAreaCode? \b (?:p\.?|[currency])?\d[\d.,]*
 * -{1,3} [currency]?\d[\d.,]* (?:${chr}?[-−]${chr}?\d+)* (?:[AaPp][Mm]|[xKBTM])?
 * \b`, scanned with the `g` flag. The lookbehinds (`notAfterDash`) and the
 * separator weaves cannot survive over clean text, and — critically — the
 * `g`-flag consume/advance behaviour determines which sub-ranges a later pass
 * sees. The scan below reproduces it: at each offset it attempts the structural
 * match (boundary-aware), consuming its span on success (whether or not the
 * dash converts) and advancing one character otherwise. So a multi-segment
 * number whose head fails to form a structural match (e.g. boundary-broken
 * "2024-01-15") still exposes a later sub-range ("01-15"), while a structurally
 * matching but non-converting number hides its inner dashes.
 */
function convertPositiveRanges(view: ProseView): void {
  const text = view.text
  let i = 0
  while (i < text.length) {
    const span = matchPositiveRangeAt(view, i)
    i = span === null ? i + 1 : Math.max(span, i + 1)
  }
  view.commit()
}

/**
 * Attempts v4's `phoneAreaCode? \b rangeStart -{1,3} rangeEnd following* suffix?
 * \b` structural match beginning at clean offset `i`, converting the dash when
 * v4's gates pass. Returns the consumed end offset on a structural match (so the
 * scan skips it), or null when no structural match begins at `i`.
 */
function matchPositiveRangeAt(view: ProseView, i: number): number | null {
  // Optional phoneAreaCode (`\d{3}-` or `(\d{3}) `); when it ends in a dash that
  // dash can instead be the range dash, so both interpretations are tried. v4's
  // `rangeStart` carries no leading separator slot, so a boundary right where it
  // would begin (just past the area code) invalidates the area-code reading: v4
  // falls back to treating the area-code digits as the range start.
  const areaCode = readPhoneAreaCode(view, i)
  const startStarts = areaCode === null || view.hasBoundary(i + areaCode) ? [i] : [i + areaCode, i]
  for (const startStart of startStarts) {
    const span = matchRangeBody(view, startStart)
    if (span !== null) return span
  }
  return null
}

const THREE_DIGITS_RE = /^\d\d\d/
const THREE_DIGITS_IN_PARENS_RE = /^\(\d\d\d\)/

/** v4's `phoneAreaCode` = `\d{3}-|\(\d{3}\) ?` at `i`; returns its length or null. */
function readPhoneAreaCode(view: ProseView, i: number): number | null {
  const text = view.text
  // `\d{3}-` with no separator woven into the digits or before the dash.
  if (THREE_DIGITS_RE.test(text.slice(i, i + 3)) && text[i + 3] === "-"
    && !view.hasBoundary(i + 1) && !view.hasBoundary(i + 2) && !view.hasBoundary(i + 3)) {
    return 4
  }
  // `(\d{3})` with an optional trailing space.
  if (THREE_DIGITS_IN_PARENS_RE.test(text.slice(i, i + 5))) {
    return text[i + 5] === " " ? 6 : 5
  }
  return null
}

/**
 * Matches `\b rangeStart -{1,3} rangeEnd following* suffix? \b` boundary-aware,
 * beginning the start at `startStart`. Converts the dash on a v4-converting
 * match. Returns the consumed end offset (structural span end) or null.
 */
function matchRangeBody(view: ProseView, startStart: number): number | null {
  const text = view.text
  // rangeStart = `(?:p\.?|[currency])?\d[\d.,]*`, anchored at a `\b`.
  const start = readStartRun(view, startStart)
  if (start === null) return null
  const startSpanEnd = startStart + start.length
  // One `${chr}?` between start and the dash tolerates a single boundary there.
  if (boundaryCountAt(view, startSpanEnd) > 1) return null
  // Dash run of 1..3 hyphens that never spans an interior boundary (a boundary
  // between two hyphens truncates the run, as in v4's `-{1,3}`).
  if (text[startSpanEnd] !== "-") return null
  let dashEnd = startSpanEnd + 1
  while (text[dashEnd] === "-" && dashEnd - startSpanEnd < 3 && !view.hasBoundary(dashEnd)) dashEnd++
  if (boundaryCountAt(view, dashEnd) > 1) return null

  // `readStartRun` already stops at the first interior boundary, so the start
  // span is boundary-free and its clean digits are the whole run.
  const startDigits = text.slice(startStart, startSpanEnd)
  if (!wordBoundaryStartOk(view, startStart)) return null
  if (!notAfterDashOk(view, startStart)) return null

  const end = readEndRun(view, dashEnd)
  if (end === null) return null
  // v4's greedy end `[\d.,]*` and greedy `following*` backtrack together; the
  // structural match commits at the longest end whose tail completes.
  for (let len = end.length; len >= end.minLen; len--) {
    const endPos = end.firstDigitStart + len
    const tail = resolvePositiveTail(view, endPos)
    if (tail === null) continue
    const endStr = text.slice(dashEnd, endPos)
    if (tail.followingEmpty && rangeNumbersConvert(startDigits, endStr)) {
      view.replace(startSpanEnd, dashEnd, EN_DASH)
    }
    return tail.consumedEnd
  }
  return null
}

/**
 * v4's `(?:p\.?|[currency])?\d[\d.,]*` start run, boundary-truncated. v4's `wb`
 * (`(?<!\w${chr}{0,3})\b`) anchors the start at a word boundary, so the currency
 * alternative is unreachable: a leading currency symbol is non-word, and the only
 * `\b` sits after it, at the digit — so the currency is never part of `start`
 * (e.g. "$100-2000" reads start "100", which the 3+4 phone gate then blocks). The
 * `p`/`p.` prefix is a word char, so it can begin the run at a word boundary.
 */
function readStartRun(view: ProseView, pos: number): { length: number } | null {
  const text = view.text
  let i = pos
  if (text[i] === "p") {
    // v4's `p\.?\d` is contiguous (no separator slot), so a boundary between `p`,
    // an optional `.`, and the first digit breaks the prefix.
    if (view.hasBoundary(i + 1)) return null
    i++
    if (text[i] === ".") {
      if (view.hasBoundary(i + 1)) return null
      i++
    }
  }
  // v4's `\d` is required after the optional `p\.?` prefix. The prefix chars are
  // never digits, so a missing digit here means no start run begins.
  if (!/\d/.test(text[i] ?? "")) return null
  i++
  while (/[\d.,]/.test(text[i] ?? "") && !view.hasBoundary(i)) i++
  return { length: i - pos }
}

interface EndRun {
  /** Clean offset of the first end digit (past an optional currency symbol). */
  firstDigitStart: number
  /** Length of the `[\d.,]` run from `firstDigitStart`, boundary-truncated. */
  length: number
  /** Minimum end length: 1 digit (`\d` is required). */
  minLen: number
}

/** v4's `[currency]?\d[\d.,]*` end run starting at `pos`, boundary-truncated. */
function readEndRun(view: ProseView, pos: number): EndRun | null {
  const text = view.text
  let i = pos
  if (CURRENCY_RE.test(text[i] ?? "")) {
    // v4 has no separator slot between the currency symbol and the digit.
    if (view.hasBoundary(i + 1)) return null
    i++
  }
  if (!/\d/.test(text[i] ?? "")) return null
  const firstDigitStart = i
  i++
  while (/[\d.,]/.test(text[i] ?? "") && !view.hasBoundary(i)) i++
  return { firstDigitStart, length: i - firstDigitStart, minLen: 1 }
}

interface ResolvedTail {
  followingEmpty: boolean
  /** End offset of the whole structural tail (following + optional suffix). */
  consumedEnd: number
}

/**
 * Resolves the tail at `endPos`: finds the longest `following` whose
 * `suffix? wbe` completes (v4's greedy choice). `followingEmpty` reports whether
 * that following is empty (the convert condition); `consumedEnd` is the tail's
 * end including any suffix (for the scan's consume/advance). Returns null when
 * no following completes.
 */
function resolvePositiveTail(view: ProseView, endPos: number): ResolvedTail | null {
  const candidates = followingCandidates(view, endPos, true)
  for (let i = candidates.length - 1; i >= 0; i--) {
    const suffixEnd = suffixWbeEnd(view, candidates[i], true)
    if (suffixEnd !== null) {
      return { followingEmpty: i === 0, consumedEnd: suffixEnd }
    }
  }
  return null
}


/**
 * Negative ranges: −5-5 → −5–5, −5--2 → −5–−2. A separate hand scan (not a regex)
 * because the end run, like v4's `(?<end>${chr}?\d[\d.,]*)`, must truncate at node
 * boundaries before its tail is resolved: over clean text a regex would fuse
 * separator-split digits into one run (e.g. "8{sep}{sep}{sep}{sep}{sep}0" reads as
 * "80") and mis-place or miss the conversion. The scan mirrors `matchRangeBody`:
 * at each MINUS-led start it resolves the longest end whose `following* suffix?
 * wbe` tail completes, converting only when that tail leaves `following` empty.
 */
function convertNegativeRanges(view: ProseView): void {
  const text = view.text
  let i = 0
  while (i < text.length) {
    if (text[i] === MINUS) {
      const span = matchNegativeRangeAt(view, i)
      if (span !== null) {
        i = Math.max(span, i + 1)
        continue
      }
    }
    i++
  }
  view.commit()
}

/**
 * Attempts v4's `(?<![LAT]) ${MINUS}\d[\d.,]* -{1,3} -? end following* suffix? wbe`
 * beginning the MINUS at clean offset `i`. Converts the dash run when v4's gates
 * pass. Returns the consumed structural end offset, or null when no match begins.
 */
function matchNegativeRangeAt(view: ProseView, i: number): number | null {
  const text = view.text
  // v4's `(?<![LAT])`: a Latin letter directly before the MINUS (no intervening
  // boundary, which would hide it) blocks the match.
  if (boundaryCountAt(view, i) === 0) {
    const before = text[i - 1]
    if (before !== undefined && LATIN_LETTER_RE.test(before)) return null
  }

  // start = `${MINUS}\d[\d.,]*${chr}?`: the digits after MINUS must not cross a
  // boundary (v4's `start` body has no separator slot before its trailing one).
  if (!/\d/.test(text[i + 1] ?? "")) return null
  let startEnd = i + 1
  while (/[\d.,]/.test(text[startEnd] ?? "") && !view.hasBoundary(startEnd)) startEnd++
  // One `${chr}?` between start and the dash tolerates a single boundary there.
  if (boundaryCountAt(view, startEnd) > 1) return null
  if (text[startEnd] !== "-") return null

  // `-{1,3}?` then optional `(?<neg>-)`: a 1..3 hyphen run with no interior
  // boundary, the last of which becomes `neg` when two or more hyphens are present.
  let dashRunEnd = startEnd + 1
  while (text[dashRunEnd] === "-" && dashRunEnd - startEnd < 3 && !view.hasBoundary(dashRunEnd)) dashRunEnd++
  const dashRunLen = dashRunEnd - startEnd
  const hasNeg = dashRunLen >= 2
  const negEnd = dashRunEnd
  // The `(?<end>${chr}?...)` head separator slot tolerates one boundary.
  if (boundaryCountAt(view, negEnd) > 1) return null

  const end = readNegEndRun(view, negEnd)
  if (end === null) return null
  // v4's greedy end and `following*` backtrack together; commit at the longest end
  // whose tail completes, converting only when that tail's `following` is empty.
  for (let len = end.length; len >= 1; len--) {
    const endPos = end.firstDigitStart + len
    const candidates = followingCandidates(view, endPos, false)
    for (let c = candidates.length - 1; c >= 0; c--) {
      const suffixEnd = suffixWbeEnd(view, candidates[c], false)
      if (suffixEnd === null) continue
      if (c === 0) {
        view.replace(startEnd, negEnd, `${EN_DASH}${hasNeg ? MINUS : ""}`)
      }
      return suffixEnd
    }
  }
  return null
}

interface NegEndRun {
  firstDigitStart: number
  length: number
}

/** v4's negative `end` body `\d[\d.,]*` starting at `pos`, boundary-truncated. */
function readNegEndRun(view: ProseView, pos: number): NegEndRun | null {
  const text = view.text
  if (!/\d/.test(text[pos] ?? "")) return null
  let i = pos + 1
  while (/[\d.,]/.test(text[i] ?? "") && !view.hasBoundary(i)) i++
  return { firstDigitStart: pos, length: i - pos }
}

/**
 * Boundary-aware `following` end positions, shortest (empty) first, walking
 * segments `${chr}?[-(−)]${chr}?\d+`. Separators are zero-width in clean text;
 * each `${chr}?` tolerates one boundary, and each `\d+` stops at a boundary.
 * `allowMinus` admits a MINUS as a segment's dash (positive ranges).
 */
function followingCandidates(view: ProseView, endSpanEnd: number, allowMinus: boolean): number[] {
  const candidates = [endSpanEnd]
  let pos = endSpanEnd
  for (;;) {
    if (boundaryCountAt(view, pos) > 1) break
    const dashCh = view.text[pos]
    if (dashCh !== "-" && !(allowMinus && dashCh === MINUS)) break
    const digitStart = pos + 1
    if (boundaryCountAt(view, digitStart) > 1) break
    if (!/\d/.test(view.text[digitStart] ?? "")) break
    let end = digitStart + 1
    while (/\d/.test(view.text[end] ?? "") && !view.hasBoundary(end)) end++
    pos = end
    candidates.push(pos)
  }
  return candidates
}

/**
 * v4's `(?<suffix>${chr}?(?:[AaPp][Mm]|[xKBTM]))?${wbe}` at `pos`. Returns the
 * end offset after the optional suffix when the tail completes (wbe passes), or
 * null when it does not.
 */
function suffixWbeEnd(view: ProseView, pos: number, allowAmPm: boolean): number | null {
  if (wordBoundaryEndOk(view, pos)) return pos
  // An optional suffix: one ${chr}? (zero-width, ≤1 boundary) then am/pm or one
  // of x/K/B/T/M, followed by wbe. The suffix letters sit at the clean `pos`.
  if (boundaryCountAt(view, pos) > 1) return null
  const text = view.text
  // `[AaPp][Mm]` is contiguous in v4 — a boundary between the two letters breaks
  // the suffix.
  if (allowAmPm && /[ap]/i.test(text[pos] ?? "") && /m/i.test(text[pos + 1] ?? "") && !view.hasBoundary(pos + 1)) {
    return wordBoundaryEndOk(view, pos + 2) ? pos + 2 : null
  }
  if (/[xKBTM]/.test(text[pos] ?? "")) {
    return wordBoundaryEndOk(view, pos + 1) ? pos + 1 : null
  }
  return null
}

const NOT_AFTER_DASH_RE = new RegExp(`[${DISALLOWED_PREFIX_CLASS_FRAGMENT}${LATIN_LETTERS}${MULTIPLICATION}${PLUS_MINUS}.+]`)

/**
 * v4's `notAfterDash` was a single-char negative lookbehind. A node boundary
 * immediately before the start hides the clean char (v4 saw the separator, not
 * the dash/letter), so the guard only fires when a disallowed clean char sits
 * directly before the start with no intervening boundary.
 */
function notAfterDashOk(view: ProseView, startOffset: number): boolean {
  if (startOffset === 0) return true
  if (boundaryCountAt(view, startOffset) > 0) return true
  const prev = view.text[startOffset - 1]
  return prev === undefined || !NOT_AFTER_DASH_RE.test(prev)
}

/** v4 range-number gates: reject year-month, phone-shaped, and toll-free pairs. */
function rangeNumbersConvert(startNum: string, endNum: string): boolean {
  if (/^(?:19|20)\d{2}$/.test(startNum) && /^(?:0[1-9]|1[0-2])$/.test(endNum)) return false
  // Skip 3+4 digit phone-shaped patterns (555-1234, or the second half of
  // 555-123-4567). Thousands-grouped endings (1,234 / 1.234) keep their
  // internal separator and so fail /^\d{4}$/, falling through to convert as
  // ranges.
  if (/^\d{3}$/.test(startNum) && /^\d{4}$/.test(endNum)) return false
  // Skip US toll-free prefix pattern: 1-800, 1-888, 1-877, etc. Only the seven
  // real toll-free codes (800, 888, 877, 866, 855, 844, 833) are blocked, so
  // genuine ranges like 1-850 or 1-810 still en-dash.
  if (/^1$/.test(startNum) && /^8(?:00|88|77|66|55|44|33)$/.test(endNum)) return false
  return true
}

// ---------------------------------------------------------------------------
// Date ranges
// ---------------------------------------------------------------------------

/** Convert month ranges to en-dash (e.g., "January-March" → "January–March"). */
export function enDashDateRange(text: string, options: DashOptions = {}): string {
  const dashStyle = options.dashStyle ?? "american"
  if (dashStyle === "none") return text
  const separator = options.separator ?? DEFAULT_SEPARATOR
  const [pre, post] = dashStyle === "british" ? [" ", " "] : ["", ""]

  return withProseView(text, separator, (view) => {
    // Atomic-optional year groups (lookahead + backref). The capture inside the
    // lookahead is locked in once matched, so the year group commits without
    // backtracking.
    const startYear = `(?=(?<startYear> \\d{4})?)\\k<startYear>`
    const endYear = `(?=(?<endYear> \\d{4})?)\\k<endYear>`
    const pattern = `\\b(?<startMonth>${monthPattern})${startYear}(?<preSpace> ?)-(?<postSpace> ?)(?<endMonth>${monthPattern})${endYear}\\b`
    pass(
      view,
      cachedRegExp(pattern, "g"),
      (match, v) => {
        const groups = namedGroups<{
          startMonth: string
          startYear?: string
          preSpace: string
          postSpace: string
          endMonth: string
          endYear?: string
        }>(matchArgs(match))
        // Replace `[preSpace]-[postSpace]` (the dash and its spaces) with the
        // styled en-dash, leaving the months and any boundaries around them.
        const startLen = groups.startMonth.length + (groups.startYear?.length ?? 0)
        const dashSpan = groups.preSpace.length + 1 + groups.postSpace.length
        const dashStart = match.index + startLen
        v.replace(dashStart, dashStart + dashSpan, `${pre}${EN_DASH}${post}`)
        return null
      },
      {
        allowBoundaries: (match, v) => {
          const groups = namedGroups<{
            startMonth: string
            startYear?: string
            preSpace: string
            postSpace: string
            endMonth: string
            endYear?: string
          }>(matchArgs(match))
          const startLen = groups.startMonth.length + (groups.startYear?.length ?? 0)
          // v4 tolerated one separator after the start year (`preSep`) and one
          // before the end month (`postSep`), bracketing the dash and spaces.
          const dashStart = match.index + startLen
          const dashEnd = dashStart + groups.preSpace.length + 1 + groups.postSpace.length
          const tolerated = new Map<number, number>()
          tolerated.set(dashStart, 1)
          tolerated.set(dashEnd, 1)
          if (!interiorBoundariesAllowed(match, v, tolerated)) return false
          return wordBoundaryStartOk(v, match.index) && wordBoundaryEndOk(v, match.index + match[0].length)
        },
      },
    )
  })
}

// ---------------------------------------------------------------------------
// Minus signs
// ---------------------------------------------------------------------------

/** Convert hyphens to minus signs in numeric contexts (e.g., "-5" → "−5"). */
export function minusReplace(text: string, options: DashOptions = {}): string {
  const separator = options.separator ?? DEFAULT_SEPARATOR
  return withProseView(text, separator, (view) => {
    minusSubtractionOfNegative(view)
    minusSpacedSubtraction(view)
    minusDirectNegative(view)
  })
}

/** Pattern 1a/1b: spaced math subtraction after a digit (`5 - 3`, `5 - -3`). */
function minusSubtractionOfNegative(view: ProseView): void {
  // "5 - -3" → "5 − −3"; the negative hyphen is consumed first. v4's `${chr}?`
  // before `num` tolerates one boundary there (the `- -` prefix has 4 chars).
  pass(
    view,
    cachedRegExp(`(?<=\\d) - -(?<num>\\d*\\.?\\d+)`, "g"),
    (match, v) => {
      // Replace only the ` - -` prefix; `num` (which may carry interior
      // boundaries v4 truncated at) stays untouched.
      if (!minusSubtractionPrefixOk(match, v, 4)) return null
      v.replace(match.index, match.index + 4, ` ${MINUS} ${MINUS}`)
      return null
    },
    { allowBoundaries: () => true },
  )
}

function minusSpacedSubtraction(view: ProseView): void {
  // "5 - 3" → "5 − 3"; only after a digit ("5 - 3" not "Safari) - 9").
  pass(
    view,
    cachedRegExp(`(?<=\\d) - (?<num>\\d*\\.?\\d+)`, "g"),
    (match, v) => {
      if (!minusSubtractionPrefixOk(match, v, 3)) return null
      v.replace(match.index, match.index + 3, ` ${MINUS} `)
      return null
    },
    { allowBoundaries: () => true },
  )
}

const NUM_BODY_RE = /^\d*\.?\d+/

/**
 * v4's subtraction patterns wove one `${chr}?` after the leading digit (in the
 * lookbehind, at the match start) and one before `num` (`(?<num>${chr}?\d*\.?\d+)`).
 * The `${chr}?-` prefix span ([match.index, match.index + prefixLen)) must stay
 * separator-free; one boundary may sit at `num`'s head. v4's `num` body
 * (`\d*\.?\d+`) carries no separator slot, so it stops at the first interior
 * boundary: a boundary that truncates `num` to a still-valid number (e.g. "12"
 * in "5 - 12{sep}5") leaves v4 matching, but one that strips the mandatory `\d+`
 * (e.g. "." in "5 - .{sep}5") breaks v4's match. The targeted edit only rewrites
 * the ` - ` prefix, so a converting match must keep v4's `num` satisfiable.
 */
function minusSubtractionPrefixOk(match: RegExpExecArray, view: ProseView, prefixLen: number): boolean {
  // The `${chr}?` in v4's lookbehind (`(?<=\d${chr}?)`) sits at the match start
  // between the leading digit and the space; it tolerates at most one boundary.
  if (boundaryCountAt(view, match.index) > 1) return false
  const numStart = match.index + prefixLen
  for (const b of view.boundaries) {
    if (b > match.index && b < numStart) return false
  }
  // The `${chr}?` before `num` tolerates at most one boundary at the num head.
  if (boundaryCountAt(view, numStart) > 1) return false
  // v4's `num` stops at the first interior boundary; the clean run up to it must
  // still satisfy `\d*\.?\d+` (the mandatory trailing `\d+`).
  const numEnd = match.index + match[0].length
  let truncatedEnd = numEnd
  for (const b of view.boundaries) {
    if (b > numStart && b < numEnd) { truncatedEnd = b; break }
    if (b >= numEnd) break
  }
  return NUM_BODY_RE.test(view.text.slice(numStart, truncatedEnd))
}

const MINUS_BEFORE_CLASS_RE = new RegExp(`[\\s("'${LEFT_DOUBLE_QUOTE}${RIGHT_DOUBLE_QUOTE}${LEFT_SINGLE_QUOTE}${RIGHT_SINGLE_QUOTE}]`)
const NUM_BEFORE_2B_BLOCK_RE = new RegExp(`[\\d.,${LATIN_LETTERS}]`)

/**
 * Direct negative numbers. v4 ran two passes: Pattern 2 converts `-\d` after
 * line start, whitespace, `(`, or a quote; Pattern 2b converts `${chr}-\d` (a
 * separator-led hyphen) when no digit/`.`/`,`/Latin precedes the separator —
 * which prevents `1${chr}-2` and `GPT${chr}-3` from reading as negatives. In
 * the view, Pattern 2 fires when the clean char before the hyphen qualifies and
 * no boundary intrudes; Pattern 2b fires when a boundary leads the hyphen.
 */
function minusDirectNegative(view: ProseView): void {
  pass(
    view,
    cachedRegExp(`-(?<num>\\d*\\.?\\d+)`, "gm"),
    (match, v) => {
      const start = match.index
      // v4's `num` (`\d*\.?\d+`) carries no separator slot, so it stops at the
      // first interior boundary; the clean run up to it must still satisfy
      // `\d*\.?\d+`. A boundary right after the hyphen (head) leaves no digits
      // ("-{sep}5"), and one that strips the mandatory `\d+` ("-.{sep}1") breaks
      // the match, but one past a valid number ("-5{sep}5") leaves it intact.
      const numEnd = start + match[0].length
      let numTruncEnd = numEnd
      for (const b of v.boundaries) {
        if (b > start && b < numEnd) { numTruncEnd = b; break }
        if (b >= numEnd) break
      }
      if (!NUM_BODY_RE.test(v.text.slice(start + 1, numTruncEnd))) return null
      // A boundary directly before the hyphen routes to Pattern 2b; otherwise
      // Pattern 2 examines the clean preceding char. (The two never overlap: a
      // hyphen has either a boundary or a clean char immediately before it.)
      const nb = boundaryCountAt(v, start)
      if (nb > 0) {
        // Pattern 2b: the marked char before the separator run must not be a
        // digit, `.`, `,`, or Latin letter. With ≥2 stacked separators that char
        // is another separator (admitted); with one, it is the clean char left.
        if (nb < 2) {
          const before = v.text[start - 1]
          if (before !== undefined && NUM_BEFORE_2B_BLOCK_RE.test(before)) return null
        }
      } else {
        // Pattern 2: line start, whitespace, `(`, or a quote immediately left.
        const before = v.text[start - 1]
        const atLineStart = before === undefined || before === "\n"
        if (!atLineStart && !MINUS_BEFORE_CLASS_RE.test(before)) return null
      }
      v.replace(start, start + 1, MINUS)
      return null
    },
    { allowBoundaries: () => true },
  )
}

// ---------------------------------------------------------------------------
// Parenthetical dashes
// ---------------------------------------------------------------------------

function convertParentheticalDashes(view: ProseView, style: DashStyle): void {
  const localizedDash = style === "british" ? EN_DASH : EM_DASH
  const maybeSpace = style === "british" ? " " : ""
  const rendered = `${maybeSpace}${localizedDash}${maybeSpace}`

  convertSpacedDashes(view, rendered)
  convertBoundaryLedDashes(view, rendered)
  convertMultipleDashes(view, rendered)
  convertLeadingLineDashes(view, localizedDash)
  if (style === "british") convertUnspacedEmDashes(view, rendered)
}

const QUOTE_CHARS = `"'${LEFT_DOUBLE_QUOTE}${RIGHT_DOUBLE_QUOTE}${LEFT_SINGLE_QUOTE}${RIGHT_SINGLE_QUOTE}`

const DASH_RUN_CHARS = new Set(["-", EN_DASH, EM_DASH])

function isDashChar(ch: string | undefined): boolean {
  return ch !== undefined && DASH_RUN_CHARS.has(ch)
}

/**
 * Spaced dashes: "word - word" / "word — word". A single plain hyphen directly
 * before a word char (the suspended/hanging hyphen, "Yes-men and -women") is
 * skipped. The arrow guard rejects shapes like "- >" so `foo -> bar` stays.
 *
 * v4's dash core (`[${EN}${EM}][-${EN}${EM}]*|-{2,}|-(?!sep*[LAT\d])`) never
 * spanned a separator, so a node boundary inside the dash run truncates the run
 * — the boundary becomes the `sepAfter` slot and any dashes past it are left
 * untouched. The replacer reproduces this by truncating the run at the first
 * interior boundary and re-validating the dash core on the truncated form.
 */
function convertSpacedDashes(view: ProseView, rendered: string): void {
  // v4's `(?<=[^\s]|^)` lookbehind is validated in the replacer instead, since a
  // separator (non-space) also satisfies it, letting a match begin even when the
  // clean char to the left is whitespace. The cheap `(?<![ ])` anchor keeps each
  // `[ ]+` run starting at its leftmost space, avoiding quadratic backtracking.
  const pattern = `(?<![ ])[ ]+(?<dashStart>[-${EN_DASH}${EM_DASH}])`
  // v4's regex consumed the trailing `[ ]*` inside each match, advancing past it;
  // this clean pattern does not, so a later match could begin inside a previous
  // match's consumed trailing spaces. Track the last consumed offset and skip.
  let consumedThrough = -1
  pass(
    view,
    cachedRegExp(pattern, "g"),
    (match, v) => {
      const text = v.text
      const groups = namedGroups<{ dashStart: string }>(matchArgs(match))
      const firstDash = match.index + match[0].length - groups.dashStart.length
      // v4's greedy `[ ]+` starts at the leftmost position whose `(?<=[^\s]|^)`
      // holds: line/text start, a non-whitespace clean char, or a separator. A
      // boundary inside the leading spaces restarts the match just after it (the
      // spaces before it stay with the previous node). The previous match's
      // consumed span is also a floor: leading spaces it already consumed are not
      // re-used.
      let matchStart = Math.max(match.index, consumedThrough)
      for (const b of view.boundaries) {
        if (b > matchStart && b <= firstDash - 1) matchStart = b
        else if (b > firstDash) break
      }
      /* istanbul ignore if -- defensive: the previous match's trailing `(?=\S|$)`
         stops at this dash, so `consumedThrough` never reaches past `firstDash`. */
      if (matchStart >= firstDash + 1) return null
      // Validate the lookbehind at matchStart: start of text/line, a boundary
      // immediately left (separator), or a non-whitespace clean char.
      const leftOk = matchStart === 0
        || view.hasBoundary(matchStart)
        || (text[matchStart - 1] !== undefined && !/\s/.test(text[matchStart - 1]))
      if (!leftOk) return null
      // The leading spaces between matchStart and the dash must be at least one
      // (v4's `[ ]+` is one-or-more) — a boundary directly before the dash leaves
      // none, which is the boundary-led pattern's job, not this one.
      if (matchStart === firstDash) return null
      // A separator between the leading spaces and the dash breaks v4's
      // `[ ]+dashCore` (no separator slot there); neither spaced nor boundary-led
      // matches, so skip.
      if (view.hasBoundary(firstDash)) return null
      // Maximal dash run from firstDash that does not cross a boundary (v4's core
      // never spanned a separator).
      let fullRunEnd = firstDash + 1
      while (isDashChar(text[fullRunEnd]) && !v.hasBoundary(fullRunEnd)) fullRunEnd++
      // v4's dashCore (`-{2,}` greedy, then single `-`) backtracks past the arrow
      // guard AND the trailing `[ ]*(?=\S|$)`, so try run ends longest-first and
      // take the first one whose whole tail validates.
      const chosen = chooseSpacedDashRun(v, firstDash, fullRunEnd)
      if (chosen === null) return null
      consumedThrough = chosen.consumedEnd
      v.replace(matchStart, chosen.editEnd, rendered)
      return null
    },
    { allowBoundaries: () => true },
  )
}

/**
 * Picks v4's dashCore from the maximal dash run [firstDash, fullRunEnd). v4 tries
 * `[EN EM][-EN EM]*`, then `-{2,}` (greedy), then a single `-`, backtracking past
 * the arrow guard and the trailing `[ ]*(?=\S|$)`. Returns the chosen run end and
 * the trailing-spaces end (`scan`) to replace, or null when no branch validates.
 */
function chooseSpacedDashRun(view: ProseView, firstDash: number, fullRunEnd: number): SpacedTrailing | null {
  const text = view.text
  const first = text[firstDash]
  if (first === EN_DASH || first === EM_DASH) {
    // `[EN EM][-EN EM]*`: the leading EN/EM is mandatory, the `[-EN EM]*` tail is
    // greedy but backtracks past the arrow guard — e.g. "–-{sep}{sep}>" gives the
    // `-` back so the run is just "–" (not an arrow) and converts.
    for (let end = fullRunEnd; end > firstDash; end--) {
      if (spacedArrowAhead(view, end)) continue
      const trailing = spacedTrailingEnd(view, end)
      if (trailing !== null) return trailing
    }
    return null
  }
  // v4's `-{2,}` and single-`-` branches match hyphens only, so a leading-hyphen
  // run stops at the first EN/EM dash (e.g. "-–" is a single `-` core, not a
  // two-dash run that would swallow the EN dash).
  let hyphenRunEnd = firstDash
  while (text[hyphenRunEnd] === "-" && hyphenRunEnd < fullRunEnd) hyphenRunEnd++
  // All hyphens. Try `-{2,}` lengths longest-first, then a single `-`.
  for (let end = hyphenRunEnd; end > firstDash; end--) {
    if (end - firstDash === 1) {
      // Single `-(?!${sep}*[LAT\d])`: the next clean char must not be a letter or
      // digit (the suspended-hyphen guard).
      const next = text[end]
      if (next !== undefined && /[a-z\d]/i.test(next)) return null
    }
    if (spacedArrowAhead(view, end)) continue
    const trailing = spacedTrailingEnd(view, end)
    if (trailing !== null) return trailing
  }
  return null
}

interface SpacedTrailing {
  /** Offset through which the edit deletes (kept post-boundary spaces excluded). */
  editEnd: number
  /** Offset past all consumed trailing chars (for overlap/`lastIndex` tracking). */
  consumedEnd: number
}

/**
 * v4's trailing `[ ]*(?:${chr} [ ]*)?(?=\S|$)`. The leading `[ ]*` (before any
 * separator) is deleted; spaces after a separator are kept (they belong to the
 * next node) but still consumed. The lookahead then requires a non-space char, a
 * boundary, or end of text. Returns the edit/consumed offsets, or null on failure.
 */
function spacedTrailingEnd(view: ProseView, runEnd: number): SpacedTrailing | null {
  const text = view.text
  let editEnd = runEnd
  while (text[editEnd] === " " && !view.hasBoundary(editEnd)) editEnd++
  // v4's `(?:${chr} [ ]*)?(?=\S|$)` is a greedy optional group: try consuming a
  // single sepAfter separator and its kept trailing spaces first, then fall back
  // to no separator. `(?=\S|$)` is satisfied by a boundary (a non-space
  // separator), a non-space clean char, or end of text.
  if (boundaryCountAt(view, editEnd) === 1) {
    let consumedEnd = editEnd
    while (text[consumedEnd] === " " && (consumedEnd === editEnd || !view.hasBoundary(consumedEnd))) consumedEnd++
    if (lookaheadNonSpace(view, consumedEnd)) return { editEnd, consumedEnd }
  }
  if (lookaheadNonSpace(view, editEnd)) return { editEnd, consumedEnd: editEnd }
  return null
}

/** v4's `(?=\S|$)`: end of text, a node boundary, or a non-space clean char. */
function lookaheadNonSpace(view: ProseView, pos: number): boolean {
  return pos === view.text.length || view.hasBoundary(pos) || !/\s/.test(view.text[pos])
}

/**
 * v4's `(?!${sep}?-*${sep}?>)` arrow guard, boundary-aware. The two `${sep}?`
 * slots bracket the `-*` hyphen run: one boundary may sit before the run and one
 * after. With no hyphens both slots collapse to the run-end offset (up to two
 * boundaries there); a boundary inside the hyphen run, or more than the two
 * slots allow, hides the `>` (so the dash is not an arrow and converts).
 */
function spacedArrowAhead(view: ProseView, runEnd: number): boolean {
  const text = view.text
  let h = runEnd
  while (text[h] === "-") {
    if (h > runEnd && view.hasBoundary(h)) return false // boundary inside -*
    h++
  }
  if (h === runEnd) {
    // No hyphens: both ${sep}? slots fall at this offset (≤2 boundaries total).
    if (boundaryCountAt(view, runEnd) > 2) return false
  } else {
    if (boundaryCountAt(view, runEnd) > 1) return false // first ${sep}?
    if (boundaryCountAt(view, h) > 1) return false // second ${sep}?
  }
  return text[h] === ">"
}

/**
 * Dashes where a separator alone precedes the dash run: "word{sep}– rest". v4's
 * pattern `(?<=[^\s])${sep}[dash]+[ ]+` required a separator immediately before
 * the dash run, a non-space marked char before that separator, and at least one
 * trailing space. Because the leading separator is required, this only fires
 * where a node boundary opens a dash run, so the pass scans boundaries rather
 * than the clean text. The "non-space before the separator" is satisfied by a
 * real non-space clean char (single boundary) or by another stacked separator
 * (two or more boundaries — a separator is itself non-space).
 */
function convertBoundaryLedDashes(view: ProseView, rendered: string): void {
  const text = view.text
  const edits: Array<[number, number]> = []
  let lastProcessedEnd = -1
  let prevOffset = -1
  let stackedHere = 0
  for (const b of view.boundaries) {
    stackedHere = b === prevOffset ? stackedHere + 1 : 1
    prevOffset = b
    if (b < lastProcessedEnd) continue
    if (!isDashChar(text[b])) continue
    // Non-space before the separator: ≥2 stacked separators, or a non-space
    // clean char immediately left.
    if (stackedHere < 2) {
      const before = text[b - 1]
      if (before === undefined || /\s/.test(before)) continue
    }
    // Dash run from the boundary, not crossing a further boundary.
    let runEnd = b + 1
    while (isDashChar(text[runEnd]) && !view.hasBoundary(runEnd)) runEnd++
    // Required trailing space run; stop at a boundary (sepAfter).
    let spaceEnd = runEnd
    while (text[spaceEnd] === " " && !view.hasBoundary(spaceEnd)) spaceEnd++
    if (spaceEnd === runEnd) continue // no trailing space
    edits.push([b, spaceEnd])
    lastProcessedEnd = spaceEnd
  }
  for (const [from, to] of edits) view.replace(from, to, rendered)
  view.commit()
}

/**
 * Multiple dashes: "word--word", "word---word", `"quote"--"quote"`. v4's
 * `(?<=[LAT\d quote])${sep}?[dash]{2,50}${sep}?(?=[LAT quote space])` tolerated
 * one separator on each side of the run but its `[dash]{2,50}` never spanned a
 * separator. A boundary inside the run truncates it (and the 2..50 count must
 * still hold for the truncated run); two stacked boundaries on either edge
 * exceed the single `${sep}?` slot and block the match.
 */
function convertMultipleDashes(view: ProseView, rendered: string): void {
  const before = `[${LATIN_LETTERS}\\d${QUOTE_CHARS}]`
  const after = `[${LATIN_LETTERS}${QUOTE_CHARS} ]`
  // Upper bound of 50 prevents ReDoS on pathological runs of dashes.
  const pattern = `(?<=${before})[${EN_DASH}${EM_DASH}-]{2,50}(?=${after})`
  const afterRe = new RegExp(after)
  pass(
    view,
    cachedRegExp(pattern, "g"),
    (match, v) => {
      const text = v.text
      const start = match.index
      // Two stacked boundaries before the run exceed sepBefore's one-sep budget.
      if (boundaryCountAt(v, start) >= 2) return null
      // Truncate the run at the first interior boundary (v4's class stops there).
      let runEnd = start + 1
      while (isDashChar(text[runEnd]) && !v.hasBoundary(runEnd)) runEnd++
      if (runEnd - start < 2 || runEnd - start > 50) return null
      // sepAfter tolerates one boundary; v4's trailing lookahead then checks the
      // clean char after the run is [LAT quote space].
      if (boundaryCountAt(v, runEnd) >= 2) return null
      const next = text[runEnd]
      if (next === undefined || !afterRe.test(next)) return null
      v.replace(start, runEnd, rendered)
      return null
    },
    { allowBoundaries: () => true },
  )
}

/**
 * Dashes at start of line: "^- " → styled dash. v4 wove one optional `${chr}?`
 * at line start (before the dashes); it sits at the match start, never interior.
 * The dash run has no interior separator slot, so a boundary inside the run
 * blocks the match — the default interior-boundary rejection, which is what we
 * want here.
 */
function convertLeadingLineDashes(view: ProseView, localizedDash: string): void {
  pass(view, cachedRegExp(`^-+ `, "gm"), () => `${localizedDash} `)
}

/** British: unspaced em-dashes between letters become spaced en-dashes. */
function convertUnspacedEmDashes(view: ProseView, rendered: string): void {
  const pattern = `(?<=[${LATIN_LETTERS}.!?'"])${EM_DASH}(?=[${LATIN_LETTERS}])`
  pass(
    view,
    cachedRegExp(pattern, "g"),
    (match, v) => {
      // v4's `(?<sepBefore>${chr}?)${EM_DASH}(?<sepAfter>${chr}?)` tolerated one
      // boundary on each side; two or more exceed the slot and block the match.
      if (boundaryCountAt(v, match.index) > 1) return null
      if (boundaryCountAt(v, match.index + match[0].length) > 1) return null
      v.replace(match.index, match.index + match[0].length, rendered)
      return null
    },
  )
}

// ---------------------------------------------------------------------------
// Em-dash spacing normalization (american)
// ---------------------------------------------------------------------------

// TODO: Handle interrupted-then-resumed speech within quotes, where Chicago
// allows a space after the dash: "Don't inter— Hey! Who threw that?"
function normalizeEmDashSpacing(view: ProseView): void {
  removeSpacesAroundEmDash(view)
  preserveLineLeadingEmDashSpace(view)
}

/**
 * Remove spaces directly around an em-dash that has non-whitespace on both
 * sides. v4's `(?<=\S|^)${sep}?[ ]*${EM}[ ]*${sep}?(?=\S|$)` only consumed the
 * spaces immediately adjacent to the dash; a separator between a space and the
 * dash kept that space (the leading `[ ]*` could not reach across the marker).
 * The walk therefore stops space consumption at node boundaries, and the
 * `\S|^` / `\S|$` anchors treat a boundary (a non-space marker) as satisfying
 * the anchor.
 */
function removeSpacesAroundEmDash(view: ProseView): void {
  pass(
    view,
    cachedRegExp(EM_DASH, "g"),
    (match, v) => {
      const d = match.index
      const text = v.text
      // Leading spaces, stopping at a boundary or non-space.
      let left = d
      while (left > 0 && text[left - 1] === " " && !v.hasBoundary(left)) left--
      // Trailing spaces, stopping at a boundary or non-space.
      let right = d + 1
      while (right < text.length && text[right] === " " && !v.hasBoundary(right)) right++
      const leftAnchored = left === 0 || v.hasBoundary(left) || !/\s/.test(text[left - 1])
      const rightAnchored = right === text.length || v.hasBoundary(right) || !/\s/.test(text[right])
      if (!leftAnchored || !rightAnchored) return null
      // Drop the adjacent space runs; the em-dash and any edge boundaries stay.
      if (left < d) v.replace(left, d, "")
      if (right > d + 1) v.replace(d + 1, right, "")
      return null
    },
  )
}

/** Preserve a space after a line-leading em-dash before an uppercase/digit. */
function preserveLineLeadingEmDashSpace(view: ProseView): void {
  pass(
    view,
    cachedRegExp(`^${EM_DASH}(?<after>[A-Z0-9])`, "gm"),
    (match, v) => {
      // v4's `^${chr}?${EM_DASH}` tolerated one boundary between the line start
      // and the em-dash; two or more exceed that slot and block the match.
      if (boundaryCountAt(v, match.index) > 1) return null
      const groups = namedGroups<{ after: string }>(matchArgs(match))
      return `${EM_DASH} ${groups.after}`
    },
  )
}

// ---------------------------------------------------------------------------
// Public dash pipeline
// ---------------------------------------------------------------------------

export function hyphenReplace(text: string, options: DashOptions = {}): string {
  const separator = options.separator ?? DEFAULT_SEPARATOR
  const style = options.dashStyle ?? "american"
  if (style === "none") return text
  text = minusReplace(text, options)
  text = enDashDateRange(text, options)
  text = enDashNumberRange(text, options)
  text = withProseView(text, separator, (view) => {
    convertParentheticalDashes(view, style)
    if (style === "american") normalizeEmDashSpacing(view)
  })
  return text
}

const { WORD_JOINER } = UNICODE_SYMBOLS

/**
 * Insert a word joiner (U+2060) immediately before each unspaced em or en
 * dash that has preceding content, preventing the dash from appearing as the
 * first glyph on a wrapped line. Both dashes share Unicode line-break class
 * B2, which permits a break before them. Does not insert before line-leading
 * dashes (preceded by whitespace or start-of-string) or dashes already glued
 * with a word joiner — including British-style spaced en dashes ("word – word"),
 * which are already protected by the surrounding spaces.
 *
 * **Trade-off:** the inserted U+2060 is invisible but present in the DOM, so
 * browser Ctrl+F / find-in-page will not match a query like `plan—result`
 * against the rendered `plan⁠—result`. This is the same trade-off made by
 * `nbspTransform` (U+00A0 breaks `Fig. 1` searches). Apply only in rendered
 * HTML; do not write into Markdown source.
 */
export function dashWordJoiner(text: string): string {
  const re = cachedRegExp(`(?<=[^\\s${WORD_JOINER}])[${EM_DASH}${EN_DASH}]`, "gu")
  return text.replace(re, `${WORD_JOINER}$&`)
}

/** Reconstructs `.replace()`-style callback args from a RegExpExecArray. */
function matchArgs(match: RegExpExecArray): unknown[] {
  return [...match, match.index, match.input, match.groups]
}
