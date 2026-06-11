import { dashWordJoiner, enDashDateRange, enDashNumberRange, hyphenReplace, minusReplace, numberRangeDisallowedPrefixes } from "../dashes.js"
import { UNICODE_SYMBOLS } from "../constants.js"
import { SEP as DEFAULT_SEPARATOR, viewTransform } from "./test-helpers.js"

const {
  LEFT_DOUBLE_QUOTE,
  RIGHT_DOUBLE_QUOTE,
  LEFT_SINGLE_QUOTE,
  RIGHT_SINGLE_QUOTE,
  EM_DASH,
  EN_DASH,
  MINUS,
  ELLIPSIS,
} = UNICODE_SYMBOLS

describe("hyphenReplace", () => {
  describe("em dashes from surrounded hyphens", () => {
    it.each([
      ["This is a - hyphen.", `This is a${EM_DASH}hyphen.`],
      // Parenthetical dash before a digit (not math subtraction)
      ["Safari) - 9 combinations", `Safari)${EM_DASH}9 combinations`],
      [`This is an ${EM_DASH} em dash.`, `This is an${EM_DASH}em dash.`],
      [`word ${EM_DASH} word`, `word${EM_DASH}word`],
      ["word ---", `word${EM_DASH}`],
      [`word${EM_DASH} word`, `word${EM_DASH}word`],
      [`word ${EM_DASH}word`, `word${EM_DASH}word`],
      ['"I love dogs." - Me', `"I love dogs."${EM_DASH}Me`],
      ["- Me", `${EM_DASH} Me`],
      ["-- Me", `${EM_DASH} Me`],
      ["Hi-- what do you think?", `Hi${EM_DASH}what do you think?`],
      [
        `${EM_DASH}such behaviors still have to be retrodicted`,
        `${EM_DASH}such behaviors still have to be retrodicted`,
      ],
      [`emphasis" ${EM_DASH}`, `emphasis"${EM_DASH}`],
      ["- Intro text\n then more", `${EM_DASH} Intro text\n then more`],
      [
        `reward${ELLIPSIS} ${EM_DASH} [Model-based RL, Desires, Brains, Wireheading](https://www.alignmentforum.org/posts/K5ikTdaNymfWXQHFb/model-based-rl-desires-brains-wireheading#Self_aware_desires_1__wireheading)`,
        `reward${ELLIPSIS}${EM_DASH}[Model-based RL, Desires, Brains, Wireheading](https://www.alignmentforum.org/posts/K5ikTdaNymfWXQHFb/model-based-rl-desires-brains-wireheading#Self_aware_desires_1__wireheading)`,
      ],
      ["a browser- or OS-specific fashion", "a browser- or OS-specific fashion"],
      // Suspended/hanging hyphens: prefix shared with a preceding compound
      ["Yes-men and -women", "Yes-men and -women"],
      ["the over- and -supply of widgets", "the over- and -supply of widgets"],
      ["since--as you know", `since${EM_DASH}as you know`],
      // Arrow patterns should be preserved (not converted to em-dashes)
      ["word -> arrow", "word -> arrow"],
      ["word --> arrow", "word --> arrow"],
      ["-> start", "-> start"],
      ["--> start", "--> start"],
    ])('should replace hyphens in "%s"', (input, expected) => {
      expect(hyphenReplace(input)).toBe(expected)
    })
  })

  describe("multiple dashes within words", () => {
    it.each([
      ["Since--as you know", `Since${EM_DASH}as you know`, "double dashes"],
      ["word---another", `word${EM_DASH}another`, "triple dashes"],
    ])("%s → %s (%s)", (input, expected) => {
      expect(hyphenReplace(input)).toBe(expected)
    })
  })

  describe("dashes at start of line", () => {
    it.each([
      ["- Author", `${EM_DASH} Author`],
      ["--- Author attribution", `${EM_DASH} Author attribution`],
      ["Quote\n- Author", `Quote\n${EM_DASH} Author`],
    ])('handles "%s"', (input, expected) => {
      expect(hyphenReplace(input)).toBe(expected)
    })
  })

  describe("spaces around em dashes", () => {
    it.each([
      [`word ${EM_DASH} another`, `word${EM_DASH}another`],
      [`word${EM_DASH}  another`, `word${EM_DASH}another`],
      [`word  ${EM_DASH}another`, `word${EM_DASH}another`],
    ])('removes spaces in "%s"', (input, expected) => {
      expect(hyphenReplace(input)).toBe(expected)
    })
  })

  describe("quote-to-quote em dash (Chicago: no spaces)", () => {
    it.each([
      // Chicago style: no spaces around em-dashes, even between quotes
      `"Hello."${EM_DASH}"World"`,
      `'Hi.'${EM_DASH}'There'`,
      `${LEFT_DOUBLE_QUOTE}Hello.${RIGHT_DOUBLE_QUOTE}${EM_DASH}${LEFT_DOUBLE_QUOTE}World${RIGHT_DOUBLE_QUOTE}`,
      `${LEFT_SINGLE_QUOTE}Hi.${RIGHT_SINGLE_QUOTE}${EM_DASH}${LEFT_SINGLE_QUOTE}There${RIGHT_SINGLE_QUOTE}`,
    ])('preserves unspaced em-dash in "%s"', (input) => {
      expect(hyphenReplace(input)).toBe(input)
    })
  })

  describe("em dashes at start of line", () => {
    it.each([
      [`${EM_DASH}Start of line`, `${EM_DASH} Start of line`],
      [`Line 1\n${EM_DASH}Line 2`, `Line 1\n${EM_DASH} Line 2`],
      [`${EM_DASH} Already correct`, `${EM_DASH} Already correct`],
    ])('handles "%s"', (input, expected) => {
      expect(hyphenReplace(input)).toBe(expected)
    })
  })

  describe("number ranges to en dashes", () => {
    it.each([
      ["Pages 1-5", `Pages 1${EN_DASH}5`],
      ["5--10", `5${EN_DASH}10`],
      ["2000-2020", `2000${EN_DASH}2020`],
      ["2018-2021. Then 1-3", `2018${EN_DASH}2021. Then 1${EN_DASH}3`],
      ["p.10-15", `p.10${EN_DASH}15`],
    ])('converts "%s"', (input, expected) => {
      expect(hyphenReplace(input)).toBe(expected)
    })
  })

  describe("month ranges to en dashes", () => {
    it.each([
      ["Jan-Mar", `Jan${EN_DASH}Mar`],
      ["Mar - Nov", `Mar${EN_DASH}Nov`],
      ["January - March", `January${EN_DASH}March`],
      ["October 2012 - December 2014", `October 2012${EN_DASH}December 2014`],
      ["Jan 2000 - Feb", `Jan 2000${EN_DASH}Feb`],
      ["March - April 2025", `March${EN_DASH}April 2025`],
    ])('converts "%s"', (input, expected) => {
      expect(hyphenReplace(input)).toBe(expected)
    })
  })

  describe("tilde preservation", () => {
    it.each([
      ["word ~ word", "word ~ word"],
      ["word ~~ word", "word ~~ word"],
      ["the ~5% range", "the ~5% range"],
      ["~approximately", "~approximately"],
    ])('preserves tilde in "%s"', (input) => {
      expect(hyphenReplace(input)).toBe(input)
    })
  })

  describe("with separator character", () => {
    const sep = "\uE000"
    it.each([
      [`word${sep} - ${sep}another`, `word${sep}${EM_DASH}${sep}another`, "em dash context"],
      [`pages 1${sep}-${sep}5`, `pages 1${sep}${EN_DASH}${sep}5`, "number ranges"],
      // American em-dash (Chicago) consumes spaces around the dash within the current text node,
      // but trailing space after a separator is the leading space of the next text node — preserve it.
      [`text ${EM_DASH} ${sep} more text`, `text${EM_DASH}${sep} more text`, "preserves space after separator for em-dash"],
      [`text - ${sep} more`, `text${EM_DASH}${sep} more`, "preserves space after separator with hyphen"],
      // Separator + trailing space + word: trailing space belongs to next text node
      [`a - ${sep} w`, `a${EM_DASH}${sep} w`, "preserves leading space of next text node"],
      // Separator immediately followed by punctuation: no trailing space to preserve
      [`a - ${sep}, w`, `a${EM_DASH}${sep}, w`, "no trailing space when punctuation follows separator"],
      // No separator: surrounding spaces are consumed (Chicago style, unchanged)
      ["a - w", `a${EM_DASH}w`, "no separator: spaces consumed"],
      // Separator-only before dash (no space between word and separator): e.g., link text followed by dash
      [`word${sep}${EN_DASH} rest`, `word${sep}${EM_DASH}rest`, "en-dash after separator without preceding space"],
      [`word${sep}- rest`, `word${sep}${EM_DASH}rest`, "hyphen after separator without preceding space"],
      // Spaced hyphen with separator after: "word -<sep> another" is a parenthetical dash, not suspended.
      // Trailing space after the separator is the next text node's leading space and is preserved.
      [`word -${sep} another`, `word${EM_DASH}${sep} another`, "hyphen before separator-space is parenthetical"],
      // Suspended hyphen across separator boundary: hyphen attached to word through separator
      [`and -${sep}women`, `and -${sep}women`, "suspended hyphen across separator preserved"],
      // Arrow shape `-...>` split across separators must not em-dash; the
      // lookahead sees through the separator(s) before `>`.
      [`foo -${sep}> bar`, `foo -${sep}> bar`, "single dash before sep+> preserved for arrow"],
      [`foo --${sep}> bar`, `foo --${sep}> bar`, "double dash before sep+> preserved for arrow"],
      [`foo -${sep}-${sep}> bar`, `foo -${sep}-${sep}> bar`, "dash, sep, dash, sep, > preserved for arrow"],
    ])("%s → %s (%s)", (input, expected) => {
      expect(viewTransform(hyphenReplace, input, sep)).toBe(expected)
    })

    it.each([
      // British en-dash (spaced) preserves trailing space after separator
      [`text - ${sep} more`, `text ${EN_DASH} ${sep} more`, "preserves space after separator for en-dash"],
      [`word${sep}${EN_DASH} rest`, `word${sep} ${EN_DASH} rest`, "en-dash after separator british style"],
    ])("%s → %s (%s)", (input, expected) => {
      expect(viewTransform((view) => hyphenReplace(view, { dashStyle: "british" }), input, sep)).toBe(expected)
    })
  })
})

