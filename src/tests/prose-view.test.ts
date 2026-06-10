import {
  buildProseView,
  type ProseNode,
  type ProseView,
  replaceAllInView,
  runLegacyPass,
} from "../prose-view.js"
import { DEFAULT_SEPARATOR } from "../constants.js"

function nodes(...values: string[]): ProseNode[] {
  return values.map((value) => ({ value }))
}

describe("buildProseView: text and boundaries", () => {
  it.each([
    ["multi-node", ["abc", "de", "f"], "abcdef", [3, 5]],
    ["single node", ["hello"], "hello", []],
    ["empty array", [], "", []],
    ["empty middle node gives duplicate boundary", ["ab", "", "cd"], "abcd", [2, 2]],
    ["leading empty node", ["", "xy"], "xy", [0]],
    ["trailing empty node", ["xy", ""], "xy", [2]],
  ])("%s", (_desc, values, text, boundaries) => {
    const view = buildProseView(nodes(...values))
    expect(view.text).toBe(text)
    expect(view.boundaries).toEqual(boundaries)
  })
})

describe("hasBoundary", () => {
  const view = buildProseView(nodes("abc", "de", "f"))
  it.each([
    [0, false],
    [3, true],
    [5, true],
    [4, false],
    [6, false],
  ])("offset %i -> %s", (offset, expected) => {
    expect(view.hasBoundary(offset)).toBe(expected)
  })

  it("single-node view has no boundaries", () => {
    const single = buildProseView(nodes("hello"))
    expect(single.hasBoundary(0)).toBe(false)
    expect(single.hasBoundary(5)).toBe(false)
  })
})

/** Independently compute the expected text after applying non-overlapping edits. */
function applyEdits(
  text: string,
  edits: { start: number; end: number; text: string }[],
): string {
  const sorted = [...edits].sort((a, b) => a.start - b.start)
  let result = ""
  let cursor = 0
  for (const edit of sorted) {
    result += text.slice(cursor, edit.start) + edit.text
    cursor = edit.end
  }
  return result + text.slice(cursor)
}

describe("replace + commit", () => {
  it("single-node edit", () => {
    const ns = nodes("hello")
    const view = buildProseView(ns)
    view.replace(1, 4, "XYZ")
    view.commit()
    expect(ns.map((n) => n.value)).toEqual(["hXYZo"])
    expect(view.text).toBe("hXYZo")
  })

  it("deletion spanning a boundary shrinks both covered nodes, count preserved", () => {
    const ns = nodes("abc", "def")
    const view = buildProseView(ns)
    view.replace(2, 4, "")
    view.commit()
    expect(ns.map((n) => n.value)).toEqual(["ab", "ef"])
    expect(ns.length).toBe(2)
  })

  it("replacement spanning boundary lands text in node containing start", () => {
    const ns = nodes("abc", "def")
    const view = buildProseView(ns)
    view.replace(2, 4, "XY")
    view.commit()
    expect(ns.map((n) => n.value)).toEqual(["abXY", "ef"])
    expect(view.text).toBe("abXYef")
  })

  it("deletion that fully empties a covered node keeps node count", () => {
    const ns = nodes("ab", "cd", "ef")
    const view = buildProseView(ns)
    view.replace(1, 5, "")
    view.commit()
    expect(ns.map((n) => n.value)).toEqual(["a", "", "f"])
    expect(ns.length).toBe(3)
  })

  it.each([
    ["bind left (default)", undefined, ["abcZ", "def"]],
    ["bind right", "right" as const, ["abc", "Zdef"]],
  ])("pure insertion at boundary: %s", (_desc, bind, expected) => {
    const ns = nodes("abc", "def")
    const view = buildProseView(ns)
    view.replace(3, 3, "Z", bind ? { bind } : undefined)
    view.commit()
    expect(ns.map((n) => n.value)).toEqual(expected)
  })

  it.each([
    ["insertion at 0, bind left -> first node", 0, "left" as const, ["Zabc", "def"]],
    ["insertion at 0, bind right -> first node", 0, "right" as const, ["Zabc", "def"]],
    ["insertion at length, bind left -> last node", 6, "left" as const, ["abc", "defZ"]],
    ["insertion at length, bind right -> last node", 6, "right" as const, ["abc", "defZ"]],
  ])("%s", (_desc, offset, bind, expected) => {
    const ns = nodes("abc", "def")
    const view = buildProseView(ns)
    view.replace(offset, offset, "Z", { bind })
    view.commit()
    expect(ns.map((n) => n.value)).toEqual(expected)
  })

  it("multiple non-adjacent edits in one commit, queue order != position order", () => {
    const ns = nodes("abcdef", "ghijkl")
    const view = buildProseView(ns)
    // Queue out of position order.
    view.replace(8, 10, "Y")
    view.replace(1, 3, "X")
    view.commit()
    const expected = applyEdits("abcdefghijkl", [
      { start: 8, end: 10, text: "Y" },
      { start: 1, end: 3, text: "X" },
    ])
    expect(ns.map((n) => n.value).join("")).toBe(expected)
  })

  it("empty-string replacement is a pure deletion", () => {
    const ns = nodes("hello")
    const view = buildProseView(ns)
    view.replace(0, 2, "")
    view.commit()
    expect(ns.map((n) => n.value)).toEqual(["llo"])
  })

  it("commit with no edits is a no-op", () => {
    const ns = nodes("abc", "def")
    const view = buildProseView(ns)
    view.commit()
    expect(ns.map((n) => n.value)).toEqual(["abc", "def"])
    expect(view.text).toBe("abcdef")
  })

  it("repeated queue/commit cycles", () => {
    const ns = nodes("abc", "def")
    const view = buildProseView(ns)
    view.replace(0, 1, "X")
    view.commit()
    expect(view.text).toBe("Xbcdef")
    view.replace(view.text.length, view.text.length, "!")
    view.commit()
    expect(view.text).toBe("Xbcdef!")
    expect(ns.map((n) => n.value)).toEqual(["Xbc", "def!"])
  })

  it("invariant: committed concatenation == old text with edits applied", () => {
    const ns = nodes("The quick ", "brown fox ", "jumps")
    const view = buildProseView(ns)
    const oldText = view.text
    const edits = [
      { start: 0, end: 3, text: "A" },
      { start: 16, end: 21, text: "" },
      { start: 25, end: 25, text: "!" },
    ]
    for (const e of edits) view.replace(e.start, e.end, e.text)
    view.commit()
    expect(ns.map((n) => n.value).join("")).toBe(applyEdits(oldText, edits))
  })
})

