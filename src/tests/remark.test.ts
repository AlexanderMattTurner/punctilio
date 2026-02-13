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
      ["apostrophes", "It's a test.", `It${RSQ}s${NBSP}a${NBSP}test.`],
      ["em dashes", "Wait -- here it comes.", `Wait${EM_DASH}here it${NBSP}comes.`],
      ["en dashes (number range)", "Pages 1-5", `Pages${NBSP}1${EN_DASH}5`],
      ["ellipses", "Wait...", `Wait${ELLIPSIS}`],
      ["multiplication", "5x5", `5${MULTIPLICATION}5`],
      ["math symbols", "x != y", `x${NBSP}${NOT_EQUAL} y`],
      ["legal symbols", "(c) 2024", `${COPYRIGHT}${NBSP}2024`],
    ])("transforms %s", async (_name, input, expected) => {
      expect(await processMarkdown(input)).toEqual(expected)
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
      expect(await processMarkdown(input, { nbsp: false })).toContain('"Hello" -- test...')
    })

    it("transforms text alongside inline code", async () => {
      expect(await processMarkdown('`code` "Hello"', { nbsp: false }))
        .toEqual(`\`code\` ${LDQ}Hello${RDQ}`)
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
      ["nested list items", '- outer "quote"\n  - inner "quote"'],
      ["link text", '["Hello," she said.](https://example.com)'],
      ["text around links", '"Hello" [link](url) "world"'],
      ["text around images", '"Hello" ![img](url) "world"'],
      ["inline HTML boundaries", '"Hello"<br>"world"'],
      ["hard line breaks", '"Hello"  \n"world"'],
    ])("transforms text in %s", async (_name, input) => {
      const result = await processMarkdown(input, { nbsp: false })
      expect(result).toContain(LDQ)
      expect(result).toContain(RDQ)
    })
  })

  describe("GFM extensions", () => {
    it.each([
      ["table cells", '| "Hello" | world |\n| --- | --- |\n| "test" | data |'],
      ["strikethrough", '~~"Hello" -- world~~'],
    ])("transforms %s", async (_name, input) => {
      const result = await processGfmMarkdown(input, { nbsp: false })
      expect(result).toContain(LDQ)
      expect(result).toContain(RDQ)
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
      ["custom separator", '"Hello"', { separator: "\uE001", nbsp: false as const }, `${LDQ}Hello${RDQ}`],
    ])("respects %s", async (_name, input, options, expected) => {
      expect(await processMarkdown(input, options)).toEqual(expected)
    })
  })

  describe("complex documents", () => {
    it("transforms a multi-paragraph document", async () => {
      const result = await processMarkdown('"Hello," she said.\n\nIt\'s a nice day -- isn\'t it?\n\nWait...', { nbsp: false })
      expect(result).toContain(LDQ)
      expect(result).toContain(EM_DASH)
      expect(result).toContain(ELLIPSIS)
      expect(result).not.toContain(" -- ")
      expect(result).not.toContain("...")
    })

    it("preserves code blocks among transformed paragraphs", async () => {
      const result = await processMarkdown('"Transform this"\n\n```\n"Leave this alone"\n```\n\n"Transform this too"', { nbsp: false })
      expect(result).toContain(`${LDQ}Transform this${RDQ}`)
      expect(result).toContain(`${LDQ}Transform this too${RDQ}`)
      expect(result).toContain('"Leave this alone"')
    })
  })

  it("is idempotent", async () => {
    const first = await processMarkdown('"Hello," she said -- "it\'s pages 1-5."', { nbsp: false })
    expect(await processMarkdown(first, { nbsp: false })).toEqual(first)
  })
})