describe("enDashNumberRange", () => {
  it.each([
    ["1-2", `1${EN_DASH}2`],
    ["10-20", `10${EN_DASH}20`],
    ["100-200", `100${EN_DASH}200`],
    ["1000-2000", `1000${EN_DASH}2000`],
    ["1,000-2,000", `1,000${EN_DASH}2,000`],
    ["1.000-2.000", `1.000${EN_DASH}2.000`],
    ["1-2 and 3-4", `1${EN_DASH}2 and 3${EN_DASH}4`],
    ["from 5-10 to 15-20", `from 5${EN_DASH}10 to 15${EN_DASH}20`],
    ["1-2-3", "1-2-3"], // Multi-segment patterns are not ranges
    ["a-b", "a-b"], // Don't replace non-numeric ranges
    ["1a-2b", "1a-2b"], // Don't replace if not purely numeric
    ["a1-2b", "a1-2b"], // Don't replace if not purely numeric
    ["p. 206-207)", `p. 206${EN_DASH}207)`],
    ["Qwen1.5-1.8", "Qwen1.5-1.8"], // Don't replace if there's a decimal
    ["$100-$200", `$100${EN_DASH}$200`],
    ["$1.50-$3.50", `$1.50${EN_DASH}$3.50`],
    ["$1-3", `$1${EN_DASH}3`],
    ["5--10", `5${EN_DASH}10`], // Double dash as range separator
    ["5---10", `5${EN_DASH}10`], // Triple dash as range separator
    ["$100--$200", `$100${EN_DASH}$200`], // Double dash with currency
    ["1 - 2", "1 - 2"], // Spaced ranges should not change
    // Multiplier suffixes
    ["1-10x", `1${EN_DASH}10x`], // lowercase x for multiplier
    ["1-10K", `1${EN_DASH}10K`], // uppercase K for kilo
    ["1-10M", `1${EN_DASH}10M`], // uppercase M for million
    ["1-10B", `1${EN_DASH}10B`], // uppercase B for billion
    ["1-10T", `1${EN_DASH}10T`], // uppercase T for trillion
    ["1-10X", "1-10X"], // uppercase X should NOT match (only lowercase)
    ["1-10k", "1-10k"], // lowercase k should NOT match (only uppercase)
  ])('should convert "%s" to "%s"', (input, expected) => {
    expect(enDashNumberRange(input)).toBe(expected)
  })

  describe("disallowed prefix characters", () => {
    it.each(numberRangeDisallowedPrefixes)(
      'should not convert number ranges preceded by "%s"',
      (prefix) => {
        const input = `foo${prefix}2-7B`
        expect(enDashNumberRange(input)).toBe(input)
      }
    )

    it.each([
      // Model names with version numbers should NOT be converted
      ["Llama-2-7B-chat", "Llama-2-7B-chat"],
      ["Llama-2-7B", "Llama-2-7B"],
      ["Llama-3-8B-Instruct", "Llama-3-8B-Instruct"],
      ["ReLU-2-4", "ReLU-2-4"],
    ])('should not convert "%s"', (input, expected) => {
      expect(enDashNumberRange(input)).toBe(expected)
    })
  })

  describe("marker robustness", () => {
    // Tests that separators don't create false word boundaries
    const sep = DEFAULT_SEPARATOR

    it.each([
      // [description, input, expected]
      ["false leading boundary", `x${sep}1-10`, `x${sep}1-10`], // "x1-10" - should NOT convert
      ["multiplier suffix with separator", `1-10${sep}x`, `1${EN_DASH}10${sep}x`], // range of multipliers - should convert
      ["false trailing boundary (non-suffix)", `1-10${sep}y`, `1-10${sep}y`], // "y" is not a valid suffix
      ["valid boundaries with space", `pages ${sep}1-10${sep} total`, `pages ${sep}1${EN_DASH}10${sep} total`], // should convert
    ])("handles %s", (_desc, input, expected) => {
      expect(viewTransform(enDashNumberRange, input, sep)).toBe(expected)
    })
  })
})

describe("enDashDateRange", () => {
  describe("american style (default, unspaced)", () => {
    it.each([
      ["January-March", `January${EN_DASH}March`],
      ["Jan-Mar", `Jan${EN_DASH}Mar`],
      ["February-April 2024", `February${EN_DASH}April 2024`],
      ["May-June", `May${EN_DASH}June`],
      ["Sep-Nov", `Sep${EN_DASH}Nov`],
      ["December-January", `December${EN_DASH}January`],
      ["October 2012 - December 2014", `October 2012${EN_DASH}December 2014`],
      ["Oct 2012 - Dec 2014", `Oct 2012${EN_DASH}Dec 2014`],
      ["January 2020 - March 2020", `January 2020${EN_DASH}March 2020`],
      ["May 2019-June 2020", `May 2019${EN_DASH}June 2020`],
      ["Jan 2000 - Feb", `Jan 2000${EN_DASH}Feb`],
      ["March - April 2025", `March${EN_DASH}April 2025`],
    ])('should convert "%s" to "%s"', (input, expected) => {
      expect(enDashDateRange(input)).toBe(expected)
    })
  })

  describe("british style (spaced)", () => {
    it.each([
      ["January-March", `January ${EN_DASH} March`],
      ["Jan-Mar", `Jan ${EN_DASH} Mar`],
      ["October 2012 - December 2014", `October 2012 ${EN_DASH} December 2014`],
      ["Oct 2012 - Dec 2014", `Oct 2012 ${EN_DASH} Dec 2014`],
      ["May 2019-June 2020", `May 2019 ${EN_DASH} June 2020`],
    ])('should convert "%s" to "%s"', (input, expected) => {
      expect(enDashDateRange(input, { dashStyle: "british" })).toBe(expected)
    })
  })

  describe("none style (skip entirely)", () => {
    it.each([
      ["January-March"],
      ["January - March"],
      ["October 2012 - December 2014"],
      ["Oct 2012-Dec 2014"],
    ])("skips all date range transforms: %s", (input) => {
      expect(enDashDateRange(input, { dashStyle: "none" })).toBe(input)
    })
  })

  it("should not convert non-month words", () => {
    expect(enDashDateRange("hello-world")).toBe("hello-world")
    expect(enDashDateRange("Mon-Fri")).toBe("Mon-Fri") // Days, not months
  })

  describe("marker robustness", () => {
    // Tests that separators don't create false word boundaries
    const sep = DEFAULT_SEPARATOR

    it.each([
      // [description, input, expected]
      ["false leading boundary", `x${sep}January-March`, `x${sep}January-March`], // "xJanuary-March" - should NOT convert
      ["false trailing boundary", `January-March${sep}x`, `January-March${sep}x`], // "January-Marchx" - should NOT convert
      ["valid boundaries with space", `from ${sep}January-March${sep} period`, `from ${sep}January${EN_DASH}March${sep} period`], // should convert
    ])("handles %s", (_desc, input, expected) => {
      expect(viewTransform(enDashDateRange, input, sep)).toBe(expected)
    })
  })
})