describe("replace assertions", () => {
  let view: ProseView
  beforeEach(() => {
    view = buildProseView(nodes("abc", "def"))
  })

  it.each([
    ["negative start", -1, 2],
    ["start > end", 4, 2],
    ["end > length", 0, 7],
  ])("throws on out-of-range: %s", (_desc, start, end) => {
    expect(() => view.replace(start, end, "x")).toThrow(/0 <= start <= end/)
  })

  it.each([
    ["non-integer start", 1.5, 2],
    ["non-integer end", 1, 2.5],
  ])("throws on %s", (_desc, start, end) => {
    expect(() => view.replace(start, end, "x")).toThrow(/must be integers/)
  })

  it.each([
    ["start splits surrogate pair", 1, 3],
    ["end splits surrogate pair", 0, 1],
  ])("throws when %s", (_desc, start, end) => {
    // "\u{1F600}" (emoji) occupies offsets 0-1 as a surrogate pair.
    const emojiView = buildProseView(nodes("\u{1F600}xx"))
    expect(() => emojiView.replace(start, end, "y")).toThrow(/surrogate pair/)
  })

  it("rejects overlapping edits at commit", () => {
    view.replace(0, 3, "X")
    view.replace(2, 4, "Y")
    expect(() => view.commit()).toThrow(/Overlapping edits/)
  })

  it("rejects two pure insertions at the same offset", () => {
    view.replace(2, 2, "X")
    view.replace(2, 2, "Y")
    expect(() => view.commit()).toThrow(/ambiguous/)
  })

  it("allows an insertion adjacent to a replacement end", () => {
    const ns = nodes("abcdef")
    const v = buildProseView(ns)
    v.replace(0, 2, "X")
    v.replace(2, 2, "Y")
    v.commit()
    expect(ns[0].value).toBe("XYcdef")
  })

  it.each([
    ["insertion queued first", "insertion-first" as const],
    ["replacement queued first", "replacement-first" as const],
  ])(
    "coexisting insertion and replacement at the same start: %s (order-independent, insertion before span)",
    (_desc, order) => {
      const ns = nodes("abcdef")
      const v = buildProseView(ns)
      if (order === "insertion-first") {
        v.replace(2, 2, "I")
        v.replace(2, 5, "R")
      } else {
        v.replace(2, 5, "R")
        v.replace(2, 2, "I")
      }
      v.commit()
      expect(ns[0].value).toBe("abIRf")
    }
  )
})

