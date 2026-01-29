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
}

/**
 * Converts standard quotes to typographic smart quotes.
 *
 * @param text - The text to transform
 * @param options - Configuration options
 * @returns The text with smart quotes
 */
export function niceQuotes(text: string, options: QuoteOptions = {}): string {
  const chr = options.separator ?? DEFAULT_SEPARATOR

  const afterEndingSinglePatterns = `\\s\\.!?;,\\)${EM_DASH}\\-\\]"`
  const afterEndingSingle = `(?=${chr}?(?:s${chr}?)?(?:[${afterEndingSinglePatterns}]|$))`
  const endingSingle = `(?<=[^\\s${LEFT_DOUBLE_QUOTE}'])[']${afterEndingSingle}`
  text = text.replace(new RegExp(endingSingle, "gm"), RIGHT_SINGLE_QUOTE)

  const contraction = `(?<=[A-Za-z])['${RIGHT_SINGLE_QUOTE}](?=${chr}?[a-zA-Z])`
  text = text.replace(new RegExp(contraction, "gm"), RIGHT_SINGLE_QUOTE)

  const apostropheWhitelist = `(?=n${RIGHT_SINGLE_QUOTE} )`
  const endQuoteNotContraction = `(?!${contraction})${RIGHT_SINGLE_QUOTE}${afterEndingSingle}`
  const apostropheRegex = new RegExp(
    `(?<=^|[^\\w])'(${apostropheWhitelist}|(?![^${LEFT_SINGLE_QUOTE}'\\n]*${endQuoteNotContraction}))`,
    "gm"
  )
  text = text.replace(apostropheRegex, RIGHT_SINGLE_QUOTE)

  const beginningSingle = `((?:^|[\\s${LEFT_DOUBLE_QUOTE}${RIGHT_DOUBLE_QUOTE}\\-\\(])${chr}?)['](?=${chr}?\\S)`
  text = text.replace(new RegExp(beginningSingle, "gm"), `$1${LEFT_SINGLE_QUOTE}`)

  const beginningDouble = new RegExp(
    `(?<=^|[\\s\\(\\/\\[\\{\\-${EM_DASH}${chr}])(?<beforeChr>${chr}?)["](?<afterChr>(${chr}[ .,])|(?=${chr}?\\.{3}|${chr}?[^\\s\\)\\${EM_DASH},!?${chr};:.\\}]))`,
    "gm"
  )
  text = text.replace(beginningDouble, `$<beforeChr>${LEFT_DOUBLE_QUOTE}$<afterChr>`)

  text = text.replace(new RegExp(`(?<=\\{)(${chr}? )?["]`, "g"), `$1${LEFT_DOUBLE_QUOTE}`)

  const endingDouble = `([^\\s\\(])["](${chr}?)(?=${chr}|[\\s/\\).,;${EM_DASH}:\\-\\}!?s]|$)`
  text = text.replace(new RegExp(endingDouble, "g"), `$1${RIGHT_DOUBLE_QUOTE}$2`)

  text = text.replace(new RegExp(`["](${chr}?)$`, "g"), `${RIGHT_DOUBLE_QUOTE}$1`)
  text = text.replace(new RegExp(`'(?=${RIGHT_DOUBLE_QUOTE})`, "gu"), RIGHT_SINGLE_QUOTE)

  const periodRegex = new RegExp(
    `(?<![!?:\\.${ELLIPSIS}])(${chr}?)([${RIGHT_SINGLE_QUOTE}${RIGHT_DOUBLE_QUOTE}])(${chr}?)(?!\\.\\.\\.)\\.`,
    "g"
  )
  text = text.replace(periodRegex, "$1.$2$3")

  const commaRegex = new RegExp(`(?<![!?]),(${chr}?[${RIGHT_DOUBLE_QUOTE}${RIGHT_SINGLE_QUOTE}])`, "g")
  text = text.replace(commaRegex, "$1,")

  return text
}
