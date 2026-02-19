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

  it.each([
    ["!==", "!=="],
    ["x !== y", "x !== y"],
    ["a !== b !== c", "a !== b !== c"],
    ["<==", "<=="],
    [">==", ">=="],
  ])('preserves multi-char operator "%s"', (input, expected) => {
    expect(mathSymbols(input)).toBe(expected)
  })
})

describe("legalSymbols", () => {
  it.each([
    // (c) with year → copyright
    ["Copyright (c) 2024", `Copyright ${UNICODE_SYMBOLS.COPYRIGHT} 2024`],
    ["(c) 2024 (r) Brand(tm)", `${UNICODE_SYMBOLS.COPYRIGHT} 2024 ${UNICODE_SYMBOLS.REGISTERED} Brand${UNICODE_SYMBOLS.TRADEMARK}`],
    ["(C) 1999 Company", `${UNICODE_SYMBOLS.COPYRIGHT} 1999 Company`],
    // (c) preceded by "copyright" → copyright
    ["Copyright (c) Company", `Copyright ${UNICODE_SYMBOLS.COPYRIGHT} Company`],
    ["copyright (C) by Author", `copyright ${UNICODE_SYMBOLS.COPYRIGHT} by Author`],
    // (r) converts in trademark context
    ["Brand(r)", `Brand${UNICODE_SYMBOLS.REGISTERED}`],
    ["Product (R)", `Product ${UNICODE_SYMBOLS.REGISTERED}`],
    ["Name(tm)", `Name${UNICODE_SYMBOLS.TRADEMARK}`],
    ["Name (TM)", `Name ${UNICODE_SYMBOLS.TRADEMARK}`],
  ])('converts "%s" to "%s"', (input, expected) => {
    expect(legalSymbols(input)).toBe(expected)
  })

  it.each([
    // Enumerations
    ["(a), (b), (c), (d)", "(a), (b), (c), (d)"],
    ["(a), (b), (C), (d)", "(a), (b), (C), (d)"],
    ["options (A) and (B) and (C)", "options (A) and (B) and (C)"],
    // Legal subsections
    ["paragraph (c)(2)(A)", "paragraph (c)(2)(A)"],
    ["section 5(c)(1)", "section 5(c)(1)"],
    // Standalone references without copyright context
    ["subsection (c)", "subsection (c)"],
    ["the (c) symbol", "the (c) symbol"],
    ["discussed in (c) above", "discussed in (c) above"],
    ["(C) Acme Inc", "(C) Acme Inc"],
  ])('preserves (c) in non-copyright context "%s"', (input, expected) => {
    expect(legalSymbols(input)).toBe(expected)
  })

  it.each([
    // (r) in enumerations
    ["(p), (q), (r), (s)", "(p), (q), (r), (s)"],
    ["(Q); (R); (S)", "(Q); (R); (S)"],
    // (r) in legal citations
    ["See (r)(1)(A)", "See (r)(1)(A)"],
  ])('preserves (r) in non-trademark context "%s"', (input, expected) => {
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
    // Multiple primes in one string
    ["10' x 12'", `10${UNICODE_SYMBOLS.PRIME} x 12${UNICODE_SYMBOLS.PRIME}`],
    ["The room is 10' x 12' x 8' tall", `The room is 10${UNICODE_SYMBOLS.PRIME} x 12${UNICODE_SYMBOLS.PRIME} x 8${UNICODE_SYMBOLS.PRIME} tall`],
    ['10" x 12"', `10${UNICODE_SYMBOLS.DOUBLE_PRIME} x 12${UNICODE_SYMBOLS.DOUBLE_PRIME}`],
    [`5' and 8' boards`, `5${UNICODE_SYMBOLS.PRIME} and 8${UNICODE_SYMBOLS.PRIME} boards`],
    // Contractions before primes
    ["it's 5' long", `it's 5${UNICODE_SYMBOLS.PRIME} long`],
    ["don't measure 8'", `don't measure 8${UNICODE_SYMBOLS.PRIME}`],
    ["she's 5'10\"", `she's 5${UNICODE_SYMBOLS.PRIME}10${UNICODE_SYMBOLS.DOUBLE_PRIME}`],
    ["O'Brien's 6' fence", `O'Brien's 6${UNICODE_SYMBOLS.PRIME} fence`],
    // Possessive plurals before primes
    ["the dogs' 5' leashes", `the dogs' 5${UNICODE_SYMBOLS.PRIME} leashes`],
    ["the cats' and dogs' 5' run", `the cats' and dogs' 5${UNICODE_SYMBOLS.PRIME} run`],
  ])('converts "%s" to "%s"', (input, expected) => {
    expect(primeMarks(input)).toBe(expected)
  })

  // Quote balancing tests: simple (\d)['"]) patterns would incorrectly convert these
  it.each([
    // Double quote balancing
    ['"Term 1".', '"Term 1".'],
    ['"Number 5"', '"Number 5"'],
    ['"Item 3", "Item 4"', '"Item 3", "Item 4"'],
    ['She said "Chapter 5" was good', 'She said "Chapter 5" was good'],
    ['The file "test_v2" exists', 'The file "test_v2" exists'],
    ['"Room 101" is famous', '"Room 101" is famous'],
    // Single quote balancing
    ["'Term 1'", "'Term 1'"],
    ["'Item 3'", "'Item 3'"],
    ["She said 'Chapter 5' was good", "She said 'Chapter 5' was good"],
  ])('preserves closing quotes via quote balancing: "%s"', (input, expected) => {
    expect(primeMarks(input)).toBe(expected)
  })

  // Feet-inches inside balanced quotes: the balance tracker detects ′ + digits
  // before a " prime candidate and converts it to ″ regardless of quote balance
  it.each([
    ['"He is 5\'10" tall"', `"He is 5${UNICODE_SYMBOLS.PRIME}10${UNICODE_SYMBOLS.DOUBLE_PRIME} tall"`],
    ['"The shelf is 5\'11" wide"', `"The shelf is 5${UNICODE_SYMBOLS.PRIME}11${UNICODE_SYMBOLS.DOUBLE_PRIME} wide"`],
  ])('feet-inches inside balanced quotes converts "%s"', (input, expected) => {
    expect(primeMarks(input)).toBe(expected)
  })

  it("handles separator characters", () => {
    const sep = "\uE000"
    expect(primeMarks(`5${sep}'${sep}10${sep}"`, { separator: sep })).toBe(
      `5${sep}${UNICODE_SYMBOLS.PRIME}${sep}10${sep}${UNICODE_SYMBOLS.DOUBLE_PRIME}`
    )
  })

  // Separator-aware contractions: the quote classification pattern must recognize
  // contractions even when separators split the word across HTML element boundaries
  it.each([
    // Contraction with separator before the apostrophe: it<sep>'s
    [`it${"\uE000"}'${"\uE000"}s 5'`, `it${"\uE000"}'${"\uE000"}s 5${UNICODE_SYMBOLS.PRIME}`],
    // Contraction with separator after the apostrophe: don't
    [`don${"\uE000"}'t measure 8'`, `don${"\uE000"}'t measure 8${UNICODE_SYMBOLS.PRIME}`],
    // Trailing apostrophe with separator: dogs<sep>'
    [`the dogs${"\uE000"}' 5' leashes`, `the dogs${"\uE000"}' 5${UNICODE_SYMBOLS.PRIME} leashes`],
  ])('separator-aware contraction/trailing in "%s"', (input, expected) => {
    expect(primeMarks(input, { separator: "\uE000" })).toBe(expected)
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
    // Multiple regular spaces → single space
    ["hello  world", "hello world"],
    ["a   b", "a b"],
    ["x    y", "x y"],
    // Multiple nbsp → single nbsp
    [`foo${NBSP}${NBSP}bar`, `foo${NBSP}bar`],
    [`a${NBSP}${NBSP}${NBSP}b`, `a${NBSP}b`],
    // Mixed: any nbsp present → prefer nbsp (more likely intentional)
    [`a ${NBSP}b`, `a${NBSP}b`],
    [`x  ${NBSP}y`, `x${NBSP}y`],
    [`a${NBSP} b`, `a${NBSP}b`],
    [`x${NBSP}  y`, `x${NBSP}y`],
    [`a ${NBSP} b`, `a${NBSP}b`],
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

// Tests derived from competitor libraries and typography guidelines
describe("competitor-derived edge cases", () => {
  // From retext-smartypants: ellipsis variations
  describe("ellipsis patterns", () => {
    it.each([
      // Ellipsis at boundaries
      ["...start", `${UNICODE_SYMBOLS.ELLIPSIS} start`],
      ["end...", `end${UNICODE_SYMBOLS.ELLIPSIS}`],
      // Four dots = ellipsis + period
      ["text....", `text${UNICODE_SYMBOLS.ELLIPSIS}.`],
      // Six dots = two ellipses
      ["text......", `text${UNICODE_SYMBOLS.ELLIPSIS}${UNICODE_SYMBOLS.ELLIPSIS}`],
    ])('handles ellipsis pattern: "%s"', (input, expected) => {
      expect(ellipsis(input)).toBe(expected)
    })

    it("converts spaced periods to ellipsis", () => {
      expect(ellipsis("text. . . more")).toBe(`text${UNICODE_SYMBOLS.ELLIPSIS} more`)
      expect(ellipsis(". . .")).toBe(UNICODE_SYMBOLS.ELLIPSIS)
      // Also works with non-breaking spaces
      expect(ellipsis(`.${UNICODE_SYMBOLS.NBSP}.${UNICODE_SYMBOLS.NBSP}.`)).toBe(UNICODE_SYMBOLS.ELLIPSIS)
    })

    it("preserves non-ellipsis spaced periods", () => {
      // Only exactly three spaced dots are converted
      expect(ellipsis("a . b . c")).toBe("a . b . c")
    })
  })

  // From smartquotes.js: prime marks for height
  describe("height measurements", () => {
    it.each([
      ['6\'2"', `6${UNICODE_SYMBOLS.PRIME}2${UNICODE_SYMBOLS.DOUBLE_PRIME}`],
      ['5\'10"', `5${UNICODE_SYMBOLS.PRIME}10${UNICODE_SYMBOLS.DOUBLE_PRIME}`],
      ["8' boards", `8${UNICODE_SYMBOLS.PRIME} boards`],
      ['cut 12" wide', `cut 12${UNICODE_SYMBOLS.DOUBLE_PRIME} wide`],
    ])('converts measurement: "%s"', (input, expected) => {
      expect(primeMarks(input)).toBe(expected)
    })
  })

  // From Standard Ebooks: coordinates
  describe("coordinate notation", () => {
    it.each([
      ["40° 44' 54\" N", `40° 44${UNICODE_SYMBOLS.PRIME} 54${UNICODE_SYMBOLS.DOUBLE_PRIME} N`],
      ["74° 0' 21\" W", `74° 0${UNICODE_SYMBOLS.PRIME} 21${UNICODE_SYMBOLS.DOUBLE_PRIME} W`],
      ["51° 30' N", `51° 30${UNICODE_SYMBOLS.PRIME} N`],
    ])('converts coordinates: "%s"', (input, expected) => {
      expect(primeMarks(input)).toBe(expected)
    })
  })

  // From typograf: math with spaces
  describe("math symbol spacing", () => {
    it.each([
      ["a != b", `a ${UNICODE_SYMBOLS.NOT_EQUAL} b`],
      ["x!=y", `x${UNICODE_SYMBOLS.NOT_EQUAL}y`],
      ["5 <= 10", `5 ${UNICODE_SYMBOLS.LESS_EQUAL} 10`],
      ["10 >= 5", `10 ${UNICODE_SYMBOLS.GREATER_EQUAL} 5`],
    ])('handles math symbols: "%s"', (input, expected) => {
      expect(mathSymbols(input)).toBe(expected)
    })
  })

  // From tipograph: arrow preservation in code
  describe("arrow context sensitivity", () => {
    it.each([
      // Should convert (spaced)
      ["input -> output", `input ${UNICODE_SYMBOLS.ARROW_RIGHT} output`],
      ["a <-> b", `a ${UNICODE_SYMBOLS.ARROW_LEFT_RIGHT} b`],
      // Should NOT convert (no spaces - code-like)
      ["obj->method", "obj->method"],
      ["ptr->value", "ptr->value"],
      ["this->that", "this->that"],
    ])('handles arrows contextually: "%s"', (input, expected) => {
      expect(arrows(input)).toBe(expected)
    })
  })
})

describe("complex real-world patterns", () => {
  describe("mixed measurements", () => {
    it.each([
      // Simple foot measurements
      ["The board is 8' long", `The board is 8${UNICODE_SYMBOLS.PRIME} long`],
      ['12" wide', `12${UNICODE_SYMBOLS.DOUBLE_PRIME} wide`],
      // Height notation
      ['6\'2"', `6${UNICODE_SYMBOLS.PRIME}2${UNICODE_SYMBOLS.DOUBLE_PRIME}`],
    ])('handles measurement: "%s"', (input, expected) => {
      expect(primeMarks(input)).toBe(expected)
    })

  })

  describe("temperatures in context", () => {
    it.each([
      ["Set oven to 350 F", `Set oven to 350 ${UNICODE_SYMBOLS.DEGREE}F`],
      ["Water freezes at 0 C", `Water freezes at 0 ${UNICODE_SYMBOLS.DEGREE}C`],
      ["Room temperature: 72 F", `Room temperature: 72 ${UNICODE_SYMBOLS.DEGREE}F`],
    ])('handles temperature: "%s"', (input, expected) => {
      expect(degrees(input)).toBe(expected)
    })
  })

  describe("legal text", () => {
    it.each([
      ["(c) 2024 Company", `${UNICODE_SYMBOLS.COPYRIGHT} 2024 Company`],
      ["Brand(r) is a registered trademark", `Brand${UNICODE_SYMBOLS.REGISTERED} is a registered trademark`],
      ["Product(tm) - buy now!", `Product${UNICODE_SYMBOLS.TRADEMARK} - buy now!`],
    ])('handles legal symbol: "%s"', (input, expected) => {
      expect(legalSymbols(input)).toBe(expected)
    })
  })

  describe("fractions in recipes", () => {
    it.each([
      ["Add 1/2 cup flour", `Add ${UNICODE_SYMBOLS.FRACTION_1_2} cup flour`],
      ["1/4 teaspoon salt", `${UNICODE_SYMBOLS.FRACTION_1_4} teaspoon salt`],
      ["about 3/4 done", `about ${UNICODE_SYMBOLS.FRACTION_3_4} done`],
      ["1/3 of the mixture", `${UNICODE_SYMBOLS.FRACTION_1_3} of the mixture`],
    ])('handles fraction: "%s"', (input, expected) => {
      expect(fractions(input)).toBe(expected)
    })
  })
})

describe("idempotency", () => {
  it.each([
    UNICODE_SYMBOLS.ELLIPSIS,
    `5${UNICODE_SYMBOLS.MULTIPLICATION}5`,
    `a ${UNICODE_SYMBOLS.NOT_EQUAL} b`,
    UNICODE_SYMBOLS.COPYRIGHT,
    `5${UNICODE_SYMBOLS.PRIME}10${UNICODE_SYMBOLS.DOUBLE_PRIME}`,
    `20 ${UNICODE_SYMBOLS.DEGREE}C`,
    UNICODE_SYMBOLS.FRACTION_1_2,
    `1${UNICODE_SYMBOLS.SUPERSCRIPT_ST}`,
  ])('is idempotent for: "%s"', (input) => {
    expect(ellipsis(input)).toBe(input)
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
    const expected = `Product${UNICODE_SYMBOLS.TRADEMARK} v2.0 - Size: 10${UNICODE_SYMBOLS.MULTIPLICATION}20 cm, tolerance ${UNICODE_SYMBOLS.PLUS_MINUS} 5%`
    expect(symbolTransform(input)).toEqual(expected)
  })

  it("respects separator option", () => {
    const sep = "\uE000"
    const input = `5${sep}x${sep}5`
    expect(symbolTransform(input, { separator: sep })).toEqual(`5${sep}${UNICODE_SYMBOLS.MULTIPLICATION}${sep}5`)
  })

  it("includes arrows by default", () => {
    expect(symbolTransform("A -> B")).toBe(`A ${UNICODE_SYMBOLS.ARROW_RIGHT} B`)
  })

  it("can disable arrows with includeArrows: false", () => {
    expect(symbolTransform("A -> B", { includeArrows: false })).toBe("A -> B")
  })
})

describe("multiplication ReDoS regression", () => {
  it("handles 50k digits without quadratic slowdown", () => {
    const start = performance.now()
    multiplication("1".repeat(50_000))
    // Before fix: ~4400ms (O(n²)). After fix: <50ms (O(n)).
    expect(performance.now() - start).toBeLessThan(500)
  })
})

describe("multiplication edge cases", () => {
  it.each([
    ["1000000x2000000", `1000000${UNICODE_SYMBOLS.MULTIPLICATION}2000000`],
    ["01x02", `01${UNICODE_SYMBOLS.MULTIPLICATION}02`],
    ["2x", `2${UNICODE_SYMBOLS.MULTIPLICATION}`],
  ])('handles multiplication edge: "%s"', (input, expected) => {
    expect(multiplication(input)).toBe(expected)
  })
})

describe("multiplication - preserve words containing x", () => {
  it.each([
    ["extra", "extra"],
    ["index", "index"],
    ["2xtra", "2xtra"],
    ["hex", "hex"],
    ["next", "next"],
    ["text", "text"],
    ["approximately", "approximately"],
  ])('does NOT transform word: "%s"', (input, expected) => {
    expect(multiplication(input)).toBe(expected)
  })
})

describe("ellipsis edge cases", () => {
  it.each([
    ["One... Two... Three...", `One${UNICODE_SYMBOLS.ELLIPSIS} Two${UNICODE_SYMBOLS.ELLIPSIS} Three${UNICODE_SYMBOLS.ELLIPSIS}`],
    ["...5 items", `${UNICODE_SYMBOLS.ELLIPSIS} 5 items`],
    ["End of sentence....", `End of sentence${UNICODE_SYMBOLS.ELLIPSIS}.`],
    ['"Wait..."', `"Wait${UNICODE_SYMBOLS.ELLIPSIS}"`],
  ])('handles ellipsis edge: "%s"', (input, expected) => {
    expect(ellipsis(input)).toBe(expected)
  })
})

describe("ellipsis - preserve abbreviations", () => {
  it.each([
    ["e.g.", "e.g."],
    ["i.e.", "i.e."],
    ["a.m.", "a.m."],
    ["p.m.", "p.m."],
    ["Dr.", "Dr."],
    ["Mr.", "Mr."],
    ["etc.", "etc."],
  ])('preserves abbreviation: "%s"', (input, expected) => {
    expect(ellipsis(input)).toBe(expected)
  })
})

describe("prime marks edge cases", () => {
  it.each([
    ['100\'50"', `100${UNICODE_SYMBOLS.PRIME}50${UNICODE_SYMBOLS.DOUBLE_PRIME}`],
    ["5' boards", `5${UNICODE_SYMBOLS.PRIME} boards`],
    ['12" pipe', `12${UNICODE_SYMBOLS.DOUBLE_PRIME} pipe`],
    ["5', 10'", `5${UNICODE_SYMBOLS.PRIME}, 10${UNICODE_SYMBOLS.PRIME}`],
  ])('handles prime mark edge: "%s"', (input, expected) => {
    expect(primeMarks(input)).toBe(expected)
  })
})

describe("degrees edge temperatures", () => {
  it.each([
    ["-40 C", `-40 ${UNICODE_SYMBOLS.DEGREE}C`],
    ["-40 F", `-40 ${UNICODE_SYMBOLS.DEGREE}F`],
    ["0 C", `0 ${UNICODE_SYMBOLS.DEGREE}C`],
    ["0 F", `0 ${UNICODE_SYMBOLS.DEGREE}F`],
    ["1000 C", `1000 ${UNICODE_SYMBOLS.DEGREE}C`],
    ["1000 F", `1000 ${UNICODE_SYMBOLS.DEGREE}F`],
  ])('handles temperature edge: "%s"', (input, expected) => {
    expect(degrees(input)).toBe(expected)
  })
})

describe("arrow edge cases", () => {
  it.each([
    ["A -> B -> C", `A ${UNICODE_SYMBOLS.ARROW_RIGHT} B ${UNICODE_SYMBOLS.ARROW_RIGHT} C`],
    ["A <- B <- C", `A ${UNICODE_SYMBOLS.ARROW_LEFT} B ${UNICODE_SYMBOLS.ARROW_LEFT} C`],
    ["A ---> B", `A ${UNICODE_SYMBOLS.ARROW_RIGHT} B`],
    ["A <--- B", `A ${UNICODE_SYMBOLS.ARROW_LEFT} B`],
    ["-> output", `${UNICODE_SYMBOLS.ARROW_RIGHT} output`],
    ["input ->", `input ${UNICODE_SYMBOLS.ARROW_RIGHT}`],
  ])('handles arrow edge: "%s"', (input, expected) => {
    expect(arrows(input)).toBe(expected)
  })
})

describe("fractions edge cases", () => {
  it.each([
    ["1/2 and 1/4", `${UNICODE_SYMBOLS.FRACTION_1_2} and ${UNICODE_SYMBOLS.FRACTION_1_4}`],
    ["Add 1/2.", `Add ${UNICODE_SYMBOLS.FRACTION_1_2}.`],
    ["(1/2)", `(${UNICODE_SYMBOLS.FRACTION_1_2})`],
    ["5/7", "5/7"],
    ["11/12", "11/12"],
  ])('handles fraction edge: "%s"', (input, expected) => {
    expect(fractions(input)).toBe(expected)
  })
})

describe("chained multiplications", () => {
  const M = UNICODE_SYMBOLS.MULTIPLICATION
  it.each([
    ["5x5x5", `5${M}5${M}5`, "tight x"],
    ["5 x 5 x 5", `5 ${M} 5 ${M} 5`, "spaced x"],
    ["5*5*5", `5${M}5${M}5`, "tight *"],
    ["5 * 5 * 5", `5 ${M} 5 ${M} 5`, "spaced *"],
    ["10x10x10", `10${M}10${M}10`, "multi-digit"],
  ])("converts %s → %s (%s)", (input, expected) => {
    expect(multiplication(input)).toBe(expected)
  })
})

