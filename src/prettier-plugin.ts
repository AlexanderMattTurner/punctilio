/**
 * Prettier plugin applying punctilio's typographic transforms to Markdown.
 *
 * @example
 * ```jsonc
 * // .prettierrc
 * { "plugins": ["punctilio/prettier-plugin"] }
 *
 * // .punctiliorc.json (optional)
 * { "punctuationStyle": "british", "skipTags": ["pre", "code"] }
 * ```
 *
 * @packageDocumentation
 */

import { dirname } from "node:path"

import * as prettierMarkdown from "prettier/plugins/markdown"
import type { Parser, Plugin } from "prettier"
import type { Root } from "mdast"
import { cosmiconfig } from "cosmiconfig"

import { remarkPunctilio, type RemarkPunctilioOptions } from "./remark.js"

const upstreamMarkdown = prettierMarkdown.parsers.markdown as Parser<Root>
const explorer = cosmiconfig("punctilio")

async function loadPunctilioConfig(searchFrom: string): Promise<RemarkPunctilioOptions> {
  const result = await explorer.search(searchFrom)
  return !result || result.isEmpty ? {} : (result.config as RemarkPunctilioOptions)
}

const plugin: Plugin = {
  parsers: {
    markdown: {
      ...upstreamMarkdown,
      async parse(text, options) {
        const ast = await upstreamMarkdown.parse(text, options)
        const searchFrom = typeof options.filepath === "string" ? dirname(options.filepath) : process.cwd()
        const opts = await loadPunctilioConfig(searchFrom)
        const transform = remarkPunctilio(opts) as (tree: Root) => void
        transform(ast)
        return ast
      },
    },
  },
}

export default plugin
