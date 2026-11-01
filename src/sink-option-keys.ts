// Option-key lists for the Markdown and HTML sinks. They live apart from
// markdown.ts and html.ts so the CLI can validate config keys without loading
// those modules, which import the optional unified/remark/rehype peers.

import { REHYPE_ONLY_OPTION_KEYS, REHYPE_OPTION_KEYS } from "./rehype.js"
import { TRANSFORM_OPTION_KEYS } from "./transform-options.js"

/** Runtime list of valid `transformMarkdown` option keys. */
export const MARKDOWN_OPTION_KEYS: readonly string[] = TRANSFORM_OPTION_KEYS

/** Option keys handled by the HTML pipeline (parser plus rehype plugin)
 * rather than `transform()`. */
export const HTML_ONLY_OPTION_KEYS: readonly string[] = ["fragment", ...REHYPE_ONLY_OPTION_KEYS]

/** Runtime list of valid `transformHtml` option keys. */
export const HTML_OPTION_KEYS: readonly string[] = [...REHYPE_OPTION_KEYS, "fragment"]
