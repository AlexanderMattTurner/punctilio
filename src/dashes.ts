import { cachedRegExp, FOLDED_WORD_CHARS, isWordLike, LATIN_LETTER_RE, LATIN_LETTERS, MAX_BOUNDARY_SEPARATORS, NBSP_CHARS, SPACE_CHAR_RE, UNICODE_SYMBOLS } from "./constants.js"
import { boundaryCountAt, exceedsSingleBoundary, firstInteriorBoundary, makeProsePass, overInput, type ProseView, replaceAllInView, type ReplaceAllOptions } from "./prose-view.js"

export const DASH_STYLES = ["american", "british", "none"] as const
export type DashStyle = (typeof DASH_STYLES)[number]

export interface DashOptions {
  /** "american" (unspaced em), "british" (spaced en), "none". Default: "american" */
  dashStyle?: DashStyle
}

const {
  EN_DASH, EM_DASH, MINUS, MULTIPLICATION, PLUS_MINUS,
  LEFT_DOUBLE_QUOTE, RIGHT_DOUBLE_QUOTE, LEFT_SINGLE_QUOTE, RIGHT_SINGLE_QUOTE,
} = UNICODE_SYMBOLS

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

/**
 * Glyphs the math-symbol pass folds two-character operators into (`=~` → `≈`,
 * `!=` → `≠`, ...). The fold tolerates one node boundary at its junction, so
 * it can consume the character that sat between a boundary and a dash.
 */
const FOLDED_MATH_OPERATORS = new Set<string>([
  UNICODE_SYMBOLS.APPROXIMATE,
  UNICODE_SYMBOLS.GREATER_EQUAL,
  UNICODE_SYMBOLS.LESS_EQUAL,
  UNICODE_SYMBOLS.NOT_EQUAL,
  UNICODE_SYMBOLS.PLUS_MINUS,
])

/**
 * Glyphs the symbol passes fold from a source ending in a dash char (`<-` →
 * `←`, `+-` → `±`). Where a trailing hyphen blocks a dash rule, its folded
 * glyph must keep blocking, or the rule fires only on the re-run.
 */
const FOLDED_FROM_TRAILING_DASH = new Set<string>([
  UNICODE_SYMBOLS.ARROW_LEFT,
  UNICODE_SYMBOLS.PLUS_MINUS,
])

/** Mirror of {@link FOLDED_FROM_TRAILING_DASH} for sources starting with a
 * dash char (`->` → `→`). */
const FOLDED_FROM_LEADING_DASH = new Set<string>([UNICODE_SYMBOLS.ARROW_RIGHT])

/**
 * Runs one boundary-gated regex pass over the view and commits it immediately.
 * Committing after every pass sequences the passes so a later pass sees the
 * earlier edits and never queues an overlapping edit.
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
// The boundary-tolerance positions throughout this module reproduce the
// element-boundary semantics of the pre-v5 sentinel-marked pipeline; they are
// pinned by the HTML regression corpus and the migration's differential fuzz. Over a
// clean ProseView, `replaceAllInView` skips any match with an interior boundary
// unless `allowBoundaries` opts in. Each pass below builds an `allowBoundaries`
// callback that admits a match only when every interior boundary sits at a
// tolerated slot offset.
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
 * with no offset carrying more boundaries than its budget. A tolerated slot
 * admits exactly one boundary; two stacked boundaries (an empty fragment)
 * exceed the single-boundary budget and block the match.
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
  const prevWord = isWordLike(view.text[matchStart - 1])
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
  // `wordBoundaryEndOk` is only ever called at the end of a digit, letter, or
  // suffix run, so `pos` is always ≥ 1 and `text[pos - 1]` is a real char.
  const leftWord = isWordLike(text[pos - 1])
  // A multiplication sign one space to the right blocks like the word char
  // it folds from: the multiplication pass renders `5X 8` as `5 × 8`, and a
  // range blocked at `3-5X` must stay blocked at `3-5 ×`.
  if (text[pos] !== undefined && SPACE_CHAR_RE.test(text[pos]) && text[pos + 1] === MULTIPLICATION) {
    return false
  }
  const nb = boundaryCountAt(view, pos)
  const nextCleanWord = isWordLike(text[pos])
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
export const enDashNumberRange = makeProsePass((view) => {
  convertPositiveRanges(view)
  convertNegativeRanges(view)
})

/**
 * The positive-range shape is `phoneAreaCode? \b (?:p\.?|[currency])?\d[\d.,]*
 * -{1,3} [currency]?\d[\d.,]* (?:[-−]\d+)* (?:[AaPp][Mm]|[xKBTMCF])? \b`, scanned
 * left to right. The consume/advance behaviour determines which sub-ranges a
 * later pass sees. The scan below realizes it: at each offset it attempts the
 * structural match (boundary-aware), consuming its span on success (whether or
 * not the dash converts) and advancing one character otherwise. So a multi-segment
 * number whose head fails to form a structural match (e.g. boundary-broken
 * "2024-01-15") still exposes a later sub-range ("01-15"), while a structurally
 * matching but non-converting number hides its inner dashes.
 */
function convertPositiveRanges(view: ProseView): void {
  const text = view.text
  let i = 0
  while (i < text.length) {
    // A structural match can only begin at a digit, `p`, or `(` (the area-code
    // and start-run readers reject every other first character), so other
    // offsets skip the match attempt entirely.
    if (!RANGE_START_CHAR_RE.test(text[i])) { i++; continue }
    const span = matchPositiveRangeAt(view, i)
    i = span === null ? failedRangeStartSkip(view, i) : Math.max(span, i + 1)
  }
  view.commit()
}

