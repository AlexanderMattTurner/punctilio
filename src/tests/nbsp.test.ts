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
  UNITS,
  HONORIFICS,
  REFERENCE_ABBREVIATIONS,
  type NbspOptions,
} from "../nbsp.js"
import { UNICODE_SYMBOLS, DEFAULT_SEPARATOR } from "../constants.js"

const { NBSP, COPYRIGHT, REGISTERED, TRADEMARK } = UNICODE_SYMBOLS
const SEP = DEFAULT_SEPARATOR

/** Calls fn with separator option, checking all cases produce correct nbsp. */
function expectSep(
  fn: (text: string, options?: NbspOptions) => string,
  cases: [string, string][],
) {
  for (const [input, expected] of cases) {
    expect(fn(input, { separator: SEP })).toBe(expected)
  }
}

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
    ["I think", `I${NBSP}think`],
    ['"a cat"', `"a${NBSP}cat"`],
    // Cascade prevention: only the first short word in a run gets glued, so
    // the result never binds three or more words into a non-breaking atom.
    ["the cat sat on a mat", `the cat sat on${NBSP}a mat`],
    ["Go to the store", `Go${NBSP}to the store`],
    ["is a Monte Carlo", `is${NBSP}a Monte Carlo`],
    ["I am here", `I${NBSP}am here`],
    // Pre-existing NBSP from an earlier transform: don't extend the chain.
    [`Dr.${NBSP}is here`, `Dr.${NBSP}is here`],
    [`5${NBSP}kg of items`, `5${NBSP}kg of${NBSP}items`],
    ["the cat", "the cat"],
    // Accented Latin short words
    ["à chat", `à${NBSP}chat`],
    ["où aller", `où${NBSP}aller`],
    ["ça va", `ça${NBSP}va`],
  ])('"%s" → "%s"', (input, expected) => {
    expect(nbspAfterShortWords(input)).toBe(expected)
  })

  it("preserves separators at node boundaries", () => {
    expectSep(nbspAfterShortWords, [
      [`a${SEP} cat`, `a${SEP}${NBSP}cat`],
      [`a ${SEP}cat${SEP}`, `a${NBSP}${SEP}cat${SEP}`],
    ])
  })
})

describe("nbspBetweenNumberAndUnit", () => {
  it.each(UNITS.map((u) => [`5 ${u}`, `5${NBSP}${u}`]))(
    '"%s" → "%s"',
    (input, expected) => {
      expect(nbspBetweenNumberAndUnit(input)).toBe(expected)
    },
  )

  it.each([
    ["100km", "100km"],
    ["5 kms", "5 kms"],
    ["chapter 3 above", "chapter 3 above"],
    ["item 5 here", "item 5 here"],
    ["5 3", "5 3"],
    ["page 42 of", "page 42 of"],
    // Excluded units: too ambiguous with common English words
    ["found 5 in total", "found 5 in total"],
    ["5 in total", "5 in total"],
    ["at 5 bar pressure", "at 5 bar pressure"],
    ["drew 5 bar charts", "drew 5 bar charts"],
  ])('no match: "%s"', (input, expected) => {
    expect(nbspBetweenNumberAndUnit(input)).toBe(expected)
  })

  it("preserves separators at node boundaries", () => {
    expectSep(nbspBetweenNumberAndUnit, [
      [`5${SEP} kg`, `5${SEP}${NBSP}kg`],
      [`5 ${SEP}kg`, `5${NBSP}${SEP}kg`],
      [`5${SEP} ${SEP}kg`, `5${SEP}${NBSP}${SEP}kg`],
    ])
  })

  it("does not match unit letter that starts a cross-element word", () => {
    // "5 m" + SEP + "ade" simulates <span>5 m</span><span>ade</span> ("made")
    expect(nbspBetweenNumberAndUnit(`5 m${SEP}ade`, { separator: SEP }))
      .toBe(`5 m${SEP}ade`)
  })
})

