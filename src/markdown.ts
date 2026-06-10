import { unified } from "unified"
import remarkParse from "remark-parse"
import remarkGfm from "remark-gfm"
import remarkStringify from "remark-stringify"
import QuickLRU from "quick-lru"

import { TRANSFORM_OPTION_KEYS } from "./index.js"
import { remarkPunctilio, type RemarkPunctilioOptions } from "./remark.js"
import { assertKnownOptionKeys, stableStringify } from "./utils.js"

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

/** Option keys handled by `transformMarkdown` itself rather than `transform()`. */
export const MARKDOWN_ONLY_OPTION_KEYS: readonly string[] = ["emphasisMarker", "strongMarker", "bulletMarker", "ruleMarker"]

/** Runtime list of valid `transformMarkdown` option keys. */
export const MARKDOWN_OPTION_KEYS: readonly string[] = [...TRANSFORM_OPTION_KEYS, ...MARKDOWN_ONLY_OPTION_KEYS]

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

const MAX_PROCESSOR_CACHE_SIZE = 8

const processorCache = new QuickLRU<string, ReturnType<typeof createProcessor>>({
  maxSize: MAX_PROCESSOR_CACHE_SIZE,
})

/** @internal */
export function clearProcessorCache(): void {
  processorCache.clear()
}

export async function transformMarkdown(
  input: string,
  options: MarkdownOptions = {}
): Promise<string> {
  assertKnownOptionKeys(options, MARKDOWN_OPTION_KEYS, "transformMarkdown")

  const optionsKey = stableStringify(options)

  let processor = processorCache.get(optionsKey)
  if (!processor) {
    processor = createProcessor(options)
    processorCache.set(optionsKey, processor)
  }

  const result = await processor.process(input)
  return String(result)
}
