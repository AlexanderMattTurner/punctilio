import type { PhrasingContent, Root, Text } from "mdast"
import type { Transformer } from "unified"

import { visitParents } from "unist-util-visit-parents"

import { transformView } from "./index.js"
import { TRANSFORM_OPTION_KEYS, type TransformOptions } from "./transform-options.js"
import { MAX_RECURSION_DEPTH } from "./constants.js"
import { buildProseView, splitAtIndices } from "./prose-view.js"
import { assertKnownOptionKeys } from "./utils.js"

/**
 * Same options as `transform()`, except `nbsp` defaults to `false`:
 * invisible U+00A0 characters written into Markdown source files break
 * grep/Ctrl+F matching. Pass `nbsp: true` explicitly to opt in.
 */
export type RemarkPunctilioOptions = TransformOptions

const PHRASING_CONTAINERS = new Set(["paragraph", "heading", "tableCell"])

const SKIP_TYPES = new Set(["inlineCode", "html"])

// Leaf phrasing nodes that render atomic content and carry no transformable
// text. Between two text nodes, one is a real visual separator, so the
// flattener records an opaque gap there (mirroring skipped `inlineCode`/`html`).
const OPAQUE_LEAF_TYPES = new Set([
  "image", "imageReference", "break", "footnoteReference", "inlineMath",
])

interface ProseCollector {
  nodes: Text[]
  opaqueBefore: Set<number>
  // An opaque node was dropped since the last emitted text node; the next
  // emitted node records an opaque gap before it.
  pendingOpaque: boolean
}

function collectProse(node: PhrasingContent, depth: number, c: ProseCollector): void {
  /* istanbul ignore if -- defensive: prevents stack overflow from malicious nesting */
  if (depth > MAX_RECURSION_DEPTH) {
    return
  }

  if (SKIP_TYPES.has(node.type) || OPAQUE_LEAF_TYPES.has(node.type)) {
    c.pendingOpaque = true
    return
  }

  if (node.type === "text") {
    if (c.pendingOpaque && c.nodes.length > 0) c.opaqueBefore.add(c.nodes.length)
    c.pendingOpaque = false
    c.nodes.push(node)
    return
  }

  if ("children" in node) {
    for (const child of node.children as PhrasingContent[]) collectProse(child, depth + 1, c)
  }
}

function flattenProse(children: readonly PhrasingContent[]): { nodes: Text[]; opaqueBefore: Set<number> } {
  const c: ProseCollector = { nodes: [], opaqueBefore: new Set(), pendingOpaque: false }
  for (const child of children) collectProse(child, 0, c)
  return { nodes: c.nodes, opaqueBefore: c.opaqueBefore }
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

      const { nodes, opaqueBefore } = flattenProse(node.children as PhrasingContent[])

      // Split at opaque gaps (inline code, images, breaks) so no pass rewrites
      // text as adjacent across content that visually separates it.
      for (const group of splitAtIndices(nodes, opaqueBefore)) {
        transformView(buildProseView(group), pluginOptions)
      }
    })
  }
}

export default remarkPunctilio
