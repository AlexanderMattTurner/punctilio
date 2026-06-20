import { readFileSync } from "fs"
import { resolve } from "path"
import { fileURLToPath } from "url"

import { type PunctuationStyle, transform } from "../index.js"
import { transformHtml } from "../html.js"

const __dirname = fileURLToPath(new URL(".", import.meta.url))

interface CorpusEntry {
  input: string
  outputs: Record<string, string>
}

interface Corpus {
  stringOptionSets: Record<string, Parameters<typeof transform>[1]>
  htmlStyles: PunctuationStyle[]
  html: CorpusEntry[]
  strings: CorpusEntry[]
}

const corpus: Corpus = JSON.parse(
  readFileSync(resolve(__dirname, "golden/corpus.json"), "utf8")
)

// ---------------------------------------------------------------------------
// String cases
// ---------------------------------------------------------------------------

// Transform options are taken from the corpus's own recorded definitions so a
// regenerated corpus with a new option set is automatically exercised here.
const STRING_OPTION_SETS = corpus.stringOptionSets

describe("golden corpus — strings", () => {
  it.each(corpus.strings)(
    "transform($input)",
    ({ input, outputs }) => {
      for (const [key, expected] of Object.entries(outputs)) {
        const actual = transform(input, STRING_OPTION_SETS[key])
        if (actual !== expected) {
          throw new Error(
            `Mismatch\n  input:    ${JSON.stringify(input)}\n  opts:     ${key}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`
          )
        }
      }
    }
  )
})

// ---------------------------------------------------------------------------
// HTML cases
// ---------------------------------------------------------------------------

const HTML_STYLES = corpus.htmlStyles

describe("golden corpus — html", () => {
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
