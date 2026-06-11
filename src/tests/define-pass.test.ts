/* eslint-disable regexp/prefer-named-capture-group, redos/no-vulnerable, regexp/no-super-linear-move --
 * These fixtures deliberately exercise numbered-group replacement templates
 * ($1, $12, ...) on tiny inputs, which requires unnamed capture groups. */
import { buildProseView, definePass, type ProseNode } from "../prose-view.js"
import { SEP, viewTransform } from "./test-helpers.js"

describe("definePass", () => {
  describe("string input", () => {
    it.each([
      ["literal replacement", /cat/g, "dog", "a cat sat", "a dog sat"],
      ["$& whole match", /\bcat\b/g, "[$&]", "a cat sat", "a [cat] sat"],
      ["$1 numbered group", /(\d+)F/g, "$1 °F", "It hit 99F.", "It hit 99 °F."],
      ["$1 and $2 reordered", /(\w+), (\w+)/g, "$2 $1", "Doe, Jane", "Jane Doe"],
      ["$$ literal dollar", /(\d+) USD/g, "$$$1", "pay 5 USD now", "pay $5 now"],
      ["$<name> named group", /(?<num>\d+)C/g, "$<num> °C", "20C outside", "20 °C outside"],
      ["$01 zero-padded group", /(\d+)F/g, "$01 °F", "It hit 99F.", "It hit 99 °F."],
      ["non-participating group is empty", /(a)|(b)/g, "<$1$2>", "ab", "<a><b>"],
      ["non-participating named group is empty", /(?<x>a)|(?<y>b)/g, "<$<x>$<y>>", "ab", "<a><b>"],
      ["$1 then literal digit via fallback", /(\d)px/g, "$12em", "3px", "32em"],
      ["fallback with non-participating group is empty", /(a)?bc/g, "$12", "x bc", "x 2"],
    ])("%s", (_name, pattern, replacement, input, expected) => {
      const pass = definePass(pattern, replacement)
      expect(pass(input)).toBe(expected)
    })

    it("resolves a two-digit reference to the group when it exists", () => {
      const pass = definePass(/(a)(b)(c)(d)(e)(f)(g)(h)(i)(j)(k)/g, "$11", "")
      expect(pass("abcdefghijk")).toBe("k")
    })

    it("supports a replacer function and treats null as no-op", () => {
      const pass = definePass(/\d+/g, (match) => (match[0] === "13" ? null : `(${match[0]})`))
      expect(pass("12 13 14")).toBe("(12) 13 (14)")
    })

    it("passes the view to a replacer function", () => {
      const pass = definePass(/x/g, (match, view) => (view.hasBoundary(match.index) ? "B" : "i"))
      expect(viewTransform((view) => pass(view), `x a${SEP}x b`)).toBe(`i a${SEP}B b`)
    })
  })

  describe("view input", () => {
    it("commits edits onto the source nodes in place", () => {
      const nodes: ProseNode[] = [{ value: "one cat, " }, { value: "two cats" }]
      const view = buildProseView(nodes)
      const pass = definePass(/cat/g, "dog")
      expect(pass(view)).toBeUndefined()
      expect(nodes.map((node) => node.value)).toEqual(["one dog, ", "two dogs"])
    })
  })

  describe("boundaries", () => {
    const input = `ca${SEP}t cat`

    it('skips boundary-spanning matches by default ("skip")', () => {
      const pass = definePass(/cat/g, "dog")
      expect(viewTransform((view) => pass(view), input)).toBe(`ca${SEP}t dog`)
    })

    it('replaces boundary-spanning matches with "allow"', () => {
      const pass = definePass(/cat/g, "dog", { boundaries: "allow" })
      expect(viewTransform((view) => pass(view), input)).toBe(`dog${SEP} dog`)
    })

    it("forwards a predicate to allowBoundaries", () => {
      const pass = definePass(/cat/g, "dog", {
        boundaries: (match) => match.index === 0,
      })
      expect(viewTransform((view) => pass(view), `ca${SEP}t ca${SEP}t`)).toBe(`dog${SEP} ca${SEP}t`)
    })
  })

  describe("failure modes", () => {
    it("rejects a pattern without the g flag", () => {
      expect(() => definePass(/cat/, "dog")).toThrow(
        "definePass() requires a pattern with the global (g) flag."
      )
    })

    it("rejects an invalid boundaries value", () => {
      expect(() => definePass(/cat/g, "dog", { boundaries: "block" as never })).toThrow(
        'Invalid boundaries option: "block". Must be "skip", "allow", or a predicate.'
      )
    })

    it.each([
      ["bare trailing $", "dog$"],
      ["$ before an unsupported character", "$x"],
      ["$` (preceding-text form)", "$`"],
      ["$' (following-text form)", "$'"],
      ["stray $ before a valid token", "$ then $1"],
      ["$0", "$0"],
      ["$00", "$00"],
      ["unterminated $<name", "$<pet"],
      ["empty $<>", "$<>"],
    ])("rejects unsupported template form at definition time: %s", (_name, template) => {
      expect(() => definePass(/(cat)/g, template)).toThrow(/Unsupported/)
    })

    it("throws when a numbered reference exceeds the pattern's groups", () => {
      const pass = definePass(/(cat)/g, "$3")
      expect(() => pass("cat")).toThrow(
        "Replacement references group $3 but the pattern only has 1 capture group(s)."
      )
    })

    it("throws when a two-digit reference has no usable group", () => {
      const pass = definePass(/cat/g, "$12")
      expect(() => pass("cat")).toThrow(
        "Replacement references group $12 but the pattern only has 0 capture group(s)."
      )
    })

    it("throws on $<name> when the pattern has no named groups", () => {
      const pass = definePass(/(cat)/g, "$<pet>")
      expect(() => pass("cat")).toThrow(
        'Replacement references group $<pet> but the pattern has no capture group named "pet".'
      )
    })

    it("throws on $<name> when the name is not among the pattern's named groups", () => {
      const pass = definePass(/(?<animal>cat)/g, "$<pet>")
      expect(() => pass("cat")).toThrow(
        'Replacement references group $<pet> but the pattern has no capture group named "pet".'
      )
    })
  })
})
