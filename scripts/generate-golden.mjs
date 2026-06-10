/**
 * Generates src/tests/golden/corpus.json — a snapshot of the library's
 * current output used as an oracle during architecture refactors.
 *
 * Run after `pnpm build`:
 *   node scripts/generate-golden.mjs
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

import { transform } from "../dist/index.js"
import { transformHtml } from "../dist/html.js"

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(__dirname, "..")

// ---------------------------------------------------------------------------
// Sentinel check — U+E000 U+E001 are internal boundary markers that must
// never leak into final output.
// ---------------------------------------------------------------------------
function assertNoSentinels(value, label) {
  if (value.includes("") || value.includes("")) {
    throw new Error(
      `Sentinel character found in output for ${label}:\n  ${JSON.stringify(value)}`
    )
  }
}

// ---------------------------------------------------------------------------
// A. String option sets
// ---------------------------------------------------------------------------
const STRING_OPTION_SETS = {
  american: { punctuationStyle: "american" },
  british: { punctuationStyle: "british" },
  german: { punctuationStyle: "german" },
  french: { punctuationStyle: "french" },
  none: { punctuationStyle: "none" },
  "american-full": {
    punctuationStyle: "american",
    fractions: true,
    degrees: true,
    superscript: true,
    ligatures: true,
  },
  "british-dash": {
    punctuationStyle: "british",
    dashStyle: "british",
  },
}

// ---------------------------------------------------------------------------
// B. HTML snippets exercising element-boundary edge cases
// ---------------------------------------------------------------------------
const HTML_SNIPPETS = [
  // Quotes spanning <em>/<strong> boundaries
  `<p>"He said <em>'never'</em>", she replied.</p>`,
  `<p><strong>"Bold claim,"</strong> he noted.</p>`,
  `<p>"She said, <em>'yes'</em> and <em>'no'</em>".</p>`,

  // Number range split across elements
  `<p>1<em>-</em>2</p>`,
  `<p>Pages 10<strong>-</strong>20</p>`,

  // Contractions split across elements
  `<p>do<em>n't</em></p>`,
  `<p>it<strong>'</strong>s fine</p>`,

  // Possessives at element edges
  `<p>Alice<em>'s</em> book</p>`,
  `<p>the <em>team</em>'s result</p>`,

  // Ellipsis dots split across elements
  `<p>Wait<em>.</em>..</p>`,
  `<p>Hmm...<em>yes</em></p>`,

  // Primes after digits across boundaries
  `<p>5<em>'</em>10"</p>`,
  `<p>He is 6<strong>'</strong>2" tall.</p>`,

  // Multi-paragraph dialogue where each <p> opens a quote, only last closes
  `<div><p>"This is the first paragraph of dialogue.</p><p>"And this is the second."</p></div>`,

  // Nested <blockquote> with quotes
  `<blockquote><p>"Outer quote with <blockquote><p>"inner quote"</p></blockquote> embedded."</p></blockquote>`,

  // <a> links inside quoted text
  `<p>"Visit <a href="https://example.com">example.com</a>," he said.</p>`,
  `<p>"See <a href="#ref">here</a> for more."</p>`,

  // <code> spans that must be skipped
  `<p>"Use <code>transform("hello")</code> to apply."</p>`,
  `<p>The function <code>don't</code> is not transformed.</p>`,

  // German style on nested-quote snippet
  `<p>Er sagte, "Das ist <em>'gut'</em>".</p>`,

  // French style on nested-quote snippet
  `<p>Il dit, "C'est <em>'bien'</em>".</p>`,

  // NBSP-relevant cases
  `<p>Dr. <em>Smith</em> arrived.</p>`,
  `<p>100 <em>km</em> away.</p>`,
  `<p>Prof. <strong>Jones</strong> said hello.</p>`,

  // Em-dash at element boundary
  `<p>She waited--<em>and waited</em>--for the reply.</p>`,
  `<p>He paused<em>--</em>then continued.</p>`,

  // Apostrophe in year contraction at boundary
  `<p>The class of <em>'99</em> reunion.</p>`,

  // En-dash number range with surrounding elements
  `<p><em>10</em>-20 items available.</p>`,

  // Quotes with inline punctuation
  `<p>"Hello," <em>she said,</em> "how are you?"</p>`,

  // Nested quotes different levels
  `<p>"He told me, <em>'She said, "hello"'</em>."</p>`,
]

// ---------------------------------------------------------------------------
// HTML option sets
// ---------------------------------------------------------------------------
const HTML_STYLES = ["american", "british", "german", "french"]

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function generate() {
  // Load benchmark inputs
  const benchmarkCasesPath = join(repoRoot, "benchmark_cases.json")
  const benchmarkCases = JSON.parse(readFileSync(benchmarkCasesPath, "utf8"))

  const inputs = Object.values(benchmarkCases).flatMap(
    (cases) => cases.map(([input]) => input)
  )

  // A. String cases
  const stringEntries = inputs.map((input) => {
    const outputs = {}
    for (const [key, opts] of Object.entries(STRING_OPTION_SETS)) {
      const result = transform(input, opts)
      assertNoSentinels(result, `string input=${JSON.stringify(input)} opts=${key}`)
      outputs[key] = result
    }
    return { input, outputs }
  })

  // B. HTML cases
  const htmlEntries = []
  for (const snippet of HTML_SNIPPETS) {
    const outputs = {}
    for (const style of HTML_STYLES) {
      const result = await transformHtml(snippet, { punctuationStyle: style })
      assertNoSentinels(result, `html input=${JSON.stringify(snippet)} style=${style}`)
      outputs[style] = result
    }
    htmlEntries.push({ input: snippet, outputs })
  }

  const corpus = {
    stringOptionSets: STRING_OPTION_SETS,
    htmlStyles: HTML_STYLES,
    html: htmlEntries,
    strings: stringEntries,
  }

  const outDir = join(repoRoot, "src/tests/golden")
  mkdirSync(outDir, { recursive: true })
  const outPath = join(outDir, "corpus.json")
  writeFileSync(outPath, JSON.stringify(corpus, null, 2) + "\n")

  console.log(`Wrote ${stringEntries.length} string entries and ${htmlEntries.length} HTML entries to ${outPath}`)
}

generate().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
