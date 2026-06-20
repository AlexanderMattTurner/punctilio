import { cachedRegExp, DEFAULT_SEPARATOR, LATIN_LETTERS, SPACE_CHARS, UNICODE_SYMBOLS } from "./constants.js"
import { boundaryCountAt, type ProseView, replaceAllInView, withProseView } from "./prose-view.js"
import { convertPrimeMarks } from "./quote-classifier.js"

export interface SymbolOptions {
  /** Boundary marker for HTML element boundaries. Default: "" */
  separator?: string
  /** Include arrow transforms (-> → →). Default: true */
  includeArrows?: boolean
}

const {
  ELLIPSIS,
  MULTIPLICATION,
  NOT_EQUAL,
  PLUS_MINUS,
  COPYRIGHT,
  REGISTERED,
  TRADEMARK,
  DEGREE,
  ARROW_RIGHT,
  ARROW_LEFT,
  ARROW_LEFT_RIGHT,
  APPROXIMATE,
  LESS_EQUAL,
  GREATER_EQUAL,
  NBSP,
  PRIME,
  DOUBLE_PRIME,
  SUPERSCRIPT_ST,
  SUPERSCRIPT_ND,
  SUPERSCRIPT_RD,
  SUPERSCRIPT_TH,
  DOUBLE_QUESTION,
  QUESTION_EXCLAMATION,
  EXCLAMATION_QUESTION,
} = UNICODE_SYMBOLS

const LATIN_LETTER_RE = new RegExp(`[${LATIN_LETTERS}]`)
const WORD_RE = /\w/

/** Convert "..." or ". . ." to "…". */
export function ellipsis(text: string, options: SymbolOptions = {}): string {
  return withProseView(text, options.separator ?? DEFAULT_SEPARATOR, ellipsisOverView)
}

const SPACE_CHAR_RE = new RegExp(`[${SPACE_CHARS}]`)

function ellipsisOverView(view: ProseView): void {
  ellipsisFoldDots(view)
  view.commit()

  // A space is inserted only when a letter or digit directly follows the
  // ellipsis. v4's lookahead `(?=[A-Za-z…\d])` saw the sentinel as an ordinary
  // non-letter, so a node boundary between the ellipsis and the letter blocks
  // the space; re-check the boundary at the lookahead position.
  const trailing = cachedRegExp(`${ELLIPSIS}(?=[${LATIN_LETTERS}\\d])`, "gu")
  replaceAllInView(view, trailing, (match, v) => {
    if (v.hasBoundary(match.index + match[0].length)) return null
    return `${ELLIPSIS} `
  })
  view.commit()
}

/**
 * Offset of the dot following one inter-dot gap that begins at `afterDot`, or
 * -1 when no dot is reachable. v4's gap was `(?:[space]|sep)?` /
 * `(?:[space]?|sep?)?`: nothing, one space character, or one node boundary —
 * never two and never a space-plus-boundary mix. A dot is reachable only when
 * no unconsumed boundary shadows it (the sentinel `\.` could not cross one).
 */
function ellipsisNextDot(view: ProseView, text: string, afterDot: number): number {
  const boundariesHere = boundaryCountAt(view, afterDot)
  if (text[afterDot] === ".") {
    // Empty gap (no boundary) or a single-boundary gap consuming exactly one.
    return boundariesHere <= 1 ? afterDot : -1
  }
  // Space gap: one space character with no boundary, then a non-shadowed dot.
  if (boundariesHere === 0 && text[afterDot] !== undefined && SPACE_CHAR_RE.test(text[afterDot])) {
    const dot = afterDot + 1
    if (text[dot] === "." && boundaryCountAt(view, dot) === 0) return dot
  }
  return -1
}

/**
 * Fold `...`, `. . .`, and the cross-boundary variants into `…`, scanning
 * left-to-right so a blocked leftmost triple still lets the next valid triple
 * fold (v4's marked regex re-matched past a blocking sentinel). Each fold
 * replaces the whole `. gap . gap .` span with `…`; interior boundaries
 * collapse after the ellipsis, matching v4's `… ${sep1}${sep2}` re-emission.
 */
function ellipsisFoldDots(view: ProseView): void {
  const text = view.text
  let i = 0
  while (i < text.length) {
    if (text[i] !== ".") { i++; continue }
    const secondDot = ellipsisNextDot(view, text, i + 1)
    if (secondDot < 0) { i++; continue }
    const thirdDot = ellipsisNextDot(view, text, secondDot + 1)
    if (thirdDot < 0) { i++; continue }
    view.replace(i, thirdDot + 1, ELLIPSIS)
    i = thirdDot + 1
  }
}


/** Convert "5x5" to "5×5". Skips hex (0x5F). */
export function multiplication(text: string, options: SymbolOptions = {}): string {
  return withProseView(text, options.separator ?? DEFAULT_SEPARATOR, multiplicationOverView)
}

