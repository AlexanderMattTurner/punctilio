import type { Nodes, Parents, Root, RootContent, Text } from "mdast"

import { diffArrays, diffChars } from "diff"
import { parse, postprocess, preprocess } from "micromark"
import { gfm } from "micromark-extension-gfm"
import { decodeString } from "micromark-util-decode-string"
import { visitParents } from "unist-util-visit-parents"

import { PHRASING_CONTAINERS } from "./remark.js"

/** @internal */
export interface SourceRange {
  readonly start: number
  readonly end: number
}

/** A token that contributes `text` to a text node's value. @internal */
export interface SourcePiece extends SourceRange {
  readonly text: string
  /** Whether `text` is the source slice itself, one character per character. */
  readonly literal: boolean
}

/** @internal */
export interface SourceEdit extends SourceRange {
  readonly text: string
}

/** Where each UTF-16 unit of a text value came from in the source. @internal */
export interface ValueSourceMap {
  readonly starts: readonly number[]
  readonly ends: readonly number[]
}

/**
 * Tokenize with micromark, the tokenizer underneath remark-parse, and keep the
 * tokens that mdast-util-from-markdown concatenates into text node values:
 * literal data, line endings, character escapes, and character references.
 * Container syntax (blockquote markers, indentation, hard-break markers) gets
 * its own tokens and so never appears among the pieces. Pieces come out in
 * ascending, non-overlapping source order. @internal
 */
export function tokenizeSource(source: string): SourcePiece[] {
  const chunks = preprocess()(source, undefined, true)
  const events = postprocess(parse({ extensions: [gfm()] }).document().write(chunks))
  const pieces: SourcePiece[] = []
  const open: string[] = []
  for (const [kind, token, context] of events) {
    if (kind === "enter") {
      open.push(token.type)
      continue
    }
    open.pop()
    const range = { start: token.start.offset, end: token.end.offset }
    const raw = context.sliceSerialize(token)
    switch (token.type) {
      case "lineEnding":
        // The line ending before a setext underline closes the heading text.
        if (open.at(-1) === "setextHeading") break
        pieces.push({ ...range, text: raw, literal: true })
        break
      case "data":
        pieces.push({ ...range, text: raw, literal: true })
        break
      case "characterEscape":
        pieces.push({ ...range, text: raw.slice(1), literal: false })
        break
      case "characterReference":
        pieces.push({ ...range, text: decodeString(raw), literal: false })
        break
    }
  }
  return pieces
}

/** Expand pieces into a per-unit source map, checking that they spell `value`. @internal */
export function mapValueToSource(value: string, pieces: readonly SourcePiece[]): ValueSourceMap {
  const tokenized = pieces.map((piece) => piece.text).join("")
  if (tokenized !== value) {
    throw new Error(`Markdown tokens ${JSON.stringify(tokenized)} do not match text ${JSON.stringify(value)}`)
  }
  const starts: number[] = []
  const ends: number[] = []
  for (const piece of pieces) {
    for (let unit = 0; unit < piece.text.length; unit++) {
      starts.push(piece.literal ? piece.start + unit : piece.start)
      ends.push(piece.literal ? piece.start + unit + 1 : piece.end)
    }
  }
  return { starts, ends }
}

/**
 * Restrict a literal piece to a text node's range. mdast-util-from-markdown
 * trims some data at node edges (the space after a GFM task-list checkbox)
 * by moving the node's start offset into the token. @internal
 */
export function clipPiece(piece: SourcePiece, range: SourceRange): SourcePiece {
  if (!piece.literal) return piece
  const start = Math.max(piece.start, range.start)
  const end = Math.min(piece.end, range.end)
  return { start, end, text: piece.text.slice(start - piece.start, end - piece.start), literal: true }
}

/** Index of the first piece ending after `offset`. */
function firstPieceEndingAfter(pieces: readonly SourcePiece[], offset: number): number {
  let low = 0
  let high = pieces.length
  while (low < high) {
    const mid = (low + high) >>> 1
    if (pieces[mid].end <= offset) low = mid + 1
    else high = mid
  }
  return low
}

