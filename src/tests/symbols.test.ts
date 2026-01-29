import {
  ellipsis,
  multiplication,
  mathSymbols,
  legalSymbols,
  arrows,
  degrees,
  primeMarks,
  fractions,
  symbolTransform,
} from "../symbols.js"

describe("ellipsis", () => {
  it.each([
    ["Wait for it...", "Wait for it\u2026"],
    ["Hmm... let me think", "Hmm\u2026 let me think"],
    ["...", "\u2026"],
    ["Hello...world", "Hello\u2026 world"],
    ["End of sentence...", "End of sentence\u2026"],
  ])('converts "%s" to "%s"', (input, expected) => {
    expect(ellipsis(input)).toBe(expected)
  })

  it("handles separator characters", () => {
    const sep = "\uE000"
    expect(ellipsis(`.${sep}.${sep}.`, { separator: sep })).toBe("\u2026")
  })

  it("preserves single and double periods", () => {
    expect(ellipsis("e.g.")).toBe("e.g.")
    expect(ellipsis("U.S.A.")).toBe("U.S.A.")
    expect(ellipsis("a.b")).toBe("a.b")
  })
})

describe("multiplication", () => {
  it.each([
    ["5x5", "5\u00D75"],
    ["10 x 20", "10 \u00D7 20"],
    ["10x20", "10\u00D720"],
    ["The room is 10x12 feet", "The room is 10\u00D712 feet"],
    ["2x speed", "2\u00D7 speed"],
    ["3x", "3\u00D7"],
    ["5*3", "5\u00D73"],
    ["Resolution: 1920x1080", "Resolution: 1920\u00D71080"],
  ])('converts "%s" to "%s"', (input, expected) => {
    expect(multiplication(input)).toBe(expected)
  })

  it("does not convert x in words", () => {
    expect(multiplication("extra")).toBe("extra")
    expect(multiplication("complex")).toBe("complex")
    expect(multiplication("x-axis")).toBe("x-axis")
  })

  it("does not convert trailing x followed by letters", () => {
    expect(multiplication("5xword")).toBe("5xword")
    expect(multiplication("10xbox")).toBe("10xbox")
    expect(multiplication("2xLarge")).toBe("2xLarge")
  })

  it("handles separator characters", () => {
    const sep = "\uE000"
    expect(multiplication(`5${sep}x${sep}5`, { separator: sep })).toBe(`5${sep}\u00D7${sep}5`)
  })
})

describe("mathSymbols", () => {
  describe("not equal", () => {
    it.each([
      ["x != y", "x \u2260 y"],
      ["a!=b", "a\u2260b"],
      ["1 != 2", "1 \u2260 2"],
    ])('converts "%s" to "%s"', (input, expected) => {
      expect(mathSymbols(input)).toBe(expected)
    })
  })

  describe("plus/minus", () => {
    it.each([
      ["+-5", "\u00B15"],
      ["+/-5", "\u00B15"],
      ["The answer is +- 5%", "The answer is \u00B1 5%"],
      ["tolerance: +/-0.5", "tolerance: \u00B10.5"],
    ])('converts "%s" to "%s"', (input, expected) => {
      expect(mathSymbols(input)).toBe(expected)
    })
  })

  describe("comparison operators", () => {
    it.each([
      ["a <= b", "a \u2264 b"],
      ["x >= y", "x \u2265 y"],
      ["~= 5", "\u2248 5"],
      ["=~ 5", "\u2248 5"],
    ])('converts "%s" to "%s"', (input, expected) => {
      expect(mathSymbols(input)).toBe(expected)
    })
  })
})

describe("legalSymbols", () => {
  it.each([
    ["Copyright (c) 2024", "Copyright \u00A9 2024"],
    ["(C) Acme Inc", "\u00A9 Acme Inc"],
    ["Brand(r)", "Brand\u00AE"],
    ["Product (R)", "Product \u00AE"],
    ["Name(tm)", "Name\u2122"],
    ["Name (TM)", "Name \u2122"],
    ["(c) 2024 (r) Brand(tm)", "\u00A9 2024 \u00AE Brand\u2122"],
  ])('converts "%s" to "%s"', (input, expected) => {
    expect(legalSymbols(input)).toBe(expected)
  })
})

describe("arrows", () => {
  it.each([
    ["A -> B", "A \u2192 B"],
    ["A --> B", "A \u2192 B"],
    ["A <- B", "A \u2190 B"],
    ["A <-- B", "A \u2190 B"],
    ["A <-> B", "A \u2194 B"],
    ["A <--> B", "A \u2194 B"],
    ["start -> middle -> end", "start \u2192 middle \u2192 end"],
  ])('converts "%s" to "%s"', (input, expected) => {
    expect(arrows(input)).toBe(expected)
  })

  it("preserves arrows in code-like contexts", () => {
    // Arrows not surrounded by spaces should be preserved
    expect(arrows("function->call")).toBe("function->call")
    expect(arrows("array[0]->value")).toBe("array[0]->value")
  })
})

