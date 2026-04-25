/**
 * Shared Unicode constants used throughout the punctilio package.
 *
 * This module provides a centralized location for all Unicode symbols
 * used in typography transformations, making the codebase more maintainable
 * and self-documenting.
 *
 * @module constants
 */

import escapeStringRegexp from "escape-string-regexp"
import QuickLRU from "quick-lru"

/**
 * Unicode symbols for typography transformations.
 */
export const UNICODE_SYMBOLS = {
  ELLIPSIS: "\u2026",
  MULTIPLICATION: "\u00D7",
  NOT_EQUAL: "\u2260",
  PLUS_MINUS: "\u00B1",
  COPYRIGHT: "\u00A9",
  REGISTERED: "\u00AE",
  TRADEMARK: "\u2122",
  DEGREE: "\u00B0",
  ARROW_RIGHT: "\u2192",
  ARROW_LEFT: "\u2190",
  ARROW_LEFT_RIGHT: "\u2194",
  APPROXIMATE: "\u2248",
  LESS_EQUAL: "\u2264",
  GREATER_EQUAL: "\u2265",
  PRIME: "\u2032",
  DOUBLE_PRIME: "\u2033",
  FRACTION_1_4: "\u00BC",
  FRACTION_1_2: "\u00BD",
  FRACTION_3_4: "\u00BE",
  FRACTION_1_3: "\u2153",
  FRACTION_2_3: "\u2154",
  FRACTION_1_5: "\u2155",
  FRACTION_2_5: "\u2156",
  FRACTION_3_5: "\u2157",
  FRACTION_4_5: "\u2158",
  FRACTION_1_6: "\u2159",
  FRACTION_5_6: "\u215A",
  FRACTION_1_8: "\u215B",
  FRACTION_3_8: "\u215C",
  FRACTION_5_8: "\u215D",
  FRACTION_7_8: "\u215E",
  EM_DASH: "\u2014",
  EN_DASH: "\u2013",
  MINUS: "\u2212",
  LEFT_DOUBLE_QUOTE: "\u201C",
  RIGHT_DOUBLE_QUOTE: "\u201D",
  LEFT_SINGLE_QUOTE: "\u2018",
  RIGHT_SINGLE_QUOTE: "\u2019",
  MODIFIER_LETTER_APOSTROPHE: "\u02BC",
  NBSP: "\u00A0",
  NNBSP: "\u202F",                   // Narrow no-break space (French typography, Unicode CLDR)
  DOUBLE_LOW_9_QUOTE: "\u201E",      // „
  SINGLE_LOW_9_QUOTE: "\u201A",     // ‚
  LEFT_GUILLEMET: "\u00AB",         // «
  RIGHT_GUILLEMET: "\u00BB",        // »
  // Superscript ordinal suffixes
  SUPERSCRIPT_ST: "\u02E2\u1D57", // ˢᵗ
  SUPERSCRIPT_ND: "\u207F\u1D48", // ⁿᵈ
  SUPERSCRIPT_RD: "\u02B3\u1D48", // ʳᵈ
  SUPERSCRIPT_TH: "\u1D57\u02B0", // ᵗʰ
  // Punctuation ligatures
  DOUBLE_QUESTION: "\u2047", // ⁇
  QUESTION_EXCLAMATION: "\u2048", // ⁈
  EXCLAMATION_QUESTION: "\u2049", // ⁉
  DOUBLE_EXCLAMATION: "\u203C", // ‼
  INTERROBANG: "\u203D", // ‽
  // CJK fullwidth punctuation
  FULLWIDTH_EXCLAMATION: "\uFF01", // ！
  FULLWIDTH_QUESTION: "\uFF1F", // ？
  FULLWIDTH_PERIOD: "\uFF0E", // ．
  FULLWIDTH_COMMA: "\uFF0C", // ，
  FULLWIDTH_SEMICOLON: "\uFF1B", // ；
  FULLWIDTH_COLON: "\uFF1A", // ：
  // CJK ideographic punctuation
  IDEOGRAPHIC_FULL_STOP: "\u3002", // 。
  IDEOGRAPHIC_COMMA: "\u3001", // 、
  // Arabic punctuation
  ARABIC_QUESTION_MARK: "\u061F", // ؟
  ARABIC_SEMICOLON: "\u061B", // ؛
  // Greek punctuation
  GREEK_QUESTION_MARK: "\u037E", // ; (visually identical to ASCII semicolon)
} as const

