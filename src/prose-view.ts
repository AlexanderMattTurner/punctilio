export interface ProseNode {
  value: string;
}

export interface ProseView {
  /** Concatenation of the nodes' values. No markers, ever. */
  readonly text: string;
  /** Offsets in `text` where one source node ends and the next begins (interior boundaries only; length = nodes.length - 1; may contain duplicates when nodes are empty). */
  readonly boundaries: readonly number[];
  /** True iff a node edge falls at exactly this offset. O(log n) binary search. */
  hasBoundary(offset: number): boolean;
  /** Queue an edit replacing [start, end) with `text`. Edits must not overlap; enforced at commit. */
  replace(
    start: number,
    end: number,
    text: string,
    opts?: { bind?: "left" | "right" },
  ): void;
  /** Apply queued edits back onto the source nodes (mutating their `value`s), then recompute `text`/`boundaries`. The view supports arbitrarily many queue/commit cycles. */
  commit(): void;
}

interface QueuedEdit {
  start: number;
  end: number;
  text: string;
  bind: "left" | "right";
}

/** True iff the offset falls between a high surrogate and its low surrogate. */
function splitsSurrogatePair(text: string, offset: number): boolean {
  if (offset <= 0 || offset >= text.length) return false;
  const high = text.charCodeAt(offset - 1);
  const low = text.charCodeAt(offset);
  return high >= 0xd800 && high <= 0xdbff && low >= 0xdc00 && low <= 0xdfff;
}

/**
 * The scan index one position past `index`: one code point for a unicode-mode
 * (u/v) regex, else one code unit. Resuming a unicode-mode regex inside a
 * surrogate pair makes `exec` back up to the pair's start and re-match there
 * forever.
 */
export function advanceScanIndex(text: string, index: number, regex: RegExp): number {
  const unicodeMode = regex.unicode || regex.flags.includes("v");
  return index + (unicodeMode && splitsSurrogatePair(text, index + 1) ? 2 : 1);
}

class ProseViewImpl implements ProseView {
  private readonly nodes: ProseNode[];
  private cachedText: string;
  private cachedBoundaries: number[];
  private edits: QueuedEdit[] = [];

  constructor(nodes: ProseNode[]) {
    this.nodes = nodes;
    this.cachedText = "";
    this.cachedBoundaries = [];
    this.refresh();
  }

  get text(): string {
    return this.cachedText;
  }

  get boundaries(): readonly number[] {
    return this.cachedBoundaries;
  }

  /** Recompute `text` and `boundaries` from the current node values. */
  private refresh(): void {
    let text = "";
    const boundaries: number[] = [];
    this.nodes.forEach((node, index) => {
      text += node.value;
      if (index < this.nodes.length - 1) {
        boundaries.push(text.length);
      }
    });
    this.cachedText = text;
    this.cachedBoundaries = boundaries;
  }

  hasBoundary(offset: number): boolean {
    const boundaries = this.cachedBoundaries;
    const first = lowerBound(boundaries, offset);
    return first < boundaries.length && boundaries[first] === offset;
  }

  replace(
    start: number,
    end: number,
    text: string,
    opts?: { bind?: "left" | "right" },
  ): void {
    if (!Number.isInteger(start) || !Number.isInteger(end)) {
      throw new Error(
        `replace() offsets must be integers, got start=${start}, end=${end}.`,
      );
    }
    if (start < 0 || start > end || end > this.cachedText.length) {
      throw new Error(
        `replace() requires 0 <= start <= end <= text.length (${this.cachedText.length}), ` +
          `got start=${start}, end=${end}.`,
      );
    }
    if (splitsSurrogatePair(this.cachedText, start)) {
      throw new Error(
        `replace() start=${start} splits a UTF-16 surrogate pair.`,
      );
    }
    if (splitsSurrogatePair(this.cachedText, end)) {
      throw new Error(`replace() end=${end} splits a UTF-16 surrogate pair.`);
    }
    this.edits.push({ start, end, text, bind: opts?.bind ?? "left" });
  }

