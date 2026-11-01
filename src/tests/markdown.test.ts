import { readFileSync } from "fs"
import { resolve } from "path"
import { fileURLToPath } from "url"
import { globSync } from "tinyglobby"

import { clearProcessorCache, transformMarkdown, transformMarkdownSync } from "../markdown.js"
import { markdownTextOracle } from "./markdown-oracle.js"
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
  afterEach(() => {
    clearProcessorCache()
  })

  it("transforms basic typography", async () => {
    const result = await transformMarkdown('"Hello," she said.', { nbsp: false })
    expect(result.trimEnd()).toEqual(`${LDQ}Hello,${RDQ} she said.`)
  })

  it.each(["skipTags", "fragment", "fraction", "emphasisMarker"])(
    'rejects unknown option key "%s"',
    async (key) => {
      await expect(transformMarkdown("hi", { [key]: true } as never))
        .rejects.toThrow(`Unknown option "${key}" for transformMarkdown`)
    },
  )

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

  it("uses default options when none provided", async () => {
    const result = await transformMarkdown('"Hello"')
    expect(result.trimEnd()).toEqual(`${LDQ}Hello${RDQ}`)
  })

  it.each([
    ["plain separators", '| Flag | Default |\n| --- | --- |\n| "a" | b |'],
    ["alignment markers", '| Left | Center | Right |\n| :--- | :---: | ---: |\n| "a" | b | c |'],
    ["long separators", '| Col |\n| -------------------- |\n| "data" |'],
  ])("preserves GFM table separators (%s)", async (_name, input) => {
    const result = await transformMarkdown(input, { nbsp: false })
    expect(result).not.toContain(EM_DASH)
    expect(result).toContain(LDQ)
  })

  it("reuses cached processor for identical options", async () => {
    const opts = { punctuationStyle: "british" as const, nbsp: false }
    const first = await transformMarkdown('"Hello."', opts)
    const second = await transformMarkdown('"World."', opts)
    expect(first.trimEnd()).toEqual(`${LDQ}Hello${RDQ}.`)
    expect(second.trimEnd()).toEqual(`${LDQ}World${RDQ}.`)
  })

  it("invalidates cache when options change", async () => {
    const american = await transformMarkdown('"Hello."', { punctuationStyle: "american", nbsp: false })
    const british = await transformMarkdown('"Hello."', { punctuationStyle: "british", nbsp: false })
    expect(american.trimEnd()).toEqual(`${LDQ}Hello.${RDQ}`)
    expect(british.trimEnd()).toEqual(`${LDQ}Hello${RDQ}.`)
  })

  it("LRU cache retains multiple option sets simultaneously", async () => {
    const american = { punctuationStyle: "american" as const, nbsp: false }
    const british = { punctuationStyle: "british" as const, nbsp: false }
    // Populate both cache entries
    await transformMarkdown('"A."', american)
    await transformMarkdown('"B."', british)
    // Both should still be cached (not evicted)
    const a2 = await transformMarkdown('"C."', american)
    const b2 = await transformMarkdown('"D."', british)
    expect(a2.trimEnd()).toEqual(`${LDQ}C.${RDQ}`)
    expect(b2.trimEnd()).toEqual(`${LDQ}D${RDQ}.`)
  })

  it("treats undefined options the same as absent options", async () => {
    const withDefault = await transformMarkdown("Dr. Smith")
    const withUndefined = await transformMarkdown("Dr. Smith", { nbsp: undefined })
    expect(withDefault).not.toContain("\u00A0")
    expect(withUndefined).not.toContain("\u00A0")
  })

  it.each([
    ["unspecified (markdown default: off)", {}, false],
    ["explicit true", { nbsp: true }, true],
    ["explicit false", { nbsp: false }, false],
  ])("nbsp %s", async (_name, options, expectNbsp) => {
    const result = await transformMarkdown("Dr. Smith arrived.", options)
    expect(result.includes("\u00A0")).toBe(expectNbsp)
  })

  // Punctuation that is the only text of a mark stays in it: moving it out
  // would leave an empty mark, which is bare delimiters in the source.
  it.each([
    ['"x"_,_ y\n', `${LDQ}x${RDQ}_,_ y\n`, "american"],
    ['"x"**_,_** y\n', `${LDQ}x${RDQ}**_,_** y\n`, "american"],
    ['"x"~~.~~ y\n', `${LDQ}x${RDQ}~~.~~ y\n`, "american"],
    ['"a"[_,_](u) b\n', `${LDQ}a${RDQ}[_,_](u) b\n`, "american"],
    ['"x *,*" y\n', `${LDQ}x *,*${RDQ} y\n`, "british"],
  ] as const)("keeps a mark whose only text is movable punctuation: %j", async (input, expected, punctuationStyle) => {
    const once = await transformMarkdown(input, { punctuationStyle })
    expect(once).toBe(expected)
    expect(await transformMarkdown(once, { punctuationStyle })).toBe(once)
  })

  it("transforms to a fixed point", async () => {
    const once = await transformMarkdown('"a" -- *b*...')
    expect(once).toBe(`${LDQ}a${RDQ}${EM_DASH}*b*${ELLIPSIS}`)
    expect(await transformMarkdown(once)).toBe(once)
  })

  const BODY_IN = '"Hello" -- *world*.\n'
  const BODY_OUT = `${LDQ}Hello${RDQ}${EM_DASH}*world*.\n`
  it.each([
    ["YAML", '---\ntitle: "Hi" -- there\ntags:\n  - a\n---\n', `\n${BODY_IN}`, `\n${BODY_OUT}`],
    ["YAML closed by ...", '---\ntitle: "Hi"\n...\n', BODY_IN, BODY_OUT],
    ["TOML", '+++\ntitle = "Hi -- there"\n+++\n', `\n${BODY_IN}`, `\n${BODY_OUT}`],
    ["CRLF YAML", '---\r\ntitle: "Hi"\r\n---\r\n', BODY_IN, BODY_OUT],
    ["YAML with an indented list", '---\nkey:\n  - "a"\n---', "", ""],
    ["empty YAML", "---\n---\n", BODY_IN, BODY_OUT],
  ])("passes %s front matter through untouched", async (_label, frontmatter, bodyIn, bodyOut) => {
    const result = await transformMarkdown(frontmatter + bodyIn, { nbsp: false })
    expect(result).toBe(frontmatter + bodyOut)
  })

  it.each([
    ["an unterminated opening fence", '---\ntitle: "Hi"\n'],
    ["a mismatched closing fence", '---\ntitle: "Hi"\n+++\n'],
    ["front matter that is not at the very start", '\n---\ntitle: "Hi"\n---\n'],
    ["a fence with trailing text", '--- yaml\ntitle: "Hi"\n---\n'],
    ["a first line named constructor", 'constructor\n"Hi"\n'],
    ["a first line named __proto__", '__proto__\n"Hi"\n'],
    ["a first line named toString", 'toString\n"Hi"\n'],
    ["a first line named hasOwnProperty", 'hasOwnProperty\n"Hi"\n'],
  ])("does not treat %s as front matter", async (_label, input) => {
    const result = await transformMarkdown(input, { nbsp: false })
    expect(result).toContain(LDQ)
  })

  it.each([
    ["YAML front matter", '---\ntitle: "Hi" -- there\n---\n\n', '"Hello"\n'],
    ["no front matter", "", '"Hello"\n'],
  ])("restores a leading BOM and detects front matter behind it (%s)", async (_label, frontmatter, body) => {
    const result = await transformMarkdown(`\uFEFF${frontmatter}${body}`, { nbsp: false })
    expect(result).toBe(`\uFEFF${frontmatter}${LDQ}Hello${RDQ}\n`)
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
      const transformed = transform(line, { nbsp: false, collapseSpaces: false })
      expect(transformed).toBe(line)
    }
  })
})