// After a digit run, either a prime mark (10′) or a length/size unit may
// attach before the multiplication operator. Allowing both lets dimensions
// like "5m × 5m", "210mm × 297mm", or "1920px × 1080px" convert, matching
// Chicago §9.17's preference for × in dimension notation.
//
// Only length/size units that plausibly appear in two-dimensional dimensions
// are listed — mass/time/electrical units (kg, min, V, …) don't participate in
// "N × N" constructions and excluding them avoids false matches on words
// ending in those letters.
const DIMENSION_UNITS = "rem|vh|vw|km|cm|mm|nm|pm|mi|ft|yd|in|px|pt|em|m"
// Word-boundary lookahead: the unit must be followed by whitespace, the
// multiplication operator, end-of-string, or sentence punctuation — never
// another letter (which would mean the "unit" is actually a word prefix like
// "mold"). v4 also accepted a separator here; over clean text a node boundary
// directly after the unit is permitted by allowBoundaries, so it is dropped
// from the literal lookahead.
const UNIT_BOUNDARY = `(?=\\s|[xX*.,;!?)}]|$)`
const UNIT_ALT = `\\s?(?:${DIMENSION_UNITS})${UNIT_BOUNDARY}`
const PRIME_ALT = `[${PRIME}${DOUBLE_PRIME}]`
const DIGIT_SUFFIX = `(?:${PRIME_ALT}|${UNIT_ALT})?`

// Match entire multiplication chains in one pass: "5 x 5 x 5" or "5x5x5".
// Pattern matches: digit(s), then one or more (operator, digit(s)) groups.
// The (?<!\d[eE]) lookbehind prevents matching inside ambiguous unsigned
// scientific notation (1e5x3 — could also be a model SKU). Signed exponents
// (1e-5x3, 3.5E+10x2) are unambiguously scientific so the multiplication is
// converted. The Latin-letter lookbehind blocks model-name identifiers
// (Surface5x3, RTX3060x2).
const MULTIPLICATION_CHAIN = `(?<firstNum>\\d+${DIGIT_SUFFIX})(?<rest>(?:\\s*[xX*]\\s*\\d+${DIGIT_SUFFIX})+)`
const MULTIPLICATION_SEGMENT = `(?<spaceBefore>\\s*)[xX*](?<spaceAfter>\\s*)(?<num>\\d+${DIGIT_SUFFIX})`

/** A `\s*[xX*]\s*\d+suffix` segment located by absolute clean-text offsets. */
interface ChainSegment {
  /** Absolute offset of the operator character. */
  operatorOffset: number
  /** Absolute offset where the right operand's digits begin. */
  operandStart: number
  /** Absolute offset just past the right operand (including any suffix). */
  operandEnd: number
  spaceBefore: string
  spaceAfter: string
}

/** Locate each operator segment of `rest` (absolute offsets via `chainStart`). */
function chainSegments(chainStart: number, firstNum: string, rest: string): ChainSegment[] {
  const segments: ChainSegment[] = []
  const segmentRe = cachedRegExp(MULTIPLICATION_SEGMENT, "gy")
  segmentRe.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = segmentRe.exec(rest)) !== null) {
    const groups = m.groups as { spaceBefore: string; spaceAfter: string; num: string }
    const operatorAbs = chainStart + firstNum.length + m.index + groups.spaceBefore.length
    segments.push({
      operatorOffset: operatorAbs,
      operandStart: operatorAbs + 1 + groups.spaceAfter.length,
      operandEnd: chainStart + firstNum.length + m.index + m[0].length,
      spaceBefore: groups.spaceBefore,
      spaceAfter: groups.spaceAfter,
    })
  }
  return segments
}

/**
 * v4 wove `${chr}?` directly before and after each operator's spacing slot
 * (`${chr}?\s*[xX*]\s*${chr}?`): one node boundary tolerated at each outer edge,
 * none inside the spacing, and a second adjacent boundary broke the segment.
 * The operator's slot is the span [slotStart, slotEnd) covering its surrounding
 * spaces and the operator itself.
 */
function operatorSlotClean(view: ProseView, slotStart: number, slotEnd: number): boolean {
  // No boundary strictly inside the spacing-plus-operator slot.
  for (const boundary of view.boundaries) {
    if (boundary > slotStart && boundary < slotEnd) return false
  }
  // At most one boundary hugging each outer edge (duplicates at an offset come
  // from empty nodes and each counts as one sentinel).
  return boundaryCountAt(view, slotStart) <= 1 && boundaryCountAt(view, slotEnd) <= 1
}

/**
 * The chain's leading lookbehinds at `operandStart`. v4 wove
 * `(?<!\d[eE])(?<![A-Za-z…\d])`; the Latin-letter arm already rejects any
 * operand preceded by `e`/`E`, so the scientific-notation arm adds nothing for
 * the operand's immediate left character and is folded in here. A node boundary
 * right before the operand shadows the clean character (a sentinel is not a
 * letter or digit), satisfying the lookbehind — v4's marked regex re-matched
 * there.
 */
function chainGuardOk(view: ProseView, operandStart: number): boolean {
  if (view.hasBoundary(operandStart)) return true
  const prior = view.text[operandStart - 1]
  return prior === undefined || !(LATIN_LETTER_RE.test(prior) || /\d/.test(prior))
}

/**
 * The hex skip `firstNum === "0" && /^x/i.test(rest)`, checked in v4's replace
 * callback after the regex matched: a `0` operand directly followed (no
 * boundary) by `x`/`X` skips the whole matched chain without re-anchoring.
 */
function chainHexBlocked(view: ProseView, operandStart: number, operandText: string): boolean {
  if (operandText !== "0") return false
  const after = operandStart + operandText.length
  // Hex requires `x`/`X` directly after the `0` (a unit between them is not hex).
  // `after` always indexes the operator/unit reached by the match, so it is in
  // bounds.
  return !view.hasBoundary(after) && /x/i.test(view.text[after])
}

