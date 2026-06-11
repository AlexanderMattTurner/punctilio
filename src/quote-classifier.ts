import { LATIN_LETTERS, TERMINAL_PUNCTUATION, UNICODE_SYMBOLS } from "./constants.js"
import type { ProseView } from "./prose-view.js"

const {
  EM_DASH,
  LEFT_DOUBLE_QUOTE,
  RIGHT_DOUBLE_QUOTE,
  LEFT_SINGLE_QUOTE,
  RIGHT_SINGLE_QUOTE,
  MODIFIER_LETTER_APOSTROPHE,
  DOUBLE_LOW_9_QUOTE,
  SINGLE_LOW_9_QUOTE,
  LEFT_GUILLEMET,
  RIGHT_GUILLEMET,
  NBSP,
  NNBSP,
  PRIME,
  DOUBLE_PRIME,
} = UNICODE_SYMBOLS

export const PUNCTUATION_STYLES = ["american", "british", "german", "french", "none"] as const
export type PunctuationStyle = (typeof PUNCTUATION_STYLES)[number]

/** Locale style that performs quote work ("none" is handled by the callers). */
export type ActiveQuoteStyle = Exclude<PunctuationStyle, "none">

/**
 * Role assigned to each quote-like character by the classifier. The engine
 * tracks roles through an internal one-character alphabet (the American
 * convention glyphs plus U+02BC for semantic apostrophes); rendering maps the
 * roles to per-locale glyph strings.
 */
export type QuoteRole =
  | "APOSTROPHE"
  | "CLOSE_DOUBLE"
  | "CLOSE_SINGLE"
  | "DOUBLE_PRIME"
  | "LITERAL"
  | "OPEN_DOUBLE"
  | "OPEN_SINGLE"
  | "PRIME"

/** Internal-alphabet character for each non-LITERAL role. */
const ROLE_BY_CHAR = new Map<string, Exclude<QuoteRole, "LITERAL">>([
  [LEFT_DOUBLE_QUOTE, "OPEN_DOUBLE"],
  [RIGHT_DOUBLE_QUOTE, "CLOSE_DOUBLE"],
  [LEFT_SINGLE_QUOTE, "OPEN_SINGLE"],
  [RIGHT_SINGLE_QUOTE, "CLOSE_SINGLE"],
  [MODIFIER_LETTER_APOSTROPHE, "APOSTROPHE"],
  [PRIME, "PRIME"],
  [DOUBLE_PRIME, "DOUBLE_PRIME"],
])

/**
 * One element of the classifier's working sequence: either a single clean-text
 * character (occasionally a multi-character span, for guillemets absorbed with
 * their padding) or a zero-width node boundary between source fragments.
 *
 * The boundary-tolerance behavior of the boundary items reproduces the
 * element-boundary semantics of the pre-v5 sentinel-marked pipeline (pinned by
 * the golden corpus and the migration's differential fuzz): boundary-transparent
 * rules skip them, and rules that treat a boundary as an ordinary non-space
 * character do so.
 */
interface Item {
  boundary: boolean
  /** Current internal-alphabet character. Empty for boundary items. */
  ch: string
  /** Original span [start, end) in the view's clean text. */
  start: number
  end: number
  /** Set when punctuation placement relocates this item. */
  moved: boolean
  /** Insertion anchor (clean-text offset and bind side) once moved. */
  anchorOffset: number
  anchorBind: "left" | "right"
}

const LETTER_RE = new RegExp(`[${LATIN_LETTERS}]`)
const WORD_RE = /\w/
const SPACE_RE = /\s/
const DIGIT_RE = /\d/

/** Fast path: text without any quote-like character is returned untouched. */
const QUOTE_CANDIDATE_RE = new RegExp(
  `['"${LEFT_SINGLE_QUOTE}${RIGHT_SINGLE_QUOTE}${LEFT_DOUBLE_QUOTE}${RIGHT_DOUBLE_QUOTE}` +
  `${MODIFIER_LETTER_APOSTROPHE}${DOUBLE_LOW_9_QUOTE}${SINGLE_LOW_9_QUOTE}${LEFT_GUILLEMET}${RIGHT_GUILLEMET}]`
)

const TERMINAL_SET = new Set<string>(TERMINAL_PUNCTUATION)
const CLOSING_SET = new Set<string>([RIGHT_SINGLE_QUOTE, RIGHT_DOUBLE_QUOTE])

/** Chars from `'` ${LSQ} ${RSQ} ${MLA}; \w handled separately. */
const SINGLE_QUOTE_FAMILY = new Set<string>(["'", LEFT_SINGLE_QUOTE, RIGHT_SINGLE_QUOTE, MODIFIER_LETTER_APOSTROPHE])

/** Ending-context chars for single quotes (plus any \s char). */
const SINGLE_ENDING_SET = new Set<string>([".", "!", "?", ";", ",", ")", EM_DASH, "-", "]", '"'])