/** Pieces overlapping `range`, clipped to it. @internal */
export function piecesIn(pieces: readonly SourcePiece[], range: SourceRange): SourcePiece[] {
  const inRange: SourcePiece[] = []
  for (let i = firstPieceEndingAfter(pieces, range.start); i < pieces.length && pieces[i].start < range.end; i++) {
    inRange.push(clipPiece(pieces[i], range))
  }
  return inRange
}

/**
 * Where to insert text before unit `index` of `original`: right after the
 * previous unit, so whitespace the parser trimmed before a line break stays
 * trailing, except after a line break, where the next line's container prefix
 * must stay first.
 */
function insertionPoint({ starts, ends }: ValueSourceMap, original: string, index: number): number {
  if (index === 0) return starts[0]
  return original[index - 1] === "\n" && index < starts.length ? starts[index] : ends[index - 1]
}

/**
 * The pieces at the end of `range` that supply its last `length` units. A run
 * of nodes without positions fills the end of its gap, but a setext heading's
 * range can open with link reference definitions and a task-list item's with
 * its checkbox. @internal
 */
export function trailingPieces(pieces: readonly SourcePiece[], range: SourceRange, length: number): SourcePiece[] {
  const inRange = piecesIn(pieces, range)
  let first = inRange.length
  let remaining = length
  while (first > 0 && remaining > 0) remaining -= inRange[--first].text.length
  const window = inRange.slice(first)
  if (remaining < 0) window[0] = clipPiece(window[0], { start: window[0].start - remaining, end: window[0].end })
  return window
}

const LEADING_LINE_BREAK_RE = /^\r?\n/

/** Source edits that turn a text value into `transformed`, in ascending order. @internal */
export function textNodeEdits(map: ValueSourceMap, original: string, transformed: string): SourceEdit[] {
  const { starts, ends } = map
  const edits: SourceEdit[] = []
  const changes = diffChars(original, transformed)
  let valueIndex = 0
  for (let i = 0; i < changes.length; i++) {
    const change = changes[i]
    if (change.added) {
      const position = insertionPoint(map, original, valueIndex)
      edits.push({ start: position, end: position, text: change.value })
      continue
    }
    const after = valueIndex + change.value.length
    if (change.removed) {
      const next = changes[i + 1]
      const replacement = next?.added ? next.value : ""
      if (next?.added) i++
      // A removed line break takes the trimmed whitespace before it and the
      // next line's container prefix with it.
      const start = LEADING_LINE_BREAK_RE.test(change.value) && valueIndex > 0 ? ends[valueIndex - 1] : starts[valueIndex]
      const end = change.value.endsWith("\n") && after < starts.length ? starts[after] : ends[after - 1]
      edits.push({ start, end, text: replacement })
    }
    valueIndex = after
  }
  return edits
}

/** A node's source offsets, if the parser recorded them. @internal */
export function sourceRange(node: Nodes | undefined): SourceRange | undefined {
  const start = node?.position?.start.offset
  const end = node?.position?.end.offset
  return start === undefined || end === undefined ? undefined : { start, end }
}

/** The innermost paragraph, heading, or table cell holding `node` (or `node` itself), else the root. */
function containerOf(tree: Root, ancestors: readonly Parents[], node: Nodes): Nodes {
  let container: Nodes = tree
  for (const candidate of [...ancestors, node]) if (PHRASING_CONTAINERS.has(candidate.type)) container = candidate
  return container
}

/**
 * Text nodes whose concatenated values come from the pieces inside `range`:
 * one positioned text node, or a run of siblings without positions.
 */
interface TextGroup {
  readonly texts: readonly Text[]
  readonly range: SourceRange
  readonly container: Nodes
}

/** The text nodes inside a run of siblings, in document order. */
function textsIn(run: readonly RootContent[]): Text[] {
  const texts: Text[] = []
  for (const member of run) {
    visitParents(member, "text", (node: Text) => {
      texts.push(node)
    })
  }
  return texts
}