/**
 * Start offset of the maximal boundary-free digit run ending at `digitsEnd`
 * (exclusive), not crossing below `lowerBound`. v4's `\d+` stopped at a
 * sentinel, so a node boundary inside a digit run truncates the operand an
 * operator actually sees; that truncated run drives the hex and guard checks.
 */
function leftDigitRunStart(view: ProseView, text: string, digitsEnd: number, lowerBound: number): number {
  let start = digitsEnd
  // A boundary at `digitsEnd` sits between the last digit and the operator and
  // does not split the run; only boundaries strictly inside the digits do.
  while (start > lowerBound && /\d/.test(text[start - 1]) && (start === digitsEnd || !view.hasBoundary(start))) start--
  return start
}

/**
 * End offset of the digit run of the left operand whose operator spacing slot
 * begins at `slotStart`: walk back over the operand's optional suffix (a prime,
 * or a unit's letters, possibly with one space) to the last digit.
 */
function leftDigitsEnd(text: string, slotStart: number): number {
  let i = slotStart
  while (i > 0 && !/\d/.test(text[i - 1])) i--
  return i
}

/**
 * True iff the operand's unit suffix between `digitsEnd` and `slotStart` is not
 * split by a node boundary. v4's `(?:\s|${chr})?(?:unit)` allowed a single
 * boundary before the unit but matched the unit's letters contiguously, so a
 * boundary between two unit letters detaches the operator from the operand.
 */
function leftSuffixUnsplit(view: ProseView, text: string, digitsEnd: number, slotStart: number): boolean {
  // A prime or unit suffix begins after one optional space-or-boundary slot;
  // a second boundary in that slot (before the suffix) leaves v4's `\d+suffix`
  // matching only the digits, detaching the operator.
  if (slotStart > digitsEnd && boundaryCountAt(view, digitsEnd) > 1) return false
  for (let i = digitsEnd + 1; i < slotStart; i++) {
    if (LATIN_LETTER_RE.test(text[i - 1]) && LATIN_LETTER_RE.test(text[i]) && view.hasBoundary(i)) return false
  }
  return true
}

/**
 * True iff a node boundary falls strictly inside the leading digit run of the
 * operand starting at `operandStart` (v4's `\d+` could not cross a sentinel, so
 * such a boundary truncates the operand and ends the chain there).
 */
function runHasInteriorBoundary(view: ProseView, operandStart: number, operandEnd: number): boolean {
  const text = view.text
  let i = operandStart + 1
  while (i < operandEnd && /\d/.test(text[i])) {
    if (view.hasBoundary(i)) return true
    i++
  }
  return false
}

function multiplicationOverView(view: ProseView): void {
  // The chain is matched with a sticky regex driven by a manual left-to-right
  // scan. Sticky anchoring keeps the nested `\d+(…\d+)+` quantifier ReDoS-safe
  // without the leading lookbehinds v4 relied on; dropping those lookbehinds
  // lets a chain anchor on an operand whose preceding letter/digit is shadowed
  // by a node boundary (v4's marked regex re-matched there). Boundary-aware
  // guard/hex/operand checks below reproduce v4's per-operand decisions.
  const chainPattern = cachedRegExp(MULTIPLICATION_CHAIN, "y")
  const chainText = view.text
  let scan = 0
  while (scan < chainText.length) {
    chainPattern.lastIndex = scan
    const match = chainPattern.exec(chainText)
    if (match === null) { scan++; continue }
    const { firstNum, rest } = match.groups as { firstNum: string; rest: string }
    const text = chainText
    const chainStart = match.index
    const segments = chainSegments(chainStart, firstNum, rest)

    // Edit each operator's spacing slot in place, leaving the digit operands
    // (and any node boundaries inside them) untouched so boundary positions are
    // preserved.
    //
    // v4's marked regex matched a contiguous chain, then its replace callback
    // applied the hex skip. Two outcomes propagate differently:
    //   - Leading-guard failure lives in the regex, so v4 re-tried the match at
    //     the next operand: keep retrying each operator until one anchors.
    //   - Hex skip and a successful anchor consume the matched chain, so no
    //     operator inside it converts or re-anchors until a STRUCTURAL break (a
    //     boundary inside an operator's spacing slot or splitting an operand's
    //     digit run) lets the regex re-match at a later operand.
    let chainActive = false
    let anchored = false
    segments.forEach((segment, index) => {
      const slotStart = segment.operatorOffset - segment.spaceBefore.length
      const slotEnd = segment.operatorOffset + 1 + segment.spaceAfter.length
      const digitsEnd = leftDigitsEnd(text, slotStart)
      // The left operand's unit suffix must be a contiguous match: a boundary
      // splitting the unit's letters breaks v4's `\d+suffix`, detaching the
      // operator from any operand (its left side is no longer `\d+unit`).
      const slotClean = operatorSlotClean(view, slotStart, slotEnd) && leftSuffixUnsplit(view, text, digitsEnd, slotStart)
      if (!anchored) {
        const lowerBound = index === 0 ? chainStart : segments[index - 1].operandStart
        const runStart = leftDigitRunStart(view, text, digitsEnd, lowerBound)
        const operand = text.slice(runStart, digitsEnd)
        if (!chainGuardOk(view, runStart)) {
          // Regex did not match here; it re-tries at the next operand.
          chainActive = false
        } else {
          anchored = true
          chainActive = !chainHexBlocked(view, runStart, operand)
        }
      }
      if (!slotClean) {
        // Structural break: the matched chain ends; the next operand re-anchors.
        chainActive = false
        anchored = false
        return
      }
      if (chainActive) {
        const space = segment.spaceBefore || segment.spaceAfter ? " " : ""
        view.replace(slotStart, slotEnd, `${space}${MULTIPLICATION}${space}`)
      }
      // A boundary inside this operand's digit run truncates it (v4's `\d+`
      // stopped there): a structural break, so the next operand re-anchors.
      if (runHasInteriorBoundary(view, segment.operandStart, segment.operandEnd)) {
        chainActive = false
        anchored = false
      }
    })
    scan = chainStart + match[0].length
  }
  view.commit()

  // Trailing multiplier: 5x (followed by a word boundary). v4's pattern was
  // `(?<!\d[eE])(?<![A-Za-z…\d])\d+${chr}?[xX*]\b(?!${chr}{0,3}\w)`. The leading
  // guard, the `${chr}?` before the operator, the hex skip, and the trailing
  // word boundary are all evaluated against the marked text, so node boundaries
  // are consulted at exactly those weave positions. `*` never trails because
  // it is not a word character, so the closing `\b` cannot anchor on it.
  const trailingPattern = cachedRegExp(`(?<num>\\d+)(?<op>[xX*])`, "y")
  const trailingText = view.text
  let trailingScan = 0
  while (trailingScan < trailingText.length) {
    trailingPattern.lastIndex = trailingScan
    const match = trailingPattern.exec(trailingText)
    if (match === null) { trailingScan++; continue }
    const num = match.groups!.num
    const op = match.groups!.op
    const operatorOffset = match.index + num.length
    trailingScan = match.index + match[0].length
    // One optional boundary may sit between the digits and the operator.
    if (boundaryCountAt(view, operatorOffset) > 1) continue
    // Leading guard and hex skip, on the boundary-free digit run ending at the
    // operator (a sentinel inside the digits truncates the operand v4 saw).
    const runStart = leftDigitRunStart(view, trailingText, operatorOffset, 0)
    const operand = trailingText.slice(runStart, operatorOffset)
    if (!chainGuardOk(view, runStart) || chainHexBlocked(view, runStart, operand)) continue
    // Trailing word boundary `\b(?!${chr}{0,3}\w)`: `*` is not a word character
    // so it never anchors a trailing `\b`; otherwise reject when a word
    // character follows the operator through at most three boundaries.
    if (op === "*") continue
    const afterOp = operatorOffset + 1
    const followChar = trailingText[afterOp]
    if (boundaryCountAt(view, afterOp) <= 3 && followChar !== undefined && WORD_RE.test(followChar)) continue
    view.replace(operatorOffset, afterOp, MULTIPLICATION)
  }
  view.commit()
}

