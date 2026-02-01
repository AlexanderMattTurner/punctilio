import {
  ellipsis,
  multiplication,
  mathSymbols,
  legalSymbols,
  arrows,
  degrees,
  primeMarks,
  fractions,
  collapseSpaces,
  superscriptOrdinal,
  punctuationLigatures,
  symbolTransform,
} from "../symbols.js"
import { UNICODE_SYMBOLS, DEFAULT_SEPARATOR } from "../constants.js"

describe("ellipsis", () => {
  it.each([
    ["Wait for it...", `Wait for it${UNICODE_SYMBOLS.ELLIPSIS}`],
    ["Hmm... let me think", `Hmm${UNICODE_SYMBOLS.ELLIPSIS} let me think`],
    ["...", UNICODE_SYMBOLS.ELLIPSIS],
    ["Hello...world", `Hello${UNICODE_SYMBOLS.ELLIPSIS} world`],
    ["End of sentence...", `End of sentence${UNICODE_SYMBOLS.ELLIPSIS}`],
    ['..."', `${UNICODE_SYMBOLS.ELLIPSIS}"`],
    ["...!", `${UNICODE_SYMBOLS.ELLIPSIS}!`],
    ["...?", `${UNICODE_SYMBOLS.ELLIPSIS}?`],
    ["e.g.", "e.g."],
    ["U.S.A.", "U.S.A."],
    ["a.b", "a.b"],
    ["End....", `End${UNICODE_SYMBOLS.ELLIPSIS}.`], // 4 dots
    ["......", `${UNICODE_SYMBOLS.ELLIPSIS}${UNICODE_SYMBOLS.ELLIPSIS}`], // 6 dots
  ])('converts "%s" to "%s"', (input, expected) => {
    expect(ellipsis(input)).toBe(expected)
  })

  it.each([
    ["between all dots", `.${DEFAULT_SEPARATOR}.${DEFAULT_SEPARATOR}.`, `${UNICODE_SYMBOLS.ELLIPSIS}${DEFAULT_SEPARATOR}${DEFAULT_SEPARATOR}`],
    ["after ellipsis", `...${DEFAULT_SEPARATOR}`, `${UNICODE_SYMBOLS.ELLIPSIS}${DEFAULT_SEPARATOR}`],
    ["after first dot", `.${DEFAULT_SEPARATOR}..`, `${UNICODE_SYMBOLS.ELLIPSIS}${DEFAULT_SEPARATOR}`],
    ["after second dot", `..${DEFAULT_SEPARATOR}.`, `${UNICODE_SYMBOLS.ELLIPSIS}${DEFAULT_SEPARATOR}`],
  ])("preserves separators: %s", (_desc, input, expected) => {
    const result = ellipsis(input, { separator: DEFAULT_SEPARATOR })
    expect(result).toBe(expected)
  })
})

describe("multiplication", () => {
  it.each([
    ["5x5", `5${UNICODE_SYMBOLS.MULTIPLICATION}5`],
    ["10 x 20", `10 ${UNICODE_SYMBOLS.MULTIPLICATION} 20`],
    ["10x20", `10${UNICODE_SYMBOLS.MULTIPLICATION}20`],
    ["The room is 10x12 feet", `The room is 10${UNICODE_SYMBOLS.MULTIPLICATION}12 feet`],
    ["2x speed", `2${UNICODE_SYMBOLS.MULTIPLICATION} speed`],
    ["3x", `3${UNICODE_SYMBOLS.MULTIPLICATION}`],
    ["5*3", `5${UNICODE_SYMBOLS.MULTIPLICATION}3`],
    ["Resolution: 1920x1080", `Resolution: 1920${UNICODE_SYMBOLS.MULTIPLICATION}1080`],
    // Test trailing multiplier before punctuation (word boundary cases)
    ['2x"', `2${UNICODE_SYMBOLS.MULTIPLICATION}"`],
    ["2x'", `2${UNICODE_SYMBOLS.MULTIPLICATION}'`],
    ["2x.", `2${UNICODE_SYMBOLS.MULTIPLICATION}.`],
    ["2x,", `2${UNICODE_SYMBOLS.MULTIPLICATION},`],
    ["2x!", `2${UNICODE_SYMBOLS.MULTIPLICATION}!`],
    ["2x?", `2${UNICODE_SYMBOLS.MULTIPLICATION}?`],
    ["extra", "extra"],
    ["complex", "complex"],
    ["x-axis", "x-axis"],
    ["5xword", "5xword"],
    ["10xbox", "10xbox"],
    ["2xLarge", "2xLarge"],
  ])('converts "%s" to "%s"', (input, expected) => {
    expect(multiplication(input)).toBe(expected)
  })

  it("handles separator characters", () => {
    const sep = "\uE000"
    expect(multiplication(`5${sep}x${sep}5`, { separator: sep })).toBe(`5${sep}${UNICODE_SYMBOLS.MULTIPLICATION}${sep}5`)
  })

  describe("marker robustness", () => {
    // Tests that separators don't create false word boundaries
    // e.g., "5x\uE000tra" should NOT match because the actual text is "5xtra"
    const sep = DEFAULT_SEPARATOR

    it.each([
      // [description, input, expected]
      ["false boundary before word char", `5x${sep}tra`, `5x${sep}tra`], // "5xtra" - should NOT convert
      ["valid boundary before space", `5x${sep} done`, `5${UNICODE_SYMBOLS.MULTIPLICATION}${sep} done`], // should convert
      ["valid boundary before punctuation", `5x${sep}.`, `5${UNICODE_SYMBOLS.MULTIPLICATION}${sep}.`], // should convert
    ])("handles %s", (_desc, input, expected) => {
      expect(multiplication(input, { separator: sep })).toBe(expected)
    })
  })
})

