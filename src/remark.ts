import type { Link, PhrasingContent, Root, Text } from "mdast"
import type { Transformer } from "unified"

import { type Token, Tokenizer } from "parse5"
import { visitParents } from "unist-util-visit-parents"

import { transformView } from "./index.js"
import { TRANSFORM_OPTION_KEYS, type TransformOptions } from "./transform-options.js"
import { MAX_RECURSION_DEPTH } from "./constants.js"
import { runAcrossOpaqueGaps } from "./prose-view.js"
import { DEFAULT_SKIP_TAGS, RAW_TEXT_FORM_TAG } from "./rehype.js"
import { assertKnownOptionKeys } from "./utils.js"

/**
 * Same options as `transform()`, except `nbsp` defaults to `false`:
 * invisible U+00A0 characters written into Markdown source files break
 * grep/Ctrl+F matching. Pass `nbsp: true` explicitly to opt in.
 */
export type RemarkPunctilioOptions = TransformOptions

const PHRASING_CONTAINERS = new Set(["paragraph", "heading", "tableCell"])

const SKIP_TYPES = new Set(["inlineCode", "html"])

const SKIPPED_HTML_TAGS: ReadonlySet<string> = new Set([...DEFAULT_SKIP_TAGS, RAW_TEXT_FORM_TAG])

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
  // Raw-HTML skip-list tags opened and not yet closed; everything between an
  // open tag and its close tag is skipped content.
  openSkippedTags: string[]
  // Markdown source the tree was parsed from; link positions index into it.
  source: string
}

const URL_SCHEMES = ["mailto:", "https://", "http://"]

/** `url` without a leading `mailto:`, `https://` or `http://`, in any letter case. */
function stripUrlScheme(url: string): string {
  const lowerCaseUrl = url.toLowerCase()
  const scheme = URL_SCHEMES.find((candidate) => lowerCaseUrl.startsWith(candidate))
  return scheme === undefined ? url : url.slice(scheme.length)
}

/** The Markdown source that produced `node`, or "" when it carries no usable position. */
function sourceOfLink(node: Link, source: string): string {
  const start = node.position?.start.offset
  const end = node.position?.end.offset
  return start === undefined || end === undefined ? "" : source.slice(start, end)
}

/**
 * True for an autolink or bare URL, whose visible text is the URL itself. A
 * link not written as `[text](url)` (an `<…>` autolink or a GFM literal) is one
 * by construction; a bracketed link is one when its text is its URL, with or
 * without the scheme.
 */
function isUrlTextLink(node: Link, source: string): boolean {
  const linkSource = sourceOfLink(node, source)
  if (linkSource !== "" && !linkSource.startsWith("[")) return true
  if (node.children.length !== 1 || node.children[0].type !== "text") return false
  return stripUrlScheme(node.children[0].value) === stripUrlScheme(node.url)
}

const ignoreToken = (): void => {}

/** Tracks raw-HTML skip-list tags so the text between an open and close tag is skipped. */
function trackSkippedHtmlTags(html: string, c: ProseCollector): void {
  const openTag = (token: Token.TagToken): void => {
    if (!token.selfClosing && SKIPPED_HTML_TAGS.has(token.tagName)) c.openSkippedTags.push(token.tagName)
  }
  const closeTag = (token: Token.TagToken): void => {
    const openIndex = c.openSkippedTags.lastIndexOf(token.tagName)
    if (openIndex !== -1) c.openSkippedTags.length = openIndex
  }
  const tokenizer = new Tokenizer(
    { sourceCodeLocationInfo: false },
    {
      onComment: ignoreToken,
      onDoctype: ignoreToken,
      onStartTag: openTag,
      onEndTag: closeTag,
      onEof: ignoreToken,
      onCharacter: ignoreToken,
      onNullCharacter: ignoreToken,
      onWhitespaceCharacter: ignoreToken,
    }
  )
  tokenizer.write(html, true)
}

function collectProse(node: PhrasingContent, depth: number, c: ProseCollector): void {
  /* istanbul ignore if -- defensive: prevents stack overflow from malicious nesting */
  if (depth > MAX_RECURSION_DEPTH) {
    return
  }

  if (node.type === "html") trackSkippedHtmlTags(node.value, c)

  if (
    SKIP_TYPES.has(node.type) ||
    OPAQUE_LEAF_TYPES.has(node.type) ||
    c.openSkippedTags.length > 0 ||
    (node.type === "link" && isUrlTextLink(node, c.source))
  ) {
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

function flattenProse(children: readonly PhrasingContent[], source: string): { nodes: Text[]; opaqueBefore: Set<number> } {
  const c: ProseCollector = { nodes: [], opaqueBefore: new Set(), pendingOpaque: false, openSkippedTags: [], source }
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

  // `file` is absent when the transformer is called with a bare tree (the
  // Prettier plugin); links are then judged by their text alone.
  return (tree: Root, file?: { toString(): string }) => {
    const source = file?.toString() ?? ""
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

      const { nodes, opaqueBefore } = flattenProse(node.children as PhrasingContent[], source)

      // Opaque gaps (inline code, images, breaks) become placeholders, so
      // quotes pair across them while no pass rewrites text through them.
      runAcrossOpaqueGaps(nodes, opaqueBefore, (view) => transformView(view, pluginOptions))
    })
  }
}

export default remarkPunctilio
