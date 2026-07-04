import { FOLDED_WORD_CHARS, LATIN_LETTER_RE, SPACE_CHAR_RE, TERMINAL_PUNCTUATION, UNICODE_SYMBOLS, WORD_RE } from "./constants.js"
import type { ProseView } from "./prose-view.js"

const {
  EM_DASH,
  EN_DASH,
  MINUS,
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
  ELLIPSIS,
  DOUBLE_QUESTION,
  QUESTION_EXCLAMATION,
  EXCLAMATION_QUESTION,
  DOUBLE_EXCLAMATION,
  INTERROBANG,
  APPROXIMATE,
  GREATER_EQUAL,
  LESS_EQUAL,
  NOT_EQUAL,
  PLUS_MINUS,
} = UNICODE_SYMBOLS

/**
 * Glyphs the symbol passes fold `?`/`!` runs and `...` into. The quote rules
 * run before those passes, so every ending-context set that contains the
 * source punctuation must contain the folded glyph too — otherwise a decision
 * gated on `?!` flips once a re-run sees `⁈`.
 */
const FOLDED_TERMINALS = [DOUBLE_QUESTION, QUESTION_EXCLAMATION, EXCLAMATION_QUESTION, DOUBLE_EXCLAMATION, INTERROBANG] as const

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
 * the HTML regression corpus and the migration's differential fuzz): boundary-transparent
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
  /**
   * Set on a CLOSE_SINGLE that has no matching opener and sits directly after
   * a letter — a word-final quote that reads as elision ("keep on truckin'")
   * at least as plausibly as quotation. It keeps its closer role (glyph
   * U+2019 either way) but punctuation placement must not move around it:
   * pulling the period into "truckin'." corrupts the word to "truckin.'".
   */
  unmatchedAfterLetter?: boolean
  /** Insertion anchor (clean-text offset and bind side) once moved. */
  anchorOffset: number
  anchorBind: "left" | "right"
}

const SPACE_RE = /\s/
const DIGIT_RE = /\d/

/** Fast path: text without any quote-like character is returned untouched. */
const QUOTE_CANDIDATE_RE = new RegExp(
  `['"${LEFT_SINGLE_QUOTE}${RIGHT_SINGLE_QUOTE}${LEFT_DOUBLE_QUOTE}${RIGHT_DOUBLE_QUOTE}` +
  `${MODIFIER_LETTER_APOSTROPHE}${DOUBLE_LOW_9_QUOTE}${SINGLE_LOW_9_QUOTE}${LEFT_GUILLEMET}${RIGHT_GUILLEMET}]`
)

const TERMINAL_SET = new Set<string>(TERMINAL_PUNCTUATION)

const CLOSING_CHARS = [RIGHT_SINGLE_QUOTE, RIGHT_DOUBLE_QUOTE] as const
const CLOSING_SET = new Set<string>(CLOSING_CHARS)

/**
 * Placement alphabet for renders that collapse apostrophes into U+2019: a
 * re-run reads those apostrophes as closing single quotes (in every style but
 * German, which re-derives U+2019 by position), so placement must treat an
 * APOSTROPHE item as part of a closing run for the transform to be a fixed
 * point.
 */
const CLOSING_OR_APOSTROPHE_SET = new Set<string>([...CLOSING_CHARS, MODIFIER_LETTER_APOSTROPHE])

/** Chars from `'` ${LSQ} ${RSQ} ${MLA}; \w handled separately. */
const SINGLE_QUOTE_FAMILY = new Set<string>(["'", LEFT_SINGLE_QUOTE, RIGHT_SINGLE_QUOTE, MODIFIER_LETTER_APOSTROPHE])

/** Ending-context chars for single quotes (plus any \s char). The curly
 * doubles accompany the straight one: `"` curls into one of them in this same
 * pass, and an ending decision must survive the curl. */
const SINGLE_ENDING_SET = new Set<string>([".", "!", "?", ";", ",", ")", EM_DASH, "-", "]", '"', LEFT_DOUBLE_QUOTE, RIGHT_DOUBLE_QUOTE, ELLIPSIS, ...FOLDED_TERMINALS])

/** Boundary chars before an opening single quote (plus any \s char). A
 * straight double quote belongs with the curly pair: whichever way it curls
 * lands in this set, so deciding as if it already had keeps re-runs (which
 * see the curled glyph) consistent. */
const SINGLE_OPEN_BEFORE_SET = new Set<string>([LEFT_DOUBLE_QUOTE, RIGHT_DOUBLE_QUOTE, '"', EM_DASH, "-", "("])

/** Boundary chars before an opening double quote (plus any \s char). */
const DOUBLE_OPEN_BEFORE_SET = new Set<string>(["(", "/", "[", "{", "-", EM_DASH])

/** Ending-context chars that block the opener rule's arm 2 (plus any \s char).
 * ELLIPSIS is deliberately absent: the rule's `...` arm opens, so `…` must too. */
