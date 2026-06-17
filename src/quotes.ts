import { cachedRegExp, DEFAULT_SEPARATOR, escapeStringRegexp, getEscapedSeparator, LATIN_LETTERS, TERMINAL_PUNCTUATION, UNICODE_SYMBOLS } from "./constants.js"

const {
  EM_DASH,
  LEFT_DOUBLE_QUOTE,
  RIGHT_DOUBLE_QUOTE,
  LEFT_SINGLE_QUOTE,
  RIGHT_SINGLE_QUOTE,
  MODIFIER_LETTER_APOSTROPHE,
} = UNICODE_SYMBOLS

export const PUNCTUATION_STYLES = ["american", "british", "german", "french", "none"] as const
export type PunctuationStyle = (typeof PUNCTUATION_STYLES)[number]

export interface QuoteOptions {
  /** Boundary marker for HTML element boundaries. Default: "\uE000\uE001" */
  separator?: string
  /** "american" (inside), "british" (outside), "none". Default: "american" */
  punctuationStyle?: PunctuationStyle
}

function convertSingleQuotes(text: string, sep: string): string {
  const escapedSep = getEscapedSeparator({ separator: sep })

  // Handle empty single quotes '' and whitespace-only quotes ' ' first
  // Only match straight quotes, not already-converted curly quotes
  const singleQuoteChars = `'${LEFT_SINGLE_QUOTE}${RIGHT_SINGLE_QUOTE}${MODIFIER_LETTER_APOSTROPHE}`
  const singleQuoteOrWord = `[${singleQuoteChars}\\w]`
  text = text.replace(cachedRegExp(`(?<!${singleQuoteOrWord})''(?!${singleQuoteOrWord})`, "g"), `${LEFT_SINGLE_QUOTE}${RIGHT_SINGLE_QUOTE}`)
  text = text.replace(cachedRegExp(`(?<!${singleQuoteOrWord})'(?<ws>\\s+)'(?!${singleQuoteOrWord})`, "g"), `${LEFT_SINGLE_QUOTE}$<ws>${RIGHT_SINGLE_QUOTE}`)

  const afterEndingSinglePatterns = `\\s\\.!?;,\\)${EM_DASH}\\-\\]"`
  // Ending context with optional 's', for the leading-apostrophe closer scan.
  const afterEndingSingle = `(?=${escapedSep}?(?:s${escapedSep}?)?(?:[${afterEndingSinglePatterns}]|$))`

  // Handle 'n' abbreviation (Rock 'n' Roll). Before MLA this wasn't needed —
  // the general rules produced LSQ+n+RSQ which was fine. But MLA requires both
  // quotes to be MLA (semantic apostrophes), and the general rules can't achieve
  // that: neither quote is in a contraction context (no Latin letter on both sides).
  text = text.replace(cachedRegExp(`(?<=\\w${escapedSep}? )['${RIGHT_SINGLE_QUOTE}]n['${RIGHT_SINGLE_QUOTE}](?= ${escapedSep}?\\w)`, "gm"), `${MODIFIER_LETTER_APOSTROPHE}n${MODIFIER_LETTER_APOSTROPHE}`)

  // Possessive: 's followed by ending context (e.g., dog's) → U+02BC
  const afterPossessive = `(?=${escapedSep}?s${escapedSep}?(?:[${afterEndingSinglePatterns}]|$))`
  const possessiveSingle = `(?<=[^\\s${LEFT_DOUBLE_QUOTE}'])['${RIGHT_SINGLE_QUOTE}]${afterPossessive}`
  text = text.replace(cachedRegExp(possessiveSingle, "gm"), MODIFIER_LETTER_APOSTROPHE)

  // Closing single quote: ending context without 's' → U+2019
  const afterClosingSingle = `(?=${escapedSep}?(?:[${afterEndingSinglePatterns}]|$))`
  const closingSingle = `(?<=[^\\s${LEFT_DOUBLE_QUOTE}'])[']${afterClosingSingle}`
  text = text.replace(cachedRegExp(closingSingle, "gm"), RIGHT_SINGLE_QUOTE)

  const contraction = `(?<=[${LATIN_LETTERS}])['${RIGHT_SINGLE_QUOTE}${MODIFIER_LETTER_APOSTROPHE}](?=${escapedSep}?[${LATIN_LETTERS}])`
  text = text.replace(cachedRegExp(contraction, "gm"), MODIFIER_LETTER_APOSTROPHE)

  const endQuoteNotContraction = `(?!${contraction})[${RIGHT_SINGLE_QUOTE}${MODIFIER_LETTER_APOSTROPHE}]${afterEndingSingle}`
  text = convertLeadingApostrophes(text, endQuoteNotContraction)

  const beginningSingle = `(?<beforeContext>(?:^|[\\s${LEFT_DOUBLE_QUOTE}${RIGHT_DOUBLE_QUOTE}${EM_DASH}\\-\\(])${escapedSep}?)['](?=${escapedSep}?\\S)`
  text = text.replace(cachedRegExp(beginningSingle, "gm"), `$<beforeContext>${LEFT_SINGLE_QUOTE}`)

  text = convertUnmatchedPluralPossessives(text, sep)

  return text
}

