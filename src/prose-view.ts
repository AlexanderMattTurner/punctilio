import { DEFAULT_SEPARATOR } from "./constants.js"
import { transformTextNodes } from "./utils.js"

export interface ProseNode {
  value: string
}

export interface ProseView {
  /** Concatenation of the nodes' values. No markers, ever. */
  readonly text: string
  /** Offsets in `text` where one source node ends and the next begins (interior boundaries only; length = nodes.length - 1; may contain duplicates when nodes are empty). */
  readonly boundaries: readonly number[]
  /** True iff a node edge falls at exactly this offset. O(log n) binary search. */
  hasBoundary(offset: number): boolean
  /** Queue an edit replacing [start, end) with `text`. Edits must not overlap; enforced at commit. */
  replace(start: number, end: number, text: string, opts?: { bind?: "left" | "right" }): void
  /** Apply queued edits back onto the source nodes (mutating their `value`s), then recompute `text`/`boundaries`. The view supports arbitrarily many queue/commit cycles. */
  commit(): void
}

interface QueuedEdit {
  start: number
  end: number
  text: string
  bind: "left" | "right"
}

/** True iff the offset falls between a high surrogate and its low surrogate. */
function splitsSurrogatePair(text: string, offset: number): boolean {
  if (offset <= 0 || offset >= text.length) return false
  const high = text.charCodeAt(offset - 1)
  const low = text.charCodeAt(offset)
  return high >= 0xd800 && high <= 0xdbff && low >= 0xdc00 && low <= 0xdfff
}

class ProseViewImpl implements ProseView {
  private readonly nodes: ProseNode[]
  private cachedText: string
  private cachedBoundaries: number[]
  private edits: QueuedEdit[] = []

  constructor(nodes: ProseNode[]) {
    this.nodes = nodes
    this.cachedText = ""
    this.cachedBoundaries = []
    this.refresh()
  }

  get text(): string {
    return this.cachedText
  }

  get boundaries(): readonly number[] {
    return this.cachedBoundaries
  }

  /** Recompute `text` and `boundaries` from the current node values. @internal */
  refresh(): void {
    let text = ""
    const boundaries: number[] = []
    this.nodes.forEach((node, index) => {
      text += node.value
      if (index < this.nodes.length - 1) {
        boundaries.push(text.length)
      }
    })
    this.cachedText = text
    this.cachedBoundaries = boundaries
  }

  /** @internal */
  hasQueuedEdits(): boolean {
    return this.edits.length > 0
  }

  /** @internal */
  getNodes(): ProseNode[] {
    return this.nodes
  }

  hasBoundary(offset: number): boolean {
    const boundaries = this.cachedBoundaries
    let low = 0
    let high = boundaries.length - 1
    while (low <= high) {
      const mid = (low + high) >>> 1
      const value = boundaries[mid]
      if (value === offset) return true
      if (value < offset) {
        low = mid + 1
      } else {
        high = mid - 1
      }
    }
    return false
  }

  replace(start: number, end: number, text: string, opts?: { bind?: "left" | "right" }): void {
    if (!Number.isInteger(start) || !Number.isInteger(end)) {
      throw new Error(`replace() offsets must be integers, got start=${start}, end=${end}.`)
    }
    if (start < 0 || start > end || end > this.cachedText.length) {
      throw new Error(
        `replace() requires 0 <= start <= end <= text.length (${this.cachedText.length}), ` +
        `got start=${start}, end=${end}.`
      )
    }
    if (splitsSurrogatePair(this.cachedText, start)) {
      throw new Error(`replace() start=${start} splits a UTF-16 surrogate pair.`)
    }
    if (splitsSurrogatePair(this.cachedText, end)) {
      throw new Error(`replace() end=${end} splits a UTF-16 surrogate pair.`)
    }
    this.edits.push({ start, end, text, bind: opts?.bind ?? "left" })
  }

