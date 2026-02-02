import type { Element, Text, ElementContent } from "hast"
import { h } from "hastscript"
import { unified } from "unified"
import rehypeParse from "rehype-parse"
import rehypeStringify from "rehype-stringify"
import {
  rehypePunctilio,
  type RehypePunctilioOptions,
  transformElement,
  flattenTextNodes,
} from "../rehype.js"
import { UNICODE_SYMBOLS, DEFAULT_SEPARATOR } from "../constants.js"

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
  FRACTION_1_2,
} = UNICODE_SYMBOLS

async function processHtml(html: string, options?: RehypePunctilioOptions): Promise<string> {
  const result = await unified()
    .use(rehypeParse, { fragment: true })
    .use(rehypePunctilio, options)
    .use(rehypeStringify)
    .process(html)
  return String(result)
}

describe("rehypePunctilio", () => {
  describe("basic transformations", () => {
    it.each([
      ["quotes", '<p>"Hello," she said.</p>', [LDQ, RDQ]],
      ["apostrophes", "<p>It's a test.</p>", [RSQ]],
      ["em dashes", "<p>Wait -- here it comes.</p>", [EM_DASH]],
      ["en dashes", "<p>Pages 1-5</p>", [EN_DASH]],
      ["ellipses", "<p>Wait...</p>", [ELLIPSIS]],
      ["multiplication", "<p>5x5</p>", [MULTIPLICATION]],
      ["math symbols", "<p>x != y</p>", [NOT_EQUAL]],
      ["legal symbols", "<p>(c) 2024</p>", [COPYRIGHT]],
    ])("transforms %s", async (_name, html, expected) => {
      const result = await processHtml(html)
      expected.forEach((char) => expect(result).toContain(char))
    })
  })

  describe("HTML structure preservation", () => {
    it.each([
      ["nested elements", '<p><em>"Hello,"</em> she said.</p>', ["<em>", "</em>", LDQ, RDQ]],
      ["text spanning elements", '<p><em>"Wait</em>..."</p>', [LDQ, RDQ, ELLIPSIS]],
      ["deeply nested", '<div><p><span><strong>"Hello"</strong></span></p></div>', [LDQ, RDQ]],
      ["attributes", '<p class="intro" id="first">"Hello"</p>', ['class="intro"', 'id="first"']],
    ])("preserves %s", async (_name, html, expected) => {
      const result = await processHtml(html)
      expected.forEach((str) => expect(result).toContain(str))
    })
  })

  describe("skipped elements", () => {
    it.each(["code", "pre", "script", "style", "kbd", "var", "samp"])(
      "skips %s elements",
      async (tag) => {
        const result = await processHtml(`<${tag}>"Hello"</${tag}>`)
        expect(result).toContain('"Hello"')
        expect(result).not.toContain(LDQ)
      }
    )

    it("skips nested content inside code blocks", async () => {
      const result = await processHtml('<pre><code>"Hello" -- test...</code></pre>')
      expect(result).toContain('"Hello"')
      expect(result).toContain("--")
      expect(result).toContain("...")
    })

    it("transforms siblings of skipped elements", async () => {
      const result = await processHtml('<p><code>code</code> "Hello"</p>')
      expect(result).toContain(LDQ)
      expect(result).toContain(RDQ)
    })
  })

  describe("custom skip options", () => {
    it.each([
      ["custom tags", '<custom-tag>"Hello"</custom-tag>', { skipTags: ["custom-tag"] }],
      ["custom classes", '<p class="no-transform">"Hello"</p>', { skipClasses: ["no-transform"] }],
      ["descendants of skip classes", '<div class="raw"><p>"Hello"</p></div>', { skipClasses: ["raw"] }],
    ])("skips %s", async (_name, html, options) => {
      const result = await processHtml(html, options)
      expect(result).toContain('"Hello"')
    })
  })

  describe("transform options passthrough", () => {
    it.each([
      ["punctuationStyle american", '<p>"Hello."</p>', { punctuationStyle: "american" as const }, `${LDQ}Hello.${RDQ}`],
      ["punctuationStyle british", '<p>"Hello."</p>', { punctuationStyle: "british" as const }, `${LDQ}Hello${RDQ}.`],
      ["dashStyle american", "<p>word - word</p>", { dashStyle: "american" as const }, EM_DASH],
      ["dashStyle british", "<p>word - word</p>", { dashStyle: "british" as const }, EN_DASH],
      ["symbols enabled", "<p>5x5</p>", { symbols: true }, MULTIPLICATION],
      ["fractions enabled", "<p>1/2 cup</p>", { fractions: true }, FRACTION_1_2],
      ["custom separator", '<p>"Hello"</p>', { separator: "\uE001" }, LDQ],
    ])("respects %s", async (_name, html, options, expected) => {
      const result = await processHtml(html, options)
      expect(result).toContain(expected)
    })

    it.each([
      ["symbols disabled", "<p>5x5</p>", { symbols: false }, "5x5"],
      ["fractions disabled", "<p>1/2 cup</p>", { fractions: false }, "1/2"],
    ])("respects %s", async (_name, html, options, expected) => {
      const result = await processHtml(html, options)
      expect(result).toContain(expected)
    })
  })

  describe("complex scenarios", () => {
    it.each([
      [
        "article content",
        `<article><h1>"Title's"</h1><p>"quotes" -- dashes</p><p>Pages 1-5</p></article>`,
        [LDQ, RDQ, RSQ, EM_DASH, EN_DASH],
      ],
      [
        "mixed code and prose",
        '<p>The function <code>getValue()</code> returns "the value" -- useful.</p>',
        ["getValue()", LDQ, RDQ, EM_DASH],
      ],
      [
        "table content",
        '<table><tr><th>"Header"</th><td>Pages 1-5</td></tr></table>',
        [LDQ, RDQ, EN_DASH],
      ],
      [
        "list content",
        '<ul><li>"First" -- important</li><li>Pages 1-5</li></ul>',
        [LDQ, EM_DASH, EN_DASH],
      ],
    ])("handles %s", async (_name, html, expected) => {
      const result = await processHtml(html)
      expected.forEach((str) => expect(result).toContain(str))
    })
  })

  describe("edge cases", () => {
    it.each([
      ["empty paragraphs", "<p></p>", "<p></p>"],
      ["whitespace-only", "<p>   </p>", "<p>"],
      ["special characters", "<p>Café &amp; résumé</p>", "Café"],
      ["emoji", '<p>"Hello 👋"</p>', "👋"],
      ["links", '<p><a href="https://example.com">"Link"</a></p>', 'href="https://example.com"'],
    ])("handles %s", async (_name, html, expected) => {
      const result = await processHtml(html)
      expect(result).toContain(expected)
    })

    it("is idempotent", async () => {
      const html = '<p>"Hello," she said -- "it\'s nice."</p>'
      const firstPass = await processHtml(html)
      const secondPass = await processHtml(firstPass)
      expect(secondPass).toBe(firstPass)
    })
  })

  describe("default export", () => {
    it("exports rehypePunctilio as default", async () => {
      const { default: defaultExport } = await import("../rehype.js")
      expect(defaultExport).toBe(rehypePunctilio)
    })
  })

  describe("exported utilities", () => {
    const ignoreNone = () => false
    const ignoreCode = (el: Element) => el.tagName === "code"

    const fixtures = {
      empty: h("div", []) as Element,
      simple: h("p", "Hello, world!") as Element,
      nested: h("div", ["This is ", h("em", "emphasized"), " text."]) as Element,
      withCode: h("div", ["This is ", h("code", "ignored"), " text."]) as Element,
      emptyAndComment: h("div", [
        h("span"),
        { type: "comment", value: "comment" } as unknown as ElementContent,
      ]) as Element,
      deeplyNested: h("div", [
        "Level 1 ",
        h("span", ["Level 2 ", h("em", "Level 3")]),
        " End",
      ]) as Element,
    }

    describe("flattenTextNodes", () => {
      it.each([
        ["empty element", fixtures.empty, ignoreNone, []],
        ["simple text", fixtures.simple, ignoreNone, [{ type: "text", value: "Hello, world!" }]],
        ["nested elements", fixtures.nested, ignoreNone, [
          { type: "text", value: "This is " },
          { type: "text", value: "emphasized" },
          { type: "text", value: " text." },
        ]],
        ["with ignored code", fixtures.withCode, ignoreCode, [
          { type: "text", value: "This is " },
          { type: "text", value: " text." },
        ]],
        ["empty spans and comments", fixtures.emptyAndComment, ignoreNone, []],
        ["deeply nested", fixtures.deeplyNested, ignoreNone, [
          { type: "text", value: "Level 1 " },
          { type: "text", value: "Level 2 " },
          { type: "text", value: "Level 3" },
          { type: "text", value: " End" },
        ]],
      ])("handles %s", (_name, node, skip, expected) => {
        expect(flattenTextNodes(node, skip)).toEqual(expected)
      })

      it("extracts from single text node", () => {
        const textNode: Text = { type: "text", value: "Hello" }
        expect(flattenTextNodes(textNode, ignoreNone)).toEqual([textNode])
      })

      it("stops at max recursion depth", () => {
        let deep: Element = h("span", "deep") as Element
        for (let i = 0; i < 1005; i++) deep = h("div", [deep]) as Element
        expect(flattenTextNodes(deep, ignoreNone)).toHaveLength(0)
      })
    })

    describe("transformElement", () => {
      const toUpper = (s: string) => s.toUpperCase()

      it.each([
        ["simple element", h("p", "hello"), "HELLO"],
        ["custom separator", h("p", "hello"), "HELLO", "\uE001"],
      ])("transforms %s", (_name, element, expected, sep = DEFAULT_SEPARATOR) => {
        transformElement(element as Element, toUpper, ignoreNone, sep)
        expect((element.children[0] as Text).value).toBe(expected)
      })

      it("transforms across multiple nodes", () => {
        const element = h("p", ["hello ", h("em", "world")]) as Element
        transformElement(element, toUpper, ignoreNone, DEFAULT_SEPARATOR)
        expect((element.children[0] as Text).value).toBe("HELLO ")
        expect(((element.children[1] as Element).children[0] as Text).value).toBe("WORLD")
      })

      it("skips matching elements", () => {
        const element = h("p", ["before ", h("code", "unchanged"), " after"]) as Element
        transformElement(element, toUpper, ignoreCode, DEFAULT_SEPARATOR)
        expect((element.children[0] as Text).value).toBe("BEFORE ")
        expect(((element.children[1] as Element).children[0] as Text).value).toBe("unchanged")
        expect((element.children[2] as Text).value).toBe(" AFTER")
      })

      it("applies custom transforms", () => {
        const element = h("p", "pages 1-5") as Element
        transformElement(element, (s) => s.replace(/-/g, "–"), ignoreNone, DEFAULT_SEPARATOR)
        expect((element.children[0] as Text).value).toBe("pages 1–5")
      })

      it("handles missing children gracefully", () => {
        const node = h("div") as Element
        node.children = undefined as unknown as Element["children"]
        expect(() => transformElement(node, toUpper, ignoreNone, DEFAULT_SEPARATOR)).not.toThrow()
      })

      it("throws on altered text node count", () => {
        const node = h("p", "hello") as Element
        const badTransform = (s: string) => s.replace("hello", `hello${DEFAULT_SEPARATOR}extra${DEFAULT_SEPARATOR}`)
        expect(() => transformElement(node, badTransform, ignoreNone, DEFAULT_SEPARATOR)).toThrow(
          "Transformation altered the number of text nodes"
        )
      })
    })
  })

  describe("coverage edge cases", () => {
    it.each([
      ["space-separated class string", '<p class="foo bar no-transform">"Hello"</p>', { skipClasses: ["no-transform"] }, '"Hello"'],
      ["HTML comments", '<p>"Hello"<!-- comment --></p>', {}, "<!-- comment -->"],
      ["non-text children only", '<div><img src="test.jpg" alt="test"></div>', {}, '<img src="test.jpg"'],
      ["skip class at root", '<p class="skip">"Hello"</p>', { skipClasses: ["skip"] }, '"Hello"'],
      ["nested skipped elements", '<pre><p>"Hello"</p></pre>', {}, '"Hello"'],
      ["multiple skip classes", '<p class="a b">"Hello"</p>', { skipClasses: ["b"] }, '"Hello"'],
    ])("handles %s", async (_name, html, options, expected) => {
      const result = await processHtml(html, options)
      expect(result).toContain(expected)
    })

    it("handles skipped child within non-skipped parent", async () => {
      const result = await processHtml('<div>"Before" <code>"Inside"</code> "After"</div>')
      expect(result).toContain(LDQ)
      expect(result).toContain('"Inside"')
    })

    it("handles mixed skip and non-skip siblings", async () => {
      const result = await processHtml('<article><p>"Hello"</p><pre>"Code"</pre><p>"World"</p></article>')
      expect(result).toMatch(new RegExp(`<p>${LDQ}Hello${RDQ}</p>`))
      expect(result).toMatch(new RegExp(`<p>${LDQ}World${RDQ}</p>`))
      expect(result).toContain('<pre>"Code"</pre>')
    })
  })
})

describe("separator injection protection", () => {
  it("throws when transform injects separators", () => {
    const element = h("p", "hello world") as Element
    const maliciousTransform = (text: string): string =>
      text.replace("hello", `hello${DEFAULT_SEPARATOR}injected`)
    expect(() => {
      transformElement(element, maliciousTransform, () => false, DEFAULT_SEPARATOR)
    }).toThrow("Transformation altered the number of text nodes")
  })

  it("throws when transform removes separators", () => {
    const element = h("p", ["hello ", h("em", "world")]) as Element
    const maliciousTransform = (text: string): string =>
      text.replace(DEFAULT_SEPARATOR, "")
    expect(() => {
      transformElement(element, maliciousTransform, () => false, DEFAULT_SEPARATOR)
    }).toThrow("Transformation altered the number of text nodes")
  })
})
