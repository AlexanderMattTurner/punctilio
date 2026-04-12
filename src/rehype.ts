/**
 * Rehype plugin for applying punctilio typography transformations to HTML.
 *
 * This plugin integrates punctilio with the unified/rehype ecosystem,
 * allowing you to apply smart typography transformations to HTML ASTs.
 *
 * @packageDocumentation
 */

import type { Root, Element, Text, ElementContent, Parent, RootContent } from "hast"
import type { Transformer } from "unified"

import { visitParents } from "unist-util-visit-parents"

import { transform, type TransformOptions } from "./index.js"
import { DEFAULT_SEPARATOR } from "./constants.js"
import { transformTextNodes, formatErrorString } from "./utils.js"

/** Predicate that decides whether an HTML element should be skipped during transformation. */
type ElementPredicate = (node: Element) => boolean

/** Function that transforms a plain-text string (e.g. smart quotes, dashes). */
type TextTransformer = (input: string) => string

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
 * Maximum recursion depth for tree traversal functions.
 * Prevents stack overflow from maliciously deep HTML nesting.
 */
const MAX_RECURSION_DEPTH = 1000

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
  predicate: ElementPredicate
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
 * @param depth - Current recursion depth (internal use)
 * @returns Array of Text nodes
 *
 * @example
 * ```ts
 * const textNodes = flattenTextNodes(paragraphElement, (el) => el.tagName === 'code')
 * ```
 */
export function flattenTextNodes(
  node: Element | ElementContent,
  shouldSkip: ElementPredicate,
  depth: number = 0
): Text[] {
  if (depth > MAX_RECURSION_DEPTH) {
    return []
  }

  if (node.type === "element" && shouldSkip(node)) {
    return []
  }

  if (node.type === "text") {
    return [node]
  }

  if (node.type === "element" && "children" in node) {
    return node.children.flatMap((child) => flattenTextNodes(child, shouldSkip, depth + 1))
  }

  return []
}

/**
 * Extracts concatenated text content from an element.
 *
 * @param node - The element to extract text from
 * @param shouldSkip - Optional function to determine which elements to skip
 * @returns The combined text content
 *
 * @example
 * ```ts
 * const text = getTextContent(paragraphElement)
 * // Returns "Hello, world!" for <p>Hello, <em>world!</em></p>
 * ```
 */
export function getTextContent(
  node: Element,
  shouldSkip: ElementPredicate = () => false
): string {
  return flattenTextNodes(node, shouldSkip)
    .map((n) => n.value)
    .join("")
}

/**
 * Recursively finds the first text node in a tree of HTML elements.
 *
 * @param node - The root node to search from
 * @param depth - Current recursion depth (internal use)
 * @returns The first text node found, or null if no text nodes exist
 *
 * @example
 * ```ts
 * const textNode = getFirstTextNode(divElement)
 * if (textNode) console.log(textNode.value)
 * ```
 */
export function getFirstTextNode(
  node: Parent | RootContent,
  depth: number = 0
): Text | null {
  if (!node || depth > MAX_RECURSION_DEPTH) return null

  if (node.type === "text" && "value" in node) {
    return node as Text
  }

  if ("children" in node && node.children.length > 0) {
    for (const child of node.children) {
      const textNode = getFirstTextNode(child as Parent, depth + 1)
      if (textNode) return textNode
    }
  }

  return null
}

/**
 * Validates that smart quotes in a text string are properly matched.
 *
 * @param input - The text to validate
 * @throws Error if quotes are mismatched
 *
 * @example
 * ```ts
 * assertSmartQuotesMatch('\u201CHello\u201D') // OK
 * assertSmartQuotesMatch('\u201CHello')        // throws Error
 * ```
 */
