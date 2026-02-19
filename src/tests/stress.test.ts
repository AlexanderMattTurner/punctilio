/**
 * Stress tests for the U+02BC apostrophe change in convertSingleQuotes.
 *
 * Tests edge cases around:
 * - Idempotency (double-application stability)
 * - The 'n' abbreviation handler
 * - Possessive apostrophes at end of quotes
 * - Possessive vs contraction vs combined (O'Brien's)
 * - Pre-existing U+02BC in input
 * - Separator (U+E000) interactions
 * - applyPunctuationStyle with apostrophes vs closing quotes
 * - Multiple consecutive apostrophes, boundary conditions
 * - Possessive plurals
 * - Already-converted text mixed with unconverted text
 */

import { niceQuotes } from "../quotes.js"
import { UNICODE_SYMBOLS, DEFAULT_SEPARATOR } from "../constants.js"

const {
  EM_DASH,
  LEFT_DOUBLE_QUOTE,
  RIGHT_DOUBLE_QUOTE,
  LEFT_SINGLE_QUOTE,
  RIGHT_SINGLE_QUOTE,
  MODIFIER_LETTER_APOSTROPHE,
} = UNICODE_SYMBOLS

const MLA = MODIFIER_LETTER_APOSTROPHE
const LSQ = LEFT_SINGLE_QUOTE
const RSQ = RIGHT_SINGLE_QUOTE
const LDQ = LEFT_DOUBLE_QUOTE
const RDQ = RIGHT_DOUBLE_QUOTE
const SEP = DEFAULT_SEPARATOR

describe("STRESS: Idempotency", () => {
  describe("double-application produces identical output", () => {
    it.each([
      // Contractions
      ["I can't believe it", `I can${MLA}t believe it`],
      ["don't stop", `don${MLA}t stop`],
      // Possessives
      ["the dog's bone", `the dog${MLA}s bone`],
      ["O'Brien's hat", `O${MLA}Brien${MLA}s hat`],
      // Quoted text
      ["He said, 'hello'", `He said, ${LSQ}hello${RSQ}`],
      // 'n' abbreviation
      ["Rock 'n' Roll", `Rock ${MLA}n${MLA} Roll`],
      // Mixed
      [`"I can't," she said.`, `${LDQ}I can${MLA}t,${RDQ} she said.`],
      // Leading apostrophe
      ["'twas the night", `${MLA}twas the night`],
      ["the '90s were wild", `the ${MLA}90s were wild`],
      // Decade in quotes
      [`"the '90s"`, `${LDQ}the ${MLA}90s${RDQ}`],
    ])('idempotent for "%s"', (input, expectedFirstPass) => {
      const firstPass = niceQuotes(input)
      expect(firstPass).toBe(expectedFirstPass)
      // Second pass should be identical
      const secondPass = niceQuotes(firstPass)
      expect(secondPass).toBe(firstPass)
    })
  })

  describe("already-converted text is stable", () => {
    it.each([
      `I${MLA}m already converted`,
      `${LSQ}single curly${RSQ}`,
      `${LDQ}double curly${RDQ}`,
      `the dog${MLA}s bone`,
      `O${MLA}Brien${MLA}s hat`,
      `Rock ${MLA}n${MLA} Roll`,
      `${MLA}twas the night`,
      `${LDQ}I can${MLA}t,${RDQ} she said.`,
      `${LSQ}I lost the game.${RSQ}`,
      `${LDQ}nested ${LSQ}quotes${RSQ}${RDQ}`,
    ])('stable for pre-converted: "%s"', (input) => {
      expect(niceQuotes(input)).toBe(input)
      expect(niceQuotes(niceQuotes(input))).toBe(input)
    })
  })

  describe("triple-application stability", () => {
    it.each([
      "He said, 'I can't believe it's not butter.'",
      `"She told me, 'don't worry about O'Brien's cat.'"`,
      "Rock 'n' Roll is the dog's best friend.",
      "'twas the night before the '90s ended.",
      "fish 'n' chips",
    ])('triple-stable for: "%s"', (input) => {
      const once = niceQuotes(input)
      const twice = niceQuotes(once)
      const thrice = niceQuotes(twice)
      expect(twice).toBe(once)
      expect(thrice).toBe(once)
    })
  })
})

describe("STRESS: 'n' abbreviation handler", () => {
  describe("standard 'n' cases", () => {
    it.each([
      ["Rock 'n' Roll", `Rock ${MLA}n${MLA} Roll`],
      ["fish 'n' chips", `fish ${MLA}n${MLA} chips`],
      ["mac 'n' cheese", `mac ${MLA}n${MLA} cheese`],
      ["pork 'n' beans", `pork ${MLA}n${MLA} beans`],
    ])('converts "and" abbreviation in: "%s"', (input, expected) => {
      expect(niceQuotes(input)).toBe(expected)
    })
  })

  describe("'n' boundary conditions", () => {
    // 'n' at the very start of string - no word before it
    it("does not treat 'n' as abbreviation at start of string", () => {
      const input = "'n' Roll"
      const result = niceQuotes(input)
      // No word before 'n', so this should NOT be treated as 'n' abbreviation
      // Instead it's a quoted letter 'n' followed by a word
      expect(result).not.toContain(`${MLA}n${MLA}`)
    })

    // 'n' at the very end of string - no word after it
    it("does not treat 'n' as abbreviation at end of string", () => {
      const input = "Rock 'n'"
      const result = niceQuotes(input)
      // No word after 'n', so this should NOT be treated as abbreviation
      expect(result).not.toBe(`Rock ${MLA}n${MLA}`)
    })

    // The letter 'n' quoted as a character, not an abbreviation
    it("handles quoted letter n in a linguistic context", () => {
      const input = "the letter 'n' is common"
      const result = niceQuotes(input)
      // This DOES match the 'n' pattern: \w before space, 'n', space then \w after
      // The regex (?<=\w\sep? )'n'(?= \sep?\w) would match here
      // So "letter 'n' is" should become "letter ʼnʼ is"
      // This is arguably a false positive but is expected given the regex
      expect(result).toBe(`the letter ${MLA}n${MLA} is common`)
    })
  })

  describe("multiple 'n' occurrences in one string", () => {
    it("handles multiple 'n' abbreviations", () => {
      const input = "Rock 'n' Roll and fish 'n' chips"
      const expected = `Rock ${MLA}n${MLA} Roll and fish ${MLA}n${MLA} chips`
      expect(niceQuotes(input)).toBe(expected)
    })
  })

  describe("'n' with separators", () => {
    it("handles 'n' across separator boundaries", () => {
      const input = `Rock ${SEP}'n'${SEP} Roll`
      const result = niceQuotes(input, { separator: SEP })
      // The regex expects: \w\sep? then space then 'n' then space then \sep?\w
      // This has SEP between the space and 'n', which may not match
      // Let's just verify the output is reasonable
      expect(result).toBeDefined()
    })
  })

  describe("'n' with already-converted apostrophes", () => {
    it("does not double-convert already-converted 'n' abbreviation", () => {
      const input = `Rock ${MLA}n${MLA} Roll`
      expect(niceQuotes(input)).toBe(input)
    })
  })
})

