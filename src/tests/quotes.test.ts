import { niceQuotes } from "../quotes.js"
import { UNICODE_SYMBOLS } from "../constants.js"

const {
  LEFT_DOUBLE_QUOTE,
  RIGHT_DOUBLE_QUOTE,
  LEFT_SINGLE_QUOTE,
  RIGHT_SINGLE_QUOTE,
  MODIFIER_LETTER_APOSTROPHE,
  EM_DASH,
  ELLIPSIS,
} = UNICODE_SYMBOLS

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
      expect(niceQuotes(input)).toBe(expected)
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
    ])('should handle single quotes/apostrophes in "%s"', (input, expected) => {
      expect(niceQuotes(input)).toBe(expected)
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
    ])('handles leading apostrophe in "%s"', (input, expected) => {
      expect(niceQuotes(input)).toBe(expected)
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
      expect(niceQuotes(input)).toBe(expected)
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
      expect(niceQuotes(input)).toBe(expected)
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
    ])('is idempotent for: "%s"', (input) => {
      expect(niceQuotes(input)).toBe(input)
      expect(niceQuotes(niceQuotes(input))).toBe(input)
    })
  })

  describe("with separator character", () => {
    const sep = "\uE000"
    it.each([
      [`"Hello${sep} world"`, `${LEFT_DOUBLE_QUOTE}Hello${sep} world${RIGHT_DOUBLE_QUOTE}`, "preserves separator positions"],
      [`don${sep}'t`, `don${sep}${MODIFIER_LETTER_APOSTROPHE}t`, "contractions across separator"],
      [`"test${sep}"`, `${LEFT_DOUBLE_QUOTE}test${sep}${RIGHT_DOUBLE_QUOTE}`, "quotes at separator boundaries"],
    ])("%s → %s (%s)", (input, expected) => {
      expect(niceQuotes(input, { separator: sep })).toBe(expected)
    })
  })

  describe("unbalanced and edge quotes", () => {
    it.each([
      ['"unclosed', `${LEFT_DOUBLE_QUOTE}unclosed`],
      ["unclosed'", `unclosed${RIGHT_SINGLE_QUOTE}`],
      ['""', `${LEFT_DOUBLE_QUOTE}${RIGHT_DOUBLE_QUOTE}`],
    ])('handles edge quote pattern: "%s"', (input, expected) => {
      expect(niceQuotes(input)).toBe(expected)
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
      expect(niceQuotes(input)).toBe(expected)
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
    ])('handles multiline: "%s"', (input, expected) => {
      expect(niceQuotes(input)).toBe(expected)
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

})