describe("mathSymbols", () => {
  it.each([
    ["x != y", `x ${UNICODE_SYMBOLS.NOT_EQUAL} y`],
    ["a!=b", `a${UNICODE_SYMBOLS.NOT_EQUAL}b`],
    ["1 != 2", `1 ${UNICODE_SYMBOLS.NOT_EQUAL} 2`],
    ["+-5", `${UNICODE_SYMBOLS.PLUS_MINUS}5`],
    ["+/-5", `${UNICODE_SYMBOLS.PLUS_MINUS}5`],
    ["The answer is +- 5%", `The answer is ${UNICODE_SYMBOLS.PLUS_MINUS} 5%`],
    ["tolerance: +/-0.5", `tolerance: ${UNICODE_SYMBOLS.PLUS_MINUS}0.5`],
    ["a <= b", `a ${UNICODE_SYMBOLS.LESS_EQUAL} b`],
    ["x >= y", `x ${UNICODE_SYMBOLS.GREATER_EQUAL} y`],
    ["~= 5", `${UNICODE_SYMBOLS.APPROXIMATE} 5`],
    ["=~ 5", `${UNICODE_SYMBOLS.APPROXIMATE} 5`],
  ])('converts "%s" to "%s"', (input, expected) => {
    expect(mathSymbols(input)).toBe(expected)
  })
})

describe("legalSymbols", () => {
  it.each([
    ["Copyright (c) 2024", `Copyright ${UNICODE_SYMBOLS.COPYRIGHT} 2024`],
    ["(C) Acme Inc", `${UNICODE_SYMBOLS.COPYRIGHT} Acme Inc`],
    ["Brand(r)", `Brand${UNICODE_SYMBOLS.REGISTERED}`],
    ["Product (R)", `Product ${UNICODE_SYMBOLS.REGISTERED}`],
    ["Name(tm)", `Name${UNICODE_SYMBOLS.TRADEMARK}`],
    ["Name (TM)", `Name ${UNICODE_SYMBOLS.TRADEMARK}`],
    ["(c) 2024 (r) Brand(tm)", `${UNICODE_SYMBOLS.COPYRIGHT} 2024 ${UNICODE_SYMBOLS.REGISTERED} Brand${UNICODE_SYMBOLS.TRADEMARK}`],
  ])('converts "%s" to "%s"', (input, expected) => {
    expect(legalSymbols(input)).toBe(expected)
  })
})

describe("arrows", () => {
  it.each([
    ["A -> B", `A ${UNICODE_SYMBOLS.ARROW_RIGHT} B`],
    ["A <- B", `A ${UNICODE_SYMBOLS.ARROW_LEFT} B`],
    ["A <-> B", `A ${UNICODE_SYMBOLS.ARROW_LEFT_RIGHT} B`],
    ["A --> B", `A ${UNICODE_SYMBOLS.ARROW_RIGHT} B`],
    ["A <-- B", `A ${UNICODE_SYMBOLS.ARROW_LEFT} B`],
    ["A <--> B", `A ${UNICODE_SYMBOLS.ARROW_LEFT_RIGHT} B`],
    ["start -> middle -> end", `start ${UNICODE_SYMBOLS.ARROW_RIGHT} middle ${UNICODE_SYMBOLS.ARROW_RIGHT} end`],
    // Pointer-style arrows preserved (no spaces)
    ["function->call", "function->call"],
    ["array[0]->value", "array[0]->value"],
  ])('converts "%s" to "%s"', (input, expected) => {
    expect(arrows(input)).toBe(expected)
  })
})