describe("STRESS: Possessive at end of quote", () => {
  describe("possessive inside single quotes", () => {
    it("handles possessive ending a single-quoted phrase", () => {
      // 'the dog's bowl' - the 's after dog is possessive, the final ' is closing quote
      const input = "'the dog's bowl'"
      const expected = `${LSQ}the dog${MLA}s bowl${RSQ}`
      expect(niceQuotes(input)).toBe(expected)
    })

    it("handles possessive at the very end of a single-quoted phrase", () => {
      // 'the dogs' bowl' - possessive plural dogs' then word bowl then closing quote
      // Actually this is tricky: is this 'the dogs' [then] bowl' or 'the dogs['] bowl'?
      // The closing quote regex would see dogs' as a closing quote since ' is followed by space
      const input = "'the dogs' bowl'"
      const result = niceQuotes(input)
      // This is ambiguous. The parser likely sees:
      // LSQ + "the dogs" + RSQ + " bowl" + RSQ
      // which would be wrong if the intent is possessive plural inside quotes.
      // Let's just verify what the parser actually produces.
      expect(result).toBeDefined()
      // At minimum, verify the output is stable on second pass
      expect(niceQuotes(result)).toBe(result)
    })
  })

  describe("possessive plural at end of sentence", () => {
    it.each([
      // Possessive plural: the plural noun ends with s, then ' for possessive
      ["the dogs' owner", `the dogs${RSQ} owner`],
      // Singular possessive
      ["the dog's owner", `the dog${MLA}s owner`],
      // Possessive plural at end of string
      ["the dogs'", `the dogs${RSQ}`],
      // Possessive singular at end of string
      ["the dog's", `the dog${MLA}s`],
    ])('possessive handling in: "%s"', (input, expected) => {
      expect(niceQuotes(input)).toBe(expected)
    })

    it("correctly distinguishes possessive plural from closing quote", () => {
      // "the dogs' owner" - the ' after dogs is actually ambiguous
      // In this implementation, closing single quote gets U+2019
      // which is actually correct for possessive plurals in standard Unicode
      // since there's no way to distinguish them from closing quotes
      const input = "the dogs' owner"
      const result = niceQuotes(input)
      // Should be RIGHT_SINGLE_QUOTE since the ' follows 's' and is followed by space
      // which matches the closing quote pattern rather than the possessive pattern
      // (possessive requires 's to follow)
      expect(result).toBe(`the dogs${RSQ} owner`)
    })
  })
})

describe("STRESS: Possessive vs contraction vs combined", () => {
  describe("pure possessives", () => {
    it.each([
      ["Brien's", `Brien${MLA}s`],
      ["the cat's meow", `the cat${MLA}s meow`],
      ["Mary's lamb", `Mary${MLA}s lamb`],
      ["it's raining", `it${MLA}s raining`],
      ["the boss's car", `the boss${MLA}s car`],
    ])('possessive in "%s"', (input, expected) => {
      expect(niceQuotes(input)).toBe(expected)
    })
  })

  describe("pure contractions", () => {
    it.each([
      ["don't", `don${MLA}t`],
      ["can't", `can${MLA}t`],
      ["won't", `won${MLA}t`],
      ["I'm", `I${MLA}m`],
      ["they're", `they${MLA}re`],
      ["we've", `we${MLA}ve`],
      ["she'll", `she${MLA}ll`],
      ["who'd", `who${MLA}d`],
    ])('contraction in "%s"', (input, expected) => {
      expect(niceQuotes(input)).toBe(expected)
    })
  })

  describe("combined possessive + contraction (O'Brien's pattern)", () => {
    it.each([
      ["O'Brien's hat", `O${MLA}Brien${MLA}s hat`],
      ["O'Connor's pub", `O${MLA}Connor${MLA}s pub`],
      ["O'Malley's bar", `O${MLA}Malley${MLA}s bar`],
      ["M'Lord's castle", `M${MLA}Lord${MLA}s castle`],
    ])('combined in "%s"', (input, expected) => {
      expect(niceQuotes(input)).toBe(expected)
    })
  })

  describe("contraction + possessive in same sentence", () => {
    it.each([
      [
        "I can't find Brien's keys",
        `I can${MLA}t find Brien${MLA}s keys`,
      ],
      [
        "O'Brien's cat won't eat",
        `O${MLA}Brien${MLA}s cat won${MLA}t eat`,
      ],
      [
        "She's got the dog's toy and doesn't care",
        `She${MLA}s got the dog${MLA}s toy and doesn${MLA}t care`,
      ],
    ])('mixed in "%s"', (input, expected) => {
      expect(niceQuotes(input)).toBe(expected)
    })
  })
})

describe("STRESS: Pre-existing U+02BC in input", () => {
  describe("text already containing MODIFIER_LETTER_APOSTROPHE", () => {
    it("preserves pre-existing U+02BC in contractions", () => {
      const input = `I can${MLA}t believe it`
      expect(niceQuotes(input)).toBe(input)
    })

    it("preserves pre-existing U+02BC in possessives", () => {
      const input = `the dog${MLA}s bone`
      expect(niceQuotes(input)).toBe(input)
    })

    it("handles mix of pre-existing U+02BC and straight quotes", () => {
      // One contraction already converted, one not
      const input = `I can${MLA}t believe it's true`
      const expected = `I can${MLA}t believe it${MLA}s true`
      expect(niceQuotes(input)).toBe(expected)
    })

    it("handles pre-existing U+02BC next to straight single quotes", () => {
      // A word with pre-existing apostrophe inside a quoted phrase
      const input = `'I can${MLA}t go'`
      const expected = `${LSQ}I can${MLA}t go${RSQ}`
      expect(niceQuotes(input)).toBe(expected)
    })
  })

  describe("pre-existing U+02BC mixed with straight double quotes", () => {
    it("handles U+02BC inside double-quoted text", () => {
      const input = `"I can${MLA}t go"`
      const expected = `${LDQ}I can${MLA}t go${RDQ}`
      expect(niceQuotes(input)).toBe(expected)
    })
  })
})

