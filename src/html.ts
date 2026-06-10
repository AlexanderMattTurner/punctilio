import { unified } from "unified"
import rehypeParse from "rehype-parse"
import rehypeStringify from "rehype-stringify"
import QuickLRU from "quick-lru"

import { REHYPE_ONLY_OPTION_KEYS, REHYPE_OPTION_KEYS, rehypePunctilio, type RehypePunctilioOptions } from "./rehype.js"
import { assertKnownOptionKeys, stableStringify } from "./utils.js"

export interface HtmlOptions extends RehypePunctilioOptions {
  /**
   * Whether to parse the input as an HTML fragment (no implicit `<html>`,
   * `<head>`, or `<body>` wrapping). Set to `false` to parse a complete
   * document. Default: `true`.
   */
  fragment?: boolean
}

/** Option keys handled by the HTML pipeline (parser plus rehype plugin)
 * rather than `transform()`. */
export const HTML_ONLY_OPTION_KEYS: readonly string[] = ["fragment", ...REHYPE_ONLY_OPTION_KEYS]

/** Runtime list of valid `transformHtml` option keys. */
export const HTML_OPTION_KEYS: readonly string[] = [...REHYPE_OPTION_KEYS, "fragment"]

function createProcessor(options: HtmlOptions) {
  const { fragment, ...punctilioOptions } = options
  return unified()
    .use(rehypeParse, { fragment: fragment ?? true })
    .use(rehypePunctilio, punctilioOptions)
    .use(rehypeStringify)
}

const MAX_PROCESSOR_CACHE_SIZE = 8

const processorCache = new QuickLRU<string, ReturnType<typeof createProcessor>>({
  maxSize: MAX_PROCESSOR_CACHE_SIZE,
})

/** @internal */
export function clearProcessorCache(): void {
  processorCache.clear()
}

export async function transformHtml(
  input: string,
  options: HtmlOptions = {}
): Promise<string> {
  assertKnownOptionKeys(options, HTML_OPTION_KEYS, "transformHtml")

  // Function-valued options aren't JSON-serializable, so the cache key
  // can't distinguish them. Bypass the cache to avoid returning a
  // processor wired to a different shouldSkipText.
  if (typeof options.shouldSkipText === "function") {
    const result = await createProcessor(options).process(input)
    return String(result)
  }

  const optionsKey = stableStringify(options)

  let processor = processorCache.get(optionsKey)
  if (!processor) {
    processor = createProcessor(options)
    processorCache.set(optionsKey, processor)
  }

  const result = await processor.process(input)
  return String(result)
}