/** Boundary chars before an opening single quote (plus any \s char). */
const SINGLE_OPEN_BEFORE_SET = new Set<string>([LEFT_DOUBLE_QUOTE, RIGHT_DOUBLE_QUOTE, EM_DASH, "-", "("])

/** Boundary chars before an opening double quote (plus any \s char). */
const DOUBLE_OPEN_BEFORE_SET = new Set<string>(["(", "/", "[", "{", "-", EM_DASH])

/** Ending-context chars that block the opener rule's arm 2 (plus any \s char). */
const DOUBLE_OPEN_ENDING_SET = new Set<string>([")", EM_DASH, ",", "!", "?", ";", ":", ".", "}"])

/** Chars allowed before an empty double-quote pair (plus any \s char). */
const DOUBLE_EMPTY_BEFORE_SET = new Set<string>(["(", "[", "{"])

/** Chars allowed after an empty double-quote pair (plus any \s char). */
const DOUBLE_EMPTY_AFTER_SET = new Set<string>([")", "]", "}", ".", "!", "?", ",", ";", ":"])

/** Ending-context chars after a closing double quote (plus any \s char). */
const DOUBLE_CLOSE_AFTER_SET = new Set<string>(["/", ")", ".", ",", ";", EM_DASH, ":", "-", "}", "!", "?", "s"])

function isLetterItem(items: Item[], index: number): boolean {
  if (index < 0 || index >= items.length) return false
  const item = items[index]
  return !item.boundary && LETTER_RE.test(item.ch)
}

function isCharItem(items: Item[], index: number, ch: string): boolean {
  if (index < 0 || index >= items.length) return false
  const item = items[index]
  return !item.boundary && item.ch === ch
}

/**
 * Index of the previous item, treating up to `maxBoundaries` boundary items as
 * transparent. Returns -1 at start of text; returns the blocking boundary's
 * index when the budget is exceeded, so character-class tests on the result
 * fail (a boundary item satisfies no character class).
 */
function prevIndex(items: Item[], index: number, maxBoundaries: number): number {
  let j = index - 1
  let skipped = 0
  while (j >= 0 && items[j].boundary) {
    if (skipped === maxBoundaries) return j
    skipped++
    j--
  }
  return j
}

/** Mirror of {@link prevIndex}; returns `items.length` at end of text. */
function nextIndex(items: Item[], index: number, maxBoundaries: number): number {
  let j = index + 1
  let skipped = 0
  while (j < items.length && items[j].boundary) {
    if (skipped === maxBoundaries) return j
    skipped++
    j++
  }
  return j
}

// ---------------------------------------------------------------------------
// Item construction and locale pre-labeling
// ---------------------------------------------------------------------------

function makeItem(boundary: boolean, ch: string, start: number, end: number): Item {
  return { boundary, ch, start, end, moved: false, anchorOffset: 0, anchorBind: "left" }
}

/**
 * Builds the working item sequence over the view's clean text, applying the
 * locale's pre-label rows: German low-9/depth-gated quotes and French
 * guillemets (with adjacent NBSP/NNBSP padding absorbed) map onto the internal
 * American alphabet so the shared classification rules apply uniformly.
 */
function buildItems(view: ProseView, style: ActiveQuoteStyle): Item[] {
  const text = view.text
  const boundaries = view.boundaries
  const items: Item[] = []
  let b = 0
  // German closers are depth-gated: U+201C/U+2018 close only below an open
  // low-9 quote; orphans fall back to straight-quote candidates re-derived by
  // position (the depth-0 branch).
  let doubleDepth = 0
  let singleDepth = 0

  let i = 0
  while (i <= text.length) {
    while (b < boundaries.length && boundaries[b] === i) {
      items.push(makeItem(true, "", i, i))
      b++
    }
    if (i === text.length) break

    const ch = text[i]
    if (style === "french") {
      const boundaryNext = b < boundaries.length && boundaries[b] === i + 1
      const next = text[i + 1]
      if (ch === LEFT_GUILLEMET) {
        const padded = !boundaryNext && (next === NBSP || next === NNBSP)
        items.push(makeItem(false, LEFT_DOUBLE_QUOTE, i, padded ? i + 2 : i + 1))
        i += padded ? 2 : 1
        continue
      }
      if ((ch === NBSP || ch === NNBSP) && !boundaryNext && next === RIGHT_GUILLEMET) {
        items.push(makeItem(false, RIGHT_DOUBLE_QUOTE, i, i + 2))
        i += 2
        continue
      }
      if (ch === RIGHT_GUILLEMET) {
        items.push(makeItem(false, RIGHT_DOUBLE_QUOTE, i, i + 1))
        i++
        continue
      }
    } else if (style === "german") {
      let mapped: string | null = null
      if (ch === DOUBLE_LOW_9_QUOTE) {
        mapped = LEFT_DOUBLE_QUOTE
        doubleDepth++
      } else if (ch === LEFT_DOUBLE_QUOTE) {
        mapped = doubleDepth > 0 ? RIGHT_DOUBLE_QUOTE : '"'
        if (doubleDepth > 0) doubleDepth--
      } else if (ch === SINGLE_LOW_9_QUOTE) {
        mapped = LEFT_SINGLE_QUOTE
        singleDepth++
      } else if (ch === LEFT_SINGLE_QUOTE) {
        mapped = singleDepth > 0 ? RIGHT_SINGLE_QUOTE : "'"
        if (singleDepth > 0) singleDepth--
      } else if (ch === RIGHT_DOUBLE_QUOTE) {
        // Not used in German typography — re-derive by position.
        mapped = '"'
      } else if (ch === RIGHT_SINGLE_QUOTE) {
        mapped = "'"
      }
      if (mapped !== null) {
        items.push(makeItem(false, mapped, i, i + 1))
        i++
        continue
      }
    }

    items.push(makeItem(false, ch, i, i + 1))
    i++
  }
  return items
}

