/**
 * Remark plugin for applying punctilio typography transformations to Markdown.
 *
 * This plugin integrates punctilio with the unified/remark ecosystem,
 * allowing you to apply smart typography transformations to Markdown ASTs.
 *
 * @packageDocumentation
 */

import type { Root, PhrasingContent, Text } from "mdast"
import type { Transformer } from "unified"

import { visitParents } from "unist-util-visit-parents"

import { transform, type TransformOptions } from "./index.js"
import { DEFAULT_SEPARATOR } from "./constants.js"
import { formatErrorString } from "./utils.js"

export type RemarkPunctilioOptions = TransformOptions

/**
 * Maximum recursion depth for tree traversal functions.
 * Prevents stack overflow from maliciously deep Markdown nesting.
 */
const MAX_RECURSION_DEPTH = 1000

/**
 * MDAST node types that contain phrasing (inline) content and should
 * have their text transformed as a single unit.
 */
const PHRASING_CONTAINERS = new Set(["paragraph", "heading", "tableCell"])

/**
 * MDAST node types whose text content should not be transformed.
 */
const SKIP_TYPES = new Set(["inlineCode", "html"])

/**
 * Recursively collects text nodes from a phrasing content tree,
 * skipping code and HTML nodes.
 *
 * @param node - The phrasing content node to collect from
 * @param depth - Current recursion depth (internal use)
 * @returns Array of Text nodes
 */
function flattenTextNodes(
  node: PhrasingContent,
  depth: number = 0
): Text[] {
  /* istanbul ignore if -- defensive: prevents stack overflow from malicious nesting */
  if (depth > MAX_RECURSION_DEPTH) {
    return []
  }

  if (SKIP_TYPES.has(node.type)) {
    return []
  }

  if (node.type === "text") {
    return [node]
  }

  if ("children" in node) {
    return (node.children as PhrasingContent[]).flatMap((child) =>
      flattenTextNodes(child, depth + 1)
    )
  }

  return []
}

/**
 * Remark plugin that applies punctilio typography transformations to Markdown.
 *
 * @param options - Plugin configuration options
 * @returns Unified transformer function
 *
 * @example
 * ```ts
 * import { unified } from 'unified'
 * import remarkParse from 'remark-parse'
 * import remarkStringify from 'remark-stringify'
 * import remarkPunctilio from 'punctilio/remark'
 *
 * const result = await unified()
 *   .use(remarkParse)
 *   .use(remarkPunctilio, {
 *     punctuationStyle: 'american',
 *     dashStyle: 'american',
 *   })
 *   .use(remarkStringify)
 *   .process('"Hello," she said -- "it\'s nice."')
 *
 * // Output Markdown will have smart quotes and em-dashes
 * ```
 */
export function remarkPunctilio(
  options: RemarkPunctilioOptions = {}
): Transformer<Root, Root> {
  const separator = options.separator ?? DEFAULT_SEPARATOR

  const transformFn = (text: string): string => {
    return transform(text, { ...options, separator })
  }

  return (tree: Root) => {
    visitParents(tree, (node, ancestors) => {
      if (!PHRASING_CONTAINERS.has(node.type)) {
        return
      }

      /* istanbul ignore if -- defensive: standard MDAST never nests phrasing containers */
      if (ancestors.some((a) => PHRASING_CONTAINERS.has(a.type))) {
        return
      }

      /* istanbul ignore if -- defensive: phrasing containers always have children */
      if (!("children" in node)) {
        return
      }

      const textNodes = (node.children as PhrasingContent[]).flatMap((child) =>
        flattenTextNodes(child)
      )

      if (textNodes.length === 0) {
        return
      }

      // Same separator technique as the rehype plugin:
      // append marker to each text node, concatenate, transform, split back
      const markedContent = textNodes.map((n) => n.value + separator).join("")
      const transformedContent = transformFn(markedContent)
      const transformedFragments = transformedContent.split(separator).slice(0, -1)

      /* istanbul ignore if -- defensive: transform should never consume separator chars */
      if (transformedFragments.length !== textNodes.length) {
        throw new Error(
          `Transformation altered the number of text nodes. ` +
            `Expected ${textNodes.length}, got ${transformedFragments.length}. ` +
            `Input: ${formatErrorString(markedContent, "input")}`
        )
      }

      textNodes.forEach((n, index) => {
        n.value = transformedFragments[index]
      })
    })
  }
}

export default remarkPunctilio
