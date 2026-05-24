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

async function runRemarkPunctilio(opts: RemarkPunctilioOptions, ast: Root): Promise<void> {
  // The unified `Transformer` signature requires a VFile and a callback,
  // but `remarkPunctilio` only ever reads the tree. Narrow to the actual
  // shape here so the cast lives in one well-commented place.
  const transformer = remarkPunctilio(opts) as (tree: Root) => void | Promise<void>
  await transformer(ast)
}

const plugin: Plugin = {
  parsers: {
    markdown: {
      ...upstreamMarkdown,
      async parse(text, options) {
        const ast = await upstreamMarkdown.parse(text, options)
        const searchFrom = typeof options.filepath === "string" ? dirname(options.filepath) : process.cwd()
        const opts = await loadPunctilioConfig(searchFrom)
        await runRemarkPunctilio(opts, ast)
        return ast
      },
    },
  },
}

export default plugin