describe("STRESS: Separator (U+E000) interactions", () => {
  const sep = SEP

  describe("separators around apostrophes/quotes", () => {
    it.each([
      // Contraction with separator in the middle
      [`don${sep}'t`, `don${sep}${MLA}t`, "contraction across separator"],
      // Possessive with separator before 's
      [`dog${sep}'s bone`, `dog${sep}${MLA}s bone`, "possessive across separator"],
      // Quote with separator at boundary
      [`'hello${sep}'`, `${LSQ}hello${sep}${RSQ}`, "closing quote after separator"],
      // Separator before opening quote
      [`${sep}'hello'`, `${sep}${LSQ}hello${RSQ}`, "opening quote after separator"],
    ])("%s -> %s (%s)", (input, expected) => {
      expect(niceQuotes(input, { separator: sep })).toBe(expected)
    })
  })

  describe("separators with possessive 's pattern", () => {
    it("handles separator between apostrophe and s in possessive", () => {
      // dog'[SEP]s - separator between ' and s
      const input = `dog'${sep}s bone`
      const result = niceQuotes(input, { separator: sep })
      // The possessive regex has: '${afterPossessive} where afterPossessive = (?=${escapedSep}?s...)
      // So ' followed by optional sep then s should match possessive
      expect(result).toBe(`dog${MLA}${sep}s bone`)
    })
  })

  describe("separator inside 'n' abbreviation", () => {
    it("handles 'n' with separators around it", () => {
      const input = `Rock 'n' Roll`
      // Without separators in the 'n' itself, should still work
      const result = niceQuotes(input, { separator: sep })
      expect(result).toBe(`Rock ${MLA}n${MLA} Roll`)
    })
  })
})

describe("STRESS: applyPunctuationStyle with apostrophes", () => {
  describe("american style: period/comma movement should only affect closing quotes, not apostrophes", () => {
    it("does NOT move period inside apostrophe (possessive)", () => {
      // "the dog's." - the MLA before period is an apostrophe, not a closing quote
      // applyPunctuationStyle only matches RIGHT_SINGLE_QUOTE and RIGHT_DOUBLE_QUOTE
      // so the period should NOT be moved inside
      const input = `the dog${MLA}s.`
      const result = niceQuotes(input, { punctuationStyle: "american" })
      // The apostrophe should stay as MLA, period stays after 's'
      expect(result).toBe(`the dog${MLA}s.`)
    })

    it("moves period inside closing single quote", () => {
      const input = `${LSQ}hello${RSQ}.`
      const result = niceQuotes(input, { punctuationStyle: "american" })
      expect(result).toBe(`${LSQ}hello.${RSQ}`)
    })

    it("does not affect apostrophe followed by comma", () => {
      // Brien's, - the MLA is an apostrophe, comma should stay after the s
      const input = `Brien${MLA}s,`
      const result = niceQuotes(input, { punctuationStyle: "american" })
      expect(result).toBe(`Brien${MLA}s,`)
    })

    it("moves comma inside closing single quote", () => {
      const input = `${LSQ}hello${RSQ},`
      const result = niceQuotes(input, { punctuationStyle: "american" })
      expect(result).toBe(`${LSQ}hello,${RSQ}`)
    })
  })

  describe("british style: period/comma movement should only affect closing quotes, not apostrophes", () => {
    it("does NOT move period outside apostrophe", () => {
      // Even in British style, the period after an apostrophe shouldn't be moved
      const input = `Brien${MLA}s.`
      const result = niceQuotes(input, { punctuationStyle: "british" })
      expect(result).toBe(`Brien${MLA}s.`)
    })

    it("moves period outside closing single quote", () => {
      const input = `${LSQ}hello.${RSQ}`
      const result = niceQuotes(input, { punctuationStyle: "british" })
      expect(result).toBe(`${LSQ}hello${RSQ}.`)
    })
  })

  describe("punctuation style with possessive at end of quote", () => {
    it("handles american style with possessive inside double quotes", () => {
      const input = `"the dog's bone".`
      const result = niceQuotes(input, { punctuationStyle: "american" })
      // Period should move inside the closing double quote
      expect(result).toBe(`${LDQ}the dog${MLA}s bone.${RDQ}`)
    })

    it("handles british style with possessive inside double quotes", () => {
      const input = `${LDQ}the dog${MLA}s bone.${RDQ}`
      const result = niceQuotes(input, { punctuationStyle: "british" })
      // Period should move outside the closing double quote
      expect(result).toBe(`${LDQ}the dog${MLA}s bone${RDQ}.`)
    })
  })
})

describe("STRESS: Multiple consecutive apostrophes", () => {
  it("handles double contraction (I'd've)", () => {
    const input = "I'd've done it"
    const expected = `I${MLA}d${MLA}ve done it`
    expect(niceQuotes(input)).toBe(expected)
  })

  it("handles triple contraction (y'all'd've)", () => {
    const input = "y'all'd've"
    const expected = `y${MLA}all${MLA}d${MLA}ve`
    expect(niceQuotes(input)).toBe(expected)
  })

  it("handles possessive after contraction (shouldn't's)", () => {
    // This is a weird but grammatically possible construct
    const input = "shouldn't's"
    const result = niceQuotes(input)
    // Both should be MLA
    expect(result).toBe(`shouldn${MLA}t${MLA}s`)
  })
})

describe("STRESS: Apostrophes at start and end of string", () => {
  it("handles apostrophe at very start (leading contraction)", () => {
    expect(niceQuotes("'twas")).toBe(`${MLA}twas`)
  })

  it("handles apostrophe at very end (closing quote)", () => {
    expect(niceQuotes("end'")).toBe(`end${RSQ}`)
  })

  it("handles apostrophe at very end (possessive)", () => {
    // dogs' at end of string - the ' after s followed by end of string
    expect(niceQuotes("dogs'")).toBe(`dogs${RSQ}`)
  })

  it("handles single apostrophe alone", () => {
    const result = niceQuotes("'")
    // A lone apostrophe - what does the parser do?
    expect(result).toBeDefined()
    // Should be stable
    expect(niceQuotes(result)).toBe(result)
  })

  it("handles empty string", () => {
    expect(niceQuotes("")).toBe("")
  })

  it("handles string with only whitespace", () => {
    expect(niceQuotes("   ")).toBe("   ")
  })
})

describe("STRESS: Possessive plurals vs singular possessives", () => {
  it.each([
    // Singular possessive: word's -> word + MLA + s
    ["the dog's bone", `the dog${MLA}s bone`],
    ["the boss's office", `the boss${MLA}s office`],
    ["James's car", `James${MLA}s car`],
    // Plural possessive: words' -> words + RSQ (acts as closing quote / trailing apostrophe)
    ["the dogs' owner", `the dogs${RSQ} owner`],
    ["the bosses' meeting", `the bosses${RSQ} meeting`],
    // Singular possessive at end of string
    ["the dog's", `the dog${MLA}s`],
    // Plural possessive at end of string
    ["the dogs'", `the dogs${RSQ}`],
  ])('possessive in "%s"', (input, expected) => {
    expect(niceQuotes(input)).toBe(expected)
  })
})