describe("degrees", () => {
  it.each([
    ["20 C", `20 ${UNICODE_SYMBOLS.DEGREE}C`],
    ["20C", `20 ${UNICODE_SYMBOLS.DEGREE}C`],
    ["68 F", `68 ${UNICODE_SYMBOLS.DEGREE}F`],
    ["68F", `68 ${UNICODE_SYMBOLS.DEGREE}F`],
    ["Water boils at 100 C", `Water boils at 100 ${UNICODE_SYMBOLS.DEGREE}C`],
    ["Room temperature: 72F", `Room temperature: 72 ${UNICODE_SYMBOLS.DEGREE}F`],
    // Test degrees before punctuation (word boundary cases)
    ["20C.", `20 ${UNICODE_SYMBOLS.DEGREE}C.`],
    ["68F!", `68 ${UNICODE_SYMBOLS.DEGREE}F!`],
    ["100C,", `100 ${UNICODE_SYMBOLS.DEGREE}C,`],
    ["20 km", "20 km"],
    ["Section C", "Section C"],
    ["100 C", `100 ${UNICODE_SYMBOLS.DEGREE}C`],
    ["212F", `212 ${UNICODE_SYMBOLS.DEGREE}F`],
    ["-40 C", `-40 ${UNICODE_SYMBOLS.DEGREE}C`],
    // Case-sensitive: lowercase c/f should NOT be converted
    ["20 c", "20 c"],
    ["68 f", "68 f"],
    ["20c", "20c"],
    ["68f", "68f"],
  ])('converts "%s" to "%s"', (input, expected) => {
    expect(degrees(input)).toBe(expected)
  })

  it("handles separator characters", () => {
    const sep = "\uE000"
    expect(degrees(`20${sep}C`, { separator: sep })).toBe(
      `20${sep} ${UNICODE_SYMBOLS.DEGREE}C`
    )
  })

  describe("marker robustness", () => {
    // Tests that separators don't create false word boundaries
    const sep = DEFAULT_SEPARATOR

    it.each([
      // [description, input, expected]
      ["false boundary before word char", `20C${sep}elsius`, `20C${sep}elsius`], // "20Celsius" - should NOT convert
      ["valid boundary before space", `20C${sep} today`, `20 ${UNICODE_SYMBOLS.DEGREE}C${sep} today`], // should convert
      ["valid boundary before punctuation", `68F${sep}.`, `68 ${UNICODE_SYMBOLS.DEGREE}F${sep}.`], // should convert
    ])("handles %s", (_desc, input, expected) => {
      expect(degrees(input, { separator: sep })).toBe(expected)
    })
  })
})

describe("primeMarks", () => {
  it.each([
    ['5\'10"', `5${UNICODE_SYMBOLS.PRIME}10${UNICODE_SYMBOLS.DOUBLE_PRIME}`],
    ['He is 6\'2" tall', `He is 6${UNICODE_SYMBOLS.PRIME}2${UNICODE_SYMBOLS.DOUBLE_PRIME} tall`],
    ["The board is 8' long", `The board is 8${UNICODE_SYMBOLS.PRIME} long`],
    ['12"', `12${UNICODE_SYMBOLS.DOUBLE_PRIME}`],
    ["Location: 45° 30' 15\"", `Location: 45° 30${UNICODE_SYMBOLS.PRIME} 15${UNICODE_SYMBOLS.DOUBLE_PRIME}`],
    ["don't", "don't"],
    ["it's", "it's"],
    ["'Twas the night", "'Twas the night"],
    ["'hello'", "'hello'"],
    ['"test"', '"test"'],
    ['The ceiling is 9\'6" high', `The ceiling is 9${UNICODE_SYMBOLS.PRIME}6${UNICODE_SYMBOLS.DOUBLE_PRIME} high`],
    ["40° 44' 54\" N", `40° 44${UNICODE_SYMBOLS.PRIME} 54${UNICODE_SYMBOLS.DOUBLE_PRIME} N`],
    ['The board is 12" wide', `The board is 12${UNICODE_SYMBOLS.DOUBLE_PRIME} wide`],
    ['12" long', `12${UNICODE_SYMBOLS.DOUBLE_PRIME} long`],
  ])('converts "%s" to "%s"', (input, expected) => {
    expect(primeMarks(input)).toBe(expected)
  })

  // Quote balancing tests: tipograph's simple (\d)" pattern would incorrectly convert these
  it.each([
    ['"Term 1".', '"Term 1".'],
    ['"Number 5"', '"Number 5"'],
    ['"Item 3", "Item 4"', '"Item 3", "Item 4"'],
    ['She said "Chapter 5" was good', 'She said "Chapter 5" was good'],
    ['The file "test_v2" exists', 'The file "test_v2" exists'],
    ['"Room 101" is famous', '"Room 101" is famous'],
  ])('preserves closing quotes via quote balancing: "%s"', (input, expected) => {
    expect(primeMarks(input)).toBe(expected)
  })

  it("handles separator characters", () => {
    const sep = "\uE000"
    expect(primeMarks(`5${sep}'${sep}10${sep}"`, { separator: sep })).toBe(
      `5${sep}${UNICODE_SYMBOLS.PRIME}${sep}10${sep}${UNICODE_SYMBOLS.DOUBLE_PRIME}`
    )
  })
})