/** A GFM bare URL or email, which ends where the next character stops looking like one. */
interface BareLink {
  readonly range: SourceRange
  readonly url: string
  readonly text: string
  readonly container: Nodes
}

/** The values of every text node under `nodes`, concatenated. */
function textOf(nodes: readonly RootContent[]): string {
  return textsIn(nodes).map((text) => text.value).join("")
}

/** Source ranges of the links in a run of siblings without positions, via the run's pieces. */
function runLinks(run: readonly RootContent[], range: SourceRange, pieces: readonly SourcePiece[], container: Nodes): BareLink[] {
  const { starts, ends } = mapValueToSource(textOf(run), piecesIn(pieces, range))
  const links: BareLink[] = []
  let offset = 0
  for (const member of run) {
    const text = textOf([member])
    if (member.type === "link") {
      links.push({ range: { start: starts[offset], end: ends[offset + text.length - 1] }, url: member.url, text, container })
    }
    offset += text.length
  }
  return links
}

/**
 * Every text node, grouped by the source range its value comes from, and
 * every bare link. GFM's autolink-literal transform splits a parsed text node
 * into text and link nodes without positions, so such a run occupies exactly
 * the gap between its positioned neighbors (or its parent's bounds).
 */
function locateText(tree: Root, source: string, pieces: readonly SourcePiece[]): { groups: TextGroup[]; links: BareLink[] } {
  const groups: TextGroup[] = []
  const links: BareLink[] = []
  visitParents(tree, (node: Root | RootContent, ancestors: Parents[]) => {
    const range = sourceRange(node)
    if (!range) return
    const container = containerOf(tree, ancestors, node)
    if (node.type === "text") groups.push({ texts: [node], range, container })
    if (node.type === "link" && !"[<".includes(source[range.start])) {
      links.push({ range, url: node.url, text: textOf([node]), container })
    }
    if (!("children" in node)) return
    const children: readonly RootContent[] = (node as Parents).children
    for (let i = 0; i < children.length; i++) {
      if (sourceRange(children[i])) continue
      const runStart = i
      while (i < children.length && !sourceRange(children[i])) i++
      const gap = {
        start: sourceRange(children[runStart - 1])?.end ?? range.start,
        end: sourceRange(children[i])?.start ?? range.end,
      }
      const run = children.slice(runStart, i)
      const [first] = trailingPieces(pieces, gap, textOf(run).length)
      const runRange = { start: first.start, end: gap.end }
      groups.push({ texts: textsIn(run), range: runRange, container })
      links.push(...runLinks(run, runRange, pieces, container))
    }
  })
  return { groups: groups.sort((a, b) => a.range.start - b.range.start), links }
}

const LINK_TEXT_SYNTAX_RE = /[[\\\]]/g

/**
 * Edits that write a bare link in explicit syntax with the same URL and text,
 * so the characters around it cannot extend it: `<url>` for a URL or email,
 * `[text](url)` for a `www.` link, its text rewritten with brackets and
 * backslashes escaped.
 */
function delimitLink({ range, url, text }: BareLink): [SourceEdit, SourceEdit] {
  if (url === text || url === `mailto:${text}`) {
    return [{ start: range.start, end: range.start, text: "<" }, { start: range.end, end: range.end, text: ">" }]
  }
  return [
    { start: range.start, end: range.end, text: `[${text.replace(LINK_TEXT_SYNTAX_RE, "\\$&")}` },
    { start: range.end, end: range.end, text: `](${url})` },
  ]
}

/** Edits for every changed text node in `group`, given each node's value before the transform. */
function groupEdits(group: TextGroup, originals: readonly string[], pieces: readonly SourcePiece[]): SourceEdit[] {
  if (group.texts.every((node, index) => node.value === originals[index])) return []
  const { starts, ends } = mapValueToSource(originals.join(""), piecesIn(pieces, group.range))
  const edits: SourceEdit[] = []
  let offset = 0
  group.texts.forEach((node, index) => {
    const original = originals[index]
    const nodeMap = { starts: starts.slice(offset, offset + original.length), ends: ends.slice(offset, offset + original.length) }
    offset += original.length
    if (node.value !== original) edits.push(...textNodeEdits(nodeMap, original, node.value))
  })
  return edits
}

