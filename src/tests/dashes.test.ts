import { hyphenReplace, enDashNumberRange, enDashDateRange, minusReplace, numberRangeDisallowedPrefixes } from "../dashes.js"
import { DEFAULT_SEPARATOR, UNICODE_SYMBOLS } from "../constants.js"

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
      ["since--as you know", `since${EM_DASH}as you know`],
    ])('should replace hyphens in "%s"', (input, expected) => {
      expect(hyphenReplace(input)).toBe(expected)
    })
  })

  describe("multiple dashes within words", () => {
    it("replaces double dashes", () => {
      expect(hyphenReplace("Since--as you know")).toBe(`Since${EM_DASH}as you know`)
    })

    it("replaces triple dashes", () => {
      expect(hyphenReplace("word---another")).toBe(`word${EM_DASH}another`)
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
      ["2000-2020", `2000${EN_DASH}2020`],
      ["2018-2021. Then 1-3", `2018${EN_DASH}2021. Then 1${EN_DASH}3`],
      ["p.10-15", `p.10${EN_DASH}15`],
    ])('converts "%s"', (input, expected) => {
      expect(hyphenReplace(input)).toBe(expected)
    })
  })

  describe("with separator character", () => {
    const sep = "\uE000"

    it("should handle separator in em dash context", () => {
      const input = `word${sep} - ${sep}another`
      const result = hyphenReplace(input, { separator: sep })
      expect(result).toBe(`word${sep}${EM_DASH}${sep}another`)
    })

    it("should handle separator in number ranges", () => {
      const input = `pages 1${sep}-${sep}5`
      const result = hyphenReplace(input, { separator: sep })
      expect(result).toBe(`pages 1${sep}${EN_DASH}${sep}5`)
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
      expect(enDashNumberRange(input, { separator: sep })).toBe(expected)
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

  describe("none style (preserve spacing)", () => {
    it.each([
      ["January-March", `January${EN_DASH}March`],
      ["January - March", `January ${EN_DASH} March`],
      ["October 2012 - December 2014", `October 2012 ${EN_DASH} December 2014`],
      ["Oct 2012-Dec 2014", `Oct 2012${EN_DASH}Dec 2014`],
    ])('should convert "%s" to "%s"', (input, expected) => {
      expect(enDashDateRange(input, { dashStyle: "none" })).toBe(expected)
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
      expect(enDashDateRange(input, { separator: sep })).toBe(expected)
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
  ])('should convert "%s" to use minus sign', (input, expected) => {
    expect(minusReplace(input)).toBe(expected)
  })

  it("should not convert hyphens in other contexts", () => {
    expect(minusReplace("well-known")).toBe("well-known")
    expect(minusReplace("re-read")).toBe("re-read")
  })
})

describe("enDashNumberRange preserves", () => {
  it.each([
    "555-123-4567", "+1-555-123-4567", "(555)-123-4567", // phones
    "978-3-16-148410-0", "0-13-468599-1", // ISBNs
    "2024-01-15", "2024-01", "1999-12", // ISO dates
    "192-168-1-1", "12-34-5678", // IPs
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
    ])("leaves parenthetical dashes unchanged: %s", (input) => {
      expect(hyphenReplace(input, { dashStyle: "none" })).toBe(input)
    })

    it("still converts number ranges", () => {
      expect(hyphenReplace("pages 1-5", { dashStyle: "none" })).toBe(`pages 1${EN_DASH}5`)
    })

    it("still converts minus signs", () => {
      expect(hyphenReplace("-5", { dashStyle: "none" })).toBe(`${MINUS}5`)
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
  it("preserves short phone numbers (555-1234)", () => {
    expect(hyphenReplace("555-1234")).toBe("555-1234")
  })

  it("preserves phone with area code in parens", () => {
    expect(hyphenReplace("(555) 123-4567")).toBe("(555) 123-4567")
  })
})
