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
import type { PunctuationStyle } from "./quotes.js"
import type { DashStyle } from "./dashes.js"

const PUNCTUATION_STYLES = ["american", "british", "german", "french", "none"] as const satisfies readonly PunctuationStyle[]
const DASH_STYLES = ["american", "british", "none"] as const satisfies readonly DashStyle[]

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

const wrappedMarkdown: Parser<Root> = {
  ...upstreamMarkdown,
  async parse(text, options) {
    const ast = await upstreamMarkdown.parse(text, options)
    // remarkPunctilio's transformer only inspects its tree argument; the
    // file and next-callback params from the unified Transformer signature
    // are unused here.
    const transform = remarkPunctilio(readOptions(options as PluginOptions))
    ;(transform as unknown as (tree: Root) => void)(ast)
    return ast
  },
}

const options: Record<string, SupportOption> = {
  punctilioPunctuationStyle: {
    type: "choice",
    category: "Punctilio",
    default: "american",
    description: "Quote/punctuation style",
    choices: PUNCTUATION_STYLES.map((value) => ({ value, description: value })),
  },
  punctilioDashStyle: {
    type: "choice",
    category: "Punctilio",
    default: "american",
    description: "Dash style",
    choices: DASH_STYLES.map((value) => ({ value, description: value })),
  },
  punctilioNbsp: {
    type: "boolean",
    category: "Punctilio",
    default: true,
    description: "Insert non-breaking spaces in typographically appropriate locations",
  },
  punctilioFractions: {
    type: "boolean",
    category: "Punctilio",
    default: false,
    description: "Convert 1/2 → ½",
  },
  punctilioDegrees: {
    type: "boolean",
    category: "Punctilio",
    default: false,
    description: "Convert 20 C → 20 °C",
  },
  punctilioSuperscript: {
    type: "boolean",
    category: "Punctilio",
    default: false,
    description: "Convert 1st → 1ˢᵗ",
  },
  punctilioLigatures: {
    type: "boolean",
    category: "Punctilio",
    default: false,
    description: "Convert !? → ⁉",
  },
}

const plugin: Plugin = {
  parsers: { markdown: wrappedMarkdown },
  options,
}

export default plugin