describe("degrees", () => {
  it.each([
    ["20 C", "20 \u00B0C"],
    ["20C", "20 \u00B0C"],
    ["68 F", "68 \u00B0F"],
    ["68F", "68 \u00B0F"],
    ["Water boils at 100 C", "Water boils at 100 \u00B0C"],
    ["Room temperature: 72F", "Room temperature: 72 \u00B0F"],
  ])('converts "%s" to "%s"', (input, expected) => {
    expect(degrees(input)).toBe(expected)
  })

  it("does not convert other letters", () => {
    expect(degrees("20 km")).toBe("20 km")
    expect(degrees("Section C")).toBe("Section C")
  })

  it("handles multi-digit temperatures", () => {
    expect(degrees("100 C")).toBe("100 \u00B0C")
    expect(degrees("212F")).toBe("212 \u00B0F")
    expect(degrees("-40 C")).toBe("-40 \u00B0C")
  })
})

describe("primeMarks", () => {
  it.each([
    ['5\'10"', "5\u203210\u2033"],
    ['He is 6\'2" tall', "He is 6\u20322\u2033 tall"],
    ["The board is 8' long", "The board is 8\u2032 long"],
    ['12"', "12\u2033"],
    ["Location: 45° 30' 15\"", "Location: 45° 30\u2032 15\u2033"],
  ])('converts "%s" to "%s"', (input, expected) => {
    expect(primeMarks(input)).toBe(expected)
  })

  it("does not convert apostrophes in words", () => {
    expect(primeMarks("don't")).toBe("don't")
    expect(primeMarks("it's")).toBe("it's")
    expect(primeMarks("'Twas the night")).toBe("'Twas the night")
  })

  it("does not convert quotes at start of words", () => {
    expect(primeMarks("'hello'")).toBe("'hello'")
    expect(primeMarks('"test"')).toBe('"test"')
  })

  it("handles separator characters", () => {
    const sep = "\uE000"
    expect(primeMarks(`5${sep}'${sep}10${sep}"`, { separator: sep })).toBe(
      `5${sep}\u2032${sep}10${sep}\u2033`
    )
  })

  it("handles feet and inches together", () => {
    expect(primeMarks('The ceiling is 9\'6" high')).toBe(
      "The ceiling is 9\u20326\u2033 high"
    )
  })

  it("handles coordinates with degrees", () => {
    expect(primeMarks("40° 44' 54\" N")).toBe("40° 44\u2032 54\u2033 N")
  })

  it("does not convert closing quotes after numbers", () => {
    // Issue: "Term 1". should not become "Term 1″."
    expect(primeMarks('"Term 1".')).toBe('"Term 1".')
    expect(primeMarks('"Number 5"')).toBe('"Number 5"')
    expect(primeMarks('"Item 3", "Item 4"')).toBe('"Item 3", "Item 4"')
  })

  it("still converts standalone inches measurements", () => {
    expect(primeMarks('12"')).toBe("12\u2033")
    expect(primeMarks('The board is 12" wide')).toBe("The board is 12\u2033 wide")
    expect(primeMarks('12" long')).toBe("12\u2033 long")
  })
})

describe("fractions", () => {
  it.each([
    ["1/2", "\u00BD"],
    ["1/4", "\u00BC"],
    ["3/4", "\u00BE"],
    ["1/3", "\u2153"],
    ["2/3", "\u2154"],
    ["Add 1/2 cup", "Add \u00BD cup"],
    ["About 3/4 done", "About \u00BE done"],
    ["1/8 teaspoon", "\u215B teaspoon"],
    ["21/4", "21/4"],
    ["page 1/25", "page 1/25"],
    ["1/7", "1/7"],
    ["5/9", "5/9"],
  ])('converts "%s" to "%s"', (input, expected) => {
    expect(fractions(input)).toBe(expected)
  })
})

describe("symbolTransform", () => {
  it.each([
    ["Wait... 5x5 != 20 (c) 2024", "Wait\u2026 5\u00D75 \u2260 20 \u00A9 2024"],
    ["-2 x 3", "-2 \u00D7 3"],
    ["5 x 5", "5 \u00D7 5"],
  ])('converts "%s" to "%s"', (input, expected) => {
    expect(symbolTransform(input)).toBe(expected)
  })

  it("handles complex text with multiple symbols", () => {
    const input = "Product(tm) v2.0 - Size: 10x20 cm, tolerance +- 5%"
    const result = symbolTransform(input)
    expect(result).toContain("\u2122") // trademark
    expect(result).toContain("\u00D7") // multiplication
    expect(result).toContain("\u00B1") // plus/minus
  })

  it("respects separator option", () => {
    const sep = "\uE000"
    const input = `5${sep}x${sep}5`
    const result = symbolTransform(input, { separator: sep })
    expect(result).toContain("\u00D7")
  })

  it("includes arrows by default", () => {
    expect(symbolTransform("A -> B")).toBe("A \u2192 B")
  })

  it("can disable arrows with includeArrows: false", () => {
    expect(symbolTransform("A -> B", { includeArrows: false })).toBe("A -> B")
  })
})
