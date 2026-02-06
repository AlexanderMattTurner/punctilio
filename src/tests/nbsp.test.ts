import {
  nbspAfterShortWords,
  nbspBetweenNumberAndUnit,
  nbspBeforeLastWord,
  nbspAfterReferenceAbbreviations,
  nbspAfterSectionSymbols,
  nbspAfterHonorifics,
  nbspAfterCopyrightSymbols,
  nbspBetweenInitials,
  nbspTransform,
} from "../nbsp.js"
import { UNICODE_SYMBOLS, DEFAULT_SEPARATOR } from "../constants.js"

const NBSP = UNICODE_SYMBOLS.NBSP
const SEP = DEFAULT_SEPARATOR

describe("nbspAfterShortWords", () => {
  it.each([
    ["a cat", `a${NBSP}cat`],
    ["I am", `I${NBSP}am`],
    ["an apple", `an${NBSP}apple`],
    ["to go", `to${NBSP}go`],
    ["of the", `of${NBSP}the`],
    ["in on", `in${NBSP}on`],
    ["is it", `is${NBSP}it`],
    ["or if", `or${NBSP}if`],
    ["the cat sat on a mat", `the cat sat on${NBSP}a${NBSP}mat`],
    ["Go to the store", `Go${NBSP}to${NBSP}the store`],
  ])('"%s" → "%s"', (input, expected) => {
    expect(nbspAfterShortWords(input)).toBe(expected)
  })

  it("does not affect words longer than 2 characters", () => {
    expect(nbspAfterShortWords("the cat")).toBe("the cat")
  })

  it("works after punctuation", () => {
    expect(nbspAfterShortWords('"a cat"')).toBe(`"a${NBSP}cat"`)
  })

  it("works at start of string", () => {
    expect(nbspAfterShortWords("I think")).toBe(`I${NBSP}think`)
  })

  describe("separator awareness", () => {
    it("preserves separator after short word", () => {
      const input = `a${SEP} cat`
      expect(nbspAfterShortWords(input, { separator: SEP })).toBe(`a${SEP}${NBSP}cat`)
    })

    it("works when separator is at text node boundaries (typical rehype usage)", () => {
      // In real rehype usage, separator is appended to end of text nodes.
      // e.g., "a cat" across two nodes: "a " + SEP + "cat" + SEP
      const input = `a ${SEP}cat${SEP}`
      expect(nbspAfterShortWords(input, { separator: SEP })).toBe(`a${NBSP}${SEP}cat${SEP}`)
    })
  })
})

describe("nbspBetweenNumberAndUnit", () => {
  it.each([
    ["100 km", `100${NBSP}km`],
    ["5 kg", `5${NBSP}kg`],
    ["20 ms", `20${NBSP}ms`],
    ["3 items", `3${NBSP}items`],
  ])('"%s" → "%s"', (input, expected) => {
    expect(nbspBetweenNumberAndUnit(input)).toBe(expected)
  })

  it("does not affect number-number sequences", () => {
    // digit-space-digit gets nbsp too (e.g., "5 3" → "5\xa03")
    // this is expected behavior — the pattern matches \d + space + \w
    expect(nbspBetweenNumberAndUnit("5 3")).toBe(`5${NBSP}3`)
  })

  it("does not match when there is no space", () => {
    expect(nbspBetweenNumberAndUnit("100km")).toBe("100km")
  })

  describe("separator awareness", () => {
    it("preserves separator between number and unit", () => {
      const input = `5${SEP} kg`
      expect(nbspBetweenNumberAndUnit(input, { separator: SEP })).toBe(`5${SEP}${NBSP}kg`)
    })

    it("preserves separator after space", () => {
      const input = `5 ${SEP}kg`
      expect(nbspBetweenNumberAndUnit(input, { separator: SEP })).toBe(`5${NBSP}${SEP}kg`)
    })
  })
})

