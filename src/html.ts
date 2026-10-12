import { unified } from "unified"
import rehypeParse from "rehype-parse"
import rehypeStringify from "rehype-stringify"
import QuickLRU from "quick-lru"

import { rehypePunctilio, type RehypePunctilioOptions } from "./rehype.js"
import { HTML_OPTION_KEYS } from "./sink-option-keys.js"
import { assertKnownOptionKeys, omitKeys, stableStringify } from "./utils.js"

export { HTML_ONLY_OPTION_KEYS, HTML_OPTION_KEYS } from "./sink-option-keys.js"

export interface HtmlOptions extends RehypePunctilioOptions {
  /**
   * Whether to parse the input as an HTML fragment (no implicit `<html>`,
   * `<head>`, or `<body>` wrapping). Set to `false` to parse a complete
   * document. When unset, input that begins with `<!doctype` or `<html`
   * (after an optional BOM, whitespace, and comments) is parsed as a complete
   * document and anything else as a fragment.
   */
  fragment?: boolean
}

const FULL_DOCUMENT_START_RE = /^<(?:!doctype|html)(?=[\s>/])/i

/** True when `input` starts a complete document: `<!doctype` or `<html`,
 * optionally preceded by a BOM, whitespace, and comments. */
function startsFullDocument(input: string): boolean {
  let rest = input.replace(/^\uFEFF/, "")
  for (;;) {
    rest = rest.trimStart()
    if (!rest.startsWith("<!--")) break
    const commentEnd = rest.indexOf("-->", "<!--".length)
    if (commentEnd === -1) return false
    rest = rest.slice(commentEnd + "-->".length)
  }
  return FULL_DOCUMENT_START_RE.test(rest)
}

function createProcessor(options: HtmlOptions, fragment: boolean) {
  const punctilioOptions = omitKeys(options, ["fragment"])
  return unified()
    .use(rehypeParse, { fragment })
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
  const fragment = options.fragment ?? !startsFullDocument(input)

  // Function-valued options aren't JSON-serializable, so the cache key
  // can't distinguish them. Bypass the cache to avoid returning a
  // processor wired to a different shouldSkipText.
  if (typeof options.shouldSkipText === "function") {
    const result = await createProcessor(options, fragment).process(input)
    return String(result)
  }

  const optionsKey = stableStringify({ ...options, fragment })

  let processor = processorCache.get(optionsKey)
  if (!processor) {
    processor = createProcessor(options, fragment)
    processorCache.set(optionsKey, processor)
  }

  const result = await processor.process(input)
  return String(result)
}
