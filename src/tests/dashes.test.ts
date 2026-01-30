import { hyphenReplace, enDashNumberRange, enDashDateRange, minusReplace } from "../dashes.js"

describe("hyphenReplace", () => {
  describe("em dashes from surrounded hyphens", () => {
    it.each([
      ["This is a - hyphen.", "This is a—hyphen."],
      ["This is an — em dash.", "This is an—em dash."],
      ["word — word", "word—word"],
      ["word ---", "word—"],
      ["word— word", "word—word"],
      ["word —word", "word—word"],
      ['"I love dogs." - Me', '"I love dogs." — Me'],
      ["- Me", "— Me"],
      ["-- Me", "— Me"],
      ["Hi-- what do you think?", "Hi—what do you think?"],
      [
        "—such behaviors still have to be retrodicted",
        "—such behaviors still have to be retrodicted",
      ],
      ["\n---\n", "\n---\n"], // Retain horizontal rules
      [`emphasis" —`, `emphasis"—`],
      ["- First level\n - Second level", "— First level\n - Second level"],
      ["> - First level", "> - First level"], // Quoted unordered lists should not be changed
      [
        "reward… — [Model-based RL, Desires, Brains, Wireheading](https://www.alignmentforum.org/posts/K5ikTdaNymfWXQHFb/model-based-rl-desires-brains-wireheading#Self_aware_desires_1__wireheading)",
        "reward… — [Model-based RL, Desires, Brains, Wireheading](https://www.alignmentforum.org/posts/K5ikTdaNymfWXQHFb/model-based-rl-desires-brains-wireheading#Self_aware_desires_1__wireheading)",
      ],
      ["a browser- or OS-specific fashion", "a browser- or OS-specific fashion"],
      ["since--as you know", "since—as you know"],
    ])('should replace hyphens in "%s"', (input, expected) => {
      expect(hyphenReplace(input)).toBe(expected)
    })
  })

  describe("multiple dashes within words", () => {
    it("replaces double dashes", () => {
      expect(hyphenReplace("Since--as you know")).toBe("Since—as you know")
    })

    it("replaces triple dashes", () => {
      expect(hyphenReplace("word---another")).toBe("word—another")
    })
  })

  describe("dashes at start of line", () => {
    it.each([
      ["- This is a list item", "— This is a list item"],
      ["--- Indented list item", "— Indented list item"],
      ["Line 1\n- Line 2", "Line 1\n— Line 2"],
    ])('handles "%s"', (input, expected) => {
      expect(hyphenReplace(input)).toBe(expected)
    })
  })

  describe("spaces around em dashes", () => {
    it.each([
      ["word — another", "word—another"],
      ["word—  another", "word—another"],
      ["word  —another", "word—another"],
    ])('removes spaces in "%s"', (input, expected) => {
      expect(hyphenReplace(input)).toBe(expected)
    })
  })

  describe("em dashes at start of line", () => {
    it.each([
      ["—Start of line", "— Start of line"],
      ["Line 1\n—Line 2", "Line 1\n— Line 2"],
      ["— Already correct", "— Already correct"],
    ])('handles "%s"', (input, expected) => {
      expect(hyphenReplace(input)).toBe(expected)
    })
  })

  describe("number ranges to en dashes", () => {
    it.each([
      ["Pages 1-5", "Pages 1–5"],
      ["2000-2020", "2000–2020"],
      ["2018-2021. Then 1-3", "2018–2021. Then 1–3"],
      ["p.10-15", "p.10–15"],
    ])('converts "%s"', (input, expected) => {
      expect(hyphenReplace(input)).toBe(expected)
    })
  })

  describe("with separator character", () => {
    const sep = "\uE000"

    it("should handle separator in em dash context", () => {
      const input = `word${sep} - ${sep}another`
      const result = hyphenReplace(input, { separator: sep })
      expect(result).toBe(`word${sep}—${sep}another`)
    })

    it("should handle separator in number ranges", () => {
      const input = `pages 1${sep}-${sep}5`
      const result = hyphenReplace(input, { separator: sep })
      expect(result).toBe(`pages 1${sep}–${sep}5`)
    })
  })
})

