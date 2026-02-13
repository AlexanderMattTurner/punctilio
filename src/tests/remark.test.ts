import { unified } from "unified"
import remarkParse from "remark-parse"
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
      [
        "quotes spanning emphasis",
        '"Hello," *she* said.',
        `${LDQ}Hello,${RDQ} *she* said.`,
      ],
      [
        "quotes inside emphasis",
        '*"Hello,"* she said.',
        `*${LDQ}Hello,${RDQ}* she said.`,
      ],
      [
        "apostrophe in strong",
        "**It's** fine.",
        `**It${RSQ}s** fine.`,
      ],
      [
        "dash between elements",
        "word *one* -- *two* word",
        `word *one*${EM_DASH}*two* word`,
      ],
    ])("handles %s", async (_name, input, expected) => {
      expect(await processMarkdown(input, { nbsp: false })).toEqual(expected)
    })
  })

  describe("code preservation", () => {
    it("does not transform inline code", async () => {
      expect(await processMarkdown('`"Hello" -- test...`', { nbsp: false })).toEqual(
        '`"Hello" -- test...`'
      )
    })

    it("does not transform fenced code blocks", async () => {
      const input = '```\n"Hello" -- test...\n```'
      expect(await processMarkdown(input, { nbsp: false })).toEqual(input)
    })

    it("does not transform indented code blocks", async () => {
      const input = '    "Hello" -- test...'
      const result = await processMarkdown(input, { nbsp: false })
      // remark-stringify normalizes indented code to fenced code blocks,
      // but the content should remain untransformed
      expect(result).toContain('"Hello" -- test...')
    })

    it("transforms text alongside inline code", async () => {
      expect(
        await processMarkdown('`code` "Hello"', { nbsp: false })
      ).toEqual(`\`code\` ${LDQ}Hello${RDQ}`)
    })
  })

  describe("headings", () => {
    it.each([
      ["h1", '# "Hello"', `# ${LDQ}Hello${RDQ}`],
      ["h2", '## It\'s nice', `## It${RSQ}s nice`],
      ["h3 with dash", "### Wait -- really?", `### Wait${EM_DASH}really?`],
    ])("transforms %s content", async (_name, input, expected) => {
      expect(await processMarkdown(input, { nbsp: false })).toEqual(expected)
    })
  })

  describe("lists", () => {
    it("transforms list item text", async () => {
      const input = '- "Hello" -- world'
      const expected = `* ${LDQ}Hello${RDQ}${EM_DASH}world`
      expect(await processMarkdown(input, { nbsp: false })).toEqual(expected)
    })

    it("transforms nested list items", async () => {
      const input = '- outer "quote"\n  - inner "quote"'
      const result = await processMarkdown(input, { nbsp: false })
      expect(result).toContain(LDQ)
      expect(result).toContain(RDQ)
      expect(result).not.toContain('"')
    })
  })

  describe("blockquotes", () => {
    it("transforms blockquote text", async () => {
      const input = '> "Hello," she said.'
      const expected = `> ${LDQ}Hello,${RDQ} she said.`
      expect(await processMarkdown(input, { nbsp: false })).toEqual(expected)
    })
  })

  describe("transform options passthrough", () => {
    it.each([
      [
        "punctuationStyle american",
        '"Hello."',
        { punctuationStyle: "american" as const, nbsp: false as const },
        `${LDQ}Hello.${RDQ}`,
      ],
      [
        "punctuationStyle british",
        '"Hello."',
        { punctuationStyle: "british" as const, nbsp: false as const },
        `${LDQ}Hello${RDQ}.`,
      ],
      [
        "dashStyle american",
        "word - word",
        { dashStyle: "american" as const, nbsp: false as const },
        `word${EM_DASH}word`,
      ],
      [
        "dashStyle british",
        "word - word",
        { dashStyle: "british" as const, nbsp: false as const },
        `word ${EN_DASH} word`,
      ],
      [
        "symbols disabled",
        "5x5",
        { symbols: false, nbsp: false as const },
        "5x5",
      ],
      [
        "fractions enabled",
        "1/2 cup",
        { fractions: true, nbsp: false as const },
        `${FRACTION_1_2} cup`,
      ],
      [
        "fractions disabled",
        "1/2 cup",
        { fractions: false, nbsp: false as const },
        "1/2 cup",
      ],
      [
        "custom separator",
        '"Hello"',
        { separator: "\uE001", nbsp: false as const },
        `${LDQ}Hello${RDQ}`,
      ],
    ])("respects %s", async (_name, input, options, expected) => {
      expect(await processMarkdown(input, options)).toEqual(expected)
    })
  })

  describe("complex documents", () => {
    it("transforms a multi-paragraph document", async () => {
      const input = [
        '"Hello," she said.',
        "",
        "It's a nice day -- isn't it?",
        "",
        "Wait...",
      ].join("\n")

      const result = await processMarkdown(input, { nbsp: false })
      expect(result).toContain(LDQ)
      expect(result).toContain(EM_DASH)
      expect(result).toContain(ELLIPSIS)
      expect(result).not.toContain(" -- ")
      expect(result).not.toContain("...")
    })

    it("handles mixed content with code blocks", async () => {
      const input = [
        '"Transform this"',
        "",
        "```",
        '"Leave this alone"',
        "```",
        "",
        '"Transform this too"',
      ].join("\n")

      const result = await processMarkdown(input, { nbsp: false })

      // Paragraphs: transformed
      expect(result).toContain(`${LDQ}Transform this${RDQ}`)
      expect(result).toContain(`${LDQ}Transform this too${RDQ}`)
      // Code block: untouched
      expect(result).toContain('"Leave this alone"')
    })
  })

  describe("break nodes", () => {
    it("handles hard line breaks within paragraphs", async () => {
      // Two trailing spaces create a hard break node in MDAST
      const input = '"Hello"  \n"world"'
      const result = await processMarkdown(input, { nbsp: false })
      expect(result).toContain(LDQ)
      expect(result).toContain(RDQ)
    })
  })

  describe("tables", () => {
    it("transforms table cell content", async () => {
      const input = '| "Hello" | world |\n| --- | --- |\n| "test" | data |'
      const result = await processMarkdown(input, { nbsp: false })
      expect(result).toContain(LDQ)
      expect(result).toContain(RDQ)
      expect(result).not.toMatch(/(?<!\|)\s*"(?!-)/)
    })
  })

  describe("idempotency", () => {
    it("produces the same result when run twice", async () => {
      const input = '"Hello," she said -- "it\'s pages 1-5."'
      const first = await processMarkdown(input, { nbsp: false })
      const second = await processMarkdown(first, { nbsp: false })
      expect(first).toEqual(second)
    })
  })
})