// ---------------------------------------------------------------------------
// Single-quote classification
// ---------------------------------------------------------------------------

/** True iff the character is a single-quote ending context (or any \s). */
function isSingleEndingChar(ch: string): boolean {
  return SPACE_RE.test(ch) || SINGLE_ENDING_SET.has(ch)
}

/** `(?=sep?(?:[ending]|$))` at the item after `index`. */
function singleEndingAfter(items: Item[], index: number): boolean {
  const j = nextIndex(items, index, 1)
  if (j >= items.length) return true
  const item = items[j]
  return !item.boundary && isSingleEndingChar(item.ch)
}

/** `(?=sep?(?:s sep?)?(?:[ending]|$))` — ending context with an optional `s`. */
function singleEndingAfterOptionalS(items: Item[], index: number): boolean {
  if (singleEndingAfter(items, index)) return true
  const j = nextIndex(items, index, 1)
  return isCharItem(items, j, "s") && singleEndingAfter(items, j)
}

/** `(?=sep?s sep?(?:[ending]|$))` — the possessive lookahead (required `s`). */
function possessiveAfter(items: Item[], index: number): boolean {
  const j = nextIndex(items, index, 1)
  return isCharItem(items, j, "s") && singleEndingAfter(items, j)
}

/**
 * `(?<=[^\s“'])` — the closing/possessive lookbehind. A boundary directly
 * before the quote satisfies it (a boundary is an ordinary non-space char).
 */
function singleCloserBefore(items: Item[], index: number): boolean {
  if (index === 0) return false
  const prev = items[index - 1]
  if (prev.boundary) return true
  return !SPACE_RE.test(prev.ch) && prev.ch !== LEFT_DOUBLE_QUOTE && prev.ch !== "'"
}

/** Letter directly before (no boundary) and letter after (one boundary transparent). */
function isContractionContext(items: Item[], index: number): boolean {
  return isLetterItem(items, index - 1) && isLetterItem(items, nextIndex(items, index, 1))
}

/** True iff the item is outside the single-quote/word family (boundaries and text edges qualify). */
function outsideSingleQuoteFamily(items: Item[], index: number): boolean {
  if (index < 0 || index >= items.length) return true
  const item = items[index]
  return item.boundary || (!SINGLE_QUOTE_FAMILY.has(item.ch) && !WORD_RE.test(item.ch))
}

/** Empty (`''`) and whitespace-only (`' '`) single-quote pairs. */
function classifyEmptySinglePairs(items: Item[]): void {
  for (let i = 0; i < items.length - 1; i++) {
    if (!isCharItem(items, i, "'") || !isCharItem(items, i + 1, "'")) continue
    if (!outsideSingleQuoteFamily(items, i - 1) || !outsideSingleQuoteFamily(items, i + 2)) continue
    items[i].ch = LEFT_SINGLE_QUOTE
    items[i + 1].ch = RIGHT_SINGLE_QUOTE
    i++
  }
  for (let i = 0; i < items.length - 1; i++) {
    if (!isCharItem(items, i, "'")) continue
    let j = i + 1
    while (j < items.length && !items[j].boundary && SPACE_RE.test(items[j].ch)) j++
    if (j === i + 1 || !isCharItem(items, j, "'")) continue
    if (!outsideSingleQuoteFamily(items, i - 1) || !outsideSingleQuoteFamily(items, j + 1)) continue
    items[i].ch = LEFT_SINGLE_QUOTE
    items[j].ch = RIGHT_SINGLE_QUOTE
    i = j
  }
}