describe("enDashNumberRange", () => {
  it.each([
    ["1-2", "1–2"],
    ["10-20", "10–20"],
    ["100-200", "100–200"],
    ["1000-2000", "1000–2000"],
    ["1,000-2,000", "1,000–2,000"],
    ["1.000-2.000", "1.000–2.000"],
    ["1-2 and 3-4", "1–2 and 3–4"],
    ["from 5-10 to 15-20", "from 5–10 to 15–20"],
    ["1-2-3", "1–2-3"], // Only replace the first hyphen
    ["a-b", "a-b"], // Don't replace non-numeric ranges
    ["1a-2b", "1a-2b"], // Don't replace if not purely numeric
    ["a1-2b", "a1-2b"], // Don't replace if not purely numeric
    ["p. 206-207)", "p. 206–207)"],
    ["Qwen1.5-1.8", "Qwen1.5-1.8"], // Don't replace if there's a decimal
    ["$100-$200", "$100–$200"],
    ["$1.50-$3.50", "$1.50–$3.50"],
    ["$1-3", "$1–3"],
    ["1 - 2", "1 - 2"], // Spaced ranges should not change
  ])('should convert "%s" to "%s"', (input, expected) => {
    expect(enDashNumberRange(input)).toBe(expected)
  })
})

describe("enDashDateRange", () => {
  describe("american style (default, unspaced)", () => {
    it.each([
      ["January-March", "January–March"],
      ["Jan-Mar", "Jan–Mar"],
      ["February-April 2024", "February–April 2024"],
      ["May-June", "May–June"],
      ["Sep-Nov", "Sep–Nov"],
      ["December-January", "December–January"],
      ["October 2012 - December 2014", "October 2012–December 2014"],
      ["Oct 2012 - Dec 2014", "Oct 2012–Dec 2014"],
      ["January 2020 - March 2020", "January 2020–March 2020"],
      ["May 2019-June 2020", "May 2019–June 2020"],
      ["Jan 2000 - Feb", "Jan 2000–Feb"],
      ["March - April 2025", "March–April 2025"],
    ])('should convert "%s" to "%s"', (input, expected) => {
      expect(enDashDateRange(input)).toBe(expected)
    })
  })

  describe("british style (spaced)", () => {
    it.each([
      ["January-March", "January – March"],
      ["Jan-Mar", "Jan – Mar"],
      ["October 2012 - December 2014", "October 2012 – December 2014"],
      ["Oct 2012 - Dec 2014", "Oct 2012 – Dec 2014"],
      ["May 2019-June 2020", "May 2019 – June 2020"],
    ])('should convert "%s" to "%s"', (input, expected) => {
      expect(enDashDateRange(input, { dashStyle: "british" })).toBe(expected)
    })
  })

  describe("none style (preserve spacing)", () => {
    it.each([
      ["January-March", "January–March"],
      ["January - March", "January – March"],
      ["October 2012 - December 2014", "October 2012 – December 2014"],
      ["Oct 2012-Dec 2014", "Oct 2012–Dec 2014"],
    ])('should convert "%s" to "%s"', (input, expected) => {
      expect(enDashDateRange(input, { dashStyle: "none" })).toBe(expected)
    })
  })

  it("should not convert non-month words", () => {
    expect(enDashDateRange("hello-world")).toBe("hello-world")
    expect(enDashDateRange("Mon-Fri")).toBe("Mon-Fri") // Days, not months
  })
})

describe("minusReplace", () => {
  it.each([
    ["-5", "−5"],
    ["-5.5", "−5.5"],
    ["(-5)", "(−5)"],
    ["The value is -10", "The value is −10"],
    [" -3", " −3"],
    ['"-5"', '"−5"'],
  ])('should convert "%s" to use minus sign', (input, expected) => {
    expect(minusReplace(input)).toBe(expected)
  })

  it("should not convert hyphens in other contexts", () => {
    expect(minusReplace("well-known")).toBe("well-known")
    expect(minusReplace("re-read")).toBe("re-read")
  })
})

describe("dashStyle option", () => {
  describe('when "american" (default)', () => {
    it.each([
      ["word - word", "word—word"],
      ["word -- word", "word—word"],
      ["since--as you know", "since—as you know"],
    ])("uses unspaced em dash: %s", (input, expected) => {
      expect(hyphenReplace(input, { dashStyle: "american" })).toBe(expected)
    })

    it("is the default behavior", () => {
      expect(hyphenReplace("word - word")).toBe("word—word")
    })
  })

  describe('when "british"', () => {
    it.each([
      ["word - word", "word – word"],
      ["word -- word", "word – word"],
      ["since--as you know", "since – as you know"],
    ])("uses spaced en dash: %s", (input, expected) => {
      expect(hyphenReplace(input, { dashStyle: "british" })).toBe(expected)
    })

    it("still converts number ranges to en dashes", () => {
      expect(hyphenReplace("pages 1-5", { dashStyle: "british" })).toBe("pages 1–5")
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
      expect(hyphenReplace("pages 1-5", { dashStyle: "none" })).toBe("pages 1–5")
    })

    it("still converts minus signs", () => {
      expect(hyphenReplace("-5", { dashStyle: "none" })).toBe("−5")
    })
  })
})