  /**
   * Apply queued edits to the source nodes. Edits are ordered by start offset,
   * tie-breaking shorter spans first so a zero-length edit sorts before a
   * spanning edit at the same start. A pure insertion may therefore coexist
   * with a replacement starting at the same offset: the insertion's text lands
   * before the replaced span's text. Overlapping spans are rejected, as are two
   * pure insertions at the same offset that share a `bind` — those would land in
   * the same node with no defined order. Two same-offset insertions with
   * opposite `bind` are unambiguous: `bind: "left"` routes to the node ending at
   * the offset and `bind: "right"` to the node starting there, so they occupy
   * different nodes (left-bound sorted first).
   *
   * All edits are distributed in a single left-to-right pass that rebuilds
   * each node's value once — per-edit string surgery would be quadratic on
   * edit-dense input.
   */
  commit(): void {
    if (this.edits.length === 0) {
      return;
    }

    const bindRank = (edit: QueuedEdit): number =>
      edit.bind === "left" ? 0 : 1;
    const sorted = [...this.edits].sort(
      (a, b) =>
        a.start - b.start ||
        a.end - a.start - (b.end - b.start) ||
        bindRank(a) - bindRank(b),
    );
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const curr = sorted[i];
      if (prev.end > curr.start) {
        throw new Error(
          `Overlapping edits: [${prev.start}, ${prev.end}) and [${curr.start}, ${curr.end}).`,
        );
      }
      if (
        prev.end === curr.start &&
        prev.start === prev.end &&
        curr.start === curr.end &&
        prev.bind === curr.bind
      ) {
        throw new Error(
          `Two pure insertions at the same offset ${curr.start} with bind "${curr.bind}" are ` +
            `ambiguous; combine them.`,
        );
      }
    }

    // Node spans in `text` via cumulative lengths.
    const starts: number[] = [];
    const ends: number[] = [];
    let cursor = 0;
    for (const node of this.nodes) {
      starts.push(cursor);
      cursor += node.value.length;
      ends.push(cursor);
    }

    const text = this.cachedText;
    const parts: string[][] = this.nodes.map(() => []);

    // Rolling copy state: kept text in [0, copiedUpTo) has been distributed.
    let copiedUpTo = 0;
    let copyNode = 0;
    const copyUpTo = (target: number): void => {
      while (copiedUpTo < target) {
        while (copyNode < this.nodes.length - 1 && ends[copyNode] <= copiedUpTo)
          copyNode++;
        const sliceEnd = Math.min(target, ends[copyNode]);
        parts[copyNode].push(text.slice(copiedUpTo, sliceEnd));
        copiedUpTo = sliceEnd;
      }
    };

    for (const edit of sorted) {
      copyUpTo(edit.start);
      // Deleted spans are simply never copied; replacement/insertion text
      // lands in the target node, whose parts are filled exactly up to
      // `edit.start` at this point.
      if (edit.text.length > 0) {
        const targetIndex =
          edit.end > edit.start
            ? this.nodeContainingChar(edit.start, ends)
            : this.targetNodeForInsertion(edit, ends);
        parts[targetIndex].push(edit.text);
      }
      if (edit.end > copiedUpTo) copiedUpTo = edit.end;
    }
    copyUpTo(text.length);

    this.nodes.forEach((node, index) => {
      node.value = parts[index].join("");
    });

    this.edits = [];
    this.refresh();
  }

  /**
   * Index of the node whose span contains the character at `offset`: the
   * first node whose end lies past the offset (binary search; empty nodes at
   * the offset are skipped, matching a first-containing-span linear scan).
   */
  private nodeContainingChar(offset: number, ends: number[]): number {
    let low = 0;
    let high = ends.length - 1;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (ends[mid] <= offset) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }
    return low;
  }

  private targetNodeForInsertion(edit: QueuedEdit, ends: number[]): number {
    if (edit.bind === "left") {
      if (edit.start === 0) return 0;
      return this.nodeContainingChar(edit.start - 1, ends);
    }
    if (edit.start === this.cachedText.length) return this.nodes.length - 1;
    return this.nodeContainingChar(edit.start, ends);
  }
}

export function buildProseView(nodes: ProseNode[]): ProseView {
  return new ProseViewImpl(nodes);
}

/**
 * Partitions `items` into contiguous groups, breaking before every index in
 * `breakBefore` (indices 1..n-1). With no break indices the whole list is one
 * group; an empty list yields no groups. Used to isolate opaque-delimited
 * segments so a pass never sees text as adjacent across removed content.
 */
