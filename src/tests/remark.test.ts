import { unified } from "unified"
import remarkParse from "remark-parse"
import remarkGfm from "remark-gfm"
import remarkStringify from "remark-stringify"
import { remarkPunctilio, type RemarkPunctilioOptions } from "../remark.js"
import { UNICODE_SYMBOLS } from "../constants.js"

const {
  LEFT_DOUBLE_QUOTE: LDQ,
  RIGHT_DOUBLE_QUOTE: RDQ,
  RIGHT_SINGLE_QUOTE: RSQ,
  EM_DASH,
  EN_DASH,
  ELLIPSIS,
  MULTIPLICATION,
  MINUS,
  NOT_EQUAL,
  COPYRIGHT,
  NBSP,
  FRACTION_1_2,
} = UNICODE_SYMBOLS

async function processMarkdown(
  markdown: string,
  options?: RemarkPunctilioOptions
): Promise<string> {
  const result = await unified()
    .use(remarkParse)
    .use(remarkPunctilio, options)
    .use(remarkStringify)
    .process(markdown)
  return String(result).trimEnd()
}

async function processGfmMarkdown(
  markdown: string,
  options?: RemarkPunctilioOptions
): Promise<string> {
  const result = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkPunctilio, options)
    .use(remarkStringify)
    .process(markdown)
  return String(result).trimEnd()
}

