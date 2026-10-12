import { clearProcessorCache, transformHtml } from "../html.js"
import { UNICODE_SYMBOLS } from "../constants.js"

const {
  LEFT_DOUBLE_QUOTE: LDQ,
  RIGHT_DOUBLE_QUOTE: RDQ,
  RIGHT_SINGLE_QUOTE: RSQ,
  EM_DASH,
  ELLIPSIS,
} = UNICODE_SYMBOLS

describe("transformHtml", () => {
  afterEach(() => {
    clearProcessorCache()
  })

  it("transforms basic typography in fragments", async () => {
    const result = await transformHtml('<p>"Hello," she said.</p>', { nbsp: false })
    expect(result).toContain(`<p>${LDQ}Hello,${RDQ} she said.</p>`)
  })

  it.each(["emphasisMarker", "bulletMarker", "fraction"])(
    'rejects unknown option key "%s"',
    async (key) => {
      await expect(transformHtml("<p>hi</p>", { [key]: true } as never))
        .rejects.toThrow(`Unknown option "${key}" for transformHtml`)
    },
  )

  it("works without options argument", async () => {
    const result = await transformHtml('<p>"Hello."</p>')
    expect(result).toContain(`${LDQ}Hello.${RDQ}`)
  })

  it("preserves <code> contents", async () => {
    const input = '<p>"prose"</p><pre><code>"untouched"</code></pre>'
    const result = await transformHtml(input, { nbsp: false })
    expect(result).toContain(`${LDQ}prose${RDQ}`)
    expect(result).toContain('"untouched"')
  })

  it.each([
    ["american", `${LDQ}Hello.${RDQ}`],
    ["british", `${LDQ}Hello${RDQ}.`],
  ] as const)("respects punctuationStyle=%s", async (style, expected) => {
    const result = await transformHtml('<p>"Hello."</p>', {
      punctuationStyle: style,
      nbsp: false,
    })
    expect(result).toContain(expected)
  })

  it("respects skipTags", async () => {
    const result = await transformHtml(
      '<p>"prose"</p><div>"div text"</div>',
      { skipTags: ["div"], nbsp: false }
    )
    expect(result).toContain(`${LDQ}prose${RDQ}`)
    expect(result).toContain('<div>"div text"</div>')
  })

  it("respects fragment=false for full documents", async () => {
    const input = '<!DOCTYPE html><html><body><p>"Hi" -- there</p></body></html>'
    const result = await transformHtml(input, { fragment: false, nbsp: false })
    expect(result).toContain(`${LDQ}Hi${RDQ}${EM_DASH}there`)
    expect(result.toLowerCase()).toContain("<!doctype html>")
  })

  const FULL_DOCUMENT_BODY = '<head><title>T</title></head><body><p>"Hi"</p></body></html>'
  it.each([
    ["a doctype", `<!DOCTYPE html><html>${FULL_DOCUMENT_BODY}`, undefined, true],
    ["a lowercase doctype", `<!doctype html><html>${FULL_DOCUMENT_BODY}`, undefined, true],
    ["an <html> tag with attributes", `<HTML lang="en">${FULL_DOCUMENT_BODY}`, undefined, true],
    ["a bare <html> tag", `<html>${FULL_DOCUMENT_BODY}`, undefined, true],
    ["a BOM and whitespace before the doctype", `\uFEFF \n<!doctype html><html>${FULL_DOCUMENT_BODY}`, undefined, true],
    ["comments before the doctype", `<!-- a --> <!-- b -->\n<!doctype html><html>${FULL_DOCUMENT_BODY}`, undefined, true],
    ["a fragment starting with a tag that merely begins with html", `<htmlx>${FULL_DOCUMENT_BODY}`, undefined, false],
    ["a plain fragment", '<p>"Hi"</p>', undefined, false],
    ["a comment followed by a fragment", `<!-- c --><p>"Hi"</p>`, undefined, false],
    ["a doctype with fragment=true", `<!doctype html><html>${FULL_DOCUMENT_BODY}`, true, false],
    ["a fragment with fragment=false", '<p>"Hi"</p>', false, true],
  ])("auto-detects full documents: %s", async (_label, input, fragment, keepsDocumentStructure) => {
    const result = (await transformHtml(input, { fragment, nbsp: false })).toLowerCase()
    expect(result.includes("<head>")).toBe(keepsDocumentStructure)
    expect(result.includes("<body>")).toBe(keepsDocumentStructure)
    expect(result).toContain(`${LDQ}hi${RDQ}`)
  })

  it("treats an unterminated leading comment as a fragment", async () => {
    expect(await transformHtml("<!-- <html>", { nbsp: false })).toBe("<!-- <html>-->")
  })

  it("transforms ellipses and em-dashes", async () => {
    const result = await transformHtml(
      "<p>Wait... it's -- complicated.</p>",
      { nbsp: false }
    )
    expect(result).toContain(`Wait${ELLIPSIS} it${RSQ}s${EM_DASH}complicated.`)
  })

  it("bypasses cache when shouldSkipText is supplied", async () => {
    // If the cache wasn't bypassed, the second call would reuse the first
    // processor (whose shouldSkipText returned false) and curl the quotes.
    const transformed = await transformHtml('<p>"a"</p>', {
      nbsp: false,
      shouldSkipText: () => false,
    })
    const skipped = await transformHtml('<p>"a"</p>', {
      nbsp: false,
      shouldSkipText: () => true,
    })
    expect(transformed).toContain(`${LDQ}a${RDQ}`)
    expect(skipped).toContain('"a"')
  })
})
