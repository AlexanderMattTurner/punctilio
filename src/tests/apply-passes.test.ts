import type { Element } from "hast"
import { h } from "hastscript"

import { applyPasses, getTextContent, type PassEntry } from "../rehype.js"
import { definePass, makeProsePass, type ProseView } from "../prose-view.js"
import { hyphenReplace } from "../dashes.js"
import { UNICODE_SYMBOLS } from "../constants.js"

const isAnchor = (node: Element): boolean => node.tagName === "a"

describe("applyPasses", () => {
  it("runs passes in order, each seeing the previous pass's committed output", () => {
    const element = h("p", "a")
    applyPasses(element, [definePass(/a/g, "b"), definePass(/b/g, "c")])
    expect(getTextContent(element)).toBe("c")
  })

  it("is order-sensitive: swapping the passes changes the result", () => {
    const element = h("p", "a")
    applyPasses(element, [definePass(/b/g, "c"), definePass(/a/g, "b")])
    expect(getTextContent(element)).toBe("b")
  })

  it("composes with built-in passes across element boundaries", () => {
    const element = h("p", ["word -- ", h("em", "word")])
    applyPasses(element, [hyphenReplace])
    expect(getTextContent(element)).toBe(`word${UNICODE_SYMBOLS.EM_DASH}word`)
  })

  it("applies a per-entry shouldSkip on top of the base options", () => {
    const element = h("p", ["1/2 and ", h("a", "1/2")])
    const fractions = definePass(/1\/2/g, "½")
    applyPasses(element, [{ pass: fractions, shouldSkip: isAnchor }])
    expect(getTextContent(element)).toBe("½ and 1/2")
  })

  it("builds a fresh view after an entry with different predicates", () => {
    const element = h("p", ["1/2 and ", h("a", "1/2 a-cat")])
    const fractions = definePass(/1\/2/g, "½")
    const dehyphenate = definePass(/-/g, " ")
    // The second entry's view must include the <a> text the first skipped,
    // and must be built after the first pass committed.
    applyPasses(element, [{ pass: fractions, shouldSkip: isAnchor }, dehyphenate])
    expect(getTextContent(element)).toBe("½ and 1/2 a cat")
  })

  it("reuses the view across consecutive entries with identical predicates", () => {
    const element = h("p", ["x and ", h("a", "x")])
    const entries: readonly PassEntry[] = [
      { pass: definePass(/x/g, "y"), shouldSkip: isAnchor },
      { pass: definePass(/y/g, "z"), shouldSkip: isAnchor },
    ]
    applyPasses(element, entries)
    expect(getTextContent(element)).toBe("z and x")
  })

  it("merges the base shouldSkip with a per-entry shouldSkip", () => {
    const element = h("p", ["a ", h("a", "a"), " ", h("em", "a")])
    applyPasses(
      element,
      [{ pass: definePass(/a/g, "b"), shouldSkip: isAnchor }],
      { shouldSkip: (node) => node.tagName === "em" },
    )
    expect(getTextContent(element)).toBe("b a a")
  })

  it("merges the base shouldSkipText with a per-entry shouldSkipText", () => {
    const element = h("p", ["aa ", "ab ", "ba"])
    applyPasses(
      element,
      [
        {
          pass: definePass(/a/g, "x", { boundaries: "allow" }),
          shouldSkipText: (textNode) => textNode.value.startsWith("b"),
        },
      ],
      { shouldSkipText: (textNode) => textNode.value.startsWith("ab") },
    )
    expect(getTextContent(element)).toBe("xx ab ba")
  })

  it("applies a base predicate alone when the entry has none", () => {
    const element = h("p", ["a ", h("a", "a")])
    applyPasses(element, [definePass(/a/g, "b")], { shouldSkip: isAnchor })
    expect(getTextContent(element)).toBe("b a")
  })

  it("is a no-op for an empty pass list", () => {
    const element = h("p", "a")
    applyPasses(element, [])
    expect(getTextContent(element)).toBe("a")
  })

  it("skips entries whose predicates leave no transformable text", () => {
    const element = h("p", h("a", "a"))
    const skipped = definePass(/a/g, "b")
    applyPasses(element, [{ pass: skipped, shouldSkip: isAnchor }, definePass(/a/g, "c")])
    expect(getTextContent(element)).toBe("c")
  })

  it("does nothing for an element with no text nodes", () => {
    const element = h("p")
    expect(() => applyPasses(element, [definePass(/a/g, "b")])).not.toThrow()
    expect(getTextContent(element)).toBe("")
  })

  // A pass receives one view spanning the whole element, with a boundary
  // recorded at each opaque gap (a removed skipped element) — not a separate
  // view per gap-delimited segment. This keeps boundary-aware passes able to
  // act across an inline-element boundary instead of seeing isolated fragments.
  const skipCode = (node: Element): boolean => node.tagName === "code"

  it("hands each pass one spanning view with a boundary at an opaque gap", () => {
    const element = h("p", ["a", h("code", "x"), "/", h("code", "y"), "b"])
    const seen: Array<{ text: string; boundaryAtSlash: boolean }> = []
    const capture = makeProsePass((view: ProseView) => {
      const slash = view.text.indexOf("/")
      seen.push({ text: view.text, boundaryAtSlash: view.hasBoundary(slash) })
    })
    applyPasses(element, [capture], { shouldSkip: skipCode })
    expect(seen).toEqual([{ text: "a/b", boundaryAtSlash: true }])
  })

  it("lets a boundary-aware pass act across an opaque gap", () => {
    const element = h("p", ["a", h("code", "x"), "/", h("code", "y"), "b"])
    // Pads the slash only when it can see a following character — reachable
    // only if the code-separated neighbors share one spanning view.
    const padSlash = definePass(/\//g, (match, view) =>
      view.text[match.index + 1] !== undefined ? " / " : "/",
    )
    applyPasses(element, [padSlash], { shouldSkip: skipCode })
    expect(getTextContent(element)).toBe("ax / yb")
  })
})