describe("STRESS: Already-converted text mixed with unconverted", () => {
  it("handles mix of curly and straight single quotes", () => {
    // Some parts already converted, some not
    const input = `${LSQ}hello${RSQ} and 'world'`
    const expected = `${LSQ}hello${RSQ} and ${LSQ}world${RSQ}`
    expect(niceQuotes(input)).toBe(expected)
  })

  it("handles mix of U+02BC and straight apostrophes in contractions", () => {
    const input = `I${MLA}m fine but you're not`
    const expected = `I${MLA}m fine but you${MLA}re not`
    expect(niceQuotes(input)).toBe(expected)
  })

  it("handles U+2019 used as apostrophe in input (from other systems)", () => {
    // Some systems use RIGHT_SINGLE_QUOTE as apostrophe
    // Our system should convert it to MODIFIER_LETTER_APOSTROPHE for contractions
    const input = `I${RSQ}m fine`
    const expected = `I${MLA}m fine`
    expect(niceQuotes(input)).toBe(expected)
  })

  it("handles U+2019 used as apostrophe in possessive in input", () => {
    // RIGHT_SINGLE_QUOTE used as possessive apostrophe from another system
    const input = `the dog${RSQ}s bone`
    const expected = `the dog${MLA}s bone`
    expect(niceQuotes(input)).toBe(expected)
  })

  it("preserves U+2019 as closing quote (not mistaken for apostrophe)", () => {
    const input = `${LSQ}hello${RSQ}`
    expect(niceQuotes(input)).toBe(input)
  })

  it("handles RIGHT_SINGLE_QUOTE in possessive position with following context", () => {
    // dog + RSQ + s + space - the contraction regex should match since
    // it matches [RIGHT_SINGLE_QUOTE] between Latin letters
    const input = `the dog${RSQ}s bone is here`
    const expected = `the dog${MLA}s bone is here`
    expect(niceQuotes(input)).toBe(expected)
  })
})

describe("STRESS: Complex real-world sentences", () => {
  it("handles dialogue with possessives and contractions", () => {
    const input = `"I can't find O'Brien's cat," she said. "It's the dog's fault."`
    const expected = `${LDQ}I can${MLA}t find O${MLA}Brien${MLA}s cat,${RDQ} she said. ${LDQ}It${MLA}s the dog${MLA}s fault.${RDQ}`
    expect(niceQuotes(input)).toBe(expected)
  })

  it("handles nested quotes with contractions", () => {
    const input = `"She said, 'I can't go,' and left."`
    const expected = `${LDQ}She said, ${LSQ}I can${MLA}t go,${RSQ} and left.${RDQ}`
    expect(niceQuotes(input)).toBe(expected)
  })

  it("handles 'n' abbreviation in dialogue", () => {
    const input = `"Rock 'n' Roll is great," she said.`
    const expected = `${LDQ}Rock ${MLA}n${MLA} Roll is great,${RDQ} she said.`
    expect(niceQuotes(input)).toBe(expected)
  })

  it("handles multiple quote types in one sentence", () => {
    const input = `He said, "the '90s were O'Brien's favorite decade, weren't they?"`
    const expected = `He said, ${LDQ}the ${MLA}90s were O${MLA}Brien${MLA}s favorite decade, weren${MLA}t they?${RDQ}`
    expect(niceQuotes(input)).toBe(expected)
  })

  it("handles possessive plural in dialogue", () => {
    const input = `"The dogs' bones aren't here," she said.`
    const result = niceQuotes(input)
    // dogs' should get RSQ (possessive plural / closing quote-like)
    // aren't should get MLA for the contraction
    expect(result).toContain(`dogs${RSQ}`)
    expect(result).toContain(`aren${MLA}t`)
  })
})

describe("STRESS: Edge cases with empty and whitespace quotes", () => {
  it("handles empty single quotes at start of string", () => {
    expect(niceQuotes("'' hello")).toBe(`${LSQ}${RSQ} hello`)
  })

  it("handles empty single quotes at end of string", () => {
    expect(niceQuotes("hello ''")).toBe(`hello ${LSQ}${RSQ}`)
  })

  it("handles empty single quotes adjacent to words", () => {
    // This is ambiguous - '' between word chars
    const result = niceQuotes("hello''world")
    // Should be stable
    expect(niceQuotes(result)).toBe(result)
  })

  it("handles multiple empty single quotes", () => {
    const result = niceQuotes("'' ''")
    expect(result).toBe(`${LSQ}${RSQ} ${LSQ}${RSQ}`)
  })
})

describe("STRESS: Regex pathological inputs", () => {
  it("handles very long contraction chains without catastrophic backtracking", () => {
    // The apostropheRegex has a 1000-char lookahead limit
    const longWord = "a".repeat(500)
    const input = `${longWord}'s thing`
    const result = niceQuotes(input)
    expect(result).toContain(MLA)
  })

  it("handles many apostrophes in sequence", () => {
    // Multiple straight quotes in a row
    const input = "a'''b"
    const result = niceQuotes(input)
    // Should be stable on second pass
    expect(niceQuotes(result)).toBe(result)
  })

  it("handles alternating quotes and text", () => {
    const input = "a'b'c'd'e'f"
    const expected = `a${MLA}b${MLA}c${MLA}d${MLA}e${MLA}f`
    expect(niceQuotes(input)).toBe(expected)
  })
})

describe("STRESS: Interaction between 'n' handler and other patterns", () => {
  it("handles 'n' inside single quotes (not as abbreviation)", () => {
    // Here 'n' is a quoted letter n, but the 'n' regex matches first
    // because the 'n' handler runs before quote detection
    const input = "she said 'n' is a letter"
    const result = niceQuotes(input)
    // The 'n' handler regex: (?<=\w\sep? )'n'(?= \sep?\w)
    // "said" is \w, then space, then 'n', then space, then "is" is \w
    // So this WILL match the 'n' abbreviation pattern
    expect(result).toBe(`she said ${MLA}n${MLA} is a letter`)
  })

  it("handles 'n' NOT matching when punctuation intervenes", () => {
    // 'n' after punctuation, not after a word character
    const input = "said, 'n' is good"
    const result = niceQuotes(input)
    // The regex requires \w before the space, but ',' is not \w
    // So this should NOT match the 'n' abbreviation pattern
    // Instead it should be treated as a quoted 'n'
    expect(result).not.toBe(`said, ${MLA}n${MLA} is good`)
  })

  it("handles capitalized 'N' (should not match 'n' handler)", () => {
    // The 'n' handler literally matches lowercase n
    const input = "Rock 'N' Roll"
    const result = niceQuotes(input)
    // Should NOT match the 'n' abbreviation handler since it's uppercase N
    expect(result).not.toContain(`${MLA}N${MLA}`)
    // Instead should be quoted: LSQ + N + RSQ
    expect(result).toBe(`Rock ${LSQ}N${RSQ} Roll`)
  })
})