export function splitAtIndices<T>(
  items: readonly T[],
  breakBefore: ReadonlySet<number>,
): T[][] {
  if (breakBefore.size === 0) {
    return items.length > 0 ? [items.slice()] : [];
  }
  const groups: T[][] = [];
  let start = 0;
  for (let i = 1; i < items.length; i++) {
    if (breakBefore.has(i)) {
      groups.push(items.slice(start, i));
      start = i;
    }
  }
  groups.push(items.slice(start));
  return groups;
}

/**
 * Stand-in for removed opaque inline content (a skipped element, an image,
 * inline code) inside a spanning view. U+FFFC OBJECT REPLACEMENT CHARACTER is
 * Unicode's placeholder for an embedded object: it is neither space, word
 * character, nor punctuation, so a pass needing adjacent text never matches
 * across it (`5<code>c</code>x 3` stays put), while the quote classifier still
 * sees real content between a quote and its partner (`"<kbd>q</kbd>"` pairs).
 */
export const OPAQUE_PLACEHOLDER = "\uFFFC";

/**
 * Single-quote edge stand-ins. The classifier reads end of text as an ending
 * context after a closing single quote and as an opening context before an
 * opening one, but reads {@link OPAQUE_PLACEHOLDER} as neither, so `'hi'` or
 * `boys'` directly before a gap, or `'hi'` directly after one, would lose the
 * role the segment edge gives it. A `)` after the quote and a `(` before it
 * restore those contexts without blocking a pair across the gap
 * (`'<code>x</code>'` still pairs). They are added only beside a single quote:
 * double quotes read the placeholder correctly, and `)` would block a double
 * opener.
 */
const SEGMENT_END_STAND_IN = ")";
const SEGMENT_START_STAND_IN = "(";

/** Straight, curly, modifier-letter and low-9 single-quote characters. */
const SINGLE_QUOTE_CHARS: ReadonlySet<string> = new Set([
  "'",
  "\u2018",
  "\u2019",
  "\u02BC",
  "\u201A",
]);

/** Gap stand-in for the text between `before` and `after`. */
function gapPlaceholder(before: string, after: string): string {
  const afterQuote = SINGLE_QUOTE_CHARS.has(before.slice(-1));
  const beforeQuote = SINGLE_QUOTE_CHARS.has(after.slice(0, 1));
  return (
    (afterQuote ? SEGMENT_END_STAND_IN : "") +
    OPAQUE_PLACEHOLDER +
    (beforeQuote ? SEGMENT_START_STAND_IN : "")
  );
}

/**
 * Runs `run` over `nodes` as one view with a placeholder node (see
 * {@link OPAQUE_PLACEHOLDER}) at each opaque gap (`breakBefore`, as for
 * {@link splitAtIndices}), so context-sensitive passes such as quote pairing
 * read across the gap. The view is committed after `run`. If any edit lands in
 * a placeholder (one that spans, replaces, or is inserted into the gap), the
 * nodes are restored and `run` goes over each opaque-delimited segment on its
 * own instead, so no edit ever lands in or through a gap.
 */
export function runAcrossOpaqueGaps(
  nodes: readonly ProseNode[],
  breakBefore: ReadonlySet<number>,
  run: (view: ProseView) => void,
): void {
  if (nodes.length === 0) return;
  const originalValues = nodes.map((node) => node.value);
  const placeholders: { node: ProseNode; value: string }[] = [];
  const spanning: ProseNode[] = [];
  nodes.forEach((node, index) => {
    if (breakBefore.has(index)) {
      const value = gapPlaceholder(nodes[index - 1].value, node.value);
      const placeholder = { value };
      placeholders.push({ node: placeholder, value });
      spanning.push(placeholder);
    }
    spanning.push(node);
  });

  const spanningView = buildProseView(spanning);
  run(spanningView);
  spanningView.commit();
  if (placeholders.every(({ node, value }) => node.value === value)) return;

  nodes.forEach((node, index) => {
    node.value = originalValues[index];
  });
  for (const group of splitAtIndices(nodes, breakBefore)) {
    const segmentView = buildProseView(group);
    run(segmentView);
    segmentView.commit();
  }
}

