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
      ["\n---\n", "\n---\n"], // Retain horizontal rules
      [`emphasis" ${EM_DASH}`, `emphasis"${EM_DASH}`],
      ["- First level\n - Second level", `${EM_DASH} First level\n - Second level`],
      ["> - First level", "> - First level"], // Quoted unordered lists should not be changed
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
      ["- This is a list item", `${EM_DASH} This is a list item`],
      ["--- Indented list item", `${EM_DASH} Indented list item`],
      ["Line 1\n- Line 2", `Line 1\n${EM_DASH} Line 2`],
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

  describe('when "british"', () => {
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
})