/** `source` with ascending, non-overlapping `edits` applied. */
function applyEdits(source: string, edits: readonly SourceEdit[]): string {
  let result = ""
  let cursor = 0
  for (const edit of edits) {
    /* istanbul ignore if -- defensive: text groups are disjoint and links are opaque, so edits never overlap */
    if (edit.start < cursor) throw new Error(`Overlapping Markdown edits at offset ${edit.start}`)
    result += source.slice(cursor, edit.start) + edit.text
    cursor = edit.end
  }
  return result + source.slice(cursor)
}

/** A node in document order, with its value before the transform if it is text. */
interface NodeEntry {
  readonly key: string
  readonly container: Nodes
  readonly text: Text | undefined
  readonly original: string
}

const UNKEYED_FIELDS: ReadonlySet<string> = new Set(["children", "position", "data"])

/**
 * Every node of `tree` in document order, keyed by its depth and its fields
 * (type, URL, heading depth, list kind, code value, …), a text node's value
 * aside.
 */
function nodeEntries(tree: Root): NodeEntry[] {
  const entries: NodeEntry[] = []
  visitParents(tree, (node: Root | RootContent, ancestors: Parents[]) => {
    const text = node.type === "text" ? node : undefined
    const fields = JSON.stringify(node, (field: string, value: unknown) =>
      UNKEYED_FIELDS.has(field) || (field === "value" && text !== undefined) ? undefined : value)
    entries.push({
      key: `${ancestors.length} ${fields}`,
      container: containerOf(tree, ancestors, node),
      text,
      original: text?.value ?? "",
    })
  })
  return entries
}

const isSpaceOrTab = (character: string): boolean => character === " " || character === "\t"

/**
 * `value` without spaces and tabs at the edges of its lines, which the parser
 * trims (they never render), so one punctilio places there cannot survive a
 * re-parse. @internal
 */
export function trimLineEdges(value: string): string {
  return value
    .split("\n")
    .map((line) => {
      let start = 0
      let end = line.length
      while (start < end && isSpaceOrTab(line[start])) start++
      while (end > start && isSpaceOrTab(line[end - 1])) end--
      return line.slice(start, end)
    })
    .join("\n")
}

/**
 * One line per node: its key and, for text, its value as a parse would read
 * it: the original value in a `reverted` container, else the current one.
 * Empty text, which a parse never yields, is left out. `containers[i]` is the
 * paragraph, heading, or table cell holding line `i`.
 */
function signature(entries: readonly NodeEntry[], reverted: ReadonlySet<Nodes>): { lines: string[]; containers: Nodes[] } {
  const lines: string[] = []
  const containers: Nodes[] = []
  for (const { key, container, text, original } of entries) {
    if (text === undefined) {
      lines.push(key)
    } else {
      const value = reverted.has(container) ? original : text.value
      if (value === "") continue
      lines.push(`${key} ${trimLineEdges(value)}`)
    }
    containers.push(container)
  }
  return { lines, containers }
}

/**
 * Lines of `expected` where `actual` departs from it: the first line of each
 * run `actual` lacks, and the line just before each run `actual` adds (the
 * root's line always matches, so one exists).
 */
function mismatches(expected: readonly string[], actual: readonly string[]): number[] {
  const departures: number[] = []
  let index = 0
  for (const change of diffArrays([...expected], [...actual])) {
    if (change.added) {
      departures.push(index - 1)
      continue
    }
    if (change.removed) departures.push(index)
    index += change.count
  }
  return departures
}

/**
 * Run `transformTree` over `tree` (parsed from `source` by `parse`), then
 * return `source` with only the changed characters of each text node
 * replaced. Everything else (escapes, brackets, list markers, table
 * formatting, container prefixes) stays exactly as written. `transformTree`
 * may change text values only.
 *
 * Some edits cannot be written in place: a curly quote or em dash straight
 * after a bare URL joins the URL, and `x` → `×` beside `*` can stop it
 * delimiting emphasis. The output is re-parsed and checked against the
 * transformed tree. In a paragraph, heading, or table cell that parses
 * differently, bare links are written as explicit links, and if it still
 * parses differently, it keeps its source text. @internal
 */