describe("minusReplace", () => {
  it.each([
    ["-5", `${MINUS}5`],
    ["-5.5", `${MINUS}5.5`],
    ["(-5)", `(${MINUS}5)`],
    ["The value is -10", `The value is ${MINUS}10`],
    [" -3", ` ${MINUS}3`],
    ['"-5"', `"${MINUS}5"`],
    ["'-5'", `'${MINUS}5'`],
    // Curly quotes (pre-transformed text)
    [`${LEFT_DOUBLE_QUOTE}-5${RIGHT_DOUBLE_QUOTE}`, `${LEFT_DOUBLE_QUOTE}${MINUS}5${RIGHT_DOUBLE_QUOTE}`],
    [`${LEFT_SINGLE_QUOTE}-5${RIGHT_SINGLE_QUOTE}`, `${LEFT_SINGLE_QUOTE}${MINUS}5${RIGHT_SINGLE_QUOTE}`],
    // Spaced math subtraction (digit before)
    ["5 - 3", `5 ${MINUS} 3`],
    ["10 - 5 = 5", `10 ${MINUS} 5 = 5`],
    ["(100 - 50)", `(100 ${MINUS} 50)`],
  ])('should convert "%s" to use minus sign', (input, expected) => {
    expect(minusReplace(input)).toBe(expected)
  })

  it("should not convert hyphens in other contexts", () => {
    expect(minusReplace("well-known")).toBe("well-known")
    expect(minusReplace("re-read")).toBe("re-read")
  })

  it("should not convert spaced hyphens without digit before (parenthetical)", () => {
    // These should be left for em-dash conversion, not minus
    expect(minusReplace("Safari) - 9 combinations")).toBe("Safari) - 9 combinations")
    expect(minusReplace("word - 5")).toBe("word - 5")
  })

  it("should handle subtraction of negative numbers", () => {
    expect(minusReplace("5 - -3")).toBe(`5 ${MINUS} ${MINUS}3`)
  })
})

describe("enDashNumberRange preserves", () => {
  it.each([
    "555-123-4567", "+1-555-123-4567", "(555)-123-4567", // phones
    "978-3-16-148410-0", "0-13-468599-1", // ISBNs
    "2024-01-15", "2024-01", "1999-12", // ISO dates
    "192-168-1-1", "12-34-5678", // IPs
    `5${UNICODE_SYMBOLS.MULTIPLICATION}10-20`, `2${UNICODE_SYMBOLS.MULTIPLICATION}5-10`, // × (from "x") before a range start: a multiplication operand, not a range
    `${UNICODE_SYMBOLS.PLUS_MINUS}1-5`, // ± (from "+/-") before a range start: not a range
  ])('"%s"', (input) => {
    expect(enDashNumberRange(input)).toBe(input)
  })
})

describe("negative number ranges", () => {
  it.each([
    ["-5--2", `${MINUS}5${EN_DASH}${MINUS}2`],
    ["-5-5", `${MINUS}5${EN_DASH}5`],
    ["-5-3-7", `${MINUS}5-3-7`], // multi-segment preserved
  ])('converts "%s" to "%s"', (input, expected) => {
    expect(enDashNumberRange(minusReplace(input))).toBe(expected)
  })
})

// Tests derived from competitor libraries and typography guidelines
describe("competitor-derived edge cases", () => {
  // From retext-smartypants: oldschool dash handling
  describe("double/triple dash patterns", () => {
    it.each([
      // From retext-smartypants oldschool mode
      ["word--word", `word${EM_DASH}word`],
      ["word---word", `word${EM_DASH}word`],
      ["start-- end", `start${EM_DASH}end`],
    ])('converts "%s"', (input, expected) => {
      expect(hyphenReplace(input)).toBe(expected)
    })

    it("handles double dash after quote", () => {
      const input = '"Hello"-- she said'
      const result = hyphenReplace(input)
      expect(result).toBe(`"Hello"${EM_DASH}she said`)
    })
  })

  // Phone numbers and ISBNs - documented via enDashNumberRange tests above
  // These multi-segment patterns are correctly preserved
  describe("multi-segment pattern preservation", () => {
    it.each([
      // Already tested in enDashNumberRange preserves section
      "555-123-4567", // phone
      "978-3-16-148410-0", // ISBN
      "2024-01-15", // ISO date
    ])('preserves multi-segment pattern: "%s"', (input) => {
      expect(enDashNumberRange(input)).toBe(input)
    })
  })

  // From tipograph: dash after quoted text
  describe("dashes with quotes", () => {
    it.each([
      // Em dash after closing quote with space
      [`${RIGHT_DOUBLE_QUOTE} - author`, `${RIGHT_DOUBLE_QUOTE}${EM_DASH}author`],
      [`${RIGHT_SINGLE_QUOTE} -- source`, `${RIGHT_SINGLE_QUOTE}${EM_DASH}source`],
    ])('handles spaced dashes after quotes: "%s"', (input, expected) => {
      expect(hyphenReplace(input)).toBe(expected)
    })

    it("handles unspaced double dash between quotes", () => {
      const input = '"first"--"second"'
      const result = hyphenReplace(input)
      expect(result).toBe(`"first"${EM_DASH}"second"`)
    })
  })
})

describe("complex real-world patterns", () => {
  describe("year ranges", () => {
    it.each([
      ["2020-2024", `2020${EN_DASH}2024`],
      ["the 1990-1999 decade", `the 1990${EN_DASH}1999 decade`],
      ["(2010-2015)", `(2010${EN_DASH}2015)`],
    ])('handles year range: "%s"', (input, expected) => {
      expect(hyphenReplace(input)).toBe(expected)
    })
  })

  describe("score ranges", () => {
    it.each([
      ["won 3-2", `won 3${EN_DASH}2`],
      ["final score 21-17", `final score 21${EN_DASH}17`],
      ["led 14-7", `led 14${EN_DASH}7`],
    ])('handles score: "%s"', (input, expected) => {
      expect(hyphenReplace(input)).toBe(expected)
    })
  })

  describe("price ranges", () => {
    it.each([
      // Dollar sign is supported
      ["$10-$20", `$10${EN_DASH}$20`],
    ])('handles USD price range: "%s"', (input, expected) => {
      expect(hyphenReplace(input)).toBe(expected)
    })

    it.each([
      ["€5-€10", `€5${EN_DASH}€10`],
      ["£100-£200", `£100${EN_DASH}£200`],
      ["¥1000-¥2000", `¥1000${EN_DASH}¥2000`],
    ])('handles non-USD currency range: "%s"', (input, expected) => {
      expect(hyphenReplace(input)).toBe(expected)
    })
  })

  describe("mixed content", () => {
    it("handles multiple em dash transformations", () => {
      const input = 'The meeting -- scheduled for today -- covers important topics.'
      const expected = `The meeting${EM_DASH}scheduled for today${EM_DASH}covers important topics.`
      expect(hyphenReplace(input)).toBe(expected)
    })

    it("handles page ranges", () => {
      const input = 'See pages 10-20 for details.'
      const expected = `See pages 10${EN_DASH}20 for details.`
      expect(hyphenReplace(input)).toBe(expected)
    })

    it("handles em dash before URL-like text", () => {
      const input = 'Visit -- https://example.com'
      const expected = `Visit${EM_DASH}https://example.com`
      expect(hyphenReplace(input)).toBe(expected)
    })

    it.each([
      ["2-3pm", `2${EN_DASH}3pm`],
      ["9-10am", `9${EN_DASH}10am`],
      ["2-3PM", `2${EN_DASH}3PM`],
      ["9-10AM", `9${EN_DASH}10AM`],
    ])('handles time range: "%s"', (input, expected) => {
      expect(hyphenReplace(input)).toBe(expected)
    })
  })
})

describe("idempotency", () => {
  it.each([
    `word${EM_DASH}word`,
    `1${EN_DASH}5`,
    `${MINUS}10`,
    `January${EN_DASH}March`,
  ])('is idempotent for: "%s"', (input) => {
    expect(hyphenReplace(input)).toBe(input)
    expect(hyphenReplace(hyphenReplace(input))).toBe(input)
  })
})