describe("fractions", () => {
  it.each([
    ["1/2", UNICODE_SYMBOLS.FRACTION_1_2],
    ["1/4", UNICODE_SYMBOLS.FRACTION_1_4],
    ["3/4", UNICODE_SYMBOLS.FRACTION_3_4],
    ["1/3", UNICODE_SYMBOLS.FRACTION_1_3],
    ["2/3", UNICODE_SYMBOLS.FRACTION_2_3],
    ["Add 1/2 cup", `Add ${UNICODE_SYMBOLS.FRACTION_1_2} cup`],
    ["About 3/4 done", `About ${UNICODE_SYMBOLS.FRACTION_3_4} done`],
    ["1/8 teaspoon", `${UNICODE_SYMBOLS.FRACTION_1_8} teaspoon`],
    // Test fractions before punctuation
    ["1/2.", `${UNICODE_SYMBOLS.FRACTION_1_2}.`],
    ["3/4!", `${UNICODE_SYMBOLS.FRACTION_3_4}!`],
    ["1/4,", `${UNICODE_SYMBOLS.FRACTION_1_4},`],
    ["21/4", "21/4"],
    ["page 1/25", "page 1/25"],
    ["1/7", "1/7"],
    ["5/9", "5/9"],
    // Edge cases: fractions in paths/URLs should not match
    ["a/1/4", "a/1/4"],
    ["1/4/b", "1/4/b"],
    ["x/1/2", "x/1/2"],
    // Edge cases: fractions adjacent to decimals
    ["3.1/4", "3.1/4"],
    ["1/4.5", "1/4.5"],
  ])('converts "%s" to "%s"', (input, expected) => {
    expect(fractions(input)).toBe(expected)
  })

  it("handles separator characters", () => {
    const sep = "\uE000"
    expect(fractions(`1${sep}/${sep}2`, { separator: sep })).toBe(
      `${sep}${UNICODE_SYMBOLS.FRACTION_1_2}${sep}`
    )
  })
})

describe("collapseSpaces", () => {
  const { NBSP } = UNICODE_SYMBOLS

  it.each([
    // Multiple regular spaces
    ["hello  world", "hello world"],
    ["a   b", "a b"],
    ["x    y", "x y"],
    // Multiple nbsp
    [`foo${NBSP}${NBSP}bar`, `foo${NBSP}bar`],
    [`a${NBSP}${NBSP}${NBSP}b`, `a${NBSP}b`],
    // Mixed: space followed by nbsp (keeps space)
    [`a ${NBSP}b`, "a b"],
    [`x  ${NBSP}y`, "x y"],
    // Mixed: nbsp followed by space (keeps nbsp)
    [`a${NBSP} b`, `a${NBSP}b`],
    [`x${NBSP}  y`, `x${NBSP}y`],
    // Mixed sequences
    [`a ${NBSP} b`, "a b"],
    [`x${NBSP} ${NBSP}y`, `x${NBSP}y`],
    // Single spaces unchanged
    ["hello world", "hello world"],
    [`foo${NBSP}bar`, `foo${NBSP}bar`],
    // Multiple groups of spaces
    ["a  b  c", "a b c"],
    [`x${NBSP}${NBSP}y  z`, `x${NBSP}y z`],
    // Edge cases
    ["", ""],
    ["  ", " "],
    [`${NBSP}${NBSP}`, NBSP],
    ["no spaces", "no spaces"],
  ])('converts "%s" to "%s"', (input, expected) => {
    expect(collapseSpaces(input)).toBe(expected)
  })
})

