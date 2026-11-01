import type { Nodes, Root } from "mdast"
import remarkGfm from "remark-gfm"
import remarkParse from "remark-parse"
import { unified } from "unified"
import { visitParents } from "unist-util-visit-parents"

import { trimLineEdges } from "../markdown-source.js"
import { PHRASING_CONTAINERS, remarkPunctilio, type RemarkPunctilioOptions } from "../remark.js"

/** Each paragraph, heading, and table cell's non-empty text node values, in document order. */
function containerTexts(tree: Root): string[][] {
  const containers: string[][] = []
  visitParents(tree, (node: Nodes) => {
    if (!PHRASING_CONTAINERS.has(node.type)) return
    const values: string[] = []
    visitParents(node, "text", (text) => {
      if (text.value !== "") values.push(text.value)
    })
    containers.push(values)
  })
  return containers
}

/**
 * Per paragraph, heading, and table cell: the text remarkPunctilio produces
 * from the parsed `input` (`transformed`), the parsed text of `input` itself
 * (`original`), and the parsed text of `output` (`actual`).
 */
export function markdownTextOracle(input: string, output: string, options: RemarkPunctilioOptions = {}) {
  const processor = unified().use(remarkParse).use(remarkGfm).use(remarkPunctilio, options)
  const tree = processor.parse(input)
  const original = containerTexts(tree)
  processor.runSync(tree, input)
  return { transformed: containerTexts(tree), original, actual: containerTexts(processor.parse(output)) }
}

/** A container's text with node boundaries marked and line-edge spaces dropped. */
function comparable(values: readonly string[] | undefined): string | undefined {
  return values && trimLineEdges(values.join("\u0000"))
}

type Oracle = ReturnType<typeof markdownTextOracle>

/** Indices of the containers whose `actual` text is not one of `allowed`'s. */
function containersOutside(oracle: Oracle, allowed: readonly (keyof Oracle)[]): number[] {
  const count = Math.max(oracle.transformed.length, oracle.actual.length)
  return Array.from({ length: count }, (_, i) => i).filter(
    (i) => !allowed.some((key) => comparable(oracle.actual[i]) === comparable(oracle[key][i])),
  )
}

/** Indices of the containers whose `actual` text is neither the transformed nor the original text. */
export function containersOutsideOracle(oracle: Oracle): number[] {
  return containersOutside(oracle, ["transformed", "original"])
}

/** Indices of the containers whose `actual` text is not the transformed text. */
export function untransformedContainers(oracle: Oracle): number[] {
  return containersOutside(oracle, ["transformed"])
}