describe("dashStyle option", () => {
  describe('when "american" (default)', () => {
    it.each([
      ["word - word", `word${EM_DASH}word`],
      ["word -- word", `word${EM_DASH}word`],
      ["since--as you know", `since${EM_DASH}as you know`],
    ])("uses unspaced em dash: %s", (input, expected) => {
      expect(hyphenReplace(input, { dashStyle: "american" })).toBe(expected)
    })

    it("is the default behavior", () => {
      expect(hyphenReplace("word - word")).toBe(`word${EM_DASH}word`)
    })
  })

  describe('when "british" (Oxford style)', () => {
    it.each([
      ["word - word", `word ${EN_DASH} word`],
      ["word -- word", `word ${EN_DASH} word`],
      ["since--as you know", `since ${EN_DASH} as you know`],
    ])("uses spaced en dash: %s", (input, expected) => {
      expect(hyphenReplace(input, { dashStyle: "british" })).toBe(expected)
    })

    it("still converts number ranges to en dashes", () => {
      expect(hyphenReplace("pages 1-5", { dashStyle: "british" })).toBe(`pages 1${EN_DASH}5`)
    })

    it("converts existing em-dashes to spaced en-dashes", () => {
      // Oxford style uses spaced en-dashes, so em-dashes get converted
      expect(hyphenReplace(`word ${EM_DASH} word`, { dashStyle: "british" })).toBe(`word ${EN_DASH} word`)
    })

    it("converts date ranges with spaced en dash", () => {
      expect(hyphenReplace("January-March", { dashStyle: "british" })).toBe(`January ${EN_DASH} March`)
    })
  })

  describe('when "none"', () => {
    it.each([
      ["word - word"],
      ["word -- word"],
      ["pages 1-5"],
      ["-5"],
      ["January-March"],
    ])("skips all dash transforms: %s", (input) => {
      expect(hyphenReplace(input, { dashStyle: "none" })).toBe(input)
    })
  })

  describe("style conversion consistency", () => {
    const testCases = [
      "word - word",
      "word -- word",
      "since--as you know",
      "Hello. -- Author",
      `word${EM_DASH}word`,
      `"Quote."${EM_DASH}Author`,
    ]

    it.each(testCases)(
      "American → British equals direct British: %s",
      (input) => {
        const directBritish = hyphenReplace(input, { dashStyle: "british" })
        const viaAmerican = hyphenReplace(
          hyphenReplace(input, { dashStyle: "american" }),
          { dashStyle: "british" }
        )
        expect(viaAmerican).toBe(directBritish)
      }
    )

    it.each(testCases)(
      "British → American equals direct American: %s",
      (input) => {
        const directAmerican = hyphenReplace(input, { dashStyle: "american" })
        const viaBritish = hyphenReplace(
          hyphenReplace(input, { dashStyle: "british" }),
          { dashStyle: "american" }
        )
        expect(viaBritish).toBe(directAmerican)
      }
    )
  })
})

describe("technical patterns preservation", () => {
  it.each([
    ["https://example-site.com", "https://example-site.com"],
    ["http://sub-domain.example.com/path-to-file", "http://sub-domain.example.com/path-to-file"],
    ["user-name@example.com", "user-name@example.com"],
    ["550e8400-e29b-41d4-a716-446655440000", "550e8400-e29b-41d4-a716-446655440000"],
    ["commit 1a2b3c4d-5e6f", "commit 1a2b3c4d-5e6f"],
  ])('preserves technical pattern: "%s"', (input, expected) => {
    expect(hyphenReplace(input)).toBe(expected)
  })
})

describe("scientific notation", () => {
  it.each([
    ["1e-10", "1e-10"],
    ["5.5e-3", "5.5e-3"],
    ["1E-5", "1E-5"],
    ["3.14e+10", "3.14e+10"],
  ])('preserves scientific notation: "%s"', (input, expected) => {
    expect(hyphenReplace(input)).toBe(expected)
  })
})

describe("version numbers", () => {
  it.each([
    ["v1.0.0-beta", "v1.0.0-beta"],
    ["1.0.0-rc.1", "1.0.0-rc.1"],
    ["2.0.0-alpha.1", "2.0.0-alpha.1"],
    ["1.0.0-beta.1-hotfix", "1.0.0-beta.1-hotfix"],
  ])('preserves version number: "%s"', (input, expected) => {
    expect(hyphenReplace(input)).toBe(expected)
  })
})

describe("edge number ranges", () => {
  it.each([
    ["1000000-2000000", `1000000${EN_DASH}2000000`],
    ["1.5-2.5", `1.5${EN_DASH}2.5`],
    ["pp. 100-200", `pp. 100${EN_DASH}200`],
    ["I-V", "I-V"],
    ["i-v", "i-v"],
    ["Chapter I-III", "Chapter I-III"],
  ])('handles number range edge case: "%s"', (input, expected) => {
    expect(hyphenReplace(input)).toBe(expected)
  })
})

describe("social media patterns", () => {
  it.each([
    ["#my-hashtag", "#my-hashtag"],
    ["@user-name", "@user-name"],
  ])('preserves social pattern: "%s"', (input, expected) => {
    expect(hyphenReplace(input)).toBe(expected)
  })
})

describe("mixed dash types", () => {
  it.each([
    [`pages 1${EN_DASH}5`, `pages 1${EN_DASH}5`],
    [`word${EM_DASH}word`, `word${EM_DASH}word`],
    [`pages 1-5 and word${EM_DASH}word`, `pages 1${EN_DASH}5 and word${EM_DASH}word`],
  ])('handles mixed dashes: "%s"', (input, expected) => {
    expect(hyphenReplace(input)).toBe(expected)
  })
})

describe("negative temperatures", () => {
  it.each([
    ["-5 to -10", `${MINUS}5 to ${MINUS}10`],
    ["High: 5, Low: -10", `High: 5, Low: ${MINUS}10`],
  ])('handles negative temperatures: "%s"', (input, expected) => {
    expect(hyphenReplace(input)).toBe(expected)
  })
})

describe("phone number preservation", () => {
  it.each([
    // Preserved phone patterns
    ["555-123-4567", "555-123-4567", "full phone with area code"],
    ["(555) 123-4567", "(555) 123-4567", "area code in parens"],
    ["1-800", "1-800", "toll-free prefix 800"],
    ["1-888", "1-888", "toll-free prefix 888"],
    ["1-877", "1-877", "toll-free prefix 877"],
    ["1-866", "1-866", "toll-free prefix 866"],
    ["1-855", "1-855", "toll-free prefix 855"],
    ["1-844", "1-844", "toll-free prefix 844"],
    ["1-833", "1-833", "toll-free prefix 833"],
    ["Call 1-800-...", "Call 1-800-...", "truncated toll-free"],
    ["1-800-555-1234", "1-800-555-1234", "full toll-free"],
    ["1-888-555-1234", "1-888-555-1234", "full toll-free 888"],
    ["+1-800-555-1234", "+1-800-555-1234", "international US"],
    ["+44-20-7946-0958", "+44-20-7946-0958", "international UK"],
    ["+1 (800) 555-1234", "+1 (800) 555-1234", "international with parens"],
    // International short patterns (country code + city code, no further segments)
    ["+44-20", "+44-20", "UK country + city code"],
    ["+49-30", "+49-30", "German country + city code"],
    ["+33-1", "+33-1", "French country + city code"],
    ["+61-2", "+61-2", "Australian country + city code"],
    ["+91-22", "+91-22", "Indian country + city code"],
    // Phone-shaped 3+4 bare digits preserve; thousands-grouped form converts
    ["555-1234", "555-1234", "standalone 3+4 looks phone, preserve"],
    ["555-1,234", `555${EN_DASH}1,234`, "3+4 with thousands comma converts"],
    ["555-1.234", `555${EN_DASH}1.234`, "3+4 with thousands period converts"],
    // A currency symbol is not part of the range start (v4's `\b` anchors the
    // start at the digit), so "$100-2000" is the phone-shaped 3+4 and is kept.
    ["$100-2000", "$100-2000", "currency 3+4 stays phone-shaped"],
    ["$100--2000", "$100--2000", "currency 3+4 double dash stays"],
    ["$100-200", `$100${EN_DASH}200`, "currency 3+3 converts"],
    ["1-5", `1${EN_DASH}5`, "simple range"],
    ["1-50", `1${EN_DASH}50`, "range to two digits"],
    ["1-99", `1${EN_DASH}99`, "range to 99"],
    ["1-100", `1${EN_DASH}100`, "range to 100 (not a toll-free prefix)"],
    ["1-200", `1${EN_DASH}200`, "range to 200 (not a toll-free prefix)"],
    ["1-500", `1${EN_DASH}500`, "range to 500 (not a toll-free prefix)"],
    ["1-999", `1${EN_DASH}999`, "range to 999 (not a toll-free prefix)"],
    // 1-8XX codes that aren't real US toll-free prefixes en-dash as ranges
    ["1-850", `1${EN_DASH}850`, "1-850 is not a toll-free prefix"],
    ["1-810", `1${EN_DASH}810`, "1-810 is not a toll-free prefix"],
    ["1-823", `1${EN_DASH}823`, "1-823 is not a toll-free prefix"],
    ["1-899", `1${EN_DASH}899`, "1-899 is not a toll-free prefix"],
    ["2-800", `2${EN_DASH}800`, "non-US country code pattern"],
  ])("%s → %s (%s)", (input, expected) => {
    expect(hyphenReplace(input)).toBe(expected)
  })
})

const sep = DEFAULT_SEPARATOR

