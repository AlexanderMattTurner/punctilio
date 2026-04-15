/**
 * Convenience module for Markdown-to-Markdown typography transformations.
 *
 * Provides a single function that takes Markdown input and returns
 * typographically improved Markdown output.
 *
 * Requires `unified`, `remark-parse`, and `remark-stringify` to be installed.
 *
 * @packageDocumentation
 */

import { unified } from "unified"
import remarkParse from "remark-parse"
import remarkGfm from "remark-gfm"
import remarkStringify from "remark-stringify"

import { remarkPunctilio, type RemarkPunctilioOptions } from "./remark.js"

/**
 * Options for the Markdown transform pipeline.
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

/**
 * Creates a unified processor pipeline for Markdown typography transformations.
 */
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
    .use(remarkStringify, {
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
    })
}

/** Cached processor and the options key it was built with. */
let cachedProcessor: ReturnType<typeof createProcessor> | null = null
let cachedOptionsKey = ""

/**
 * Clears the processor cache. Exported for test isolation only.
 * @internal
 */
export function clearProcessorCache(): void {
  cachedProcessor = null
  cachedOptionsKey = ""
}

/**
 * Transforms Markdown text with typographic improvements.
 *
 * Parses the input as Markdown, applies punctilio typography transformations
 * (smart quotes, em-dashes, ellipses, etc.), and serializes back to Markdown.
 *
 * The unified processor pipeline is cached and reused across calls with
 * identical options, avoiding redundant pipeline construction.
 *
 * @param input - The Markdown text to transform
 * @param options - Configuration options for both the transform and serializer
 * @returns The typographically improved Markdown text
 *
 * @example
 * ```ts
 * import { transformMarkdown } from 'punctilio/markdown'
 *
 * await transformMarkdown('"Hello" -- world')
 * // → '\u201CHello\u201D\u2014world'
 * ```
 */
export async function transformMarkdown(
  input: string,
  options: MarkdownOptions = {}
): Promise<string> {
  const optionsKey = JSON.stringify(
    Object.entries(options).sort(([a], [b]) => a.localeCompare(b))
  )

  if (!cachedProcessor || cachedOptionsKey !== optionsKey) {
    cachedProcessor = createProcessor(options)
    cachedOptionsKey = optionsKey
  }

  const result = await cachedProcessor.process(input)
  return String(result)
}