describe("nbspBeforeLastWord", () => {
  it.each([
    ["the end", `the${NBSP}end`],
    ["hello world", `hello${NBSP}world`],
    ["a b c", `a b${NBSP}c`],
    ["hello abcdefghij", `hello${NBSP}abcdefghij`],
    ["hello abcdefghijk", "hello abcdefghijk"],
    ["hello international", "hello international"],
    ["hello", "hello"],
    ["   ", "   "],
    ["the end\n\nNew paragraph", `the${NBSP}end\n\nNew${NBSP}paragraph`],
    ["the end\ncontinues", `the end\ncontinues`],
  ])('"%s" → "%s"', (input, expected) => {
    expect(nbspBeforeLastWord(input)).toBe(expected)
  })

  it("preserves separator before end", () => {
    expectSep(nbspBeforeLastWord, [
      [`the end${SEP}`, `the${NBSP}end${SEP}`],
    ])
  })
})

describe("nbspAfterReferenceAbbreviations", () => {
  it.each([
    ...REFERENCE_ABBREVIATIONS.map((abbr, i) => [`${abbr}. ${i + 1}`, `${abbr}.${NBSP}${i + 1}`]),
    ["Fig. caption", "Fig. caption"],
  ] as [string, string][])('"%s" → "%s"', (input, expected) => {
    expect(nbspAfterReferenceAbbreviations(input)).toBe(expected)
  })

  it("preserves separators at node boundaries", () => {
    expectSep(nbspAfterReferenceAbbreviations, [
      [`Fig.${SEP} 1`, `Fig.${SEP}${NBSP}1`],
      [`Fig. ${SEP}1`, `Fig.${NBSP}${SEP}1`],
    ])
  })
})

describe("nbspAfterSectionSymbols", () => {
  it.each([
    ["§ 5", `§${NBSP}5`],
    ["¶ 3", `¶${NBSP}3`],
    ["See § 12 for details", `See §${NBSP}12 for details`],
    ["§ title", "§ title"],
  ])('"%s" → "%s"', (input, expected) => {
    expect(nbspAfterSectionSymbols(input)).toBe(expected)
  })

  it("preserves separator after symbol", () => {
    expectSep(nbspAfterSectionSymbols, [
      [`§${SEP} 5`, `§${SEP}${NBSP}5`],
    ])
  })
})

describe("nbspAfterHonorifics", () => {
  const names = [
    // English
    "Smith", "Jones", "Brown", "Davis", "Wilson", "King", "Patrick", "Martinez", "Judge", "Brown", "Warren", "Lee", "Lee",
    // French
    "Dupont", "Laurent", "Lefebvre",
    // German / Nordic
    "Schmidt", "Weber",
    // Spanish / Portuguese
    "García", "Rodríguez",
    // Italian
    "Rossi", "Bianchi",
    // Dutch
    "Bakker", "Jansen",
  ]
  it.each([
    ...HONORIFICS.map((h, i) => [`${h}. ${names[i]}`, `${h}.${NBSP}${names[i]}`]),
    ["Dr. Élodie", `Dr.${NBSP}Élodie`],
    ["Jr. here", "Jr. here"],
    ["Dr. said", "Dr. said"],
  ] as [string, string][])('"%s" → "%s"', (input, expected) => {
    expect(nbspAfterHonorifics(input)).toBe(expected)
  })

  it("preserves separators at node boundaries", () => {
    expectSep(nbspAfterHonorifics, [
      [`Dr.${SEP} Smith`, `Dr.${SEP}${NBSP}Smith`],
      [`Dr. ${SEP}Smith`, `Dr.${NBSP}${SEP}Smith`],
    ])
  })
})