// Converts unmatched RSQ after s/S to MLA (plural possessives).
// Tracks LSQ/RSQ balance so paired closing quotes remain RSQ.
function convertUnmatchedPluralPossessives(text: string, sep: string): string {
  let singleQuoteBalance = 0
  return text.replace(
    cachedRegExp(`[${LEFT_SINGLE_QUOTE}${RIGHT_SINGLE_QUOTE}]`, "g"),
    (match, offset) => {
      if (match === LEFT_SINGLE_QUOTE) {
        singleQuoteBalance++
        return match
      }
      if (singleQuoteBalance > 0) {
        singleQuoteBalance--
        return match
      }
      let i = offset - 1
      while (i >= sep.length - 1 && text.startsWith(sep, i - sep.length + 1)) {
        i -= sep.length
      }
      if (i >= 0 && (text[i] === "s" || text[i] === "S")) {
        return MODIFIER_LETTER_APOSTROPHE
      }
      return match
    }
  )
}

// Classifies a leading straight quote (start of line, or after a non-word char)
// as either an apostrophe/elision (U+02BC) or an opening single quote (left as a
// straight quote for `beginningSingle` to convert). A left-to-right scan replaces
// the former distance-bounded lookahead: a leading quote is an apostrophe unless
// an unbounded forward scan finds a closing single quote (RSQ/MLA in ending
// context) before reaching a line break or another single-quote opener.
function convertLeadingApostrophes(text: string, endQuoteNotContraction: string): string {
  const closerAhead = cachedRegExp(endQuoteNotContraction, "y")
  // `Rock 'n' Roll` already produced `n${MLA} `; a leading quote before it is an
  // apostrophe even though a closing single quote may follow later in the line.
  const nAbbreviationAhead = cachedRegExp(`n${MODIFIER_LETTER_APOSTROPHE} `, "y")
  // High-precision decade elision: a leading quote before two digits (optionally
  // followed by `s`), as in `'90s` or `'99`, is always an apostrophe.
  const decadeElision = cachedRegExp(`\\d\\ds?(?![${LATIN_LETTERS}\\d])`, "y")

  let result = ""
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (char !== "'" || (i > 0 && /\w/.test(text[i - 1]))) {
      result += char
      continue
    }
    decadeElision.lastIndex = i + 1
    nAbbreviationAhead.lastIndex = i + 1
    const isApostrophe =
      decadeElision.test(text) ||
      nAbbreviationAhead.test(text) ||
      !hasClosingSingleAhead(text, i + 1, closerAhead)
    result += isApostrophe ? MODIFIER_LETTER_APOSTROPHE : char
  }
  return result
}

// Scans forward from `start` for a closing single quote, stopping (no closer) at
// a line break or another single-quote opener. Separators and other characters
// are transparent. O(n) amortized: each scan halts at the next single-quote char.
function hasClosingSingleAhead(text: string, start: number, closerAhead: RegExp): boolean {
  for (let position = start; position < text.length; position++) {
    const char = text[position]
    if (char === "\n" || char === LEFT_SINGLE_QUOTE || char === "'") return false
    closerAhead.lastIndex = position
    if (closerAhead.test(text)) return true
  }
  return false
}

// Matches an opening-position straight double quote: a boundary (start of line,
// whitespace, bracket, dash, or separator — consumed and re-emitted, since a
// variable-width alternation lookbehind would be ReDoS-prone) and an optional
// separator before the quote.
function doubleOpenerPrefix(escapedSep: string): string {
  const boundary = `(?<boundary>^|[\\s\\(\\/\\[\\{\\-${EM_DASH}]|${escapedSep})`
  const beforeCapture = `(?<beforeChr>${escapedSep}?)`
  return `${boundary}${beforeCapture}["]`
}

