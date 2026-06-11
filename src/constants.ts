import QuickLRU from "quick-lru"

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
  WORD_JOINER: "\u2060",             // Prevents line-break before (does not add visible space)
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

/** All terminal punctuation chars for regex character classes (ASCII through CJK/Arabic/Greek). */
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

/** Space chars for regex `[...]`: regular space, tab, NBSP, NNBSP. */
export const SPACE_CHARS = ` \t${UNICODE_SYMBOLS.NBSP}${UNICODE_SYMBOLS.NNBSP}`

/** Non-breaking space chars only (NBSP, NNBSP) for regex `[...]`. */
export const NBSP_CHARS = `${UNICODE_SYMBOLS.NBSP}${UNICODE_SYMBOLS.NNBSP}`

/** Max AST recursion depth; guards against stack overflow from deep nesting. */
export const MAX_RECURSION_DEPTH = 1000

/** Single source of truth for issue tracker URL in error messages. */
export const ISSUES_URL = "https://github.com/alexander-turner/punctilio/issues"

export const MAX_REGEX_CACHE_SIZE = 1000
const regexCache = new QuickLRU<string, RegExp>({ maxSize: MAX_REGEX_CACHE_SIZE })

/** Returns a cached RegExp, resetting `lastIndex` to prevent stale global-flag state. */
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

/** @internal */
export function getCachedRegExps(): RegExp[] {
  return Array.from(regexCache.values())
}

/** @internal */
export function clearRegexCache(): void {
  regexCache.clear()
}