describe("minusReplace separator boundary", () => {
  it.each([
    ["genuine negative at element start", `${sep}-5${sep}`, `${sep}${MINUS}5${sep}`],
    ["negative in parens across boundary", `(${sep}-5${sep})`, `(${sep}${MINUS}5${sep})`],
  ])("%s", (_desc, input, expected) => {
    expect(viewTransform(minusReplace, input, sep)).toBe(expected)
  })

  it.each([
    ["no false negative after digit+sep", `2${sep}-3`],
    ["no false negative after letter+sep", `GPT${sep}-3`],
    ["multi-segment 1-2-3 with seps", `1-${sep}2${sep}-3`],
  ])("%s", (_desc, input) => {
    expect(viewTransform(minusReplace, input, sep)).toBe(input)
  })
})

describe("hyphenReplace preserves multi-segment numbers across separators", () => {
  it.each([
    ["1-2-3 across elements", `1-${sep}2${sep}-3`],
    ["model name across elements", `${sep}GPT${sep}-3`],
  ])("%s", (_desc, input) => {
    expect(viewTransform(hyphenReplace, input, sep)).toBe(input)
  })
})

describe("ProseView boundary-tolerance edges", () => {
  // Each v4 `${chr}?` slot tolerates exactly one boundary; two stacked
  // boundaries (an empty fragment) or a boundary at a non-tolerated position
  // blocks the match, matching the sentinel-weave behavior byte-for-byte.
  describe("number range", () => {
    it.each([
      // One boundary at the tolerated `${chr}?` slot (start↔dash) converts.
      ["one boundary before dash", `1${sep}-5`, `1${sep}${EN_DASH}5`],
      ["one boundary after dash", `1-${sep}5`, `1${EN_DASH}${sep}5`],
      // Two stacked boundaries at that slot exceed the one-separator budget.
      ["two stacked boundaries before dash", `1${sep}${sep}-5`, `1${sep}${sep}-5`],
      // A boundary inside the start digits (no slot there) blocks.
      ["boundary inside start digits", `1${sep}0-5`, `1${sep}0-5`],
      // 4+ stacked boundaries push the preceding digit past the word-boundary
      // reach, so the run after the gap becomes the start and converts.
      ["four boundaries split the start", `20${sep}${sep}${sep}${sep}00-2020`, `20${sep}${sep}${sep}${sep}00${EN_DASH}2020`],
      // A boundary inside the end digits truncates it; the trailing word boundary
      // then blocks the (now phone-shaped-free) range.
      ["boundary inside end digits", `2000-202${sep}0`, `2000-202${sep}0`],
      // A separator between a currency symbol and its digit severs the end.
      ["currency severed from end digit", `€${sep}5-€${sep}10`, `€${sep}5-€${sep}10`],
      // A boundary inside the last phone segment defeats multi-segment detection,
      // so the leading pair en-dashes (matching the sentinel-weave behavior).
      ["boundary in last phone segment", `555-123-45${sep}67`, `555${EN_DASH}123-45${sep}67`],
      // A multiplier suffix carries one tolerated `${chr}?` slot at its head.
      ["one boundary before suffix", `1-10${sep}x`, `1${EN_DASH}10${sep}x`],
      // A boundary between `p.` and the digit severs the page prefix; the bare
      // range past the boundary still converts.
      ["boundary after the p. prefix", `p.${sep}5-10`, `p.${sep}5${EN_DASH}10`],
      ["boundary inside am/pm suffix", `2-3p${sep}m`, `2-3p${sep}m`],
    ])("%s", (_desc, input, expected) => {
      expect(viewTransform(enDashNumberRange, input, sep)).toBe(expected)
    })
  })

  describe("negative range", () => {
    it.each([
      ["one boundary at the dash", `${MINUS}5${sep}-2`, `${MINUS}5${sep}${EN_DASH}2`],
      // A boundary inside the negative start digits severs them from the MINUS.
      ["boundary inside start digits", `${MINUS}5${sep}0-3`, `${MINUS}5${sep}0-3`],
      // Multi-segment negatives are preserved (the following resolves non-empty).
      ["multi-segment preserved", `${MINUS}5-3-7`, `${MINUS}5-3-7`],
    ])("%s", (_desc, input, expected) => {
      expect(viewTransform(enDashNumberRange, viewTransform(minusReplace, input, sep), sep)).toBe(expected)
    })
  })

  describe("date range", () => {
    it.each([
      ["one boundary at the dash", `Jan${sep}-Mar`, `Jan${sep}${EN_DASH}Mar`],
      ["boundary inside the start month blocks", `Ja${sep}n-Mar`, `Ja${sep}n-Mar`],
    ])("%s", (_desc, input, expected) => {
      expect(viewTransform(enDashDateRange, input, sep)).toBe(expected)
    })
  })

  describe("minus sign", () => {
    it.each([
      // Two stacked separators put a non-digit/letter before the hyphen, so the
      // separator-led negative (Pattern 2b) fires; one leaves the digit visible.
      ["two boundaries promote to negative", `1${sep}${sep}-5`, `1${sep}${sep}${MINUS}5`],
      ["one boundary keeps the digit context", `1${sep}-5`, `1${sep}-5`],
    ])("%s", (_desc, input, expected) => {
      expect(viewTransform(minusReplace, input, sep)).toBe(expected)
    })
  })

  describe("parenthetical em-dash (american)", () => {
    it.each([
      // The trailing space after a boundary belongs to the next node — kept.
      ["space after boundary is preserved", `a -${sep} b`, `a${EM_DASH}${sep} b`],
      // A separator alone leading the dash run still converts (separator is
      // non-space, satisfying the lookbehind).
      ["separator-led dash converts", `word${sep}- rest`, `word${sep}${EM_DASH}rest`],
    ])("%s", (_desc, input, expected) => {
      expect(viewTransform(hyphenReplace, input, sep)).toBe(expected)
    })
  })

  describe("spaced math subtraction across boundaries", () => {
    it.each([
      // One boundary at `num`'s head (the `${chr}?` slot) is tolerated.
      ["subtraction-of-negative, boundary at num", `5 - -${sep}3`, `5 ${MINUS} ${MINUS}${sep}3`],
      ["spaced subtraction, boundary at num", `5 - ${sep}3`, `5 ${MINUS} ${sep}3`],
      // A boundary at the leading digit (the lookbehind `${chr}?` slot).
      ["spaced subtraction, boundary after digit", `5${sep} - 3`, `5${sep} ${MINUS} 3`],
      // A boundary strictly inside the ` - ` prefix breaks the lookbehind span.
      ["boundary inside the prefix blocks", `5 ${sep}- 3`, `5 ${sep}- 3`],
    ])("%s", (_desc, input, expected) => {
      expect(viewTransform(minusReplace, input, sep)).toBe(expected)
    })
  })

  describe("parenthetical em-dash across boundaries", () => {
    it.each([
      // A boundary inside the leading spaces restarts the spaced match after it.
      ["boundary in leading spaces", `a${sep} - b`, `a${sep}${EM_DASH}b`],
      // A boundary inside a hyphen run truncates it (the run stays ≥2 / single).
      ["boundary truncates trailing dashes", `a--${sep}b`, `a${EM_DASH}${sep}b`],
      ["multiple-dash run, boundary before run", `a${sep}--b`, `a${sep}${EM_DASH}b`],
      // A separator alone leads the dash run (boundary-led pattern).
      ["separator-led run at text start", `${sep}- text`, `${sep}${EM_DASH}text`],
      // The arrow guard tolerates separators around its hyphen run.
      ["spaced dash before an arrow stays", `x - ->`, `x${EM_DASH}->`],
      // Trailing-spaces lookahead is satisfied by end-of-text.
      ["spaced dash at text end", `x -`, `x${EM_DASH}`],
    ])("%s", (_desc, input, expected) => {
      expect(viewTransform(hyphenReplace, input, sep)).toBe(expected)
    })
  })

  describe("british unspaced em-dash across boundaries", () => {
    it.each([
      // One boundary on the sepBefore side of the em-dash is tolerated.
      ["boundary before the em-dash", `word${sep}${EM_DASH}word`, `word${sep} ${EN_DASH} word`],
    ])("%s", (_desc, input, expected) => {
      expect(viewTransform((view) => hyphenReplace(view, { dashStyle: "british" }), input, sep)).toBe(expected)
    })
  })

  describe("line-leading em-dash spacing across boundaries", () => {
    it.each([
      // One boundary at the line-start `${chr}?` slot before the em-dash.
      ["boundary before a line-leading em-dash", `${sep}${EM_DASH}Apple`, `${sep}${EM_DASH} Apple`],
    ])("%s", (_desc, input, expected) => {
      expect(viewTransform(hyphenReplace, input, sep)).toBe(expected)
    })
  })

  describe("negative and multi-segment ranges across boundaries", () => {
    it.each([
      // A boundary inside the end digits truncates the end; the trailing word
      // boundary then blocks the range (matching the sentinel weave).
      ["boundary inside negative end digits", `${MINUS}5-3${sep}0`, `${MINUS}5-3${sep}0`],
      // Four stacked boundaries split a negative start past the word-boundary
      // reach, exposing a later sub-range that converts.
      ["four boundaries expose a sub-range", `${MINUS}5${sep}${sep}${sep}${sep}0-3`, `${MINUS}5${sep}${sep}${sep}${sep}0${EN_DASH}3`],
      // A multiplier suffix reached only after stacked boundaries still converts.
      ["stacked boundaries before suffix", `1-2${sep}${sep}${sep}${sep}${sep}x`, `1${EN_DASH}2${sep}${sep}${sep}${sep}${sep}x`],
    ])("%s", (_desc, input, expected) => {
      expect(viewTransform(enDashNumberRange, input, sep)).toBe(expected)
    })
  })

  describe("interior boundaries inside dash-run matches", () => {
    it.each([
      // A boundary strictly inside the leading-space run of a spaced dash.
      ["interior boundary in leading spaces", `x${sep} - b`, `x${sep}${EM_DASH}b`],
      // A boundary strictly inside a hyphen run that would otherwise pair.
      ["interior boundary splits a dash pair", `a-${sep}-b quote`, `a-${sep}-b quote`],
      ["interior boundary inside a long dash run", `a--${sep}--b`, `a--${sep}--b`],
      // A boundary strictly inside a line-leading dash run.
      ["interior boundary in a line-leading run", `\n-${sep}- x`, `\n-${sep}${EM_DASH}x`],
      // A spaced en/em dash that is wholly an arrow ("–->"): no backtracked dash
      // core escapes the arrow guard, so nothing converts.
      ["spaced en-dash arrow stays", `a ${EN_DASH}->`, `a ${EN_DASH}->`],
    ])("%s", (_desc, input, expected) => {
      expect(viewTransform(hyphenReplace, input, sep)).toBe(expected)
    })

    // British unspaced em-dash with a boundary on the sepAfter side (interior to
    // the `${EM_DASH}(?=[letter])` lookahead span in v4's woven form).
    it("interior boundary after a british em-dash", () => {
      expect(viewTransform((view) => hyphenReplace(view, { dashStyle: "british" }), `word${EM_DASH}${sep}word`, sep)).toBe(
        `word ${EN_DASH} ${sep}word`,
      )
    })

    // A boundary between a line-leading em-dash and its following uppercase
    // breaks v4's contiguous `${EM_DASH}[A-Z0-9]`, so no space is inserted.
    it("interior boundary blocks line-leading em-dash spacing", () => {
      expect(viewTransform(hyphenReplace, `\n${EM_DASH}${sep}Apple`, sep)).toBe(`\n${EM_DASH}${sep}Apple`)
    })

    it.each([
      // A boundary strictly inside a two-space run before a spaced dash.
      ["interior boundary in a two-space run", `a ${sep} - b`, `a ${sep}${EM_DASH}b`],
      // The trailing `(?:${chr} [ ]*)?` consumes one boundary plus its kept
      // post-boundary spaces; the lookahead is then satisfied by the next word.
      ["trailing separator with kept spaces", `a - ${sep} b`, `a${EM_DASH}${sep} b`],
      // The full "---" run is an em-dash candidate whose trailing `\n` fails the
      // `(?=\S|$)` lookahead at the longest length; the run backtracks to a
      // shorter dash core that converts, leaving the final hyphen.
      ["dash run backtracks past a failing trailing lookahead", `a ---\n`, `a${EM_DASH}-\n`],
    ])("%s", (_desc, input, expected) => {
      expect(viewTransform(hyphenReplace, input, sep)).toBe(expected)
    })
  })

  describe("range tail and date-range edge offsets", () => {
    it.each([
      // A boundary exactly at the date-range match end blocks it (the trailing
      // word-boundary lookahead sees the separator, not the woven slot).
      ["boundary at date-range end blocks", `Jan-Mar${sep}x`, `Jan-Mar${sep}x`],
      // An interior boundary (in the start month) plus a boundary at the match
      // end: the match still converts and the end boundary stops the interior
      // scan early.
      ["interior boundary with end boundary converts", `Jan${sep}-Mar${sep}`, `Jan${sep}${EN_DASH}Mar${sep}`],
    ])("%s", (_desc, input, expected) => {
      expect(viewTransform(enDashDateRange, input, sep)).toBe(expected)
    })

    it.each([
      // A trailing letter that is not a valid suffix fails the word-boundary
      // end for every `following` candidate, so the negative range is left.
      ["negative range blocked by trailing letter", `${MINUS}5-3a`, `${MINUS}5-3a`],
      // A valid single-letter suffix (K) does complete the tail and converts.
      ["negative range with K suffix converts", `${MINUS}5-3K`, `${MINUS}5${EN_DASH}3K`],
    ])("%s", (_desc, input, expected) => {
      expect(viewTransform(enDashNumberRange, input, sep)).toBe(expected)
    })
  })

  describe("greedy end backtracks over a trailing decimal", () => {
    // v4's `wbe` rejects an end run that ends on a `.`/digit transition before a
    // suffix letter, backtracking the end to the last all-digit run. A bare `\b`
    // would settle at the `.` and leave the dash unconverted.
    it.each([
      ["decimal then suffix run", `${MINUS}5-5.xK`, `${MINUS}5${EN_DASH}5.xK`],
      ["decimal then single suffix", `${MINUS}5-5.x`, `${MINUS}5${EN_DASH}5.x`],
      ["decimal value with suffix", `${MINUS}5-5.5K`, `${MINUS}5${EN_DASH}5.5K`],
    ])("%s", (_desc, input, expected) => {
      expect(viewTransform(enDashNumberRange, input, sep)).toBe(expected)
    })
  })

  describe("separator-truncated end run in a negative range", () => {
    // The negative end run stops at the first boundary; separators between the
    // first end digit and the rest must not fuse into one clean run.
    it.each([
      // Four+ stacked boundaries push the trailing digits past the wbe's
      // separator reach, so the leading single-digit end converts.
      ["stacked boundaries after the first end digit", `${MINUS}1${sep}-8${sep}${sep}${sep}${sep}${sep}0${sep}0w`, `${MINUS}1${sep}${EN_DASH}8${sep}${sep}${sep}${sep}${sep}0${sep}0w`],
    ])("%s", (_desc, input, expected) => {
      expect(viewTransform(enDashNumberRange, input, sep)).toBe(expected)
    })
  })

  describe("phone area code invalidated by a boundary", () => {
    // A boundary where v4's `rangeStart` would begin (just past a `\d{3}-` area
    // code) invalidates the area-code reading; the digits become the range start.
    it.each([
      ["boundary after the area-code dash", `800-${sep}10-2,000`, `800-${sep}10-2,000`],
      ["area-code reading falls back to range start", `800-${sep}10---2,000`, `800${EN_DASH}${sep}10---2,000`],
    ])("%s", (_desc, input, expected) => {
      expect(viewTransform(enDashNumberRange, input, sep)).toBe(expected)
    })
  })

  describe("direct-negative num truncated by a boundary", () => {
    // v4's Pattern 2/2b `num` (`\d*\.?\d+`) has no separator slot; it stops at the
    // first interior boundary and must still form a number.
    it.each([
      ["boundary strips the mandatory digit", `-.${sep}1`, `-.${sep}1`],
      ["boundary right after the hyphen", `-${sep}5`, `-${sep}5`],
      ["boundary past a valid number converts", `-5${sep}5`, `${MINUS}5${sep}5`],
    ])("%s", (_desc, input, expected) => {
      expect(viewTransform(minusReplace, input, sep)).toBe(expected)
    })
  })

  describe("spaced math subtraction num truncated by a boundary", () => {
    // v4's `num` (`${chr}?\d*\.?\d+`) stops at the first interior boundary; a
    // boundary that strips its mandatory `\d+` breaks the match, but one that
    // leaves a valid number keeps it.
    it.each([
      ["boundary strips the mandatory digit", `5 - .${sep}5`, `5 - .${sep}5`],
      ["boundary leaves a valid num", `5 - 12${sep}5`, `5 ${MINUS} 12${sep}5`],
      ["boundary inside a longer num", `5 - 12${sep}5x`, `5 ${MINUS} 12${sep}5x`],
      // A boundary exactly at the num end stops the num-body walk via its
      // `>= numEnd` exit (vs. a boundary strictly inside num, which truncates).
      ["boundary at the num end", `5 - 3${sep}`, `5 ${MINUS} 3${sep}`],
      ["boundary strictly inside num", `5 - 3${sep}0`, `5 ${MINUS} 3${sep}0`],
    ])("%s", (_desc, input, expected) => {
      expect(viewTransform(minusReplace, input, sep)).toBe(expected)
    })
  })

  // Two stacked separators exceed every single-`${chr}?` weave slot, so each
  // pattern's boundary guard rejects the match (matching the sentinel weave).
  describe("two stacked boundaries block each pattern", () => {
    it.each([
      // Positive range: two boundaries after the dash run.
      ["enDashNumberRange", `1-${sep}${sep}5`, `1-${sep}${sep}5`, "american"],
      // Negative range slots: end head, suffix.
      ["enDashNumberRange", `${MINUS}5-${sep}${sep}3`, `${MINUS}5-${sep}${sep}3`, "american"],
      ["enDashNumberRange", `${MINUS}5-3${sep}${sep}K`, `${MINUS}5-3${sep}${sep}K`, "american"],
      // A `${MINUS}` directly before the negative start blocks (no digit follows).
      ["enDashNumberRange", `${MINUS}-5-3`, `${MINUS}-5-3`, "american"],
      // Spaced subtraction slots.
      ["minusReplace", `5 - -${sep}${sep}3`, `5 - -${sep}${sep}3`, "american"],
      ["minusReplace", `5${sep}${sep} - 3`, `5${sep}${sep} - 3`, "american"],
      ["minusReplace", `5 - ${sep}${sep}3`, `5 - ${sep}${sep}3`, "american"],
      // Spaced dash: two boundaries before the leading spaces / before the dash.
      ["hyphenReplace", `a ${sep}- b`, `a ${sep}- b`, "american"],
      // Multiple-dash run: two boundaries on either edge.
      ["hyphenReplace", `a${sep}${sep}--b`, `a${sep}${sep}--b`, "american"],
      ["hyphenReplace", `a--${sep}${sep}b`, `a--${sep}${sep}b`, "american"],
      // British unspaced em-dash: two boundaries on either side.
      ["hyphenReplace", `word${sep}${sep}${EM_DASH}word`, `word${sep}${sep}${EM_DASH}word`, "british"],
      ["hyphenReplace", `word${EM_DASH}${sep}${sep}word`, `word${EM_DASH}${sep}${sep}word`, "british"],
      // Line-leading em-dash spacing: two boundaries before the em-dash.
      ["hyphenReplace", `${sep}${sep}${EM_DASH}Apple`, `${sep}${sep}${EM_DASH}Apple`, "american"],
    ])("%s blocks: %s", (fn, input, expected, dashStyle) => {
      const run = { enDashNumberRange, minusReplace, hyphenReplace }[fn as "hyphenReplace"]
      expect(viewTransform((view) => run(view, { dashStyle: dashStyle as "american" }), input, sep)).toBe(expected)
    })
  })

  // Stacked separators in following/suffix/arrow slots that still resolve to a
  // converting (or arrow-preserving) match, exercising the boundary-walk paths.
  describe("stacked boundaries inside tails and dash runs", () => {
    it.each([
      // Negative following: two boundaries split the segment, leaving the leading
      // pair to en-dash.
      ["enDashNumberRange", `${MINUS}5-3${sep}${sep}-7`, `${MINUS}5${EN_DASH}3${sep}${sep}-7`, "american"],
      ["enDashNumberRange", `${MINUS}5-3-${sep}${sep}7`, `${MINUS}5${EN_DASH}3-${sep}${sep}7`, "american"],
      // Spaced math num past two boundaries still converts (boundary outside num).
      ["minusReplace", `5 - 12${sep}${sep}3`, `5 ${MINUS} 12${sep}${sep}3`, "american"],
      // Spaced dash with two boundaries in the leading spaces converts after them.
      ["hyphenReplace", `a${sep}${sep} - b`, `a${sep}${sep}${EM_DASH}b`, "american"],
      ["hyphenReplace", `a ${sep}${sep}- b`, `a ${sep}${sep}${EM_DASH}b`, "american"],
      // Arrow guard with two boundaries in / around the hyphen run: the `>` is too
      // far past the slots, so the dash converts.
      ["hyphenReplace", `a -${sep}${sep}->`, `a${EM_DASH}${sep}${sep}->`, "american"],
      ["hyphenReplace", `a - ${sep}${sep}>`, `a${EM_DASH}${sep}${sep}>`, "american"],
      ["hyphenReplace", `a - -${sep}${sep}>`, `a${EM_DASH}-${sep}${sep}>`, "american"],
      // A boundary-led dash run followed by another consumes only the first.
      ["hyphenReplace", `x${sep}- ${sep}- y`, `x${sep}${EM_DASH}${sep}- y`, "american"],
      // Em-dash spacing: spaces directly around the em-dash are removed.
      ["hyphenReplace", `a ${EM_DASH} b`, `a${EM_DASH}b`, "american"],
      ["hyphenReplace", `a${EM_DASH} b`, `a${EM_DASH}b`, "american"],
    ])("%s: %s", (fn, input, expected, dashStyle) => {
      const run = { enDashNumberRange, minusReplace, hyphenReplace }[fn as "hyphenReplace"]
      expect(viewTransform((view) => run(view, { dashStyle: dashStyle as "american" }), input, sep)).toBe(expected)
    })
  })

  // Structural variants of the clean (separator-free) paths the golden corpus
  // does not exercise: am/pm suffixes, currency-led end runs, the parenthesised
  // area code, and em-dash space removal.
  describe("clean structural variants", () => {
    it.each([
      ["am/pm suffix", `2-3am`, `2${EN_DASH}3am`],
      ["pm suffix", `9-10pm`, `9${EN_DASH}10pm`],
      ["uppercase PM suffix", `2-3PM`, `2${EN_DASH}3PM`],
      ["currency-led end run", `5-$10`, `5${EN_DASH}$10`],
      ["currency on both sides", `$5-$10`, `$5${EN_DASH}$10`],
      ["currency end with no digit stays", `5-$x`, `5-$x`],
      // The parenthesised area code is consumed but the phone number is preserved.
      ["parenthesised area code phone", `(555) 123-4567`, `(555) 123-4567`],
      // A non-digit in the parens defeats the area code, so the inner range converts.
      ["broken parens area code converts inner", `(55a) 1-2`, `(55a) 1${EN_DASH}2`],
      // A `\d{3}-` area-code candidate whose head is not all digits falls through.
      ["letter in area-code head", `12a-5`, `12a-5`],
    ])("%s", (_desc, input, expected) => {
      expect(viewTransform(enDashNumberRange, input, sep)).toBe(expected)
    })

    it.each([
      // Em-dash with a space on each side: both spaces are removed.
      ["spaces around em-dash removed", `word ${EM_DASH} word`, `word${EM_DASH}word`],
      // A line-leading spaced hyphen run with two leading spaces converts.
      ["two leading spaces before a dash", `a  - b`, `a${EM_DASH}b`],
      // Two consecutive negatives both convert to the minus sign.
      ["two negatives in a row", `-5 -6`, `${MINUS}5 ${MINUS}6`],
    ])("%s", (_desc, input, expected) => {
      expect(viewTransform(hyphenReplace, input, sep)).toBe(expected)
    })

    it("two consecutive negatives via minusReplace", () => {
      expect(viewTransform(minusReplace, `-5 -6`, sep)).toBe(`${MINUS}5 ${MINUS}6`)
    })

    it.each([
      // The `num` boundary walk reaches a boundary at/after the num end and stops.
      ["boundary right after the negative num", `-5${sep} -`, `${MINUS}5${sep} -`],
      ["negative num then trailing boundary", `-5${sep}`, `${MINUS}5${sep}`],
      // A subtraction whose num is followed by a boundary exits the num-body walk.
      ["double-dash subtraction then boundary", `1--0${sep}`, `1--0${sep}`],
    ])("direct negative num run ends before a boundary: %s", (_desc, input, expected) => {
      expect(viewTransform(minusReplace, input, sep)).toBe(expected)
    })
  })

  // Inputs that flip individual operands of the structural guards (a suffix
  // letter that is not am/pm, an area-code candidate that fails late, a tail
  // segment with no digit, currency/end edges) — the branch halves the golden
  // corpus leaves unevaluated.
  describe("structural guard branch edges", () => {
    it.each([
      // `[ap]` with no following `m`, and an over-long am/pm suffix: both stay.
      ["a-suffix without m", `2-3a`, `2-3a`],
      ["am suffix with trailing letter", `2-3amx`, `2-3amx`],
      ["pm suffix converts", `2-3pm`, `2${EN_DASH}3pm`],
      // `\d{3}` area-code candidate whose 4th char is not `-`.
      ["three digits then space", `123 4-5`, `123 4${EN_DASH}5`],
      ["four-digit start is no area code", `1234-5`, `1234${EN_DASH}5`],
      // `(` then three digits but no closing `)`.
      ["open paren without close", `(123-4`, `(123${EN_DASH}4`],
      ["short paren group", `(12)-3`, `(12)-3`],
      // Negative range whose end run resolves to no digit.
      ["negative double dash then letter", `${MINUS}5--x`, `${MINUS}5--x`],
      ["negative dash then letter", `${MINUS}5-a`, `${MINUS}5-a`],
      // Negative following segment whose digit slot holds a letter.
      ["negative following with letter", `${MINUS}5-3-a`, `${MINUS}5${EN_DASH}3-a`],
      // Currency-led end with no digit / a boundary severing the digit.
      ["currency end with no digit", `5-$`, `5-$`],
      ["currency severed from end digit", `5-$${sep}10`, `5-$${sep}10`],
      // A non-ASCII currency on the end run exercises the currency-end branch.
      ["euro range converts", `€5-€10`, `€5${EN_DASH}€10`],
      // A negative range whose `--neg` end run has no digit (a `(`).
      ["negative neg-dash then non-digit", `${MINUS}5--(.`, `${MINUS}5--(.`],
      // A negative range whose following segment digit slot is non-numeric.
      ["negative following non-digit then currency", `${MINUS}2-5--1€`, `${MINUS}2${EN_DASH}5--1€`],
      // Dash at end-of-string: the end run reads past the end (no currency/digit).
      ["positive dash at end of string", `5-`, `5-`],
      ["negative dash at end of string", `${MINUS}5-`, `${MINUS}5-`],
      // A lone MINUS at end-of-string: the negative scan reads past the end.
      ["lone minus", `${MINUS}`, `${MINUS}`],
      ["minus at end of string", `5${MINUS}`, `5${MINUS}`],
      // A trailing dash with no following digit ends the `following` walk at the end.
      ["negative trailing dash", `${MINUS}5-3-`, `${MINUS}5${EN_DASH}3-`],
      ["positive trailing dash", `1-2-`, `1${EN_DASH}2-`],
    ])("%s", (_desc, input, expected) => {
      expect(viewTransform(enDashNumberRange, input, sep)).toBe(expected)
    })

    it.each([
      // A negative number with a trailing suffix letter (minusReplace).
      ["negative with suffix letter", `-5x`, `${MINUS}5x`],
      // A spaced dash run with two trailing spaces and nothing after (end anchor).
      ["spaced dash with two trailing spaces", `a -  `, `a${EM_DASH}`],
      // A spaced dash directly after a non-word, non-space char.
      ["spaced dash after a paren", `${MINUS}) -  `, `${MINUS})${EM_DASH}`],
      // A line-leading single hyphen before a word char (suspended hyphen): the
      // leading spaces are consumed but the dash core rejects, so nothing changes.
      ["leading spaces then suspended hyphen", `  -x`, `  -x`],
      // Two leading spaces at the start of text before a spaced dash.
      ["two leading spaces at text start", `  - b`, `${EM_DASH}b`],
      // A word char then two spaces before the dash.
      ["word then two spaces before dash", `x  - b`, `x${EM_DASH}b`],
      // A spaced dash whose single trailing separator is followed by a hyphen.
      ["spaced dash with trailing separator", `a - ${sep}-`, `a${EM_DASH}${sep}-`],
      // A hyphen in the arrow run with two boundaries at the second `${chr}?` slot.
      ["arrow hyphen with two trailing boundaries", `a --${sep}${sep}>`, `a${EM_DASH}-${sep}${sep}>`],
      // Two stacked leading spaces / a boundary inside them restart the match.
      ["boundary then two leading spaces", `a${sep}  - b`, `a${sep}${EM_DASH}b`],
      ["leading space, boundary, space", ` ${sep} - b`, ` ${sep}${EM_DASH}b`],
      // A trailing separator with kept spaces then a second boundary.
      ["trailing separators with kept spaces", `a - ${sep}  ${sep}b`, `a${EM_DASH}${sep}  ${sep}b`],
      // Arrow guard with three boundaries (no hyphens) past the slots converts.
      ["three boundaries before arrow gt", `a - ${sep}${sep}${sep}>`, `a${EM_DASH}${sep}${sep}${sep}>`],
      // An arrow guard split so the `>` becomes its own spaced dash candidate.
      ["boundary-split arrow becomes dash", `a -${sep}${sep}- >`, `a${EM_DASH}${sep}${sep}${EM_DASH}>`],
      // A boundary-led run overlapping a following boundary-led run.
      ["overlapping boundary-led runs", `x${sep}-- ${sep}- y`, `x${sep}${EM_DASH}${sep}- y`],
      // An em-dash with a space only on its left.
      ["space only left of em-dash", `word ${EM_DASH}word`, `word${EM_DASH}word`],
      // Arrow guard: a boundary inside the trailing hyphen run defeats the arrow.
      ["boundary inside arrow hyphen run", ` ---${sep}->  Jana`, `${EM_DASH}-${sep}->  Jana`],
      // Arrow guard with no hyphens and three boundaries before `>` (over budget).
      ["three boundaries before arrow", `(${EM_DASH}3  ${EM_DASH}${sep}${sep}${sep}`, `(${EM_DASH}3${EM_DASH}${sep}${sep}${sep}`],
      // Two boundaries after a hyphen in the arrow run defeat the second slot.
      ["two boundaries after arrow hyphen", `a - -${sep}${sep}>`, `a${EM_DASH}-${sep}${sep}>`],
      // A line-leading em-dash followed by an arrow keeps its single space removal.
      ["em-dash run before arrow at start", `555  ${EM_DASH}->Marx`, `555${EM_DASH}->Marx`],
    ])("%s", (_desc, input, expected) => {
      expect(viewTransform(hyphenReplace, input, sep)).toBe(expected)
    })

    it("overlapping boundary-led runs (british)", () => {
      expect(viewTransform((view) => hyphenReplace(view, { dashStyle: "british" }), `a---.${sep}${sep}-- - word`, sep)).toBe(
        `a---.${sep}${sep} ${EN_DASH} ${EN_DASH} word`,
      )
    })
  })
})