/** Rock 'n' Roll: ` 'n' ` between words → semantic apostrophes on both sides. */
function classifyNAbbreviation(items: Item[]): void {
  for (let i = 0; i + 2 < items.length; i++) {
    const q1 = items[i]
    if (q1.boundary || (q1.ch !== "'" && q1.ch !== RIGHT_SINGLE_QUOTE)) continue
    if (!isCharItem(items, i + 1, "n")) continue
    const q2 = items[i + 2]
    if (q2.boundary || (q2.ch !== "'" && q2.ch !== RIGHT_SINGLE_QUOTE)) continue
    // Behind: literal space, then up to one boundary, then a word char.
    if (!isCharItem(items, i - 1, " ") || !isWordItem(items, prevIndex(items, i - 1, 1))) continue
    // Ahead: literal space, then up to one boundary, then a word char.
    if (!isCharItem(items, i + 3, " ") || !isWordItem(items, nextIndex(items, i + 3, 1))) continue
    q1.ch = MODIFIER_LETTER_APOSTROPHE
    q2.ch = MODIFIER_LETTER_APOSTROPHE
    i += 2
  }
}

function isWordItem(items: Item[], index: number): boolean {
  if (index < 0 || index >= items.length) return false
  const item = items[index]
  return !item.boundary && WORD_RE.test(item.ch)
}

/** Possessive (`dog's`) → APOSTROPHE; then closing single (`'` in ending context) → CLOSE_SINGLE. */
function classifyPossessivesAndClosers(items: Item[]): void {
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    if (item.boundary) continue
    if ((item.ch === "'" || item.ch === RIGHT_SINGLE_QUOTE) && singleCloserBefore(items, i) && possessiveAfter(items, i)) {
      item.ch = MODIFIER_LETTER_APOSTROPHE
    }
  }
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    if (item.boundary || item.ch !== "'") continue
    if (singleCloserBefore(items, i) && singleEndingAfter(items, i)) {
      item.ch = RIGHT_SINGLE_QUOTE
    }
  }
}

/** Word-internal contraction: letter + quote + letter → APOSTROPHE. */
function classifyContractions(items: Item[]): void {
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    if (item.boundary) continue
    const ch = item.ch
    if (ch !== "'" && ch !== RIGHT_SINGLE_QUOTE && ch !== MODIFIER_LETTER_APOSTROPHE) continue
    if (isContractionContext(items, i)) {
      item.ch = MODIFIER_LETTER_APOSTROPHE
    }
  }
}

/** `'90s` / `'99` directly after the quote (no boundaries inside the digits). */
function isDecadeElision(items: Item[], index: number): boolean {
  if (!isDigitItem(items, index + 1) || !isDigitItem(items, index + 2)) return false
  let after = index + 3
  if (isCharItem(items, after, "s")) after++
  return !isLetterOrDigitItem(items, after)
}

function isDigitItem(items: Item[], index: number): boolean {
  if (index < 0 || index >= items.length) return false
  const item = items[index]
  return !item.boundary && DIGIT_RE.test(item.ch)
}

function isLetterOrDigitItem(items: Item[], index: number): boolean {
  if (index < 0 || index >= items.length) return false
  const item = items[index]
  return !item.boundary && (LETTER_RE.test(item.ch) || DIGIT_RE.test(item.ch))
}

/** `nʼ ` directly after the quote — a quote leading into an already-classified 'n'. */
function isNAbbreviationAhead(items: Item[], index: number): boolean {
  return isCharItem(items, index + 1, "n")
    && isCharItem(items, index + 2, MODIFIER_LETTER_APOSTROPHE)
    && isCharItem(items, index + 3, " ")
}

/**
 * Forward scan for a closing single quote, halting (no closer) at a line
 * break or another single-quote opener. Boundaries are transparent.
 */
function hasClosingSingleAhead(items: Item[], index: number): boolean {
  for (let j = index + 1; j < items.length; j++) {
    const item = items[j]
    if (item.boundary) continue
    const ch = item.ch
    if (ch === "\n" || ch === LEFT_SINGLE_QUOTE || ch === "'") return false
    if ((ch === RIGHT_SINGLE_QUOTE || ch === MODIFIER_LETTER_APOSTROPHE)
      && !isContractionContext(items, j)
      && singleEndingAfterOptionalS(items, j)) {
      return true
    }
  }
  return false
}

/**
 * Leading elision: a straight quote not preceded by a word char is an
 * apostrophe ('tis, '90s) unless a closing single quote lies ahead. Decisions
 * are taken against the pre-pass state and applied together, so a quote
 * converted here is still seen as a straight quote by later scans in the same
 * pass (snapshot semantics).
 */
function classifyLeadingApostrophes(items: Item[]): void {
  const toConvert: number[] = []
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    if (item.boundary || item.ch !== "'") continue
    if (isWordItem(items, i - 1)) continue
    if (isDecadeElision(items, i) || isNAbbreviationAhead(items, i) || !hasClosingSingleAhead(items, i)) {
      toConvert.push(i)
    }
  }
  for (const index of toConvert) {
    items[index].ch = MODIFIER_LETTER_APOSTROPHE
  }
}

