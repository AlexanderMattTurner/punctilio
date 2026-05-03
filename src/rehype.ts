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

import { visitParents, SKIP } from "unist-util-visit-parents"

import { transform, type TransformOptions } from "./index.js"
import { DEFAULT_SEPARATOR, MAX_RECURSION_DEPTH } from "./constants.js"
import { transformTextNodes, formatErrorString } from "./utils.js"

/** Predicate that decides whether an HTML element should be skipped during transformation. */
type ElementPredicate = (node: Element) => boolean

/** Function that transforms a plain-text string (e.g. smart quotes, dashes). */
type TextTransformer = (input: string) => string

/**
 * Predicate that decides whether an individual text node should be excluded
 * from transformation. Called after element-level `shouldSkip`, so it is
 * never invoked for text inside elements that are already skipped.
 *
 * `ancestors` is the chain of Element parents for the text node, ordered
 * root first, nearest last.
 */
export type TextNodeSkipPredicate = (
  textNode: Text,
  ancestors: readonly Element[],
) => boolean

/**
 * Options shared by functions that flatten and transform text nodes inside
 * an element tree.
 */
export interface ElementTransformOptions {
  /**
   * Optional per-text-node skip predicate. When it returns `true` for a
   * given text node, that node is excluded from the flattened output, is
   * not passed to the transform function, and its `.value` is left
   * untouched. Applied after element-level `shouldSkip`.
   */
  shouldSkipText?: TextNodeSkipPredicate
}

/**
 * Options for the rehype-punctilio plugin.
 */
export interface RehypePunctilioOptions
  extends TransformOptions,
    ElementTransformOptions {
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
 * Flattens text nodes from an element tree into a single array.
 *
 * @param node - The element or element content to process
 * @param shouldSkip - Function to determine which elements to skip
 * @param options - Optional flattening options. Pass `shouldSkipText` to
 *   exclude individual text nodes from the result. Applied after
 *   element-level `shouldSkip`, so the hook is never invoked for text
 *   inside an already-skipped element.
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
  options?: ElementTransformOptions
): Text[] {
  const shouldSkipText = options?.shouldSkipText
  // Only track ancestors when shouldSkipText needs them, to avoid the
  // O(n²) allocation cost of copying the ancestor chain at every level.
  const ancestors: Element[] | null = shouldSkipText ? [] : null
  return flattenTextNodesImpl(node, shouldSkip, shouldSkipText, ancestors, 0)
}

