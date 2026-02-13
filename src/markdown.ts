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
   * Character used for emphasis markers in the output.
   * Default: "*"
   */
  emphasisMarker?: "*" | "_"

  /**
   * Character used for strong markers in the output.
   * Default: "*"
   */
  strongMarker?: "*" | "_"

  /**
   * Character used for bullet list markers in the output.
   * Default: "-"
   */
  bulletMarker?: "-" | "*" | "+"

  /**
   * Character used for thematic break (horizontal rule) markers.
   * Default: "*"
   */
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
 * const result = await transformMarkdown('"Hello," she said -- "it\'s nice."')
 * // → '\u201CHello,\u201D she said\u2014\u201Cit\u2019s nice.\u201D'
 *
 * const british = await transformMarkdown('"Hello", she said', {
 *   punctuationStyle: 'british',
 *   dashStyle: 'british',
 * })
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
      ...(emphasisMarker !== undefined && { emphasis: emphasisMarker }),
      ...(strongMarker !== undefined && { strong: strongMarker }),
      ...(bulletMarker !== undefined && { bullet: bulletMarker }),
      ...(ruleMarker !== undefined && { rule: ruleMarker }),
    })

  const result = await processor.process(input)
  return String(result)
}