/** Opener-position straight single quote → OPEN_SINGLE. */
function classifyOpeningSingles(items: Item[]): void {
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    if (item.boundary || item.ch !== "'") continue
    // Ahead: a boundary item satisfies \S (a boundary is non-space).
    const next = items[i + 1]
    if (next === undefined || (!next.boundary && SPACE_RE.test(next.ch))) continue
    // Behind: up to one boundary, then line start or an opener-context char.
    const j = prevIndex(items, i, 1)
    if (j >= 0) {
      const before = items[j]
      if (before.boundary) continue
      if (!SPACE_RE.test(before.ch) && !SINGLE_OPEN_BEFORE_SET.has(before.ch)) continue
    }
    item.ch = LEFT_SINGLE_QUOTE
  }
}

/**
 * Unmatched CLOSE_SINGLE after s/S → APOSTROPHE (plural possessives), via the
 * advisory open/close balance scan. Boundaries are fully transparent here.
 */
function classifyPluralPossessives(items: Item[]): void {
  let balance = 0
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    if (item.boundary) continue
    if (item.ch === LEFT_SINGLE_QUOTE) {
      balance++
      continue
    }
    if (item.ch !== RIGHT_SINGLE_QUOTE) continue
    if (balance > 0) {
      balance--
      continue
    }
    let j = i - 1
    while (j >= 0 && items[j].boundary) j--
    if (j >= 0 && (items[j].ch === "s" || items[j].ch === "S")) {
      item.ch = MODIFIER_LETTER_APOSTROPHE
    }
  }
}

function classifySingles(items: Item[]): void {
  classifyEmptySinglePairs(items)
  classifyNAbbreviation(items)
  classifyPossessivesAndClosers(items)
  classifyContractions(items)
  classifyLeadingApostrophes(items)
  classifyOpeningSingles(items)
  classifyPluralPossessives(items)
}

// ---------------------------------------------------------------------------
// Double-quote classification
// ---------------------------------------------------------------------------

/** Empty (`""`) and whitespace-only (`" "`) double-quote pairs (no boundaries allowed anywhere in or around the match). */
function classifyEmptyDoublePairs(items: Item[]): void {
  const beforeOk = (index: number): boolean => {
    if (index < 0) return true
    const item = items[index]
    return !item.boundary && (SPACE_RE.test(item.ch) || DOUBLE_EMPTY_BEFORE_SET.has(item.ch))
  }
  const afterOk = (index: number): boolean => {
    if (index >= items.length) return true
    const item = items[index]
    return !item.boundary && (SPACE_RE.test(item.ch) || DOUBLE_EMPTY_AFTER_SET.has(item.ch))
  }
  for (let i = 0; i < items.length - 1; i++) {
    if (!isCharItem(items, i, '"') || !isCharItem(items, i + 1, '"')) continue
    if (!beforeOk(i - 1) || !afterOk(i + 2)) continue
    items[i].ch = LEFT_DOUBLE_QUOTE
    items[i + 1].ch = RIGHT_DOUBLE_QUOTE
    i++
  }
  for (let i = 0; i < items.length - 1; i++) {
    if (!isCharItem(items, i, '"')) continue
    let j = i + 1
    while (j < items.length && !items[j].boundary && SPACE_RE.test(items[j].ch)) j++
    if (j === i + 1 || !isCharItem(items, j, '"')) continue
    if (!beforeOk(i - 1) || !afterOk(j + 1)) continue
    items[i].ch = LEFT_DOUBLE_QUOTE
    items[j].ch = RIGHT_DOUBLE_QUOTE
    i = j
  }
}

/**
 * Opener-position prefix for a straight double quote: line start, an
 * opener-context character, or — unlike single quotes — a bare boundary.
 */
function doubleOpenerPrefixOk(items: Item[], index: number): boolean {
  if (index === 0) return true
  const prev = items[index - 1]
  if (prev.boundary) return true
  return SPACE_RE.test(prev.ch) || DOUBLE_OPEN_BEFORE_SET.has(prev.ch)
}

/** Three literal dots with no boundaries between them, starting at `index`. */
function isEllipsisDots(items: Item[], index: number): boolean {
  return isCharItem(items, index, ".") && isCharItem(items, index + 1, ".") && isCharItem(items, index + 2, ".")
}

