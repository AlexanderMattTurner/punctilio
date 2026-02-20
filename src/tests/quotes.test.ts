import { niceQuotes } from "../quotes.js"
import { UNICODE_SYMBOLS, DEFAULT_SEPARATOR } from "../constants.js"

const {
  LEFT_DOUBLE_QUOTE,
  RIGHT_DOUBLE_QUOTE,
  LEFT_SINGLE_QUOTE,
  RIGHT_SINGLE_QUOTE,
  MODIFIER_LETTER_APOSTROPHE,
  EM_DASH,
  ELLIPSIS,
} = UNICODE_SYMBOLS

/** Enable MLA output for tests that assert the apostrophe codepoint. */
const MLA = { useModifierLetterApostrophe: true } as const

describe("niceQuotes", () => {
  describe("double quotes", () => {
    it.each([
      ['"This is a quote", she said.', `${LEFT_DOUBLE_QUOTE}This is a quote,${RIGHT_DOUBLE_QUOTE} she said.`],
      ['"This is a quote," she said.', `${LEFT_DOUBLE_QUOTE}This is a quote,${RIGHT_DOUBLE_QUOTE} she said.`],
      ['"This is a quote!".', `${LEFT_DOUBLE_QUOTE}This is a quote!${RIGHT_DOUBLE_QUOTE}.`],
      ['"This is a quote?".', `${LEFT_DOUBLE_QUOTE}This is a quote?${RIGHT_DOUBLE_QUOTE}.`],
      ['"This is a quote..." he trailed off.', `${LEFT_DOUBLE_QUOTE}This is a quote...${RIGHT_DOUBLE_QUOTE} he trailed off.`],
      ['She said, "This is a quote."', `She said, ${LEFT_DOUBLE_QUOTE}This is a quote.${RIGHT_DOUBLE_QUOTE}`],
      ['"Hello." Mary', `${LEFT_DOUBLE_QUOTE}Hello.${RIGHT_DOUBLE_QUOTE} Mary`],
      ['"Hello." (Mary)', `${LEFT_DOUBLE_QUOTE}Hello.${RIGHT_DOUBLE_QUOTE} (Mary)`],
      [
        '"I am" so "tired" of "these" "quotes".',
        `${LEFT_DOUBLE_QUOTE}I am${RIGHT_DOUBLE_QUOTE} so ${LEFT_DOUBLE_QUOTE}tired${RIGHT_DOUBLE_QUOTE} of ${LEFT_DOUBLE_QUOTE}these${RIGHT_DOUBLE_QUOTE} ${LEFT_DOUBLE_QUOTE}quotes.${RIGHT_DOUBLE_QUOTE}`,
      ],
      ['"world model";', `${LEFT_DOUBLE_QUOTE}world model${RIGHT_DOUBLE_QUOTE};`],
      ['"party"/"wedding."', `${LEFT_DOUBLE_QUOTE}party${RIGHT_DOUBLE_QUOTE}/${LEFT_DOUBLE_QUOTE}wedding.${RIGHT_DOUBLE_QUOTE}`],
      ['"Hi \'Trout!"', `${LEFT_DOUBLE_QUOTE}Hi ${MODIFIER_LETTER_APOSTROPHE}Trout!${RIGHT_DOUBLE_QUOTE}`],
      [`${LEFT_DOUBLE_QUOTE}scope insensitivity${RIGHT_DOUBLE_QUOTE}`, `${LEFT_DOUBLE_QUOTE}scope insensitivity${RIGHT_DOUBLE_QUOTE}`],
      [
        '"how many ways can this function be implemented?".',
        `${LEFT_DOUBLE_QUOTE}how many ways can this function be implemented?${RIGHT_DOUBLE_QUOTE}.`,
      ],
      ['SSL.")', `SSL.${RIGHT_DOUBLE_QUOTE})`],
      ["can't multiply\"?", `can${MODIFIER_LETTER_APOSTROPHE}t multiply${RIGHT_DOUBLE_QUOTE}?`],
      ['with "scope insensitivity":', `with ${LEFT_DOUBLE_QUOTE}scope insensitivity${RIGHT_DOUBLE_QUOTE}:`],
      ['("the best")', `(${LEFT_DOUBLE_QUOTE}the best${RIGHT_DOUBLE_QUOTE})`],
      ['"This is a quote"...', `${LEFT_DOUBLE_QUOTE}This is a quote${RIGHT_DOUBLE_QUOTE}...`],
      ['He said, "This is a quote"...', `He said, ${LEFT_DOUBLE_QUOTE}This is a quote${RIGHT_DOUBLE_QUOTE}...`],
      ['"... What is this?"', `${LEFT_DOUBLE_QUOTE}... What is this?${RIGHT_DOUBLE_QUOTE}`],
      ['"/"', `${LEFT_DOUBLE_QUOTE}/${RIGHT_DOUBLE_QUOTE}`],
      ['"Game"/"Life"', `${LEFT_DOUBLE_QUOTE}Game${RIGHT_DOUBLE_QUOTE}/${LEFT_DOUBLE_QUOTE}Life${RIGHT_DOUBLE_QUOTE}`],
      ['"Test:".', `${LEFT_DOUBLE_QUOTE}Test:${RIGHT_DOUBLE_QUOTE}.`],
      ['"Test...".', `${LEFT_DOUBLE_QUOTE}Test...${RIGHT_DOUBLE_QUOTE}.`],
      [`"To maximize reward${ELLIPSIS}".`, `${LEFT_DOUBLE_QUOTE}To maximize reward${ELLIPSIS}${RIGHT_DOUBLE_QUOTE}.`],
      ['"Test"s', `${LEFT_DOUBLE_QUOTE}Test${RIGHT_DOUBLE_QUOTE}s`],
      // End-of-line quote becomes RIGHT quote
      ['not confident in that plan - "', `not confident in that plan - ${RIGHT_DOUBLE_QUOTE}`],
    ])('should convert double quotes in "%s"', (input, expected) => {
      expect(niceQuotes(input, MLA)).toBe(expected)
    })
  })

  describe("single quotes and apostrophes", () => {
    it.each([
      ["He said, 'Hi'", `He said, ${LEFT_SINGLE_QUOTE}Hi${RIGHT_SINGLE_QUOTE}`],
      ["He wanted 'power.'", `He wanted ${LEFT_SINGLE_QUOTE}power.${RIGHT_SINGLE_QUOTE}`],
      ["I'd", `I${MODIFIER_LETTER_APOSTROPHE}d`],
      ["I don't'nt want to go", `I don${MODIFIER_LETTER_APOSTROPHE}t${MODIFIER_LETTER_APOSTROPHE}nt want to go`],
      ['"\'sup"', `${LEFT_DOUBLE_QUOTE}${MODIFIER_LETTER_APOSTROPHE}sup${RIGHT_DOUBLE_QUOTE}`],
      ["'SUP", `${MODIFIER_LETTER_APOSTROPHE}SUP`],
      ["Rock 'n' Roll", `Rock ${MODIFIER_LETTER_APOSTROPHE}n${MODIFIER_LETTER_APOSTROPHE} Roll`],
      ["I was born in '99", `I was born in ${MODIFIER_LETTER_APOSTROPHE}99`],
      ["'99 tigers weren't a match", `${MODIFIER_LETTER_APOSTROPHE}99 tigers weren${MODIFIER_LETTER_APOSTROPHE}t a match`],
      [
        "I'm not the best, haven't you heard?",
        `I${MODIFIER_LETTER_APOSTROPHE}m not the best, haven${MODIFIER_LETTER_APOSTROPHE}t you heard?`,
      ],
      // Skipped: Complex edge case with 'sup and quoted phrase
      // ["Hey, 'sup 'this is a single quote'", `Hey, ${RIGHT_SINGLE_QUOTE}sup ${LEFT_SINGLE_QUOTE}this is a single quote${RIGHT_SINGLE_QUOTE}`],
      ["'the best',", `${LEFT_SINGLE_QUOTE}the best,${RIGHT_SINGLE_QUOTE}`],
      ["'I lost the game.'", `${LEFT_SINGLE_QUOTE}I lost the game.${RIGHT_SINGLE_QUOTE}`],
      ["I hate you.'\"", `I hate you.${RIGHT_SINGLE_QUOTE}${RIGHT_DOUBLE_QUOTE}`],
      ["The 'function space')", `The ${LEFT_SINGLE_QUOTE}function space${RIGHT_SINGLE_QUOTE})`],
      [`The 'function space'${EM_DASH}`, `The ${LEFT_SINGLE_QUOTE}function space${RIGHT_SINGLE_QUOTE}${EM_DASH}`],
      ["What do you think?']", `What do you think?${RIGHT_SINGLE_QUOTE}]`],
      ["('survival incentive')", `(${LEFT_SINGLE_QUOTE}survival incentive${RIGHT_SINGLE_QUOTE})`],
      [
        "strategy s's return is good, even as d's return is bad",
        `strategy s${MODIFIER_LETTER_APOSTROPHE}s return is good, even as d${MODIFIER_LETTER_APOSTROPHE}s return is bad`,
      ],
      // Chained possessives
      ["the dog's owner's car", `the dog${MODIFIER_LETTER_APOSTROPHE}s owner${MODIFIER_LETTER_APOSTROPHE}s car`],
      // Hyphenated possessive
      ["mother-in-law's house", `mother-in-law${MODIFIER_LETTER_APOSTROPHE}s house`],
      // Accented character before possessive
      ["café's menu", `café${MODIFIER_LETTER_APOSTROPHE}s menu`],
      // Digit before possessive
      ["the 747's engine", `the 747${MODIFIER_LETTER_APOSTROPHE}s engine`],
      // Compound contraction + possessive
      ["shouldn't's", `shouldn${MODIFIER_LETTER_APOSTROPHE}t${MODIFIER_LETTER_APOSTROPHE}s`],
      // Contraction before em-dash
      [`don't${EM_DASH}stop`, `don${MODIFIER_LETTER_APOSTROPHE}t${EM_DASH}stop`],
      // Contraction + digit context
      ["it's 5 o'clock", `it${MODIFIER_LETTER_APOSTROPHE}s 5 o${MODIFIER_LETTER_APOSTROPHE}clock`],
      // French contractions (single-letter prefix + accented Latin)
      ["l'homme", `l${MODIFIER_LETTER_APOSTROPHE}homme`],
      ["l'école", `l${MODIFIER_LETTER_APOSTROPHE}école`],
      // Uppercase contractions and names
      ["O'NEILL", `O${MODIFIER_LETTER_APOSTROPHE}NEILL`],
      ["CAN'T", `CAN${MODIFIER_LETTER_APOSTROPHE}T`],
      // Possessive in parenthetical
      ["(Brien's)", `(Brien${MODIFIER_LETTER_APOSTROPHE}s)`],
      // Possessive inside single-quoted phrase
      ["'the dog's bowl'", `${LEFT_SINGLE_QUOTE}the dog${MODIFIER_LETTER_APOSTROPHE}s bowl${RIGHT_SINGLE_QUOTE}`],
      // Straight apostrophe inside pre-converted double quotes
      [`${LEFT_DOUBLE_QUOTE}the dog's${RIGHT_DOUBLE_QUOTE}`, `${LEFT_DOUBLE_QUOTE}the dog${MODIFIER_LETTER_APOSTROPHE}s${RIGHT_DOUBLE_QUOTE}`],
      // Decade in double quotes
      [`"the '90s"`, `${LEFT_DOUBLE_QUOTE}the ${MODIFIER_LETTER_APOSTROPHE}90s${RIGHT_DOUBLE_QUOTE}`],
      // 'n' + possessive combination
      ["Rock 'n' Roll's greatest hits", `Rock ${MODIFIER_LETTER_APOSTROPHE}n${MODIFIER_LETTER_APOSTROPHE} Roll${MODIFIER_LETTER_APOSTROPHE}s greatest hits`],
      // Non-Latin character before possessive
      ["Привет's", `Привет${MODIFIER_LETTER_APOSTROPHE}s`],
      // Closing RSQ then opening LDQ
      [`'hello' "world"`, `${LEFT_SINGLE_QUOTE}hello${RIGHT_SINGLE_QUOTE} ${LEFT_DOUBLE_QUOTE}world${RIGHT_DOUBLE_QUOTE}`],
    ])('should handle single quotes/apostrophes in "%s"', (input, expected) => {
      expect(niceQuotes(input, MLA)).toBe(expected)
    })
  })

  describe("plural possessive apostrophes", () => {
    it.each([
      // Unmatched trailing s' → MLA
      ["the models' behavior", `the models${MODIFIER_LETTER_APOSTROPHE} behavior`],
      ["Bayes' rule", `Bayes${MODIFIER_LETTER_APOSTROPHE} rule`],
      ["Thomas' gaze", `Thomas${MODIFIER_LETTER_APOSTROPHE} gaze`],
      ["dogs' and cats' toys", `dogs${MODIFIER_LETTER_APOSTROPHE} and cats${MODIFIER_LETTER_APOSTROPHE} toys`],
      ["belongs to the dogs'", `belongs to the dogs${MODIFIER_LETTER_APOSTROPHE}`],
      ["the DOGS' owner", `the DOGS${MODIFIER_LETTER_APOSTROPHE} owner`],
      ["Prisoners' Dilemma", `Prisoners${MODIFIER_LETTER_APOSTROPHE} Dilemma`],
      // Mixed possessive + quoted phrase
      ["dogs' and 'hello'", `dogs${MODIFIER_LETTER_APOSTROPHE} and ${LEFT_SINGLE_QUOTE}hello${RIGHT_SINGLE_QUOTE}`],
      ["'cats' and dogs'", `${LEFT_SINGLE_QUOTE}cats${RIGHT_SINGLE_QUOTE} and dogs${MODIFIER_LETTER_APOSTROPHE}`],
      // Matched closing quote after s stays RSQ
      ["'yes'", `${LEFT_SINGLE_QUOTE}yes${RIGHT_SINGLE_QUOTE}`],
      ["'dogs'", `${LEFT_SINGLE_QUOTE}dogs${RIGHT_SINGLE_QUOTE}`],
      ["'he tells' stories", `${LEFT_SINGLE_QUOTE}he tells${RIGHT_SINGLE_QUOTE} stories`],
    ])('handles plural possessive: "%s"', (input, expected) => {
      expect(niceQuotes(input, MLA)).toBe(expected)
    })

    it.each([
      `the dogs${MODIFIER_LETTER_APOSTROPHE} owner`,
      `Bayes${MODIFIER_LETTER_APOSTROPHE} rule`,
      `dogs${MODIFIER_LETTER_APOSTROPHE} and ${LEFT_SINGLE_QUOTE}cats${RIGHT_SINGLE_QUOTE}`,
    ])('plural possessive is idempotent: "%s"', (input) => {
      expect(niceQuotes(input, MLA)).toBe(input)
      expect(niceQuotes(niceQuotes(input, MLA), MLA)).toBe(input)
    })

    it("stress: many possessives interleaved with quotes", () => {
      // 50 alternating possessives and quoted phrases
      const pairs = Array.from({ length: 50 }, (_, i) =>
        i % 2 === 0 ? `dogs'` : `'yes'`
      )
      const input = pairs.join(" ")
      const result = niceQuotes(input, MLA)
      // Every dogs' → MLA, every 'yes' → LSQ+yes+RSQ
      const expectedParts = Array.from({ length: 50 }, (_, i) =>
        i % 2 === 0
          ? `dogs${MODIFIER_LETTER_APOSTROPHE}`
          : `${LEFT_SINGLE_QUOTE}yes${RIGHT_SINGLE_QUOTE}`
      )
      expect(result).toBe(expectedParts.join(" "))
      expect(niceQuotes(result, MLA)).toBe(result)
    })

    it("stress: 200 consecutive plural possessives", () => {
      const words = ["dogs'", "cats'", "Bayes'", "Thomas'", "PLAYERS'"]
      const input = Array.from({ length: 200 }, (_, i) => words[i % words.length]).join(" ")
      const start = performance.now()
      const result = niceQuotes(input, MLA)
      expect(performance.now() - start).toBeLessThan(1000)
      // All should be MLA (no LSQ to pair with)
      expect(result).not.toContain(RIGHT_SINGLE_QUOTE)
      expect(result).not.toContain("'")
      expect(niceQuotes(result, MLA)).toBe(result)
    })

    it("stress: deeply nested alternating pattern", () => {
      // Pattern: 'a' dogs' 'b' cats' 'c' ...
      const possessives = ["dogs", "cats", "items", "players", "Bayes"]
      const input = Array.from({ length: 30 }, (_, i) =>
        i % 2 === 0 ? `'word${i}'` : `${possessives[i % possessives.length]}'`
      ).join(" ")
      const result = niceQuotes(input, MLA)
      // Quoted words get LSQ/RSQ, possessives get MLA
      for (let i = 0; i < 30; i++) {
        if (i % 2 === 0) {
          expect(result).toContain(`${LEFT_SINGLE_QUOTE}word${i}${RIGHT_SINGLE_QUOTE}`)
        } else {
          expect(result).toContain(`${possessives[i % possessives.length]}${MODIFIER_LETTER_APOSTROPHE}`)
        }
      }
      expect(niceQuotes(result, MLA)).toBe(result)
    })
  })

  describe("leading apostrophe contractions", () => {
    it.each([
      ["'twas the night", `${MODIFIER_LETTER_APOSTROPHE}twas the night`],
      ["'tis the season", `${MODIFIER_LETTER_APOSTROPHE}tis the season`],
      ["'Twas brillig", `${MODIFIER_LETTER_APOSTROPHE}Twas brillig`],
      ["'Tis but a scratch", `${MODIFIER_LETTER_APOSTROPHE}Tis but a scratch`],
      // Decade abbreviations
      ["the '90s", `the ${MODIFIER_LETTER_APOSTROPHE}90s`],
      ["in '99", `in ${MODIFIER_LETTER_APOSTROPHE}99`],
      ["the '00s", `the ${MODIFIER_LETTER_APOSTROPHE}00s`],
      // Additional leading contractions
      ["'cause", `${MODIFIER_LETTER_APOSTROPHE}cause`],
      ["'twas the night, 'twas indeed", `${MODIFIER_LETTER_APOSTROPHE}twas the night, ${MODIFIER_LETTER_APOSTROPHE}twas indeed`],
      [`"'twas the night"`, `${LEFT_DOUBLE_QUOTE}${MODIFIER_LETTER_APOSTROPHE}twas the night${RIGHT_DOUBLE_QUOTE}`],
    ])('handles leading apostrophe in "%s"', (input, expected) => {
      expect(niceQuotes(input, MLA)).toBe(expected)
    })

    it("multiple decades in one sentence", () => {
      expect(niceQuotes("The '60s, '70s, and '80s were different.", MLA)).toBe(
        `The ${MODIFIER_LETTER_APOSTROPHE}60s, ${MODIFIER_LETTER_APOSTROPHE}70s, and ${MODIFIER_LETTER_APOSTROPHE}80s were different.`
      )
    })
  })

  describe("'n' abbreviation edge cases", () => {
    it.each([
      ["uppercase 'N' is not abbreviated", "Rock 'N' Roll", `Rock ${LEFT_SINGLE_QUOTE}N${RIGHT_SINGLE_QUOTE} Roll`],
      ["multiple 'n' abbreviations", "Rock 'n' Roll and fish 'n' chips", `Rock ${MODIFIER_LETTER_APOSTROPHE}n${MODIFIER_LETTER_APOSTROPHE} Roll and fish ${MODIFIER_LETTER_APOSTROPHE}n${MODIFIER_LETTER_APOSTROPHE} chips`],
      ["digit neighbors (\\w includes digits)", "1 'n' 2", `1 ${MODIFIER_LETTER_APOSTROPHE}n${MODIFIER_LETTER_APOSTROPHE} 2`],
      ["known false positive: quoted letter", "the letter 'n' is common", `the letter ${MODIFIER_LETTER_APOSTROPHE}n${MODIFIER_LETTER_APOSTROPHE} is common`],
    ])('%s', (_label, input, expected) => {
      expect(niceQuotes(input, MLA)).toBe(expected)
    })

    it.each([
      ["start of string (no preceding word)", "'n' Roll", `${LEFT_SINGLE_QUOTE}n${RIGHT_SINGLE_QUOTE} Roll`],
      ["end of string (no following word)", "Rock 'n'", `Rock ${LEFT_SINGLE_QUOTE}n${RIGHT_SINGLE_QUOTE}`],
      ["punctuation precedes first apostrophe", "said, 'n' is good", `said, ${LEFT_SINGLE_QUOTE}n${RIGHT_SINGLE_QUOTE} is good`],
      ["newline replaces space", "Rock 'n'\nRoll", `Rock ${LEFT_SINGLE_QUOTE}n${RIGHT_SINGLE_QUOTE}\nRoll`],
    ])('does not produce MLA-n-MLA: %s', (_label, input, expected) => {
      expect(niceQuotes(input, MLA)).toBe(expected)
    })
  })

  describe("nested quotes", () => {
    it("handles double quotes containing single quotes", () => {
      const input = '"She said \'hello\'"'
      const expected = `${LEFT_DOUBLE_QUOTE}She said ${LEFT_SINGLE_QUOTE}hello${RIGHT_SINGLE_QUOTE}${RIGHT_DOUBLE_QUOTE}`
      expect(niceQuotes(input)).toBe(expected)
    })
  })

  // Tests derived from competitor libraries and typography guidelines
  describe("competitor-derived edge cases", () => {
    // From smartquotes.js: Unicode text within quotes
    it.each([
      ['"Águila"', `${LEFT_DOUBLE_QUOTE}Águila${RIGHT_DOUBLE_QUOTE}`],
      ['"café"', `${LEFT_DOUBLE_QUOTE}café${RIGHT_DOUBLE_QUOTE}`],
      ['"naïve"', `${LEFT_DOUBLE_QUOTE}naïve${RIGHT_DOUBLE_QUOTE}`],
      ['"日本語"', `${LEFT_DOUBLE_QUOTE}日本語${RIGHT_DOUBLE_QUOTE}`],
      ['"שלום"', `${LEFT_DOUBLE_QUOTE}שלום${RIGHT_DOUBLE_QUOTE}`],
    ])('handles Unicode text in quotes: "%s"', (input, expected) => {
      expect(niceQuotes(input)).toBe(expected)
    })

    // From retext-smartypants: quotes after em dashes
    it.each([
      [`He said${EM_DASH}"Hello"`, `He said${EM_DASH}${LEFT_DOUBLE_QUOTE}Hello${RIGHT_DOUBLE_QUOTE}`],
      [`word${EM_DASH}"quoted"${EM_DASH}word`, `word${EM_DASH}${LEFT_DOUBLE_QUOTE}quoted${RIGHT_DOUBLE_QUOTE}${EM_DASH}word`],
    ])('handles quotes adjacent to em dashes: "%s"', (input, expected) => {
      expect(niceQuotes(input)).toBe(expected)
    })

    it("handles single quote after em-dash", () => {
      const input = `${EM_DASH}'Hi'${EM_DASH}`
      const result = niceQuotes(input)
      expect(result).toBe(`${EM_DASH}${LEFT_SINGLE_QUOTE}Hi${RIGHT_SINGLE_QUOTE}${EM_DASH}`)
    })

    // From Standard Ebooks: M'Donald-style names (archaic patterns)
    it.each([
      [`"M'Lord"`, `${LEFT_DOUBLE_QUOTE}M${MODIFIER_LETTER_APOSTROPHE}Lord${RIGHT_DOUBLE_QUOTE}`],
      [`O'Brien's idea`, `O${MODIFIER_LETTER_APOSTROPHE}Brien${MODIFIER_LETTER_APOSTROPHE}s idea`],
      [`The O'Connors`, `The O${MODIFIER_LETTER_APOSTROPHE}Connors`],
    ])('handles Irish/Scottish name apostrophes: "%s"', (input, expected) => {
      expect(niceQuotes(input, MLA)).toBe(expected)
    })

    // From smartquotes.js: complex nested quotes
    it.each([
      ['"Alfred \'bertrand\' cees"', `${LEFT_DOUBLE_QUOTE}Alfred ${LEFT_SINGLE_QUOTE}bertrand${RIGHT_SINGLE_QUOTE} cees${RIGHT_DOUBLE_QUOTE}`],
      ["'Alfred \"bertrand\" cees'", `${LEFT_SINGLE_QUOTE}Alfred ${LEFT_DOUBLE_QUOTE}bertrand${RIGHT_DOUBLE_QUOTE} cees${RIGHT_SINGLE_QUOTE}`],
    ])('handles complex nested quotes: "%s"', (input, expected) => {
      expect(niceQuotes(input)).toBe(expected)
    })

    // From retext-smartypants: quotes with ellipsis
    it.each([
      [`"${ELLIPSIS}"`, `${LEFT_DOUBLE_QUOTE}${ELLIPSIS}${RIGHT_DOUBLE_QUOTE}`],
      [`"Wait${ELLIPSIS}"`, `${LEFT_DOUBLE_QUOTE}Wait${ELLIPSIS}${RIGHT_DOUBLE_QUOTE}`],
      [`'${ELLIPSIS}'`, `${LEFT_SINGLE_QUOTE}${ELLIPSIS}${RIGHT_SINGLE_QUOTE}`],
    ])('handles quotes with ellipsis: "%s"', (input, expected) => {
      expect(niceQuotes(input)).toBe(expected)
    })
  })

  describe("complex real-world patterns", () => {
    it.each([
      // Dialogue with attribution
      ['"I can\'t," she said.', `${LEFT_DOUBLE_QUOTE}I can${MODIFIER_LETTER_APOSTROPHE}t,${RIGHT_DOUBLE_QUOTE} she said.`],
      ['"Why not?" he asked.', `${LEFT_DOUBLE_QUOTE}Why not?${RIGHT_DOUBLE_QUOTE} he asked.`],
      // Multiple contractions
      ["I'm can't won't don't", `I${MODIFIER_LETTER_APOSTROPHE}m can${MODIFIER_LETTER_APOSTROPHE}t won${MODIFIER_LETTER_APOSTROPHE}t don${MODIFIER_LETTER_APOSTROPHE}t`],
      // Quote within parentheses
      ['("test")', `(${LEFT_DOUBLE_QUOTE}test${RIGHT_DOUBLE_QUOTE})`],
      ["('test')", `(${LEFT_SINGLE_QUOTE}test${RIGHT_SINGLE_QUOTE})`],
      // Quote with slash separator
      ['"option1"/"option2"', `${LEFT_DOUBLE_QUOTE}option1${RIGHT_DOUBLE_QUOTE}/${LEFT_DOUBLE_QUOTE}option2${RIGHT_DOUBLE_QUOTE}`],
    ])('handles complex pattern: "%s"', (input, expected) => {
      expect(niceQuotes(input, MLA)).toBe(expected)
    })

    it("handles multi-line dialogue", () => {
      const input = '"Hello,"\n"World"'
      const expected = `${LEFT_DOUBLE_QUOTE}Hello,${RIGHT_DOUBLE_QUOTE}\n${LEFT_DOUBLE_QUOTE}World${RIGHT_DOUBLE_QUOTE}`
      expect(niceQuotes(input)).toBe(expected)
    })
  })

  describe("idempotency", () => {
    it.each([
      `${LEFT_DOUBLE_QUOTE}already curly${RIGHT_DOUBLE_QUOTE}`,
      `${LEFT_SINGLE_QUOTE}single curly${RIGHT_SINGLE_QUOTE}`,
      `I${MODIFIER_LETTER_APOSTROPHE}m already converted`,
      `${LEFT_DOUBLE_QUOTE}nested ${LEFT_SINGLE_QUOTE}quotes${RIGHT_SINGLE_QUOTE}${RIGHT_DOUBLE_QUOTE}`,
      // French contractions
      `l${MODIFIER_LETTER_APOSTROPHE}homme d${MODIFIER_LETTER_APOSTROPHE}accord`,
      // Uppercase
      `O${MODIFIER_LETTER_APOSTROPHE}NEILL`,
      `CAN${MODIFIER_LETTER_APOSTROPHE}T`,
      // Plural possessive
      `the dogs${MODIFIER_LETTER_APOSTROPHE} owner`,
      // Mixed quote types
      `${LEFT_SINGLE_QUOTE}hello${RIGHT_SINGLE_QUOTE} ${LEFT_DOUBLE_QUOTE}world${RIGHT_DOUBLE_QUOTE}`,
    ])('is idempotent for: "%s"', (input) => {
      expect(niceQuotes(input, MLA)).toBe(input)
      expect(niceQuotes(niceQuotes(input, MLA), MLA)).toBe(input)
    })
  })

  describe("with separator character", () => {
    const sep = DEFAULT_SEPARATOR
    it.each([
      [`"Hello${sep} world"`, `${LEFT_DOUBLE_QUOTE}Hello${sep} world${RIGHT_DOUBLE_QUOTE}`, "preserves separator positions"],
      [`don${sep}'t`, `don${sep}${MODIFIER_LETTER_APOSTROPHE}t`, "contractions across separator"],
      [`"test${sep}"`, `${LEFT_DOUBLE_QUOTE}test${sep}${RIGHT_DOUBLE_QUOTE}`, "quotes at separator boundaries"],
      // Possessive across separator
      [`dog${sep}'s bone`, `dog${sep}${MODIFIER_LETTER_APOSTROPHE}s bone`, "possessive across separator"],
      // Separator between apostrophe and s
      [`the dog'${sep}s bone`, `the dog${MODIFIER_LETTER_APOSTROPHE}${sep}s bone`, "separator between apostrophe and s"],
      // Opening after separator
      [`${sep}'hello'`, `${sep}${LEFT_SINGLE_QUOTE}hello${RIGHT_SINGLE_QUOTE}`, "opening quote after separator"],
      // Closing after separator
      [`'hello${sep}'`, `${LEFT_SINGLE_QUOTE}hello${sep}${RIGHT_SINGLE_QUOTE}`, "closing quote after separator"],
    ])("%s → %s (%s)", (input, expected) => {
      expect(niceQuotes(input, { separator: sep, ...MLA })).toBe(expected)
    })

    it("plural possessive across separator", () => {
      const input = `dogs${sep}' food`
      const expected = `dogs${sep}${MODIFIER_LETTER_APOSTROPHE} food`
      expect(niceQuotes(input, { separator: sep, ...MLA })).toBe(expected)
      expect(niceQuotes(expected, { separator: sep, ...MLA })).toBe(expected)
    })

    it("'n' with separators around word boundaries", () => {
      const input = `Rock${sep} 'n' ${sep}Roll`
      const expected = `Rock${sep} ${MODIFIER_LETTER_APOSTROPHE}n${MODIFIER_LETTER_APOSTROPHE} ${sep}Roll`
      expect(niceQuotes(input, { separator: sep, ...MLA })).toBe(expected)
      expect(niceQuotes(expected, { separator: sep, ...MLA })).toBe(expected)
    })
  })

  describe("unbalanced and edge quotes", () => {
    it.each([
      ['"unclosed', `${LEFT_DOUBLE_QUOTE}unclosed`],
      ["unclosed'", `unclosed${RIGHT_SINGLE_QUOTE}`],
      ['""', `${LEFT_DOUBLE_QUOTE}${RIGHT_DOUBLE_QUOTE}`],
      // Minimal inputs
      ["", ""],
      [" ", " "],
      ["'", `${MODIFIER_LETTER_APOSTROPHE}`],
      ["'a", `${MODIFIER_LETTER_APOSTROPHE}a`],
      ["a'", `a${RIGHT_SINGLE_QUOTE}`],
    ])('handles edge quote pattern: "%s"', (input, expected) => {
      expect(niceQuotes(input, MLA)).toBe(expected)
    })
  })

  describe("quotes after various punctuation", () => {
    it.each([
      ['text; "quote"', `text; ${LEFT_DOUBLE_QUOTE}quote${RIGHT_DOUBLE_QUOTE}`],
      ['title: "quote"', `title: ${LEFT_DOUBLE_QUOTE}quote${RIGHT_DOUBLE_QUOTE}`],
      ['what? "quote"', `what? ${LEFT_DOUBLE_QUOTE}quote${RIGHT_DOUBLE_QUOTE}`],
      ['wow! "quote"', `wow! ${LEFT_DOUBLE_QUOTE}quote${RIGHT_DOUBLE_QUOTE}`],
      ['[note] "quote"', `[note] ${LEFT_DOUBLE_QUOTE}quote${RIGHT_DOUBLE_QUOTE}`],
      ['{code} "quote"', `{code} ${LEFT_DOUBLE_QUOTE}quote${RIGHT_DOUBLE_QUOTE}`],
    ])('handles quotes after punctuation: "%s"', (input, expected) => {
      expect(niceQuotes(input)).toBe(expected)
    })
  })

  describe("consecutive contractions", () => {
    it.each([
      ["I'd've", `I${MODIFIER_LETTER_APOSTROPHE}d${MODIFIER_LETTER_APOSTROPHE}ve`],
      ["y'all'd've", `y${MODIFIER_LETTER_APOSTROPHE}all${MODIFIER_LETTER_APOSTROPHE}d${MODIFIER_LETTER_APOSTROPHE}ve`],
      ["wouldn't've", `wouldn${MODIFIER_LETTER_APOSTROPHE}t${MODIFIER_LETTER_APOSTROPHE}ve`],
      ["couldn't've", `couldn${MODIFIER_LETTER_APOSTROPHE}t${MODIFIER_LETTER_APOSTROPHE}ve`],
    ])('handles double contraction: "%s"', (input, expected) => {
      expect(niceQuotes(input, MLA)).toBe(expected)
    })
  })

  describe("quotes with special Unicode", () => {
    it.each([
      ['"Hello! 😊"', `${LEFT_DOUBLE_QUOTE}Hello! 😊${RIGHT_DOUBLE_QUOTE}`],
      ['"你好"', `${LEFT_DOUBLE_QUOTE}你好${RIGHT_DOUBLE_QUOTE}`],
      ['"こんにちは"', `${LEFT_DOUBLE_QUOTE}こんにちは${RIGHT_DOUBLE_QUOTE}`],
      ['"مرحبا"', `${LEFT_DOUBLE_QUOTE}مرحبا${RIGHT_DOUBLE_QUOTE}`],
      ['"Привет"', `${LEFT_DOUBLE_QUOTE}Привет${RIGHT_DOUBLE_QUOTE}`],
    ])('handles Unicode content in quotes: "%s"', (input, expected) => {
      expect(niceQuotes(input)).toBe(expected)
    })
  })

  describe("multiline quotes", () => {
    it.each([
      ['"Hello\nWorld"', `${LEFT_DOUBLE_QUOTE}Hello\nWorld${RIGHT_DOUBLE_QUOTE}`],
      ['"A"\n"B"', `${LEFT_DOUBLE_QUOTE}A${RIGHT_DOUBLE_QUOTE}\n${LEFT_DOUBLE_QUOTE}B${RIGHT_DOUBLE_QUOTE}`],
      // Contractions across lines
      ["I can't\nbelieve it's\nnot butter", `I can${MODIFIER_LETTER_APOSTROPHE}t\nbelieve it${MODIFIER_LETTER_APOSTROPHE}s\nnot butter`],
      // Newline stops lookahead → MLA (not LSQ) since no closing quote visible
      ["'hello\nworld'", `${MODIFIER_LETTER_APOSTROPHE}hello\nworld${RIGHT_SINGLE_QUOTE}`],
    ])('handles multiline: "%s"', (input, expected) => {
      expect(niceQuotes(input, MLA)).toBe(expected)
    })
  })

  describe("split dialogue", () => {
    it.each([
      [
        '"Yes," he said, "absolutely."',
        `${LEFT_DOUBLE_QUOTE}Yes,${RIGHT_DOUBLE_QUOTE} he said, ${LEFT_DOUBLE_QUOTE}absolutely.${RIGHT_DOUBLE_QUOTE}`,
      ],
      [
        '"No," she replied, "I disagree."',
        `${LEFT_DOUBLE_QUOTE}No,${RIGHT_DOUBLE_QUOTE} she replied, ${LEFT_DOUBLE_QUOTE}I disagree.${RIGHT_DOUBLE_QUOTE}`,
      ],
    ])('handles split dialogue: "%s"', (input, expected) => {
      expect(niceQuotes(input)).toBe(expected)
    })
  })

  describe("punctuationStyle option", () => {
    // Reusable test strings
    const periodOutsideDouble = `${LEFT_DOUBLE_QUOTE}Hello${RIGHT_DOUBLE_QUOTE}.`
    const periodInsideDouble = `${LEFT_DOUBLE_QUOTE}Hello.${RIGHT_DOUBLE_QUOTE}`
    const periodOutsideSingle = `${LEFT_SINGLE_QUOTE}Hello${RIGHT_SINGLE_QUOTE}.`
    const periodInsideSingle = `${LEFT_SINGLE_QUOTE}Hello.${RIGHT_SINGLE_QUOTE}`
    const commaOutsideDouble = `${LEFT_DOUBLE_QUOTE}test${RIGHT_DOUBLE_QUOTE},`
    const commaInsideDouble = `${LEFT_DOUBLE_QUOTE}test,${RIGHT_DOUBLE_QUOTE}`

    describe('when "american" (default)', () => {
      it.each([
        [periodOutsideDouble, periodInsideDouble, "period outside double quotes"],
        [periodOutsideSingle, periodInsideSingle, "period outside single quotes"],
        [commaOutsideDouble, commaInsideDouble, "comma outside double quotes"],
      ])("moves punctuation inside: %s", (input, expected) => {
        expect(niceQuotes(input, { punctuationStyle: "american" })).toBe(expected)
      })

      it("is the default behavior", () => {
        expect(niceQuotes(periodOutsideDouble)).toBe(periodInsideDouble)
      })
    })

    describe('when "british"', () => {
      it.each([
        [periodInsideDouble, periodOutsideDouble, "period inside double quotes"],
        [periodInsideSingle, periodOutsideSingle, "period inside single quotes"],
        [commaInsideDouble, commaOutsideDouble, "comma inside double quotes"],
      ])("moves punctuation outside: %s", (input, expected) => {
        expect(niceQuotes(input, { punctuationStyle: "british" })).toBe(expected)
      })

      it("still converts straight quotes to smart quotes", () => {
        expect(niceQuotes('"Hello."', { punctuationStyle: "british" })).toBe(periodOutsideDouble)
      })
    })

    describe("MLA excluded from punctuation movement", () => {
      it.each([
        // American: MLA period/comma stay put (MLA is not a quote character)
        [`the dog${MODIFIER_LETTER_APOSTROPHE}s.`, `the dog${MODIFIER_LETTER_APOSTROPHE}s.`, "american"],
        [`Brien${MODIFIER_LETTER_APOSTROPHE}s,`, `Brien${MODIFIER_LETTER_APOSTROPHE}s,`, "american"],
        // American: RSQ period/comma move inside (contrast)
        [`${LEFT_SINGLE_QUOTE}hello${RIGHT_SINGLE_QUOTE}.`, `${LEFT_SINGLE_QUOTE}hello.${RIGHT_SINGLE_QUOTE}`, "american"],
        // British: RSQ period moves outside (contrast)
        [`${LEFT_SINGLE_QUOTE}hello.${RIGHT_SINGLE_QUOTE}`, `${LEFT_SINGLE_QUOTE}hello${RIGHT_SINGLE_QUOTE}.`, "british"],
      ])('%s → %s (%s)', (input, expected, style) => {
        expect(niceQuotes(input, { punctuationStyle: style as "american" | "british", ...MLA })).toBe(expected)
      })
    })

    describe('when "none"', () => {
      it.each([
        [periodOutsideDouble],
        [periodInsideDouble],
        [commaOutsideDouble],
        ['"Hello".'],
        ["It's a test"],
      ])("skips all quote transforms: %s", (input) => {
        expect(niceQuotes(input, { punctuationStyle: "none" })).toBe(input)
      })
    })
  })

  describe("empty and whitespace quotes", () => {
    it.each([
      ["''", `${LEFT_SINGLE_QUOTE}${RIGHT_SINGLE_QUOTE}`, "empty single"],
      ['""', `${LEFT_DOUBLE_QUOTE}${RIGHT_DOUBLE_QUOTE}`, "empty double"],
      ["' '", `${LEFT_SINGLE_QUOTE} ${RIGHT_SINGLE_QUOTE}`, "whitespace single"],
      ['" "', `${LEFT_DOUBLE_QUOTE} ${RIGHT_DOUBLE_QUOTE}`, "whitespace double"],
    ])("converts %s → %s (%s)", (input, expected) => {
      expect(niceQuotes(input)).toBe(expected)
    })
  })

  describe("useModifierLetterApostrophe option", () => {
    const RSQ = RIGHT_SINGLE_QUOTE

    it.each([
      ["contractions", "don't", `don${RSQ}t`],
      ["possessives", "the dog's bone", `the dog${RSQ}s bone`],
      ["plural possessives", "the dogs' owner", `the dogs${RSQ} owner`],
      ["O'Brien-style names", "O'Brien's idea", `O${RSQ}Brien${RSQ}s idea`],
      ["'n' abbreviation", "Rock 'n' Roll", `Rock ${RSQ}n${RSQ} Roll`],
      ["decades", "the '90s", `the ${RSQ}90s`],
      ["leading apostrophes", "'twas", `${RSQ}twas`],
    ])('defaults to RSQ for %s', (_label, input, expected) => {
      expect(niceQuotes(input)).toBe(expected)
    })

    it("uses MLA when option is true", () => {
      expect(niceQuotes("don't", MLA)).toBe(`don${MODIFIER_LETTER_APOSTROPHE}t`)
    })

    it("RSQ output is idempotent", () => {
      const inputs = ["don't", "the dog's", "the dogs'", "O'Brien", "Rock 'n' Roll", "'90s"]
      for (const input of inputs) {
        const first = niceQuotes(input)
        expect(niceQuotes(first)).toBe(first)
      }
    })

    it("MLA output is idempotent", () => {
      const inputs = ["don't", "the dog's", "the dogs'", "O'Brien", "Rock 'n' Roll", "'90s"]
      for (const input of inputs) {
        const first = niceQuotes(input, MLA)
        expect(niceQuotes(first, MLA)).toBe(first)
      }
    })

    describe("RSQ→MLA normalization (external system input)", () => {
      it.each([
        [`don${RIGHT_SINGLE_QUOTE}t`, `don${MODIFIER_LETTER_APOSTROPHE}t`],
        [`I${RIGHT_SINGLE_QUOTE}m`, `I${MODIFIER_LETTER_APOSTROPHE}m`],
        [`they${RIGHT_SINGLE_QUOTE}re`, `they${MODIFIER_LETTER_APOSTROPHE}re`],
        [`O${RIGHT_SINGLE_QUOTE}Brien`, `O${MODIFIER_LETTER_APOSTROPHE}Brien`],
        [`the dog${RIGHT_SINGLE_QUOTE}s bone`, `the dog${MODIFIER_LETTER_APOSTROPHE}s bone`],
        // Mixed MLA + RSQ in same text
        [`I${MODIFIER_LETTER_APOSTROPHE}m fine and you${RIGHT_SINGLE_QUOTE}re great`, `I${MODIFIER_LETTER_APOSTROPHE}m fine and you${MODIFIER_LETTER_APOSTROPHE}re great`],
      ])('normalizes RSQ contraction "%s"', (input, expected) => {
        expect(niceQuotes(input, MLA)).toBe(expected)
      })

      it("does NOT normalize RSQ when it is a closing quote", () => {
        const input = `${LEFT_SINGLE_QUOTE}hello${RIGHT_SINGLE_QUOTE} world`
        expect(niceQuotes(input, MLA)).toBe(input)
      })

      it.each([
        [`[test]${RIGHT_SINGLE_QUOTE}`, "bracket"],
        [`${LEFT_SINGLE_QUOTE}Hello.${RIGHT_SINGLE_QUOTE}`, "period"],
        [`${LEFT_SINGLE_QUOTE}Really?${RIGHT_SINGLE_QUOTE}`, "question mark"],
        [`${LEFT_SINGLE_QUOTE}Stop!${RIGHT_SINGLE_QUOTE}`, "exclamation"],
        [`${LEFT_SINGLE_QUOTE}test,${RIGHT_SINGLE_QUOTE} more`, "comma"],
      ])("preserves closing RSQ preceded by non-word char (%s)", (input) => {
        expect(niceQuotes(input, MLA)).toBe(input)
      })

      it("normalizes RSQ possessive with digit prefix", () => {
        expect(niceQuotes(`GPT-2${RIGHT_SINGLE_QUOTE}s`, MLA)).toBe(`GPT-2${MODIFIER_LETTER_APOSTROPHE}s`)
      })

      it("normalizes RSQ plural possessive to MLA", () => {
        expect(niceQuotes(`the dogs${RIGHT_SINGLE_QUOTE} owner`, MLA)).toBe(`the dogs${MODIFIER_LETTER_APOSTROPHE} owner`)
      })

      it("preserves RSQ plural possessive when matched with LSQ", () => {
        const input = `${LEFT_SINGLE_QUOTE}dogs${RIGHT_SINGLE_QUOTE} and more`
        expect(niceQuotes(input, MLA)).toBe(input)
      })
    })
  })

  describe("pathological inputs", () => {
    it("handles 1500-char input without closing quote", () => {
      const input = `'${"a".repeat(1500)}`
      const start = performance.now()
      const result = niceQuotes(input, MLA)
      expect(performance.now() - start).toBeLessThan(1000)
      expect(niceQuotes(result, MLA)).toBe(result)
    })

    it("handles 16 rapid apostrophes", () => {
      const input = "a'b'c'd'e'f'g'h'i'j'k'l'm'n'o'p"
      const expected = `a${MODIFIER_LETTER_APOSTROPHE}b${MODIFIER_LETTER_APOSTROPHE}c${MODIFIER_LETTER_APOSTROPHE}d${MODIFIER_LETTER_APOSTROPHE}e${MODIFIER_LETTER_APOSTROPHE}f${MODIFIER_LETTER_APOSTROPHE}g${MODIFIER_LETTER_APOSTROPHE}h${MODIFIER_LETTER_APOSTROPHE}i${MODIFIER_LETTER_APOSTROPHE}j${MODIFIER_LETTER_APOSTROPHE}k${MODIFIER_LETTER_APOSTROPHE}l${MODIFIER_LETTER_APOSTROPHE}m${MODIFIER_LETTER_APOSTROPHE}n${MODIFIER_LETTER_APOSTROPHE}o${MODIFIER_LETTER_APOSTROPHE}p`
      const start = performance.now()
      const result = niceQuotes(input, MLA)
      expect(performance.now() - start).toBeLessThan(1000)
      expect(result).toBe(expected)
      expect(niceQuotes(result, MLA)).toBe(result)
    })

    it("handles 500-char word + possessive", () => {
      const input = `${"a".repeat(500)}'s thing`
      expect(niceQuotes(input, MLA)).toBe(`${"a".repeat(500)}${MODIFIER_LETTER_APOSTROPHE}s thing`)
    })
  })

})
