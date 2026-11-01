import type { Nodes, Parents, Root, RootContent, Text } from "mdast"

import { type Change, diffArrays, diffChars } from "diff"
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

/** Index of the first of `items` (ordered so `isBefore` holds for a prefix) for which `isBefore` fails. */
function lowerBound<T>(items: readonly T[], isBefore: (item: T) => boolean): number {
  let low = 0
  let high = items.length
  while (low < high) {
    const mid = (low + high) >>> 1
    if (isBefore(items[mid])) low = mid + 1
    else high = mid
  }
  return low
}

/** Pieces overlapping `range`, clipped to it. @internal */
export function piecesIn(pieces: readonly SourcePiece[], range: SourceRange): SourcePiece[] {
  const inRange: SourcePiece[] = []
  for (let i = lowerBound(pieces, (piece) => piece.end <= range.start); i < pieces.length && pieces[i].start < range.end; i++) {
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

const WORD_RUN_RE = /[\p{L}\p{N}]+/gu

/** Each run of letters and digits in `value`, with its offset. */
function wordRuns(value: string): { text: string; start: number }[] {
  return Array.from(value.matchAll(WORD_RUN_RE), (match) => ({ text: match[0], start: match.index }))
}

// How far apart, in runs, two equal runs may sit and still resynchronize the
// match; punctilio's edits rewrite at most a few runs in a row.
const RUN_MATCH_WINDOW = 8

/**
 * Index pairs of equal runs, both ascending: equal runs pair in order, and
 * after a mismatch the nearest equal pair within {@link RUN_MATCH_WINDOW}
 * resumes the match. Runs past an unmatched stretch longer than that stay
 * unpaired.
 */
function matchRuns(original: readonly string[], transformed: readonly string[]): [number, number][] {
  const pairs: [number, number][] = []
  let i = 0
  let j = 0
  while (i < original.length && j < transformed.length) {
    const skip = nearestEqualPair(original, transformed, i, j)
    if (skip === undefined) break
    i += skip[0]
    j += skip[1]
    pairs.push([i++, j++])
  }
  return pairs
}

/** The smallest skip `[di, dj]` with `original[i + di] === transformed[j + dj]`, within the window. */
function nearestEqualPair(original: readonly string[], transformed: readonly string[], i: number, j: number): [number, number] | undefined {
  for (let distance = 0; distance <= RUN_MATCH_WINDOW; distance++) {
    for (let di = 0; di <= distance; di++) {
      if (original[i + di] !== undefined && original[i + di] === transformed[j + distance - di]) return [di, distance - di]
    }
  }
  return undefined
}

/**
 * The character diff of `original` and `transformed`. A diff of the whole
 * value is quadratic in a long, densely edited node, so its runs of letters
 * and digits (which punctilio's edits rarely touch) are paired first, and
 * only the stretches between paired runs are diffed character by character.
 */
function characterChanges(original: string, transformed: string): Change[] {
  const originalRuns = wordRuns(original)
  const transformedRuns = wordRuns(transformed)
  const changes: Change[] = []
  let originalEnd = 0
  let transformedEnd = 0
  const pairs = matchRuns(originalRuns.map(({ text }) => text), transformedRuns.map(({ text }) => text))
  for (const [originalIndex, transformedIndex] of pairs) {
    const run = originalRuns[originalIndex]
    const transformedRun = transformedRuns[transformedIndex]
    changes.push(
      ...diffChars(original.slice(originalEnd, run.start), transformed.slice(transformedEnd, transformedRun.start)),
      { value: run.text, count: run.text.length, added: false, removed: false },
    )
    originalEnd = run.start + run.text.length
    transformedEnd = transformedRun.start + transformedRun.text.length
  }
  return [...changes, ...diffChars(original.slice(originalEnd), transformed.slice(transformedEnd))]
}

/** Source edits that turn a text value into `transformed`, in ascending order. @internal */
export function textNodeEdits(map: ValueSourceMap, original: string, transformed: string): SourceEdit[] {
  const { starts, ends } = map
  const edits: SourceEdit[] = []
  const changes = characterChanges(original, transformed)
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
function runLinks(run: readonly RootContent[], runText: string, range: SourceRange, pieces: readonly SourcePiece[], container: Nodes): BareLink[] {
  const { starts, ends } = mapValueToSource(runText, piecesIn(pieces, range))
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
      const runText = textOf(run)
      const [first] = trailingPieces(pieces, gap, runText.length)
      const runRange = { start: first.start, end: gap.end }
      groups.push({ texts: textsIn(run), range: runRange, container })
      links.push(...runLinks(run, runText, runRange, pieces, container))
    }
  })
  return { groups: groups.sort((a, b) => a.range.start - b.range.start), links }
}