/** Opening double quote by following context. */
function classifyOpeningDoubles(items: Item[]): void {
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    if (item.boundary || item.ch !== '"') continue
    if (!doubleOpenerPrefixOk(items, i)) continue
    // Arm 1: a boundary then space/period/comma (the boundary-start quirk).
    const next = items[i + 1]
    let opens = false
    if (next?.boundary === true) {
      const afterBoundary = items[i + 2]
      opens = afterBoundary !== undefined && !afterBoundary.boundary
        && (afterBoundary.ch === " " || afterBoundary.ch === "." || afterBoundary.ch === ",")
    }
    // Arm 2: up to one boundary, then "..." or a non-ending character.
    if (!opens) {
      const j = nextIndex(items, i, 1)
      if (j < items.length && !items[j].boundary) {
        const ch = items[j].ch
        opens = isEllipsisDots(items, j) || (!SPACE_RE.test(ch) && !DOUBLE_OPEN_ENDING_SET.has(ch))
      }
    }
    if (opens) item.ch = LEFT_DOUBLE_QUOTE
  }
}

/**
 * Quoted-punctuation openers like `"?"`: an opener-prefixed straight double
 * quote with a closing straight double quote anywhere ahead (at least one
 * item between them). Decisions use the pass-start set of straight quotes.
 */
function classifyQuotedPunctuationOpeners(items: Item[]): void {
  const straightIndices: number[] = []
  for (let i = 0; i < items.length; i++) {
    if (isCharItem(items, i, '"')) straightIndices.push(i)
  }
  for (let k = 0; k < straightIndices.length; k++) {
    const i = straightIndices[k]
    if (!doubleOpenerPrefixOk(items, i)) continue
    const closer = straightIndices[k + 1]
    if (closer !== undefined && closer >= i + 2) {
      items[i].ch = LEFT_DOUBLE_QUOTE
    }
  }
}

/** The `{`-context opener quirk: `{"`, `{ "`, and `{<sep> "`. */
function classifyBraceOpeners(items: Item[]): void {
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    if (item.boundary || item.ch !== '"') continue
    const direct = isCharItem(items, i - 1, "{")
    const viaSpace = isCharItem(items, i - 1, " ") && isCharItem(items, prevIndex(items, i - 1, 1), "{")
    if (direct || viaSpace) item.ch = LEFT_DOUBLE_QUOTE
  }
}

function isDoubleCloseAfterChar(ch: string): boolean {
  return SPACE_RE.test(ch) || DOUBLE_CLOSE_AFTER_SET.has(ch)
}

/**
 * Closing double quote by ending context: a non-space/non-paren character (or
 * a boundary) before it, and an ending character, a boundary, or end of input
 * after it. A consumed span can never contain the next match's before-character
 * (the quote only closes when followed by a non-quote), so no overlap tracking
 * is needed.
 */
function classifyClosingDoubles(items: Item[]): void {
  for (let i = 1; i < items.length; i++) {
    const item = items[i]
    if (item.boundary || item.ch !== '"') continue
    const before = items[i - 1]
    if (!before.boundary && (SPACE_RE.test(before.ch) || before.ch === "(")) continue
    const next = items[i + 1]
    if (next === undefined || next.boundary || isDoubleCloseAfterChar(next.ch)) {
      item.ch = RIGHT_DOUBLE_QUOTE
    }
  }
}

/** End-of-input closer: a straight double quote at the very end (one boundary transparent). */
function classifyEndOfInputClosers(items: Item[]): void {
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    if (item.boundary || item.ch !== '"') continue
    if (nextIndex(items, i, 1) >= items.length) {
      item.ch = RIGHT_DOUBLE_QUOTE
    }
  }
}

/** The `'` before CLOSE_DOUBLE quirk: `you.'"` → CLOSE_SINGLE. */
function classifySinglesBeforeClosingDoubles(items: Item[]): void {
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    if (item.boundary || item.ch !== "'") continue
    if (isCharItem(items, i + 1, RIGHT_DOUBLE_QUOTE)) {
      item.ch = RIGHT_SINGLE_QUOTE
    }
  }
}

function classifyDoubles(items: Item[]): void {
  classifyEmptyDoublePairs(items)
  classifyOpeningDoubles(items)
  classifyQuotedPunctuationOpeners(items)
  classifyBraceOpeners(items)
  classifyClosingDoubles(items)
  classifyEndOfInputClosers(items)
  classifySinglesBeforeClosingDoubles(items)
}

// ---------------------------------------------------------------------------
// Punctuation placement on the role stream
// ---------------------------------------------------------------------------

/**
 * Run of consecutive CLOSE_* roles (any depth) starting at `start`, with at
 * most one boundary between consecutive closers. Returns the item index just
 * past the run, or -1 when there is no run.
 */
function scanClosingRun(items: Item[], start: number): number {
  if (start >= items.length || items[start].boundary || !CLOSING_SET.has(items[start].ch)) return -1
  let runEnd = start + 1
  for (;;) {
    let next = runEnd
    if (next < items.length && items[next].boundary) next++
    if (next >= items.length || items[next].boundary || !CLOSING_SET.has(items[next].ch)) break
    runEnd = next + 1
  }
  return runEnd
}

function isMovablePeriodAt(items: Item[], index: number): boolean {
  return items[index].ch === "." && !isEllipsisDots(items, index)
}