/** `[left, right, forbiddenFollow, replacement]`; forbiddenFollow is "" when none. */
type MathSymbolRule = [string, string, string, string]

const MATH_SYMBOL_MAP: MathSymbolRule[] = [
  ["!", "=", "=", NOT_EQUAL],
  ["\\+/", "-", "", PLUS_MINUS],
  ["\\+", "-", "", PLUS_MINUS],
  ["<", "=", "=", LESS_EQUAL],
  [">", "=", "=", GREATER_EQUAL],
  ["~", "=", "", APPROXIMATE],
  ["=", "~", "", APPROXIMATE],
]

/** Convert !=, <=, >=, +/-, ~= to Unicode equivalents. */
export function mathSymbols(text: string, options: SymbolOptions = {}): string {
  return withProseView(text, options.separator ?? DEFAULT_SEPARATOR, mathSymbolsOverView)
}

function mathSymbolsOverView(view: ProseView): void {
  for (const [left, right, forbiddenFollow, replacement] of MATH_SYMBOL_MAP) {
    // Re-read after each rule's commit: prior rules mutate the clean text.
    const text = view.text
    // v4 captured an optional separator between left and right so a
    // cross-boundary match (e.g. `!<SEP>=`) re-emitted the separator. Over
    // clean text position editing keeps the surrounding fragments (and so the
    // boundary) intact; allowBoundaries permits the one boundary at the
    // left/right junction. The negative lookahead `(?!${chr}?=)` is checked
    // manually because it tolerated one boundary before the forbidden `=`: with
    // two or more boundaries the `${chr}?` cannot reach the `=`, so the match
    // is not blocked.
    const pattern = cachedRegExp(`${left}${right}`, "g")
    replaceAllInView(view, pattern, (match, v) => {
      if (forbiddenFollow && mathLookaheadBlocks(text, v, match.index + match[0].length, forbiddenFollow)) {
        return null
      }
      return replacement
    }, {
      allowBoundaries: (m, v) => mathOperatorAllowBoundary(m, v),
    })
    view.commit()
  }
}

/**
 * v4's `(?!${chr}?=)`: the match is blocked when the forbidden character
 * follows through at most one boundary. Two or more boundaries put the
 * character out of the single-`${chr}?` reach, so the match proceeds.
 */
function mathLookaheadBlocks(text: string, view: ProseView, end: number, forbidden: string): boolean {
  return text[end] === forbidden && boundaryCountAt(view, end) <= 1
}

/**
 * v4 wove a single `(?<sep>${chr})?` only between the `left` operator string
 * and the single-character `right`, so the only tolerated interior boundary
 * sits at that junction (one boundary; the `right` char ends the match). A
 * boundary inside a multi-character `left` like `+/` broke the operator.
 */
