/**
 * Smart quote transformation: straight quotes → curly quotes.
 */

import escapeStringRegexp from "escape-string-regexp"
import { UNICODE_SYMBOLS, DEFAULT_SEPARATOR, LATIN_LETTERS } from "./constants.js"

const {
  EM_DASH,
  LEFT_DOUBLE_QUOTE,
  RIGHT_DOUBLE_QUOTE,
  LEFT_SINGLE_QUOTE,
  RIGHT_SINGLE_QUOTE,
  MODIFIER_LETTER_APOSTROPHE,
  ELLIPSIS,
} = UNICODE_SYMBOLS

export type PunctuationStyle = "american" | "british" | "none"

export interface QuoteOptions {
  /** Boundary marker for HTML element boundaries. Default: "\uE000" */
  separator?: string
  /** "american" (inside), "british" (outside), "none". Default: "american" */
  punctuationStyle?: PunctuationStyle
  /**
   * Use modifier letter apostrophe (U+02BC) instead of right single quote
   * (U+2019) for contractions and possessives. This distinguishes apostrophes
   * from closing quotes in most cases, though some ambiguous patterns (e.g.,
   * `dogs'` vs a closing single quote) cannot be resolved without semantic
   * understanding. May also break downstream regex patterns that expect
   * standard quote characters like /don\u2019t/ or /O\u2019Brien/.
   *
   * Default: false
   */
  useModifierLetterApostrophe?: boolean
}

/** Convert straight single quotes to curly quotes and apostrophes */
function convertSingleQuotes(text: string, sep: string): string {
  const escapedSep = escapeStringRegexp(sep)

  // Handle empty single quotes '' and whitespace-only quotes ' ' first
  // Only match straight quotes, not already-converted curly quotes
  const singleQuoteChars = `'${LEFT_SINGLE_QUOTE}${RIGHT_SINGLE_QUOTE}${MODIFIER_LETTER_APOSTROPHE}`
  text = text.replace(new RegExp(`(?<![${singleQuoteChars}])''(?![${singleQuoteChars}])`, "g"), `${LEFT_SINGLE_QUOTE}${RIGHT_SINGLE_QUOTE}`)
  text = text.replace(new RegExp(`(?<![${singleQuoteChars}])'(\\s+)'(?![${singleQuoteChars}])`, "g"), `${LEFT_SINGLE_QUOTE}$1${RIGHT_SINGLE_QUOTE}`)

  const afterEndingSinglePatterns = `\\s\\.!?;,\\)${EM_DASH}\\-\\]"`
  // Full pattern with optional 's' for lookahead detection in apostropheRegex
  const afterEndingSingle = `(?=${escapedSep}?(?:s${escapedSep}?)?(?:[${afterEndingSinglePatterns}]|$))`

  // Handle 'n' abbreviation (Rock 'n' Roll). Before MLA this wasn't needed —
  // the general rules produced LSQ+n+RSQ which was fine. But MLA requires both
  // quotes to be MLA (semantic apostrophes), and the general rules can't achieve
  // that: neither quote is in a contraction context (no Latin letter on both sides).
  text = text.replace(new RegExp(`(?<=\\w${escapedSep}? )[']n['](?= ${escapedSep}?\\w)`, "gm"), `${MODIFIER_LETTER_APOSTROPHE}n${MODIFIER_LETTER_APOSTROPHE}`)

  // Possessive: 's followed by ending context (e.g., dog's) → U+02BC
  const afterPossessive = `(?=${escapedSep}?s${escapedSep}?(?:[${afterEndingSinglePatterns}]|$))`
  const possessiveSingle = `(?<=[^\\s${LEFT_DOUBLE_QUOTE}'])[']${afterPossessive}`
  text = text.replace(new RegExp(possessiveSingle, "gm"), MODIFIER_LETTER_APOSTROPHE)

  // Closing single quote: ending context without 's' → U+2019
  const afterClosingSingle = `(?=${escapedSep}?(?:[${afterEndingSinglePatterns}]|$))`
  const closingSingle = `(?<=[^\\s${LEFT_DOUBLE_QUOTE}'])[']${afterClosingSingle}`
  text = text.replace(new RegExp(closingSingle, "gm"), RIGHT_SINGLE_QUOTE)

  const contraction = `(?<=[${LATIN_LETTERS}])['${RIGHT_SINGLE_QUOTE}${MODIFIER_LETTER_APOSTROPHE}](?=${escapedSep}?[${LATIN_LETTERS}])`
  text = text.replace(new RegExp(contraction, "gm"), MODIFIER_LETTER_APOSTROPHE)

  const apostropheWhitelist = `(?=n${MODIFIER_LETTER_APOSTROPHE} )`
  const endQuoteNotContraction = `(?!${contraction})[${RIGHT_SINGLE_QUOTE}${MODIFIER_LETTER_APOSTROPHE}]${afterEndingSingle}`
  // Limit lookahead scan to 1000 chars to prevent catastrophic backtracking on pathological inputs
  const apostropheRegex = new RegExp(
    `(?<=^|[^\\w])'(${apostropheWhitelist}|(?![^${LEFT_SINGLE_QUOTE}'\\n]{0,1000}${endQuoteNotContraction}))`,
    "gm"
  )
  text = text.replace(apostropheRegex, MODIFIER_LETTER_APOSTROPHE)

  const beginningSingle = `(?<beforeContext>(?:^|[\\s${LEFT_DOUBLE_QUOTE}${RIGHT_DOUBLE_QUOTE}${EM_DASH}\\-\\(])${escapedSep}?)['](?=${escapedSep}?\\S)`
  text = text.replace(new RegExp(beginningSingle, "gm"), `$<beforeContext>${LEFT_SINGLE_QUOTE}`)

  return text
}

