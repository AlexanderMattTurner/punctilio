import { readFileSync } from "fs"
import { resolve } from "path"
import { fileURLToPath } from "url"
import { transformMarkdown } from "../markdown.js"
import { transform } from "../index.js"
import { UNICODE_SYMBOLS } from "../constants.js"

const __dirname = fileURLToPath(new URL(".", import.meta.url))

const {
  LEFT_DOUBLE_QUOTE: LDQ,
  RIGHT_DOUBLE_QUOTE: RDQ,
  RIGHT_SINGLE_QUOTE: RSQ,
  EM_DASH,
  ELLIPSIS,
} = UNICODE_SYMBOLS

describe("transformMarkdown", () => {
  it("transforms basic typography", async () => {
    const result = await transformMarkdown('"Hello," she said.', { nbsp: false })
    expect(result.trimEnd()).toEqual(`${LDQ}Hello,${RDQ} she said.`)
  })

  it("preserves code blocks", async () => {
    const input = '```\n"untouched"\n```'
    const result = await transformMarkdown(input, { nbsp: false })
    expect(result.trimEnd()).toEqual(input)
  })

  it("handles complex documents", async () => {
    const input = [
      '# "Welcome"',
      "",
      "It's great -- isn't it?",
      "",
      "Wait...",
    ].join("\n")

    const expected = [
      `# ${LDQ}Welcome${RDQ}`,
      "",
      `It${RSQ}s great${EM_DASH}isn${RSQ}t it?`,
      "",
      `Wait${ELLIPSIS}`,
      "", // remark-stringify adds trailing newline
    ].join("\n")

    expect(await transformMarkdown(input, { nbsp: false })).toEqual(expected)
  })

  it("passes through punctuationStyle option", async () => {
    const american = await transformMarkdown('"Hello."', {
      punctuationStyle: "american",
      nbsp: false,
    })
    const british = await transformMarkdown('"Hello."', {
      punctuationStyle: "british",
      nbsp: false,
    })
    expect(american.trimEnd()).toEqual(`${LDQ}Hello.${RDQ}`)
    expect(british.trimEnd()).toEqual(`${LDQ}Hello${RDQ}.`)
  })

  it.each([
    ["bulletMarker", "- item", { bulletMarker: "+" as const }, "+ item"],
    ["emphasisMarker", "*italic*", { emphasisMarker: "_" as const }, "_italic_"],
    ["strongMarker", "**bold**", { strongMarker: "_" as const }, "__bold__"],
    ["ruleMarker", "---", { ruleMarker: "*" as const }, "***"],
  ])("passes through %s option", async (_name, input, options, expected) => {
    expect((await transformMarkdown(input, { ...options, nbsp: false })).trimEnd()).toEqual(expected)
  })

  it("uses default options when none provided", async () => {
    const result = await transformMarkdown('"Hello"')
    expect(result.trimEnd()).toEqual(`${LDQ}Hello${RDQ}`)
  })

  it("escapes both opening and closing brackets in phrasing content", async () => {
    const result = await transformMarkdown("See references [1][4][5][6] for details.", {
      nbsp: false,
    })
    expect(result.trimEnd()).toEqual("See references \\[1\\]\\[4\\]\\[5\\]\\[6\\] for details.")
  })

  it("README.md prose is already typographically correct", () => {
    const readme = readFileSync(resolve(__dirname, "../../README.md"), "utf-8")
    const lines = readme.split("\n")
    let inCodeBlock = false

    for (const line of lines) {
      if (line.startsWith("```")) { inCodeBlock = !inCodeBlock; continue }
      if (inCodeBlock) continue
      // Skip non-prose: tables, badges, HTML, footnotes, headings, list items (including indented)
      if (/^[|#>\d]|^\s*-\s|^\s*\d+\.\s|^\[[\^!]|<span/.test(line)) continue
      if (line.trim() === "") continue

      // collapseSpaces: false because Markdown uses double-space for formatting
      const transformed = transform(line, { nbsp: false, collapseSpaces: false, checkIdempotency: false })
      expect(transformed).toBe(line)
    }
  })
})
