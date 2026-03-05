/**
 * Smart quote transformation: straight quotes → curly quotes.
 */

import escapeStringRegexp from "escape-string-regexp"
import { UNICODE_SYMBOLS, DEFAULT_SEPARATOR, LATIN_LETTERS, TERMINAL_PUNCTUATION, getEscapedSeparator, cachedRegExp } from "./constants.js"

const {
  EM_DASH,
  LEFT_DOUBLE_QUOTE,
  RIGHT_DOUBLE_QUOTE,
  LEFT_SINGLE_QUOTE,
  RIGHT_SINGLE_QUOTE,
  MODIFIER_LETTER_APOSTROPHE,
} = UNICODE_SYMBOLS

/** Joined string of all terminal punctuation characters for use in regex character classes. */
const TERMINAL_PUNCTUATION_CLASS = TERMINAL_PUNCTUATION.join("")

export type PunctuationStyle = "american" | "british" | "german" | "french" | "none"

export interface QuoteOptions {
  /** Boundary marker for HTML element boundaries. Default: "\uE000" */
  separator?: string
  /** "american" (inside), "british" (outside), "none". Default: "american" */
  punctuationStyle?: PunctuationStyle
}

/** Convert straight single quotes to curly quotes and apostrophes */
function convertSingleQuotes(text: string, sep: string): string {
  const escapedSep = getEscapedSeparator({ separator: sep })

  // Handle empty single quotes '' and whitespace-only quotes ' ' first
  // Only match straight quotes, not already-converted curly quotes
  const singleQuoteChars = `'${LEFT_SINGLE_QUOTE}${RIGHT_SINGLE_QUOTE}${MODIFIER_LETTER_APOSTROPHE}`
  const singleQuoteOrWord = `[${singleQuoteChars}\\w]`
  text = text.replace(cachedRegExp(`(?<!${singleQuoteOrWord})''(?!${singleQuoteOrWord})`, "g"), `${LEFT_SINGLE_QUOTE}${RIGHT_SINGLE_QUOTE}`)
  text = text.replace(cachedRegExp(`(?<!${singleQuoteOrWord})'(\\s+)'(?!${singleQuoteOrWord})`, "g"), `${LEFT_SINGLE_QUOTE}$1${RIGHT_SINGLE_QUOTE}`)

  const afterEndingSinglePatterns = `\\s\\.!?;,\\)${EM_DASH}\\-\\]"`
  // Full pattern with optional 's' for lookahead detection in apostropheRegex
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

  const apostropheWhitelist = `(?=n${MODIFIER_LETTER_APOSTROPHE} )`
  const endQuoteNotContraction = `(?!${contraction})[${RIGHT_SINGLE_QUOTE}${MODIFIER_LETTER_APOSTROPHE}]${afterEndingSingle}`
  // Limit lookahead scan to 1000 chars to prevent catastrophic backtracking on pathological inputs
  const apostropheRegex = cachedRegExp(
    `(?<=^|[^\\w])['](${apostropheWhitelist}|(?![^${LEFT_SINGLE_QUOTE}'\\n]{0,1000}${endQuoteNotContraction}))`,
    "gm"
  )
  text = text.replace(apostropheRegex, MODIFIER_LETTER_APOSTROPHE)

  const beginningSingle = `(?<beforeContext>(?:^|[\\s${LEFT_DOUBLE_QUOTE}${RIGHT_DOUBLE_QUOTE}${EM_DASH}\\-\\(])${escapedSep}?)['](?=${escapedSep}?\\S)`
  text = text.replace(cachedRegExp(beginningSingle, "gm"), `$<beforeContext>${LEFT_SINGLE_QUOTE}`)

  text = convertUnmatchedPluralPossessives(text, sep)

  return text
}

/**
 * Convert unmatched RSQ after s/S to MLA (plural possessives like dogs', Bayes').
 * Tracks LSQ/RSQ balance left-to-right so that paired closing quotes
 * (e.g., 'yes' where s precedes RSQ) remain RSQ.
 */
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