function isMovableCommaAt(items: Item[], index: number): boolean {
  return items[index].ch === ","
}

interface Relocation {
  /** Index of the punctuation item in the pass-input order. */
  from: number
  /** Index of the pass-input item the punctuation lands next to. */
  to: number
  side: "after" | "before"
  anchorOffset: number
  anchorBind: "left" | "right"
}

/**
 * Applies collected relocations in one linear rebuild (per-move splices would
 * make the pass quadratic on punctuation-dense input). Relocation spans are
 * disjoint and ordered, so a single cursor over `moves` suffices.
 */
function applyRelocations(order: Item[], moves: Relocation[]): Item[] {
  if (moves.length === 0) return order
  for (const move of moves) {
    const item = order[move.from]
    item.moved = true
    item.anchorOffset = move.anchorOffset
    item.anchorBind = move.anchorBind
  }
  const result: Item[] = []
  let m = 0
  for (let i = 0; i < order.length; i++) {
    const move = m < moves.length ? moves[m] : undefined
    if (move?.side === "before" && i === move.to) result.push(order[move.from])
    if (move !== undefined && i === move.from) {
      if (move.side === "before") m++
      continue
    }
    result.push(order[i])
    if (move?.side === "after" && i === move.to) {
      result.push(order[move.from])
      m++
    }
  }
  return result
}

/**
 * American style: a period or comma directly after a closing-quote run moves
 * to just before the run, unless the character before the run is terminal
 * punctuation ("Stop!". keeps its period outside). The scan advances one item
 * on every failed position, so a blocked outer run is retried one level in.
 */
function movePunctuationInside(order: Item[], isMovable: (items: Item[], index: number) => boolean): Item[] {
  // Decisions are taken against the pass-input order (the scan reads its input
  // order while building the output), then applied together.
  const moves: Relocation[] = []
  let position = 0
  while (position < order.length) {
    const runStart = order[position].boundary ? position + 1 : position
    const runEnd = scanClosingRun(order, runStart)
    if (runEnd === -1) {
      position++
      continue
    }
    const punctIndex = runEnd < order.length && order[runEnd].boundary ? runEnd + 1 : runEnd
    const precededByTerminal = position > 0 && !order[position - 1].boundary && TERMINAL_SET.has(order[position - 1].ch)
    if (precededByTerminal || punctIndex >= order.length || order[punctIndex].boundary || !isMovable(order, punctIndex)) {
      position++
      continue
    }
    moves.push({ from: punctIndex, to: runStart, side: "before", anchorOffset: order[runStart].start, anchorBind: "right" })
    position = punctIndex + 1
  }
  return applyRelocations(order, moves)
}

/**
 * British/German/French: a period or comma directly before a closing-quote
 * run moves past the whole run. No terminal-punctuation guard.
 */
function movePunctuationOutside(order: Item[], punctChar: string): Item[] {
  const moves: Relocation[] = []
  let position = 0
  while (position < order.length) {
    const item = order[position]
    if (item.boundary || item.ch !== punctChar) {
      position++
      continue
    }
    // Quotes group: one or more closers, each preceded by at most one boundary.
    let last = -1
    let j = position + 1
    for (;;) {
      let k = j
      if (k < order.length && order[k].boundary) k++
      if (k >= order.length || order[k].boundary || !CLOSING_SET.has(order[k].ch)) break
      last = k
      j = k + 1
    }
    if (last === -1) {
      position++
      continue
    }
    moves.push({ from: position, to: last, side: "after", anchorOffset: order[last].end, anchorBind: "left" })
    position = last + 1
  }
  return applyRelocations(order, moves)
}