/**
 * All terminal punctuation characters that signal a quote is "already terminated".
 * Covers ASCII, ellipsis, punctuation ligatures, interrobang, CJK fullwidth,
 * CJK ideographic, Arabic, and Greek question mark.
 *
 * Used as a regex character class fragment in quotes.ts and as a test fixture.
 */
export const TERMINAL_PUNCTUATION = [
  "!", "?", ".", ",", ";", ":",
  UNICODE_SYMBOLS.ELLIPSIS,
  UNICODE_SYMBOLS.DOUBLE_QUESTION, UNICODE_SYMBOLS.QUESTION_EXCLAMATION,
  UNICODE_SYMBOLS.EXCLAMATION_QUESTION, UNICODE_SYMBOLS.DOUBLE_EXCLAMATION,
  UNICODE_SYMBOLS.INTERROBANG,
  UNICODE_SYMBOLS.FULLWIDTH_EXCLAMATION, UNICODE_SYMBOLS.FULLWIDTH_QUESTION,
  UNICODE_SYMBOLS.FULLWIDTH_PERIOD, UNICODE_SYMBOLS.FULLWIDTH_COMMA,
  UNICODE_SYMBOLS.FULLWIDTH_SEMICOLON, UNICODE_SYMBOLS.FULLWIDTH_COLON,
  UNICODE_SYMBOLS.IDEOGRAPHIC_FULL_STOP, UNICODE_SYMBOLS.IDEOGRAPHIC_COMMA,
  UNICODE_SYMBOLS.ARABIC_QUESTION_MARK, UNICODE_SYMBOLS.ARABIC_SEMICOLON,
  UNICODE_SYMBOLS.GREEK_QUESTION_MARK,
] as const

/**
 * Character class pattern for Latin letters including European accented characters.
 * Use inside regex character classes: `[${LATIN_LETTERS}]`
 *
 * Includes:
 * - Basic Latin: A-Z, a-z
 * - Latin-1 Supplement: À-Ö, Ø-ö, ø-ÿ (excludes × and ÷)
 * - Latin Extended-A: Ā-ſ (U+0100-017F)
 * - Latin Extended-B: ƀ-ɏ (U+0180-024F)
 * - Latin Extended Additional: Ḁ-ỿ (U+1E00-1EFF) — Vietnamese, Welsh, medievalist
 *
 * Examples of covered characters: é, ñ, ü, ø, ą, ł, ș, ả, ầ, ẁ, ẃ
 */
export const LATIN_LETTERS = "A-Za-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u00FF\\u0100-\\u017F\\u0180-\\u024F\\u1E00-\\u1EFF"

/**
 * Default separator for text spanning HTML elements.
 * Uses a two-character sentinel from the Unicode Private Use Area
 * (U+E000 U+E001) to avoid collisions with CJK fonts, Apple emoji
 * internals, PDF-to-text output, and icon fonts that repurpose U+E000.
 */
export const DEFAULT_SEPARATOR = "\uE000\uE001"
const ESCAPED_DEFAULT_SEPARATOR = escapeStringRegexp(DEFAULT_SEPARATOR)

/**
 * Returns the regex-escaped separator string for the given options,
 * wrapped in a non-capturing group so that quantifiers like `?` and `*`
 * apply to the entire separator sequence (critical for multi-character
 * separators like the default U+E000 U+E001).
 *
 * @param options - Object with an optional `separator` field
 * @returns Regex-escaped separator string wrapped in `(?:...)`
 */
export function getEscapedSeparator(options: { separator?: string }): string {
  const escaped = options.separator
    ? escapeStringRegexp(options.separator)
    : ESCAPED_DEFAULT_SEPARATOR
  return `(?:${escaped})`
}

/**
 * Characters that have special meaning in regular expressions.
 * Used for testing that separator escaping works correctly.
 */
export const REGEX_SPECIAL_CHARS = [".", "*", "+", "?", "^", "$", "[", "]", "\\", "|", "(", ")"] as const

