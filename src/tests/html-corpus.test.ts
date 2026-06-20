/**
 * Forward regression snapshot of boundary-composition behavior over nested
 * inline HTML. Each snippet exercises the rehype boundary-composition path —
 * quotes, dashes, contractions, and primes that straddle element edges — across
 * the four punctuation styles.
 *
 * A failure means transformHtml output changed. If the change is intentional,
 * regenerate via `node scripts/generate-html-corpus.mjs` AND enumerate the
 * before/after diff in the PR description. Never regenerate to silence a failure
 * you do not understand.
 */

import { readFileSync } from "fs"
import { resolve } from "path"
import { fileURLToPath } from "url"

import { type PunctuationStyle } from "../index.js"
import { transformHtml } from "../html.js"

const __dirname = fileURLToPath(new URL(".", import.meta.url))

interface CorpusEntry {
  input: string
  outputs: Record<string, string>
}

interface Corpus {
  htmlStyles: PunctuationStyle[]
  html: CorpusEntry[]
}

const corpus: Corpus = JSON.parse(
  readFileSync(resolve(__dirname, "html-corpus/corpus.json"), "utf8")
)

const HTML_STYLES = corpus.htmlStyles

describe("html corpus", () => {
  it.each(corpus.html)(
    "transformHtml($input)",
    async ({ input, outputs }) => {
      for (const style of HTML_STYLES) {
        const expected = outputs[style]
        const actual = await transformHtml(input, { punctuationStyle: style })
        if (actual !== expected) {
          throw new Error(
            `Mismatch\n  input:    ${JSON.stringify(input)}\n  style:    ${style}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`
          )
        }
      }
    }
  )
})
