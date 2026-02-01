/**
 * Smart quote transformation: straight quotes → curly quotes.
 */

import { UNICODE_SYMBOLS, DEFAULT_SEPARATOR, LATIN_LETTERS } from "./constants.js"

const {
  EM_DASH,
  LEFT_DOUBLE_QUOTE,
  RIGHT_DOUBLE_QUOTE,
  LEFT_SINGLE_QUOTE,
  RIGHT_SINGLE_QUOTE,
  ELLIPSIS,
} = UNICODE_SYMBOLS

export type PunctuationStyle = "american" | "british" | "none"

export interface QuoteOptions {
  /** Boundary marker for HTML element boundaries. Default: "\uE000" */
  separator?: string
  /** "american" (inside), "british" (outside), "none". Default: "american" */
  punctuationStyle?: PunctuationStyle
}

/** Convert straight single quotes to curly quotes and apostrophes */
function convertSingleQuotes(text: string, sep: string): string {
  const afterEndingSinglePatterns = `\\s\\.!?;,\\)${EM_DASH}\\-\\]"`
  const afterEndingSingle = `(?=${sep}?(?:s${sep}?)?(?:[${afterEndingSinglePatterns}]|$))`
  const endingSingle = `(?<=[^\\s${LEFT_DOUBLE_QUOTE}'])[']${afterEndingSingle}`
  text = text.replace(new RegExp(endingSingle, "gm"), RIGHT_SINGLE_QUOTE)

  const contraction = `(?<=[${LATIN_LETTERS}])['${RIGHT_SINGLE_QUOTE}](?=${sep}?[${LATIN_LETTERS}])`
  text = text.replace(new RegExp(contraction, "gm"), RIGHT_SINGLE_QUOTE)

  const apostropheWhitelist = `(?=n${RIGHT_SINGLE_QUOTE} )`
  const endQuoteNotContraction = `(?!${contraction})${RIGHT_SINGLE_QUOTE}${afterEndingSingle}`
  const apostropheRegex = new RegExp(
    `(?<=^|[^\\w])'(${apostropheWhitelist}|(?![^${LEFT_SINGLE_QUOTE}'\\n]*${endQuoteNotContraction}))`,
    "gm"
  )
  text = text.replace(apostropheRegex, RIGHT_SINGLE_QUOTE)

  const beginningSingle = `(?<beforeContext>(?:^|[\\s${LEFT_DOUBLE_QUOTE}${RIGHT_DOUBLE_QUOTE}${EM_DASH}\\-\\(])${sep}?)['](?=${sep}?\\S)`
  text = text.replace(new RegExp(beginningSingle, "gm"), `$<beforeContext>${LEFT_SINGLE_QUOTE}`)

  return text
}

/** Convert straight double quotes to curly quotes */
function convertDoubleQuotes(text: string, sep: string): string {
  const beginningDouble = new RegExp(
    `(?<=^|[\\s\\(\\/\\[\\{\\-${EM_DASH}${sep}])(?<beforeChr>${sep}?)["](?<afterChr>(?<sepWithPunct>${sep}[ .,])|(?=${sep}?\\.{3}|${sep}?[^\\s\\)\\${EM_DASH},!?${sep};:.\\}]))`,
    "gm"
  )
  text = text.replace(beginningDouble, `$<beforeChr>${LEFT_DOUBLE_QUOTE}$<afterChr>`)

  text = text.replace(new RegExp(`(?<=\\{)(?<sepSpace>${sep}? )?["]`, "g"), `$<sepSpace>${LEFT_DOUBLE_QUOTE}`)

  const endingDouble = `(?<beforeQuote>[^\\s\\(])["]((?<sepAfter>${sep})?)(?=${sep}|[\\s/\\).,;${EM_DASH}:\\-\\}!?s]|$)`
  text = text.replace(new RegExp(endingDouble, "g"), `$<beforeQuote>${RIGHT_DOUBLE_QUOTE}$<sepAfter>`)

  text = text.replace(new RegExp(`["](?<sepEnd>${sep}?)$`, "g"), `${RIGHT_DOUBLE_QUOTE}$<sepEnd>`)
  text = text.replace(new RegExp(`'(?=${RIGHT_DOUBLE_QUOTE})`, "gu"), RIGHT_SINGLE_QUOTE)

  return text
}

/** Apply American or British punctuation style */
function applyPunctuationStyle(text: string, sep: string, style: PunctuationStyle): string {
  if (style === "american") {
    // Period outside → inside: "Hello". → "Hello."
    const periodOutsideRegex = new RegExp(
      `(?<![!?:\\.${ELLIPSIS}])(?<sepBefore>${sep}?)(?<quote>[${RIGHT_SINGLE_QUOTE}${RIGHT_DOUBLE_QUOTE}])(?<sepAfter>${sep}?)(?!\\.\\.\\.)\\.`,
      "g"
    )
    text = text.replace(periodOutsideRegex, "$<sepBefore>.$<quote>$<sepAfter>")

    // Comma outside → inside: "Hello", → "Hello,"
    const commaOutsideRegex = new RegExp(
      `(?<sepBefore>${sep}?)(?<quote>[${RIGHT_SINGLE_QUOTE}${RIGHT_DOUBLE_QUOTE}])(?<sepAfter>${sep}?),`,
      "g"
    )
    text = text.replace(commaOutsideRegex, "$<sepBefore>,$<quote>$<sepAfter>")
  } else if (style === "british") {
    // Period inside → outside: "Hello." → "Hello".
    const periodInsideRegex = new RegExp(
      `(?<![!?:\\.${ELLIPSIS}])(?<sepBefore>${sep}?)\\.(?<sepMiddle>${sep}?)(?<quote>[${RIGHT_SINGLE_QUOTE}${RIGHT_DOUBLE_QUOTE}])`,
      "g"
    )
    text = text.replace(periodInsideRegex, "$<sepBefore>$<sepMiddle>$<quote>.")

    // Comma inside → outside: "Hello," → "Hello",
    const commaInsideRegex = new RegExp(
      `(?<![!?]),(?<sepAndQuote>${sep}?[${RIGHT_DOUBLE_QUOTE}${RIGHT_SINGLE_QUOTE}])`,
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

  text = convertSingleQuotes(text, sep)
  text = convertDoubleQuotes(text, sep)
  text = applyPunctuationStyle(text, sep, punctuationStyle)

  return text
}
