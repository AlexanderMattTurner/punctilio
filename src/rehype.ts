/**
 * Rehype plugin for applying punctilio typography transformations to HTML.
 *
 * This plugin integrates punctilio with the unified/rehype ecosystem,
 * allowing you to apply smart typography transformations to HTML ASTs.
 *
 * @packageDocumentation
 */

import type { Root, Element, Text, ElementContent, Parent } from "hast"
import type { Transformer } from "unified"

import { visitParents } from "unist-util-visit-parents"

import { transform, type TransformOptions } from "./index.js"
import { DEFAULT_SEPARATOR } from "./constants.js"

/**
 * Options for the rehype-punctilio plugin.
 */
export interface RehypePunctilioOptions extends TransformOptions {
  /**
   * HTML tag names to skip when applying transformations.
   * Content inside these elements won't have formatting improvements applied.
   *
   * Default: ["code", "pre", "script", "style", "kbd", "var", "samp"]
   */
  skipTags?: string[]

  /**
   * CSS class names that indicate content should skip formatting.
   * Elements with any of these classes (or descendants of such elements)
   * will be skipped.
   *
   * Default: []
   */
  skipClasses?: string[]
}

const DEFAULT_SKIP_TAGS = ["code", "pre", "script", "style", "kbd", "var", "samp"]

/**
 * Check if an element has a specific CSS class.
 */
function hasClass(node: Element, className: string): boolean {
  const classNames = node.properties?.className
  if (Array.isArray(classNames)) {
    return classNames.includes(className)
  }
  /* istanbul ignore next -- rehype-parse always produces arrays, but handle strings defensively */
  if (typeof classNames === "string") {
    return classNames.split(/\s+/).includes(className)
  }
  return false
}

/**
 * Check if any ancestor of a node matches a predicate.
 */
function hasAncestor(
  ancestors: Parent[],
  predicate: (node: Element) => boolean
): boolean {
  return ancestors.some((ancestor) => {
    if (ancestor.type === "element") {
      return predicate(ancestor as Element)
    }
    return false
  })
}

/**
 * Flattens text nodes from an element tree into a single array.
 *
 * @param node - The element or element content to process
 * @param shouldSkip - Function to determine which elements to skip
 * @returns Array of Text nodes
 */
function flattenTextNodes(
  node: Element | ElementContent,
  shouldSkip: (n: Element) => boolean
): Text[] {
  if (node.type === "element" && shouldSkip(node)) {
    return []
  }

  if (node.type === "text") {
    return [node]
  }

  if (node.type === "element" && "children" in node) {
    return node.children.flatMap((child) => flattenTextNodes(child, shouldSkip))
  }

  return []
}

/**
 * Applies a transformation to element text content while preserving HTML structure.
 *
 * This function uses a marker technique to handle text that spans multiple
 * HTML elements. It:
 * 1. Appends a private-use Unicode character to each child's text content
 * 2. Concatenates and transforms the whole paragraph
 * 3. Splits the result back into the original text nodes
 *
 * @param node - The element to transform
 * @param transformFn - The transformation function to apply
 * @param shouldSkip - Function to determine which elements to skip
 * @param separator - The marker character to use
 * @throws Error if transformation alters the number of text nodes
 */
function transformElement(
  node: Element,
  transformFn: (input: string) => string,
  shouldSkip: (input: Element) => boolean,
  separator: string
): void {
  /* istanbul ignore if -- defensive: elements should always have children array */
  if (!node?.children) {
    return
  }

  const textNodes = flattenTextNodes(node, shouldSkip)
  /* istanbul ignore if -- only hit when element has no text descendants */
  if (textNodes.length === 0) {
    return
  }

  // Append marker and concatenate all text nodes
  const markedContent = textNodes.map((n) => n.value + separator).join("")

  const transformedContent = transformFn(markedContent)

  // Split and overwrite. Last fragment is always empty because strings end with marker
  const transformedFragments = transformedContent.split(separator).slice(0, -1)

  /* istanbul ignore if -- defensive: transform should never consume separator chars */
  if (transformedFragments.length !== textNodes.length) {
    throw new Error(
      `Transformation altered the number of text nodes. ` +
        `Expected ${textNodes.length}, got ${transformedFragments.length}. ` +
        `Input: ${JSON.stringify(markedContent)}`
    )
  }

  textNodes.forEach((n, index) => {
    n.value = transformedFragments[index]
  })
}

