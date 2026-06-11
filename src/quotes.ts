import { cachedRegExp, UNICODE_SYMBOLS } from "./constants.js"
import { classifyAndRenderQuotes, convertPrimeMarks, type PunctuationStyle } from "./quote-classifier.js"
import { overInput, type ProseView, replaceAllInView } from "./prose-view.js"

const { RIGHT_SINGLE_QUOTE, MODIFIER_LETTER_APOSTROPHE } = UNICODE_SYMBOLS

export { PUNCTUATION_STYLES, type PunctuationStyle, type QuoteRole } from "./quote-classifier.js"

export interface QuoteOptions {
  /** "american" (inside), "british" (outside), "none". Default: "american" */
  punctuationStyle?: PunctuationStyle
  /**
   * Convert prime-mark candidates (5'10" → 5′10″) before quote
   * classification. `false` leaves them to the quote rules. Applies to
   * `niceQuotes` only; `classifyApostrophes` never converts primes.
   * Default: true
   */
  primes?: boolean
}

/** Convert straight quotes to smart quotes. */
export function niceQuotes(input: string, options?: QuoteOptions): string
export function niceQuotes(input: ProseView, options?: QuoteOptions): void
export function niceQuotes(input: string | ProseView, options: QuoteOptions = {}): string | void {
  const punctuationStyle = options.punctuationStyle ?? "american"
  return overInput(input, (view) => {
    if (punctuationStyle !== "none") {
      if (options.primes !== false) {
        convertPrimeMarks(view)
      }
      // Apostrophes render as U+2019, the same glyph as closing single quotes,
      // per the Unicode Standard.
      classifyAndRenderQuotes(view, punctuationStyle, RIGHT_SINGLE_QUOTE)
    }
    // Any U+02BC already in the input is normalized to U+2019 as well
    // (including under punctuationStyle "none").
    replaceAllInView(view, cachedRegExp(MODIFIER_LETTER_APOSTROPHE, "g"), () => RIGHT_SINGLE_QUOTE)
  })
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
export function classifyApostrophes(input: string, options?: QuoteOptions): string
export function classifyApostrophes(input: ProseView, options?: QuoteOptions): void
export function classifyApostrophes(input: string | ProseView, options: QuoteOptions = {}): string | void {
  const punctuationStyle = options.punctuationStyle ?? "american"
  return overInput(input, (view) => {
    if (punctuationStyle !== "none") {
      classifyAndRenderQuotes(view, punctuationStyle, MODIFIER_LETTER_APOSTROPHE)
    }
  })
}