/** Convert straight double quotes to curly quotes */
function convertDoubleQuotes(text: string, sep: string): string {
  const escapedSep = escapeStringRegexp(sep)

  // Handle empty quotes "" first - match only when not part of adjacent quotes
  // Require word boundary or start/end of string on at least one side
  text = text.replace(/(?<=^|[\s([{])""(?=$|[\s)\]}.!?,;:])/g, `${LEFT_DOUBLE_QUOTE}${RIGHT_DOUBLE_QUOTE}`)
  // Handle whitespace-only quotes " " - require non-quote chars on both sides
  text = text.replace(/(?<=^|[\s([{])"(?<whitespace>\s+)"(?=$|[\s)\]}.!?,;:])/g, `${LEFT_DOUBLE_QUOTE}$<whitespace>${RIGHT_DOUBLE_QUOTE}`)

  const beginningDouble = new RegExp(
    `(?<=^|[\\s\\(\\/\\[\\{\\-${EM_DASH}${escapedSep}])(?<beforeChr>${escapedSep}?)["](?<afterChr>(?<sepWithPunct>${escapedSep}[ .,])|(?=${escapedSep}?\\.{3}|${escapedSep}?[^\\s\\)\\${EM_DASH},!?${escapedSep};:.\\}]))`,
    "gm"
  )
  text = text.replace(beginningDouble, `$<beforeChr>${LEFT_DOUBLE_QUOTE}$<afterChr>`)

  text = text.replace(new RegExp(`(?<=\\{)(?<sepSpace>${escapedSep}? )?["]`, "g"), `$<sepSpace>${LEFT_DOUBLE_QUOTE}`)

  const endingDouble = `(?<beforeQuote>[^\\s\\(])["]((?<sepAfter>${escapedSep})?)(?=${escapedSep}|[\\s/\\).,;${EM_DASH}:\\-\\}!?s]|$)`
  text = text.replace(new RegExp(endingDouble, "g"), `$<beforeQuote>${RIGHT_DOUBLE_QUOTE}$<sepAfter>`)

  text = text.replace(new RegExp(`["](?<sepEnd>${escapedSep}?)$`, "g"), `${RIGHT_DOUBLE_QUOTE}$<sepEnd>`)
  text = text.replace(new RegExp(`'(?=${RIGHT_DOUBLE_QUOTE})`, "gu"), RIGHT_SINGLE_QUOTE)

  return text
}

/** Apply American or British punctuation style */
function applyPunctuationStyle(text: string, sep: string, style: PunctuationStyle): string {
  const escapedSep = escapeStringRegexp(sep)

  if (style === "american") {
    // Period outside → inside: "Hello". → "Hello."
    const periodOutsideRegex = new RegExp(
      `(?<![!?:\\.${ELLIPSIS}])(?<sepBefore>${escapedSep}?)(?<quote>[${RIGHT_SINGLE_QUOTE}${RIGHT_DOUBLE_QUOTE}])(?<sepAfter>${escapedSep}?)(?!\\.\\.\\.)\\.`,
      "g"
    )
    text = text.replace(periodOutsideRegex, "$<sepBefore>.$<quote>$<sepAfter>")

    // Comma outside → inside: "Hello", → "Hello,"
    const commaOutsideRegex = new RegExp(
      `(?<sepBefore>${escapedSep}?)(?<quote>[${RIGHT_SINGLE_QUOTE}${RIGHT_DOUBLE_QUOTE}])(?<sepAfter>${escapedSep}?),`,
      "g"
    )
    text = text.replace(commaOutsideRegex, "$<sepBefore>,$<quote>$<sepAfter>")
  } else if (style === "british") {
    // Period inside → outside: "Hello." → "Hello".
    const periodInsideRegex = new RegExp(
      `(?<![!?:\\.${ELLIPSIS}])(?<sepBefore>${escapedSep}?)\\.(?<sepMiddle>${escapedSep}?)(?<quote>[${RIGHT_SINGLE_QUOTE}${RIGHT_DOUBLE_QUOTE}])`,
      "g"
    )
    text = text.replace(periodInsideRegex, "$<sepBefore>$<sepMiddle>$<quote>.")

    // Comma inside → outside: "Hello," → "Hello",
    const commaInsideRegex = new RegExp(
      `(?<![!?]),(?<sepAndQuote>${escapedSep}?[${RIGHT_DOUBLE_QUOTE}${RIGHT_SINGLE_QUOTE}])`,
      "g"
    )
    text = text.replace(commaInsideRegex, "$<sepAndQuote>,")
  }
  return text
}

/** Convert straight quotes to smart quotes. */
export function niceQuotes(text: string, options: QuoteOptions = {}): string {
  const sep = options.separator ?? DEFAULT_SEPARATOR
  const punctuationStyle = options.punctuationStyle ?? "american"
  if (punctuationStyle === "none") return text

  text = convertSingleQuotes(text, sep)
  text = convertDoubleQuotes(text, sep)
  text = applyPunctuationStyle(text, sep, punctuationStyle)

  // MLA is used internally so applyPunctuationStyle can distinguish
  // apostrophes (MLA, don't move) from closing quotes (RSQ, do move).
  // Convert back to RSQ unless the caller opts into the distinction.
  if (!options.useModifierLetterApostrophe) {
    text = text.replaceAll(MODIFIER_LETTER_APOSTROPHE, RIGHT_SINGLE_QUOTE)
  }

  return text
}
