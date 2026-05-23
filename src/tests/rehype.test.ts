import type { Element, Parent, Root, Text, ElementContent } from "hast"
import { h } from "hastscript"
import { unified } from "unified"
import rehypeParse from "rehype-parse"
import rehypeStringify from "rehype-stringify"
import {
  rehypePunctilio,
  type RehypePunctilioOptions,
  transformElement,
  flattenTextNodes,
  getTextContent,
  getFirstTextNode,
  assertSmartQuotesMatch,
  collectTransformableElements,
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
      expect(await processHtml(html, { nbsp: false })).toEqual(expected)
    })
  })

  describe("HTML structure preservation", () => {
    it.each([
      ["nested elements", '<p><em>"Hello,"</em> she said.</p>', `<p><em>${LDQ}Hello,${RDQ}</em> she said.</p>`],
      ["text spanning elements", '<p><em>"Wait</em>..."</p>', `<p><em>${LDQ}Wait</em>${ELLIPSIS}${RDQ}</p>`],
      ["deeply nested", '<div><p><span><strong>"Hello"</strong></span></p></div>', `<div><p><span><strong>${LDQ}Hello${RDQ}</strong></span></p></div>`],
      ["attributes", '<p class="intro" id="first">"Hello"</p>', `<p class="intro" id="first">${LDQ}Hello${RDQ}</p>`],
      // Regression: inline-only containers must share transformation context
      ["quotes across inline-only children", '<p><em>"Hello</em><span>, world"</span></p>', `<p><em>${LDQ}Hello</em><span>, world${RDQ}</span></p>`],
      ["dash across inline-only children", '<p><em>pages 1</em><span>-5</span></p>', `<p><em>pages 1</em><span>${EN_DASH}5</span></p>`],
      ["dialog with text", '<dialog>"Hello" -- world</dialog>', `<dialog>${LDQ}Hello${RDQ}${EM_DASH}world</dialog>`],
      ["details with direct text", '<details>"Hello" -- world</details>', `<details>${LDQ}Hello${RDQ}${EM_DASH}world</details>`],
      ["details with summary", '<details><summary>"Hello"</summary></details>', `<details><summary>${LDQ}Hello${RDQ}</summary></details>`],
    ])("preserves %s", async (_name, html, expected) => {
      expect(await processHtml(html, { nbsp: false })).toEqual(expected)
    })
  })

  describe("dashes across element boundaries", () => {
    it.each([
      ["multi-segment number preserved", "<p>1-<em>2</em>-3</p>", "<p>1-<em>2</em>-3</p>"],
      ["model name preserved", "<p><em>GPT</em>-3</p>", "<p><em>GPT</em>-3</p>"],
      ["simple range still converts", "<p>pages <em>1</em>-5</p>", `<p>pages <em>1</em>${EN_DASH}5</p>`],
      ["genuine negative at element start", "<p><em>-5</em> degrees</p>", `<p><em>${UNICODE_SYMBOLS.MINUS}5</em> degrees</p>`],
      // Regression: trailing space after a skipped element must survive em-dash conversion.
      // The space is the next text node's leading boundary, not whitespace around the dash.
      ["em-dash preserves space after skip element", "<p>a - <code>x</code> b</p>", `<p>a${EM_DASH}<code>x</code> b</p>`],
      // Regression: a sentence-final period before a skipped element must not be
      // swallowed into an ellipsis sequence that lives in the next text node.
      ["ellipsis after skip element does not eat preceding period", "<p>a. <code>x</code>... b</p>", `<p>a. <code>x</code>${ELLIPSIS} b</p>`],
      // Regression: a math operator split across an element boundary must
      // preserve the separator so transformTextNodes doesn't throw.
      ["math operator split across element boundary", "<p>x <em>!</em>= y</p>", `<p>x <em>${NOT_EQUAL}</em> y</p>`],
      // Arrow split across element boundary: dash pass must not em-dash the
      // `-`, then the arrows pass converts the whole shape. The match starts
      // in the first text node, so the arrow lands there and the em empties.
      ["right arrow split across element boundary", "<p>foo -<em>></em> bar</p>", `<p>foo ${UNICODE_SYMBOLS.ARROW_RIGHT}<em></em> bar</p>`],
      ["bidirectional arrow split across element boundary", "<p>foo <-<em>--</em>> bar</p>", `<p>foo ${UNICODE_SYMBOLS.ARROW_LEFT_RIGHT}<em></em> bar</p>`],
      // The math-symbol lookahead must see through the separator so split
      // `!==` is not misclassified as `!=`.
      ["!== split across element boundary preserved", "<p>x !<em>=</em>= y</p>", "<p>x !<em>=</em>= y</p>"],
    ])("%s", async (_name, html, expected) => {
      expect(await processHtml(html, { nbsp: false })).toEqual(expected)
    })

    // Regression: 3+ punctuation chars split across 3+ text nodes must
    // preserve every separator so the ligature pass doesn't crash. Ligatures
    // are opt-in, so this test enables them explicitly.
    it("punctuation ligature across 3 text nodes preserves every separator", async () => {
      const html = "<p>What<em>?</em>?<em>?</em> done</p>"
      const expected = `<p>What<em>${UNICODE_SYMBOLS.DOUBLE_QUESTION}</em><em></em> done</p>`
      expect(await processHtml(html, { nbsp: false, ligatures: true })).toEqual(expected)
    })
  })

  describe("skipped elements", () => {
    it.each(["code", "pre", "script", "style", "kbd", "var", "samp", "template", "math", "svg"])(
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

    it("skips template content while transforming siblings", async () => {
      expect(await processHtml('<div><p>"Hello"</p><template>"Untouched" -- raw</template></div>', { nbsp: false })).toEqual(
        `<div><p>${LDQ}Hello${RDQ}</p><template>"Untouched" -- raw</template></div>`
      )
    })

    it("skips MathML content", async () => {
      expect(await processHtml('<p>Formula: <math><mi>x</mi><mo>!=</mo><mn>5</mn></math></p>', { nbsp: false })).toEqual(
        '<p>Formula: <math><mi>x</mi><mo>!=</mo><mn>5</mn></math></p>'
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
      ["punctuationStyle american", '<p>"Hello."</p>', { punctuationStyle: "american" as const, nbsp: false as const }, `<p>${LDQ}Hello.${RDQ}</p>`],
      ["punctuationStyle british", '<p>"Hello."</p>', { punctuationStyle: "british" as const, nbsp: false as const }, `<p>${LDQ}Hello${RDQ}.</p>`],
      ["dashStyle american", "<p>word - word</p>", { dashStyle: "american" as const, nbsp: false as const }, `<p>word${EM_DASH}word</p>`],
      ["dashStyle british", "<p>word - word</p>", { dashStyle: "british" as const, nbsp: false as const }, `<p>word ${EN_DASH} word</p>`],
      ["symbols enabled", "<p>5x5</p>", { symbols: true, nbsp: false as const }, `<p>5${MULTIPLICATION}5</p>`],
      ["symbols disabled", "<p>5x5</p>", { symbols: false, nbsp: false as const }, "<p>5x5</p>"],
      ["fractions enabled", "<p>1/2 cup</p>", { fractions: true, nbsp: false as const }, `<p>${FRACTION_1_2} cup</p>`],
      ["fractions disabled", "<p>1/2 cup</p>", { fractions: false, nbsp: false as const }, "<p>1/2 cup</p>"],
      ["custom separator", '<p>"Hello"</p>', { separator: "\uE001", nbsp: false as const }, `<p>${LDQ}Hello${RDQ}</p>`],
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
      expect(await processHtml(html, { nbsp: false })).toEqual(expected)
    })
  })

  describe("edge cases", () => {
    it.each([
      ["empty paragraphs", "<p></p>", "<p></p>"],
      ["whitespace-only", "<p>   </p>", "<p>   </p>"],
      ["special characters", "<p>Café &amp; résumé</p>", "<p>Café &#x26; résumé</p>"],
      ["emoji", '<p>"Hello 👋"</p>', `<p>${LDQ}Hello 👋${RDQ}</p>`],
      ["links", '<p><a href="https://example.com">"Link"</a></p>', `<p><a href="https://example.com">${LDQ}Link${RDQ}</a></p>`],
    ])("handles %s", async (_name, html, expected) => {
      expect(await processHtml(html, { nbsp: false })).toEqual(expected)
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
        transformElement(element, (s) => s.replace(/-/g, EN_DASH), ignoreNone, DEFAULT_SEPARATOR)
        expect((element.children[0] as Text).value).toBe(`pages 1${EN_DASH}5`)
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

      it("passes invariance check for marker-transparent transforms", () => {
        const element = h("p", ["hello ", h("em", "world")]) as Element
        expect(() =>
          transformElement(element, toUpper, ignoreNone, DEFAULT_SEPARATOR, true)
        ).not.toThrow()
      })

      it("throws on invariance check failure", () => {
        const element = h("p", ["hello ", h("em", "world")]) as Element
        // This transform interacts with the separator: it replaces char before separator
        const badTransform = (s: string) => s.replace(new RegExp(` ${DEFAULT_SEPARATOR}`, "g"), `X${DEFAULT_SEPARATOR}`)
        expect(() =>
          transformElement(element, badTransform, ignoreNone, DEFAULT_SEPARATOR, true)
        ).toThrow("Transform invariance check failed")
      })
    })

    describe("shouldSkipText", () => {
      const toUpper = (s: string) => s.toUpperCase()

      it("is not called for text inside elements excluded by shouldSkip", () => {
        const element = h("p", ["before ", h("code", "unchanged"), " after"]) as Element
        const visitedValues: string[] = []
        transformElement(element, toUpper, ignoreCode, DEFAULT_SEPARATOR, false, {
          shouldSkipText: (textNode) => {
            visitedValues.push(textNode.value)
            return false
          },
        })
        // Only "before " and " after" are visited — the code child short-circuits.
        expect(visitedValues).toEqual(["before ", " after"])
      })

      it("leaves a skipped text node's value untouched", () => {
        const element = h("p", "hello") as Element
        transformElement(
          element, toUpper, ignoreNone, DEFAULT_SEPARATOR, false,
          { shouldSkipText: () => true },
        )
        expect((element.children[0] as Text).value).toBe("hello")
      })

      it("passes ancestors root-first, nearest-last", () => {
        const tree = h("div", [h("p", [h("em", "inner")])]) as Element
        const captured: string[][] = []
        flattenTextNodes(tree, ignoreNone, {
          shouldSkipText: (_textNode, ancestors) => {
            captured.push(ancestors.map((a) => a.tagName))
            return false
          },
        })
        expect(captured).toEqual([["div", "p", "em"]])
      })

      it("hands out a snapshot of ancestors, not the live mutable array", () => {
        // If the walker handed out the shared live array, the captured
        // reference would be empty (or partially popped) by the time we
        // inspect it after the walk completes.
        const tree = h("div", [h("p", [h("em", "inner")])]) as Element
        let captured: readonly Element[] | null = null
        flattenTextNodes(tree, ignoreNone, {
          shouldSkipText: (_textNode, ancestors) => {
            captured = ancestors
            return false
          },
        })
        expect(captured).not.toBeNull()
        expect(captured!.map((a) => a.tagName)).toEqual(["div", "p", "em"])
      })

      it("gives each text node its own ancestor chain across the same walk", () => {
        // shallow text under <div>, deep text under <div><p><em>; the chains
        // must differ. A bug that forgets to pop or shares the live array
        // would conflate them.
        const tree = h("div", [
          "shallow",
          h("p", [h("em", "deep")]),
        ]) as Element
        const captured: Record<string, string[]> = {}
        flattenTextNodes(tree, ignoreNone, {
          shouldSkipText: (textNode, ancestors) => {
            captured[textNode.value] = ancestors.map((a) => a.tagName)
            return false
          },
        })
        expect(captured).toEqual({
          shallow: ["div"],
          deep: ["div", "p", "em"],
        })
      })

      it("transforms accepted text while leaving rejected text literal", () => {
        const element = h("p", ["hello ", h("em", "world")]) as Element
        transformElement(
          element, toUpper, ignoreNone, DEFAULT_SEPARATOR, false,
          { shouldSkipText: (textNode) => textNode.value === "hello " },
        )
        expect((element.children[0] as Text).value).toBe("hello ")
        expect(((element.children[1] as Element).children[0] as Text).value).toBe("WORLD")
      })

      it("invariance check passes when some text nodes are skipped", () => {
        const element = h("p", ["hello ", h("em", "world")]) as Element
        expect(() =>
          transformElement(
            element, toUpper, ignoreNone, DEFAULT_SEPARATOR, true,
            { shouldSkipText: (textNode) => textNode.value === "hello " },
          )
        ).not.toThrow()
        expect((element.children[0] as Text).value).toBe("hello ")
        expect(((element.children[1] as Element).children[0] as Text).value).toBe("WORLD")
      })

      it("plugin option skips text matching predicate end-to-end", async () => {
        const html = '<p>Visit <a href="https://example.com/x">https://example.com/x</a> now.</p>'
        const result = await processHtml(html, {
          nbsp: false,
          shouldSkipText: (textNode, ancestors) => {
            const parent = ancestors[ancestors.length - 1]
            if (parent?.tagName !== "a") return false
            const href = parent.properties?.href
            return typeof href === "string" && href === textNode.value
          },
        })
        // The anchor text is preserved literally (slashes unchanged); surrounding
        // text is transformed (nothing to change here, but no crash).
        expect(result).toBe('<p>Visit <a href="https://example.com/x">https://example.com/x</a> now.</p>')
      })
    })

    describe("getTextContent", () => {
      it.each([
        ["simple text", fixtures.simple, ignoreNone, "Hello, world!"],
        ["nested elements", fixtures.nested, ignoreNone, "This is emphasized text."],
        ["with ignored code", fixtures.withCode, ignoreCode, "This is  text."],
        ["empty element", fixtures.empty, ignoreNone, ""],
        ["deeply nested", fixtures.deeplyNested, ignoreNone, "Level 1 Level 2 Level 3 End"],
      ])("extracts from %s", (_name, node, skip, expected) => {
        expect(getTextContent(node, skip)).toBe(expected)
      })

      it("uses default shouldSkip when not provided", () => {
        expect(getTextContent(fixtures.simple)).toBe("Hello, world!")
      })
    })

    describe("getFirstTextNode", () => {
      it.each([
        ["simple text", fixtures.simple, "Hello, world!"],
        ["nested", fixtures.nested, "This is "],
        ["deeply nested", fixtures.deeplyNested, "Level 1 "],
      ])("finds first text in %s", (_name, node, expectedValue) => {
        const result = getFirstTextNode(node as Parent)
        expect(result).not.toBeNull()
        expect(result!.value).toBe(expectedValue)
      })

      it("returns null for empty element", () => {
        expect(getFirstTextNode(fixtures.empty as Parent)).toBeNull()
      })

      it("returns text node directly", () => {
        const textNode: Text = { type: "text", value: "Direct" }
        expect(getFirstTextNode(textNode as unknown as Parent)).toBe(textNode)
      })

      it("returns null for null input", () => {
        expect(getFirstTextNode(null as unknown as Parent)).toBeNull()
      })

      it("returns null for comments-only element", () => {
        const node = h("div", [
          { type: "comment", value: "comment" } as unknown as ElementContent,
        ]) as Element
        expect(getFirstTextNode(node as Parent)).toBeNull()
      })

      it("stops at max recursion depth", () => {
        let deep: Element = h("span", "deep") as Element
        for (let i = 0; i < 1005; i++) deep = h("div", [deep]) as Element
        expect(getFirstTextNode(deep as Parent)).toBeNull()
      })
    })

    describe("assertSmartQuotesMatch", () => {
      it.each([
        ["matched double quotes", `${LDQ}Hello${RDQ}`],
        ["nested quotes", `${LDQ}Outer ${LDQ}inner${RDQ} outer${RDQ}`],
        ["empty string", ""],
        ["no quotes", "Hello, world!"],
      ])("passes for %s", (_name, input) => {
        expect(() => assertSmartQuotesMatch(input)).not.toThrow()
      })

      it.each([
        ["unmatched opening", `${LDQ}Hello`],
        ["unmatched closing", `Hello${RDQ}`],
        ["extra opening", `${LDQ}${LDQ}Hello${RDQ}`],
        ["reversed quotes", `${RDQ}Hello${LDQ}`],
      ])("throws for %s", (_name, input) => {
        expect(() => assertSmartQuotesMatch(input)).toThrow("Mismatched quotes")
      })
    })

    describe("collectTransformableElements", () => {
      it("collects elements with direct text children", () => {
        const tree = h("div", [
          h("p", "First paragraph"),
          h("div", [h("p", "Nested paragraph")]),
        ]) as Element
        const result = collectTransformableElements(tree, ignoreNone)
        expect(result).toHaveLength(2)
        expect(result[0].tagName).toBe("p")
        expect(result[1].tagName).toBe("p")
      })

      it("skips elements matching shouldSkip", () => {
        const tree = h("div", [
          h("p", "Normal"),
          h("code", "Skipped"),
        ]) as Element
        const result = collectTransformableElements(tree, ignoreCode)
        expect(result).toHaveLength(1)
        expect(result[0].tagName).toBe("p")
      })

      it("returns empty for skipped root", () => {
        const tree = h("code", "Skipped") as Element
        expect(collectTransformableElements(tree, ignoreCode)).toHaveLength(0)
      })

      it("returns empty for elements without text children", () => {
        const tree = h("div", [h("img")]) as Element
        expect(collectTransformableElements(tree, ignoreNone)).toHaveLength(0)
      })

      it("collects phrasing container with only inline element children", () => {
        // <p><em>"Hello</em><span>, world"</span></p>
        // The <p> has no direct text children, but all content is inline.
        // It should be collected as a single unit for cross-element context.
        const tree = h("p", [
          h("em", '"Hello'),
          h("span", ', world"'),
        ]) as Element
        const result = collectTransformableElements(tree, ignoreNone)
        expect(result).toHaveLength(1)
        expect(result[0].tagName).toBe("p")
      })

      it("recurses when element has block-level children", () => {
        // <div><p>Hello</p><p>World</p></div> — block children mean
        // each <p> should be independent, not merged.
        const tree = h("div", [
          h("p", "Hello"),
          h("p", "World"),
        ]) as Element
        const result = collectTransformableElements(tree, ignoreNone)
        expect(result).toHaveLength(2)
        expect(result[0].tagName).toBe("p")
        expect(result[1].tagName).toBe("p")
      })

      it("collects inline-only div as single unit", () => {
        // <div><span>Hello</span><em>World</em></div> — no block children
        const tree = h("div", [
          h("span", "Hello"),
          h("em", "World"),
        ]) as Element
        const result = collectTransformableElements(tree, ignoreNone)
        expect(result).toHaveLength(1)
        expect(result[0].tagName).toBe("div")
      })

      it("skips inline-only container when children are skip-tagged", () => {
        const tree = h("p", [h("code", "skip me")]) as Element
        expect(collectTransformableElements(tree, ignoreCode)).toHaveLength(0)
      })

      it("returns empty when only non-text, non-element children exist", () => {
        const tree: Element = {
          type: "element",
          tagName: "p",
          properties: {},
          children: [{ type: "comment", value: "a comment" } as unknown as ElementContent],
        }
        expect(collectTransformableElements(tree, ignoreNone)).toHaveLength(0)
      })

      it("stops at max recursion depth", () => {
        let deep: Element = h("p", "deep") as Element
        for (let i = 0; i < 1100; i++) deep = h("div", [deep]) as Element
        expect(collectTransformableElements(deep, ignoreNone)).toHaveLength(0)
      })
    })
  })

  describe("nbsp option", () => {
    const NBSP = UNICODE_SYMBOLS.NBSP

    it("inserts nbsp when option enabled", async () => {
      const result = await processHtml('<p>Dr. Smith has 5 kg of items.</p>', { nbsp: true })
      expect(result).toBe(`<p>Dr.${NBSP}Smith has 5${NBSP}kg of${NBSP}items.</p>`)
    })

    it("inserts nbsp by default", async () => {
      const result = await processHtml('<p>Dr. Smith has 5 kg of items.</p>')
      expect(result).toBe(`<p>Dr.${NBSP}Smith has 5${NBSP}kg of${NBSP}items.</p>`)
    })

    it("does not insert nbsp when option disabled", async () => {
      const result = await processHtml('<p>Dr. Smith has 5 kg of items.</p>', { nbsp: false })
      expect(result).not.toContain(NBSP)
    })

    it("works across element boundaries", async () => {
      const result = await processHtml('<p>See <em>Fig.</em> 1</p>', { nbsp: true })
      expect(result).toBe(`<p>See <em>Fig.</em>${NBSP}1</p>`)
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
      expect(await processHtml('<div>"Before" <code>"Inside"</code> "After"</div>', { nbsp: false })).toEqual(
        `<div>${LDQ}Before${RDQ} <code>"Inside"</code> ${LDQ}After${RDQ}</div>`
      )
    })

    it("handles string className property (non-standard AST)", async () => {
      // rehype-parse always produces array classNames, but hand-crafted ASTs
      // may use strings. The plugin should handle both.
      const tree: Root = {
        type: "root",
        children: [{
          type: "element",
          tagName: "p",
          // Cast to bypass hast's typed className (which expects string[])
          properties: { className: "no-transform" as unknown as string[] },
          children: [{ type: "text", value: '"Hello"' }],
        }],
      }
      const processor = unified()
        .use(rehypePunctilio, { skipClasses: ["no-transform"] })
        .use(rehypeStringify)
      await processor.run(tree)
      // Text should remain untransformed because the class matches
      const textNode = (tree.children[0] as Element).children[0] as Text
      expect(textNode.value).toBe('"Hello"')
    })

    it("handles mixed skip and non-skip siblings", async () => {
      expect(await processHtml('<article><p>"Hello"</p><pre>"Code"</pre><p>"World"</p></article>', { nbsp: false })).toEqual(
        `<article><p>${LDQ}Hello${RDQ}</p><pre>"Code"</pre><p>${LDQ}World${RDQ}</p></article>`
      )
    })

    it("skipClasses with elements that have no className property", async () => {
      const tree: Root = {
        type: "root",
        children: [{
          type: "element",
          tagName: "p",
          properties: {},
          children: [{ type: "text", value: '"Hello"' }],
        }],
      }
      const processor = unified()
        .use(rehypePunctilio, { skipClasses: ["no-transform"] })
        .use(rehypeStringify)
      await processor.run(tree)
      const textNode = (tree.children[0] as Element).children[0] as Text
      expect(textNode.value).toBe(`${LDQ}Hello${RDQ}`)
    })
  })

  describe("stress tests", () => {
    it("handles many sibling paragraphs", async () => {
      // 100 siblings: enough to exercise the visitor/transformed-set logic
      // without spending seconds on HTML parsing
      const count = 100
      const html = '<div>' + '<p>"Hello," she said.</p>'.repeat(count) + '</div>'
      const result = await processHtml(html, { nbsp: false })
      const matchCount = (result.match(new RegExp(LDQ, "g")) ?? []).length
      expect(matchCount).toBe(count)
    })

    it("handles paragraph with many inline elements", async () => {
      const count = 100
      const inlineElements = Array.from({ length: count }, (_, i) =>
        `<em>"word${i}"</em>`
      ).join(" ")
      const html = `<p>${inlineElements}</p>`
      const result = await processHtml(html, { nbsp: false })
      const matchCount = (result.match(new RegExp(LDQ, "g")) ?? []).length
      expect(matchCount).toBe(count)
    })

    it("transforms text at 100-level deep nesting", async () => {
      let html = '"Hello"'
      for (let i = 0; i < 100; i++) {
        html = `<span>${html}</span>`
      }
      html = `<p>${html}</p>`
      const result = await processHtml(html, { nbsp: false })
      let expected = `${LDQ}Hello${RDQ}`
      for (let i = 0; i < 100; i++) expected = `<span>${expected}</span>`
      expected = `<p>${expected}</p>`
      expect(result).toBe(expected)
    })

    it("does not crash beyond MAX_RECURSION_DEPTH", async () => {
      let html = '"Hello"'
      for (let i = 0; i < 1050; i++) {
        html = `<span>${html}</span>`
      }
      html = `<p>${html}</p>`
      // Should not throw — deep nesting is silently skipped
      const result = await processHtml(html, { nbsp: false })
      // Build expected: same structure with smart quotes applied
      let expected = `${LDQ}Hello${RDQ}`
      for (let i = 0; i < 1050; i++) expected = `<span>${expected}</span>`
      expected = `<p>${expected}</p>`
      expect(result).toBe(expected)
    })
  })
})