describe("superscriptOrdinal", () => {
  it.each([
    // Basic ordinals
    ["1st", `1${UNICODE_SYMBOLS.SUPERSCRIPT_ST}`],
    ["2nd", `2${UNICODE_SYMBOLS.SUPERSCRIPT_ND}`],
    ["3rd", `3${UNICODE_SYMBOLS.SUPERSCRIPT_RD}`],
    ["4th", `4${UNICODE_SYMBOLS.SUPERSCRIPT_TH}`],
    // Larger numbers
    ["21st", `21${UNICODE_SYMBOLS.SUPERSCRIPT_ST}`],
    ["22nd", `22${UNICODE_SYMBOLS.SUPERSCRIPT_ND}`],
    ["23rd", `23${UNICODE_SYMBOLS.SUPERSCRIPT_RD}`],
    ["30th", `30${UNICODE_SYMBOLS.SUPERSCRIPT_TH}`],
    ["100th", `100${UNICODE_SYMBOLS.SUPERSCRIPT_TH}`],
    // In sentences
    ["The 1st place winner", `The 1${UNICODE_SYMBOLS.SUPERSCRIPT_ST} place winner`],
    ["Born on the 30th of June", `Born on the 30${UNICODE_SYMBOLS.SUPERSCRIPT_TH} of June`],
    ["The 21st century", `The 21${UNICODE_SYMBOLS.SUPERSCRIPT_ST} century`],
    // Before punctuation
    ["1st.", `1${UNICODE_SYMBOLS.SUPERSCRIPT_ST}.`],
    ["2nd,", `2${UNICODE_SYMBOLS.SUPERSCRIPT_ND},`],
    ["3rd!", `3${UNICODE_SYMBOLS.SUPERSCRIPT_RD}!`],
    // Case insensitive
    ["1ST", `1${UNICODE_SYMBOLS.SUPERSCRIPT_ST}`],
    ["2ND", `2${UNICODE_SYMBOLS.SUPERSCRIPT_ND}`],
    ["3RD", `3${UNICODE_SYMBOLS.SUPERSCRIPT_RD}`],
    ["4TH", `4${UNICODE_SYMBOLS.SUPERSCRIPT_TH}`],
    // Should not match non-ordinal text
    ["first", "first"],
    ["stand", "stand"],
    ["thunder", "thunder"],
    ["rand", "rand"],
  ])('converts "%s" to "%s"', (input, expected) => {
    expect(superscriptOrdinal(input)).toBe(expected)
  })

  it("handles separator characters", () => {
    const sep = "\uE000"
    expect(superscriptOrdinal(`30${sep}th`, { separator: sep })).toBe(
      `30${sep}${UNICODE_SYMBOLS.SUPERSCRIPT_TH}`
    )
  })

  describe("marker robustness", () => {
    // Tests that separators don't create false word boundaries
    const sep = DEFAULT_SEPARATOR

    it.each([
      // [description, input, expected]
      ["false boundary (1stly)", `1st${sep}ly`, `1st${sep}ly`], // "1stly" - should NOT convert
      ["false boundary (2ndary)", `2nd${sep}ary`, `2nd${sep}ary`], // "2ndary" - should NOT convert
      ["false boundary (3rdly)", `3rd${sep}ly`, `3rd${sep}ly`], // "3rdly" - should NOT convert
      ["valid boundary before space", `1st${sep} place`, `1${UNICODE_SYMBOLS.SUPERSCRIPT_ST}${sep} place`], // should convert
      ["valid boundary before punctuation", `2nd${sep}.`, `2${UNICODE_SYMBOLS.SUPERSCRIPT_ND}${sep}.`], // should convert
    ])("handles %s", (_desc, input, expected) => {
      expect(superscriptOrdinal(input, { separator: sep })).toBe(expected)
    })
  })
})

