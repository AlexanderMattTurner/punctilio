import { DEFAULT_SEPARATOR, UNICODE_SYMBOLS } from "./constants.js"
import { classifyAndRenderQuotes, type PunctuationStyle } from "./quote-classifier.js"

const { RIGHT_SINGLE_QUOTE, MODIFIER_LETTER_APOSTROPHE } = UNICODE_SYMBOLS

export { PUNCTUATION_STYLES, type PunctuationStyle, type QuoteRole } from "./quote-classifier.js"

export interface QuoteOptions {
  /** Boundary marker for HTML element boundaries. Default: "\uE000\uE001" */
  separator?: string
  /** "american" (inside), "british" (outside), "none". Default: "american" */
  punctuationStyle?: PunctuationStyle
}

function processQuotes(text: string, options: QuoteOptions, apostrophe: string): string {
  const separator = options.separator ?? DEFAULT_SEPARATOR
  const punctuationStyle = options.punctuationStyle ?? "american"
  if (punctuationStyle === "none") return text
  return classifyAndRenderQuotes(text, separator, punctuationStyle, apostrophe)
}

/** Convert straight quotes to smart quotes. */
export function niceQuotes(text: string, options: QuoteOptions = {}): string {
  // Apostrophes render as U+2019, the same glyph as closing single quotes,
  // per the Unicode Standard. Any U+02BC already in the input is normalized
  // to U+2019 as well (including under punctuationStyle "none").
  return processQuotes(text, options, RIGHT_SINGLE_QUOTE)
    .replaceAll(MODIFIER_LETTER_APOSTROPHE, RIGHT_SINGLE_QUOTE)
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
  return processQuotes(text, options, MODIFIER_LETTER_APOSTROPHE)
}
