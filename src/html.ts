/**
 * Convenience module for HTML-to-HTML typography transformations.
 *
 * Provides a single function that takes HTML input and returns
 * typographically improved HTML output.
 *
 * Requires `unified`, `rehype-parse`, and `rehype-stringify` to be installed.
 *
 * @packageDocumentation
 */

import { unified } from "unified"
import rehypeParse from "rehype-parse"
import rehypeStringify from "rehype-stringify"
import QuickLRU from "quick-lru"

import { rehypePunctilio, type RehypePunctilioOptions } from "./rehype.js"

/**
 * Options for the HTML transform pipeline.
 */
export interface HtmlOptions extends RehypePunctilioOptions {
  /**
   * Whether to parse the input as an HTML fragment (no implicit `<html>`,
   * `<head>`, or `<body>` wrapping). Set to `false` to parse a complete
   * document. Default: `true`.
   */
  fragment?: boolean
}

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

/**
 * Clears the processor cache. Exported for test isolation only.
 * @internal
 */
export function clearProcessorCache(): void {
  processorCache.clear()
}

/**
 * Transforms HTML text with typographic improvements.
 *
 * Parses the input as HTML, applies punctilio typography transformations
 * (smart quotes, em-dashes, ellipses, etc.), and serializes back to HTML.
 *
 * The unified processor pipeline is cached and reused across calls with
 * identical options. Calls that pass a function-valued option (such as
 * `shouldSkipText`) bypass the cache to avoid returning a processor built
 * with a different function reference.
 *
 * @example
 * ```ts
 * import { transformHtml } from 'punctilio/html'
 *
 * await transformHtml('<p>"Hello" -- world</p>')
 * // → '<p>“Hello”—world</p>'
 * ```
 */
export async function transformHtml(
  input: string,
  options: HtmlOptions = {}
): Promise<string> {
  if (typeof options.shouldSkipText === "function") {
    const result = await createProcessor(options).process(input)
    return String(result)
  }

  const optionsKey = JSON.stringify(
    Object.entries(options).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b))
  )

  let processor = processorCache.get(optionsKey)
  if (!processor) {
    processor = createProcessor(options)
    processorCache.set(optionsKey, processor)
  }

  const result = await processor.process(input)
  return String(result)
}
