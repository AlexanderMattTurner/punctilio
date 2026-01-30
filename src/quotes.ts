/**
 * Smart quote transformation
 *
 * Converts straight quotes to typographically correct curly quotes,
 * handling contractions, possessives, and nested quotes.
 */

import { UNICODE_SYMBOLS, DEFAULT_SEPARATOR } from "./constants.js"

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
  /**
   * A boundary marker character used when transforming text that spans
   * multiple HTML elements. This character is treated as "transparent"
   * in the regex patterns - it won't affect quote matching but allows
   * the algorithm to work across element boundaries.
   *
   * Should be a character that doesn't appear in your text.
   * Default: "\uE000" (Unicode Private Use Area)
   */
  separator?: string

  /**
   * How to handle punctuation placement around quotation marks.
   *
   * - `"american"` (default): Periods and commas go inside quotes
   *   Example: "Hello." and "Hello,"
   * - `"british"`: Periods and commas go outside quotes
   *   Example: "Hello". and "Hello",
   * - `"none"`: Don't modify punctuation placement
   *
   * Default: "american"
   */
  punctuationStyle?: PunctuationStyle
}

/** Convert straight single quotes to curly quotes and apostrophes */
function convertSingleQuotes(text: string, sep: string): string {
  const afterEndingSinglePatterns = `\\s\\.!?;,\\)${EM_DASH}\\-\\]"`
  const afterEndingSingle = `(?=${sep}?(?:s${sep}?)?(?:[${afterEndingSinglePatterns}]|$))`
  const endingSingle = `(?<=[^\\s${LEFT_DOUBLE_QUOTE}'])[']${afterEndingSingle}`
  text = text.replace(new RegExp(endingSingle, "gm"), RIGHT_SINGLE_QUOTE)

  const contraction = `(?<=[A-Za-z])['${RIGHT_SINGLE_QUOTE}](?=${sep}?[a-zA-Z])`
  text = text.replace(new RegExp(contraction, "gm"), RIGHT_SINGLE_QUOTE)

  const apostropheWhitelist = `(?=n${RIGHT_SINGLE_QUOTE} )`
  const endQuoteNotContraction = `(?!${contraction})${RIGHT_SINGLE_QUOTE}${afterEndingSingle}`
  const apostropheRegex = new RegExp(
    `(?<=^|[^\\w])'(${apostropheWhitelist}|(?![^${LEFT_SINGLE_QUOTE}'\\n]*${endQuoteNotContraction}))`,
    "gm"
  )
  text = text.replace(apostropheRegex, RIGHT_SINGLE_QUOTE)

  const beginningSingle = `((?:^|[\\s${LEFT_DOUBLE_QUOTE}${RIGHT_DOUBLE_QUOTE}\\-\\(])${sep}?)['](?=${sep}?\\S)`
  text = text.replace(new RegExp(beginningSingle, "gm"), `$1${LEFT_SINGLE_QUOTE}`)

  return text
}

/** Convert straight double quotes to curly quotes */
function convertDoubleQuotes(text: string, sep: string): string {
  const beginningDouble = new RegExp(
    `(?<=^|[\\s\\(\\/\\[\\{\\-${EM_DASH}${sep}])(?<beforeChr>${sep}?)["](?<afterChr>(${sep}[ .,])|(?=${sep}?\\.{3}|${sep}?[^\\s\\)\\${EM_DASH},!?${sep};:.\\}]))`,
    "gm"
  )
  text = text.replace(beginningDouble, `$<beforeChr>${LEFT_DOUBLE_QUOTE}$<afterChr>`)

  text = text.replace(new RegExp(`(?<=\\{)(${sep}? )?["]`, "g"), `$1${LEFT_DOUBLE_QUOTE}`)

  const endingDouble = `([^\\s\\(])["](${sep}?)(?=${sep}|[\\s/\\).,;${EM_DASH}:\\-\\}!?s]|$)`
  text = text.replace(new RegExp(endingDouble, "g"), `$1${RIGHT_DOUBLE_QUOTE}$2`)

  text = text.replace(new RegExp(`["](${sep}?)$`, "g"), `${RIGHT_DOUBLE_QUOTE}$1`)
  text = text.replace(new RegExp(`'(?=${RIGHT_DOUBLE_QUOTE})`, "gu"), RIGHT_SINGLE_QUOTE)

  return text
}

/** Apply American or British punctuation style */
function applyPunctuationStyle(text: string, sep: string, style: PunctuationStyle): string {
  if (style === "american") {
    // Period outside → inside: "Hello". → "Hello."
    const periodOutsideRegex = new RegExp(
      `(?<![!?:\\.${ELLIPSIS}])(${sep}?)([${RIGHT_SINGLE_QUOTE}${RIGHT_DOUBLE_QUOTE}])(${sep}?)(?!\\.\\.\\.)\\.`,
      "g"
    )
    text = text.replace(periodOutsideRegex, "$1.$2$3")

    // Comma outside → inside: "Hello", → "Hello,"
    const commaOutsideRegex = new RegExp(
      `(${sep}?)([${RIGHT_SINGLE_QUOTE}${RIGHT_DOUBLE_QUOTE}])(${sep}?),`,
      "g"
    )
    text = text.replace(commaOutsideRegex, "$1,$2$3")
  } else if (style === "british") {
    // Period inside → outside: "Hello." → "Hello".
    const periodInsideRegex = new RegExp(
      `(?<![!?:\\.${ELLIPSIS}])(${sep}?)\\.(${sep}?)([${RIGHT_SINGLE_QUOTE}${RIGHT_DOUBLE_QUOTE}])`,
      "g"
    )
    text = text.replace(periodInsideRegex, "$1$2$3.")

    // Comma inside → outside: "Hello," → "Hello",
    const commaInsideRegex = new RegExp(
      `(?<![!?]),(${sep}?[${RIGHT_DOUBLE_QUOTE}${RIGHT_SINGLE_QUOTE}])`,
      "g"
    )
    text = text.replace(commaInsideRegex, "$1,")
  }
  return text
}

/**
 * Converts standard quotes to typographic smart quotes.
 *
 * @param text - The text to transform
 * @param options - Configuration options
 * @returns The text with smart quotes
 */
export function niceQuotes(text: string, options: QuoteOptions = {}): string {
  const sep = options.separator ?? DEFAULT_SEPARATOR
  const punctuationStyle = options.punctuationStyle ?? "american"

  text = convertSingleQuotes(text, sep)
  text = convertDoubleQuotes(text, sep)
  text = applyPunctuationStyle(text, sep, punctuationStyle)

  return text
}
