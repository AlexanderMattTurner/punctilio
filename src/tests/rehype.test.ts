import type { Element, Text, ElementContent } from "hast"
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
    describe("flattenTextNodes", () => {
      const noSkip = () => false
      const skipCode = (n: Element) => n.tagName === "code"

      it("extracts text from a single text node", () => {
        const textNode: Text = { type: "text", value: "Hello" }
        const result = flattenTextNodes(textNode, noSkip)
        expect(result).toHaveLength(1)
        expect(result[0].value).toBe("Hello")
      })

      it("extracts text from element with text children", () => {
        const element: Element = {
          type: "element",
          tagName: "p",
          properties: {},
          children: [
            { type: "text", value: "Hello " },
            { type: "text", value: "world" },
          ],
        }
        const result = flattenTextNodes(element, noSkip)
        expect(result).toHaveLength(2)
        expect(result.map((n) => n.value)).toEqual(["Hello ", "world"])
      })

      it("extracts text from nested elements", () => {
        const element: Element = {
          type: "element",
          tagName: "p",
          properties: {},
          children: [
            { type: "text", value: "Start " },
            {
              type: "element",
              tagName: "em",
              properties: {},
              children: [{ type: "text", value: "middle" }],
            },
            { type: "text", value: " end" },
          ],
        }
        const result = flattenTextNodes(element, noSkip)
        expect(result).toHaveLength(3)
        expect(result.map((n) => n.value)).toEqual(["Start ", "middle", " end"])
      })

      it("skips elements matching the skip predicate", () => {
        const element: Element = {
          type: "element",
          tagName: "p",
          properties: {},
          children: [
            { type: "text", value: "Before " },
            {
              type: "element",
              tagName: "code",
              properties: {},
              children: [{ type: "text", value: "skipped" }],
            },
            { type: "text", value: " after" },
          ],
        }
        const result = flattenTextNodes(element, skipCode)
        expect(result).toHaveLength(2)
        expect(result.map((n) => n.value)).toEqual(["Before ", " after"])
      })

      it("returns empty array for skipped root element", () => {
        const element: Element = {
          type: "element",
          tagName: "code",
          properties: {},
          children: [{ type: "text", value: "content" }],
        }
        const result = flattenTextNodes(element, skipCode)
        expect(result).toHaveLength(0)
      })

      it("ignores non-text, non-element nodes", () => {
        const element: Element = {
          type: "element",
          tagName: "p",
          properties: {},
          children: [
            { type: "text", value: "text" },
            { type: "comment", value: "comment" } as unknown as ElementContent,
          ],
        }
        const result = flattenTextNodes(element, noSkip)
        expect(result).toHaveLength(1)
        expect(result[0].value).toBe("text")
      })

      it("stops recursion at max depth to prevent stack overflow", () => {
        // Build a deeply nested structure that exceeds MAX_RECURSION_DEPTH (1000)
        let deepElement: Element = {
          type: "element",
          tagName: "span",
          properties: {},
          children: [{ type: "text", value: "deep" }],
        }
        for (let i = 0; i < 1005; i++) {
          deepElement = {
            type: "element",
            tagName: "div",
            properties: {},
            children: [deepElement],
          }
        }
        // Should not throw and should return empty (text is beyond depth limit)
        const result = flattenTextNodes(deepElement, noSkip)
        expect(result).toHaveLength(0)
      })
    })

    describe("transformElement", () => {
      const noSkip = () => false
      const toUpper = (s: string) => s.toUpperCase()

      it("transforms text in a simple element", () => {
        const element: Element = {
          type: "element",
          tagName: "p",
          properties: {},
          children: [{ type: "text", value: "hello" }],
        }
        transformElement(element, toUpper, noSkip, DEFAULT_SEPARATOR)
        expect((element.children[0] as Text).value).toBe("HELLO")
      })

      it("transforms text across multiple nodes preserving structure", () => {
        const element: Element = {
          type: "element",
          tagName: "p",
          properties: {},
          children: [
            { type: "text", value: "hello " },
            {
              type: "element",
              tagName: "em",
              properties: {},
              children: [{ type: "text", value: "world" }],
            },
          ],
        }
        transformElement(element, toUpper, noSkip, DEFAULT_SEPARATOR)
        expect((element.children[0] as Text).value).toBe("HELLO ")
        const em = element.children[1] as Element
        expect((em.children[0] as Text).value).toBe("WORLD")
      })

      it("skips elements matching the skip predicate", () => {
        const skipCode = (n: Element) => n.tagName === "code"
        const element: Element = {
          type: "element",
          tagName: "p",
          properties: {},
          children: [
            { type: "text", value: "before " },
            {
              type: "element",
              tagName: "code",
              properties: {},
              children: [{ type: "text", value: "unchanged" }],
            },
            { type: "text", value: " after" },
          ],
        }
        transformElement(element, toUpper, skipCode, DEFAULT_SEPARATOR)
        expect((element.children[0] as Text).value).toBe("BEFORE ")
        const code = element.children[1] as Element
        expect((code.children[0] as Text).value).toBe("unchanged")
        expect((element.children[2] as Text).value).toBe(" AFTER")
      })

      it("applies custom transform functions", () => {
        const replaceHyphens = (s: string) => s.replace(/-/g, "–")
        const element: Element = {
          type: "element",
          tagName: "p",
          properties: {},
          children: [{ type: "text", value: "pages 1-5" }],
        }
        transformElement(element, replaceHyphens, noSkip, DEFAULT_SEPARATOR)
        expect((element.children[0] as Text).value).toBe("pages 1–5")
      })

      it("works with custom separator", () => {
        const customSep = "\uE001"
        const element: Element = {
          type: "element",
          tagName: "p",
          properties: {},
          children: [{ type: "text", value: "hello" }],
        }
        transformElement(element, toUpper, noSkip, customSep)
        expect((element.children[0] as Text).value).toBe("HELLO")
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