const DOUBLE_OPEN_ENDING_SET = new Set<string>([")", EM_DASH, ",", "!", "?", ";", ":", ".", "}", ...FOLDED_TERMINALS])

/** Chars allowed before an empty double-quote pair (plus any \s char). */
const DOUBLE_EMPTY_BEFORE_SET = new Set<string>(["(", "[", "{"])

/** Chars allowed after an empty double-quote pair (plus any \s char).
 * Aligned to contain {@link DOUBLE_CLOSE_AFTER_SET}: a pair the empty-pair
 * rule rejects falls through to opener/closer rules whose after-contexts are
 * the closer set, and the two routes must accept the same shapes or a re-run
 * (which sees the rendered opener, not the whitespace) classifies anew. */
const DOUBLE_EMPTY_AFTER_SET = new Set<string>([")", "]", "}", ".", "!", "?", ",", ";", ":", "/", "-", "s", EM_DASH, ELLIPSIS, ...FOLDED_TERMINALS])

/** Ending-context chars after a closing double quote (plus any \s char). */
const DOUBLE_CLOSE_AFTER_SET = new Set<string>(["/", ")", ".", ",", ";", EM_DASH, ":", "-", "}", "!", "?", "s", ELLIPSIS, ...FOLDED_TERMINALS])

/** Builds an `(items, index)` predicate: in range, non-boundary, and `test(ch)`. */
function makeItemTester(test: (ch: string) => boolean): (items: Item[], index: number) => boolean {
  return (items, index) => {
    if (index < 0 || index >= items.length) return false
    const item = items[index]
    return !item.boundary && test(item.ch)
  }
}

const isLetterItem = makeItemTester((ch) => LATIN_LETTER_RE.test(ch))
const isDigitItem = makeItemTester((ch) => DIGIT_RE.test(ch))
const isWordItem = makeItemTester((ch) => WORD_RE.test(ch) || FOLDED_WORD_CHARS.has(ch))
const isLetterOrDigitItem = makeItemTester((ch) => LATIN_LETTER_RE.test(ch) || DIGIT_RE.test(ch) || FOLDED_WORD_CHARS.has(ch))
/** Letter test that treats folded word glyphs as the letters they fold from
 * (`X` → `×`, `st` → `ˢᵗ`); see {@link FOLDED_WORD_CHARS}. */
const isLetterOrFoldedItem = makeItemTester((ch) => LATIN_LETTER_RE.test(ch) || FOLDED_WORD_CHARS.has(ch))

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
      } else if (ch === RIGHT_SINGLE_QUOTE || ch === MODIFIER_LETTER_APOSTROPHE) {
        // U+02BC renders as U+2019, which the next run re-derives by position;
        // re-derive it the same way now so both runs agree.
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
  // A `!` that folds to `≠` is not the ending it looks like (`≠` is not in
  // the ending set), and the re-run sees the folded glyph.
  if (foldsToNotEqual(items, j)) return false
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
 * `(?<=[^\s“'"])` — the closing/possessive lookbehind. A boundary directly
 * before the quote satisfies it (a boundary is an ordinary non-space char).
 * A straight double quote is excluded along with `“`: it may curl into an
 * opener later in this same pass, which puts the candidate in exactly the
 * nested-opener position the `“` exclusion covers, and deciding against it
 * now keeps re-runs (which see the curled glyph) consistent.
 */
function singleCloserBefore(items: Item[], index: number): boolean {
  if (index === 0) return false
  const prev = items[index - 1]
  if (prev.boundary) return true
  return !SPACE_RE.test(prev.ch) && prev.ch !== LEFT_DOUBLE_QUOTE && prev.ch !== "'" && prev.ch !== '"'
}

/** Letter directly before (no boundary) and letter after (one boundary transparent). */
function isContractionContext(items: Item[], index: number): boolean {
  return isLetterOrFoldedItem(items, index - 1) && isLetterOrFoldedItem(items, nextIndex(items, index, 1))
}

/**
 * True iff the item is outside the single-quote/word family (boundaries and
 * text edges qualify). Folded word glyphs count as the word chars they fold
 * from (`3x''` and `3×''` must agree on the empty-pair gate).
 */
function outsideSingleQuoteFamily(items: Item[], index: number): boolean {
  if (index < 0 || index >= items.length) return true
  const item = items[index]
  return item.boundary || (!SINGLE_QUOTE_FAMILY.has(item.ch) && !WORD_RE.test(item.ch) && !FOLDED_WORD_CHARS.has(item.ch))
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

/**
 * Possessive (`dog's`) → APOSTROPHE; then closing single (`'` in ending
 * context) → CLOSE_SINGLE. Returns true when any item changed.
 */
function classifyPossessivesAndClosers(items: Item[]): boolean {
  let changed = false
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    if (item.boundary) continue
    if ((item.ch === "'" || item.ch === RIGHT_SINGLE_QUOTE) && singleCloserBefore(items, i) && possessiveAfter(items, i)) {
      item.ch = MODIFIER_LETTER_APOSTROPHE
      changed = true
    }
  }
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    if (item.boundary || item.ch !== "'") continue
    if (singleCloserBefore(items, i) && singleEndingAfter(items, i)) {
      item.ch = RIGHT_SINGLE_QUOTE
      changed = true
    }
  }
  return changed
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
  // A closing single quote directly after the digits means the number is
  // quoted (`'37'`), not elided — the leading quote is its opener. Only the
  // already-classified closer needs checking: a still-straight quote there
  // halts the closer scan, which elides the leading quote anyway.
  if (isCharItem(items, after, RIGHT_SINGLE_QUOTE)) return false
  return !isLetterOrDigitItem(items, after)
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
 * advisory open/close balance scan. An unmatched closer after any other
 * letter keeps its closer role but is flagged {@link Item.unmatchedAfterLetter}
 * so punctuation placement leaves it alone. Boundaries are fully transparent
 * here.
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
    } else if (j >= 0 && isLetterItem(items, j)) {
      item.unmatchedAfterLetter = true
    }
  }
}

