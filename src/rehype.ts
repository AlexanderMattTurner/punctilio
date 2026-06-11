import type { Element, ElementContent, Parent, Root, RootContent, Text } from "hast"
import type { Transformer } from "unified"

import { SKIP, visitParents } from "unist-util-visit-parents"

import { transformView } from "./index.js"
import { TRANSFORM_OPTION_KEYS, type TransformOptions } from "./transform-options.js"
import { MAX_RECURSION_DEPTH } from "./constants.js"
import { assertKnownOptionKeys, formatErrorString } from "./utils.js"
import { buildProseView, type ProsePass, type ProseView } from "./prose-view.js"

export type ElementPredicate = (node: Element) => boolean

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

  /**
   * Invert the element model: transform text inside every element except the
   * skip-list (`skipTags`/`skipClasses`) plus `textarea`/`input`/`select`,
   * whose text is a literal form-control value rather than prose. The default
   * (`false`) keeps the `TRANSFORMABLE_ELEMENTS` allowlist, transforming only
   * known prose-bearing tags (and custom elements).
   *
   * Default: false
   */
  transformAllElements?: boolean
}

const DEFAULT_SKIP_TAGS = ["code", "pre", "script", "style", "kbd", "var", "samp", "template", "math", "svg"]

// Form elements whose text content is a literal control value, not prose.
// Hard-skipped (whole subtree) under `transformAllElements`, on top of the
// user skip-list, so their values are protected even when nested inside a
// transformable element.
const FORM_VALUE_TAGS = ["textarea", "input"]

// `<select>` is not prose itself, but its `<option>` children are (and are
// transformed under the default allowlist). Under `transformAllElements` we
// exclude `select` as a transform *unit* while still recursing into — and
// transforming — its options, so the inverted mode never transforms less than
// the allowlist.
const NON_PROSE_CONTAINER_TAGS = new Set(["select"])

/** Option keys handled by `rehypePunctilio` itself rather than `transform()`. */
export const REHYPE_ONLY_OPTION_KEYS: readonly string[] = ["skipTags", "skipClasses", "shouldSkipText", "transformAllElements"]

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

export interface ProseViewOfOptions extends ElementTransformOptions {
  /** Element-level skip predicate; skipped subtrees contribute no text nodes. */
  shouldSkip?: ElementPredicate
}

/**
 * Builds a ProseView over the element's transformable text nodes, honoring
 * the element-level `shouldSkip` and per-text-node `shouldSkipText`
 * predicates. Returns null when the element holds no transformable text.
 */
export function proseViewOf(element: Element, options: ProseViewOfOptions = {}): ProseView | null {
  /* istanbul ignore if -- defensive: elements should always have children array */
  if (!element?.children) {
    return null
  }

  const shouldSkip = options.shouldSkip ?? (() => false)
  const textNodes = flattenTextNodes(element, shouldSkip, options)
  if (textNodes.length === 0) {
    return null
  }

  return buildProseView(textNodes)
}

/**
 * One entry in an `applyPasses` sequence: a bare pass, or a pass with its own
 * skip predicates layered on top of the base options (the per-transform
 * skip-set case, e.g. a fractions pass that additionally skips `<a>`).
 */
export type PassEntry =
  | ProsePass
  | { pass: ProsePass; shouldSkip?: ElementPredicate; shouldSkipText?: TextNodeSkipPredicate }

interface ResolvedPassEntry {
  pass: ProsePass
  shouldSkip?: ElementPredicate
  shouldSkipText?: TextNodeSkipPredicate
}

function resolvePassEntry(entry: PassEntry): ResolvedPassEntry {
  return typeof entry === "function" ? { pass: entry } : entry
}

/** OR-combines an optional entry predicate onto an optional base predicate. */
function mergePredicates<Args extends unknown[]>(
  base: ((...args: Args) => boolean) | undefined,
  extra: ((...args: Args) => boolean) | undefined,
): ((...args: Args) => boolean) | undefined {
  if (!base) return extra
  if (!extra) return base
  return (...args) => base(...args) || extra(...args)
}

/**
 * Runs `passes` in order over `element`'s transformable text, owning the
 * ProseView lifecycle so callers never touch a view directly. Each pass
 * commits its edits before the next runs, so passes see each other's
 * committed output — the same sequencing `transform()`'s pipeline uses.
 *
 * Entries whose predicates match the previous entry's share one view;
 * an entry with different `shouldSkip`/`shouldSkipText` predicates gets a
 * fresh view (built after the previous pass committed) over the text nodes
 * that survive both the base `options` predicates and its own.
 */
export function applyPasses(
  element: Element,
  passes: readonly PassEntry[],
  options: ProseViewOfOptions = {},
): void {
  let currentView: ProseView | null = null
  let currentPredicates: Pick<ResolvedPassEntry, "shouldSkip" | "shouldSkipText"> | null = null

  for (const entry of passes) {
    const { pass, shouldSkip, shouldSkipText } = resolvePassEntry(entry)

    const samePredicates =
      currentPredicates !== null &&
      currentPredicates.shouldSkip === shouldSkip &&
      currentPredicates.shouldSkipText === shouldSkipText
    if (!samePredicates) {
      currentView = proseViewOf(element, {
        shouldSkip: mergePredicates(options.shouldSkip, shouldSkip),
        shouldSkipText: mergePredicates(options.shouldSkipText, shouldSkipText),
      })
      currentPredicates = { shouldSkip, shouldSkipText }
    }

    // No transformable text under this entry's predicates; later entries may
    // still see text (their skip sets differ), so keep going.
    if (currentView === null) {
      continue
    }

    pass(currentView)
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
  "title",
  "button",
  "option",
  "output",
])