function mathOperatorAllowBoundary(match: RegExpExecArray, view: ProseView): boolean {
  const junction = match.index + match[0].length - 1
  for (const boundary of view.boundaries) {
    if (boundary > match.index && boundary < match.index + match[0].length && boundary !== junction) return false
  }
  return boundaryCountAt(view, junction) <= 1
}

type ContextPredicate = (before: string, after: string) => boolean

// 25 chars: fits "copyright " or a 4-digit year with padding, without making slicing expensive.
const LEGAL_SYMBOL_CONTEXT_WINDOW = 25

const isPathContext = (before: string): boolean => {
  const parts = before.split(/\s+/)
  const trailing = parts[parts.length - 1]
  const slashIdx = trailing.indexOf("/")
  return slashIdx >= 0 && slashIdx < trailing.length - 1
}

function contextAwareLegalReplace(
  view: ProseView,
  pattern: RegExp,
  replacement: string,
  shouldConvert: ContextPredicate,
  separatorLength: number,
): void {
  const text = view.text
  replaceAllInView(view, pattern, (match, v) => {
    const offset = match.index
    const before = legalContextBefore(text, v, offset, separatorLength)
    const after = legalContextAfter(text, v, offset + match[0].length, separatorLength)
    return shouldConvert(before, after) ? replacement : null
  }, {
    // The `(c)`/`(r)`/`(tm)` token itself never spans a boundary in v4 (the
    // pattern had no separator weave inside it), so a match containing an
    // interior boundary is skipped, exactly as the default behavior.
    allowBoundaries: undefined,
  })
}

/**
 * Clean-text context preceding `offset`, spanning v4's 25-character window
 * measured in MARKED coordinates: each node boundary cost `separatorLength`
 * marked characters there, so a region dense with boundaries exposes fewer
 * clean characters of context (v4 sliced the marked string, then stripped the
 * separators).
 */
function legalContextBefore(text: string, view: ProseView, offset: number, separatorLength: number): string {
  let cost = 0
  let i = offset
  while (i > 0) {
    // Cost of stepping back over this clean char plus the boundaries hugging it.
    cost += boundaryCountAt(view, i) * separatorLength + 1
    if (cost > LEGAL_SYMBOL_CONTEXT_WINDOW) break
    i--
  }
  return text.slice(i, offset)
}

/** Mirror of {@link legalContextBefore} for the text following `end`. */
function legalContextAfter(text: string, view: ProseView, end: number, separatorLength: number): string {
  let cost = 0
  let i = end
  while (i < text.length) {
    cost += boundaryCountAt(view, i) * separatorLength + 1
    if (cost > LEGAL_SYMBOL_CONTEXT_WINDOW) break
    i++
  }
  return text.slice(end, i)
}

const LEGAL_COPYRIGHT_RE = "\\(c\\)"
const LEGAL_REGISTERED_RE = "\\(r\\)"
const LEGAL_TRADEMARK_RE = "\\(tm\\)"

/** Convert (c), (r), (tm) to ©, ®, ™. */
export function legalSymbols(text: string, options: SymbolOptions = {}): string {
  // legalSymbols sizes its context window in MARKED coordinates, so the pass
  // needs the separator's length; close over the separator we resolve here.
  const separator = options.separator ?? DEFAULT_SEPARATOR
  return withProseView(text, separator, (view) => legalSymbolsOverView(view, separator.length))
}

