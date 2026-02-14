/**
 * Convenience module for Markdown-to-Markdown typography transformations.
 *
 * Provides a single function that takes Markdown input and returns
 * typographically improved Markdown output.
 *
 * Requires `unified`, `remark-parse`, and `remark-stringify` to be installed.
 *
 * @packageDocumentation
 */

import { unified } from "unified"
import remarkParse from "remark-parse"
import remarkStringify from "remark-stringify"

import { remarkPunctilio, type RemarkPunctilioOptions } from "./remark.js"

/**
 * Options for the Markdown transform pipeline.
 */
export interface MarkdownOptions extends RemarkPunctilioOptions {
  /**
   * Character for emphasis (`*text*` vs `_text_`) and strong (`**text**` vs `__text__`).
   * Default: "*"
   */
  emphasisMarker?: "*" | "_"

  /**
   * Character for strong emphasis (`**text**` vs `__text__`). Must match emphasisMarker.
   * Default: "*"
   */
  strongMarker?: "*" | "_"

  /** Bullet marker for output consistency. Default: "-" */
  bulletMarker?: "-" | "*" | "+"

  /** Thematic break marker. Default: "-" */
  ruleMarker?: "-" | "*" | "_"
}

/**
 * Transforms Markdown text with typographic improvements.
 *
 * Parses the input as Markdown, applies punctilio typography transformations
 * (smart quotes, em-dashes, ellipses, etc.), and serializes back to Markdown.
 *
 * @param input - The Markdown text to transform
 * @param options - Configuration options for both the transform and serializer
 * @returns The typographically improved Markdown text
 *
 * @example
 * ```ts
 * import { transformMarkdown } from 'punctilio/markdown'
 *
 * await transformMarkdown('"Hello" -- world')
 * // → '\u201CHello\u201D\u2014world'
 * ```
 */
export async function transformMarkdown(
  input: string,
  options: MarkdownOptions = {}
): Promise<string> {
  const {
    emphasisMarker,
    strongMarker,
    bulletMarker,
    ruleMarker,
    ...punctilioOptions
  } = options

  const processor = unified()
    .use(remarkParse)
    .use(remarkPunctilio, punctilioOptions)
    .use(remarkStringify, {
      emphasis: emphasisMarker ?? "*",
      strong: strongMarker ?? "*",
      bullet: bulletMarker ?? "-",
      rule: ruleMarker ?? "-",
      ...(ruleMarker === "-" || ruleMarker === undefined ? { ruleRepetition: 4 } : {}),
    })

  const result = await processor.process(input)
  return String(result)
}
