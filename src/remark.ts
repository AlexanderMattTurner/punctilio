import type { PhrasingContent, Root, Text } from "mdast"
import type { Transformer } from "unified"

import { visitParents } from "unist-util-visit-parents"

import { transformView } from "./index.js"
import { TRANSFORM_OPTION_KEYS, type TransformOptions } from "./transform-options.js"
import { MAX_RECURSION_DEPTH } from "./constants.js"
import { buildProseView } from "./prose-view.js"
import { assertKnownOptionKeys } from "./utils.js"

/**
 * Same options as `transform()`, except `nbsp` defaults to `false`:
 * invisible U+00A0 characters written into Markdown source files break
 * grep/Ctrl+F matching. Pass `nbsp: true` explicitly to opt in.
 */
export type RemarkPunctilioOptions = TransformOptions

const PHRASING_CONTAINERS = new Set(["paragraph", "heading", "tableCell"])

const SKIP_TYPES = new Set(["inlineCode", "html"])

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

export function remarkPunctilio(
  options: RemarkPunctilioOptions = {}
): Transformer<Root, Root> {
  assertKnownOptionKeys(options, TRANSFORM_OPTION_KEYS, "remarkPunctilio")

  // Markdown is a source format, so default `nbsp` to false (`?? false`
  // rather than spread defaults so an explicit `nbsp: undefined` also gets
  // the Markdown default instead of falling through to transform's).
  const pluginOptions = {
    ...options,
    nbsp: options.nbsp ?? false,
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

      transformView(buildProseView(textNodes), pluginOptions)
    })
  }
}

export default remarkPunctilio