function classifySingles(items: Item[], style: ActiveQuoteStyle): void {
  classifyEmptySinglePairs(items)
  classifyNAbbreviation(items)
  classifyPossessivesAndClosers(items)
  classifyContractions(items)
  classifyLeadingApostrophes(items)
  classifyOpeningSingles(items)
  // The rules above rewrite neighbors the closer/possessive lookbehind keyed
  // on: in a `''` chain the left quote becomes an apostrophe, which renders
  // as U+2019 — exactly the glyph a re-run reads in that slot, where the
  // straight `'` was excluded. Re-run the closer rule until it settles so the
  // first pass reaches the re-run's reading. German is exempt: it re-derives
  // every rendered single back to a straight `'`, so its re-run keeps the
  // exclusion.
  if (style !== "german") {
    while (classifyPossessivesAndClosers(items)) { /* to fixpoint */ }
  }
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
 * Glyphs of folds that can end immediately before a quote while consuming an
 * interior node boundary (math pairs like `~=` → `≈`, dot triples → `…`,
 * `?`/`!` ligatures; the bare `!` is the `!!` normalization's output). Such a
 * fold collapses the boundary to just before the quote, so a boundary preceded
 * by one of these marks a prefix whose unfolded source character (`=`, `.`,
 * `!`, `?`) blocked the opener rule — and the re-run must block too.
 */
const FOLD_STRANDED_PREFIX_CHARS = new Set<string>([
  ELLIPSIS, APPROXIMATE, NOT_EQUAL, LESS_EQUAL, GREATER_EQUAL,
  DOUBLE_QUESTION, QUESTION_EXCLAMATION, EXCLAMATION_QUESTION, "!",
])

/**
 * Opener-position prefix for a straight double quote: line start, an
 * opener-context character, or — unlike single quotes — a bare boundary
 * (unless the boundary was stranded by a fold; see
 * {@link FOLD_STRANDED_PREFIX_CHARS}).
 */
function doubleOpenerPrefixOk(items: Item[], index: number): boolean {
  if (index === 0) return true
  const prev = items[index - 1]
  if (prev.boundary) {
    // The stranded-prefix lookbehind reads through every stacked boundary:
    // each fold round can empty another node (`!`|`!`|`""` leaves two stacked
    // boundaries before the quote), and the re-run must keep blocking.
    let beforeIndex = index - 2
    while (beforeIndex >= 0 && items[beforeIndex].boundary) beforeIndex--
    return beforeIndex < 0 || !FOLD_STRANDED_PREFIX_CHARS.has(items[beforeIndex].ch)
  }
  return SPACE_RE.test(prev.ch) || DOUBLE_OPEN_BEFORE_SET.has(prev.ch)
}

/**
 * Index of the dot reachable across one inter-dot gap from the dot at
 * `dotIndex` (the ellipsis pass's gap rule: the gap is nothing, one space
 * character, or one node boundary). -1 when none.
 */
function nextEllipsisDotItem(items: Item[], dotIndex: number): number {
  let j = dotIndex + 1
  if (j < items.length && items[j].boundary) {
    // Empty gap with one boundary; a second boundary breaks the gap.
    j++
    return isCharItem(items, j, ".") ? j : -1
  }
  if (j >= items.length) return -1
  if (items[j].ch === ".") return j
  if (SPACE_CHAR_RE.test(items[j].ch) && j + 1 < items.length && !items[j + 1].boundary && items[j + 1].ch === ".") {
    return j + 1
  }
  return -1
}

/**
 * True iff a `...`/`. . .` triple the ellipsis pass folds to `…` begins at
 * `index`. Rules gated on this must decide like they would on `…` itself,
 * since a re-run sees the folded glyph.
 */
function isEllipsisDots(items: Item[], index: number): boolean {
  if (!isCharItem(items, index, ".")) return false
  const second = nextEllipsisDotItem(items, index)
  return second >= 0 && nextEllipsisDotItem(items, second) >= 0
}

/**
 * `!=` (not followed by another `=`) at `index`: the math-symbol pass folds it
 * to `≠`, which is not an ending character, so ending-gated rules must read
 * the unfolded pair the same way. Mirrors the fold's boundary tolerance: one
 * boundary at the `!`/`=` junction, and the blocking third `=` is seen
 * through at most one boundary.
 */
function foldsToNotEqual(items: Item[], index: number): boolean {
  if (!isCharItem(items, index, "!")) return false
  const eq = nextIndex(items, index, 1)
  if (!isCharItem(items, eq, "=")) return false
  return !isCharItem(items, nextIndex(items, eq, 1), "=")
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
        opens = isEllipsisDots(items, j) || foldsToNotEqual(items, j)
          || (!SPACE_RE.test(ch) && !DOUBLE_OPEN_ENDING_SET.has(ch))
      }
    }
    if (opens) item.ch = LEFT_DOUBLE_QUOTE
  }
}