function buildBeginningDoublePattern(escapedSep: string, rawEscSep: string): string {
  // Characters that signal an ending-quote position (not valid openers)
  const endingChars = `\\s\\)${EM_DASH},!?;:.\\}${rawEscSep}`

  const afterConditions = [
    `(?=${escapedSep}[ .,])`,
    `(?=${escapedSep}?\\.{3}|${escapedSep}?[^${endingChars}])`,
  ]

  return `${doubleOpenerPrefix(escapedSep)}(?:${afterConditions.join("|")})`
}

// Quoted-punctuation openers like "?" or "!", where the character right after the
// opening quote looks like an ending-quote context. A left-to-right scan replaces
// the former 50-char lookahead: a boundary-position straight double quote is an
// opener when a closing straight double quote appears anywhere ahead, with at
// least one non-quote character between them.
function convertQuotedPunctuationOpeners(text: string, escapedSep: string): string {
  const candidate = cachedRegExp(doubleOpenerPrefix(escapedSep), "gm")
  let result = ""
  let copiedUpTo = 0
  for (const match of text.matchAll(candidate)) {
    // The boundary and optional separator are left in place; only the straight
    // quote (the final character of the match) is rewritten to an opener.
    const quoteIndex = match.index + match[0].length - 1
    if (!hasClosingDoubleAhead(text, quoteIndex + 1)) continue
    result += text.slice(copiedUpTo, quoteIndex) + LEFT_DOUBLE_QUOTE
    copiedUpTo = quoteIndex + 1
  }
  return result + text.slice(copiedUpTo)
}

// Scans forward for a closing straight double quote, requiring at least one
// non-quote character between `start` and it. O(n) amortized: the scan halts at
// the next double-quote character.
function hasClosingDoubleAhead(text: string, start: number): boolean {
  for (let position = start; position < text.length; position++) {
    if (text[position] === '"') return position > start
  }
  return false
}

function convertDoubleQuotes(text: string, sep: string): string {
  const rawEscSep = escapeStringRegexp(sep)
  const escapedSep = getEscapedSeparator({ separator: sep })

  // Handle empty quotes "" first - match only when not part of adjacent quotes
  // Require word boundary or start/end of string on at least one side
  text = text.replace(/(?<=^|[\s([{])""(?=$|[\s)\]}.!?,;:])/g, `${LEFT_DOUBLE_QUOTE}${RIGHT_DOUBLE_QUOTE}`)
  // Handle whitespace-only quotes " " - require non-quote chars on both sides
  text = text.replace(/(?<=^|[\s([{])"(?<whitespace>\s+)"(?=$|[\s)\]}.!?,;:])/g, `${LEFT_DOUBLE_QUOTE}$<whitespace>${RIGHT_DOUBLE_QUOTE}`)

  const beginningDouble = cachedRegExp(buildBeginningDoublePattern(escapedSep, rawEscSep), "gm")
  text = text.replace(beginningDouble, `$<boundary>$<beforeChr>${LEFT_DOUBLE_QUOTE}`)

  text = convertQuotedPunctuationOpeners(text, escapedSep)

  text = text.replace(cachedRegExp(`(?<=\\{)(?<sepSpace>${escapedSep}? )?["]`, "g"), `$<sepSpace>${LEFT_DOUBLE_QUOTE}`)

  const endingDouble = `(?<beforeQuote>[^\\s\\(])["](?<sepAfter>${escapedSep})?(?=${escapedSep}|[\\s/\\).,;${EM_DASH}:\\-\\}!?s]|$)`
  text = text.replace(cachedRegExp(endingDouble, "g"), `$<beforeQuote>${RIGHT_DOUBLE_QUOTE}$<sepAfter>`)

  text = text.replace(cachedRegExp(`["](?<sepEnd>${escapedSep}?)$`, "g"), `${RIGHT_DOUBLE_QUOTE}$<sepEnd>`)
  text = text.replace(cachedRegExp(`'(?=${RIGHT_DOUBLE_QUOTE})`, "gu"), RIGHT_SINGLE_QUOTE)

  return text
}

const CLOSING_QUOTES = new Set<string>([RIGHT_SINGLE_QUOTE, RIGHT_DOUBLE_QUOTE])
const TERMINAL_PUNCTUATION_SET = new Set<string>(TERMINAL_PUNCTUATION)