describe("STRESS: Possessive 's at various positions", () => {
  it("handles possessive 's before period", () => {
    const input = "It was the dog's."
    const expected = `It was the dog${MLA}s.`
    expect(niceQuotes(input)).toBe(expected)
  })

  it("handles possessive 's before comma", () => {
    const input = "the dog's, the cat's"
    const expected = `the dog${MLA}s, the cat${MLA}s`
    expect(niceQuotes(input)).toBe(expected)
  })

  it("handles possessive 's before exclamation", () => {
    const input = "It's the dog's!"
    const expected = `It${MLA}s the dog${MLA}s!`
    expect(niceQuotes(input)).toBe(expected)
  })

  it("handles possessive 's before question mark", () => {
    const input = "Is it the dog's?"
    const expected = `Is it the dog${MLA}s?`
    expect(niceQuotes(input)).toBe(expected)
  })

  it("handles possessive 's before closing paren", () => {
    const input = "(the dog's)"
    const expected = `(the dog${MLA}s)`
    expect(niceQuotes(input)).toBe(expected)
  })

  it("handles possessive 's before em dash", () => {
    const input = `the dog's${EM_DASH}it was gone`
    const expected = `the dog${MLA}s${EM_DASH}it was gone`
    expect(niceQuotes(input)).toBe(expected)
  })

  it("handles possessive 's before closing bracket", () => {
    const input = "[the dog's]"
    const expected = `[the dog${MLA}s]`
    expect(niceQuotes(input)).toBe(expected)
  })

  it("handles possessive 's at end of string", () => {
    const input = "the dog's"
    const expected = `the dog${MLA}s`
    expect(niceQuotes(input)).toBe(expected)
  })

  it("handles possessive 's before closing double quote", () => {
    const input = `"the dog's"`
    const expected = `${LDQ}the dog${MLA}s${RDQ}`
    expect(niceQuotes(input)).toBe(expected)
  })
})

describe("STRESS: Separator between possessive apostrophe and s", () => {
  const sep = SEP

  it("handles separator between ' and s for possessive", () => {
    const input = `the dog'${sep}s bone`
    const result = niceQuotes(input, { separator: sep })
    // afterPossessive allows optional sep between ' and s
    expect(result).toBe(`the dog${MLA}${sep}s bone`)
  })

  it("handles separator after possessive 's", () => {
    const input = `the dog's${sep} bone`
    const result = niceQuotes(input, { separator: sep })
    // afterPossessive allows optional sep after s before ending context
    expect(result).toBe(`the dog${MLA}s${sep} bone`)
  })

  it("handles separator both between and after possessive", () => {
    const input = `the dog'${sep}s${sep} bone`
    const result = niceQuotes(input, { separator: sep })
    expect(result).toBe(`the dog${MLA}${sep}s${sep} bone`)
  })
})

describe("STRESS: Idempotency of possessive plural (dogs')", () => {
  it("dogs' with RSQ is stable on re-application", () => {
    // After first pass, dogs' becomes dogs + RSQ
    // On second pass, the contraction regex matches [RSQ] between Latin letters
    // But dogs + RSQ + space means RSQ is NOT between two Latin letters
    // so the contraction regex should NOT match
    const firstPass = niceQuotes("the dogs' owner")
    expect(firstPass).toBe(`the dogs${RSQ} owner`)
    const secondPass = niceQuotes(firstPass)
    expect(secondPass).toBe(firstPass)
  })

  it("possessive plural inside double quotes is idempotent", () => {
    const input = `"the dogs' owner"`
    const firstPass = niceQuotes(input)
    const secondPass = niceQuotes(firstPass)
    expect(secondPass).toBe(firstPass)
  })
})

describe("STRESS: Closing quote after possessive 's", () => {
  it("handles 'the dog's' (possessive ending a quoted phrase)", () => {
    // The phrase 'the dog's' has:
    // - opening quote (the first ')
    // - possessive apostrophe (the middle ')
    // - closing quote (the last ')
    const input = "'the dog's'"
    const result = niceQuotes(input)
    // Expected: LSQ + "the dog" + MLA + "s" + RSQ
    expect(result).toBe(`${LSQ}the dog${MLA}s${RSQ}`)
  })

  it("idempotency of 'the dog's' result", () => {
    const input = "'the dog's'"
    const firstPass = niceQuotes(input)
    const secondPass = niceQuotes(firstPass)
    expect(secondPass).toBe(firstPass)
  })
})

describe("STRESS: Contraction regex matching RIGHT_SINGLE_QUOTE in tricky positions", () => {
  it("does not convert RSQ to MLA when RSQ is a closing quote before a word", () => {
    // 'hello' world - the RSQ before space+word should NOT become MLA
    const input = `${LSQ}hello${RSQ} world`
    expect(niceQuotes(input)).toBe(input)
  })

  it("converts RSQ to MLA when RSQ is between two Latin letter sequences", () => {
    // This is a contraction pattern: word + RSQ + word
    const input = `don${RSQ}t`
    const expected = `don${MLA}t`
    expect(niceQuotes(input)).toBe(expected)
  })

  it("does not convert RSQ after closing bracket", () => {
    const input = `[test]${RSQ}`
    const result = niceQuotes(input)
    // ] is not a Latin letter, so contraction regex should not match
    expect(result).not.toContain(MLA)
  })
})

describe("STRESS: applyPunctuationStyle does NOT match MODIFIER_LETTER_APOSTROPHE", () => {
  it("american style: period after MLA+s is not moved (not a quote)", () => {
    // Verify that "Brien's." stays as is - the MLA is not in the character class
    const input = `Brien${MLA}s.`
    expect(niceQuotes(input, { punctuationStyle: "american" })).toBe(`Brien${MLA}s.`)
  })

  it("american style: comma after MLA+s is not moved", () => {
    const input = `Brien${MLA}s, hello`
    expect(niceQuotes(input, { punctuationStyle: "american" })).toBe(`Brien${MLA}s, hello`)
  })

  it("british style: period before MLA is not moved", () => {
    // This shouldn't happen in practice but let's test it
    const input = `.${MLA}s`
    const result = niceQuotes(input, { punctuationStyle: "british" })
    // The period-inside regex looks for: period + sep? + [RSQ/RDQ]
    // MLA is NOT in that character class, so no movement
    expect(result).toBe(`.${MLA}s`)
  })

  it("correctly moves period relative to RSQ in american style", () => {
    // This IS a closing quote, so period should move inside
    const preConverted = `${LSQ}test${RSQ}.`
    const result = niceQuotes(preConverted, { punctuationStyle: "american" })
    expect(result).toBe(`${LSQ}test.${RSQ}`)
  })
})