/** Convert straight double quotes to curly quotes */
function convertDoubleQuotes(text: string, sep: string): string {
  const rawEscSep = escapeStringRegexp(sep)
  const escapedSep = getEscapedSeparator({ separator: sep })

  // Handle empty quotes "" first - match only when not part of adjacent quotes
  // Require word boundary or start/end of string on at least one side
  text = text.replace(/(?<=^|[\s([{])""(?=$|[\s)\]}.!?,;:])/g, `${LEFT_DOUBLE_QUOTE}${RIGHT_DOUBLE_QUOTE}`)
  // Handle whitespace-only quotes " " - require non-quote chars on both sides
  text = text.replace(/(?<=^|[\s([{])"(?<whitespace>\s+)"(?=$|[\s)\]}.!?,;:])/g, `${LEFT_DOUBLE_QUOTE}$<whitespace>${RIGHT_DOUBLE_QUOTE}`)

  const beginningDouble = cachedRegExp(
    `(?<=^|[\\s\\(\\/\\[\\{\\-${EM_DASH}]|${escapedSep})(?<beforeChr>${escapedSep}?)["](?<afterChr>(?<sepWithPunct>${escapedSep}[ .,])|(?=${escapedSep}?\\.{3}|${escapedSep}?[^\\s\\)${EM_DASH},!?;:.\\}${rawEscSep}]))`,
    "gm"
  )
  text = text.replace(beginningDouble, `$<beforeChr>${LEFT_DOUBLE_QUOTE}$<afterChr>`)

  text = text.replace(cachedRegExp(`(?<=\\{)(?<sepSpace>${escapedSep}? )?["]`, "g"), `$<sepSpace>${LEFT_DOUBLE_QUOTE}`)

  const endingDouble = `(?<beforeQuote>[^\\s\\(])["]((?<sepAfter>${escapedSep})?)(?=${escapedSep}|[\\s/\\).,;${EM_DASH}:\\-\\}!?s]|$)`
  text = text.replace(cachedRegExp(endingDouble, "g"), `$<beforeQuote>${RIGHT_DOUBLE_QUOTE}$<sepAfter>`)

  text = text.replace(cachedRegExp(`["](?<sepEnd>${escapedSep}?)$`, "g"), `${RIGHT_DOUBLE_QUOTE}$<sepEnd>`)
  text = text.replace(cachedRegExp(`'(?=${RIGHT_DOUBLE_QUOTE})`, "gu"), RIGHT_SINGLE_QUOTE)

  return text
}

/** Apply American or British punctuation style */
function applyPunctuationStyle(text: string, sep: string, style: PunctuationStyle): string {
  const escapedSep = getEscapedSeparator({ separator: sep })

  if (style === "american") {
    // Period outside → inside: "Hello". → "Hello."
    const periodOutsideRegex = cachedRegExp(
      `(?<![${TERMINAL_PUNCTUATION_CLASS}])(?<sepBefore>${escapedSep}?)(?<quote>[${RIGHT_SINGLE_QUOTE}${RIGHT_DOUBLE_QUOTE}])(?<sepAfter>${escapedSep}?)(?!\\.\\.\\.)\\.`,
      "g"
    )
    text = text.replace(periodOutsideRegex, "$<sepBefore>.$<quote>$<sepAfter>")

    // Comma outside → inside: "Hello", → "Hello,"
    const commaOutsideRegex = cachedRegExp(
      `(?<![${TERMINAL_PUNCTUATION_CLASS}])(?<sepBefore>${escapedSep}?)(?<quote>[${RIGHT_SINGLE_QUOTE}${RIGHT_DOUBLE_QUOTE}])(?<sepAfter>${escapedSep}?),`,
      "g"
    )
    text = text.replace(commaOutsideRegex, "$<sepBefore>,$<quote>$<sepAfter>")
  } else if (style === "british" || style === "german" || style === "french") {
    // Period inside → outside: "Hello." → "Hello".
    // No terminal punctuation guard — "Stop!." inside is always wrong; move the period out.
    const periodInsideRegex = cachedRegExp(
      `(?<sepBefore>${escapedSep}?)\\.(?<sepMiddle>${escapedSep}?)(?<quote>[${RIGHT_SINGLE_QUOTE}${RIGHT_DOUBLE_QUOTE}])`,
      "g"
    )
    text = text.replace(periodInsideRegex, "$<sepBefore>$<sepMiddle>$<quote>.")

    // Comma inside → outside: "Hello," → "Hello",
    const commaInsideRegex = cachedRegExp(
      `,(?<sepAndQuote>${escapedSep}?[${RIGHT_DOUBLE_QUOTE}${RIGHT_SINGLE_QUOTE}])`,
      "g"
    )
    text = text.replace(commaInsideRegex, "$<sepAndQuote>,")
  }
  return text
}

