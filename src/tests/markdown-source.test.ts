import type { Root } from "mdast"

import { clipPiece, mapValueToSource, mismatches, piecesIn, sourceRange, textNodeEdits, tokenizeSource, trailingPieces } from "../markdown-source.js"

describe("tokenizeSource", () => {
  it("splits text into literal, escape, reference, and line-ending pieces", () => {
    expect(tokenizeSource("> a\n> \\>= &amp;")).toEqual([
      { start: 2, end: 3, text: "a", literal: true },
      { start: 3, end: 4, text: "\n", literal: true },
      { start: 6, end: 8, text: ">", literal: false },
      { start: 8, end: 10, text: "= ", literal: true },
      { start: 10, end: 15, text: "&", literal: false },
    ])
  })
})

describe("sourceRange", () => {
  const point = (offset?: number) => ({ line: 1, column: 1, offset })
  it.each([
    ["no position", {}, undefined],
    ["a missing end offset", { position: { start: point(0), end: point() } }, undefined],
    ["both offsets", { position: { start: point(1), end: point(3) } }, { start: 1, end: 3 }],
  ])("returns the range for %s", (_label, fields, expected) => {
    expect(sourceRange({ type: "text", value: "", ...fields })).toEqual(expected)
  })

  it("returns no range for no node", () => {
    expect(sourceRange(undefined)).toBeUndefined()
  })
})

describe("clipPiece", () => {
  const range = { start: 2, end: 4 }
  it.each([
    ["trims a literal piece", { start: 0, end: 6, text: "abcdef", literal: true }, { start: 2, end: 4, text: "cd", literal: true }],
    ["keeps a contained literal piece", { start: 2, end: 4, text: "cd", literal: true }, { start: 2, end: 4, text: "cd", literal: true }],
    ["keeps an escape whole", { start: 2, end: 4, text: "[", literal: false }, { start: 2, end: 4, text: "[", literal: false }],
  ])("%s", (_label, piece, expected) => {
    expect(clipPiece(piece, range)).toEqual(expected)
  })
})

describe("piecesIn", () => {
  const pieces = [
    { start: 0, end: 2, text: "ab", literal: true },
    { start: 2, end: 4, text: "cd", literal: true },
    { start: 6, end: 8, text: "[", literal: false },
    { start: 8, end: 10, text: "ef", literal: true },
  ]
  it.each([
    ["clips the pieces at both ends", { start: 1, end: 9 }, ["b", "cd", "[", "e"]],
    ["skips pieces ending at the range start", { start: 4, end: 10 }, ["[", "ef"]],
    ["finds nothing past the last piece", { start: 10, end: 12 }, []],
  ])("%s", (_label, range, expected) => {
    expect(piecesIn(pieces, range).map((piece) => piece.text)).toEqual(expected)
  })
})

describe("trailingPieces", () => {
  const pieces = [
    { start: 0, end: 2, text: "ab", literal: true },
    { start: 2, end: 4, text: "[", literal: false },
    { start: 4, end: 7, text: "cde", literal: true },
  ]
  it.each([
    ["whole pieces", 4, ["[", "cde"]],
    ["a literal piece clipped at its start", 5, ["b", "[", "cde"]],
    ["every piece when the range holds no more", 9, ["ab", "[", "cde"]],
  ])("takes %s", (_label, length, expected) => {
    expect(trailingPieces(pieces, { start: 0, end: 7 }, length).map((piece) => piece.text)).toEqual(expected)
  })
})

describe("mapValueToSource", () => {
  it("maps literal units one-to-one and escaped units to their whole token", () => {
    const pieces = [
      { start: 0, end: 2, text: "ab", literal: true },
      { start: 2, end: 8, text: "&", literal: false },
    ]
    expect(mapValueToSource("ab&", pieces)).toEqual({ starts: [0, 1, 2], ends: [1, 2, 8] })
  })

  it("throws when the pieces do not spell the value", () => {
    expect(() => mapValueToSource("x", [{ start: 0, end: 1, text: "y", literal: true }])).toThrow(/do not match/)
  })
})

describe("textNodeEdits", () => {
  const identity = (length: number) => ({
    starts: Array.from({ length }, (_, i) => 10 + i),
    ends: Array.from({ length }, (_, i) => 11 + i),
  })

  it.each([
    ["replacement", "a...", "a…", [{ start: 11, end: 14, text: "…" }]],
    ["deletion", "a  b", "a b", [{ start: 12, end: 13, text: "" }]],
    ["insertion mid-value", "ab", "aXb", [{ start: 11, end: 11, text: "X" }]],
    ["insertion at end", "ab", "abX", [{ start: 12, end: 12, text: "X" }]],
    ["deletion of a final line break", "a\n", "a", [{ start: 11, end: 12, text: "" }]],
    ["insertion after a final line break", "a\n", "a\nX", [{ start: 12, end: 12, text: "X" }]],
  ])("produces a %s edit", (_label, original, transformed, expected) => {
    expect(textNodeEdits(identity(original.length), original, transformed)).toEqual(expected)
  })

  // Source "a \n> b": the parser trims the space and the `> ` prefix from the value "a\nb".
  const quoted = { starts: [0, 2, 5], ends: [1, 3, 6] }
  it.each([
    ["removes the trimmed space and next line's prefix along with a line break", "ab", [{ start: 1, end: 5, text: "" }]],
    ["inserts before a line break, ahead of the trimmed space", "aX\nb", [{ start: 1, end: 1, text: "X" }]],
    ["inserts after a line break, behind the next line's prefix", "a\nXb", [{ start: 5, end: 5, text: "X" }]],
  ])("%s", (_label, transformed, expected) => {
    expect(textNodeEdits(quoted, "a\nb", transformed)).toEqual(expected)
  })

})

describe("mismatches", () => {
  const root: Root = { type: "root", children: [] }
  const signature = (lines: readonly string[], blocks: readonly number[]) => ({ lines, blocks, containers: lines.map(() => root) })
  const expected = signature(["root", "p", "a", "p", "b"], [-1, 0, 0, 1, 1])
  it.each([
    ["no departure", signature(["root", "p", "a", "p", "b"], [-1, 0, 0, 1, 1]), []],
    ["a changed line, block by block", signature(["root", "p", "a", "p", "B"], [-1, 0, 0, 1, 1]), [4, 4]],
    ["an added line, at the line before it", signature(["root", "p", "a", "x", "p", "b"], [-1, 0, 0, 0, 1, 1]), [2]],
    ["merged blocks, across the document", signature(["root", "p", "a", "b"], [-1, 0, 0, 0]), [3]],
  ])("finds %s", (_label, actual, departures) => {
    expect(mismatches(expected, actual)).toEqual(departures)
  })
})