describe("remarkPunctilio", () => {
  describe("basic transformations (nbsp enabled)", () => {
    it.each([
      ["quotes", '"Hello," she said.', `${LDQ}Hello,${RDQ} she${NBSP}said.`],
      ["apostrophes", "It's a test.", `It${RSQ}s a${NBSP}test.`],
      ["em dashes", "Wait -- here it comes.", `Wait${EM_DASH}here it${NBSP}comes.`],
      ["en dashes (number range)", "Pages 1-5", `Pages${NBSP}1${EN_DASH}5`],
      ["ellipses", "Wait...", `Wait${ELLIPSIS}`],
      ["multiplication", "5x5", `5${MULTIPLICATION}5`],
      ["math symbols", "x != y", `x${NBSP}${NOT_EQUAL} y`],
      ["legal symbols", "(c) 2024", `${COPYRIGHT}${NBSP}2024`],
    ])("transforms %s", async (_name, input, expected) => {
      expect(await processMarkdown(input, { nbsp: true })).toEqual(expected)
    })
  })

  describe("nbsp default", () => {
    it.each([
      ["unspecified (markdown default: off)", undefined, `Dr. Smith arrived.`],
      ["explicit nbsp: undefined (markdown default: off)", { nbsp: undefined }, `Dr. Smith arrived.`],
      ["explicit true", { nbsp: true }, `Dr.${NBSP}Smith arrived.`],
      ["explicit false", { nbsp: false }, `Dr. Smith arrived.`],
    ])("%s", async (_name, options, expected) => {
      expect(await processMarkdown("Dr. Smith arrived.", options)).toEqual(expected)
    })
  })

  describe("basic transformations (nbsp disabled)", () => {
    it.each([
      ["quotes", '"Hello," she said.', `${LDQ}Hello,${RDQ} she said.`],
      ["apostrophes", "It's a test.", `It${RSQ}s a test.`],
      ["em dashes", "Wait -- here it comes.", `Wait${EM_DASH}here it comes.`],
      ["ellipses", "Wait...", `Wait${ELLIPSIS}`],
      ["multiplication", "5x5", `5${MULTIPLICATION}5`],
      ["math symbols", "x != y", `x ${NOT_EQUAL} y`],
      ["legal symbols", "(c) 2024", `${COPYRIGHT} 2024`],
    ])("transforms %s", async (_name, input, expected) => {
      expect(await processMarkdown(input, { nbsp: false })).toEqual(expected)
    })
  })

  describe("inline element boundaries", () => {
    it.each([
      ["quotes spanning emphasis", '"Hello," *she* said.', `${LDQ}Hello,${RDQ} *she* said.`],
      ["quotes inside emphasis", '*"Hello,"* she said.', `*${LDQ}Hello,${RDQ}* she said.`],
      ["apostrophe in strong", "**It's** fine.", `**It${RSQ}s** fine.`],
      ["dash between elements", "word *one* -- *two* word", `word *one*${EM_DASH}*two* word`],
      ["deeply nested elements", '*"Hello **beautiful** world"*', `*${LDQ}Hello **beautiful** world${RDQ}*`],
    ])("handles %s", async (_name, input, expected) => {
      expect(await processMarkdown(input, { nbsp: false })).toEqual(expected)
    })
  })

  describe("code preservation", () => {
    it.each([
      ["inline code", '`"Hello" -- test...`'],
      ["fenced code blocks", '```\n"Hello" -- test...\n```'],
      ["indented code blocks", '    "Hello" -- test...'],
    ])("does not transform %s", async (_name, input) => {
      const result = await processMarkdown(input, { nbsp: false })
      expect(result).toContain('"Hello" -- test...')
      expect(result).not.toContain(LDQ)
      expect(result).not.toContain(EM_DASH)
      expect(result).not.toContain(ELLIPSIS)
    })

    it("transforms text alongside inline code", async () => {
      expect(await processMarkdown('`code` "Hello"', { nbsp: false }))
        .toEqual(`\`code\` ${LDQ}Hello${RDQ}`)
    })
  })

  describe("opaque inline content is an impassable gap", () => {
    // Inline code and images visually separate their neighbors, so a pass must
    // not treat the surrounding text as adjacent across them.
    it.each([
      ["inline code blocks multiplication", "5`c`x 3", "5`c`x 3"],
      ["inline code blocks a numeric range", "1`c`-5", `1\`c\`${MINUS}5`],
      ["inline code blocks an attached multiplier", "5`c`x5", "5`c`x5"],
      ["image blocks a numeric range", "1![x](y)-5", `1![x](y)${MINUS}5`],
    ])("%s", async (_name, input, expected) => {
      expect(await processMarkdown(input, { nbsp: false })).toEqual(expected)
    })
  })

  describe("element types", () => {
    it.each([
      ["h1", '# "Hello"', `# ${LDQ}Hello${RDQ}`],
      ["h2", '## It\'s nice', `## It${RSQ}s nice`],
      ["h3", "### Wait -- really?", `### Wait${EM_DASH}really?`],
      ["list items", '- "Hello" -- world', `* ${LDQ}Hello${RDQ}${EM_DASH}world`],
      ["blockquotes", '> "Hello," she said.', `> ${LDQ}Hello,${RDQ} she said.`],
    ])("transforms %s", async (_name, input, expected) => {
      expect(await processMarkdown(input, { nbsp: false })).toEqual(expected)
    })

    it.each([
      ["nested list items", '- outer "quote"\n  - inner "quote"', `* outer ${LDQ}quote${RDQ}\n  * inner ${LDQ}quote${RDQ}`],
      ["link text", '["Hello," she said.](https://example.com)', `[${LDQ}Hello,${RDQ} she said.](https://example.com)`],
      ["text around links", '"Hello" [link](url) "world"', `${LDQ}Hello${RDQ} [link](url) ${LDQ}world${RDQ}`],
      ["text around images", '"Hello" ![img](url) "world"', `${LDQ}Hello${RDQ} ![img](url) ${LDQ}world${RDQ}`],
      ["inline HTML boundaries", '"Hello"<br>"world"', `${LDQ}Hello${RDQ}<br>${LDQ}world${RDQ}`],
      ["hard line breaks", '"Hello"  \n"world"', `${LDQ}Hello${RDQ}\\\n${LDQ}world${RDQ}`],
    ])("transforms text in %s", async (_name, input, expected) => {
      expect(await processMarkdown(input, { nbsp: false })).toEqual(expected)
    })
  })

  describe("GFM extensions", () => {
    it.each([
      ["table cells", '| "Hello" | world |\n| --- | --- |\n| "test" | data |', `| ${LDQ}Hello${RDQ} | world |\n| ------- | ----- |\n| ${LDQ}test${RDQ}  | data  |`],
      ["strikethrough", '~~"Hello" -- world~~', `~~${LDQ}Hello${RDQ}${EM_DASH}world~~`],
    ])("transforms %s", async (_name, input, expected) => {
      expect(await processGfmMarkdown(input, { nbsp: false })).toEqual(expected)
    })
  })

  describe("transform options passthrough", () => {
    it.each([
      ["punctuationStyle american", '"Hello."', { punctuationStyle: "american" as const, nbsp: false as const }, `${LDQ}Hello.${RDQ}`],
      ["punctuationStyle british", '"Hello."', { punctuationStyle: "british" as const, nbsp: false as const }, `${LDQ}Hello${RDQ}.`],
      ["dashStyle american", "word - word", { dashStyle: "american" as const, nbsp: false as const }, `word${EM_DASH}word`],
      ["dashStyle british", "word - word", { dashStyle: "british" as const, nbsp: false as const }, `word ${EN_DASH} word`],
      ["symbols disabled", "5x5", { symbols: false, nbsp: false as const }, "5x5"],
      ["fractions enabled", "1/2 cup", { fractions: true, nbsp: false as const }, `${FRACTION_1_2} cup`],
      ["fractions disabled", "1/2 cup", { fractions: false, nbsp: false as const }, "1/2 cup"],
    ])("respects %s", async (_name, input, options, expected) => {
      expect(await processMarkdown(input, options)).toEqual(expected)
    })
  })

  describe("option key validation", () => {
    it.each(["emphasisMarker", "skipTags", "fraction"])(
      'rejects unknown option key "%s" at plugin construction',
      (key) => {
        expect(() => remarkPunctilio({ [key]: true } as never))
          .toThrow(`Unknown option "${key}" for remarkPunctilio`)
      },
    )
  })

  describe("complex documents", () => {
    it("transforms a multi-paragraph document", async () => {
      const input = '"Hello," she said.\n\nIt\'s a nice day -- isn\'t it?\n\nWait...'
      const expected = `${LDQ}Hello,${RDQ} she said.\n\nIt${RSQ}s a nice day${EM_DASH}isn${RSQ}t it?\n\nWait${ELLIPSIS}`
      expect(await processMarkdown(input, { nbsp: false })).toEqual(expected)
    })

    it("preserves code blocks among transformed paragraphs", async () => {
      const input = '"Transform this"\n\n```\n"Leave this alone"\n```\n\n"Transform this too"'
      const expected = `${LDQ}Transform this${RDQ}\n\n\`\`\`\n"Leave this alone"\n\`\`\`\n\n${LDQ}Transform this too${RDQ}`
      expect(await processMarkdown(input, { nbsp: false })).toEqual(expected)
    })
  })

  it("is idempotent", async () => {
    const first = await processMarkdown('"Hello," she said -- "it\'s pages 1-5."', { nbsp: false })
    expect(await processMarkdown(first, { nbsp: false })).toEqual(first)
  })

  describe("nested blockquotes", () => {
    it.each([
      ["single level", '> "Hello," she said.', `> ${LDQ}Hello,${RDQ} she said.`],
      ["double level", '> > "Hello," she said.', `> > ${LDQ}Hello,${RDQ} she said.`],
      ["blockquote with emphasis", '> *"Hello,"* she said.', `> *${LDQ}Hello,${RDQ}* she said.`],
      ["multiple paragraphs in blockquote", '> "First."\n>\n> "Second."', `> ${LDQ}First.${RDQ}\n>\n> ${LDQ}Second.${RDQ}`],
    ])("transforms %s", async (_name, input, expected) => {
      expect(await processMarkdown(input, { nbsp: false })).toEqual(expected)
    })
  })

  describe("combined transforms in single paragraph", () => {
    it.each([
      [
        "quotes + dashes + ellipsis",
        '"Wait..." -- she said.',
        `${LDQ}Wait${ELLIPSIS}${RDQ}${EM_DASH}she said.`,
      ],
      [
        "quotes + multiplication + math",
        '"5x5 != 26"',
        `${LDQ}5${MULTIPLICATION}5 ${NOT_EQUAL} 26${RDQ}`,
      ],
      [
        "all major transforms",
        '"It\'s 5x5..." -- (c) 2024',
        `${LDQ}It${RSQ}s 5${MULTIPLICATION}5${ELLIPSIS}${RDQ}${EM_DASH}${COPYRIGHT} 2024`,
      ],
    ])("transforms %s", async (_name, input, expected) => {
      expect(await processMarkdown(input, { nbsp: false })).toEqual(expected)
    })
  })

  describe("empty and whitespace-only content", () => {
    it.each([
      ["empty paragraph", "", ""],
      ["whitespace paragraph", "   ", ""],
      ["empty heading", "#", "#"],
    ])("handles %s gracefully", async (_name, input, expected) => {
      expect(await processMarkdown(input, { nbsp: false })).toEqual(expected)
    })
  })

  describe("cross-element integrity", () => {
    it("preserves cross-element quote pairing", async () => {
      const input = '*"Hello,* world"'
      const result = await processMarkdown(input, { nbsp: false })
      expect(result).toContain(LDQ)
      expect(result).toContain(RDQ)
    })

    it("handles many inline elements without corruption", async () => {
      const input = '*a* **b** *c* **d** *e* **f** *g* "hello"'
      const result = await processMarkdown(input, { nbsp: false })
      expect(result).toContain(LDQ)
      expect(result).toContain(RDQ)
    })
  })

  describe("stress tests", () => {
    it("handles many paragraphs", async () => {
      const count = 100
      const paragraphs = Array.from({ length: count }, () => '"Hello," she said.').join("\n\n")
      const result = await processMarkdown(paragraphs, { nbsp: false })
      const matchCount = (result.match(new RegExp(LDQ, "g")) ?? []).length
      expect(matchCount).toBe(count)
    })

    it("handles paragraph with many inline elements", async () => {
      const count = 50
      const inlines = Array.from({ length: count }, (_, i) => `*"word${i}"*`).join(" ")
      const result = await processMarkdown(inlines, { nbsp: false })
      const matchCount = (result.match(new RegExp(LDQ, "g")) ?? []).length
      expect(matchCount).toBe(count)
    })

    it("handles quotes spanning nested inline elements", async () => {
      // Exercises text node flattening across multiple nesting levels:
      // emphasis inside strong inside link text
      const md = `[**"Hello,** *world"*](url)`
      const result = await processMarkdown(md, { nbsp: false })
      expect(result).toContain(LDQ)
      expect(result).toContain(RDQ)
    })
  })
})