/**
 * Opener-position prefix for the quoted-punctuation rule. Unlike
 * {@link doubleOpenerPrefixOk}, boundaries are transparent here: a quote that
 * merely starts a node (e.g. `"` directly after `</a>`) is not in opener
 * position unless the character on the far side of the boundary run is itself
 * opener context — matching how the rule classifies the equivalent plain
 * string.
 */
function quotedPunctuationPrefixOk(items: Item[], index: number): boolean {
  let j = index - 1
  while (j >= 0 && items[j].boundary) j--
  if (j < 0) return true
  const ch = items[j].ch
  return SPACE_RE.test(ch) || DOUBLE_OPEN_BEFORE_SET.has(ch)
}

/**
 * Quoted-punctuation openers like `"?"`: an opener-prefixed straight double
 * quote with a closing straight double quote anywhere ahead (at least one
 * item between them). Decisions use the pass-start set of straight quotes.
 *
 * Inside an already-open double quote the same shape is that quote's closer,
 * not a new opener: in `"un-" or "non-"` the quote after `un-` is
 * opener-prefixed (a hyphen) with a straight quote ahead, but it closes the
 * open `“un-`. A running depth of classified doubles — updated as this pass
 * assigns roles, so each decision sees the ones before it — picks the reading.
 */
function classifyQuotedPunctuationOpeners(items: Item[]): void {
  const straightIndices: number[] = []
  for (let i = 0; i < items.length; i++) {
    if (isCharItem(items, i, '"')) straightIndices.push(i)
  }
  let openDepth = 0
  let k = 0
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    if (item.boundary) continue
    if (k < straightIndices.length && straightIndices[k] === i) {
      // `i` is a pass-start straight quote; after k++, `straightIndices[k]`
      // is the nearest pass-start straight quote ahead of it.
      k++
      const closer = straightIndices[k]
      if (quotedPunctuationPrefixOk(items, i) && closer !== undefined && closer >= i + 2) {
        item.ch = openDepth > 0 ? RIGHT_DOUBLE_QUOTE : LEFT_DOUBLE_QUOTE
      }
    }
    // Depth over classified doubles, including the role just assigned above.
    // A still-straight double quote below an open `“` counts as its closer:
    // the closing rules classify it that way after this pass ends.
    if (item.ch === LEFT_DOUBLE_QUOTE) openDepth++
    else if ((item.ch === RIGHT_DOUBLE_QUOTE || item.ch === '"') && openDepth > 0) openDepth--
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
 *
 * French: a plain space directly after an opener merges into the opener's
 * rendered NNBSP padding once spaces collapse, so a re-run reads the opener
 * itself in the lookbehind slot — read it that way now.
 */
function classifyClosingDoubles(items: Item[], style: ActiveQuoteStyle): void {
  for (let i = 1; i < items.length; i++) {
    const item = items[i]
    if (item.boundary || item.ch !== '"') continue
    const before = items[i - 1]
    if (!before.boundary && (SPACE_RE.test(before.ch) || before.ch === "(")) {
      const absorbedIntoOpener = style === "french" && before.ch === " " && isCharItem(items, i - 2, LEFT_DOUBLE_QUOTE)
      if (!absorbedIntoOpener) continue
    }
    const next = items[i + 1]
    if (foldsToNotEqual(items, i + 1)) continue
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

function classifyDoubles(items: Item[], style: ActiveQuoteStyle): void {
  classifyEmptyDoublePairs(items)
  classifyOpeningDoubles(items)
  classifyQuotedPunctuationOpeners(items)
  classifyBraceOpeners(items)
  classifyClosingDoubles(items, style)
  classifyEndOfInputClosers(items)
  classifySinglesBeforeClosingDoubles(items)
}

// ---------------------------------------------------------------------------
// Punctuation placement on the role stream
// ---------------------------------------------------------------------------

/**
 * True iff the item at `index` counts as a closing-run member for placement.
 * An APOSTROPHE directly after an `s` is excluded even when the placement
 * alphabet includes apostrophes: the re-run relabels that U+2019 an
 * apostrophe again (the plural-possessive rule keys on the `s`), so
 * punctuation must not move around it ("the boys'." keeps its period
 * outside).
 */
function closingRunMemberAt(items: Item[], index: number, closingSet: ReadonlySet<string>): boolean {
  if (index >= items.length || items[index].boundary || !closingSet.has(items[index].ch)) return false
  // A word-final closer with no opener behind it reads as elision; moving
  // punctuation around it corrupts the word ("truckin'." → "truckin.'").
  if (items[index].unmatchedAfterLetter) return false
  if (items[index].ch !== MODIFIER_LETTER_APOSTROPHE) return true
  const prev = prevIndex(items, index, 1)
  return !isCharItem(items, prev, "s") && !isCharItem(items, prev, "S")
}

/**
 * Run of consecutive closing-run members (any depth) starting at `start`, with
 * at most one boundary between consecutive closers. Returns the item index just
 * past the run, or -1 when there is no run.
 */
function scanClosingRun(items: Item[], start: number, closingSet: ReadonlySet<string>): number {
  if (start >= items.length || items[start].boundary || !closingRunMemberAt(items, start, closingSet)) return -1
  let runEnd = start + 1
  for (;;) {
    let next = runEnd
    if (next < items.length && items[next].boundary) next++
    if (next >= items.length || items[next].boundary || !closingRunMemberAt(items, next, closingSet)) break
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
function movePunctuationInside(order: Item[], isMovable: (items: Item[], index: number) => boolean, closingSet: ReadonlySet<string>): Item[] {
  // Decisions are taken against the pass-input order (the scan reads its input
  // order while building the output), then applied together.
  const moves: Relocation[] = []
  // Earliest unresolved straight single quote; remote closer-ahead scans start
  // there, so moves past it are gated below.
  let firstStraightSingle = -1
  for (let i = 0; i < order.length; i++) {
    if (!order[i].boundary && order[i].ch === "'") {
      firstStraightSingle = i
      break
    }
  }
  const movedFrom = new Set<number>()
  let position = 0
  while (position < order.length) {
    const runStart = order[position].boundary ? position + 1 : position
    const runEnd = scanClosingRun(order, runStart, closingSet)
    if (runEnd === -1) {
      position++
      continue
    }
    const punctIndex = runEnd < order.length && order[runEnd].boundary ? runEnd + 1 : runEnd
    // The terminal lookbehind skips punctuation already relocated by this
    // pass: those items no longer precede the run once the moves apply, and
    // the re-run (which sees them relocated) must reach the same decision.
    // One boundary is transparent: a ligature fold (`?` + `!` → `⁈`) pulls
    // the terminal char across the node edge, and the re-run reads it there.
    let beforeIndex = position - 1
    while (beforeIndex >= 0 && movedFrom.has(beforeIndex)) beforeIndex--
    if (beforeIndex >= 0 && order[beforeIndex].boundary && !(beforeIndex >= 1 && order[beforeIndex - 1].boundary)) {
      // No moved-item skip here: a moved punct is always run-adjacent, and
      // the run-skip above resolves such runs at the boundary item itself.
      beforeIndex--
    }
    const precededByTerminal = beforeIndex >= 0 && !order[beforeIndex].boundary && TERMINAL_SET.has(order[beforeIndex].ch)
    // Gates that read only the run's end hold for every sub-run too, so on
    // those failures the scan skips past the whole run — rescanning each
    // suffix would be quadratic on long closer runs. The position-dependent
    // lookbehinds (terminal char, A-side wall) instead retry one level in,
    // where the preceding item is a closer and can no longer block.
    if (punctIndex >= order.length || order[punctIndex].boundary || !isMovable(order, punctIndex)) {
      position = Math.max(runEnd, position + 1)
      continue
    }
    if (precededByTerminal || moveWallAt(order, prevIndex(order, runStart, 1))) {
      position++
      continue
    }
    if (moveWallAt(order, nextIndex(order, punctIndex, 1))) {
      position = Math.max(runEnd, position + 1)
      continue
    }
    if (insideMoveFlipsContext(order, runStart, punctIndex)) {
      position++
      continue
    }
    // A space directly before the run marks an exact-string quote (`"New ",`):
    // its content ends in whitespace on purpose, and pulling the punctuation
    // inside would attach it to that verbatim trailing space.
    if (beforeIndex >= 0 && !order[beforeIndex].boundary && SPACE_RE.test(order[beforeIndex].ch)) {
      position++
      continue
    }
    // Moving the punctuation inside strips the run of its ending context: an
    // unresolved straight single quote earlier in the text whose closer-ahead
    // scan reads a single closer in this run would stop seeing it as a closer
    // on the next run (`'5'.0` → `'5.’0`) unless the post-move follower is an
    // ending context itself. Leave the punctuation in place; the next run
    // reaches the same state and blocks again.
    if (firstStraightSingle !== -1 && firstStraightSingle < runStart
      && runContainsSingleCloser(order, runStart, runEnd)
      && !endingContextAfterMove(order, runEnd, punctIndex)) {
      position++
      continue
    }
    moves.push({ from: punctIndex, to: runStart, side: "before", anchorOffset: order[runStart].start, anchorBind: "right" })
    movedFrom.add(punctIndex)
    position = punctIndex + 1
  }
  return applyRelocations(order, moves)
}

/**
 * Mirror of {@link nextEllipsisDotItem} walking backwards: the dot reachable
 * across one inter-dot gap before (virtual) position `index`. -1 when none.
 */
function prevEllipsisDotItem(order: Item[], index: number): number {
  const j = index - 1
  if (j >= 0 && order[j].boundary) {
    return isCharItem(order, j - 1, ".") ? j - 1 : -1
  }
  if (j < 0) return -1
  if (order[j].ch === ".") return j
  if (SPACE_CHAR_RE.test(order[j].ch) && isCharItem(order, j - 1, ".")) return j - 1
  return -1
}

/**
 * Movable punctuation plus the ellipsis for the outside mover's chain guards:
 * `…` folds from the dots the guards block on, so it blocks the same way.
 */
const CHAIN_PUNCT_SET = new Set<string>([".", ",", ELLIPSIS])

/**
 * True iff moving the period at `punctIndex` to just before `order[runStart]`
 * would make the re-run read its surroundings differently:
 *
 *  - `..`/`. .` + `.` at the landing: the landed period completes a foldable
 *    dot triple, which the double-opener rule reads as `…`;
 *  - `.` + digit at the removal site: a period directly before a digit blocks
 *    the dash pass's number-range detection, so vacating the slot converts a
 *    range this run left alone.
 */
function insideMoveFlipsContext(order: Item[], runStart: number, punctIndex: number): boolean {
  if (order[punctIndex].ch === ".") {
    const second = prevEllipsisDotItem(order, runStart)
    if (second >= 0 && prevEllipsisDotItem(order, second) >= 0) return true
    const afterPunct = nextIndex(order, punctIndex, 1)
    if (afterPunct < order.length && !order[afterPunct].boundary && DIGIT_RE.test(order[afterPunct].ch)) return true
  }
  return false
}

/** True iff the run [start, end) contains a single-quote closer or apostrophe. */
function runContainsSingleCloser(order: Item[], start: number, end: number): boolean {
  for (let i = start; i < end; i++) {
    const ch = order[i].ch
    if (ch === RIGHT_SINGLE_QUOTE || ch === MODIFIER_LETTER_APOSTROPHE) return true
  }
  return false
}

/**
 * Mirror of {@link singleEndingAfter} at the run end as the post-move item
 * sequence reads it: the vacating punctuation leaves its surrounding boundary
 * items behind (an emptied node stacks them), and they all count against the
 * lookahead's one-boundary budget.
 */
function endingContextAfterMove(order: Item[], runEnd: number, punctIndex: number): boolean {
  let boundaries = 0
  for (let j = runEnd; j < order.length; j++) {
    if (j === punctIndex) continue
    if (order[j].boundary) {
      boundaries++
      if (boundaries > 1) return false
      continue
    }
    return endingContextAt(order, j)
  }
  return true
}

/**
 * Mirror of {@link singleEndingAfter}'s target test at an already-resolved,
 * in-range index (the sole caller bounds it below `order.length`).
 */
function endingContextAt(order: Item[], index: number): boolean {
  const item = order[index]
  if (foldsToNotEqual(order, index)) return false
  return !item.boundary && isSingleEndingChar(item.ch)
}

/**
 * Characters (or a node boundary) that satisfy an opener-prefix rule. Openers
 * classify before closers, so a closing quote re-derived with one of these in
 * its lookbehind slot flips to an opener on the next run. The union of
 * {@link SINGLE_OPEN_BEFORE_SET} and {@link DOUBLE_OPEN_BEFORE_SET}.
 */
const OPENER_PREFIX_CHARS = new Set<string>([...SINGLE_OPEN_BEFORE_SET, ...DOUBLE_OPEN_BEFORE_SET])

/**
 * True iff a closing quote would still re-derive as a closer with `prev` (the
 * item before the punctuation being moved out) directly before it. German
 * re-derives rendered closers from scratch on the next run (the orphan
 * fallback): the slot must pass the closer lookbehinds (non-space, non-`(`,
 * non-quote) and fail the opener prefixes (which preempt the closer rules); a
 * boundary satisfies the opener prefixes, so it blocks too. A blocked move
 * simply leaves the punctuation in place — a state the next run reproduces.
 */
function rederivesAsCloserAfter(prev: Item | undefined): boolean {
  if (prev === undefined || prev.boundary) return false
  return !SPACE_RE.test(prev.ch) && prev.ch !== "'" && !OPENER_PREFIX_CHARS.has(prev.ch)
}

/**
 * Characters a later run reads context-sensitively: straight quotes the
 * classifier leaves for re-reading, and dashes whose conversion rules key on
 * the adjacent character (`’-2` folds to a minus sign where `.-2` does not).
 * The folded math operators stand in for the two-character operators they
 * fold from: a hyphen wall inside `+-` must keep blocking once a re-run sees
 * `±`.
 */
const MOVE_WALL_CHARS = new Set<string>([
  "'", '"', "-", EN_DASH, EM_DASH, MINUS,
  APPROXIMATE, GREATER_EQUAL, LESS_EQUAL, NOT_EQUAL, PLUS_MINUS,
])

/**
 * True iff the item at `index` (one boundary transparent) is a character a
 * later run reads context-sensitively. Relocating punctuation past such an
 * item would change the context that run sees, so both movers treat it as a
 * wall: a blocked move leaves the punctuation where the next run finds — and
 * blocks — it again.
 */
function moveWallAt(items: Item[], index: number): boolean {
  if (index < 0 || index >= items.length) return false
  const item = items[index]
  return !item.boundary && MOVE_WALL_CHARS.has(item.ch)
}

/**
 * British/German/French: a period or comma directly before a closing-quote
 * run moves past the whole run. No terminal-punctuation guard.
 *
 * `spaceBeforePaddedCloser`: French renders CLOSE_DOUBLE with leading NNBSP
 * padding, and a plain space before the run merges into that padding once
 * spaces collapse — a re-run reads the punctuation directly adjacent to the
 * run. Treat one such space as transparent so the first pass moves the
 * punctuation the way the re-run would.
 */
function movePunctuationOutside(order: Item[], punctChar: string, closingSet: ReadonlySet<string>, guardRederivation: boolean, spaceBeforePaddedCloser: boolean): Item[] {
  const moves: Relocation[] = []
  let position = 0
  while (position < order.length) {
    const item = order[position]
    if (item.boundary || item.ch !== punctChar) {
      position++
      continue
    }
    if (guardRederivation && !rederivesAsCloserAfter(position > 0 ? order[position - 1] : undefined)) {
      position++
      continue
    }
    // German re-derives single closers from scratch. Moving the punctuation
    // past a run whose first closer is a single quote changes what the item
    // directly before the punctuation reads on the re-run:
    //  - a single closer or apostrophe there loses the ending context its
    //    closer rule needs (the re-derived run closer is a straight `'`, not
    //    an ending character), unwinding to a straight quote;
    //  - an `s` there gains the plural-possessive reading (`s` directly
    //    before the closer), relabeling the closer an apostrophe.
    // Leave the punctuation in place; the next run blocks here again.
    const prevCh = position > 0 && !order[position - 1].boundary ? order[position - 1].ch : ""
    if (guardRederivation
      && (prevCh === RIGHT_SINGLE_QUOTE || prevCh === MODIFIER_LETTER_APOSTROPHE || prevCh === "s" || prevCh === "S")
      && isCharItem(order, nextIndex(order, position, 1), RIGHT_SINGLE_QUOTE)) {
      position++
      continue
    }
    if (moveWallAt(order, prevIndex(order, position, 1))) {
      position++
      continue
    }
    // Another movable punctuation char directly before this one would end up
    // group-adjacent after the move and migrate on the next run (one char per
    // run, a cascade); leave chains of movable punctuation in place. The
    // ellipsis belongs to the chain alphabet: it folds from the dots this
    // guard blocks on, so the folded glyph must block the same way ("....”"
    // re-reads as "….”").
    const prevPunctIndex = prevIndex(order, position, 1)
    if (prevPunctIndex >= 0 && CHAIN_PUNCT_SET.has(order[prevPunctIndex].ch)) {
      position++
      continue
    }
    // Quotes group: one or more closers, each preceded by at most one boundary.
    let last = -1
    let j = position + 1
    for (;;) {
      let k = j
      if (k < order.length && order[k].boundary) k++
      // Any collapsible space char qualifies, not just a plain space: the
      // collapse pass merges tabs and NBSPs into the closer's NNBSP padding
      // the same way.
      if (spaceBeforePaddedCloser && k < order.length && !order[k].boundary
        && order[k].ch.length === 1 && SPACE_CHAR_RE.test(order[k].ch)
        && isCharItem(order, k + 1, RIGHT_DOUBLE_QUOTE)) {
        k++
      }
      if (k >= order.length || order[k].boundary || !closingRunMemberAt(order, k, closingSet)) break
      last = k
      j = k + 1
    }
    const afterRunIndex = nextIndex(order, last === -1 ? position : last, 1)
    if (last === -1 || moveWallAt(order, afterRunIndex)) {
      position++
      continue
    }
    // The mirror of the chain guard above: a movable punctuation char directly
    // after the run is where this one would land (`.'.'` interleaves two
    // period+closer pairs), re-creating a movable configuration the next run
    // would move again; leave the punctuation in place. As above, the ellipsis
    // blocks like the dots it folds from.
    if (afterRunIndex < order.length && !order[afterRunIndex].boundary
      && CHAIN_PUNCT_SET.has(order[afterRunIndex].ch)) {
      position++
      continue
    }
    moves.push({ from: position, to: last, side: "after", anchorOffset: order[last].end, anchorBind: "left" })
    position = last + 1
  }
  return applyRelocations(order, moves)
}

function applyPunctuationPlacement(items: Item[], style: ActiveQuoteStyle, apostrophe: string): Item[] {
  const closingSet = style !== "german" && apostrophe === RIGHT_SINGLE_QUOTE
    ? CLOSING_OR_APOSTROPHE_SET
    : CLOSING_SET
  if (style === "american") {
    // Each mover's gates read positions the other mover may vacate (a comma
    // moving inside exposes a period's run to the terminal lookbehind), so
    // one round can leave exactly the state a re-run would move again.
    // Iterate to fixpoint; every move shifts punctuation left past a closer,
    // so the rounds terminate. `movePunctuationInside` returns its input
    // array unchanged when it makes no move.
    let order = items
    for (;;) {
      const next = movePunctuationInside(movePunctuationInside(order, isMovablePeriodAt, closingSet), isMovableCommaAt, closingSet)
      if (next === order) return order
      order = next
    }
  }
  const guardRederivation = style === "german"
  const spaceBeforePaddedCloser = style === "french"
  return movePunctuationOutside(
    movePunctuationOutside(items, ".", closingSet, guardRederivation, spaceBeforePaddedCloser),
    ",", closingSet, guardRederivation, spaceBeforePaddedCloser,
  )
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

/** A one-char unmoved NBSP/NNBSP item textually adjacent at `offset`. */
function isPaddingSpaceItem(item: Item | undefined): item is Item {
  return item !== undefined && !item.boundary && !item.moved
    && item.end - item.start === 1 && (item.ch === NBSP || item.ch === NNBSP)
}

/**
 * French renders double-quote glyphs with NNBSP padding. A source NBSP/NNBSP
 * directly adjacent to the glyph would collapse with that padding into one
 * space whose type wins by priority (NBSP beats NNBSP), which the next run
 * absorbs as the glyph's padding and re-renders NNBSP — an oscillation.
 * Absorb the adjacent space into the (single-char, i.e. unpadded) glyph item
 * now so its render replaces both with the padded form.
 */
function absorbGuillemetPadding(items: Item[]): void {
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    if (item.boundary || item.moved || item.end - item.start !== 1) continue
    if (item.ch === RIGHT_DOUBLE_QUOTE) {
      const prev = items[i - 1]
      if (isPaddingSpaceItem(prev) && prev.end === item.start) {
        item.start = prev.start
        prev.end = prev.start
        prev.ch = ""
      }
    } else if (item.ch === LEFT_DOUBLE_QUOTE) {
      const next = items[i + 1]
      if (isPaddingSpaceItem(next) && next.start === item.end) {
        item.end = next.end
        next.start = next.end
        next.ch = ""
      }
    }
  }
}

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
      /* istanbul ignore if -- defensive: the placement guards (terminal
         lookbehind, movable-punctuation chains) block any second relocation
         next to an anchor another item already claimed, so merged insertions
         are unreachable; merging keeps commit() from rejecting duplicate pure
         insertions should a future rule re-open the path. */
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
  classifySingles(items, style)
  classifyDoubles(items, style)
  const placed = applyPunctuationPlacement(items, style, apostrophe)
  if (style === "french") absorbGuillemetPadding(placed)
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
 * Mirrors the closer rules the quote pass applies to a digit-preceded straight
 * quote: singles close (or turn possessive) per the single ending lookahead;
 * doubles close before an ending character, a boundary, or end of input. The
 * lookbehind sides of those rules are always satisfied here because the
 * candidate has a digit (or a boundary) directly before it.
 */
function quotePassClosesCandidate(items: Item[], index: number, quote: string): boolean {
  if (quote === "'") return singleEndingAfterOptionalS(items, index)
  if (foldsToNotEqual(items, index + 1)) return false
  const next = items[index + 1]
  return next === undefined || next.boundary || isDoubleCloseAfterChar(next.ch)
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
        // Blocking a candidate is only stable when the quote pass curls it
        // into a closer: a candidate it cannot close stays straight while
        // the opener that supplied the balance curls, so the next run would
        // see an open-free balance and fold the prime then. Fold it now to
        // keep the transform a fixed point.
        if (!quotePassClosesCandidate(items, i, quote)) {
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