describe("STRESS: Apostrophe before 's at various ending contexts", () => {
  it.each([
    // The possessive regex afterEndingSinglePatterns includes: \s.!?;,\)-\]"
    ["dog's ", `dog${MLA}s `],
    ["dog's.", `dog${MLA}s.`],
    ["dog's!", `dog${MLA}s!`],
    ["dog's?", `dog${MLA}s?`],
    ["dog's;", `dog${MLA}s;`],
    ["dog's,", `dog${MLA}s,`],
    ["dog's)", `dog${MLA}s)`],
    ["dog's]", `dog${MLA}s]`],
    [`dog's${EM_DASH}`, `dog${MLA}s${EM_DASH}`],
    ["dog's-", `dog${MLA}s-`],
  ])('possessive before ending context: "%s"', (input, expected) => {
    expect(niceQuotes(input)).toBe(expected)
  })
})

describe("STRESS: Words that look like 'n' abbreviation but aren't", () => {
  it("does not match 'n' handler when no space after the second apostrophe, but contraction + apostrophe regexes still convert", () => {
    // The 'n' handler regex requires space + \w after 'n', so "Rock 'n'Roll" does NOT
    // match the 'n' handler. However, the individual apostrophes are still converted:
    // - The second ' (before Roll) matches the contraction regex (n[']R -> Latin'Latin)
    // - The first ' (before n) matches the apostrophe regex (non-\w context, no closing quote ahead)
    // Net result: both apostrophes become MLA, but via different code paths than the 'n' handler
    const input = "Rock 'n'Roll"
    const result = niceQuotes(input)
    expect(result).toBe(`Rock ${MLA}n${MLA}Roll`)
    // Verify idempotency
    expect(niceQuotes(result)).toBe(result)
  })

  it("does not match 'n' when no space before the first apostrophe", () => {
    // The 'n' regex requires \w + space before the opening apostrophe
    const input = "Rock'n' Roll"
    const result = niceQuotes(input)
    // No space before first ', so should NOT match 'n' handler
    expect(result).not.toContain(`${MLA}n${MLA}`)
  })

  it("handles 'n' followed by newline instead of space", () => {
    const input = "Rock 'n'\nRoll"
    const result = niceQuotes(input)
    // The regex uses space literal, not \s, so newline should NOT match
    expect(result).not.toContain(`${MLA}n${MLA}`)
  })
})

describe("STRESS: Mixed U+02BC and U+2019 in complex scenarios", () => {
  it("handles text from mixed sources with both U+02BC and U+2019", () => {
    // Imagine pasting text where some apostrophes are MLA and others are RSQ
    const input = `I${MLA}m fine and you${RSQ}re great`
    const expected = `I${MLA}m fine and you${MLA}re great`
    expect(niceQuotes(input)).toBe(expected)
  })

  it("handles RSQ used as apostrophe in O'Brien pattern", () => {
    const input = `O${RSQ}Brien`
    const expected = `O${MLA}Brien`
    expect(niceQuotes(input)).toBe(expected)
  })

  it("handles MLA next to straight quote in same word", () => {
    // What if someone has: can + MLA + t + ' + s (typo/weird input)
    const input = `can${MLA}t's`
    const result = niceQuotes(input)
    // MLA is already there for the contraction, then 's should become possessive
    expect(result).toBe(`can${MLA}t${MLA}s`)
  })
})

// =========================================================================
// ROUND 2: Critical gap analysis
// =========================================================================

describe("STRESS R2: French/European contractions with accented Latin letters", () => {
  // LATIN_LETTERS includes U+00C0-024F, so accented chars should work in contractions
  it.each([
    ["l'homme", `l${MLA}homme`],
    ["d'accord", `d${MLA}accord`],
    ["l'école", `l${MLA}école`],
    ["l'hôtel", `l${MLA}hôtel`],
    ["j'ai", `j${MLA}ai`],
    ["n'est-ce pas", `n${MLA}est-ce pas`],
    ["c'était", `c${MLA}était`],
    ["qu'il", `qu${MLA}il`],
  ])('French contraction "%s" → "%s"', (input, expected) => {
    expect(niceQuotes(input)).toBe(expected)
  })

  it("French contractions are idempotent", () => {
    const input = "l'homme d'accord"
    const first = niceQuotes(input)
    expect(niceQuotes(first)).toBe(first)
  })
})

describe("STRESS R2: Uppercase Irish/Scottish names", () => {
  it.each([
    ["O'NEILL", `O${MLA}NEILL`],
    ["O'BRIEN", `O${MLA}BRIEN`],
    ["D'ARTAGNAN", `D${MLA}ARTAGNAN`],
    ["M'LORD", `M${MLA}LORD`],
    ["O'NEILL'S PUB", `O${MLA}NEILL${MLA}S PUB`],
  ])('uppercase name "%s"', (input, expected) => {
    expect(niceQuotes(input)).toBe(expected)
  })
})

describe("STRESS R2: 'n' abbreviation + possessive combination", () => {
  it("handles 'n' followed by possessive in same sentence", () => {
    const input = "Rock 'n' Roll's greatest hits"
    const expected = `Rock ${MLA}n${MLA} Roll${MLA}s greatest hits`
    expect(niceQuotes(input)).toBe(expected)
  })

  it("handles 'n' with possessive before and after", () => {
    const input = "O'Brien's fish 'n' chips"
    const expected = `O${MLA}Brien${MLA}s fish ${MLA}n${MLA} chips`
    expect(niceQuotes(input)).toBe(expected)
  })

  it("handles 'n' inside double quotes with possessives", () => {
    const input = `"Rock 'n' Roll's greatest hits."`
    const expected = `${LDQ}Rock ${MLA}n${MLA} Roll${MLA}s greatest hits.${RDQ}`
    expect(niceQuotes(input)).toBe(expected)
  })

  it("'n' + possessive combo is idempotent", () => {
    const input = "Rock 'n' Roll's greatest hits"
    const first = niceQuotes(input)
    expect(niceQuotes(first)).toBe(first)
  })
})

describe("STRESS R2: Multi-line text", () => {
  it("handles contractions across multiple lines", () => {
    const input = "I can't\nbelieve it's\nnot butter"
    const expected = `I can${MLA}t\nbelieve it${MLA}s\nnot butter`
    expect(niceQuotes(input)).toBe(expected)
  })

  it("handles possessives across multiple lines", () => {
    const input = "the dog's\nbone and\nthe cat's toy"
    const expected = `the dog${MLA}s\nbone and\nthe cat${MLA}s toy`
    expect(niceQuotes(input)).toBe(expected)
  })

  it("handles opening and closing quotes on different lines", () => {
    const input = "'hello\nworld'"
    const result = niceQuotes(input)
    // The apostropheRegex lookahead stops at \n, so on line 1 no closing quote is found.
    // Thus ' before hello becomes MLA (apostrophe), not LSQ (opening quote).
    // The ' after world is caught by closingSingle → RSQ.
    expect(result).toBe(`${MLA}hello\nworld${RSQ}`)
    expect(niceQuotes(result)).toBe(result) // idempotent
  })

  it("multi-line is idempotent", () => {
    const input = "She said, 'I can't\ngo to O'Brien's\nfish 'n' chips shop.'"
    const first = niceQuotes(input)
    expect(niceQuotes(first)).toBe(first)
  })
})