function applyPunctuationPlacement(items: Item[], style: ActiveQuoteStyle): Item[] {
  if (style === "american") {
    return movePunctuationInside(movePunctuationInside(items, isMovablePeriodAt), isMovableCommaAt)
  }
  return movePunctuationOutside(movePunctuationOutside(items, "."), ",")
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

/** Per-locale glyph table. `apostrophe` is U+2019 for niceQuotes, U+02BC for classifyApostrophes. */
function renderTable(style: ActiveQuoteStyle, apostrophe: string): Record<QuoteRole, string> {
  const base: Record<QuoteRole, string> = {
    APOSTROPHE: apostrophe,
    CLOSE_DOUBLE: RIGHT_DOUBLE_QUOTE,
    CLOSE_SINGLE: RIGHT_SINGLE_QUOTE,
    DOUBLE_PRIME,
    LITERAL: "",
    OPEN_DOUBLE: LEFT_DOUBLE_QUOTE,
    OPEN_SINGLE: LEFT_SINGLE_QUOTE,
    PRIME,
  }
  if (style === "german") {
    base.OPEN_DOUBLE = DOUBLE_LOW_9_QUOTE
    base.CLOSE_DOUBLE = LEFT_DOUBLE_QUOTE
    base.OPEN_SINGLE = SINGLE_LOW_9_QUOTE
    base.CLOSE_SINGLE = LEFT_SINGLE_QUOTE
  } else if (style === "french") {
    base.OPEN_DOUBLE = `${LEFT_GUILLEMET}${NNBSP}`
    base.CLOSE_DOUBLE = `${NNBSP}${RIGHT_GUILLEMET}`
  }
  return base
}

/** Queues replace/delete/insert edits realizing the final item sequence. */
function queueRenderEdits(view: ProseView, items: Item[], table: Record<QuoteRole, string>): void {
  const text = view.text
  // Moved items anchored at the same offset merge into one insertion, in
  // final item order (ProseView rejects duplicate pure insertions).
  const insertions = new Map<string, { offset: number; bind: "left" | "right"; text: string }>()
  for (const item of items) {
    if (item.boundary) continue
    const role = ROLE_BY_CHAR.get(item.ch)
    const rendered = role === undefined ? item.ch : table[role]
    if (item.moved) {
      view.replace(item.start, item.end, "")
      const key = `${item.anchorOffset}|${item.anchorBind}`
      const existing = insertions.get(key)
      if (existing) {
        existing.text += rendered
      } else {
        insertions.set(key, { offset: item.anchorOffset, bind: item.anchorBind, text: rendered })
      }
      continue
    }
    // Fast path for ordinary characters; pre-labeled items may have changed
    // `ch` without gaining a role (German orphan closers) and must still diff.
    if (role === undefined && item.ch === text[item.start] && item.end - item.start === 1) continue
    if (rendered !== text.slice(item.start, item.end)) {
      view.replace(item.start, item.end, rendered)
    }
  }
  for (const insertion of insertions.values()) {
    view.replace(insertion.offset, insertion.offset, insertion.text, { bind: insertion.bind })
  }
}

// ---------------------------------------------------------------------------
// Public engine entry points
// ---------------------------------------------------------------------------

/**
 * The quote/apostrophe role classifier: one boundary-aware scan over the
 * view's text. Commits its edits.
 */
export function classifyAndRenderQuotes(
  view: ProseView,
  style: ActiveQuoteStyle,
  apostrophe: string,
): void {
  if (!QUOTE_CANDIDATE_RE.test(view.text)) return
  const items = buildItems(view, style)
  classifySingles(items)
  classifyDoubles(items)
  const placed = applyPunctuationPlacement(items, style)
  queueRenderEdits(view, placed, renderTable(style, apostrophe))
  view.commit()
}

// ---------------------------------------------------------------------------
// Prime marks
// ---------------------------------------------------------------------------

/** `′` followed by any mix of digits/boundaries up to `digitIndex` (feet-inches like 5′10"). */
function feetInchesBefore(items: Item[], digitIndex: number): boolean {
  let j = digitIndex - 1
  while (j >= 0 && (items[j].boundary || DIGIT_RE.test(items[j].ch))) j--
  return j >= 0 && items[j].ch === PRIME
}

/**
 * The prime/quote disambiguation: a quote candidate after a digit converts to
 * a prime only when the running quote balance is open-free; contractions are
 * skipped and trailing apostrophes consume balance without converting.
 */
function convertPrimes(items: Item[]): void {
  const passes: [string, string][] = [
    ["'", PRIME],
    ['"', DOUBLE_PRIME],
  ]
  for (const [quote, primeChar] of passes) {
    let balance = 0
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (item.boundary || item.ch !== quote) continue
      const digitIndex = prevIndex(items, i, 1)
      if (isDigitItem(items, digitIndex) && !isLetterItem(items, i + 1)) {
        // Prime candidate. The after-context check is boundary-blind: a
        // boundary right after the quote always passes it.
        if (balance <= 0) {
          item.ch = primeChar
          continue
        }
        if (primeChar === DOUBLE_PRIME && feetInchesBefore(items, digitIndex)) {
          item.ch = primeChar
          continue
        }
        balance--
        continue
      }
      const letterBefore = isLetterItem(items, prevIndex(items, i, 1))
      if (letterBefore && isLetterItem(items, nextIndex(items, i, 1))) continue
      if (letterBefore) {
        if (balance > 0) balance--
        continue
      }
      balance = balance <= 0 ? 1 : balance - 1
    }
  }
}

/** primeMarks engine: converts `5'10"` to `5′10″` with quote-balance guards. Commits its edits. */
export function convertPrimeMarks(view: ProseView): void {
  const text = view.text
  if (!text.includes("'") && !text.includes('"')) return
  const items = buildItems(view, "american")
  convertPrimes(items)
  for (const item of items) {
    if (!item.boundary && item.ch !== text[item.start]) {
      view.replace(item.start, item.end, item.ch)
    }
  }
  view.commit()
}