/**
 * Normalize German quotes back to American for idempotent re-processing.
 * Tracks „..." (U+201E/U+201C) and ‚...' (U+201A/U+2018) pairs so that
 * the ambiguous closer characters are mapped to the correct American equivalents.
 */
function normalizeGermanQuotes(text: string): string {
  const DLQ = UNICODE_SYMBOLS.DOUBLE_LOW_9_QUOTE
  const SLQ = UNICODE_SYMBOLS.SINGLE_LOW_9_QUOTE

  let result = ""
  let doubleDepth = 0
  let singleDepth = 0

  for (const ch of text) {
    if (ch === DLQ) {
      result += LEFT_DOUBLE_QUOTE
      doubleDepth++
    } else if (ch === LEFT_DOUBLE_QUOTE && doubleDepth > 0) {
      result += RIGHT_DOUBLE_QUOTE
      doubleDepth--
    } else if (ch === SLQ) {
      result += LEFT_SINGLE_QUOTE
      singleDepth++
    } else if (ch === LEFT_SINGLE_QUOTE && singleDepth > 0) {
      result += RIGHT_SINGLE_QUOTE
      singleDepth--
    } else {
      result += ch
    }
  }

  return result
}

/** Remap American curly quotes to German low-9 style. Safe because apostrophes are still MLA at this stage. */
function applyGermanQuotes(text: string): string {
  return text
    .replaceAll(LEFT_DOUBLE_QUOTE, UNICODE_SYMBOLS.DOUBLE_LOW_9_QUOTE)
    .replaceAll(RIGHT_DOUBLE_QUOTE, LEFT_DOUBLE_QUOTE)
    .replaceAll(LEFT_SINGLE_QUOTE, UNICODE_SYMBOLS.SINGLE_LOW_9_QUOTE)
    .replaceAll(RIGHT_SINGLE_QUOTE, LEFT_SINGLE_QUOTE)
}

/** Normalize French guillemets back to American for idempotent re-processing. */
function normalizeFrenchQuotes(text: string): string {
  return text
    .replace(cachedRegExp(`${UNICODE_SYMBOLS.LEFT_GUILLEMET}${UNICODE_SYMBOLS.NBSP}?`, "g"), LEFT_DOUBLE_QUOTE)
    .replace(cachedRegExp(`${UNICODE_SYMBOLS.NBSP}?${UNICODE_SYMBOLS.RIGHT_GUILLEMET}`, "g"), RIGHT_DOUBLE_QUOTE)
}

/** Remap American curly double quotes to French guillemets with NBSP padding. */
function applyFrenchQuotes(text: string): string {
  return text
    .replaceAll(LEFT_DOUBLE_QUOTE, `${UNICODE_SYMBOLS.LEFT_GUILLEMET}${UNICODE_SYMBOLS.NBSP}`)
    .replaceAll(RIGHT_DOUBLE_QUOTE, `${UNICODE_SYMBOLS.NBSP}${UNICODE_SYMBOLS.RIGHT_GUILLEMET}`)
}

/** Locale-specific normalize (pre-pipeline) and apply (post-pipeline) functions. */
const localeQuoteTransforms: Partial<Record<PunctuationStyle, { normalize: (t: string) => string; apply: (t: string) => string }>> = {
  german: { normalize: normalizeGermanQuotes, apply: applyGermanQuotes },
  french: { normalize: normalizeFrenchQuotes, apply: applyFrenchQuotes },
}

/** Shared quote-processing pipeline. Returns text with MLA for apostrophes. */
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
