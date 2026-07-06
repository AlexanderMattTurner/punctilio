import type { Element, ElementContent, Parent, Root, RootContent, Text } from "hast"
import type { Transformer } from "unified"

import { SKIP, visitParents } from "unist-util-visit-parents"

import { transformView } from "./index.js"
import { TRANSFORM_OPTION_KEYS, type TransformOptions } from "./transform-options.js"
import { MAX_RECURSION_DEPTH } from "./constants.js"
import { assertKnownOptionKeys, formatErrorString } from "./utils.js"
import { buildProseView, type ProsePass, type ProseView, splitAtIndices } from "./prose-view.js"

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

// Void/replaced inline elements that render atomic content (or a hard break)
// and carry no transformable text. When one sits between two text nodes it is a
// real visual separator, so the flattener records an opaque gap there.
const OPAQUE_VOID_TAGS = new Set([
  "img", "br", "wbr", "input", "hr", "embed",
  "area", "source", "track", "col", "param", "keygen",
])

/** Flattened text nodes plus the opaque gaps that fell between adjacent ones. */
export interface FlattenedProse {
  nodes: Text[]
  /** Indices into `nodes` (1..n-1) with removed opaque content immediately before them. */
  opaqueBefore: Set<number>
}

interface ProseCollector {
  nodes: Text[]
  opaqueBefore: Set<number>
  shouldSkip: ElementPredicate
  shouldSkipText: TextNodeSkipPredicate | undefined
  ancestors: Element[] | null
  // An opaque element was dropped since the last emitted text node; the next
  // emitted node records an opaque gap before it.
  pendingOpaque: boolean
}

function collectProse(node: Element | ElementContent, depth: number, c: ProseCollector): void {
  if (depth > MAX_RECURSION_DEPTH) {
    return
  }

  if (node.type === "element") {
    if (c.shouldSkip(node)) {
      // A skipped element with content is a visual separator; an empty one
      // renders nothing and leaves its neighbors genuinely adjacent.
      if (node.children.length > 0) c.pendingOpaque = true
      return
    }
    if (OPAQUE_VOID_TAGS.has(node.tagName)) {
      c.pendingOpaque = true
      return
    }
    if (c.ancestors) c.ancestors.push(node)
    for (const child of node.children) collectProse(child, depth + 1, c)
    if (c.ancestors) c.ancestors.pop()
    return
  }

  if (node.type === "text") {
    // Snapshot ancestors at the callback boundary — the walker mutates the
    // shared array as it recurses, so handing it out directly would let a
    // caller observe a stale view if they captured the reference.
    if (c.shouldSkipText && c.ancestors && c.shouldSkipText(node, c.ancestors.slice())) {
      // Preserved-but-untransformed text is a separator between its neighbors.
      c.pendingOpaque = true
      return
    }
    if (c.pendingOpaque && c.nodes.length > 0) c.opaqueBefore.add(c.nodes.length)
    c.pendingOpaque = false
    c.nodes.push(node)
  }
}

function newCollector(shouldSkip: ElementPredicate, options?: ElementTransformOptions): ProseCollector {
  const shouldSkipText = options?.shouldSkipText
  return {
    nodes: [],
    opaqueBefore: new Set(),
    shouldSkip,
    shouldSkipText,
    // Only track ancestors when shouldSkipText needs them, to avoid the
    // O(n²) allocation cost of copying the ancestor chain at every level.
    ancestors: shouldSkipText ? [] : null,
    pendingOpaque: false,
  }
}

/** Flattens an element's transformable text nodes, tracking opaque gaps. */
export function flattenProse(
  node: Element | ElementContent,
  shouldSkip: ElementPredicate,
  options?: ElementTransformOptions
): FlattenedProse {
  const c = newCollector(shouldSkip, options)
  collectProse(node, 0, c)
  return { nodes: c.nodes, opaqueBefore: c.opaqueBefore }
}