// Characters that would read as syntax inside `[text](url)`; the URL's
// destination decodes escapes and character references too.
const LINK_TEXT_SYNTAX_RE = /[&*<[\\\]_`~]/g
const LINK_DESTINATION_SYNTAX_RE = /[&()\\]/g

/**
 * Edits that write a bare link in explicit syntax with the same URL and text,
 * so the characters around it cannot extend it: `<url>` for a URL or email,
 * `[text](url)` for a `www.` link, its text and URL rewritten with their
 * syntax characters escaped.
 */
function delimitLink({ range, url, text }: BareLink): [SourceEdit, SourceEdit] {
  if (url === text || url === `mailto:${text}`) {
    return [{ start: range.start, end: range.start, text: "<" }, { start: range.end, end: range.end, text: ">" }]
  }
  return [
    { start: range.start, end: range.end, text: `[${text.replace(LINK_TEXT_SYNTAX_RE, "\\$&")}` },
    { start: range.end, end: range.end, text: `](${url.replace(LINK_DESTINATION_SYNTAX_RE, "\\$&")})` },
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

/** The parse of a document, one line per node. @internal */
export interface Signature {
  readonly lines: readonly string[]
  /** The paragraph, heading, or table cell holding each line, else the root. */
  readonly containers: readonly Nodes[]
}

/**
 * One line per node: its key and, for text, its value as a parse would read
 * it: the original value in a `reverted` container, else the current one.
 * Empty text, which a parse never yields, is left out.
 */
function signature(entries: readonly NodeEntry[], reverted: ReadonlySet<Nodes>): Signature {
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
 * Lines of `expected` (numbered from `offset`) where `actual` departs from
 * it: the first line of each run `actual` lacks, and the line just before
 * each run `actual` adds.
 */
function lineDepartures(expected: readonly string[], actual: readonly string[], offset: number): number[] {
  const departures: number[] = []
  let index = offset
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

/** Where each segment (a run of lines in one container) starts, then the line count. */
function segmentStarts(containers: readonly Nodes[]): number[] {
  const starts = containers.flatMap((container, index) => (index === 0 || container !== containers[index - 1] ? [index] : []))
  return [...starts, containers.length]
}

const sameLines = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((line, index) => line === b[index])

/**
 * Lines of `expected` where `actual` departs from it (see
 * {@link lineDepartures}). Edits rarely change how many paragraphs, headings,
 * and table cells there are, so the lines are diffed segment by segment, which
 * keeps the diff linear in the document when many containers depart; the
 * root's line always matches, so every departure has a line. @internal
 */
export function mismatches(expected: Signature, actual: Signature): number[] {
  const expectedStarts = segmentStarts(expected.containers)
  const actualStarts = segmentStarts(actual.containers)
  if (expectedStarts.length !== actualStarts.length) return lineDepartures(expected.lines, actual.lines, 0)
  return expectedStarts.slice(1).flatMap((end, index) => {
    const expectedLines = expected.lines.slice(expectedStarts[index], end)
    const actualLines = actual.lines.slice(actualStarts[index], actualStarts[index + 1])
    return sameLines(expectedLines, actualLines) ? [] : lineDepartures(expectedLines, actualLines, expectedStarts[index])
  })
}

/**
 * Order of edits at one offset: a link's closing delimiter right after the
 * link, then text edits, then a link's opening delimiter right before it.
 */
const EDIT_RANK = { closeDelimiter: 0, text: 1, openDelimiter: 2 } as const

const WHITESPACE_RE = /\s/

/**
 * The bare links an edit could join: one ends where the link starts, or one
 * starts where the link ends or further along the same run of
 * non-whitespace. `edits` ascend by start.
 */
function linksBesideEdits(source: string, links: readonly BareLink[], edits: readonly SourceEdit[]): BareLink[] {
  const ends = new Set(edits.map(({ end }) => end))
  return links.filter(({ range }) => {
    if (ends.has(range.start)) return true
    let runEnd = range.end
    while (runEnd < source.length && !WHITESPACE_RE.test(source[runEnd])) runEnd++
    const next = lowerBound(edits, (edit) => edit.start < range.end)
    return next < edits.length && edits[next].start <= runEnd
  })
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
  if (textEdits.length === 0) return source
  const adjacentLinks = linksBesideEdits(source, links, textEdits.map(({ edit }) => edit))
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
    const departures = mismatches(expected, signature(nodeEntries(parse(output)), new Set()))
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