describe("punctuationLigatures", () => {
  it.each([
    // Double/multiple question marks squashed to ligature
    ["What??", `What${UNICODE_SYMBOLS.DOUBLE_QUESTION}`],
    ["Really???", `Really${UNICODE_SYMBOLS.DOUBLE_QUESTION}`],
    ["Huh????", `Huh${UNICODE_SYMBOLS.DOUBLE_QUESTION}`],
    ["??", UNICODE_SYMBOLS.DOUBLE_QUESTION],
    // Question + exclamation(s) → ⁈
    ["Really?!", `Really${UNICODE_SYMBOLS.QUESTION_EXCLAMATION}`],
    ["What?!!", `What${UNICODE_SYMBOLS.QUESTION_EXCLAMATION}`],
    ["?!", UNICODE_SYMBOLS.QUESTION_EXCLAMATION],
    // Exclamation + question(s) → ⁉
    ["No way!?", `No way${UNICODE_SYMBOLS.EXCLAMATION_QUESTION}`],
    ["What!??", `What${UNICODE_SYMBOLS.EXCLAMATION_QUESTION}`],
    ["!?", UNICODE_SYMBOLS.EXCLAMATION_QUESTION],
    // Double/multiple exclamation marks squashed to single
    ["Wow!!", "Wow!"],
    ["Amazing!!!", "Amazing!"],
    ["Yes!!!!", "Yes!"],
    ["!!", "!"],
    // Single punctuation unchanged
    ["What?", "What?"],
    ["Wow!", "Wow!"],
    // Text without punctuation unchanged
    ["Hello world", "Hello world"],
  ])('converts "%s" to "%s"', (input, expected) => {
    expect(punctuationLigatures(input)).toBe(expected)
  })

  it.each([
    ["??", `${UNICODE_SYMBOLS.DOUBLE_QUESTION}${DEFAULT_SEPARATOR}`],
    ["?!", `${UNICODE_SYMBOLS.QUESTION_EXCLAMATION}${DEFAULT_SEPARATOR}`],
    ["!?", `${UNICODE_SYMBOLS.EXCLAMATION_QUESTION}${DEFAULT_SEPARATOR}`],
    ["!!", `!${DEFAULT_SEPARATOR}`],
  ])("preserves separator in %s", (marks, expected) => {
    const input = marks[0] + DEFAULT_SEPARATOR + marks[1]
    expect(punctuationLigatures(input, { separator: DEFAULT_SEPARATOR })).toBe(expected)
  })

  it("handles multiple ligatures in same text", () => {
    const input = "What?? Really?! No way!? Wow!!"
    const expected = `What${UNICODE_SYMBOLS.DOUBLE_QUESTION} Really${UNICODE_SYMBOLS.QUESTION_EXCLAMATION} No way${UNICODE_SYMBOLS.EXCLAMATION_QUESTION} Wow!`
    expect(punctuationLigatures(input)).toBe(expected)
  })
})

describe("hexadecimal preservation", () => {
  it.each([
    "0x5F3759DF",
    "0xff",
    "0X1A2B",
    "The magic number is 0x5F3759DF",
    "test 0x",
    "value: 0X",
  ])('preserves "%s"', (input) => {
    expect(multiplication(input)).toBe(input)
  })
})

describe("symbolTransform", () => {
  it.each([
    ["Wait... 5x5 != 20 (c) 2024", `Wait${UNICODE_SYMBOLS.ELLIPSIS} 5${UNICODE_SYMBOLS.MULTIPLICATION}5 ${UNICODE_SYMBOLS.NOT_EQUAL} 20 ${UNICODE_SYMBOLS.COPYRIGHT} 2024`],
    ["-2 x 3", `-2 ${UNICODE_SYMBOLS.MULTIPLICATION} 3`],
    ["5 x 5", `5 ${UNICODE_SYMBOLS.MULTIPLICATION} 5`],
  ])('converts "%s" to "%s"', (input, expected) => {
    expect(symbolTransform(input)).toBe(expected)
  })

  it("handles complex text with multiple symbols", () => {
    const input = "Product(tm) v2.0 - Size: 10x20 cm, tolerance +- 5%"
    const result = symbolTransform(input)
    expect(result).toContain(UNICODE_SYMBOLS.TRADEMARK)
    expect(result).toContain(UNICODE_SYMBOLS.MULTIPLICATION)
    expect(result).toContain(UNICODE_SYMBOLS.PLUS_MINUS)
  })

  it("respects separator option", () => {
    const sep = "\uE000"
    const input = `5${sep}x${sep}5`
    const result = symbolTransform(input, { separator: sep })
    expect(result).toContain(UNICODE_SYMBOLS.MULTIPLICATION)
  })

  it("includes arrows by default", () => {
    expect(symbolTransform("A -> B")).toBe(`A ${UNICODE_SYMBOLS.ARROW_RIGHT} B`)
  })

  it("can disable arrows with includeArrows: false", () => {
    expect(symbolTransform("A -> B", { includeArrows: false })).toBe("A -> B")
  })
})