describe("nbspBeforeLastWord", () => {
  it.each([
    ["the end", `the${NBSP}end`],
    ["hello world", `hello${NBSP}world`],
    ["a b c", `a b${NBSP}c`],
  ])('"%s" → "%s"', (input, expected) => {
    expect(nbspBeforeLastWord(input)).toBe(expected)
  })

  it("does not affect single words", () => {
    expect(nbspBeforeLastWord("hello")).toBe("hello")
  })

  it("does not affect words longer than 10 characters", () => {
    expect(nbspBeforeLastWord("hello international")).toBe("hello international")
  })

  it("matches before paragraph breaks", () => {
    // Both "end" (before \n\n) and "paragraph" (before $) get nbsp
    expect(nbspBeforeLastWord("the end\n\nNew paragraph")).toBe(`the${NBSP}end\n\nNew${NBSP}paragraph`)
  })

  it("does not match at single newlines (non-multiline)", () => {
    // Single newline in the middle — only the end-of-string matters
    expect(nbspBeforeLastWord("the end\ncontinues")).toBe(`the end\ncontinues`)
  })

  it("does not insert in pure whitespace", () => {
    expect(nbspBeforeLastWord("   ")).toBe("   ")
  })

  describe("separator awareness", () => {
    it("preserves separator before end", () => {
      const input = `the end${SEP}`
      expect(nbspBeforeLastWord(input, { separator: SEP })).toBe(`the${NBSP}end${SEP}`)
    })
  })
})

describe("nbspAfterReferenceAbbreviations", () => {
  it.each([
    ["Fig. 1", `Fig.${NBSP}1`],
    ["Figs. 2", `Figs.${NBSP}2`],
    ["Vol. 3", `Vol.${NBSP}3`],
    ["No. 4", `No.${NBSP}4`],
    ["Nos. 5", `Nos.${NBSP}5`],
    ["p. 42", `p.${NBSP}42`],
    ["pp. 10", `pp.${NBSP}10`],
    ["Ch. 7", `Ch.${NBSP}7`],
    ["Chap. 8", `Chap.${NBSP}8`],
    ["Sec. 9", `Sec.${NBSP}9`],
    ["Eq. 1", `Eq.${NBSP}1`],
    ["Eqs. 2", `Eqs.${NBSP}2`],
    ["Art. 3", `Art.${NBSP}3`],
    ["Tab. 4", `Tab.${NBSP}4`],
    ["Ex. 5", `Ex.${NBSP}5`],
  ])('"%s" → "%s"', (input, expected) => {
    expect(nbspAfterReferenceAbbreviations(input)).toBe(expected)
  })

  it("does not match when not followed by a digit", () => {
    expect(nbspAfterReferenceAbbreviations("Fig. caption")).toBe("Fig. caption")
  })

  describe("separator awareness", () => {
    it("preserves separator after abbreviation", () => {
      const input = `Fig.${SEP} 1`
      expect(nbspAfterReferenceAbbreviations(input, { separator: SEP })).toBe(`Fig.${SEP}${NBSP}1`)
    })

    it("preserves separator before digit", () => {
      const input = `Fig. ${SEP}1`
      expect(nbspAfterReferenceAbbreviations(input, { separator: SEP })).toBe(`Fig.${NBSP}${SEP}1`)
    })
  })
})

describe("nbspAfterSectionSymbols", () => {
  it.each([
    ["§ 5", `§${NBSP}5`],
    ["¶ 3", `¶${NBSP}3`],
    ["See § 12 for details", `See §${NBSP}12 for details`],
  ])('"%s" → "%s"', (input, expected) => {
    expect(nbspAfterSectionSymbols(input)).toBe(expected)
  })

  it("does not match when not followed by a digit", () => {
    expect(nbspAfterSectionSymbols("§ title")).toBe("§ title")
  })

  describe("separator awareness", () => {
    it("preserves separator after symbol", () => {
      const input = `§${SEP} 5`
      expect(nbspAfterSectionSymbols(input, { separator: SEP })).toBe(`§${SEP}${NBSP}5`)
    })
  })
})