/**
 * Creates a marker-aware word boundary pattern for the START of a match.
 *
 * Standard `\b` can create false boundaries when separator markers appear between
 * word characters (e.g., `x\uE000ReLU` has a false boundary before `R`).
 *
 * This pattern uses a negative lookbehind to reject matches that are preceded
 * by word characters followed by any number of markers.
 *
 * @param escapedSeparator - Regex-escaped separator string
 * @returns Pattern string: `(?<!\w${sep}*)\b`
 *
 * @example
 * const wb = wordBoundaryStart(ESCAPED_DEFAULT_SEPARATOR)
 * // With text "x\uE000ReLU": \b would match before R, but wb won't
 */
export function wordBoundaryStart(escapedSeparator: string): string {
  return `(?<!\\w${escapedSeparator}*)\\b`
}

/**
 * Creates a marker-aware word boundary pattern for the END of a match.
 *
 * Standard `\b` can create false boundaries when separator markers appear between
 * word characters (e.g., `1st\uE000ly` has a false boundary after `t`).
 *
 * This pattern uses a negative lookahead to reject matches that are followed
 * by markers then word characters.
 *
 * @param escapedSeparator - Regex-escaped separator string
 * @returns Pattern string: `\b(?!${sep}*\w)`
 *
 * @example
 * const wbe = wordBoundaryEnd(ESCAPED_DEFAULT_SEPARATOR)
 * // With text "1st\uE000ly": \b would match after t, but wbe won't
 */
export function wordBoundaryEnd(escapedSeparator: string): string {
  return `\\b(?!${escapedSeparator}*\\w)`
}

/**
 * Pattern string for space characters (regular space, tab, and non-breaking space).
 * Use inside regex character classes: `[${SPACE_CHARS}]`
 */
export const SPACE_CHARS = ` \t${UNICODE_SYMBOLS.NBSP}`

/**
 * Creates a lookbehind pattern that matches after whitespace, separator, or start of string.
 * Used for arrow patterns and other constructs that should appear at word boundaries.
 *
 * Uses alternation instead of a character class so that multi-character
 * separators are matched as a sequence, not as individual characters.
 *
 * @param escapedSeparator - Regex-escaped separator string (may be grouped)
 * @returns Pattern string: `(?<=\\s|${sep}|^)`
 */
export function spaceBoundaryStart(escapedSeparator: string): string {
  return `(?<=\\s|${escapedSeparator}|^)`
}

/**
 * Creates a lookahead pattern that matches before whitespace, separator, or end of string.
 * Used for arrow patterns and other constructs that should appear at word boundaries.
 *
 * Uses alternation instead of a character class so that multi-character
 * separators are matched as a sequence, not as individual characters.
 *
 * @param escapedSeparator - Regex-escaped separator string (may be grouped)
 * @returns Pattern string: `(?=\\s|${sep}|$)`
 */
export function spaceBoundaryEnd(escapedSeparator: string): string {
  return `(?=\\s|${escapedSeparator}|$)`
}

/**
 * Maximum recursion depth used by the rehype and remark tree walkers.
 * Guards against stack overflow from maliciously or accidentally deep
 * AST nesting. Shared so both plugins behave identically.
 */
export const MAX_RECURSION_DEPTH = 1000

/**
 * Canonical issue tracker URL, referenced in user-facing error messages
 * so there's exactly one source of truth if the repository ever moves.
 */
export const ISSUES_URL = "https://github.com/alexander-turner/punctilio/issues"

/**
 * LRU cache for compiled RegExp objects keyed by `pattern + '\0' + flags`.
 * Avoids recompiling identical regexes on every function call (common
 * when using the default separator). Capped to prevent unbounded growth.
 */
export const MAX_REGEX_CACHE_SIZE = 1000
const regexCache = new QuickLRU<string, RegExp>({ maxSize: MAX_REGEX_CACHE_SIZE })

/**
 * Returns a cached RegExp for the given pattern and flags.
 * Resets `lastIndex` before returning to prevent stale state when
 * callers use `.test()` or `.exec()` on global-flag regexes.
 */
export function cachedRegExp(pattern: string, flags: string): RegExp {
  const key = `${pattern}\0${flags}`
  let re = regexCache.get(key)
  if (!re) {
    re = new RegExp(pattern, flags)
    regexCache.set(key, re)
  }
  re.lastIndex = 0
  return re
}

/**
 * Clears the regex cache. Exported for test isolation only.
 * @internal
 */
export function clearRegexCache(): void {
  regexCache.clear()
}