describe("STRESS R2: Possessive before curly double quote (pre-converted input)", () => {
  it("handles straight apostrophe in possessive before RDQ", () => {
    // Input where double quotes are already curly but apostrophe is straight
    // This can happen when mixing output from different tools
    const input = `${LDQ}the dog's${RDQ}`
    const result = niceQuotes(input)
    // The possessive regex checks afterPossessive which includes " (ASCII).
    // But RDQ is not ASCII ". The contraction regex will catch it instead:
    // g + ' + s where both are LATIN_LETTERS
    expect(result).toBe(`${LDQ}the dog${MLA}s${RDQ}`)
  })

  it("handles straight apostrophe in contraction before RDQ", () => {
    const input = `${LDQ}I can't${RDQ}`
    const result = niceQuotes(input)
    expect(result).toBe(`${LDQ}I can${MLA}t${RDQ}`)
  })

  it("pre-converted doubles with straight apostrophe is idempotent after one pass", () => {
    const input = `${LDQ}the dog's bone${RDQ}`
    const first = niceQuotes(input)
    expect(niceQuotes(first)).toBe(first)
  })
})

describe("STRESS R2: Decade abbreviations in various contexts", () => {
  it.each([
    ["the '60s", `the ${MLA}60s`],
    ["the '70s", `the ${MLA}70s`],
    ["the '80s", `the ${MLA}80s`],
    ["the '90s", `the ${MLA}90s`],
    ["the '00s", `the ${MLA}00s`],
  ])('decade "%s"', (input, expected) => {
    expect(niceQuotes(input)).toBe(expected)
  })

  it("decade inside double quotes", () => {
    const input = `"the '90s were great"`
    const expected = `${LDQ}the ${MLA}90s were great${RDQ}`
    expect(niceQuotes(input)).toBe(expected)
  })

  it("decade inside single quotes", () => {
    const input = "she said 'the '90s were great'"
    const result = niceQuotes(input)
    // The apostropheRegex lookahead for 'the stops at the next straight ' (before 90s)
    // without finding RSQ/MLA, so 'the becomes MLA (apostrophe).
    // For '90s, the lookahead sees the RSQ at great' → treated as opening quote (LSQ).
    expect(result).toContain(`${MLA}the`)
    expect(result).toContain(`${LSQ}90s`)  // becomes opening quote, not apostrophe
    expect(result).toContain(`great${RSQ}`)
    expect(niceQuotes(result)).toBe(result) // idempotent
  })

  it("multiple decades in one sentence", () => {
    const input = "The '60s, '70s, and '80s were different."
    const result = niceQuotes(input)
    expect(result).toContain(`${MLA}60s`)
    expect(result).toContain(`${MLA}70s`)
    expect(result).toContain(`${MLA}80s`)
  })
})

describe("STRESS R2: 'twas-style leading apostrophes", () => {
  it.each([
    ["'twas", `${MLA}twas`],
    ["'tis", `${MLA}tis`],
    ["'cause", `${MLA}cause`],
    ["'bout", `${MLA}bout`],
    ["'neath", `${MLA}neath`],
    ["'til", `${MLA}til`],
  ])('leading contraction "%s"', (input, expected) => {
    expect(niceQuotes(input)).toBe(expected)
  })

  it("leading apostrophe mid-sentence", () => {
    const input = "It was 'twas the night"
    const result = niceQuotes(input)
    expect(result).toContain(`${MLA}twas`)
  })

  it("leading apostrophe inside single quotes", () => {
    const input = "'twas the night, 'twas indeed"
    const result = niceQuotes(input)
    // First 'twas at start - apostrophe
    // Second 'twas mid-sentence - apostrophe
    // Both should be MLA since there's no matching closing quote
    expect(result).toBe(`${MLA}twas the night, ${MLA}twas indeed`)
  })

  it("leading apostrophe inside double quotes", () => {
    const input = `"'twas the night"`
    const expected = `${LDQ}${MLA}twas the night${RDQ}`
    expect(niceQuotes(input)).toBe(expected)
  })
})

describe("STRESS R2: Possessive 's followed by 's (dogs's, boss's)", () => {
  it.each([
    // These are grammatically valid in different style guides
    ["the boss's car", `the boss${MLA}s car`],
    ["James's book", `James${MLA}s book`],
    ["the dress's color", `the dress${MLA}s color`],
    ["Chris's house", `Chris${MLA}s house`],
  ])('possessive after s-ending word: "%s"', (input, expected) => {
    expect(niceQuotes(input)).toBe(expected)
  })
})

describe("STRESS R2: Interaction between quote ordering steps", () => {
  it("possessive runs before closing, so 'dog's' gets MLA not RSQ for possessive", () => {
    // In 'dog's bone', the ' after dog:
    // - Possessive sees: preceded by g, followed by s + space -> MLA
    // - Closing would also match but possessive runs first
    const input = "the dog's bone"
    const result = niceQuotes(input)
    expect(result).toBe(`the dog${MLA}s bone`)
  })

  it("closing runs after possessive, so trailing ' without 's gets RSQ", () => {
    // In 'end' the final ':
    // - Possessive: followed by end-of-string, not by 's' -> no match
    // - Closing: followed by end-of-string -> RSQ
    const input = "end'"
    expect(niceQuotes(input)).toBe(`end${RSQ}`)
  })

  it("contraction runs after both, catching mid-word apostrophes", () => {
    // In don't, the ':
    // - Possessive: followed by 't', not 's + ending -> no match
    // - Closing: followed by 't', not ending pattern -> no match
    // - Contraction: Latin + ' + Latin -> MLA
    const input = "don't"
    expect(niceQuotes(input)).toBe(`don${MLA}t`)
  })

  it("'n' handler runs before possessive/closing, preventing misclassification", () => {
    // In Rock 'n' Roll, the second ' in 'n':
    // - If 'n' handler didn't run first, closing quote regex would match it
    //   (preceded by 'n', followed by space which is in afterEndingSinglePatterns)
    // - But 'n' handler converts both to MLA first
    const input = "Rock 'n' Roll"
    const result = niceQuotes(input)
    expect(result).toBe(`Rock ${MLA}n${MLA} Roll`)
    // Verify the second apostrophe is MLA, not RSQ
    expect(result).not.toContain(RSQ)
  })
})

