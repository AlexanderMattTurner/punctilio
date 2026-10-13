import { unified } from "unified"
import remarkParse from "remark-parse"
import remarkGfm from "remark-gfm"
import remarkStringify, { type Options as StringifyOptions } from "remark-stringify"
import QuickLRU from "quick-lru"

import { MARKDOWN_OPTION_KEYS } from "./sink-option-keys.js"
import { remarkPunctilio, type RemarkPunctilioOptions } from "./remark.js"
import { assertKnownOptionKeys, stableStringify, transformPreservingBom } from "./utils.js"

export { MARKDOWN_ONLY_OPTION_KEYS, MARKDOWN_OPTION_KEYS } from "./sink-option-keys.js"

/**
 * Options for `transformMarkdown`. Inherits the Markdown-sink default of
 * `nbsp: false` from {@link RemarkPunctilioOptions}; pass `nbsp: true` to
 * opt in to non-breaking space insertion.
 */
export interface MarkdownOptions extends RemarkPunctilioOptions {
  /**
   * Character for emphasis (`*text*` vs `_text_`) and strong (`**text**` vs `__text__`).
   * Default: "*"
   */
  emphasisMarker?: "*" | "_"

  /**
   * Character for strong emphasis (`**text**` vs `__text__`). Must match emphasisMarker.
   * Default: "*"
   */
  strongMarker?: "*" | "_"

  /** Bullet marker for output consistency. Default: "-" */
  bulletMarker?: "-" | "*" | "+"

  /** Thematic break marker. Default: "-" */
  ruleMarker?: "-" | "*" | "_"
}

/** Stringify settings shared by {@link createProcessor} and {@link remarkRoundTrip}. */
function stringifyOptions({ emphasisMarker, strongMarker, bulletMarker, ruleMarker }: MarkdownOptions): StringifyOptions {
  return {
    emphasis: emphasisMarker ?? "*",
    strong: strongMarker ?? "*",
    bullet: bulletMarker ?? "-",
    rule: ruleMarker ?? "-",
    // Use 4 dashes (----) for thematic breaks to avoid ambiguity with
    // YAML front matter delimiters (---) during re-parsing
    ...(ruleMarker === "-" || ruleMarker === undefined ? { ruleRepetition: 4 } : {}),
    // remark-stringify escapes opening brackets but not closing brackets,
    // producing `\[1]` instead of `\[1\]`. This can cause issues when the
    // output is re-parsed by markdown renderers.
    unsafe: [{ character: "]", inConstruct: "phrasing" }],
  }
}

function createProcessor(options: MarkdownOptions) {
  const {
    emphasisMarker,
    strongMarker,
    bulletMarker,
    ruleMarker,
    ...punctilioOptions
  } = options

  return unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkPunctilio, punctilioOptions)
    .use(remarkStringify, stringifyOptions({ emphasisMarker, strongMarker, bulletMarker, ruleMarker }))
}

const MAX_PROCESSOR_CACHE_SIZE = 8

const processorCache = new QuickLRU<string, ReturnType<typeof createProcessor>>({
  maxSize: MAX_PROCESSOR_CACHE_SIZE,
})

/** @internal */
export function clearProcessorCache(): void {
  processorCache.clear()
}

// Opening fence → fences that may close the block (YAML accepts `...` too).
// A Map, so a first line like `constructor` cannot resolve to an inherited
// Object.prototype member.
const FRONTMATTER_CLOSING_FENCES: ReadonlyMap<string, readonly string[]> = new Map([
  ["---", ["---", "..."]],
  ["+++", ["+++"]],
])

/**
 * Length of the YAML (`---`) or TOML (`+++`) front matter block at the very
 * start of `input`, through its closing fence line and newline. 0 when the
 * input has no terminated front matter block.
 */
function frontmatterLength(input: string): number {
  let lineStart = 0
  let closingFences: readonly string[] | undefined
  while (lineStart < input.length) {
    const newlineIndex = input.indexOf("\n", lineStart)
    const lineEnd = newlineIndex === -1 ? input.length : newlineIndex + 1
    const fence = input.slice(lineStart, lineEnd).trimEnd()
    if (closingFences === undefined) {
      closingFences = FRONTMATTER_CLOSING_FENCES.get(fence)
      if (closingFences === undefined) return 0
    } else if (closingFences.includes(fence)) {
      return lineEnd
    }
    lineStart = lineEnd
  }
  return 0
}

/** Matches blank lines that separate front matter from the document body. */
const LEADING_BLANK_LINES_RE = /^(?:[ \t]*\r?\n)*/

async function processMarkdown(input: string, options: MarkdownOptions): Promise<string> {
  const optionsKey = stableStringify(options)

  let processor = processorCache.get(optionsKey)
  if (!processor) {
    processor = createProcessor(options)
    processorCache.set(optionsKey, processor)
  }

  const result = await processor.process(input)
  return String(result)
}

export async function transformMarkdown(
  input: string,
  options: MarkdownOptions = {}
): Promise<string> {
  assertKnownOptionKeys(options, MARKDOWN_OPTION_KEYS, "transformMarkdown")
  return transformPreservingBom(input, (text) => transformWithFrontmatter(text, (body) => processMarkdown(body, options)))
}

/**
 * @internal Parse, then stringify, with no punctilio pass: the output
 * `transformMarkdown` is held to on a second run (remark's own round trip is
 * not always a fixed point).
 */
export async function remarkRoundTrip(
  input: string,
  options: MarkdownOptions = {}
): Promise<string> {
  const processor = unified().use(remarkParse).use(remarkGfm).use(remarkStringify, stringifyOptions(options))
  return transformPreservingBom(input, (text) => transformWithFrontmatter(text, async (body) => String(await processor.process(body))))
}

async function transformWithFrontmatter(input: string, processBody: (body: string) => Promise<string>): Promise<string> {
  const frontmatterEnd = frontmatterLength(input)
  if (frontmatterEnd === 0) return processBody(input)

  // Front matter is data (YAML/TOML), not prose; remark would parse it as a
  // thematic break plus a heading and rewrite it.
  const body = input.slice(frontmatterEnd)
  const blankLines = LEADING_BLANK_LINES_RE.exec(body)![0]
  const transformedBody = await processBody(body.slice(blankLines.length))
  return input.slice(0, frontmatterEnd) + blankLines + transformedBody
}
