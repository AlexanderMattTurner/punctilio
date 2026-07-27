export { UNICODE_SYMBOLS } from "./constants.js"
export {
  DASH_STYLES,
  type DashOptions,
  type DashStyle,
  dashWordJoiner,
  hyphenReplace,
} from "./dashes.js"
export { nbspTransform } from "./nbsp.js"
export {
  buildProseView,
  definePass,
  type ProseNode,
  type ProsePass,
  type ProseView,
  replaceAllInView,
  type ReplaceAllOptions,
  withProseView,
} from "./prose-view.js"
export { classifyApostrophes, niceQuotes, PUNCTUATION_STYLES, type PunctuationStyle, type QuoteOptions } from "./quotes.js"
export { type SymbolOptions, symbolTransform } from "./symbols.js"
export type { TransformOptions } from "./transform-options.js"

import { niceQuotes } from "./quotes.js"
import { hyphenReplace } from "./dashes.js"
import { collapseSpaces as collapseSpacesTransform, degrees as degreesTransform, fractions as fractionsTransform, punctuationLigatures as ligaturesTransform, superscriptOrdinal as superscriptTransform, symbolTransform } from "./symbols.js"
import { nbspTransform as nbspTransformFn } from "./nbsp.js"
import { type ProseView, withProseView } from "./prose-view.js"
import { type ResolvedTransformOptions, resolveTransformOptions, type TransformOptions } from "./transform-options.js"
import { UNICODE_SYMBOLS } from "./constants.js"

export const MODIFIER_LETTER_APOSTROPHE = UNICODE_SYMBOLS.MODIFIER_LETTER_APOSTROPHE

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
  // collapseSpaces runs twice. This early run normalizes whitespace so the
  // space-sensitive rules below match the same shapes a re-run would see
  // (e.g. tab+space before an em dash collapses to the plain space the
  // spaced-dash rule keys on); the late run re-collapses runs the passes
  // themselves create (e.g. French opener padding next to an existing space).
  { enabled: (options) => options.collapseSpaces, run: (view) => collapseSpacesTransform(view) },
  // Dashes next: quote classification keys off the converted glyphs (an
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
  // collapseSpaces again (see the entry pass) before nbsp: the nbsp rules
  // bind through single spaces, so runs must be collapsed before
  // non-breaking spaces are inserted.
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
