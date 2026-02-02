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
  LEFT_DOUBLE_QUOTE,
  RIGHT_DOUBLE_QUOTE,
  RIGHT_SINGLE_QUOTE,
  EM_DASH,
  EN_DASH,
  ELLIPSIS,
  MULTIPLICATION,
  NOT_EQUAL,
  COPYRIGHT,
} = UNICODE_SYMBOLS

/**
 * Helper function to process HTML through the rehype-punctilio plugin.
 */
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
    it("transforms straight quotes to smart quotes", async () => {
      const html = '<p>"Hello," she said.</p>'
      const result = await processHtml(html)
      expect(result).toContain(LEFT_DOUBLE_QUOTE)
      expect(result).toContain(RIGHT_DOUBLE_QUOTE)
    })

    it("transforms apostrophes", async () => {
      const html = "<p>It's a test.</p>"
      const result = await processHtml(html)
      expect(result).toContain(RIGHT_SINGLE_QUOTE)
    })

    it("transforms em dashes", async () => {
      const html = "<p>Wait -- here it comes.</p>"
      const result = await processHtml(html)
      expect(result).toContain(EM_DASH)
    })

    it("transforms en dashes for number ranges", async () => {
      const html = "<p>Pages 1-5</p>"
      const result = await processHtml(html)
      expect(result).toContain(EN_DASH)
    })

    it("transforms ellipses", async () => {
      const html = "<p>Wait...</p>"
      const result = await processHtml(html)
      expect(result).toContain(ELLIPSIS)
    })

    it("transforms multiplication signs", async () => {
      const html = "<p>5x5</p>"
      const result = await processHtml(html)
      expect(result).toContain(MULTIPLICATION)
    })

    it("transforms math symbols", async () => {
      const html = "<p>x != y</p>"
      const result = await processHtml(html)
      expect(result).toContain(NOT_EQUAL)
    })

    it("transforms legal symbols", async () => {
      const html = "<p>(c) 2024</p>"
      const result = await processHtml(html)
      expect(result).toContain(COPYRIGHT)
    })
  })

  describe("HTML structure preservation", () => {
    it("preserves nested HTML structure", async () => {
      const html = '<p><em>"Hello,"</em> she said.</p>'
      const result = await processHtml(html)
      expect(result).toContain("<em>")
      expect(result).toContain("</em>")
    })

    it("handles text spanning multiple elements", async () => {
      const html = '<p><em>"Wait</em>..."</p>'
      const result = await processHtml(html)
      // Should transform the quotes correctly despite spanning elements
      expect(result).toContain(LEFT_DOUBLE_QUOTE)
      expect(result).toContain(RIGHT_DOUBLE_QUOTE)
      expect(result).toContain(ELLIPSIS)
    })

    it("handles deeply nested elements", async () => {
      const html = '<div><p><span><strong>"Hello"</strong></span></p></div>'
      const result = await processHtml(html)
      expect(result).toContain(LEFT_DOUBLE_QUOTE)
      expect(result).toContain(RIGHT_DOUBLE_QUOTE)
    })

    it("preserves attributes on elements", async () => {
      const html = '<p class="intro" id="first">"Hello"</p>'
      const result = await processHtml(html)
      expect(result).toContain('class="intro"')
      expect(result).toContain('id="first"')
    })
  })

  describe("skipped elements", () => {
    it.each([
      ["code", '<code>"Hello"</code>'],
      ["pre", '<pre>"Hello"</pre>'],
      ["script", '<script>"Hello"</script>'],
      ["style", '<style>"Hello"</style>'],
      ["kbd", '<kbd>"Hello"</kbd>'],
      ["var", '<var>"Hello"</var>'],
      ["samp", '<samp>"Hello"</samp>'],
    ])("skips %s elements", async (_tag, html) => {
      const result = await processHtml(html)
      expect(result).toContain('"Hello"')
      expect(result).not.toContain(LEFT_DOUBLE_QUOTE)
    })

    it("skips nested content inside code blocks", async () => {
      const html = '<pre><code>"Hello" -- test...</code></pre>'
      const result = await processHtml(html)
      expect(result).toContain('"Hello"')
      expect(result).toContain("--")
      expect(result).toContain("...")
    })

    it("transforms siblings of skipped elements", async () => {
      const html = '<p><code>code</code> "Hello"</p>'
      const result = await processHtml(html)
      expect(result).toContain(LEFT_DOUBLE_QUOTE)
      expect(result).toContain(RIGHT_DOUBLE_QUOTE)
    })
  })

  describe("custom skip options", () => {
    it("skips custom tags", async () => {
      const html = '<custom-tag>"Hello"</custom-tag>'
      const result = await processHtml(html, { skipTags: ["custom-tag"] })
      expect(result).toContain('"Hello"')
    })

    it("skips elements with custom classes", async () => {
      const html = '<p class="no-transform">"Hello"</p>'
      const result = await processHtml(html, { skipClasses: ["no-transform"] })
      expect(result).toContain('"Hello"')
    })

    it("skips descendants of elements with skip classes", async () => {
      const html = '<div class="raw"><p>"Hello"</p></div>'
      const result = await processHtml(html, { skipClasses: ["raw"] })
      expect(result).toContain('"Hello"')
    })
  })

  describe("transform options passthrough", () => {
    it("respects punctuationStyle option", async () => {
      const html = '<p>"Hello."</p>'

      const americanResult = await processHtml(html, { punctuationStyle: "american" })
      expect(americanResult).toContain(`${LEFT_DOUBLE_QUOTE}Hello.${RIGHT_DOUBLE_QUOTE}`)

      const britishResult = await processHtml(html, { punctuationStyle: "british" })
      expect(britishResult).toContain(`${LEFT_DOUBLE_QUOTE}Hello${RIGHT_DOUBLE_QUOTE}.`)
    })

    it("respects dashStyle option", async () => {
      const html = "<p>word - word</p>"

      const americanResult = await processHtml(html, { dashStyle: "american" })
      expect(americanResult).toContain(EM_DASH)

      const britishResult = await processHtml(html, { dashStyle: "british" })
      expect(britishResult).toContain(EN_DASH)
    })

    it("respects symbols option", async () => {
      const html = "<p>5x5</p>"

      const withSymbols = await processHtml(html, { symbols: true })
      expect(withSymbols).toContain(MULTIPLICATION)

      const withoutSymbols = await processHtml(html, { symbols: false })
      expect(withoutSymbols).toContain("5x5")
    })

    it("respects fractions option", async () => {
      const html = "<p>1/2 cup</p>"

      const withFractions = await processHtml(html, { fractions: true })
      expect(withFractions).toContain(UNICODE_SYMBOLS.FRACTION_1_2)

      const withoutFractions = await processHtml(html, { fractions: false })
      expect(withoutFractions).toContain("1/2")
    })

    it("respects custom separator option", async () => {
      const customSep = "\uE001"
      const html = '<p>"Hello"</p>'
      const result = await processHtml(html, { separator: customSep })
      expect(result).toContain(LEFT_DOUBLE_QUOTE)
      expect(result).toContain(RIGHT_DOUBLE_QUOTE)
    })
  })

  describe("complex real-world scenarios", () => {
    it("handles article content with multiple paragraph types", async () => {
      const html = `
        <article>
          <h1>"The Article's Title"</h1>
          <p>First paragraph with "quotes" and dashes -- like this.</p>
          <blockquote>A quote: "Something meaningful..."</blockquote>
          <p>Pages 1-5 contain the introduction.</p>
        </article>
      `
      const result = await processHtml(html)
      expect(result).toContain(LEFT_DOUBLE_QUOTE)
      expect(result).toContain(RIGHT_DOUBLE_QUOTE)
      expect(result).toContain(RIGHT_SINGLE_QUOTE)
      expect(result).toContain(EM_DASH)
      expect(result).toContain(EN_DASH)
      expect(result).toContain(ELLIPSIS)
    })

    it("handles mixed content with code and prose", async () => {
      const html = `
        <p>The function <code>getValue()</code> returns "the value" -- which is useful.</p>
      `
      const result = await processHtml(html)
      expect(result).toContain("getValue()")
      expect(result).toContain(LEFT_DOUBLE_QUOTE)
      expect(result).toContain(RIGHT_DOUBLE_QUOTE)
      expect(result).toContain(EM_DASH)
    })

    it("handles table content", async () => {
      const html = `
        <table>
          <tr>
            <th>"Header"</th>
            <td>Pages 1-5</td>
          </tr>
        </table>
      `
      const result = await processHtml(html)
      expect(result).toContain(LEFT_DOUBLE_QUOTE)
      expect(result).toContain(RIGHT_DOUBLE_QUOTE)
      expect(result).toContain(EN_DASH)
    })

    it("handles list content", async () => {
      const html = `
        <ul>
          <li>"First item" -- important</li>
          <li>Pages 1-5</li>
        </ul>
      `
      const result = await processHtml(html)
      expect(result).toContain(LEFT_DOUBLE_QUOTE)
      expect(result).toContain(EM_DASH)
      expect(result).toContain(EN_DASH)
    })
  })

  describe("edge cases", () => {
    it("handles empty paragraphs", async () => {
      const html = "<p></p>"
      const result = await processHtml(html)
      expect(result).toBe("<p></p>")
    })

    it("handles whitespace-only content", async () => {
      const html = "<p>   </p>"
      const result = await processHtml(html)
      expect(result).toContain("<p>")
    })

    it("handles special characters", async () => {
      const html = "<p>Café &amp; résumé</p>"
      const result = await processHtml(html)
      expect(result).toContain("Café")
      expect(result).toContain("résumé")
    })

    it("handles emoji", async () => {
      const html = '<p>"Hello 👋 world"</p>'
      const result = await processHtml(html)
      expect(result).toContain("👋")
      expect(result).toContain(LEFT_DOUBLE_QUOTE)
    })

    it("handles links", async () => {
      const html = '<p><a href="https://example.com">"Link text"</a></p>'
      const result = await processHtml(html)
      expect(result).toContain('href="https://example.com"')
      expect(result).toContain(LEFT_DOUBLE_QUOTE)
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

    // Test nodes using hastscript for cleaner syntax
    const testNodes = {
      empty: h("div", []) as Element,
      simple: h("p", "Hello, world!") as Element,
      nested: h("div", ["This is ", h("em", "emphasized"), " text."]) as Element,
      withCode: h("div", ["This is ", h("code", "ignored"), " text."]) as Element,
      emptyAndComment: h("div", [
        h("span"),
        { type: "comment", value: "This is a comment" } as unknown as ElementContent,
      ]) as Element,
      deeplyNested: h("div", [
        "Level 1 ",
        h("span", ["Level 2 ", h("em", "Level 3")]),
        " End",
      ]) as Element,
    }

    describe("flattenTextNodes", () => {
      it("handles various node structures", () => {
        expect(flattenTextNodes(testNodes.empty, ignoreNone)).toEqual([])
        expect(flattenTextNodes(testNodes.simple, ignoreNone)).toEqual([
          { type: "text", value: "Hello, world!" },
        ])
        expect(flattenTextNodes(testNodes.nested, ignoreNone)).toEqual([
          { type: "text", value: "This is " },
          { type: "text", value: "emphasized" },
          { type: "text", value: " text." },
        ])
        expect(flattenTextNodes(testNodes.withCode, ignoreCode)).toEqual([
          { type: "text", value: "This is " },
          { type: "text", value: " text." },
        ])
        expect(flattenTextNodes(testNodes.emptyAndComment, ignoreNone)).toEqual([])
        expect(flattenTextNodes(testNodes.deeplyNested, ignoreNone)).toEqual([
          { type: "text", value: "Level 1 " },
          { type: "text", value: "Level 2 " },
          { type: "text", value: "Level 3" },
          { type: "text", value: " End" },
        ])
      })

      it("extracts text from a single text node", () => {
        const textNode: Text = { type: "text", value: "Hello" }
        const result = flattenTextNodes(textNode, ignoreNone)
        expect(result).toHaveLength(1)
        expect(result[0].value).toBe("Hello")
      })

      it("stops recursion at max depth to prevent stack overflow", () => {
        let deepElement: Element = h("span", "deep") as Element
        for (let i = 0; i < 1005; i++) {
          deepElement = h("div", [deepElement]) as Element
        }
        const result = flattenTextNodes(deepElement, ignoreNone)
        expect(result).toHaveLength(0)
      })
    })

    describe("transformElement", () => {
      const toUpper = (s: string) => s.toUpperCase()

      it("transforms text in a simple element", () => {
        const element = h("p", "hello") as Element
        transformElement(element, toUpper, ignoreNone, DEFAULT_SEPARATOR)
        expect((element.children[0] as Text).value).toBe("HELLO")
      })

      it("transforms text across multiple nodes preserving structure", () => {
        const element = h("p", ["hello ", h("em", "world")]) as Element
        transformElement(element, toUpper, ignoreNone, DEFAULT_SEPARATOR)
        expect((element.children[0] as Text).value).toBe("HELLO ")
        const em = element.children[1] as Element
        expect((em.children[0] as Text).value).toBe("WORLD")
      })

      it("skips elements matching the skip predicate", () => {
        const element = h("p", [
          "before ",
          h("code", "unchanged"),
          " after",
        ]) as Element
        transformElement(element, toUpper, ignoreCode, DEFAULT_SEPARATOR)
        expect((element.children[0] as Text).value).toBe("BEFORE ")
        const code = element.children[1] as Element
        expect((code.children[0] as Text).value).toBe("unchanged")
        expect((element.children[2] as Text).value).toBe(" AFTER")
      })

      it("applies custom transform functions", () => {
        const replaceHyphens = (s: string) => s.replace(/-/g, "–")
        const element = h("p", "pages 1-5") as Element
        transformElement(element, replaceHyphens, ignoreNone, DEFAULT_SEPARATOR)
        expect((element.children[0] as Text).value).toBe("pages 1–5")
      })

      it("works with custom separator", () => {
        const element = h("p", "hello") as Element
        transformElement(element, toUpper, ignoreNone, "\uE001")
        expect((element.children[0] as Text).value).toBe("HELLO")
      })
    })

    describe("transformElement error conditions", () => {
      it("handles node with no children gracefully", () => {
        const nodeWithoutChildren = h("div") as Element
        nodeWithoutChildren.children = undefined as unknown as Element["children"]
        const transform = (text: string) => text.toUpperCase()
        // Should not throw - returns early for defensive reasons
        expect(() => {
          transformElement(nodeWithoutChildren, transform, ignoreNone, DEFAULT_SEPARATOR)
        }).not.toThrow()
      })

      it("throws error when transformation alters number of text nodes", () => {
        const node = h("p", "hello world") as Element
        const transform = (text: string): string =>
          text.replace("hello", `hello${DEFAULT_SEPARATOR}extra${DEFAULT_SEPARATOR}`)
        expect(() => {
          transformElement(node, transform, ignoreNone, DEFAULT_SEPARATOR)
        }).toThrow("Transformation altered the number of text nodes")
      })
    })
  })

  describe("edge cases for coverage", () => {
    it("handles class attribute as space-separated string", async () => {
      // Tests the string className branch in hasClass
      const html = '<p class="foo bar no-transform baz">"Hello"</p>'
      const result = await processHtml(html, { skipClasses: ["no-transform"] })
      expect(result).toContain('"Hello"')
      expect(result).not.toContain(LEFT_DOUBLE_QUOTE)
    })

    it("handles HTML comments (non-element, non-text nodes)", async () => {
      // Tests the return [] branch in flattenTextNodes for comment nodes
      const html = '<p>"Hello"<!-- comment --></p>'
      const result = await processHtml(html)
      expect(result).toContain(LEFT_DOUBLE_QUOTE)
      expect(result).toContain("<!-- comment -->")
    })

    it("handles elements with only non-text children", async () => {
      // Tests the textNodes.length === 0 branch in transformElement
      const html = '<div><img src="test.jpg" alt="test"></div>'
      const result = await processHtml(html)
      expect(result).toContain('<img src="test.jpg"')
    })

    it("handles skip class at root element level", async () => {
      // Tests the shouldSkip early return in collectTransformableElements
      const html = '<p class="skip-this">"Hello"</p>'
      const result = await processHtml(html, { skipClasses: ["skip-this"] })
      expect(result).toContain('"Hello"')
    })

    it("handles basic paragraph transformation", async () => {
      const html = '<p>"Test"</p>'
      const result = await processHtml(html)
      expect(result).toContain(LEFT_DOUBLE_QUOTE)
    })

    it("handles nested skipped elements correctly", async () => {
      // Element that should be skipped containing transformable content
      const html = '<pre><p>"Hello"</p></pre>'
      const result = await processHtml(html)
      expect(result).toContain('"Hello"')
    })

    it("handles multiple skip classes on same element", async () => {
      const html = '<p class="class-a class-b">"Hello"</p>'
      const result = await processHtml(html, { skipClasses: ["class-b"] })
      expect(result).toContain('"Hello"')
    })

    it("handles skipped child elements within non-skipped parents", async () => {
      // This tests the shouldSkip early return in collectTransformableElements
      // The div is not skipped, but its child code element is
      const html = '<div>"Before" <code>"Inside code"</code> "After"</div>'
      const result = await processHtml(html)
      // The quotes outside code should be transformed
      expect(result).toContain(LEFT_DOUBLE_QUOTE)
      expect(result).toContain(RIGHT_DOUBLE_QUOTE)
      // But the content inside code should not
      expect(result).toContain('"Inside code"')
    })

    it("handles nested structure with mixed skip and non-skip elements", async () => {
      const html = '<article><p>"Hello"</p><pre>"Code"</pre><p>"World"</p></article>'
      const result = await processHtml(html)
      // p elements should be transformed
      expect(result).toMatch(new RegExp(`<p>${LEFT_DOUBLE_QUOTE}Hello${RIGHT_DOUBLE_QUOTE}</p>`))
      expect(result).toMatch(new RegExp(`<p>${LEFT_DOUBLE_QUOTE}World${RIGHT_DOUBLE_QUOTE}</p>`))
      // pre should not
      expect(result).toContain('<pre>"Code"</pre>')
    })
  })
})
