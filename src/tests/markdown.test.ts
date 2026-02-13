import { transformMarkdown } from "../markdown.js"
import { UNICODE_SYMBOLS } from "../constants.js"

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

    const result = await transformMarkdown(input, { nbsp: false })
    expect(result).toContain(LDQ)
    expect(result).toContain(RSQ)
    expect(result).toContain(EM_DASH)
    expect(result).toContain(ELLIPSIS)
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
    ["bulletMarker", "- item", { bulletMarker: "+" as const }, "+"],
    ["emphasisMarker", "*italic*", { emphasisMarker: "_" as const }, "_italic_"],
    ["strongMarker", "**bold**", { strongMarker: "_" as const }, "__bold__"],
    ["ruleMarker", "---", { ruleMarker: "*" as const }, "***"],
  ])("passes through %s option", async (_name, input, options, expected) => {
    const result = await transformMarkdown(input, { ...options, nbsp: false })
    expect(result.trimEnd()).toContain(expected)
  })

  it("uses default options when none provided", async () => {
    const result = await transformMarkdown('"Hello"')
    expect(result).toContain(LDQ)
    expect(result).toContain(RDQ)
  })
})