export function spliceTextChanges(
  source: string,
  tree: Root,
  transformTree: (tree: Root) => void,
  parse: (markdown: string) => Root,
): string {
  const pieces = tokenizeSource(source)
  const { groups, links } = locateText(tree, source, pieces)
  const originals = groups.map(({ texts }) => texts.map((node) => node.value))
  const entries = nodeEntries(tree)
  transformTree(tree)

  const textEdits = groups.flatMap((group, index) =>
    groupEdits(group, originals[index], pieces).map((edit) => ({ edit, container: group.container, rank: EDIT_RANK.text })))
  const adjacentLinks = links.filter((link) => textEdits.some(({ edit }) => touchesLink(source, link, edit)))
  const linkEdits = adjacentLinks.flatMap((link) => {
    const [open, close] = delimitLink(link)
    return [
      { edit: open, container: link.container, rank: EDIT_RANK.openDelimiter },
      { edit: close, container: link.container, rank: EDIT_RANK.closeDelimiter },
    ]
  })
  const delimitable = new Set(adjacentLinks.map(({ container }) => container))
  const delimited = new Set<Nodes>()
  const reverted = new Set<Nodes>()
  // Each pass delimits each culprit's bare links beside an edit, or else
  // keeps the culprit as written. Reverting every container reproduces
  // `source`, which parses to the original text, so the loop ends.
  for (;;) {
    // Sorting is stable, so edits at one offset keep their source order.
    const kept = [...textEdits, ...linkEdits.filter(({ container }) => delimited.has(container))]
      .filter(({ container }) => !reverted.has(container))
      .sort((a, b) => a.edit.start - b.edit.start || a.rank - b.rank)
    const output = applyEdits(source, kept.map(({ edit }) => edit))
    const expected = signature(entries, reverted)
    const departures = mismatches(expected.lines, signature(nodeEntries(parse(output)), new Set()).lines)
    if (departures.length === 0) return output
    const candidates = new Set(kept.map(({ container }) => container))
    /* istanbul ignore if -- defensive: with every container reverted the output is `source`, unless `transformTree` changed more than text values */
    if (candidates.size === 0) throw new Error("punctilio's Markdown edits could not be reconciled with the source")
    for (const culprit of culpritContainers(candidates, expected.containers, departures)) {
      if (delimitable.has(culprit) && !delimited.has(culprit)) delimited.add(culprit)
      else reverted.add(culprit)
    }
  }
}

/**
 * Order of edits at one offset: a link's closing delimiter right after the
 * link, then text edits, then a link's opening delimiter right before it.
 */
const EDIT_RANK = { closeDelimiter: 0, text: 1, openDelimiter: 2 } as const

/**
 * Whether `edit` could join `link`: it ends where the link starts, or starts
 * where the link ends or further along the same run of non-whitespace.
 */
function touchesLink(source: string, { range }: BareLink, edit: SourceEdit): boolean {
  if (edit.end === range.start) return true
  if (edit.start < range.end) return false
  for (let offset = range.end; offset < edit.start; offset++) if (/\s/.test(source[offset])) return false
  return true
}

/**
 * The containers to repair where the parse departs from `containers`' lines
 * at each of `departures`: for each, the last candidate (a container with
 * edits still applied) starting at or before it, since every line before it
 * matched, else the first candidate. `candidates` is non-empty and in
 * source order.
 */
function culpritContainers(candidates: ReadonlySet<Nodes>, containers: readonly Nodes[], departures: readonly number[]): Set<Nodes> {
  const culprits = new Set<Nodes>()
  let [latest] = candidates
  const latestAt: Nodes[] = []
  for (const container of containers) {
    if (candidates.has(container)) latest = container
    latestAt.push(latest)
  }
  for (const departure of departures) culprits.add(latestAt[departure])
  return culprits
}