const RANGE_START_CHAR_RE = /[\dp(]/

/**
 * Advance past a failed candidate at `i`. When `i` begins a digit run whose
 * boundary-free `\d[\d.,]*` extent is not followed by a dash, no structural
 * match can begin inside the run either: every interior digit start reads to
 * the same run end and fails the same start-independent gate there (the dash
 * test or the boundary-count check), interior `.`/`,` chars cannot start a
 * run, and the area-code reading needs a `(` or a dash the run does not
 * contain — so the scan jumps to the run end. Advancing one character at a
 * time instead re-reads the run at every digit — O(n²) on inputs like
 * "1.1.1.…", a denial-of-service vector. A dash at the run end re-enables
 * start-dependent gates (`\b`, not-after-dash) for interior starts, so then
 * advance by one as usual.
 */
function failedRangeStartSkip(view: ProseView, i: number): number {
  const text = view.text
  if (!/\d/.test(text[i])) return i + 1
  let runEnd = i + 1
  while (/[\d.,]/.test(text[runEnd] ?? "") && !view.hasBoundary(runEnd)) runEnd++
  return text[runEnd] === "-" ? i + 1 : runEnd
}

/**
 * Attempts the `phoneAreaCode? \b rangeStart -{1,3} rangeEnd following* suffix?
 * \b` structural match beginning at clean offset `i`, converting the dash when
 * the gates pass. Returns the consumed end offset on a structural match (so the
 * scan skips it), or null when no structural match begins at `i`.
 */
function matchPositiveRangeAt(view: ProseView, i: number): number | null {
  // Optional phoneAreaCode (`\d{3}-` or `(\d{3}) `); when it ends in a dash that
  // dash can instead be the range dash, so both interpretations are tried.
  // `rangeStart` carries no leading slot, so a boundary right where it would
  // begin (just past the area code) invalidates the area-code reading: fall back
  // to treating the area-code digits as the range start.
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

/** `phoneAreaCode` = `\d{3}-|\(\d{3}\) ?` at `i`; returns its length or null. */
function readPhoneAreaCode(view: ProseView, i: number): number | null {
  const text = view.text
  // `\d{3}-` with no boundary inside the digits or before the dash.
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
 * beginning the start at `startStart`. Converts the dash on a converting match.
 * Returns the consumed end offset (structural span end) or null.
 */
function matchRangeBody(view: ProseView, startStart: number): number | null {
  const text = view.text
  // rangeStart = `(?:p\.?|[currency])?\d[\d.,]*`, anchored at a `\b`.
  const start = readStartRun(view, startStart)
  if (start === null) return null
  const startSpanEnd = startStart + start.length
  // One slot between start and the dash tolerates a single boundary there.
  if (exceedsSingleBoundary(view, startSpanEnd)) return null
  // Dash run of 1..3 hyphens that never spans an interior boundary (a boundary
  // between two hyphens truncates the run).
  if (text[startSpanEnd] !== "-") return null
  let dashEnd = startSpanEnd + 1
  while (text[dashEnd] === "-" && dashEnd - startSpanEnd < 3 && !view.hasBoundary(dashEnd)) dashEnd++
  if (exceedsSingleBoundary(view, dashEnd)) return null

  // `readStartRun` already stops at the first interior boundary, so the start
  // span is boundary-free and its clean digits are the whole run.
  const startDigits = text.slice(startStart, startSpanEnd)
  if (!wordBoundaryStartOk(view, startStart)) return null
  if (!notAfterDashOk(view, startStart)) return null

  const end = readEndRun(view, dashEnd)
  if (end === null) return null
  // The greedy end `[\d.,]*` and greedy `following*` backtrack together; the
  // structural match commits at the longest end whose tail completes. The
  // mandatory `\d` caps the backtrack at one digit.
  for (let len = end.length; len >= 1; len--) {
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
 * The `(?:p\.?|[currency])?\d[\d.,]*` start run, boundary-truncated. The `wb`
 * (`(?<!\w)\b`) anchors the start at a word boundary, so the currency
 * alternative is unreachable: a leading currency symbol is non-word, and the only
 * `\b` sits after it, at the digit — so the currency is never part of `start`
 * (e.g. "$100-2000" reads start "100", which the 3+4 phone gate then blocks). The
 * `p`/`p.` prefix is a word char, so it can begin the run at a word boundary.
 */
function readStartRun(view: ProseView, pos: number): { length: number } | null {
  const text = view.text
  let i = pos
  if (text[i] === "p") {
    // `p\.?\d` is contiguous (no interior slot), so a boundary between `p`, an
    // optional `.`, and the first digit breaks the prefix.
    if (view.hasBoundary(i + 1)) return null
    i++
    if (text[i] === ".") {
      if (view.hasBoundary(i + 1)) return null
      i++
    }
  }
  // `\d` is required after the optional `p\.?` prefix. The prefix chars are
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
}

/** The `[currency]?\d[\d.,]*` end run starting at `pos`, boundary-truncated. */
function readEndRun(view: ProseView, pos: number): EndRun | null {
  const text = view.text
  let i = pos
  if (CURRENCY_RE.test(text[i] ?? "")) {
    // No slot between the currency symbol and the digit.
    if (view.hasBoundary(i + 1)) return null
    i++
  }
  if (!/\d/.test(text[i] ?? "")) return null
  const firstDigitStart = i
  i++
  while (/[\d.,]/.test(text[i] ?? "") && !view.hasBoundary(i)) i++
  return { firstDigitStart, length: i - firstDigitStart }
}

interface ResolvedTail {
  followingEmpty: boolean
  /** End offset of the whole structural tail (following + optional suffix). */
  consumedEnd: number
}

/**
 * Resolves the tail at `endPos`: finds the longest `following` whose
 * `suffix? wbe` completes (the greedy choice). `followingEmpty` reports whether
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
 * because the end run (`\d[\d.,]*`, with one tolerated boundary at its head)
 * must truncate at node boundaries before its tail is resolved: a regex would
 * fuse boundary-split digits into one run (e.g. "8{b}{b}{b}{b}{b}0" reads as
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
 * Attempts `(?<![LAT]) ${MINUS}\d[\d.,]* -{1,3} -? end following* suffix? wbe`
 * beginning the MINUS at clean offset `i`. Converts the dash run when the gates
 * pass. Returns the consumed structural end offset, or null when no match begins.
 */
function matchNegativeRangeAt(view: ProseView, i: number): number | null {
  const text = view.text
  // `(?<![LAT])`: a Latin letter directly before the MINUS (no intervening
  // boundary, which would hide it) blocks the match.
  if (boundaryCountAt(view, i) === 0) {
    const before = text[i - 1]
    if (before !== undefined && LATIN_LETTER_RE.test(before)) return null
  }

  // start = `${MINUS}\d[\d.,]*`: the digits after MINUS must not cross a
  // boundary (the `start` body has no interior slot before its trailing one).
  if (!/\d/.test(text[i + 1] ?? "")) return null
  let startEnd = i + 1
  while (/[\d.,]/.test(text[startEnd] ?? "") && !view.hasBoundary(startEnd)) startEnd++
  // One slot between start and the dash tolerates a single boundary there.
  if (exceedsSingleBoundary(view, startEnd)) return null
  if (text[startEnd] !== "-") return null

  // `-{1,3}?` then optional `(?<neg>-)`: a 1..3 hyphen run with no interior
  // boundary, the last of which becomes `neg` when two or more hyphens are present.
  let dashRunEnd = startEnd + 1
  while (text[dashRunEnd] === "-" && dashRunEnd - startEnd < 3 && !view.hasBoundary(dashRunEnd)) dashRunEnd++
  const dashRunLen = dashRunEnd - startEnd
  const hasNeg = dashRunLen >= 2
  const negEnd = dashRunEnd
  // The `end` head slot tolerates one boundary.
  if (exceedsSingleBoundary(view, negEnd)) return null

  const end = readNegEndRun(view, negEnd)
  if (end === null) return null
  // The greedy end and `following*` backtrack together; commit at the longest end
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

/** The negative `end` body `\d[\d.,]*` starting at `pos`, boundary-truncated. */
function readNegEndRun(view: ProseView, pos: number): NegEndRun | null {
  const text = view.text
  if (!/\d/.test(text[pos] ?? "")) return null
  let i = pos + 1
  while (/[\d.,]/.test(text[i] ?? "") && !view.hasBoundary(i)) i++
  return { firstDigitStart: pos, length: i - pos }
}

/**
 * Boundary-aware `following` end positions, shortest (empty) first, walking
 * segments `[-(−)]\d+`. Each segment tolerates one boundary on each side of its
 * dash, and each `\d+` stops at a boundary. `allowMinus` admits a MINUS as a
 * segment's dash (positive ranges).
 */
function followingCandidates(view: ProseView, endSpanEnd: number, allowMinus: boolean): number[] {
  const candidates = [endSpanEnd]
  let pos = endSpanEnd
  for (;;) {
    if (exceedsSingleBoundary(view, pos)) break
    const dashCh = view.text[pos]
    if (dashCh !== "-" && !(allowMinus && dashCh === MINUS)) break
    const digitStart = pos + 1
    if (exceedsSingleBoundary(view, digitStart)) break
    if (!/\d/.test(view.text[digitStart] ?? "")) break
    let end = digitStart + 1
    while (/\d/.test(view.text[end] ?? "") && !view.hasBoundary(end)) end++
    pos = end
    candidates.push(pos)
  }
  return candidates
}

/**
 * Single-letter range suffixes: the multipliers `x`/`K`/`B`/`T`/`M` and the
 * temperature units `C`/`F`. The degree pass rewrites `5C` to `5 °C` — a
 * space a re-run's word boundary sees through — so the range must already
 * convert with the unit attached. `X` and `×` are deliberately absent: an
 * unconverted `1-10X` folds to `1-10×`, which the word-boundary check (which
 * treats `×` as the word char it folds from) keeps blocking on re-runs.
 */
const RANGE_SUFFIX_RE = /[xKBTMCF]/

/**
 * The `(?:[AaPp][Mm]|[xKBTMCF])?${wbe}` suffix at `pos`, with one tolerated
 * boundary before the suffix. Returns the end offset after the optional suffix
 * when the tail completes (wbe passes), or null when it does not.
 */
function suffixWbeEnd(view: ProseView, pos: number, allowAmPm: boolean): number | null {
  if (wordBoundaryEndOk(view, pos)) return pos
  // An optional suffix: one tolerated boundary then am/pm or one of
  // {@link RANGE_SUFFIX_RE}'s letters, followed by wbe. The suffix letters sit
  // at the clean `pos`.
  if (exceedsSingleBoundary(view, pos)) return null
  const text = view.text
  // `[AaPp][Mm]` is contiguous — a boundary between the two letters breaks the
  // suffix.
  if (allowAmPm && /[ap]/i.test(text[pos] ?? "") && /m/i.test(text[pos + 1] ?? "") && !view.hasBoundary(pos + 1)) {
    return wordBoundaryEndOk(view, pos + 2) ? pos + 2 : null
  }
  if (RANGE_SUFFIX_RE.test(text[pos] ?? "")) {
    return wordBoundaryEndOk(view, pos + 1) ? pos + 1 : null
  }
  return null
}

const NOT_AFTER_DASH_RE = new RegExp(`[${DISALLOWED_PREFIX_CLASS_FRAGMENT}${LATIN_LETTERS}${MULTIPLICATION}${PLUS_MINUS}.+]`)

/**
 * Offset of the dot reachable backwards across one inter-dot gap ending at the
 * dot at `dotIndex` (the mirror of the ellipsis pass's forward gap rule: the
 * gap is nothing, one space character, or one node boundary). -1 when none.
 */
function ellipsisPrevDot(view: ProseView, dotIndex: number): number {
  const text = view.text
  if (text[dotIndex - 1] === ".") {
    // Empty gap: at most one boundary between the two dots.
    return boundaryCountAt(view, dotIndex) <= 1 ? dotIndex - 1 : -1
  }
  // Space gap: one space character with no boundary on either side of it.
  if (boundaryCountAt(view, dotIndex) === 0 && dotIndex >= 2 && SPACE_CHAR_RE.test(text[dotIndex - 1])
    && text[dotIndex - 2] === "." && boundaryCountAt(view, dotIndex - 1) === 0) {
    return dotIndex - 2
  }
  return -1
}

/** True iff the dot at `dotIndex` can close a `...`/`. . .` triple. */
function endsFoldableEllipsisDots(view: ProseView, dotIndex: number): boolean {
  const second = ellipsisPrevDot(view, dotIndex)
  return second >= 0 && ellipsisPrevDot(view, second) >= 0
}

/**
 * `notAfterDash` is a single-char negative lookbehind. A node boundary
 * immediately before the start hides the clean char (a boundary is not the
 * dash/letter), so the guard only fires when a disallowed clean char sits
 * directly before the start with no intervening boundary.
 *
 * A `.` that closes a dot triple does not block: the ellipsis pass (which
 * runs after the dash rules) folds the triple to `…` and pads a following
 * digit with a space, so a re-run would see a plain space here and convert —
 * converting now reaches that fixed point in one pass. A line-leading em dash
 * does not block for the same reason: the em-dash spacing normalizer pads it
 * before a digit (`^—5` → `— 5`), mirroring that rule's one tolerated
 * boundary at line start.
 */
function notAfterDashOk(view: ProseView, startOffset: number): boolean {
  if (startOffset === 0) return true
  if (boundaryCountAt(view, startOffset) > 0) return true
  const prev = view.text[startOffset - 1]
  // A multiplication sign one space slot further left blocks like the `x` it
  // folds from: the multiplication pass renders `5x8` as `5 × 8`, so a range
  // blocked at `x8-6` must stay blocked at `× 8-6`.
  if (prev !== undefined && SPACE_CHAR_RE.test(prev) && view.text[startOffset - 2] === MULTIPLICATION) {
    return false
  }
  if (prev === undefined || !NOT_AFTER_DASH_RE.test(prev)) return true
  if (prev === "." && endsFoldableEllipsisDots(view, startOffset - 1)) return true
  const dashIndex = startOffset - 1
  if (prev === EM_DASH && boundaryCountAt(view, dashIndex) <= 1
    && (dashIndex === 0 || view.text[dashIndex - 1] === "\n" || emDashBehindLeadingSpaces(view, dashIndex))) {
    return true
  }
  // An en dash behind leading spaces converts the same way: the spaced-dash
  // rule renders it as a line-leading em dash, which the normalizer then pads.
  return prev === EN_DASH && boundaryCountAt(view, dashIndex) <= 1
    && emDashBehindLeadingSpaces(view, dashIndex)
}

/**
 * True iff only plain spaces sit between text start and the em dash at
 * `emIndex`. The spaced-dash rule collapses that run, leaving the em dash
 * line-leading, which the spacing normalizer then pads before a digit — the
 * same state the `\n` arm of {@link notAfterDashOk} accepts.
 */
function emDashBehindLeadingSpaces(view: ProseView, emIndex: number): boolean {
  let j = emIndex
  while (j > 0 && view.text[j - 1] === " ") j--
  return j < emIndex && j === 0
}

/** Range-number gates: reject year-month, phone-shaped, and toll-free pairs. */
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
export function enDashDateRange(input: string, options?: DashOptions): string
export function enDashDateRange(input: ProseView, options?: DashOptions): void
export function enDashDateRange(input: string | ProseView, options: DashOptions = {}): string | void {
  return overInput(input, (view) => enDashDateRangeOverView(view, options.dashStyle ?? "american"))
}

interface DateRangeGroups {
  startMonth: string
  startYear?: string
  preSpace: string
  postSpace: string
  endMonth: string
  endYear?: string
}

/** Clean offsets of the `[preSpace]-[postSpace]` span inside a date-range match. */
function dateRangeDashSpan(match: RegExpExecArray): { dashStart: number; dashEnd: number } {
  const groups = match.groups as unknown as DateRangeGroups
  const dashStart = match.index + groups.startMonth.length + (groups.startYear?.length ?? 0)
  return { dashStart, dashEnd: dashStart + groups.preSpace.length + 1 + groups.postSpace.length }
}

function enDashDateRangeOverView(view: ProseView, dashStyle: DashStyle): void {
  if (dashStyle === "none") return
  const [pre, post] = dashStyle === "british" ? [" ", " "] : ["", ""]

  // Atomic-optional year groups (lookahead + backref). The capture inside the
  // lookahead is locked in once matched, so the year group commits without
  // backtracking. The year space also matches NBSP/NNBSP: the nbsp pass (which
  // runs after the dash rules) glues "March 2025" with an NBSP, and the year
  // must still capture on a re-run so the trailing-boundary gate sees the same
  // end position.
  const startYear = `(?=(?<startYear>[ ${NBSP_CHARS}]\\d{4})?)\\k<startYear>`
  const endYear = `(?=(?<endYear>[ ${NBSP_CHARS}]\\d{4})?)\\k<endYear>`
  const pattern = `\\b(?<startMonth>${monthPattern})${startYear}(?<preSpace> ?)-(?<postSpace> ?)(?<endMonth>${monthPattern})${endYear}\\b`
  pass(
    view,
    cachedRegExp(pattern, "g"),
    (match, v) => {
      // The pattern's trailing `\b` sees a folded glyph (`×`, a superscript
      // ordinal) as a non-word char, but the source character it folds from is
      // a word char that blocks the match ("March 2025x3"); re-check the end
      // boundary fold-stably.
      if (!wordBoundaryEndOk(v, match.index + match[0].length)) return null
      // Replace `[preSpace]-[postSpace]` (the dash and its spaces) with the
      // styled en-dash, leaving the months and any boundaries around them.
      const { dashStart, dashEnd } = dateRangeDashSpan(match)
      v.replace(dashStart, dashEnd, `${pre}${EN_DASH}${post}`)
      return null
    },
    {
      allowBoundaries: (match, v) => {
        // One boundary is tolerated after the start year and one before the end
        // month, bracketing the dash and spaces.
        const { dashStart, dashEnd } = dateRangeDashSpan(match)
        const tolerated = new Map<number, number>()
        tolerated.set(dashStart, 1)
        tolerated.set(dashEnd, 1)
        if (!interiorBoundariesAllowed(match, v, tolerated)) return false
        return wordBoundaryStartOk(v, match.index) && wordBoundaryEndOk(v, match.index + match[0].length)
      },
    },
  )
}

// ---------------------------------------------------------------------------
// Minus signs
// ---------------------------------------------------------------------------

/** Convert hyphens to minus signs in numeric contexts (e.g., "-5" → "−5"). */
export const minusReplace = makeProsePass((view) => {
  minusSubtractionOfNegative(view)
  minusSpacedSubtraction(view)
  minusDirectNegative(view)
})

/** Pattern 1a/1b: spaced math subtraction after a digit (`5 - 3`, `5 - -3`). */
function minusSubtractionOfNegative(view: ProseView): void {
  // "5 - -3" → "5 − −3"; the negative hyphen is consumed first. The slot before
  // `num` tolerates one boundary there (the `- -` prefix has 4 chars).
  pass(
    view,
    cachedRegExp(`(?<=\\d) - -(?<num>\\d*\\.?\\d+)`, "g"),
    (match, v) => {
      // Replace only the ` - -` prefix; `num` (which may carry interior
      // boundaries that truncate it) stays untouched.
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
 * The subtraction patterns tolerate one boundary after the leading digit (at
 * the match start) and one before `num`. The `-` prefix span ([match.index,
 * match.index + prefixLen)) must stay boundary-free; one boundary may sit at
 * `num`'s head. The `num` body (`\d*\.?\d+`) carries no interior slot, so it
 * stops at the first interior boundary: a boundary that truncates `num` to a
 * still-valid number (e.g. "12" in "5 - 12{b}5") leaves the match standing, but
 * one that strips the mandatory `\d+` (e.g. "." in "5 - .{b}5") breaks it. The
 * targeted edit only rewrites the ` - ` prefix, so a converting match must keep
 * `num` satisfiable.
 */
function minusSubtractionPrefixOk(match: RegExpExecArray, view: ProseView, prefixLen: number): boolean {
  // The slot in the lookbehind (`(?<=\d)`) sits at the match start between the
  // leading digit and the space; it tolerates at most one boundary.
  if (exceedsSingleBoundary(view, match.index)) return false
  const numStart = match.index + prefixLen
  if (firstInteriorBoundary(view, match.index, numStart) >= 0) return false
  // The slot before `num` tolerates at most one boundary at the num head.
  if (exceedsSingleBoundary(view, numStart)) return false
  // `num` stops at the first interior boundary; the clean run up to it must
  // still satisfy `\d*\.?\d+` (the mandatory trailing `\d+`).
  const numEnd = match.index + match[0].length
  const interior = firstInteriorBoundary(view, numStart, numEnd)
  const truncatedEnd = interior >= 0 ? interior : numEnd
  return NUM_BODY_RE.test(view.text.slice(numStart, truncatedEnd))
}

const MINUS_BEFORE_CLASS_RE = new RegExp(`[\\s("'${LEFT_DOUBLE_QUOTE}${RIGHT_DOUBLE_QUOTE}${LEFT_SINGLE_QUOTE}${RIGHT_SINGLE_QUOTE}]`)
// The folded word glyphs block like the word chars they fold from ("1x|-0"
// and "1×|-0" must agree), the folded math operators block like the operator
// chars they fold from (the `!=` → `≠` fold consumes the `=` that blocked
// Pattern 2 in "!=-1"), and the folded terminals — plus the bare `!` the
// `!!` normalization leaves — block like the `!`/`?`/`.` runs they fold from
// ("?|!-0" folds to "⁈|-0" with the hyphen stranded boundary-adjacent).
const FOLDED_WORD_CLASS_FRAGMENT = [...FOLDED_WORD_CHARS].join("")
const FOLDED_MATH_CLASS_FRAGMENT = [...FOLDED_MATH_OPERATORS].join("")
const FOLDED_TERMINAL_CLASS_FRAGMENT = [
  UNICODE_SYMBOLS.ELLIPSIS, UNICODE_SYMBOLS.DOUBLE_QUESTION, UNICODE_SYMBOLS.QUESTION_EXCLAMATION,
  UNICODE_SYMBOLS.EXCLAMATION_QUESTION, UNICODE_SYMBOLS.DOUBLE_EXCLAMATION, UNICODE_SYMBOLS.INTERROBANG, "!",
].join("")
const NUM_BEFORE_2B_BLOCK_RE = new RegExp(`[\\d.,${LATIN_LETTERS}${FOLDED_WORD_CLASS_FRAGMENT}${FOLDED_MATH_CLASS_FRAGMENT}${FOLDED_TERMINAL_CLASS_FRAGMENT}]`)

/**
 * Direct negative numbers, in two cases: Pattern 2 converts `-\d` after line
 * start, whitespace, `(`, or a quote; Pattern 2b converts a boundary-led hyphen
 * `-\d` when no digit/`.`/`,`/Latin precedes the boundary — which prevents
 * `1{b}-2` and `GPT{b}-3` from reading as negatives. Pattern 2 fires when the
 * clean char before the hyphen qualifies and no boundary intrudes; Pattern 2b
 * fires when a boundary leads the hyphen.
 */
function minusDirectNegative(view: ProseView): void {
  pass(
    view,
    cachedRegExp(`-(?<num>\\d*\\.?\\d+)`, "gm"),
    (match, v) => {
      const start = match.index
      // `num` (`\d*\.?\d+`) carries no interior slot, so it stops at the first
      // interior boundary; the clean run up to it must still satisfy
      // `\d*\.?\d+`. A boundary right after the hyphen (head) leaves no digits
      // ("-{b}5"), and one that strips the mandatory `\d+` ("-.{b}1") breaks the
      // match, but one past a valid number ("-5{b}5") leaves it intact.
      const numEnd = start + match[0].length
      const interior = firstInteriorBoundary(v, start, numEnd)
      const numTruncEnd = interior >= 0 ? interior : numEnd
      if (!NUM_BODY_RE.test(v.text.slice(start + 1, numTruncEnd))) return null
      // A boundary directly before the hyphen routes to Pattern 2b; otherwise
      // Pattern 2 examines the clean preceding char. (The two never overlap: a
      // hyphen has either a boundary or a clean char immediately before it.)
      const nb = boundaryCountAt(v, start)
      if (nb > 0) {
        // Pattern 2b: the char before the boundary run must not be a digit,
        // `.`, `,`, or Latin letter. With ≥2 stacked boundaries that char is
        // another boundary (admitted); with one, it is the clean char left.
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
 * The dash core (`[${EN}${EM}][-${EN}${EM}]*|-{2,}|-(?![LAT\d])`) never spans a
 * boundary, so a node boundary inside the dash run truncates the run — the
 * boundary becomes the trailing slot and any dashes past it are left untouched.
 * The replacer realizes this by truncating the run at the first interior
 * boundary and re-validating the dash core on the truncated form.
 */
function convertSpacedDashes(view: ProseView, rendered: string): void {
  // The `(?<=[^\s]|^)` lookbehind is validated in the replacer instead, since a
  // boundary (non-space) also satisfies it, letting a match begin even when the
  // clean char to the left is whitespace. The cheap `(?<![ ])` anchor keeps each
  // `[ ]+` run starting at its leftmost space, avoiding quadratic backtracking.
  const pattern = `(?<![ ])[ ]+(?<dashStart>[-${EN_DASH}${EM_DASH}])`
  // The full shape consumes the trailing `[ ]*`, advancing past it; this pattern
  // does not, so a later match could begin inside a previous match's consumed
  // trailing spaces. Track the last consumed offset and skip.
  let consumedThrough = -1
  pass(
    view,
    cachedRegExp(pattern, "g"),
    (match, v) => {
      const text = v.text
      const groups = match.groups as { dashStart: string }
      const firstDash = match.index + match[0].length - groups.dashStart.length
      // The greedy `[ ]+` starts at the leftmost position whose `(?<=[^\s]|^)`
      // holds: line/text start, a non-whitespace clean char, or a boundary. A
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
      // immediately left, or a non-whitespace clean char.
      const leftOk = matchStart === 0
        || view.hasBoundary(matchStart)
        || (text[matchStart - 1] !== undefined && !/\s/.test(text[matchStart - 1]))
      if (!leftOk) return null
      // A dash char left of the leading spaces (boundaries are zero-width, so
      // this reads through them) marks this run as the tail of an
      // already-spaced dash ("x – -"): the overlap consumption above leaves
      // it on the pass that converts the head, and the head's edits can
      // rewrite the linking context so the consumption never re-links; block
      // the tail deterministically. Glyphs folded from a trailing dash (`←`,
      // `±`) block like the hyphen that sat in this slot before the fold.
      const charBeforeSpaces = text[matchStart - 1]
      if (matchStart > 0
        && (isDashChar(charBeforeSpaces) || FOLDED_FROM_TRAILING_DASH.has(charBeforeSpaces))) return null
      // The leading spaces between matchStart and the dash must be at least one
      // (`[ ]+` is one-or-more) — a boundary directly before the dash leaves
      // none, which is the boundary-led pattern's job, not this one.
      if (matchStart === firstDash) return null
      // A boundary between the leading spaces and the dash breaks `[ ]+dashCore`
      // (no slot there); neither spaced nor boundary-led matches, so skip.
      if (view.hasBoundary(firstDash)) return null
      // Maximal dash run from firstDash that does not cross a boundary (the core
      // never spans a boundary).
      let fullRunEnd = firstDash + 1
      while (isDashChar(text[fullRunEnd]) && !v.hasBoundary(fullRunEnd)) fullRunEnd++
      // The dashCore (`-{2,}` greedy, then single `-`) backtracks past the arrow
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
 * Picks the dashCore from the maximal dash run [firstDash, fullRunEnd). Tries
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
  // The `-{2,}` and single-`-` branches match hyphens only, so a leading-hyphen
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
 * The trailing `[ ]*(?:[ ]*)?(?=\S|$)` with one tolerated boundary. The leading
 * `[ ]*` (before any boundary) is deleted; spaces after a boundary are kept
 * (they belong to the next node) but still consumed. The lookahead then requires
 * a non-space char, a boundary, or end of text. Returns the edit/consumed
 * offsets, or null on failure.
 */
function spacedTrailingEnd(view: ProseView, runEnd: number): SpacedTrailing | null {
  const text = view.text
  let editEnd = runEnd
  while (text[editEnd] === " " && !view.hasBoundary(editEnd)) editEnd++
  // The trailing optional group is greedy: try consuming a single boundary and
  // its kept trailing spaces first, then fall back to no boundary. `(?=\S|$)` is
  // satisfied by a boundary (non-space), a non-space clean char, or end of text.
  if (boundaryCountAt(view, editEnd) === 1) {
    let consumedEnd = editEnd
    while (text[consumedEnd] === " " && (consumedEnd === editEnd || !view.hasBoundary(consumedEnd))) consumedEnd++
    if (lookaheadNonSpace(view, consumedEnd)) return { editEnd, consumedEnd }
  }
  if (lookaheadNonSpace(view, editEnd)) return { editEnd, consumedEnd: editEnd }
  return null
}

/** `(?=\S|$)`: end of text, a node boundary, or a non-space clean char. */
function lookaheadNonSpace(view: ProseView, pos: number): boolean {
  return pos === view.text.length || view.hasBoundary(pos) || !/\s/.test(view.text[pos])
}

/**
 * The `(?!-*>)` arrow guard, boundary-aware. Two slots bracket the `-*` hyphen
 * run: one boundary may sit before the run and one after. With no hyphens both
 * slots collapse to the run-end offset (up to two boundaries there); a boundary
 * inside the hyphen run, or more than the two slots allow, hides the `>` (so the
 * dash is not an arrow and converts).
 */
function spacedArrowAhead(view: ProseView, runEnd: number): boolean {
  const text = view.text
  let h = runEnd
  while (text[h] === "-") {
    if (h > runEnd && view.hasBoundary(h)) return false // boundary inside -*
    h++
  }
  if (h === runEnd) {
    // No hyphens: both slots fall at this offset (≤2 boundaries total).
    if (boundaryCountAt(view, runEnd) > 2) return false
  } else {
    if (exceedsSingleBoundary(view, runEnd)) return false // first slot
    if (exceedsSingleBoundary(view, h)) return false // second slot
  }
  // `≥` guards like the `>=` it folds from: the math pass folds the `>` this
  // guard keys on, and a dash blocked before `–>=` must stay blocked at `–≥`.
  return text[h] === ">" || text[h] === UNICODE_SYMBOLS.GREATER_EQUAL
}

/**
 * Dashes where a boundary alone precedes the dash run: "word{b}– rest". The
 * shape `(?<=[^\s])[dash]+[ ]+` with a leading boundary requires a boundary
 * immediately before the dash run, a non-space char before that boundary, and
 * at least one trailing space. Because the leading boundary is required, this
 * only fires where a node boundary opens a dash run, so the pass scans
 * boundaries rather than the clean text. The "non-space before the boundary" is
 * satisfied by a real non-space clean char (single boundary) or by another
 * stacked boundary (two or more boundaries — a boundary is itself non-space).
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
    // Non-space before the boundary: ≥2 stacked boundaries, or a non-space
    // clean char immediately left. A folded math operator there marks the
    // fold-stranded configuration: the math pass consumes one character
    // across this junction (`=` + `~—` folds to `≈` + `—`), so the character
    // that blocked this rule on the source text is gone, and converting now
    // would diverge from that blocked first pass.
    if (stackedHere < 2) {
      const before = text[b - 1]
      if (before === undefined || /\s/.test(before) || FOLDED_MATH_OPERATORS.has(before)) continue
    }
    // Dash run from the boundary, not crossing a further boundary.
    let runEnd = b + 1
    while (isDashChar(text[runEnd]) && !view.hasBoundary(runEnd)) runEnd++
    // Required trailing space run; stop at a boundary.
    let spaceEnd = runEnd
    while (text[spaceEnd] === " " && !view.hasBoundary(spaceEnd)) spaceEnd++
    if (spaceEnd === runEnd) continue // no trailing space
    // A dash (or a glyph folded from a dash-led source) after the spaces
    // blocks when the rendered form ends in a dash: consuming the spaces
    // would fuse the rendered dash with it into a run the next pass
    // collapses (see the same guard in the multiple-dash rule). A boundary
    // at the junction prevents the fusion, so only a same-node follower
    // blocks.
    const afterSpaces = text[spaceEnd]
    if (afterSpaces !== undefined && !view.hasBoundary(spaceEnd)
      && isDashChar(rendered[rendered.length - 1])
      && (isDashChar(afterSpaces) || FOLDED_FROM_LEADING_DASH.has(afterSpaces))) continue
    edits.push([b, spaceEnd])
    lastProcessedEnd = spaceEnd
  }
  for (const [from, to] of edits) view.replace(from, to, rendered)
  view.commit()
}

/**
 * Multiple dashes: "word--word", "word---word", `"quote"--"quote"`. The shape
 * `(?<=[LAT\d quote])[dash]{2,50}(?=[LAT quote space])` tolerates one boundary
 * on each side of the run, but its `[dash]{2,50}` never spans a boundary. A
 * boundary inside the run truncates it (and the 2..50 count must still hold for
 * the truncated run); two stacked boundaries on either edge exceed the single
 * slot and block the match.
 */
function convertMultipleDashes(view: ProseView, rendered: string): void {
  const before = `[${LATIN_LETTERS}\\d${QUOTE_CHARS}]`
  const after = `[${LATIN_LETTERS}${QUOTE_CHARS} ]`
  // Upper bound of 50 prevents ReDoS on pathological runs of dashes.
  const pattern = `(?<=${before})[${EN_DASH}${EM_DASH}-]{2,50}(?=${after})`
  const afterRe = cachedRegExp(after, "")
  pass(
    view,
    cachedRegExp(pattern, "g"),
    (match, v) => {
      const text = v.text
      const start = match.index
      // Two stacked boundaries before the run exceed the leading slot's budget.
      if (boundaryCountAt(v, start) >= 2) return null
      // Truncate the run at the first interior boundary (the class stops there).
      let runEnd = start + 1
      while (isDashChar(text[runEnd]) && !v.hasBoundary(runEnd)) runEnd++
      if (runEnd - start < 2 || runEnd - start > 50) return null
      // The trailing slot tolerates one boundary; the trailing lookahead then
      // checks the clean char after the run is [LAT quote space].
      if (boundaryCountAt(v, runEnd) >= 2) return null
      const next = text[runEnd]
      if (next === undefined || !afterRe.test(next)) return null
      // Consume the trailing space run (not crossing a boundary): the rendered
      // dash carries its own spacing, and a re-run's spaced-dash rule would
      // otherwise collapse the leftover spaces into it. When the rendered
      // form ends in a dash (the unspaced American em dash), a dash (or a
      // glyph folded from a dash-led source) after the spaces keeps them:
      // consuming would fuse the rendered dash with it into a fresh run, and
      // the spaced-dash rule's dash-tail guard already holds the leftover
      // spaces still.
      let editEnd = runEnd
      while (text[editEnd] === " " && !v.hasBoundary(editEnd)) editEnd++
      // A boundary at the junction prevents the fusion (dash runs never span
      // boundaries), so only a same-node follower blocks.
      const afterSpaces = text[editEnd]
      if (editEnd > runEnd && afterSpaces !== undefined && !v.hasBoundary(editEnd)
        && isDashChar(rendered[rendered.length - 1])
        && (isDashChar(afterSpaces) || FOLDED_FROM_LEADING_DASH.has(afterSpaces))) {
        editEnd = runEnd
      }
      v.replace(start, editEnd, rendered)
      return null
    },
    { allowBoundaries: () => true },
  )
}

/**
 * Dashes at start of line: "^- " → styled dash. One boundary is tolerated at
 * line start (before the dashes); it sits at the match start, never interior.
 * The dash run has no interior slot, so a boundary inside the run blocks the
 * match — the default interior-boundary rejection, which is what we want here.
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
      // One boundary is tolerated on each side of the em-dash; two or more
      // exceed the slot and block the match.
      if (exceedsSingleBoundary(v, match.index)) return null
      if (exceedsSingleBoundary(v, match.index + match[0].length)) return null
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
 * sides. Only the spaces immediately adjacent to the dash are consumed; a
 * boundary between a space and the dash keeps that space (space consumption
 * cannot reach across a boundary). The walk therefore stops space consumption
 * at node boundaries, and the `\S|^` / `\S|$` anchors treat a boundary (a
 * non-space) as satisfying the anchor.
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
      // Drop the adjacent space runs; the em-dash and any edge boundaries
      // stay. A side whose anchor is another dash keeps its spaces: deleting
      // them would fuse the dashes into a run the multiple-dash rule then
      // collapses on the next pass. Glyphs folded from a dash-edged source
      // (`±`, `←`, `→`) anchor like the dash they fold from.
      const leftAnchor = text[left - 1]
      const rightAnchor = text[right]
      if (left < d && !isDashChar(leftAnchor) && !FOLDED_FROM_TRAILING_DASH.has(leftAnchor)) v.replace(left, d, "")
      if (right > d + 1 && !isDashChar(rightAnchor) && !FOLDED_FROM_LEADING_DASH.has(rightAnchor)) v.replace(d + 1, right, "")
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
      // One boundary is tolerated between the line start and the em-dash; two or
      // more exceed that slot and block the match.
      if (exceedsSingleBoundary(v, match.index)) return null
      const groups = match.groups as { after: string }
      return `${EM_DASH} ${groups.after}`
    },
  )
}

// ---------------------------------------------------------------------------
// Public dash pipeline
// ---------------------------------------------------------------------------

export function hyphenReplace(input: string, options?: DashOptions): string
export function hyphenReplace(input: ProseView, options?: DashOptions): void
export function hyphenReplace(input: string | ProseView, options: DashOptions = {}): string | void {
  const style = options.dashStyle ?? "american"
  return overInput(input, (view) => {
    if (style === "none") return
    minusReplace(view)
    enDashDateRangeOverView(view, style)
    enDashNumberRange(view)
    convertParentheticalDashes(view, style)
    if (style === "american") normalizeEmDashSpacing(view)
  })
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
export const dashWordJoiner = makeProsePass((view) => {
  const re = cachedRegExp(`(?<=[^\\s${WORD_JOINER}])[${EM_DASH}${EN_DASH}]`, "gu")
  replaceAllInView(view, re, (match) => `${WORD_JOINER}${match[0]}`)
})