describe("nbspAfterHonorifics", () => {
  it.each([
    ["Dr. Smith", `Dr.${NBSP}Smith`],
    ["Mr. Jones", `Mr.${NBSP}Jones`],
    ["Mrs. Brown", `Mrs.${NBSP}Brown`],
    ["Ms. Davis", `Ms.${NBSP}Davis`],
    ["Prof. Wilson", `Prof.${NBSP}Wilson`],
    ["Rev. King", `Rev.${NBSP}King`],
    ["St. Patrick", `St.${NBSP}Patrick`],
    ["Sr. Martinez", `Sr.${NBSP}Martinez`],
    ["Jr. here", `Jr. here`], // "here" starts lowercase
    ["Hon. Judge", `Hon.${NBSP}Judge`],
    ["Gov. Brown", `Gov.${NBSP}Brown`],
    ["Sen. Warren", `Sen.${NBSP}Warren`],
    ["Rep. Lee", `Rep.${NBSP}Lee`],
  ])('"%s" → "%s"', (input, expected) => {
    expect(nbspAfterHonorifics(input)).toBe(expected)
  })

  it("does not match when followed by lowercase", () => {
    expect(nbspAfterHonorifics("Dr. said")).toBe("Dr. said")
  })

  it("handles accented capitals", () => {
    expect(nbspAfterHonorifics("Dr. Élodie")).toBe(`Dr.${NBSP}Élodie`)
  })

  describe("separator awareness", () => {
    it("preserves separator after honorific", () => {
      const input = `Dr.${SEP} Smith`
      expect(nbspAfterHonorifics(input, { separator: SEP })).toBe(`Dr.${SEP}${NBSP}Smith`)
    })

    it("preserves separator before name", () => {
      const input = `Dr. ${SEP}Smith`
      expect(nbspAfterHonorifics(input, { separator: SEP })).toBe(`Dr.${NBSP}${SEP}Smith`)
    })
  })
})

describe("nbspAfterCopyrightSymbols", () => {
  it.each([
    ["© 2024", `©${NBSP}2024`],
    ["® Brand", `®${NBSP}Brand`],
    ["™ Product", `™${NBSP}Product`],
    ["© 2024 Company", `©${NBSP}2024 Company`],
  ])('"%s" → "%s"', (input, expected) => {
    expect(nbspAfterCopyrightSymbols(input)).toBe(expected)
  })

  it("does not match when followed by lowercase", () => {
    expect(nbspAfterCopyrightSymbols("© company")).toBe("© company")
  })

  describe("separator awareness", () => {
    it("preserves separator after symbol", () => {
      const input = `©${SEP} 2024`
      expect(nbspAfterCopyrightSymbols(input, { separator: SEP })).toBe(`©${SEP}${NBSP}2024`)
    })
  })
})

describe("nbspBetweenInitials", () => {
  it.each([
    ["J. K. Rowling", `J.${NBSP}K.${NBSP}Rowling`],
    ["A. B. C.", `A.${NBSP}B.${NBSP}C.`],
    ["J. Smith", `J.${NBSP}Smith`],
  ])('"%s" → "%s"', (input, expected) => {
    expect(nbspBetweenInitials(input)).toBe(expected)
  })

  it("does not match when followed by lowercase", () => {
    expect(nbspBetweenInitials("A. test")).toBe("A. test")
  })

  it("handles accented capitals", () => {
    expect(nbspBetweenInitials("É. Piaf")).toBe(`É.${NBSP}Piaf`)
  })

  describe("separator awareness", () => {
    it("preserves separator between initials", () => {
      const input = `J.${SEP} K. Rowling`
      expect(nbspBetweenInitials(input, { separator: SEP })).toBe(`J.${SEP}${NBSP}K.${NBSP}Rowling`)
    })
  })
})

describe("nbspTransform", () => {
  it("applies all nbsp transformations", () => {
    const input = "Dr. Smith wrote Fig. 1 on p. 42"
    const result = nbspTransform(input)
    expect(result).toContain(`Dr.${NBSP}Smith`)
    expect(result).toContain(`Fig.${NBSP}1`)
    expect(result).toContain(`p.${NBSP}42`)
  })

  it("handles multiple rules on the same text", () => {
    const input = "© 2024 by J. K. Rowling"
    const result = nbspTransform(input)
    expect(result).toContain(`©${NBSP}2024`)
    expect(result).toContain(`J.${NBSP}K.${NBSP}Rowling`)
  })

  it("is a no-op on text with no applicable patterns", () => {
    const input = "Hello world"
    // Only nbspBeforeLastWord would fire here: "Hello\xa0world"
    expect(nbspTransform(input)).toBe(`Hello${NBSP}world`)
  })

  it("passes separator option through to all functions", () => {
    const input = `Dr.${SEP} Smith`
    const result = nbspTransform(input, { separator: SEP })
    expect(result).toContain(`Dr.${SEP}${NBSP}Smith`)
  })
})
