import { unified } from "unified"
import remarkParse from "remark-parse"
import remarkGfm from "remark-gfm"
import QuickLRU from "quick-lru"

import { spliceTextChanges } from "./markdown-source.js"
import { MARKDOWN_OPTION_KEYS } from "./sink-option-keys.js"
import { remarkPunctilio, type RemarkPunctilioOptions } from "./remark.js"
import { assertKnownOptionKeys, splitByteOrderMark, stableStringify } from "./utils.js"

export { MARKDOWN_OPTION_KEYS } from "./sink-option-keys.js"

/**
 * Options for `transformMarkdown`: the `transform()` options, with the
 * Markdown-sink default of `nbsp: false` from {@link RemarkPunctilioOptions}.
 * Pass `nbsp: true` to opt in to non-breaking space insertion.
 */
export type MarkdownOptions = RemarkPunctilioOptions

function createProcessor(options: MarkdownOptions) {
  return unified().use(remarkParse).use(remarkGfm).use(remarkPunctilio, options)
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

function processMarkdown(input: string, options: MarkdownOptions): string {
  const optionsKey = stableStringify(options)

  let processor = processorCache.get(optionsKey)
  if (!processor) {
    processor = createProcessor(options)
    processorCache.set(optionsKey, processor)
  }

  const tree = processor.parse(input)
  return spliceTextChanges(input, tree, (parsed) => processor.runSync(parsed, input), (markdown) => processor.parse(markdown))
}

/**
 * Apply punctilio to Markdown source, synchronously. The output is the input
 * byte for byte except for punctilio's typographic edits to prose: list
 * markers, emphasis delimiters, tables, links, front matter, and escapes of
 * characters punctilio leaves alone stay as written.
 */
export function transformMarkdownSync(input: string, options: MarkdownOptions = {}): string {
  assertKnownOptionKeys(options, MARKDOWN_OPTION_KEYS, "transformMarkdown")
  const { bom, body } = splitByteOrderMark(input)
  // Front matter is data (YAML/TOML), not prose; remark would parse it as a
  // thematic break plus a heading.
  const frontmatterEnd = frontmatterLength(body)
  return bom + body.slice(0, frontmatterEnd) + processMarkdown(body.slice(frontmatterEnd), options)
}

/** Promise-returning form of {@link transformMarkdownSync}. */
export async function transformMarkdown(input: string, options: MarkdownOptions = {}): Promise<string> {
  return transformMarkdownSync(input, options)
}
