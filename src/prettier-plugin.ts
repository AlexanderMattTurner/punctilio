/**
 * Prettier plugin that applies punctilio's typographic transformations
 * to Markdown files as part of the standard prettier formatting pipeline.
 *
 * Wraps prettier's built-in markdown parser: after prettier produces the
 * mdast tree, we run `remarkPunctilio` to walk it and rewrite text
 * nodes (smart quotes, em-dashes, ellipses, …) without touching code
 * spans, code blocks, or inline HTML. Prettier then prints the modified
 * tree back to markdown.
 *
 * @example
 * ```jsonc
 * // .prettierrc
 * {
 *   "plugins": ["punctilio/prettier-plugin"],
 *   "punctilioPunctuationStyle": "british"
 * }
 * ```
 *
 * @packageDocumentation
 */

import * as prettierMarkdown from "prettier/plugins/markdown"
import type { Parser, Plugin, SupportOption } from "prettier"
import type { Root } from "mdast"

import { remarkPunctilio, type RemarkPunctilioOptions } from "./remark.js"
import { PUNCTUATION_STYLES, type PunctuationStyle } from "./quotes.js"
import { DASH_STYLES, type DashStyle } from "./dashes.js"

interface PluginOptions {
  punctilioPunctuationStyle?: PunctuationStyle
  punctilioDashStyle?: DashStyle
  punctilioNbsp?: boolean
  punctilioFractions?: boolean
  punctilioDegrees?: boolean
  punctilioSuperscript?: boolean
  punctilioLigatures?: boolean
}

function readOptions(opts: PluginOptions): RemarkPunctilioOptions {
  const out: RemarkPunctilioOptions = {}
  if (opts.punctilioPunctuationStyle) out.punctuationStyle = opts.punctilioPunctuationStyle
  if (opts.punctilioDashStyle) out.dashStyle = opts.punctilioDashStyle
  if (opts.punctilioNbsp === false) out.nbsp = false
  if (opts.punctilioFractions) out.fractions = true
  if (opts.punctilioDegrees) out.degrees = true
  if (opts.punctilioSuperscript) out.superscript = true
  if (opts.punctilioLigatures) out.ligatures = true
  return out
}

const upstreamMarkdown = prettierMarkdown.parsers.markdown as Parser<Root>

const CATEGORY = "Punctilio"
const choice = (values: readonly string[]) => values.map((value) => ({ value, description: value }))

const options: Record<string, SupportOption> = {
  punctilioPunctuationStyle: {
    category: CATEGORY, type: "choice", default: "american",
    description: "Quote/punctuation style", choices: choice(PUNCTUATION_STYLES),
  },
  punctilioDashStyle: {
    category: CATEGORY, type: "choice", default: "american",
    description: "Dash style", choices: choice(DASH_STYLES),
  },
  punctilioNbsp:       { category: CATEGORY, type: "boolean", default: true,  description: "Insert non-breaking spaces in typographically appropriate locations" },
  punctilioFractions:  { category: CATEGORY, type: "boolean", default: false, description: "Convert 1/2 → ½" },
  punctilioDegrees:    { category: CATEGORY, type: "boolean", default: false, description: "Convert 20 C → 20 °C" },
  punctilioSuperscript:{ category: CATEGORY, type: "boolean", default: false, description: "Convert 1st → 1ˢᵗ" },
  punctilioLigatures:  { category: CATEGORY, type: "boolean", default: false, description: "Convert !? → ⁉" },
}

const plugin: Plugin = {
  options,
  parsers: {
    markdown: {
      ...upstreamMarkdown,
      async parse(text, options) {
        const ast = await upstreamMarkdown.parse(text, options)
        // remarkPunctilio's transformer only reads its tree argument; the file
        // and next-callback params from the unified Transformer signature are
        // unused, so a narrowed cast is enough to call it.
        const transform = remarkPunctilio(readOptions(options as PluginOptions)) as (tree: Root) => void
        transform(ast)
        return ast
      },
    },
  },
}

export default plugin