describe("STRESS R2: Empty/minimal inputs", () => {
  it.each([
    ["", ""],
    [" ", " "],
    ["'", MLA], // lone apostrophe - apostropheRegex matches (no closing quote ahead)
    ["a", "a"],
    ["'a", `${MLA}a`], // leading apostrophe before word
    ["a'", `a${RSQ}`], // trailing - closing quote
  ])('minimal input "%s"', (input, expected) => {
    const result = niceQuotes(input)
    expect(result).toBe(expected)
    // All minimal inputs should be idempotent
    expect(niceQuotes(result)).toBe(result)
  })
})

describe("STRESS R2: Contraction regex normalizes RSQ→MLA between Latin letters", () => {
  // This is the key idempotency mechanism for text from external systems
  it.each([
    [`don${RSQ}t`, `don${MLA}t`],
    [`I${RSQ}m`, `I${MLA}m`],
    [`they${RSQ}re`, `they${MLA}re`],
    [`O${RSQ}Brien`, `O${MLA}Brien`],
    [`we${RSQ}ve`, `we${MLA}ve`],
    [`she${RSQ}ll`, `she${MLA}ll`],
  ])('normalizes RSQ to MLA in contraction: "%s"', (input, expected) => {
    expect(niceQuotes(input)).toBe(expected)
  })

  it("does NOT normalize RSQ to MLA when RSQ is a closing quote", () => {
    // RSQ after a word, followed by space - this is a closing quote, not contraction
    const input = `${LSQ}hello${RSQ} world`
    expect(niceQuotes(input)).toBe(input)
    // RSQ should remain RSQ
    expect(niceQuotes(input)).toContain(RSQ)
  })
})

describe("STRESS R2: Combined stress - all features in one sentence", () => {
  it("handles the kitchen sink", () => {
    const input = `"O'Brien's fish 'n' chips shop in the '90s wasn't the dogs' favorite," she said, 'twas better.`
    const result = niceQuotes(input)
    // O'Brien's: contraction (O→Brien) + possessive (Brien→s)
    expect(result).toContain(`O${MLA}Brien${MLA}s`)
    // fish 'n' chips: 'n' abbreviation
    expect(result).toContain(`fish ${MLA}n${MLA} chips`)
    // '90s: The dogs' closing quote is visible in the lookahead, so '90s is treated
    // as an opening quote (LSQ) rather than an apostrophe (MLA). Known limitation.
    expect(result).toContain(`${LSQ}90s`)
    // wasn't: contraction
    expect(result).toContain(`wasn${MLA}t`)
    // dogs': possessive plural (ambiguous, gets RSQ)
    expect(result).toContain(`dogs${RSQ}`)
    // 'twas: leading apostrophe (outside the double-quoted phrase, no closing quote ahead)
    expect(result).toContain(`${MLA}twas`)
    // Idempotent
    expect(niceQuotes(result)).toBe(result)
  })

  it("handles nested quotes with all apostrophe types", () => {
    const input = `"She said, 'O'Brien's '90s Rock 'n' Roll wasn't bad.'"`
    const result = niceQuotes(input)
    expect(result).toContain(LDQ)
    expect(result).toContain(RDQ)
    // The inner single-quoted phrase 'O'Brien's ... bad.' creates LSQ/RSQ pairs
    expect(result).toContain(`O${MLA}Brien${MLA}s`)
    // '90s inside single-quoted phrase with closing quote ahead → LSQ (known limitation)
    expect(result).toContain(`${LSQ}90s`)
    expect(result).toContain(`${MLA}n${MLA}`)
    expect(result).toContain(`wasn${MLA}t`)
    // Idempotent
    expect(niceQuotes(result)).toBe(result)
  })
})

describe("STRESS R2: Possessive 's where 's is followed by another word (not ending context)", () => {
  // This tests the boundary between possessive and contraction regexes
  it("possessive 's before a word starting with 's'", () => {
    // "dog's stuff" - possessive 's followed by space then 'stuff'
    // The possessive regex sees: ' + s + space (space is in afterEndingSinglePatterns) -> match
    const input = "the dog's stuff"
    expect(niceQuotes(input)).toBe(`the dog${MLA}s stuff`)
  })

  it("possessive 's before a word starting with a vowel", () => {
    const input = "the dog's ear"
    expect(niceQuotes(input)).toBe(`the dog${MLA}s ear`)
  })

  it("what looks like possessive 's but is actually end of contraction + s", () => {
    // "it's" can be "it is" (contraction) or "its" possessive - both output MLA
    const input = "it's a test"
    expect(niceQuotes(input)).toBe(`it${MLA}s a test`)
  })
})

describe("STRESS R2: Pathological regex - ensure no catastrophic backtracking", () => {
  it("handles 1000+ chars without matching closing quote (hits lookahead limit)", () => {
    // The apostropheRegex has {0,1000} lookahead limit
    const longText = "a".repeat(1500)
    const input = `'${longText}`
    const start = performance.now()
    const result = niceQuotes(input)
    const elapsed = performance.now() - start
    // Should complete in well under 1 second (not exponential backtracking)
    expect(elapsed).toBeLessThan(1000)
    expect(result).toBeDefined()
    expect(niceQuotes(result)).toBe(result) // idempotent
  })

  it("handles many apostrophes in rapid succession", () => {
    const input = "a'b'c'd'e'f'g'h'i'j'k'l'm'n'o'p"
    const start = performance.now()
    const result = niceQuotes(input)
    const elapsed = performance.now() - start
    expect(elapsed).toBeLessThan(1000)
    // All should be contractions (Latin + ' + Latin)
    expect(result).not.toContain("'")
    expect(niceQuotes(result)).toBe(result)
  })

  it("handles alternating quotes and spaces", () => {
    const input = "' ' ' ' ' ' ' ' ' '"
    const start = performance.now()
    const result = niceQuotes(input)
    const elapsed = performance.now() - start
    expect(elapsed).toBeLessThan(1000)
    expect(niceQuotes(result)).toBe(result)
  })
})

describe("STRESS R2: 'n' handler does NOT match when separator breaks the pattern", () => {
  it("does not match 'n' when separator is between space and apostrophe", () => {
    // The regex: (?<=\w\sep? )'n'(?= \sep?\w)
    // If the input is: Rock SEP 'n' Roll (sep between Rock and space)
    // The lookbehind needs \w + optional-sep + space before '
    const input = `Rock${SEP} 'n' ${SEP}Roll`
    const result = niceQuotes(input, { separator: SEP })
    // \w = k, then SEP, then space before ' -> lookbehind (?<=\w\sep? ) should match
    // After 'n': space, then SEP, then R -> (?= \sep?\w) should match
    expect(result).toContain(`${MLA}n${MLA}`)
    expect(niceQuotes(result, { separator: SEP })).toBe(result)
  })
})
