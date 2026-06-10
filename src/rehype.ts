import type { Element, ElementContent, Parent, Root, RootContent, Text } from "hast"
import type { Transformer } from "unified"

import { SKIP, visitParents } from "unist-util-visit-parents"

import { transform, TRANSFORM_OPTION_KEYS, type TransformOptions } from "./index.js"
import { DEFAULT_SEPARATOR, MAX_RECURSION_DEPTH } from "./constants.js"
import { assertKnownOptionKeys, formatErrorString, transformTextNodes } from "./utils.js"

type ElementPredicate = (node: Element) => boolean

type TextTransformer = (input: string) => string

/** Per-text-node skip predicate, called after element-level `shouldSkip`. */
export type TextNodeSkipPredicate = (
  textNode: Text,
  ancestors: readonly Element[],
) => boolean

export interface ElementTransformOptions {
  /**
   * Optional per-text-node skip predicate. When it returns `true` for a
   * given text node, that node is excluded from the flattened output, is
   * not passed to the transform function, and its `.value` is left
   * untouched. Applied after element-level `shouldSkip`.
   */
  shouldSkipText?: TextNodeSkipPredicate
}

export interface RehypePunctilioOptions
  extends TransformOptions,
    ElementTransformOptions {
  /**
   * HTML tag names to skip when applying transformations.
   * Content inside these elements won't have formatting improvements applied.
   *
   * Default: ["code", "pre", "script", "style", "kbd", "var", "samp", "template", "math", "svg"]
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

const DEFAULT_SKIP_TAGS = ["code", "pre", "script", "style", "kbd", "var", "samp", "template", "math", "svg"]

/** Option keys handled by `rehypePunctilio` itself rather than `transform()`. */
export const REHYPE_ONLY_OPTION_KEYS: readonly string[] = ["skipTags", "skipClasses", "shouldSkipText"]

/** Runtime list of valid `rehypePunctilio` option keys. */
export const REHYPE_OPTION_KEYS: readonly string[] = [...TRANSFORM_OPTION_KEYS, ...REHYPE_ONLY_OPTION_KEYS]

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

export function getTextContent(
  node: Element,
  shouldSkip: ElementPredicate = () => false
): string {
  return flattenTextNodes(node, shouldSkip)
    .map((n) => n.value)
    .join("")
}

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

// Only checks double quotes \u2014 single quotes are excluded because
// U+2019 doubles as an apostrophe, making balance-checking unreliable.
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
 * Transforms element text using the separator-marking technique. When
 * `checkInvariance` is true, verifies `stripMarkers(transform(marked)) ===
 * transform(stripMarkers(text))` for debugging marker interactions.
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

// Block children cause per-block processing to avoid merging text across
// semantically independent blocks (e.g., separate <p>s inside a <div>).
const BLOCK_ELEMENTS = new Set([
  "address", "article", "aside", "blockquote", "details", "dialog",
  "dd", "div", "dl", "dt", "fieldset", "figcaption", "figure",
  "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6",
  "header", "hgroup", "hr", "li", "main", "nav", "ol",
  "p", "pre", "section", "table", "ul",
])

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
  "details",
  "dialog",
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

export function rehypePunctilio(
  options: RehypePunctilioOptions = {}
): Transformer<Root, Root> {
  assertKnownOptionKeys(options, REHYPE_OPTION_KEYS, "rehypePunctilio")

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
