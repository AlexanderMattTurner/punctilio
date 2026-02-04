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
      ["quotes", '<p>"Hello," she said.</p>', `<p>${LDQ}Hello,${RDQ} she said.</p>`],
      ["apostrophes", "<p>It's a test.</p>", `<p>It${RSQ}s a test.</p>`],
      ["em dashes", "<p>Wait -- here it comes.</p>", `<p>Wait${EM_DASH}here it comes.</p>`],
      ["en dashes", "<p>Pages 1-5</p>", `<p>Pages 1${EN_DASH}5</p>`],
      ["ellipses", "<p>Wait...</p>", `<p>Wait${ELLIPSIS}</p>`],
      ["multiplication", "<p>5x5</p>", `<p>5${MULTIPLICATION}5</p>`],
      ["math symbols", "<p>x != y</p>", `<p>x ${NOT_EQUAL} y</p>`],
      ["legal symbols", "<p>(c) 2024</p>", `<p>${COPYRIGHT} 2024</p>`],
    ])("transforms %s", async (_name, html, expected) => {
      expect(await processHtml(html)).toEqual(expected)
    })
  })

  describe("HTML structure preservation", () => {
    it.each([
      ["nested elements", '<p><em>"Hello,"</em> she said.</p>', `<p><em>${LDQ}Hello,${RDQ}</em> she said.</p>`],
      ["text spanning elements", '<p><em>"Wait</em>..."</p>', `<p><em>${LDQ}Wait</em>${ELLIPSIS}${RDQ}</p>`],
      ["deeply nested", '<div><p><span><strong>"Hello"</strong></span></p></div>', `<div><p><span><strong>${LDQ}Hello${RDQ}</strong></span></p></div>`],
      ["attributes", '<p class="intro" id="first">"Hello"</p>', `<p class="intro" id="first">${LDQ}Hello${RDQ}</p>`],
    ])("preserves %s", async (_name, html, expected) => {
      expect(await processHtml(html)).toEqual(expected)
    })
  })

  describe("skipped elements", () => {
    it.each(["code", "pre", "script", "style", "kbd", "var", "samp"])(
      "skips %s elements",
      async (tag) => {
        expect(await processHtml(`<${tag}>"Hello"</${tag}>`)).toEqual(`<${tag}>"Hello"</${tag}>`)
      }
    )

    it("skips nested content inside code blocks", async () => {
      expect(await processHtml('<pre><code>"Hello" -- test...</code></pre>')).toEqual(
        '<pre><code>"Hello" -- test...</code></pre>'
      )
    })

    it("transforms siblings of skipped elements", async () => {
      expect(await processHtml('<p><code>code</code> "Hello"</p>')).toEqual(
        `<p><code>code</code> ${LDQ}Hello${RDQ}</p>`
      )
    })
  })

  describe("custom skip options", () => {
    it.each([
      ["custom tags", '<custom-tag>"Hello"</custom-tag>', { skipTags: ["custom-tag"] }, '<custom-tag>"Hello"</custom-tag>'],
      ["custom classes", '<p class="no-transform">"Hello"</p>', { skipClasses: ["no-transform"] }, '<p class="no-transform">"Hello"</p>'],
      ["descendants of skip classes", '<div class="raw"><p>"Hello"</p></div>', { skipClasses: ["raw"] }, '<div class="raw"><p>"Hello"</p></div>'],
    ])("skips %s", async (_name, html, options, expected) => {
      expect(await processHtml(html, options)).toEqual(expected)
    })
  })

  describe("transform options passthrough", () => {
    it.each([
      ["punctuationStyle american", '<p>"Hello."</p>', { punctuationStyle: "american" as const }, `<p>${LDQ}Hello.${RDQ}</p>`],
      ["punctuationStyle british", '<p>"Hello."</p>', { punctuationStyle: "british" as const }, `<p>${LDQ}Hello${RDQ}.</p>`],
      ["dashStyle american", "<p>word - word</p>", { dashStyle: "american" as const }, `<p>word${EM_DASH}word</p>`],
      ["dashStyle british", "<p>word - word</p>", { dashStyle: "british" as const }, `<p>word ${EN_DASH} word</p>`],
      ["symbols enabled", "<p>5x5</p>", { symbols: true }, `<p>5${MULTIPLICATION}5</p>`],
      ["symbols disabled", "<p>5x5</p>", { symbols: false }, "<p>5x5</p>"],
      ["fractions enabled", "<p>1/2 cup</p>", { fractions: true }, `<p>${FRACTION_1_2} cup</p>`],
      ["fractions disabled", "<p>1/2 cup</p>", { fractions: false }, "<p>1/2 cup</p>"],
      ["custom separator", '<p>"Hello"</p>', { separator: "\uE001" }, `<p>${LDQ}Hello${RDQ}</p>`],
    ])("respects %s", async (_name, html, options, expected) => {
      expect(await processHtml(html, options)).toEqual(expected)
    })
  })

  describe("complex scenarios", () => {
    it.each([
      [
        "article content",
        `<article><h1>"Title's"</h1><p>"quotes" -- dashes</p><p>Pages 1-5</p></article>`,
        `<article><h1>${LDQ}Title${RSQ}s${RDQ}</h1><p>${LDQ}quotes${RDQ}${EM_DASH}dashes</p><p>Pages 1${EN_DASH}5</p></article>`,
      ],
      [
        "mixed code and prose",
        '<p>The function <code>getValue()</code> returns "the value" -- useful.</p>',
        `<p>The function <code>getValue()</code> returns ${LDQ}the value${RDQ}${EM_DASH}useful.</p>`,
      ],
      [
        "table content",
        '<table><tr><th>"Header"</th><td>Pages 1-5</td></tr></table>',
        `<table><tbody><tr><th>${LDQ}Header${RDQ}</th><td>Pages 1${EN_DASH}5</td></tr></tbody></table>`,
      ],
      [
        "list content",
        '<ul><li>"First" -- important</li><li>Pages 1-5</li></ul>',
        `<ul><li>${LDQ}First${RDQ}${EM_DASH}important</li><li>Pages 1${EN_DASH}5</li></ul>`,
      ],
    ])("handles %s", async (_name, html, expected) => {
      expect(await processHtml(html)).toEqual(expected)
    })
  })

  describe("edge cases", () => {
    it.each([
      ["empty paragraphs", "<p></p>", "<p></p>"],
      ["whitespace-only", "<p>   </p>", "<p> </p>"],
      ["special characters", "<p>Café &amp; résumé</p>", "<p>Café &#x26; résumé</p>"],
      ["emoji", '<p>"Hello 👋"</p>', `<p>${LDQ}Hello 👋${RDQ}</p>`],
      ["links", '<p><a href="https://example.com">"Link"</a></p>', `<p><a href="https://example.com">${LDQ}Link${RDQ}</a></p>`],
    ])("handles %s", async (_name, html, expected) => {
      expect(await processHtml(html)).toEqual(expected)
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

      it.each([
        ["injecting separators", h("p", "hello"), (s: string) => s.replace("hello", `hello${DEFAULT_SEPARATOR}injected`)],
        ["removing separators", h("p", ["hello ", h("em", "world")]), (s: string) => s.replace(DEFAULT_SEPARATOR, "")],
      ])("throws on %s", (_name, element, transform) => {
        expect(() => transformElement(element as Element, transform, () => false, DEFAULT_SEPARATOR)).toThrow(
          "Transformation altered the number of text nodes"
        )
      })
    })
  })

  describe("coverage edge cases", () => {
    it.each([
      ["space-separated class string", '<p class="foo bar no-transform">"Hello"</p>', { skipClasses: ["no-transform"] }, '<p class="foo bar no-transform">"Hello"</p>'],
      ["HTML comments", '<p>"Hello"<!-- comment --></p>', {}, `<p>${LDQ}Hello${RDQ}<!-- comment --></p>`],
      ["non-text children only", '<div><img src="test.jpg" alt="test"></div>', {}, '<div><img src="test.jpg" alt="test"></div>'],
      ["skip class at root", '<p class="skip">"Hello"</p>', { skipClasses: ["skip"] }, '<p class="skip">"Hello"</p>'],
      ["nested skipped elements", '<pre><p>"Hello"</p></pre>', {}, '<pre><p>"Hello"</p></pre>'],
      ["multiple skip classes", '<p class="a b">"Hello"</p>', { skipClasses: ["b"] }, '<p class="a b">"Hello"</p>'],
    ])("handles %s", async (_name, html, options, expected) => {
      expect(await processHtml(html, options)).toEqual(expected)
    })

    it("handles skipped child within non-skipped parent", async () => {
      expect(await processHtml('<div>"Before" <code>"Inside"</code> "After"</div>')).toEqual(
        `<div>${LDQ}Before${RDQ} <code>"Inside"</code> ${LDQ}After${RDQ}</div>`
      )
    })

    it("handles mixed skip and non-skip siblings", async () => {
      expect(await processHtml('<article><p>"Hello"</p><pre>"Code"</pre><p>"World"</p></article>')).toEqual(
        `<article><p>${LDQ}Hello${RDQ}</p><pre>"Code"</pre><p>${LDQ}World${RDQ}</p></article>`
      )
    })
  })
})