export interface ReplaceAllOptions {
  /** Opt-in: allow a match that contains an interior node boundary. Default: such matches are skipped. */
  allowBoundaries?: (match: RegExpExecArray, view: ProseView) => boolean;
  /** For pure-insertion edits produced by the replacer (rare), bind side. */
  bind?: "left" | "right";
}

/**
 * Index of the first element in sorted `values` that is >= `target`. The
 * boundary helpers below run per candidate offset in the pass scanners, so a
 * linear scan here would make inline-element-heavy views O(text × nodes).
 */
function lowerBound(values: readonly number[], target: number): number {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (values[mid] < target) low = mid + 1;
    else high = mid;
  }
  return low;
}

/** True iff some interior boundary falls strictly inside the match span. */
function matchContainsBoundary(
  match: RegExpExecArray,
  view: ProseView,
): boolean {
  return (
    firstInteriorBoundary(view, match.index, match.index + match[0].length) >= 0
  );
}

/** Smallest node boundary strictly inside (start, end), or -1 when none. */
export function firstInteriorBoundary(
  view: ProseView,
  start: number,
  end: number,
): number {
  const boundaries = view.boundaries;
  const first = lowerBound(boundaries, start + 1);
  return first < boundaries.length && boundaries[first] < end
    ? boundaries[first]
    : -1;
}

/** Largest node boundary strictly less than `offset`, or -1 when none. O(log n). */
export function lastBoundaryBefore(view: ProseView, offset: number): number {
  const boundaries = view.boundaries;
  const first = lowerBound(boundaries, offset);
  return first > 0 ? boundaries[first - 1] : -1;
}

/**
 * True when every node boundary strictly inside (start, end) is one of
 * `allowedSlots`. Seeks to the span with binary search, so it scans only the
 * boundaries in range rather than the whole array on every call — the linear
 * alternative is O(matches × nodes) on inline-element-heavy views.
 */
export function interiorBoundariesWithin(
  view: ProseView,
  start: number,
  end: number,
  allowedSlots: readonly number[],
): boolean {
  const boundaries = view.boundaries;
  for (
    let i = lowerBound(boundaries, start + 1);
    i < boundaries.length && boundaries[i] < end;
    i++
  ) {
    if (!allowedSlots.includes(boundaries[i])) return false;
  }
  return true;
}

/** Count of node boundaries that fall at exactly `offset` (empty nodes stack). */
export function boundaryCountAt(view: ProseView, offset: number): number {
  const boundaries = view.boundaries;
  let i = lowerBound(boundaries, offset);
  let count = 0;
  while (i < boundaries.length && boundaries[i] === offset) {
    count++;
    i++;
  }
  return count;
}

/**
 * True when more than one node boundary is stacked at `offset` — i.e. the
 * position exceeds the single-boundary tolerance the passes allow in an
 * editing slot.
 */
export function exceedsSingleBoundary(
  view: ProseView,
  offset: number,
): boolean {
  return boundaryCountAt(view, offset) > 1;
}

export function replaceAllInView(
  view: ProseView,
  regex: RegExp,
  replacer: (match: RegExpExecArray, view: ProseView) => string | null,
  options?: ReplaceAllOptions,
): void {
  if (!regex.global) {
    throw new Error(
      "replaceAllInView() requires a regex with the global (g) flag.",
    );
  }

  const allowBoundaries = options?.allowBoundaries;
  const bind = options?.bind;
  const text = view.text;
  regex.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match[0].length === 0) {
      regex.lastIndex = advanceScanIndex(text, regex.lastIndex, regex);
    }

    if (matchContainsBoundary(match, view) && !allowBoundaries?.(match, view)) {
      continue;
    }

    const replacement = replacer(match, view);
    if (replacement === null) {
      continue;
    }

    view.replace(
      match.index,
      match.index + match[0].length,
      replacement,
      bind ? { bind } : undefined,
    );
  }
}

/**
 * String↔view bridge: builds a single-node ProseView over `text`, runs `run`
 * against it, commits any queued edits, and returns the resulting text.
 */
export function withProseView(
  text: string,
  run: (view: ProseView) => void,
): string {
  const node: ProseNode = { value: text };
  const view = buildProseView([node]);
  run(view);
  view.commit();
  return node.value;
}

/**
 * A pass with the same dual-input shape as the built-ins (`niceQuotes`,
 * `hyphenReplace`, ...): string in, transformed string out; ProseView in,
 * edits committed onto it in place.
 */