describe("transformMarkdownSync", () => {
  it.each([
    ["bare brackets", "See [note] and [^1] and [[wiki]] and [1][4][5]."],
    ["links", 'A [link](http://x.com "title") here.'],
    ["underscores", "snake_case_name"],
    ["list markers", "- one\n+ two\n"],
    ["tables", "| a | b |\n|---|:-:|\n| x | y |\n"],
    ["thematic breaks", "a\n\n***\n\nb\n\n---\n"],
    ["inline code", 'Use `"raw"` here'],
    ["angle autolinks", "<https://x.com/a...b>"],
    ["autolinks with references", "<https://a.com/?x&amp;y...>"],
    ["shortcut references", "[foo--bar]\n\n[foo--bar]: /u"],
    ["collapsed references", "[foo--bar][]\n\n[foo--bar]: /u"],
    ["a missing final newline", "*a*"],
    ["an empty document", ""],
    ["a document of only front matter", '---\ntitle: "a"\n---\n'],
  ])("preserves %s verbatim", (_label, input) => {
    expect(transformMarkdownSync(input)).toBe(input)
  })

  it.each([
    ["quotes and em dash", 'She said "hi" --- [a] *b*', `She said ${LDQ}hi${RDQ}${EM_DASH}[a] *b*`],
    ["escaped brackets kept", 'Say "hi" \\[x\\] "bye"', `Say ${LDQ}hi${RDQ} \\[x\\] ${LDQ}bye${RDQ}`],
    ["character reference replaced", "&quot;hi&quot;", `${LDQ}hi${RDQ}`],
    ["blockquote continuation", '> "a\n> b"', `> ${LDQ}a\n> b${RDQ}`],
    ["list item text", '- "one" -- two\n* x', `- ${LDQ}one${RDQ}${EM_DASH}two\n* x`],
    ["table cell", '| "a" |\n|---|\n| b... |\n', `| ${LDQ}a${RDQ} |\n|---|\n| b${ELLIPSIS} |\n`],
    ["quote spanning emphasis", '"*hi*"', `${LDQ}*hi*${RDQ}`],
    ["literal autolink beside prose", 'see https://x.com/2020-2021 "q"', `see https://x.com/2020-2021 ${LDQ}q${RDQ}`],
    ["a quoted shortcut reference", '"[foo]" bar\n\n[foo]: /u', `${LDQ}[foo]${RDQ} bar\n\n[foo]: /u`],
    ["full reference label", "[a--b][r]\n\n[r]: /u", `[a${EM_DASH}b][r]\n\n[r]: /u`],
    ["inline link text", "[x--y](http://u--v)", `[x${EM_DASH}y](http://u--v)`],
    ["escaped > after blockquote marker", "> a\n> \\>= b", "> a\n> \u2265 b"],
    ["nested containers", '> - "a\n>   b"', `> - ${LDQ}a\n>   b${RDQ}`],
    ["CRLF line endings", '"a"\r\n"b"', `${LDQ}a${RDQ}\r\n${LDQ}b${RDQ}`],
    ["astral characters", '"\u{1F600} x"', `${LDQ}\u{1F600} x${RDQ}`],
    ["URL found by the autolink transform", 'He said "see https://x.com/a...b"', `He said ${LDQ}see <https://x.com/a...b>${RDQ}`],
    ["transform URL between siblings", '*a* "|https://x.com/a--b" *c*', `*a* ${LDQ}|<https://x.com/a--b>${RDQ} *c*`],
    ["transform email after an escape", '"hi" a\\_b@example.com...', `${LDQ}hi${RDQ} a\\_b@example.com${ELLIPSIS}`],
    ["paragraph that is wholly a transform run", 'a\\_b@example.com "q"', `a\\_b@example.com ${LDQ}q${RDQ}`],
    ["a setext heading made of a bare link run", '"www.x.co"\n--', `${LDQ}[www.x.co](http://www.x.co)${RDQ}\n--`],
    ["a task list item with a bare link run", '- [ ] see www.x.co "q"', `- [ ] see www.x.co ${LDQ}q${RDQ}`],
    ["a setext heading after a definition", '[r]: /u\n\nsee www.x.co "q"\n--', `[r]: /u\n\nsee www.x.co ${LDQ}q${RDQ}\n--`],
    ["an ellipsis that empties the text after an emphasis", "_._..", `_${ELLIPSIS}_`],
    ["a mailto link", '"mailto:a@b.com" -- x', `${LDQ}mailto:a@b.com${RDQ}${EM_DASH}x`],
    ["escaped characters punctilio rewrites", '\\"hi\\" a \\-\\- b', `${LDQ}hi${RDQ} a${EM_DASH}b`],
    ["CRLF front matter behind a BOM", '\uFEFF---\r\ntitle: "a"\r\n---\r\n\r\n"b"\r\n', `\uFEFF---\r\ntitle: "a"\r\n---\r\n\r\n${LDQ}b${RDQ}\r\n`],
    ["task list items", '- [ ] "a"\n- [x] b...', `- [ ] ${LDQ}a${RDQ}\n- [x] b${ELLIPSIS}`],
    // Content before a paragraph's first text keeps its dash from reading as line-leading.
    ["a dash after a leading bare URL", "https://x.com -- A", `<https://x.com>${EM_DASH}A`],
    ["a dash after leading inline code", "`c` -- A", `\`c\`${EM_DASH}A`],
    ["a dash after a leading image", "![i](u) -- A", `![i](u)${EM_DASH}A`],
    ["a line-leading dash", "-- A", `${EM_DASH} A`],
  ])("transforms %s", (_label, input, expected) => {
    expect(transformMarkdownSync(input)).toBe(expected)
  })

  // A bare link would swallow the edit after it, so it is written as an
  // explicit link with the same URL and text.
  it.each([
    ["a URL before an em dash", "see https://x.com -- it's", `see <https://x.com>${EM_DASH}it${RSQ}s`],
    ["a URL before an ellipsis", "see https://x.com/a... ok", `see <https://x.com/a>${ELLIPSIS} ok`],
    ["a www link", "see www.x.com... ok", `see [www.x.com](http://www.x.com)${ELLIPSIS} ok`],
    ["a URL in a heading", "# see https://x.com -- b", `# see <https://x.com>${EM_DASH}b`],
    ["a www link with a bracket in its text", "see www.x.co[a] -- b", `see [www.x.co\\[a](http://www.x.co[a)]${EM_DASH}b`],
    ["a www link with a character reference", "see www.x.co/a&amp;b... ok", `see [www.x.co/a\\&amp;b](http://www.x.co/a\\&amp;b)${ELLIPSIS} ok`],
    // GFM keeps the backslash in a www link's text and URL.
    ["a www link with a backslash", String.raw`see www.x.co/a\_b... ok`, String.raw`see [www.x.co/a\\\_b](http://www.x.co/a\\_b)` + `${ELLIPSIS} ok`],
    ["only the link beside an edit", "www.x.co... and www.y.co today", `[www.x.co](http://www.x.co)${ELLIPSIS} and www.y.co today`],
    ["only the URL beside an edit", '"x" https://a.co/b "y" https://c.co... z', `${LDQ}x${RDQ} https://a.co/b ${LDQ}y${RDQ} <https://c.co>${ELLIPSIS} z`],
  ])("delimits %s", (_label, input, expected) => {
    expect(transformMarkdownSync(input)).toBe(expected)
  })

  // These edits would change which characters delimit emphasis.
  it.each([
    ["a multiplication sign beside an emphasis delimiter", "3*x5*"],
    ["an em dash that makes a delimiter run both-flanking", '**"a"* -- b*'],
    ["a paragraph whose bare link is not the cause", "see https://x.com 3*x5*"],
  ])("keeps a paragraph as written when its edits would change its structure: %s", (_label, input) => {
    expect(transformMarkdownSync(input)).toBe(input)
  })

  it("repairs every paragraph that parses differently", () => {
    expect(transformMarkdownSync("a https://x.com -- b\n\n3*x5*\n\n> c https://y.com -- d\n"))
      .toBe(`a <https://x.com>${EM_DASH}b\n\n3*x5*\n\n> c <https://y.com>${EM_DASH}d\n`)
  })

  it("keeps only the paragraph whose edits would change its structure", () => {
    expect(transformMarkdownSync('"a"\n\n3*x5*\n\n"b"\n')).toBe(`${LDQ}a${RDQ}\n\n3*x5*\n\n${LDQ}b${RDQ}\n`)
  })
})

describe("transformMarkdown corpus oracle", () => {
  const FRONTMATTER_RE = /^---\r?\n[\s\S]*?\r?\n---\r?\n/
  const repoRoot = resolve(__dirname, "../..")
  const files = globSync("**/*.md", {
    cwd: repoRoot,
    dot: true,
    ignore: ["**/node_modules/**", "dist/**", ".stryker-tmp/**", "reports/**", ".claude/worktrees/**"],
  })

  it("finds the corpus", () => {
    expect(files.length).toBeGreaterThan(10)
  })

  // Re-parsing the output must yield exactly the text remarkPunctilio
  // produces on the parsed input: every edit was written in place.
  it.each(files)("%s", (file) => {
    const input = readFileSync(resolve(repoRoot, file), "utf-8").replace(FRONTMATTER_RE, "")
    const { transformed, actual } = markdownTextOracle(input, transformMarkdownSync(input))
    expect(actual).toEqual(transformed)
  })
})