// Consumes a run of consecutive closing quotes (RSQ/RDQ) of arbitrary depth,
// each optionally preceded by a separator, starting at `start`. Returns the
// index just past the last closing quote, or -1 if there is no run.
function scanClosingQuoteRun(text: string, start: number, sep: string): number {
  if (!CLOSING_QUOTES.has(text[start])) return -1
  let runEnd = start + 1
  for (;;) {
    let next = runEnd
    if (sep.length > 0 && text.startsWith(sep, next)) next += sep.length
    if (!CLOSING_QUOTES.has(text[next])) break
    runEnd = next + 1
  }
  return runEnd
}

function separatorLengthAt(text: string, index: number, sep: string): number {
  return sep.length > 0 && text.startsWith(sep, index) ? sep.length : 0
}

// Moves a period or comma from just after a run of closing quotes to just
// before it (American style: punctuation inside the quotes). A single
// left-to-right pass collects each closing-quote run of arbitrary depth — no
// nesting cap — then relocates an adjacent period/comma, treating separators as
// transparent (re-emitted in place). The move is skipped when the character
// before the run is terminal punctuation (`"Stop!".` keeps its period outside).
function movePunctuationInside(
  text: string,
  sep: string,
  isMovablePunctuation: (text: string, index: number) => boolean,
): string {
  let result = ""
  let position = 0
  while (position < text.length) {
    const sepBeforeLength = separatorLengthAt(text, position, sep)
    const runStart = position + sepBeforeLength
    const runEnd = scanClosingQuoteRun(text, runStart, sep)
    const sepAfterLength = runEnd === -1 ? 0 : separatorLengthAt(text, runEnd, sep)
    const punctuationIndex = runEnd + sepAfterLength

    const precededByTerminal = position > 0 && TERMINAL_PUNCTUATION_SET.has(text[position - 1])
    if (runEnd === -1 || precededByTerminal || !isMovablePunctuation(text, punctuationIndex)) {
      result += text[position]
      position++
      continue
    }

    const sepBefore = text.slice(position, runStart)
    const run = text.slice(runStart, runEnd)
    const sepAfter = text.slice(runEnd, punctuationIndex)
    result += sepBefore + text[punctuationIndex] + run + sepAfter
    position = punctuationIndex + 1
  }
  return result
}

function isMovablePeriod(text: string, index: number): boolean {
  return text[index] === "." && !text.startsWith("...", index)
}

function isMovableComma(text: string, index: number): boolean {
  return text[index] === ","
}

function applyPunctuationStyle(text: string, sep: string, style: PunctuationStyle): string {
  const escapedSep = getEscapedSeparator({ separator: sep })

  if (style === "american") {
    // Period outside → inside: Hello". → Hello."  (and Hello'". → Hello.'")
    text = movePunctuationInside(text, sep, isMovablePeriod)
    // Comma outside → inside: Hello", → Hello,"
    text = movePunctuationInside(text, sep, isMovableComma)
  } else {
    // Every non-"american" non-"none" style (british/german/french) places
    // punctuation outside the quotes.
    // Period inside → outside: "Hello." → "Hello".
    // No terminal punctuation guard — "Stop!." inside is always wrong; move the period out.
    // Match ALL consecutive closing quotes so nested quotes like .'" become '". in one pass.
    const periodInsideRegex = cachedRegExp(
      `(?<sepBefore>${escapedSep}?)\\.(?<quotes>(?:${escapedSep}?[${RIGHT_SINGLE_QUOTE}${RIGHT_DOUBLE_QUOTE}])+)`,
      "g"
    )
    text = text.replace(periodInsideRegex, "$<sepBefore>$<quotes>.")

    // Comma inside → outside: "Hello," → "Hello",
    // Match ALL consecutive closing quotes so nested quotes like ,'" become '", in one pass.
    const commaInsideRegex = cachedRegExp(
      `,(?<quotes>(?:${escapedSep}?[${RIGHT_DOUBLE_QUOTE}${RIGHT_SINGLE_QUOTE}])+)`,
      "g"
    )
    text = text.replace(commaInsideRegex, "$<quotes>,")
  }
  return text
}