export type ProsePass = {
  (input: string): string;
  (input: ProseView): void;
};

export interface DefinePassOptions {
  /**
   * How matches that contain an interior node boundary are handled:
   *
   * - `"skip"` (default, safe): such matches are left untouched, so a pass
   *   never rewrites text that spans two source nodes.
   * - `"allow"`: such matches are always replaced; the replacement text lands
   *   in the node containing the match start, collapsing the boundary after it.
   * - predicate: forwarded as `allowBoundaries` to {@link replaceAllInView};
   *   return `true` to allow that particular boundary-spanning match.
   */
  boundaries?:
    | "skip"
    | "allow"
    | ((match: RegExpExecArray, view: ProseView) => boolean);
}

type ReplacementPart =
  | { kind: "literal"; text: string }
  | { kind: "whole" }
  | {
      kind: "indexed";
      index: number;
      fallback?: { index: number; literal: string };
    }
  | { kind: "named"; name: string };

function isAsciiDigit(char: string | undefined): char is string {
  return char !== undefined && char >= "0" && char <= "9";
}

/** Parses the `$`-token starting at `dollarIndex`; returns the part and the offset past it. */
function parseDollarToken(
  template: string,
  dollarIndex: number,
): { part: ReplacementPart; next: number } {
  const unsupported = (): Error =>
    new Error(
      `Unsupported "$" form in replacement template ${JSON.stringify(template)}; ` +
        `supported forms are $$, $&, $1-$99, and $<name>.`,
    );

  const next = template[dollarIndex + 1];
  if (next === "$") {
    return { part: { kind: "literal", text: "$" }, next: dollarIndex + 2 };
  }
  if (next === "&") {
    return { part: { kind: "whole" }, next: dollarIndex + 2 };
  }
  if (isAsciiDigit(next)) {
    const digits = isAsciiDigit(template[dollarIndex + 2])
      ? next + template[dollarIndex + 2]
      : next;
    const index = parseInt(digits, 10);
    // `$12` means group 12 when it exists, otherwise group 1 followed by a
    // literal "2" — matching String.replace. `$0`/`$00` reference nothing.
    const fallbackIndex = parseInt(digits[0], 10);
    const fallback =
      digits.length === 2 && fallbackIndex > 0
        ? { index: fallbackIndex, literal: digits[1] }
        : undefined;
    if (index === 0 && fallback === undefined) {
      throw new Error(
        `Unsupported group reference $${digits} in replacement template ` +
          `${JSON.stringify(template)}; numbered groups start at $1.`,
      );
    }
    return {
      part: { kind: "indexed", index, fallback },
      next: dollarIndex + 1 + digits.length,
    };
  }
  if (next === "<") {
    const close = template.indexOf(">", dollarIndex + 2);
    if (close === -1 || close === dollarIndex + 2) {
      throw unsupported();
    }
    return {
      part: { kind: "named", name: template.slice(dollarIndex + 2, close) },
      next: close + 1,
    };
  }
  throw unsupported();
}

/**
 * Parses a `String.replace`-style replacement template into parts. Supported
 * forms: `$$` (literal `$`), `$&` (whole match), `$1`–`$99` (numbered
 * groups), and `$<name>` (named groups). Any other `$` form (`$0`, ``$` ``,
 * `$'`, a bare or malformed `$`) throws rather than silently substituting.
 */
function parseReplacementTemplate(template: string): ReplacementPart[] {
  const parts: ReplacementPart[] = [];
  let literalStart = 0;
  let i = 0;

  while (i < template.length) {
    if (template[i] !== "$") {
      i++;
      continue;
    }
    if (i > literalStart) {
      parts.push({ kind: "literal", text: template.slice(literalStart, i) });
    }
    const { part, next } = parseDollarToken(template, i);
    parts.push(part);
    i = next;
    literalStart = next;
  }

  if (template.length > literalStart) {
    parts.push({ kind: "literal", text: template.slice(literalStart) });
  }

  return parts;
}