function flattenTextNodesImpl(
  node: Element | ElementContent,
  shouldSkip: ElementPredicate,
  shouldSkipText: TextNodeSkipPredicate | undefined,
  ancestors: Element[] | null,
  depth: number
): Text[] {
  if (depth > MAX_RECURSION_DEPTH) {
    return []
  }

  if (node.type === "element" && shouldSkip(node)) {
    return []
  }

  if (node.type === "text") {
    // Snapshot ancestors at the callback boundary — the walker mutates the
    // shared array as it recurses, so handing it out directly would let a
    // caller observe a stale view if they captured the reference.
    if (shouldSkipText && ancestors && shouldSkipText(node, ancestors.slice())) {
      return []
    }
    return [node]
  }

  if (node.type === "element") {
    if (ancestors) ancestors.push(node)
    const result = node.children.flatMap((child) =>
      flattenTextNodesImpl(child, shouldSkip, shouldSkipText, ancestors, depth + 1)
    )
    if (ancestors) ancestors.pop()
    return result
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

  if (node.type === "text") {
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

const QUOTE_OPENERS = new Set(["\u201C"])
const CLOSER_TO_OPENER: Record<string, string> = { "\u201D": "\u201C" }

/**
 * Validates that smart double quotes in a text string are properly matched.
 *
 * Only checks double quotes (\u201C/\u201D). Single quotes are intentionally
 * excluded because \u2019 (right single quote) doubles as an apostrophe,
 * making balance-checking unreliable.
 *
 * @param input - The text to validate
 * @throws Error if double quotes are mismatched
 *
 * @example
 * ```ts
 * assertSmartQuotesMatch('\u201CHello\u201D') // OK
 * assertSmartQuotesMatch('\u201CHello')        // throws Error
 * ```
 */
export function assertSmartQuotesMatch(input: string): void {
  if (!input) return

  const stack: string[] = []

  for (const char of input) {
    if (QUOTE_OPENERS.has(char)) {
      stack.push(char)
    } else if (char in CLOSER_TO_OPENER) {
      if (stack.length > 0 && stack[stack.length - 1] === CLOSER_TO_OPENER[char]) {
        stack.pop()
      } else {
        throw new Error(`Mismatched quotes in ${formatErrorString(input, "input")}`)
      }
    }
  }

  if (stack.length > 0) {
    throw new Error(`Mismatched quotes in ${formatErrorString(input, "input")}`)
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
 * @param options - Optional transform options. Pass `shouldSkipText` here to
 *   opt individual text nodes out of transformation without skipping their
 *   enclosing element. Skipped text nodes keep their original `.value`.
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
  checkInvariance: boolean = false,
  options?: ElementTransformOptions
): void {
  /* istanbul ignore if -- defensive: elements should always have children array */
  if (!node?.children) {
    return
  }

  const textNodes = flattenTextNodes(node, shouldSkip, options)
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
 * HTML block-level elements. When a transformable element has a block-level
 * child, its children are processed independently rather than as a single
 * unit. This prevents merging text across semantically independent blocks
 * (e.g., separate paragraphs inside a div).
 */
const BLOCK_ELEMENTS = new Set([
  "address", "article", "aside", "blockquote", "details", "dialog",
  "dd", "div", "dl", "dt", "fieldset", "figcaption", "figure",
  "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6",
  "header", "hgroup", "hr", "li", "main", "nav", "ol",
  "p", "pre", "section", "table", "ul",
])

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
 * Checks whether an element has any text node descendants (skipping elements
 * matched by shouldSkip). Returns as soon as one is found — avoids allocating
 * an array of all text nodes just to check existence.
 */
function hasTextDescendant(
  node: Element | ElementContent,
  shouldSkip: ElementPredicate,
  depth: number = 0
): boolean {
  if (depth > MAX_RECURSION_DEPTH) {
    return false
  }

  if (node.type === "element" && shouldSkip(node)) {
    return false
  }

  if (node.type === "text") {
    return true
  }

  if (node.type === "element") {
    return node.children.some((child) => hasTextDescendant(child, shouldSkip, depth + 1))
  }

  return false
}

/**
 * Collects elements that should have text transformations applied.
 *
 * An element is collected as a single transformation unit when it:
 * 1. Has direct text children (original behavior), OR
 * 2. Has text descendants and NO block-level children — meaning all its
 *    content is inline (phrasing) and should share transformation context
 *    (e.g., `<p><em>"Hello</em><span>, world"</span></p>`).
 *
 * When an element has block-level children, we recurse so each block
 * is processed independently (e.g., `<div><p>A</p><p>B</p></div>`).
 *
 * @param node - The root element to search from
 * @param shouldSkip - Function to determine which elements to skip
 * @param depth - Current recursion depth (internal use)
 * @param alreadyTransformed - Elements already processed; skipped during traversal to avoid redundant work
 * @returns Array of elements that contain transformable text
 */
export function collectTransformableElements(
  node: Element,
  shouldSkip: ElementPredicate,
  depth: number = 0,
  alreadyTransformed?: ReadonlySet<Element>
): Element[] {
  /* istanbul ignore if -- defensive: prevents stack overflow from malicious HTML */
  if (depth > MAX_RECURSION_DEPTH) {
    return []
  }

  const results: Element[] = []

  if (shouldSkip(node) || alreadyTransformed?.has(node)) {
    return []
  }

  const hasDirectText = node.children.some((child) => child.type === "text")
  // Only check for block children and text descendants when there's no direct text
  // (short-circuit avoids unnecessary tree traversal)
  const hasBlockChildren = !hasDirectText && node.children.some(
    (child) => child.type === "element" && BLOCK_ELEMENTS.has(child.tagName)
  )
  const hasTextDescendants = !hasDirectText && !hasBlockChildren &&
    hasTextDescendant(node, shouldSkip)

  if (
    TRANSFORMABLE_ELEMENTS.has(node.tagName) &&
    (hasDirectText || hasTextDescendants)
  ) {
    results.push(node)
  } else {
    // Recurse into children: either the node isn't transformable, has block
    // children that should be independent, or has no text to transform.
    for (const child of node.children) {
      if (child.type === "element") {
        const childResults = collectTransformableElements(child, shouldSkip, depth + 1, alreadyTransformed)
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
    shouldSkipText,
    ...transformOptions
  } = options

  const skipTagSet = new Set(skipTags)
  const skipClassSet = new Set(skipClasses)

  const hasSkipClass = (node: Element): boolean => {
    if (skipClassSet.size === 0) return false
    const classNames = node.properties?.className
    const classes = Array.isArray(classNames)
      ? classNames.filter((c): c is string => typeof c === "string")
      : typeof classNames === "string" ? classNames.split(/\s+/) : []
    return classes.some((cls) => skipClassSet.has(cls))
  }

  const shouldSkip = (node: Element): boolean =>
    skipTagSet.has(node.tagName) || hasSkipClass(node)

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

  // Allocate the per-element options object once; it's read-only inside
  // transformElement, so sharing across calls is safe and avoids a fresh
  // allocation per transformable element.
  const elementOptions: ElementTransformOptions | undefined = shouldSkipText
    ? { shouldSkipText }
    : undefined

  return (tree: Root) => {
    // Track transformed elements to avoid double-processing
    const transformed = new Set<Element>()

    visitParents(tree, "element", (node) => {
      // Skip subtree if already transformed
      if (transformed.has(node)) {
        return SKIP
      }

      if (shouldSkip(node)) {
        return SKIP
      }

      // Collect and transform elements with text content
      const elementsToTransform = collectTransformableElements(node, shouldSkip, 0, transformed)
      for (const elt of elementsToTransform) {
        if (!transformed.has(elt)) {
          transformElement(elt, transformFn, shouldSkip, separator, false, elementOptions)
          transformed.add(elt)
          // Mark all descendants as processed since their text was included
          markDescendants(elt, transformed)
        }
      }
    })
  }
}

export default rehypePunctilio