/**
 * HTML elements that can contain transformable text content.
 * We traverse into these to find text nodes to transform.
 */
const TRANSFORMABLE_ELEMENTS = [
  "p",
  "em",
  "strong",
  "i",
  "b",
  "sub",
  "sup",
  "small",
  "del",
  "ins",
  "mark",
  "span",
  "div",
  "td",
  "th",
  "dt",
  "dd",
  "li",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "figcaption",
  "blockquote",
  "cite",
  "q",
  "a",
  "label",
  "legend",
  "caption",
  "summary",
  "address",
  "article",
  "aside",
  "footer",
  "header",
  "main",
  "nav",
  "section",
  "time",
  "abbr",
  "dfn",
  "data",
  "bdi",
  "bdo",
  "ruby",
  "rt",
  "rp",
  "wbr",
]

/**
 * Collects elements that should have text transformations applied.
 * Only collects elements that directly contain text nodes.
 *
 * @param node - The root element to search from
 * @param shouldSkip - Function to determine which elements to skip
 * @returns Array of elements that contain transformable text
 */
function collectTransformableElements(
  node: Element,
  shouldSkip: (n: Element) => boolean
): Element[] {
  const results: Element[] = []

  if (shouldSkip(node)) {
    return []
  }

  // If this node is a transformable element with direct text children, collect it
  if (
    TRANSFORMABLE_ELEMENTS.includes(node.tagName) &&
    node.children.some((child) => child.type === "text")
  ) {
    results.push(node)
  } else {
    // Otherwise, recurse into children
    for (const child of node.children) {
      if (child.type === "element") {
        results.push(...collectTransformableElements(child, shouldSkip))
      }
    }
  }

  return results
}

/**
 * Rehype plugin that applies punctilio typography transformations to HTML.
 *
 * @param options - Plugin configuration options
 * @returns Unified transformer function
 *
 * @example
 * ```ts
 * import { unified } from 'unified'
 * import remarkParse from 'remark-parse'
 * import remarkRehype from 'remark-rehype'
 * import rehypeStringify from 'rehype-stringify'
 * import { rehypePunctilio } from 'punctilio/rehype'
 *
 * const result = await unified()
 *   .use(remarkParse)
 *   .use(remarkRehype)
 *   .use(rehypePunctilio, {
 *     punctuationStyle: 'american',
 *     dashStyle: 'american',
 *   })
 *   .use(rehypeStringify)
 *   .process('"Hello," she said -- "it\'s nice."')
 *
 * // Output HTML will have smart quotes and em-dashes
 * ```
 */
export function rehypePunctilio(
  options: RehypePunctilioOptions = {}
): Transformer<Root, Root> {
  const {
    skipTags = DEFAULT_SKIP_TAGS,
    skipClasses = [],
    separator = DEFAULT_SEPARATOR,
    ...transformOptions
  } = options

  const shouldSkip = (node: Element): boolean => {
    if (skipTags.includes(node.tagName)) {
      return true
    }
    if (skipClasses.some((cls) => hasClass(node, cls))) {
      return true
    }
    return false
  }

  const transformFn = (text: string): string => {
    return transform(text, { ...transformOptions, separator })
  }

  return (tree: Root) => {
    visitParents(tree, (node, ancestors) => {
      // Only process element nodes
      if (node.type !== "element") {
        return
      }

      const element = node as Element

      // Check if this node or any ancestor should be skipped
      if (shouldSkip(element)) {
        return
      }
      if (hasAncestor(ancestors as Parent[], shouldSkip)) {
        return
      }

      // Collect and transform elements with text content
      const elementsToTransform = collectTransformableElements(element, shouldSkip)
      for (const elt of elementsToTransform) {
        transformElement(elt, transformFn, shouldSkip, separator)
      }
    })
  }
}

export default rehypePunctilio