/** Renders a numbered group reference, applying the `$12` → `$1` + "2" fallback. */
function renderIndexedPart(
  part: { index: number; fallback?: { index: number; literal: string } },
  match: RegExpExecArray,
): string {
  if (part.index < match.length) {
    return match[part.index] ?? "";
  }
  if (part.fallback && part.fallback.index < match.length) {
    return (match[part.fallback.index] ?? "") + part.fallback.literal;
  }
  throw new Error(
    `Replacement references group $${part.index} but the pattern only has ` +
      `${match.length - 1} capture group(s).`,
  );
}

/**
 * Compiles a replacement template into a replacer. Group references are
 * resolved per match: a reference to a group the pattern does not define
 * throws, while a defined group that simply did not participate in the match
 * substitutes the empty string (as with String.replace).
 */
function compileReplacementTemplate(
  template: string,
): (match: RegExpExecArray) => string {
  const parts = parseReplacementTemplate(template);
  return (match) =>
    parts
      .map((part) => {
        switch (part.kind) {
          case "literal":
            return part.text;
          case "whole":
            return match[0];
          case "indexed":
            return renderIndexedPart(part, match);
          case "named": {
            const groups = match.groups;
            if (!groups || !(part.name in groups)) {
              throw new Error(
                `Replacement references group $<${part.name}> but the pattern ` +
                  `has no capture group named "${part.name}".`,
              );
            }
            return groups[part.name] ?? "";
          }
        }
      })
      .join("");
}

/**
 * Defines a boundary-aware pass with the same dual-input shape as the
 * built-in passes, suitable for composing with them (e.g. via `applyPasses`
 * from `punctilio/rehype`).
 *
 * `replacement` is either a template string (supporting `$$`, `$&`,
 * `$1`–`$99`, and `$<name>`; any other `$` form throws at definition time)
 * or a replacer `(match, view) => string | null`, where `null` leaves that
 * match untouched.
 *
 * Patterns that can match the empty string (e.g. pure lookarounds) insert
 * the replacement at every position they match; prefer patterns that
 * consume at least one character.
 */
export function definePass(
  pattern: RegExp,
  replacement:
    | string
    | ((match: RegExpExecArray, view: ProseView) => string | null),
  options: DefinePassOptions = {},
): ProsePass {
  if (!pattern.global) {
    throw new Error(
      "definePass() requires a pattern with the global (g) flag.",
    );
  }

  const boundaries = options.boundaries ?? "skip";
  let allowBoundaries: ReplaceAllOptions["allowBoundaries"];
  if (boundaries === "allow") {
    allowBoundaries = () => true;
  } else if (typeof boundaries === "function") {
    allowBoundaries = boundaries;
  } else if (boundaries !== "skip") {
    throw new Error(
      `Invalid boundaries option: ${JSON.stringify(boundaries)}. ` +
        `Must be "skip", "allow", or a predicate.`,
    );
  }

  const replacer =
    typeof replacement === "string"
      ? compileReplacementTemplate(replacement)
      : replacement;

  function pass(input: string): string;
  function pass(input: ProseView): void;
  function pass(input: string | ProseView): string | void {
    return overInput(input, (view) => {
      replaceAllInView(
        view,
        pattern,
        replacer,
        allowBoundaries ? { allowBoundaries } : undefined,
      );
    });
  }
  return pass;
}

/**
 * Dual-input driver shared by the public passes: a string runs through a
 * single-node view and returns the transformed string; a ProseView has the
 * pass's edits queued and committed onto it in place (returns nothing).
 */
export function overInput(
  input: string,
  run: (view: ProseView) => void,
): string;
export function overInput(
  input: ProseView,
  run: (view: ProseView) => void,
): void;
export function overInput(
  input: string | ProseView,
  run: (view: ProseView) => void,
): string | void;
export function overInput(
  input: string | ProseView,
  run: (view: ProseView) => void,
): string | void {
  if (typeof input === "string") {
    return withProseView(input, run);
  }
  run(input);
  input.commit();
}

/**
 * Wraps a view runner as a dual-input {@link ProsePass}: the returned function
 * transforms a string and returns it, or edits a ProseView in place. Collapses
 * the string/ProseView overload triple that every zero-option public pass would
 * otherwise repeat.
 */
export function makeProsePass(run: (view: ProseView) => void): ProsePass {
  function pass(input: string): string;
  function pass(input: ProseView): void;
  function pass(input: string | ProseView): string | void {
    return overInput(input, run);
  }
  return pass;
}