// Collapse every German/curly quote to its straight equivalent so the main
// pipeline re-classifies them by position exactly as it would for fresh straight
// input. German output uses „…" (U+201E…U+201C) and ‚…' (U+201A…U+2018) with
// apostrophes as U+2019; U+201C/U+2018 each double as American openers, so any
// depth-based scheme misclassifies orphans or quotes adjacent to other quotes.
// Position-based re-classification sidesteps that ambiguity and keeps
// re-processing German output idempotent.
function normalizeGermanQuotes(text: string): string {
  const { DOUBLE_LOW_9_QUOTE, SINGLE_LOW_9_QUOTE } = UNICODE_SYMBOLS
  return text
    .replace(cachedRegExp(`[${DOUBLE_LOW_9_QUOTE}${LEFT_DOUBLE_QUOTE}${RIGHT_DOUBLE_QUOTE}]`, "g"), '"')
    .replace(cachedRegExp(`[${SINGLE_LOW_9_QUOTE}${LEFT_SINGLE_QUOTE}${RIGHT_SINGLE_QUOTE}]`, "g"), "'")
}

function applyGermanQuotes(text: string): string {
  return text
    .replaceAll(LEFT_DOUBLE_QUOTE, UNICODE_SYMBOLS.DOUBLE_LOW_9_QUOTE)
    .replaceAll(RIGHT_DOUBLE_QUOTE, LEFT_DOUBLE_QUOTE)
    .replaceAll(LEFT_SINGLE_QUOTE, UNICODE_SYMBOLS.SINGLE_LOW_9_QUOTE)
    .replaceAll(RIGHT_SINGLE_QUOTE, LEFT_SINGLE_QUOTE)
}

// Normalize French guillemets back to American for idempotent re-processing.
// Strips either NBSP or NNBSP padding (older outputs used NBSP).
function normalizeFrenchQuotes(text: string): string {
  const innerSpace = `[${UNICODE_SYMBOLS.NBSP}${UNICODE_SYMBOLS.NNBSP}]`
  return text
    .replace(cachedRegExp(`${UNICODE_SYMBOLS.LEFT_GUILLEMET}${innerSpace}?`, "g"), LEFT_DOUBLE_QUOTE)
    .replace(cachedRegExp(`${innerSpace}?${UNICODE_SYMBOLS.RIGHT_GUILLEMET}`, "g"), RIGHT_DOUBLE_QUOTE)
}

// Uses U+202F (NARROW NO-BREAK SPACE) per Unicode CLDR and Imprimerie nationale.
function applyFrenchQuotes(text: string): string {
  return text
    .replaceAll(LEFT_DOUBLE_QUOTE, `${UNICODE_SYMBOLS.LEFT_GUILLEMET}${UNICODE_SYMBOLS.NNBSP}`)
    .replaceAll(RIGHT_DOUBLE_QUOTE, `${UNICODE_SYMBOLS.NNBSP}${UNICODE_SYMBOLS.RIGHT_GUILLEMET}`)
}

interface LocaleQuoteTransform {
  normalize: (text: string) => string
  apply: (text: string) => string
}

const localeQuoteTransforms: Partial<Record<PunctuationStyle, LocaleQuoteTransform>> = {
  german: { normalize: normalizeGermanQuotes, apply: applyGermanQuotes },
  french: { normalize: normalizeFrenchQuotes, apply: applyFrenchQuotes },
}

function processQuotes(text: string, options: QuoteOptions): string {
  const sep = options.separator ?? DEFAULT_SEPARATOR
  const punctuationStyle = options.punctuationStyle ?? "american"
  if (punctuationStyle === "none") return text

  const locale = localeQuoteTransforms[punctuationStyle]
  if (locale) text = locale.normalize(text)

  text = convertSingleQuotes(text, sep)
  text = convertDoubleQuotes(text, sep)
  text = applyPunctuationStyle(text, sep, punctuationStyle)

  if (locale) text = locale.apply(text)

  return text
}

/** Convert straight quotes to smart quotes. */
export function niceQuotes(text: string, options: QuoteOptions = {}): string {
  // MLA is used internally so applyPunctuationStyle can distinguish
  // apostrophes (MLA, don't move) from closing quotes (RSQ, do move).
  // Always convert back to RSQ for standard output per Unicode.
  return processQuotes(text, options).replaceAll(MODIFIER_LETTER_APOSTROPHE, RIGHT_SINGLE_QUOTE)
}

/**
 * Classify apostrophes vs. closing single quotes.
 *
 * Returns the text with smart quotes applied, where apostrophes are
 * U+02BC (MODIFIER LETTER APOSTROPHE) and closing single quotes are
 * U+2019 (RIGHT SINGLE QUOTATION MARK).
 *
 * For display output, use {@link niceQuotes} or `transform()` instead,
 * which use U+2019 for both per the Unicode Standard.
 */
export function classifyApostrophes(text: string, options: QuoteOptions = {}): string {
  return processQuotes(text, options)
}