  /**
   * Apply queued edits to the source nodes. Edits are ordered by start offset,
   * tie-breaking shorter spans first so a zero-length edit sorts before a
   * spanning edit at the same start. A pure insertion may therefore coexist
   * with a replacement starting at the same offset: the insertion's text lands
   * before the replaced span's text. Overlapping spans (and two pure
   * insertions at the same offset) are rejected.
   */
  commit(): void {
    if (this.edits.length === 0) {
      return
    }

    const sorted = [...this.edits].sort(
      (a, b) => a.start - b.start || (a.end - a.start) - (b.end - b.start)
    )
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1]
      const curr = sorted[i]
      if (prev.end > curr.start) {
        throw new Error(
          `Overlapping edits: [${prev.start}, ${prev.end}) and [${curr.start}, ${curr.end}).`
        )
      }
      if (prev.end === curr.start && prev.start === prev.end && curr.start === curr.end) {
        throw new Error(
          `Two pure insertions at the same offset ${curr.start} are ambiguous; combine them.`
        )
      }
    }

    // Node spans in `text` via cumulative lengths.
    const starts: number[] = []
    const ends: number[] = []
    let cursor = 0
    for (const node of this.nodes) {
      starts.push(cursor)
      cursor += node.value.length
      ends.push(cursor)
    }

    // Apply right-to-left so earlier offsets stay valid as we mutate.
    for (let i = sorted.length - 1; i >= 0; i--) {
      this.applyEdit(sorted[i], starts, ends)
    }

    this.edits = []
    this.refresh()
  }

  /** Index of the node whose span contains the character at `offset`. */
  private nodeContainingChar(offset: number, starts: number[], ends: number[]): number {
    for (let i = 0; i < this.nodes.length; i++) {
      if (offset >= starts[i] && offset < ends[i]) return i
    }
    /* istanbul ignore next -- defensive: callers only pass offsets that fall within a node span */
    return this.nodes.length - 1
  }

  private targetNodeForInsertion(edit: QueuedEdit, starts: number[], ends: number[]): number {
    if (edit.bind === "left") {
      if (edit.start === 0) return 0
      return this.nodeContainingChar(edit.start - 1, starts, ends)
    }
    if (edit.start === this.cachedText.length) return this.nodes.length - 1
    return this.nodeContainingChar(edit.start, starts, ends)
  }

  private applyEdit(edit: QueuedEdit, starts: number[], ends: number[]): void {
    const { start, end, text } = edit

    // Decide where replacement/insertion text lands before mutating values.
    const targetIndex = end > start
      ? this.nodeContainingChar(start, starts, ends)
      : this.targetNodeForInsertion(edit, starts, ends)
    const insertOffsetInTarget = start - starts[targetIndex]

    // Delete the intersection of [start, end) from every covered node.
    for (let i = 0; i < this.nodes.length; i++) {
      const delStart = Math.max(start, starts[i])
      const delEnd = Math.min(end, ends[i])
      if (delStart >= delEnd) continue
      const node = this.nodes[i]
      const localStart = delStart - starts[i]
      const localEnd = delEnd - starts[i]
      node.value = node.value.slice(0, localStart) + node.value.slice(localEnd)
    }

    // Insert replacement text into the target node. For replacements the
    // deletion above removed [start, end) from the target, so `start` is the
    // correct insertion point inside the (now shortened) target value.
    if (text.length > 0) {
      const target = this.nodes[targetIndex]
      target.value = target.value.slice(0, insertOffsetInTarget) + text + target.value.slice(insertOffsetInTarget)
    }
  }
}

export function buildProseView(nodes: ProseNode[]): ProseView {
  return new ProseViewImpl(nodes)
}

export interface ReplaceAllOptions {
  /** Opt-in: allow a match that contains an interior node boundary. Default: such matches are skipped. */
  allowBoundaries?: (match: RegExpExecArray, view: ProseView) => boolean
  /** For pure-insertion edits produced by the replacer (rare), bind side. */
  bind?: "left" | "right"
}

/** True iff some interior boundary falls strictly inside the match span. */
function matchContainsBoundary(match: RegExpExecArray, view: ProseView): boolean {
  const matchStart = match.index
  const matchEnd = match.index + match[0].length
  for (const boundary of view.boundaries) {
    if (boundary > matchStart && boundary < matchEnd) return true
  }
  return false
}

export function replaceAllInView(
  view: ProseView,
  regex: RegExp,
  replacer: (match: RegExpExecArray, view: ProseView) => string | null,
  options?: ReplaceAllOptions,
): void {
  if (!regex.global) {
    throw new Error("replaceAllInView() requires a regex with the global (g) flag.")
  }

  const allowBoundaries = options?.allowBoundaries
  const bind = options?.bind
  const text = view.text
  regex.lastIndex = 0

  let match: RegExpExecArray | null
  while ((match = regex.exec(text)) !== null) {
    if (match[0].length === 0) {
      regex.lastIndex += 1
    }

    if (matchContainsBoundary(match, view) && !allowBoundaries?.(match, view)) {
      continue
    }

    const replacement = replacer(match, view)
    if (replacement === null) {
      continue
    }

    view.replace(match.index, match.index + match[0].length, replacement, bind ? { bind } : undefined)
  }
}

export function runLegacyPass(
  view: ProseView,
  passFn: (markedText: string) => string,
  separator: string = DEFAULT_SEPARATOR,
): void {
  const impl = view as ProseViewImpl
  if (impl.hasQueuedEdits()) {
    throw new Error("runLegacyPass() cannot run while the view has uncommitted queued edits.")
  }
  transformTextNodes(impl.getNodes(), passFn, separator)
  impl.refresh()
}
