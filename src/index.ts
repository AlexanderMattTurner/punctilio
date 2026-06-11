export { UNICODE_SYMBOLS } from "./constants.js"
import { DASH_STYLES, type DashStyle } from "./dashes.js"
import { PUNCTUATION_STYLES, type PunctuationStyle } from "./quotes.js"
export {
  DASH_STYLES,
  type DashOptions,
  type DashStyle,
  dashWordJoiner,
  enDashDateRange,
  enDashNumberRange,
  hyphenReplace,
  minusReplace,
  numberRangeDisallowedPrefixes,
} from "./dashes.js"
export {
  HONORIFICS,
  nbspAfterCopyrightSymbols,
  nbspAfterHonorifics,
  nbspAfterReferenceAbbreviations,
  nbspAfterSectionSymbols,
  nbspAfterShortWords,
  nbspBeforeLastWord,
  nbspBetweenInitials,
  nbspBetweenNumberAndUnit,
  nbspTransform,
  REFERENCE_ABBREVIATIONS,
  UNITS,
} from "./nbsp.js"
export {
  buildProseView,
  type ProseNode,
  type ProseView,
  replaceAllInView,
  type ReplaceAllOptions,
  withProseView,
} from "./prose-view.js"
export { classifyApostrophes, niceQuotes, PUNCTUATION_STYLES, type PunctuationStyle, type QuoteOptions } from "./quotes.js"

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

import { niceQuotes } from "./quotes.js"
import { hyphenReplace } from "./dashes.js"
import { collapseSpaces as collapseSpacesTransform, degrees as degreesTransform, fractions as fractionsTransform, punctuationLigatures as ligaturesTransform, superscriptOrdinal as superscriptTransform, symbolTransform } from "./symbols.js"
import { nbspTransform as nbspTransformFn } from "./nbsp.js"
import { type ProseView, withProseView } from "./prose-view.js"
import { assertKnownOptionKeys, filterUndefined } from "./utils.js"
import { UNICODE_SYMBOLS } from "./constants.js"

export {
  arrows,
  collapseSpaces,
  degrees,
  ellipsis,
  fractions,
  legalSymbols,
  mathSymbols,
  multiplication,
  primeMarks,
  punctuationLigatures,
  superscriptOrdinal,
  type SymbolOptions,
  symbolTransform,
} from "./symbols.js"
export const MODIFIER_LETTER_APOSTROPHE = UNICODE_SYMBOLS.MODIFIER_LETTER_APOSTROPHE

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

type ResolvedTransformOptions = Required<TransformOptions>

/** Validates `options` and fills in the defaults. */
function resolveTransformOptions(options: TransformOptions): ResolvedTransformOptions {
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

/** One transform pass: an options gate plus the view runner. */
interface PipelinePass {
  enabled(options: ResolvedTransformOptions): boolean
  run(view: ProseView, options: ResolvedTransformOptions): void
}

/**
 * The transform pipeline, in execution order. The order is load-bearing
 * (#214); each entry's comment records the constraint it satisfies.
 */
const PIPELINE: readonly PipelinePass[] = [
  // Dashes first: quote classification keys off the converted glyphs (an
  // opening quote after an em dash, the minus sign in ‘−5’), so hyphens must
  // become em/en dashes and minus signs before the quote rules run.
  {
    enabled: () => true,
    run: (view, options) => hyphenReplace(view, { dashStyle: options.dashStyle }),
  },
  // Quotes next, folding prime marks first (niceQuotes' `primes` default):
  // primes must convert while quotes are still straight, and before
  // symbolTransform, whose multiplication pass recognizes prime-suffixed
  // dimensions (5′ x 4′).
  {
    enabled: () => true,
    run: (view, options) => niceQuotes(view, { punctuationStyle: options.punctuationStyle }),
  },
  // Core symbols (ellipsis, multiplication, math, legal, arrows). Ellipsis
  // folding runs first inside symbolTransform so later passes see `…`, not a
  // dot run they could misread.
  {
    enabled: (options) => options.symbols,
    run: (view, options) => symbolTransform(view, { includeArrows: options.includeArrows }),
  },
  // Opt-in passes, after the core set so they operate on settled glyphs.
  { enabled: (options) => options.fractions, run: (view) => fractionsTransform(view) },
  { enabled: (options) => options.degrees, run: (view) => degreesTransform(view) },
  { enabled: (options) => options.superscript, run: (view) => superscriptTransform(view) },
  { enabled: (options) => options.ligatures, run: (view) => ligaturesTransform(view) },
  // collapseSpaces before nbsp: the nbsp rules bind through single spaces, so
  // runs must be collapsed before non-breaking spaces are inserted.
  { enabled: (options) => options.collapseSpaces, run: (view) => collapseSpacesTransform(view) },
  { enabled: (options) => options.nbsp, run: (view) => nbspTransformFn(view) },
]

/**
 * Runs the full transform pipeline over a ProseView in place, committing
 * after every pass. Used by the rehype/remark plugins to transform text that
 * spans multiple source nodes; for plain strings use {@link transform}.
 */
export function transformView(view: ProseView, options: TransformOptions = {}): void {
  const resolved = resolveTransformOptions(options)
  for (const pass of PIPELINE) {
    if (pass.enabled(resolved)) {
      pass.run(view, resolved)
    }
  }
}

export function transform(text: string, options: TransformOptions = {}): string {
  return withProseView(text, (view) => transformView(view, options))
}
