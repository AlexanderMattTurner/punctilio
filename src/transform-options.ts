import { DASH_STYLES, type DashStyle } from "./dashes.js"
import { PUNCTUATION_STYLES, type PunctuationStyle } from "./quotes.js"
import { assertKnownOptionKeys, filterUndefined } from "./utils.js"

export interface TransformOptions {
  /**
   * Whether to include symbol transforms (ellipsis, multiplication, etc.)
   * Default: true
   */
  symbols?: boolean

  /**
   * Whether to collapse multiple consecutive spaces (including non-breaking
   * spaces) into a single space. Keeps the first space in the sequence.
   * Runs at the start of a line (after `\n` or start-of-string) are preserved
   * so indented blocks (e.g. HN-style code) survive.
   *
   * - `true` (default): "hello  world" → "hello world"; "  indented" → "  indented"
   * - `false`: Preserve multiple spaces
   *
   * Default: true
   */
  collapseSpaces?: boolean

  /**
   * How to handle quotes and punctuation placement.
   *
   * - `"american"` (default): Chicago style. Converts straight quotes to smart
   *   quotes, converts prime marks, and places periods/commas inside quotes.
   *   Example: "Hello." and "Hello,"
   * - `"british"`: Oxford style. Converts straight quotes to smart quotes,
   *   converts prime marks, and places periods/commas outside quotes.
   *   Example: "Hello". and "Hello",
   * - `"german"`: German style. Uses low-9 quote characters: „..." and ‚...'
   *   (U+201E/U+201C double, U+201A/U+2018 single). Punctuation outside quotes.
   * - `"french"`: French style. Uses guillemets with NNBSP padding: «\u202F...\u202F»
   *   Single quotes remain as curly quotes. Punctuation outside quotes.
   * - `"none"`: Skip all quote and punctuation transforms entirely.
   *   Straight quotes, apostrophes, and prime marks are left unmodified.
   *
   * Default: "american"
   */
  punctuationStyle?: PunctuationStyle

  /**
   * How to style dashes.
   *
   * - `"american"` (default): Chicago style. Converts parenthetical dashes to
   *   unspaced em dashes (word—word), number ranges to en dashes (1–5),
   *   date ranges to en dashes (January–March), and hyphens to minus signs (−5).
   * - `"british"`: Oxford style. Converts parenthetical dashes to spaced en
   *   dashes (word – word), with the same number range, date range, and minus
   *   sign conversions.
   * - `"none"`: Skip all dash transforms entirely. Hyphens, number ranges,
   *   date ranges, and minus signs are left unmodified.
   *
   * Default: "american"
   */
  dashStyle?: DashStyle

  /**
   * Whether to include fraction transforms (1/2 → ½)
   * Default: false (can be aggressive)
   */
  fractions?: boolean

  /**
   * Whether to include degree symbol transforms (20 C → 20 °C)
   * Default: false (can be aggressive)
   */
  degrees?: boolean

  /**
   * Whether to convert ordinal suffixes to Unicode superscript characters.
   * Transforms numbers like "1st", "2nd", "3rd", "4th" to "1ˢᵗ", "2ⁿᵈ", "3ʳᵈ", "4ᵗʰ".
   * Default: false
   */
  superscript?: boolean

  /**
   * Whether to convert repeated punctuation marks to Unicode ligature characters.
   * Squashes multiple marks: "???" → "⁇", "?!" → "⁈", "!?" → "⁉", "!!!" → "!"
   * Default: false (poor font support)
   */
  ligatures?: boolean

  /**
   * Whether to include arrow transforms (-> → →, <- → ←, <-> → ↔).
   * Only applies when `symbols` is true.
   * Default: true
   */
  includeArrows?: boolean

  /**
   * Whether to insert non-breaking spaces in typographically appropriate
   * locations (after short words, between numbers and units, before
   * last words to prevent widows, after honorifics, etc.).
   * Default: true
   */
  nbsp?: boolean
}

const defaultOpts: Required<TransformOptions> = {
  symbols: true,
  includeArrows: true,
  fractions: false,
  degrees: false,
  superscript: false,
  ligatures: false,
  nbsp: true,
  collapseSpaces: true,
  punctuationStyle: "american",
  dashStyle: "american",
}

/** Runtime list of valid `transform()` option keys, derived from the option
 * defaults so it cannot drift from {@link TransformOptions}. */
export const TRANSFORM_OPTION_KEYS: readonly string[] = Object.keys(defaultOpts)

export type ResolvedTransformOptions = Required<TransformOptions>

/** Validates `options` and fills in the defaults. */
export function resolveTransformOptions(options: TransformOptions): ResolvedTransformOptions {
  assertKnownOptionKeys(options, TRANSFORM_OPTION_KEYS, "transform")

  const punctuationStyle = options.punctuationStyle ?? "american"
  if (!PUNCTUATION_STYLES.includes(punctuationStyle as typeof PUNCTUATION_STYLES[number])) {
    throw new Error(
      `Invalid punctuationStyle: "${punctuationStyle}". ` +
      `Must be one of: ${PUNCTUATION_STYLES.join(", ")}.`
    )
  }

  const dashStyle = options.dashStyle ?? "american"
  if (!DASH_STYLES.includes(dashStyle as typeof DASH_STYLES[number])) {
    throw new Error(
      `Invalid dashStyle: "${dashStyle}". ` +
      `Must be one of: ${DASH_STYLES.join(", ")}.`
    )
  }

  return { ...defaultOpts, ...filterUndefined(options) }
}