const { WORD_JOINER } = UNICODE_SYMBOLS

describe("dashWordJoiner", () => {
  it.each([
    // Em dash: preceded by a letter
    [`plan${EM_DASH}result`, `plan${WORD_JOINER}${EM_DASH}result`, "em dash preceded by letter"],
    // Em dash: multiple
    [`a${EM_DASH}b${EM_DASH}c`, `a${WORD_JOINER}${EM_DASH}b${WORD_JOINER}${EM_DASH}c`, "multiple em dashes"],
    // Em dash: preceded by digit
    [`cost${EM_DASH}10`, `cost${WORD_JOINER}${EM_DASH}10`, "em dash preceded by digit"],
    // Em dash: start of string — untouched
    [`${EM_DASH}Author`, `${EM_DASH}Author`, "em dash at start of string"],
    // Em dash: preceded by whitespace — untouched
    [`foo ${EM_DASH} bar`, `foo ${EM_DASH} bar`, "em dash preceded by whitespace"],
    // Em dash: already glued (idempotent)
    [`plan${WORD_JOINER}${EM_DASH}result`, `plan${WORD_JOINER}${EM_DASH}result`, "em dash already glued"],
    // Em dash: newline before — untouched
    [`intro\n${EM_DASH}continuation`, `intro\n${EM_DASH}continuation`, "em dash after newline"],
    // Em dash: separator chars are non-whitespace, so protected
    [`x${sep}${EM_DASH}y`, `x${sep}${WORD_JOINER}${EM_DASH}y`, "em dash after separator"],
    // Em dash: consecutive — second is preceded by first (non-whitespace)
    [`${EM_DASH}${EM_DASH}`, `${EM_DASH}${WORD_JOINER}${EM_DASH}`, "consecutive em dashes"],
    // En dash: number range — protected
    [`1${EN_DASH}5`, `1${WORD_JOINER}${EN_DASH}5`, "en dash number range"],
    // En dash: date range — protected
    [`Jan${EN_DASH}Mar`, `Jan${WORD_JOINER}${EN_DASH}Mar`, "en dash date range"],
    // En dash: already glued (idempotent)
    [`1${WORD_JOINER}${EN_DASH}5`, `1${WORD_JOINER}${EN_DASH}5`, "en dash already glued"],
    // En dash: British spaced — untouched (space before is whitespace)
    [`word ${EN_DASH} word`, `word ${EN_DASH} word`, "en dash British spaced"],
    // En dash: start of string — untouched
    [`${EN_DASH}5`, `${EN_DASH}5`, "en dash at start of string"],
    // Mixed: em and en dashes in same string
    [`a${EM_DASH}b${EN_DASH}c`, `a${WORD_JOINER}${EM_DASH}b${WORD_JOINER}${EN_DASH}c`, "mixed em and en dash"],
  ])("%s → %s (%s)", (input, expected) => {
    expect(dashWordJoiner(input)).toBe(expected)
  })
})