export function flattenTextNodes(
  node: Element | ElementContent,
  shouldSkip: ElementPredicate,
  options?: ElementTransformOptions
): Text[] {
  return flattenProse(node, shouldSkip, options).nodes
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
 * Builds a single ProseView over the element's transformable text nodes,
 * honoring the element-level `shouldSkip` and per-text-node `shouldSkipText`
 * predicates. Returns null when the element holds no transformable text. This
 * view spans opaque gaps; the transform pipeline uses {@link proseViewsOf},
 * which splits on them so no pass rewrites across removed atomic content.
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
 * Builds one ProseView per opaque-delimited segment of the element's text.
 * Splitting at opaque gaps (removed skipped elements, images, and other atomic
 * inline content) keeps their surrounding text in separate views, so a pass can
 * never treat text as adjacent across content that visually separates it.
 */
export function proseViewsOf(element: Element, options: ProseViewOfOptions = {}): ProseView[] {
  /* istanbul ignore if -- defensive: elements should always have children array */
  if (!element?.children) {
    return []
  }
  const shouldSkip = options.shouldSkip ?? (() => false)
  const { nodes, opaqueBefore } = flattenProse(element, shouldSkip, options)
  return splitAtIndices(nodes, opaqueBefore).map((group) => buildProseView(group))
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
  let currentViews: ProseView[] = []
  let currentPredicates: Pick<ResolvedPassEntry, "shouldSkip" | "shouldSkipText"> | null = null

  for (const entry of passes) {
    const { pass, shouldSkip, shouldSkipText } = resolvePassEntry(entry)

    const samePredicates =
      currentPredicates !== null &&
      currentPredicates.shouldSkip === shouldSkip &&
      currentPredicates.shouldSkipText === shouldSkipText
    if (!samePredicates) {
      currentViews = proseViewsOf(element, {
        shouldSkip: mergePredicates(options.shouldSkip, shouldSkip),
        shouldSkipText: mergePredicates(options.shouldSkipText, shouldSkipText),
      })
      currentPredicates = { shouldSkip, shouldSkipText }
    }

    // Each opaque-delimited segment is transformed independently; an entry with
    // no transformable text simply has no views to run over.
    for (const view of currentViews) {
      pass(view)
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

// A prose unit is either a whole transformable element (an inline-only leaf) or
// a "run" of consecutive inline siblings that sit alongside block-level
// children. Runs let a container's loose inline text transform independently of
// its block children instead of merging across the block boundary.
type ProseUnit =
  | { kind: "element"; element: Element }
  | { kind: "run"; container: Element; children: ElementContent[] }

/**
 * Collects the leaf elements under `root` (inclusive) whose text should be
 * transformed as one prose block: transformable elements with direct text or
 * inline-only text descendants. Elements with block-level children recurse so
 * each block transforms independently. Loose inline text mixed among block
 * children is handled by the plugin as its own run and is not represented here.
 */
export function collectProseBlocks(root: Element, options: CollectProseBlocksOptions = {}): Element[] {
  const { shouldSkip, isTransformable } = resolveCollectOptions(options)
  return collectProseUnitsImpl(root, shouldSkip, 0, undefined, isTransformable)
    .flatMap((unit) => (unit.kind === "element" ? [unit.element] : []))
}

function runHasProse(children: readonly ElementContent[], shouldSkip: ElementPredicate): boolean {
  return children.some(
    (child) =>
      (child.type === "text" && child.value.trim() !== "") ||
      (child.type === "element" && hasTextDescendant(child, shouldSkip))
  )
}

function collectProseUnitsImpl(
  node: Element,
  shouldSkip: ElementPredicate,
  depth: number,
  alreadyTransformed: ReadonlySet<Element> | undefined,
  isTransformable: (tagName: string) => boolean
): ProseUnit[] {
  /* istanbul ignore if -- defensive: prevents stack overflow from malicious HTML */
  if (depth > MAX_RECURSION_DEPTH) {
    return []
  }

  if (shouldSkip(node) || alreadyTransformed?.has(node)) {
    return []
  }

  // Whitespace-only text nodes between block siblings (the newlines a parser
  // leaves between <p>s inside a <blockquote>, <li>, or <div>) are not prose.
  // Counting them as direct text would make a block container look like a leaf
  // and merge its blocks into one transform unit, pairing quotes across the
  // paragraph boundary. Real (non-whitespace) direct text still marks a leaf.
  const hasDirectText = node.children.some(
    (child) => child.type === "text" && child.value.trim() !== ""
  )
  const hasBlockChildren = node.children.some(
    (child) => child.type === "element" && BLOCK_ELEMENTS.has(child.tagName)
  )

  // Inline-only transformable node: a single leaf unit. `hasTextDescendant` is
  // only walked when there's no direct text (short-circuit avoids the traversal).
  if (
    isTransformable(node.tagName) &&
    !hasBlockChildren &&
    (hasDirectText || hasTextDescendant(node, shouldSkip))
  ) {
    return [{ kind: "element", element: node }]
  }

  const units: ProseUnit[] = []
  if (isTransformable(node.tagName) && hasBlockChildren) {
    // Mixed content: split each maximal run of inline siblings from the block
    // children so loose text transforms on its own, then recurse per block.
    let run: ElementContent[] = []
    const flushRun = () => {
      if (runHasProse(run, shouldSkip)) units.push({ kind: "run", container: node, children: run })
      run = []
    }
    for (const child of node.children) {
      if (child.type === "element" && BLOCK_ELEMENTS.has(child.tagName)) {
        flushRun()
        for (const u of collectProseUnitsImpl(child, shouldSkip, depth + 1, alreadyTransformed, isTransformable)) {
          units.push(u)
        }
      } else {
        run.push(child)
      }
    }
    flushRun()
  } else {
    // Non-transformable, or transformable but textless: recurse into elements.
    for (const child of node.children) {
      if (child.type === "element") {
        for (const u of collectProseUnitsImpl(child, shouldSkip, depth + 1, alreadyTransformed, isTransformable)) {
          units.push(u)
        }
      }
    }
  }

  return units
}

// Flatten a run's inline siblings to their text nodes (with opaque gaps),
// seeding the ancestor chain with `container` so `shouldSkipText` sees the same
// ancestors it would when the whole element is flattened as a leaf.
function flattenRunProse(
  container: Element,
  children: readonly ElementContent[],
  shouldSkip: ElementPredicate,
  options: ProseViewOfOptions
): FlattenedProse {
  const c = newCollector(shouldSkip, options)
  if (c.ancestors) c.ancestors.push(container)
  for (const child of children) collectProse(child, 1, c)
  return { nodes: c.nodes, opaqueBefore: c.opaqueBefore }
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

      // Collect and transform every prose unit in this subtree.
      const units = collectProseUnitsImpl(node, shouldSkip, 0, transformed, isTransformable)
      for (const unit of units) {
        if (unit.kind === "element") {
          if (!transformed.has(unit.element)) {
            for (const view of proseViewsOf(unit.element, viewOptions)) {
              transformView(view, transformOptions)
            }
            transformed.add(unit.element)
            // Mark all descendants as processed since their text was included
            markDescendants(unit.element, transformed)
          }
        } else {
          const { nodes, opaqueBefore } = flattenRunProse(unit.container, unit.children, shouldSkip, viewOptions)
          for (const group of splitAtIndices(nodes, opaqueBefore)) {
            transformView(buildProseView(group), transformOptions)
          }
          // Mark the container so a later visit doesn't re-collect its runs,
          // and mark the run's inline-element members' subtrees.
          transformed.add(unit.container)
          for (const child of unit.children) {
            if (child.type === "element") {
              transformed.add(child)
              markDescendants(child, transformed)
            }
          }
        }
      }
    })
  }
}

export default rehypePunctilio