export function assertSmartQuotesMatch(input: string): void {
  if (!input) return

  const openers = new Set(["\u201C"])   // left double quote opens
  const closerToOpener: Record<string, string> = { "\u201D": "\u201C" }  // right closes left
  const stack: string[] = []

  for (const char of input) {
    if (openers.has(char)) {
      stack.push(char)
    } else if (char in closerToOpener) {
      if (stack.length > 0 && stack[stack.length - 1] === closerToOpener[char]) {
        stack.pop()
      } else {
        // Unmatched closer
        throw new Error(`Mismatched quotes in ${input}`)
      }
    }
  }

  if (stack.length > 0) {
    throw new Error(`Mismatched quotes in ${input}`)
  }
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
 * @param separator - The marker character to use (default: DEFAULT_SEPARATOR)
 * @param checkInvariance - Whether to verify that the transform produces the same
 *   result with and without markers. When true, checks that
 *   `stripMarkers(transform(textWithMarkers)) === transform(stripMarkers(text))`.
 *   Useful for debugging transforms that accidentally interact with markers.
 *   Default: false
 * @throws Error if transformation alters the number of text nodes
 * @throws Error if checkInvariance is true and the invariance check fails
 *
 * @example
 * ```ts
 * import { transformElement, DEFAULT_SEPARATOR } from 'punctilio/rehype'
 *
 * // Apply a custom transform to an element
 * transformElement(
 *   paragraphElement,
 *   (text) => text.replace(/eg\b/g, 'e.g.'),
 *   (el) => el.tagName === 'code',
 *   DEFAULT_SEPARATOR
 * )
 * ```
 */
export function transformElement(
  node: Element,
  transformFn: TextTransformer,
  shouldSkip: ElementPredicate,
  separator: string,
  checkInvariance: boolean = false
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

  // Capture marked content before transformation for invariance check
  const markedContent = checkInvariance
    ? textNodes.map((n) => n.value + separator).join("")
    : ""

  transformTextNodes(textNodes, transformFn, separator)

  if (checkInvariance) {
    const transformedContent = textNodes.map((n) => n.value + separator).join("")
    const stripSep = (s: string) => s.replaceAll(separator, "")
    const strippedTransformed = stripSep(transformedContent)
    const expected = transformFn(stripSep(markedContent))

    if (expected !== strippedTransformed) {
      throw new Error(
        `Transform invariance check failed: ` +
          `expected ${formatErrorString(expected, "expected")} ` +
          `but got ${formatErrorString(strippedTransformed, "actual")}`
      )
    }
  }
}

/**
 * HTML elements that can contain transformable text content.
 * We traverse into these to find text nodes to transform.
 */
const TRANSFORMABLE_ELEMENTS = new Set([
  "p",
  "em",
  "strong",
  "i",
  "b",
  "u",
  "s",
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
])

/**
 * Collects elements that should have text transformations applied.
 * Only collects elements that directly contain text nodes.
 *
 * @param node - The root element to search from
 * @param shouldSkip - Function to determine which elements to skip
 * @param depth - Current recursion depth (internal use)
 * @returns Array of elements that contain transformable text
 */
export function collectTransformableElements(
  node: Element,
  shouldSkip: ElementPredicate,
  depth: number = 0
): Element[] {
  /* istanbul ignore if -- defensive: prevents stack overflow from malicious HTML */
  if (depth > MAX_RECURSION_DEPTH) {
    return []
  }

  const results: Element[] = []

  if (shouldSkip(node)) {
    return []
  }

  // If this node is a transformable element with direct text children, collect it
  if (
    TRANSFORMABLE_ELEMENTS.has(node.tagName) &&
    node.children.some((child) => child.type === "text")
  ) {
    results.push(node)
  } else {
    // Otherwise, recurse into children
    for (const child of node.children) {
      if (child.type === "element") {
        const childResults = collectTransformableElements(child, shouldSkip, depth + 1)
        for (const r of childResults) results.push(r)
      }
    }
  }

  return results
}

/**
 * Recursively marks all element descendants as transformed.
 * Used to prevent redundant processing of nested elements whose text
 * was already processed as part of a parent element.
 */
function markDescendants(node: Element, set: Set<Element>, depth: number = 0): void {
  /* istanbul ignore if -- defensive: prevents stack overflow from malicious HTML */
  if (depth > MAX_RECURSION_DEPTH) {
    return
  }

  for (const child of node.children) {
    if (child.type === "element") {
      set.add(child)
      markDescendants(child, set, depth + 1)
    }
  }
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

  // Default idempotency check to false in plugin context — the separator
  // count check already guards against corruption, and the double-pass
  // penalty compounds across every block-level element.
  const pluginOptions = {
    checkIdempotency: false,
    ...transformOptions,
    separator,
  }

  const transformFn = (text: string): string => {
    return transform(text, pluginOptions)
  }

  return (tree: Root) => {
    // Track transformed elements to avoid double-processing
    const transformed = new Set<Element>()

    visitParents(tree, (node, ancestors) => {
      // Only process element nodes
      if (node.type !== "element") {
        return
      }

      const element = node as Element

      // Skip if already transformed
      if (transformed.has(element)) {
        return
      }

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
        if (!transformed.has(elt)) {
          transformElement(elt, transformFn, shouldSkip, separator)
          transformed.add(elt)
          // Mark all descendants as processed since their text was included
          markDescendants(elt, transformed)
        }
      }
    })
  }
}

export default rehypePunctilio
