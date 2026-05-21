import { transformHtml, clearProcessorCache } from "../html.js"
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

  it("transforms ellipses and em-dashes", async () => {
    const result = await transformHtml(
      "<p>Wait... it's -- complicated.</p>",
      { nbsp: false }
    )
    expect(result).toContain(`Wait${ELLIPSIS} it${RSQ}s${EM_DASH}complicated.`)
  })

  it("reuses cached processor for identical options", async () => {
    const first = await transformHtml('<p>"a"</p>', { nbsp: false })
    const second = await transformHtml('<p>"b"</p>', { nbsp: false })
    expect(first).toContain(`${LDQ}a${RDQ}`)
    expect(second).toContain(`${LDQ}b${RDQ}`)
  })

  it("bypasses cache when shouldSkipText is supplied", async () => {
    let calls = 0
    const result = await transformHtml('<p>"only this"</p>', {
      nbsp: false,
      shouldSkipText: () => {
        calls += 1
        return false
      },
    })
    expect(calls).toBeGreaterThan(0)
    expect(result).toContain(`${LDQ}only this${RDQ}`)
  })
})