describe("nbspAfterCopyrightSymbols", () => {
  it.each([
    [`${COPYRIGHT} 2024`, `${COPYRIGHT}${NBSP}2024`],
    [`${REGISTERED} Brand`, `${REGISTERED}${NBSP}Brand`],
    [`${TRADEMARK} Product`, `${TRADEMARK}${NBSP}Product`],
    [`${COPYRIGHT} 2024 Company`, `${COPYRIGHT}${NBSP}2024 Company`],
    [`${COPYRIGHT} company`, `${COPYRIGHT} company`],
  ])('"%s" → "%s"', (input, expected) => {
    expect(nbspAfterCopyrightSymbols(input)).toBe(expected)
  })

  it("preserves separator after symbol", () => {
    expectSep(nbspAfterCopyrightSymbols, [
      [`${COPYRIGHT}${SEP} 2024`, `${COPYRIGHT}${SEP}${NBSP}2024`],
    ])
  })
})

describe("nbspBetweenInitials", () => {
  it.each([
    ["J. K. Rowling", `J.${NBSP}K.${NBSP}Rowling`],
    ["A. B. C.", `A.${NBSP}B.${NBSP}C.`],
    ["J. Smith", `J.${NBSP}Smith`],
    ["É. Piaf", `É.${NBSP}Piaf`],
    ["A. test", "A. test"],
  ])('"%s" → "%s"', (input, expected) => {
    expect(nbspBetweenInitials(input)).toBe(expected)
  })

  it("preserves separator between initials", () => {
    expectSep(nbspBetweenInitials, [
      [`J.${SEP} K. Rowling`, `J.${SEP}${NBSP}K.${NBSP}Rowling`],
    ])
  })
})

describe("nbspTransform", () => {
  it("applies all nbsp transformations", () => {
    expect(nbspTransform("Dr. Smith wrote Fig. 1 on p. 42"))
      .toBe(`Dr.${NBSP}Smith wrote Fig.${NBSP}1 on${NBSP}p.${NBSP}42`)
  })

  it("handles multiple rules on the same text", () => {
    expect(nbspTransform(`${COPYRIGHT} 2024 by J. K. Rowling`))
      .toBe(`${COPYRIGHT}${NBSP}2024 by${NBSP}J.${NBSP}K.${NBSP}Rowling`)
  })

  it("nbspBeforeLastWord fires on plain text", () => {
    expect(nbspTransform("Hello world")).toBe(`Hello${NBSP}world`)
  })

  it("passes separator through to all functions", () => {
    expect(nbspTransform(`Dr.${SEP} Smith`, { separator: SEP }))
      .toBe(`Dr.${SEP}${NBSP}Smith`)
  })

  describe("ordering: specific patterns before generic", () => {
    it("abbreviation claims nbsp before short-word rule", () => {
      const result = nbspTransform("No. 5")
      expect(result).toBe(`No.${NBSP}5`)
      expect(result.split(NBSP).length - 1).toBe(1)
    })

    it("honorific + initials compose correctly", () => {
      expect(nbspTransform("Dr. J. K. Smith")).toBe(`Dr.${NBSP}J.${NBSP}K.${NBSP}Smith`)
    })

    it("honorific + unit don't double-apply with short words", () => {
      expect(nbspTransform("St. Anne had 5 kg")).toBe(`St.${NBSP}Anne had 5${NBSP}kg`)
    })
  })

  describe("widow-protection cascade", () => {
    it.each([
      // Existing NBSP chain wins: widow protection skipped so the phrase
      // doesn't become a 3-word non-breaking atom.
      ["an Activation Vector", `an${NBSP}Activation Vector`],
      ["in the cat", `in${NBSP}the cat`],
      ["On the run", `On${NBSP}the run`],
      ["by Adding an Activation Vector", `by${NBSP}Adding an${NBSP}Activation Vector`],
      ["Prof. Wilson arrived", `Prof.${NBSP}Wilson arrived`],
      ["Dr. Smith waited", `Dr.${NBSP}Smith waited`],
    ])('"%s" → "%s"', (input, expected) => {
      expect(nbspTransform(input)).toBe(expected)
    })
  })
})