// A tag name containing "-" is a custom element per the HTML custom-element
// naming rule; assume those hold transformable prose like built-in elements.
function isTransformableElement(tagName: string): boolean {
  return TRANSFORMABLE_ELEMENTS.has(tagName) || tagName.includes("-")
}

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

export interface CollectProseBlocksOptions {
  /**
   * HTML tag names to skip. Default: the plugin's default skip list
   * ("code", "pre", "script", ...).
   */
  skipTags?: string[]
  /** CSS class names whose elements (and their subtrees) are skipped. Default: [] */
  skipClasses?: string[]
  /** Additional element-level skip predicate, OR-ed with the tag/class skips. */
  shouldSkip?: ElementPredicate
  /** Invert the element model as in {@link RehypePunctilioOptions.transformAllElements}. Default: false */
  transformAllElements?: boolean
}

/** Skip predicate and transformable-tag test resolved from the options. */
interface ResolvedCollectOptions {
  shouldSkip: ElementPredicate
  isTransformable: (tagName: string) => boolean
}

function resolveCollectOptions(options: CollectProseBlocksOptions): ResolvedCollectOptions {
  const { skipTags = DEFAULT_SKIP_TAGS, skipClasses = [], shouldSkip, transformAllElements = false } = options

  // In inverted mode, form-value elements join the skip-list so their literal
  // values are neither transformed nor flattened into a transformable ancestor.
  const skipTagSet = new Set(transformAllElements ? [...skipTags, ...FORM_VALUE_TAGS] : skipTags)
  const skipClassSet = new Set(skipClasses)

  const hasSkipClass = (node: Element): boolean => {
    if (skipClassSet.size === 0) return false
    const classNames = node.properties?.className
    const classes = Array.isArray(classNames)
      ? classNames.filter((c): c is string => typeof c === "string")
      : typeof classNames === "string" ? classNames.split(/\s+/) : []
    return classes.some((cls) => skipClassSet.has(cls))
  }

  return {
    shouldSkip: (node) =>
      skipTagSet.has(node.tagName) || hasSkipClass(node) || (shouldSkip?.(node) ?? false),
    // Inverted mode transforms every non-skipped element except non-prose
    // containers; the default keeps the `TRANSFORMABLE_ELEMENTS` allowlist
    // (plus custom elements).
    isTransformable: transformAllElements
      ? (tagName) => !NON_PROSE_CONTAINER_TAGS.has(tagName)
      : isTransformableElement,
  }
}

/**
 * Collects the elements under `root` (inclusive) whose text should be
 * transformed as one prose block: transformable elements with direct text or
 * inline-only text descendants. Elements with block-level children recurse so
 * each block transforms independently.
 */
export function collectProseBlocks(root: Element, options: CollectProseBlocksOptions = {}): Element[] {
  const { shouldSkip, isTransformable } = resolveCollectOptions(options)
  return collectProseBlocksImpl(root, shouldSkip, 0, undefined, isTransformable)
}

function collectProseBlocksImpl(
  node: Element,
  shouldSkip: ElementPredicate,
  depth: number,
  alreadyTransformed: ReadonlySet<Element> | undefined,
  isTransformable: (tagName: string) => boolean
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
    isTransformable(node.tagName) &&
    (hasDirectText || hasTextDescendants)
  ) {
    results.push(node)
  } else {
    // Recurse into children: either the node isn't transformable, has block
    // children that should be independent, or has no text to transform.
    for (const child of node.children) {
      if (child.type === "element") {
        const childResults = collectProseBlocksImpl(child, shouldSkip, depth + 1, alreadyTransformed, isTransformable)
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
    skipTags,
    skipClasses,
    shouldSkipText,
    transformAllElements,
    ...transformOptions
  } = options

  const { shouldSkip, isTransformable } = resolveCollectOptions({ skipTags, skipClasses, transformAllElements })

  // Allocate the per-element options object once; it's read-only inside
  // proseViewOf, so sharing across calls is safe and avoids a fresh
  // allocation per transformable element.
  const viewOptions: ProseViewOfOptions = shouldSkipText
    ? { shouldSkip, shouldSkipText }
    : { shouldSkip }

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
      const elementsToTransform = collectProseBlocksImpl(node, shouldSkip, 0, transformed, isTransformable)
      for (const elt of elementsToTransform) {
        if (!transformed.has(elt)) {
          const view = proseViewOf(elt, viewOptions)
          if (view !== null) {
            transformView(view, transformOptions)
          }
          transformed.add(elt)
          // Mark all descendants as processed since their text was included
          markDescendants(elt, transformed)
        }
      }
    })
  }
}

export default rehypePunctilio