describe("replaceAllInView", () => {
  it("throws when regex lacks global flag", () => {
    const view = buildProseView(nodes("aaa"))
    expect(() => replaceAllInView(view, /a/, () => "b")).toThrow(/global/)
  })

  it("replaces all matches and commits via caller", () => {
    const ns = nodes("a-a-a")
    const view = buildProseView(ns)
    replaceAllInView(view, /a/g, () => "X")
    view.commit()
    expect(view.text).toBe("X-X-X")
  })

  it("does not commit on its own", () => {
    const ns = nodes("aaa")
    const view = buildProseView(ns)
    replaceAllInView(view, /a/g, () => "X")
    // Edits queued but not applied.
    expect(view.text).toBe("aaa")
    expect(ns[0].value).toBe("aaa")
  })

  it("skips matches containing an interior boundary by default", () => {
    const ns = nodes("foo", "bar")
    const view = buildProseView(ns)
    replaceAllInView(view, /oob/g, () => "ZZZ")
    view.commit()
    expect(view.text).toBe("foobar")
  })

  it("allowBoundaries opt-in lets a boundary-spanning match through and receives it", () => {
    const ns = nodes("foo", "bar")
    const view = buildProseView(ns)
    const seen: string[] = []
    replaceAllInView(
      view,
      /oob/g,
      (m) => {
        seen.push(m[0])
        return "ZZZ"
      },
      { allowBoundaries: () => true },
    )
    view.commit()
    expect(seen).toEqual(["oob"])
    expect(view.text).toBe("fZZZar")
  })

  it("replacer returning null leaves the match untouched", () => {
    const ns = nodes("a1b2")
    const view = buildProseView(ns)
    replaceAllInView(view, /\d/g, (m) => (m[0] === "1" ? null : "X"))
    view.commit()
    expect(view.text).toBe("a1bX")
  })

  it("terminates on zero-length matches", () => {
    const ns = nodes("abc")
    const view = buildProseView(ns)
    const positions: number[] = []
    replaceAllInView(view, /(?=[\s\S])/g, (m) => {
      positions.push(m.index)
      return null
    })
    // One zero-length lookahead match before each character; terminates.
    expect(positions).toEqual([0, 1, 2])
  })

  it("passes bind option through for pure-insertion edits", () => {
    const ns = nodes("ab", "cd")
    const view = buildProseView(ns)
    // Match the empty string right at the boundary only.
    replaceAllInView(view, /(?<=b)(?=c)/g, () => "Z", { bind: "right" })
    view.commit()
    expect(ns.map((n) => n.value)).toEqual(["ab", "Zcd"])
  })
})

describe("runLegacyPass", () => {
  it("round-trips a marked transform across nodes", () => {
    const ns = nodes("hello ", "world")
    const view = buildProseView(ns)
    runLegacyPass(view, (marked) => marked.toUpperCase())
    expect(ns.map((n) => n.value)).toEqual(["HELLO ", "WORLD"])
    expect(view.text).toBe("HELLO WORLD")
  })

  it("uses a custom separator", () => {
    const ns = nodes("a", "b")
    const view = buildProseView(ns)
    runLegacyPass(view, (marked) => marked.replace(/a/, "X"), "|")
    expect(ns.map((n) => n.value)).toEqual(["X", "b"])
  })

  it("throws when the separator is present in input", () => {
    const ns = nodes(`has${DEFAULT_SEPARATOR}sep`)
    const view = buildProseView(ns)
    expect(() => runLegacyPass(view, (m) => m)).toThrow(/separator sequence/)
  })

  it("throws when the pass changes the fragment count", () => {
    const ns = nodes("a", "b")
    const view = buildProseView(ns)
    expect(() =>
      runLegacyPass(view, (marked) => marked.replaceAll(DEFAULT_SEPARATOR, "")),
    ).toThrow(/altered the number of text nodes/)
  })

  it("throws when the view has uncommitted queued edits", () => {
    const view = buildProseView(nodes("a", "b"))
    view.replace(0, 1, "X")
    expect(() => runLegacyPass(view, (m) => m)).toThrow(/uncommitted/)
  })
})