function legalSymbolsOverView(view: ProseView, separatorLength: number): void {
  // (c) → © only with positive copyright evidence (year or "copyright"
  // keyword) and not in a path context (e.g. example.com/path(c)).
  contextAwareLegalReplace(view, cachedRegExp(LEGAL_COPYRIGHT_RE, "gi"), COPYRIGHT, (before, after) =>
    !isPathContext(before) && (/^\s*(?:19|20)\d{2}\b/.test(after) || /\bcopyright\s*$/i.test(before)),
    separatorLength
  )
  view.commit()

  // (r) → ® unless in enumeration "(q), (r)", legal citation "(r)(1)", or path context.
  contextAwareLegalReplace(view, cachedRegExp(LEGAL_REGISTERED_RE, "gi"), REGISTERED, (before, after) =>
    !/\([a-z]\)[,;]\s*$/i.test(before) && !/^\(\d/.test(after) && !isPathContext(before),
    separatorLength
  )
  view.commit()

  // (tm) → ™ unless in a path context.
  contextAwareLegalReplace(view, cachedRegExp(LEGAL_TRADEMARK_RE, "gi"), TRADEMARK, (before) =>
    !isPathContext(before),
    separatorLength
  )
  view.commit()
}

/** Matches one arrow shape starting at `start`; returns its end offset or -1. */
type ArrowMatcher = (view: ProseView, text: string, start: number) => number

const SPACE_OR_TAB_RE = /\s/

/**
 * v4 wove a single `${chr}?` after `<`, between dash runs, and before `>`, and
 * a boundary could not split a dash run (`-+`). Each helper walks the clean
 * text and consults boundaries at exactly those weave positions, tolerating at
 * most one boundary per slot.
 */
const ARROW_MATCHERS: readonly [ArrowMatcher, string][] = [
  [matchLeftRightArrow, ARROW_LEFT_RIGHT],
  [matchRightArrow, ARROW_RIGHT],
  [matchLeftArrow, ARROW_LEFT],
]

/** Length of a `-+` dash run at `pos` (no boundary may split it); 0 if none. */
function dashRunLength(view: ProseView, text: string, pos: number): number {
  let i = pos
  while (text[i] === "-" && (i === pos || boundaryCountAt(view, i) === 0)) i++
  return i - pos
}

/** Skip at most one boundary slot at `pos`; returns the offset after it. -1 on a double boundary. */
function arrowSepSlot(view: ProseView, pos: number): number {
  const count = boundaryCountAt(view, pos)
  return count <= 1 ? pos : -1
}

/** `-+${sep}?>`: a dash run, an optional boundary, then `>`. */
function matchRightArrow(view: ProseView, text: string, start: number): number {
  const run = dashRunLength(view, text, start)
  if (run === 0) return -1
  const beforeGt = start + run
  if (arrowSepSlot(view, beforeGt) < 0) return -1
  return text[beforeGt] === ">" ? beforeGt + 1 : -1
}

/** `<${sep}?-+`: `<`, an optional boundary, then a dash run. */
function matchLeftArrow(view: ProseView, text: string, start: number): number {
  if (text[start] !== "<") return -1
  const afterLt = start + 1
  if (arrowSepSlot(view, afterLt) < 0) return -1
  const run = dashRunLength(view, text, afterLt)
  return run === 0 ? -1 : afterLt + run
}

/** `<${sep}?-+(?:${sep}-+)*${sep}?>`: bidirectional arrow with dash runs. */
function matchLeftRightArrow(view: ProseView, text: string, start: number): number {
  if (text[start] !== "<") return -1
  let i = start + 1
  if (arrowSepSlot(view, i) < 0) return -1
  let run = dashRunLength(view, text, i)
  if (run === 0) return -1
  i += run
  // Additional `${sep}-+` runs: each separated by exactly one boundary.
  while (boundaryCountAt(view, i) === 1) {
    run = dashRunLength(view, text, i)
    if (run === 0) break
    i += run
  }
  if (arrowSepSlot(view, i) < 0) return -1
  return text[i] === ">" ? i + 1 : -1
}

/** Left context `(^|\s|${chr})`: start of text, a space, or a node boundary. */
function arrowLeftContextOk(view: ProseView, text: string, start: number): boolean {
  if (start === 0 || view.hasBoundary(start)) return true
  return SPACE_OR_TAB_RE.test(text[start - 1])
}

/** Right context `(?=\s|${chr}|$)`: end of text, a space, or a node boundary. */
function arrowRightContextOk(view: ProseView, text: string, end: number): boolean {
  if (end >= text.length || view.hasBoundary(end)) return true
  return SPACE_OR_TAB_RE.test(text[end])
}

/** Convert -> and <-> to arrows. */
export function arrows(text: string, options: SymbolOptions = {}): string {
  return withProseView(text, options.separator ?? DEFAULT_SEPARATOR, arrowsOverView)
}

function arrowsOverView(view: ProseView): void {
  // Each arrow shape is matched by a left-to-right scan so a boundary that
  // splits a dash run still lets the valid suffix match (v4's marked regex
  // re-matched past the sentinel). The whole shape span is replaced with the
  // arrow; consumed boundaries collapse after it, matching v4's re-emission.
  for (const [matcher, replacement] of ARROW_MATCHERS) {
    const text = view.text
    let i = 0
    while (i < text.length) {
      if (!arrowLeftContextOk(view, text, i)) { i++; continue }
      const end = matcher(view, text, i)
      if (end < 0 || !arrowRightContextOk(view, text, end)) { i++; continue }
      view.replace(i, end, replacement)
      i = end
    }
    view.commit()
  }
}

export function degrees(text: string, options: SymbolOptions = {}): string {
  return withProseView(text, options.separator ?? DEFAULT_SEPARATOR, degreesOverView)
}

function degreesOverView(view: ProseView): void {
  // Temperature with optional space before C or F (uppercase only). v4 wove a
  // separator between the digit and the unit (`${chr}?`) and followed the unit
  // with `(?!-[A-Za-z…]|[+#])` (reject "C-compiler", "C++", "F#") plus a
  // marker-aware word boundary. Those trailing assertions are checked manually
  // so a node boundary right after the unit shadows the compound character (as
  // the sentinel did) and the word-boundary arm sees through up to three
  // boundaries.
  const pattern = cachedRegExp(`\\d ?(?<unit>[CF])`, "g")
  const text = view.text
  replaceAllInView(view, pattern, (match, v) => {
    const unitEnd = match.index + match[0].length
    if (!degreeUnitFollowOk(text, v, unitEnd)) return null
    const { unit } = match.groups!
    // Replace everything after the leading digit (the optional space and the
    // unit) with ` °C`/` °F`, leaving the digit and any boundary right after it
    // in place so the boundary keeps the position v4 gave it (captured in
    // `num`).
    v.replace(match.index + 1, unitEnd, ` ${DEGREE}${unit}`)
    return null
  }, {
    allowBoundaries: (match, v) => digitSuffixBoundaryOk(match, v),
  })
  view.commit()
}

/**
 * The `(?!-[A-Za-z…]|[+#])` compound guard plus `\b(?!${chr}{0,3}\w)` word
 * boundary that follow the unit. A node boundary directly after the unit
 * shadows a `+`/`#`/`-`, satisfying the compound guard; the word boundary
 * blocks only when a word character follows the unit through at most three
 * boundaries.
 */
function degreeUnitFollowOk(text: string, view: ProseView, unitEnd: number): boolean {
  const boundaryAfterUnit = view.hasBoundary(unitEnd)
  // Compound guard: `+`/`#` directly after the unit (no boundary shadowing it),
  // or `-` directly followed by a Latin letter (boundary-aware).
  if (!boundaryAfterUnit) {
    const next = text[unitEnd]
    if (next === "+" || next === "#") return false
    if (next === "-" && !view.hasBoundary(unitEnd + 1) && LATIN_LETTER_RE.test(text[unitEnd + 1] ?? "")) return false
  }
  // Word boundary: reject when a word character follows the unit across up to
  // three boundaries (v4's `\b(?!${chr}{0,3}\w)`); with no boundary a word
  // character directly after the unit also removes the `\b`. Consecutive
  // boundaries pile at the same clean offset, so count them there.
  const followChar = text[unitEnd]
  if (boundaryCountAt(view, unitEnd) <= 3 && followChar !== undefined && WORD_RE.test(followChar)) return false
  return true
}

/**
 * Tolerate at most one boundary directly after the leading digit (the v4
 * single `${chr}?` between `\d` and the rest); a second adjacent boundary broke
 * the slot. The digit is the first match character, so the only legal
 * interior-boundary offset is match.index + 1.
 */
function digitSuffixBoundaryOk(match: RegExpExecArray, view: ProseView): boolean {
  const digitEnd = match.index + 1
  const matchEnd = match.index + match[0].length
  for (const boundary of view.boundaries) {
    // Reject any interior boundary that is not the single tolerated slot after
    // the leading digit.
    if (boundary > match.index && boundary < matchEnd && boundary !== digitEnd) return false
  }
  return boundaryCountAt(view, digitEnd) <= 1
}

/** Convert 5'10" to 5′10″ (prime marks). Call before smart quotes. */
export function primeMarks(text: string, options: SymbolOptions = {}): string {
  return convertPrimeMarks(text, options.separator ?? DEFAULT_SEPARATOR)
}

type FractionRule = [string, string, string]

const FRACTION_TUPLES: FractionRule[] = [
  ["1", "4", UNICODE_SYMBOLS.FRACTION_1_4],
  ["1", "2", UNICODE_SYMBOLS.FRACTION_1_2],
  ["3", "4", UNICODE_SYMBOLS.FRACTION_3_4],
  ["1", "3", UNICODE_SYMBOLS.FRACTION_1_3],
  ["2", "3", UNICODE_SYMBOLS.FRACTION_2_3],
  ["1", "5", UNICODE_SYMBOLS.FRACTION_1_5],
  ["2", "5", UNICODE_SYMBOLS.FRACTION_2_5],
  ["3", "5", UNICODE_SYMBOLS.FRACTION_3_5],
  ["4", "5", UNICODE_SYMBOLS.FRACTION_4_5],
  ["1", "6", UNICODE_SYMBOLS.FRACTION_1_6],
  ["5", "6", UNICODE_SYMBOLS.FRACTION_5_6],
  ["1", "8", UNICODE_SYMBOLS.FRACTION_1_8],
  ["3", "8", UNICODE_SYMBOLS.FRACTION_3_8],
  ["5", "8", UNICODE_SYMBOLS.FRACTION_5_8],
  ["7", "8", UNICODE_SYMBOLS.FRACTION_7_8],
]

const FRACTION_MAP = Object.fromEntries(FRACTION_TUPLES.map(([n, d, u]) => [`${n}/${d}`, u]))

/** Convert 1/2, 1/4, etc. to ½, ¼, etc. Single-pass using alternation. */
export function fractions(text: string, options: SymbolOptions = {}): string {
  return withProseView(text, options.separator ?? DEFAULT_SEPARATOR, fractionsOverView)
}

function fractionsOverView(view: ProseView): void {
  // Build alternation of exact valid pairs: `1/4|1/2|...`. Only exact pairs
  // from FRACTION_TUPLES match — no cross-product. v4 wove `${chr}?` around the
  // slash (numerator${chr}?/${chr}?denominator) and surrounded the pair with
  // bare lookarounds `(?<![/.\d])` and `(?![/\d]|\.\d)`. Over clean text the
  // lookarounds are checked manually so a node boundary at the numerator's left
  // edge or the denominator's right edge stands in for the sentinel character
  // and satisfies them, exactly as the marked lookarounds did.
  const pairAlternation = FRACTION_TUPLES.map(([n, d]) => `${n}/${d}`).join("|")
  const pattern = cachedRegExp(`(?:${pairAlternation})`, "g")
  const text = view.text
  replaceAllInView(view, pattern, (match, v) => {
    const start = match.index
    const end = start + match[0].length
    if (!fractionLookbehindOk(text, v, start)) return null
    if (!fractionLookaheadOk(text, v, end)) return null
    // Distribute interior boundaries: the first lands before the unicode char,
    // any remaining after it (v4's separators[0]/separators[1] split).
    let firstBoundary = end
    for (const boundary of v.boundaries) {
      if (boundary > start && boundary < end) { firstBoundary = boundary; break }
    }
    if (firstBoundary > start) v.replace(start, firstBoundary, "")
    v.replace(firstBoundary, end, FRACTION_MAP[match[0]])
    return null
  }, {
    allowBoundaries: (match, v) => fractionSlotBoundaryOk(match, v),
  })
  view.commit()
}

/**
 * `(?<![/.\d])` at the numerator's left edge. A node boundary immediately
 * before the numerator shadows the clean character (the sentinel was not
 * `/`, `.`, or a digit), so the lookbehind passes.
 */
function fractionLookbehindOk(text: string, view: ProseView, start: number): boolean {
  if (start === 0 || view.hasBoundary(start)) return true
  return !/[/.\d]/.test(text[start - 1])
}

/**
 * `(?![/\d]|\.\d)` at the denominator's right edge. A node boundary immediately
 * after the denominator shadows the clean characters, satisfying the lookahead.
 */
function fractionLookaheadOk(text: string, view: ProseView, end: number): boolean {
  if (view.hasBoundary(end)) return true
  const next = text[end]
  if (next === undefined) return true
  if (/[/\d]/.test(next)) return false
  // `\.\d`: a dot directly followed by a digit (a node boundary between them
  // breaks the pair, so re-test for the boundary).
  if (next === "." && !view.hasBoundary(end + 1) && /\d/.test(text[end + 1] ?? "")) return false
  return true
}

/**
 * A fraction tolerates one boundary on each side of the slash (v4's two
 * `${chr}?` slots). The numerator and denominator are single digits, so the
 * match spans exactly `digit/digit` and the only interior-boundary offsets are
 * right before the slash (match.index + 1) and right after it (match.index + 2);
 * each accepts at most one boundary.
 */
function fractionSlotBoundaryOk(match: RegExpExecArray, view: ProseView): boolean {
  const slashOffset = match.index + 1
  return boundaryCountAt(view, slashOffset) <= 1 && boundaryCountAt(view, slashOffset + 1) <= 1
}

const ORDINAL_MAP: Record<string, string> = {
  st: SUPERSCRIPT_ST,
  nd: SUPERSCRIPT_ND,
  rd: SUPERSCRIPT_RD,
  th: SUPERSCRIPT_TH,
}

/** Convert 1st, 2nd, 3rd, 4th to superscript ordinals. */
export function superscriptOrdinal(text: string, options: SymbolOptions = {}): string {
  return withProseView(text, options.separator ?? DEFAULT_SEPARATOR, superscriptOrdinalOverView)
}

function superscriptOrdinalOverView(view: ProseView): void {
  // Match number + ordinal suffix at word boundary, case-insensitively. v4
  // tolerated a separator between the digit and the suffix (`${chr}?`) and used
  // a marker-aware word boundary after the suffix. Only the suffix is replaced,
  // leaving the digit and any boundary between them untouched so the boundary
  // keeps its position (v4 re-emitted the captured `num` including its sep).
  const pattern = cachedRegExp(`(?<num>\\d)(?<suffix>st|nd|rd|th)\\b(?![${LATIN_LETTERS}\\d])`, "gi")
  replaceAllInView(view, pattern, (match, v) => {
    const { num, suffix } = match.groups!
    const suffixStart = match.index + num.length
    v.replace(suffixStart, match.index + match[0].length, ORDINAL_MAP[suffix.toLowerCase()])
    return null
  }, {
    allowBoundaries: (match, v) => digitSuffixBoundaryOk(match, v),
  })
  view.commit()
}

// Preserves highest-priority space type (NBSP > NNBSP > regular) and leading indentation.
export function collapseSpaces(text: string): string {
  return text.replace(cachedRegExp(`(?<=[^\\n${SPACE_CHARS}])[${SPACE_CHARS}]{2,}`, "g"), (match) => {
    if (match.includes(NBSP)) return NBSP
    if (match.includes(UNICODE_SYMBOLS.NNBSP)) return UNICODE_SYMBOLS.NNBSP
    return " "
  })
}

/** `[first, repeated, replacement]` with literal punctuation characters. */
type LigatureRule = [string, string, string]

// Order matters: mixed punctuation first, then repeated.
const PUNCTUATION_LIGATURE_MAP: LigatureRule[] = [
  ["?", "!", QUESTION_EXCLAMATION],  // ?!+ → ⁈
  ["!", "?", EXCLAMATION_QUESTION],  // !?+ → ⁉
  ["?", "?", DOUBLE_QUESTION],       // ??+ → ⁇
  ["!", "!", "!"],                   // !!+ → ! (normalize)
]

/** Convert ?? to ⁇, ?! to ⁈, !? to ⁉. Disabled by default (poor font support). */
export function punctuationLigatures(text: string, options: SymbolOptions = {}): string {
  return withProseView(text, options.separator ?? DEFAULT_SEPARATOR, punctuationLigaturesOverView)
}

function punctuationLigaturesOverView(view: ProseView): void {
  for (const [first, repeated, replacement] of PUNCTUATION_LIGATURE_MAP) {
    // v4 matched `${first}(?:${chr}?${repeated})+`: the leading char, then one
    // or more repeated chars each preceded by at most one boundary (a second
    // adjacent boundary broke the run). A left-to-right scan replaces the whole
    // run with the ligature; consumed boundaries collapse after it, matching
    // v4's re-emission, and a broken run re-anchors at the next leading char.
    const text = view.text
    let i = 0
    while (i < text.length) {
      if (text[i] !== first) { i++; continue }
      let end = i + 1
      let consumed = 0
      for (;;) {
        const afterSep = arrowSepSlot(view, end)
        if (afterSep < 0 || text[afterSep] !== repeated) break
        end = afterSep + 1
        consumed++
      }
      if (consumed === 0) { i++; continue }
      view.replace(i, end, replacement)
      i = end
    }
    view.commit()
  }
}

export function symbolTransform(text: string, options: SymbolOptions = {}): string {
  text = ellipsis(text, options)
  text = multiplication(text, options)
  text = mathSymbols(text, options)
  text = legalSymbols(text, options)
  if (options.includeArrows !== false) {
    text = arrows(text, options)
  }
  return text
}
