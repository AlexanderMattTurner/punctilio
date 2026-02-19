/**
 * Stress tests for the U+02BC apostrophe change in convertSingleQuotes.
 *
 * These tests complement quotes.test.ts by focusing on:
 * - Idempotency (double/triple-application stability)
 * - Cross-feature interactions (possessive + contraction + 'n' + quotes)
 * - RSQ→MLA normalization (text from external systems)
 * - Separator edge cases around possessive 's
 * - Punctuation style correctness (MLA excluded from period/comma movement)
 * - Pathological regex inputs (backtracking protection)
 * - Multi-line behavior
 * - Known limitations (documented)
 *
 * Base coverage in quotes.test.ts is NOT duplicated here.
 */

import { niceQuotes, QuoteOptions } from "../quotes.js"
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

/** Assert correctness + idempotency in a single call. */
function expectQuotes(input: string, expected: string, opts?: QuoteOptions) {
  const result = niceQuotes(input, opts)
  expect(result).toBe(expected)
  expect(niceQuotes(result, opts)).toBe(result)
}

// ─── Idempotency ────────────────────────────────────────────────────────────

describe("STRESS: Idempotency — double-application stability", () => {
  it.each([
    // Possessives (not in base quotes.test.ts)
    ["the dog's bone", `the dog${MLA}s bone`],
    ["the dog's owner", `the dog${MLA}s owner`],
    ["the boss's car", `the boss${MLA}s car`],
    ["the cat's meow", `the cat${MLA}s meow`],
    // Possessive plural → RSQ
    ["the dogs' owner", `the dogs${RSQ} owner`],
    ["the bosses' meeting", `the bosses${RSQ} meeting`],
    // O'Brien combined pattern
    ["O'Brien's hat", `O${MLA}Brien${MLA}s hat`],
    ["O'Connor's pub", `O${MLA}Connor${MLA}s pub`],
    // Contractions + possessives in one sentence
    ["I can't find Brien's keys", `I can${MLA}t find Brien${MLA}s keys`],
    ["She's got the dog's toy and doesn't care", `She${MLA}s got the dog${MLA}s toy and doesn${MLA}t care`],
    // Quoted text with contractions
    [`"I can't," she said.`, `${LDQ}I can${MLA}t,${RDQ} she said.`],
    ["He said, 'hello'", `He said, ${LSQ}hello${RSQ}`],
    // Decade in double quotes
    [`"the '90s"`, `${LDQ}the ${MLA}90s${RDQ}`],
    // 'n' + possessive combo
    ["Rock 'n' Roll's greatest hits", `Rock ${MLA}n${MLA} Roll${MLA}s greatest hits`],
    ["O'Brien's fish 'n' chips", `O${MLA}Brien${MLA}s fish ${MLA}n${MLA} chips`],
    // French contractions with accented letters
    ["l'homme", `l${MLA}homme`],
    ["d'accord", `d${MLA}accord`],
    ["l'école", `l${MLA}école`],
    ["c'était", `c${MLA}était`],
    ["qu'il", `qu${MLA}il`],
    // Uppercase names
    ["O'NEILL", `O${MLA}NEILL`],
    ["D'ARTAGNAN", `D${MLA}ARTAGNAN`],
    ["O'NEILL'S PUB", `O${MLA}NEILL${MLA}S PUB`],
    // All-caps contractions
    ["CAN'T", `CAN${MLA}T`],
    ["WON'T", `WON${MLA}T`],
    // Contraction + possessive triple
    ["shouldn't's", `shouldn${MLA}t${MLA}s`],
    // Mixed types
    ["It's the dog's!", `It${MLA}s the dog${MLA}s!`],
    ["Is it the dog's?", `Is it the dog${MLA}s?`],
    // Chained possessives
    ["the dog's owner's car", `the dog${MLA}s owner${MLA}s car`],
    // Gov't-style with hyphen
    ["gov't-issued", `gov${MLA}t-issued`],
    // Contraction before em-dash
    [`don't${EM_DASH}stop`, `don${MLA}t${EM_DASH}stop`],
    // Pre-converted curly doubles with straight apostrophe
    [`${LDQ}the dog's${RDQ}`, `${LDQ}the dog${MLA}s${RDQ}`],
    [`${LDQ}I can't${RDQ}`, `${LDQ}I can${MLA}t${RDQ}`],
    // Possessive inside single-quoted phrase
    ["'the dog's bowl'", `${LSQ}the dog${MLA}s bowl${RSQ}`],
    // Closing RSQ before opening LDQ
    [`'hello' "world"`, `${LSQ}hello${RSQ} ${LDQ}world${RDQ}`],
    // Possessive in parenthetical
    ["(Brien's)", `(Brien${MLA}s)`],
  ])('%s', (input, expected) => {
    expectQuotes(input, expected)
  })
})

describe("STRESS: Already-converted text is stable", () => {
  it.each([
    `the dog${MLA}s bone`,
    `O${MLA}Brien${MLA}s hat`,
    `Rock ${MLA}n${MLA} Roll`,
    `${MLA}twas the night`,
    `${LDQ}I can${MLA}t,${RDQ} she said.`,
    `${LSQ}I lost the game.${RSQ}`,
    `${LDQ}nested ${LSQ}quotes${RSQ}${RDQ}`,
    `l${MLA}homme d${MLA}accord`,
    `the dogs${RSQ} owner`,
    `${LSQ}hello${RSQ} ${LDQ}world${RDQ}`,
  ])('stable for: "%s"', (input) => {
    expect(niceQuotes(input)).toBe(input)
    expect(niceQuotes(niceQuotes(input))).toBe(input)
  })
})

describe("STRESS: Triple-application stability", () => {
  it.each([
    "He said, 'I can't believe it's not butter.'",
    `"She told me, 'don't worry about O'Brien's cat.'"`,
    "Rock 'n' Roll is the dog's best friend.",
    "'twas the night before the '90s ended.",
    `"O'Brien's fish 'n' chips," she said. 'twas the best.`,
    "the dog's owner's car wasn't in the bosses' meeting.",
  ])('triple-stable for: "%s"', (input) => {
    const once = niceQuotes(input)
    const twice = niceQuotes(once)
    const thrice = niceQuotes(twice)
    expect(twice).toBe(once)
    expect(thrice).toBe(once)
  })
})

// ─── RSQ normalization ──────────────────────────────────────────────────────

describe("STRESS: RSQ→MLA normalization (external system input)", () => {
  it.each([
    // Contraction with RSQ (from other systems using U+2019 as apostrophe)
    [`don${RSQ}t`, `don${MLA}t`],
    [`I${RSQ}m`, `I${MLA}m`],
    [`they${RSQ}re`, `they${MLA}re`],
    [`O${RSQ}Brien`, `O${MLA}Brien`],
    [`we${RSQ}ve`, `we${MLA}ve`],
    [`she${RSQ}ll`, `she${MLA}ll`],
    // RSQ in possessive position
    [`the dog${RSQ}s bone`, `the dog${MLA}s bone`],
    // Mixed MLA + RSQ
    [`I${MLA}m fine and you${RSQ}re great`, `I${MLA}m fine and you${MLA}re great`],
    // MLA + straight in same word
    [`can${MLA}t's`, `can${MLA}t${MLA}s`],
  ])('normalizes "%s"', (input, expected) => {
    expectQuotes(input, expected)
  })

  it("does NOT normalize RSQ when it is a closing quote", () => {
    const input = `${LSQ}hello${RSQ} world`
    expect(niceQuotes(input)).toBe(input)
  })

  it("does not convert RSQ after non-Latin character", () => {
    const input = `[test]${RSQ}`
    expect(niceQuotes(input)).not.toContain(MLA)
  })
})

// ─── 'n' abbreviation boundaries ────────────────────────────────────────────

describe("STRESS: 'n' abbreviation boundaries", () => {
  it("does not match at start of string (no preceding word)", () => {
    expect(niceQuotes("'n' Roll")).not.toContain(`${MLA}n${MLA}`)
  })

  it("does not match at end of string (no following word)", () => {
    expect(niceQuotes("Rock 'n'")).not.toBe(`Rock ${MLA}n${MLA}`)
  })

  it("matches when 'n' is a quoted letter in word context (known false positive)", () => {
    // (?<=\w\sep? )'n'(?= \sep?\w) matches: "letter" + space + 'n' + space + "is"
    expect(niceQuotes("the letter 'n' is common")).toBe(`the letter ${MLA}n${MLA} is common`)
  })

  it("does not match when punctuation precedes the first apostrophe", () => {
    // ',' is not \w, so lookbehind fails
    const result = niceQuotes("said, 'n' is good")
    expect(result).not.toBe(`said, ${MLA}n${MLA} is good`)
  })

  it("does not match uppercase 'N'", () => {
    expect(niceQuotes("Rock 'N' Roll")).toBe(`Rock ${LSQ}N${RSQ} Roll`)
  })

  it("does not match when newline replaces space", () => {
    expect(niceQuotes("Rock 'n'\nRoll")).not.toContain(`${MLA}n${MLA}`)
  })

  it.each([
    // No space after closing apostrophe → not 'n' handler, but contractions still fire
    ["Rock 'n'Roll", `Rock ${MLA}n${MLA}Roll`],
    // No space before opening apostrophe → not 'n' handler
    ["Rock'n' Roll", undefined], // just verify it doesn't contain ʼnʼ
  ])("partial space: %s", (input, expected) => {
    const result = niceQuotes(input)
    if (expected) {
      expect(result).toBe(expected)
    } else {
      expect(result).not.toContain(`${MLA}n${MLA}`)
    }
    expect(niceQuotes(result)).toBe(result) // idempotent
  })

  it("handles multiple 'n' abbreviations", () => {
    expectQuotes(
      "Rock 'n' Roll and fish 'n' chips",
      `Rock ${MLA}n${MLA} Roll and fish ${MLA}n${MLA} chips`,
    )
  })

  it("does not double-convert pre-existing 'n' abbreviation", () => {
    const input = `Rock ${MLA}n${MLA} Roll`
    expect(niceQuotes(input)).toBe(input)
  })

  it("'n' handler runs before closing quote, preventing misclassification", () => {
    // Without 'n' handler, the second ' would match closingSingle (n' + space)
    const result = niceQuotes("Rock 'n' Roll")
    expect(result).toBe(`Rock ${MLA}n${MLA} Roll`)
    expect(result).not.toContain(RSQ)
  })
})

// ─── Possessive 's at various ending contexts ───────────────────────────────

describe("STRESS: Possessive 's before ending context characters", () => {
  it.each([
    ["dog's ", `dog${MLA}s `],       // space
    ["dog's.", `dog${MLA}s.`],       // period
    ["dog's!", `dog${MLA}s!`],       // exclamation
    ["dog's?", `dog${MLA}s?`],       // question
    ["dog's;", `dog${MLA}s;`],       // semicolon
    ["dog's,", `dog${MLA}s,`],       // comma
    ["dog's)", `dog${MLA}s)`],       // close paren
    ["dog's]", `dog${MLA}s]`],       // close bracket
    [`dog's${EM_DASH}`, `dog${MLA}s${EM_DASH}`], // em-dash
    ["dog's-", `dog${MLA}s-`],       // hyphen
    ["dog's", `dog${MLA}s`],         // end of string
    [`"the dog's"`, `${LDQ}the dog${MLA}s${RDQ}`], // before closing double quote
    ["the dogs'", `the dogs${RSQ}`], // plural possessive at end
  ])('%s', (input, expected) => {
    expectQuotes(input, expected)
  })
})

// ─── Ambiguous / tricky cases ───────────────────────────────────────────────

describe("STRESS: Ambiguous / tricky cases", () => {
  it("possessive plural inside quotes is ambiguous but idempotent", () => {
    const input = "'the dogs' bowl'"
    const result = niceQuotes(input)
    expect(result).toBeDefined()
    expect(niceQuotes(result)).toBe(result)
  })

  it("possessive plural inside double quotes is idempotent", () => {
    const input = `"the dogs' owner"`
    const first = niceQuotes(input)
    expect(niceQuotes(first)).toBe(first)
  })

  it("'the dog's' has opening quote + possessive + closing quote", () => {
    expectQuotes("'the dog's'", `${LSQ}the dog${MLA}s${RSQ}`)
  })

  it("alternating quotes and text: all mid-word → MLA", () => {
    expectQuotes("a'b'c'd'e'f", `a${MLA}b${MLA}c${MLA}d${MLA}e${MLA}f`)
  })

  it("triple straight quotes: stable", () => {
    const result = niceQuotes("a'''b")
    expect(niceQuotes(result)).toBe(result)
  })
})

// ─── Separator interactions ─────────────────────────────────────────────────

describe("STRESS: Separator interactions", () => {
  it.each([
    // Possessive with separator before 's
    [`dog${SEP}'s bone`, `dog${SEP}${MLA}s bone`, "possessive across sep"],
    // Quote with separator at boundary
    [`'hello${SEP}'`, `${LSQ}hello${SEP}${RSQ}`, "closing after sep"],
    // Separator before opening quote
    [`${SEP}'hello'`, `${SEP}${LSQ}hello${RSQ}`, "opening after sep"],
  ])("%s → %s (%s)", (input, expected) => {
    expect(niceQuotes(input, { separator: SEP })).toBe(expected)
  })

  it("handles separator between apostrophe and s", () => {
    expectQuotes(`the dog'${SEP}s bone`, `the dog${MLA}${SEP}s bone`, { separator: SEP })
  })

  it("handles separator after possessive 's", () => {
    expectQuotes(`the dog's${SEP} bone`, `the dog${MLA}s${SEP} bone`, { separator: SEP })
  })

  it("handles separator both between and after possessive", () => {
    expectQuotes(`the dog'${SEP}s${SEP} bone`, `the dog${MLA}${SEP}s${SEP} bone`, { separator: SEP })
  })

  it("'n' with separators around word boundaries", () => {
    const input = `Rock${SEP} 'n' ${SEP}Roll`
    const result = niceQuotes(input, { separator: SEP })
    expect(result).toContain(`${MLA}n${MLA}`)
    expect(niceQuotes(result, { separator: SEP })).toBe(result)
  })
})

// ─── Punctuation style with apostrophes ─────────────────────────────────────

describe("STRESS: Punctuation style — MLA excluded from period/comma movement", () => {
  describe("american style", () => {
    it.each([
      // MLA: period/comma stay put (MLA is not in the quote character class)
      [`the dog${MLA}s.`, `the dog${MLA}s.`],
      [`Brien${MLA}s,`, `Brien${MLA}s,`],
      [`Brien${MLA}s, hello`, `Brien${MLA}s, hello`],
      // RSQ: period/comma move inside
      [`${LSQ}hello${RSQ}.`, `${LSQ}hello.${RSQ}`],
      [`${LSQ}hello${RSQ},`, `${LSQ}hello,${RSQ}`],
    ])('american: "%s" → "%s"', (input, expected) => {
      expect(niceQuotes(input, { punctuationStyle: "american" })).toBe(expected)
    })

    it("moves period inside closing double quote around possessive", () => {
      expectQuotes(`"the dog's bone".`, `${LDQ}the dog${MLA}s bone.${RDQ}`, { punctuationStyle: "american" })
    })
  })

  describe("british style", () => {
    it.each([
      // MLA: period stays put
      [`Brien${MLA}s.`, `Brien${MLA}s.`],
      // RSQ: period moves outside
      [`${LSQ}hello.${RSQ}`, `${LSQ}hello${RSQ}.`],
      // MLA not in regex char class
      [`.${MLA}s`, `.${MLA}s`],
    ])('british: "%s" → "%s"', (input, expected) => {
      expect(niceQuotes(input, { punctuationStyle: "british" })).toBe(expected)
    })

    it("moves period outside closing double quote around possessive", () => {
      expect(
        niceQuotes(`${LDQ}the dog${MLA}s bone.${RDQ}`, { punctuationStyle: "british" })
      ).toBe(`${LDQ}the dog${MLA}s bone${RDQ}.`)
    })
  })
})

// ─── Multi-line behavior ────────────────────────────────────────────────────

describe("STRESS: Multi-line behavior", () => {
  it.each([
    // Contractions across lines
    ["I can't\nbelieve it's\nnot butter", `I can${MLA}t\nbelieve it${MLA}s\nnot butter`],
    // Possessives across lines
    ["the dog's\nbone and\nthe cat's toy", `the dog${MLA}s\nbone and\nthe cat${MLA}s toy`],
  ])('multiline: "%s"', (input, expected) => {
    expectQuotes(input, expected)
  })

  it("apostropheRegex lookahead stops at newline (cross-line quotes → MLA + RSQ, not LSQ + RSQ)", () => {
    // The \n stops the lookahead from seeing the closing quote on line 2
    expectQuotes("'hello\nworld'", `${MLA}hello\nworld${RSQ}`)
  })

  it("complex multi-line is idempotent", () => {
    const input = "She said, 'I can't\ngo to O'Brien's\nfish 'n' chips shop.'"
    const first = niceQuotes(input)
    expect(niceQuotes(first)).toBe(first)
  })
})

// ─── Minimal / boundary inputs ──────────────────────────────────────────────

describe("STRESS: Minimal and boundary inputs", () => {
  it.each([
    ["", ""],
    [" ", " "],
    ["'", MLA],            // lone apostrophe → MLA (no closing quote ahead)
    ["a", "a"],
    ["'a", `${MLA}a`],     // leading apostrophe
    ["a'", `a${RSQ}`],     // trailing → closing quote
    ["   ", "   "],
  ])('minimal "%s" → "%s"', (input, expected) => {
    expectQuotes(input, expected)
  })

  it("handles empty single quotes adjacent to words (stable)", () => {
    const result = niceQuotes("hello''world")
    expect(niceQuotes(result)).toBe(result)
  })

  it.each([
    ["'' hello", `${LSQ}${RSQ} hello`],
    ["hello ''", `hello ${LSQ}${RSQ}`],
    ["'' ''", `${LSQ}${RSQ} ${LSQ}${RSQ}`],
  ])('empty quotes: "%s"', (input, expected) => {
    expect(niceQuotes(input)).toBe(expected)
  })
})

// ─── Decade abbreviations (contexts beyond base tests) ──────────────────────

describe("STRESS: Decade abbreviations in extended contexts", () => {
  it.each([
    ["the '60s", `the ${MLA}60s`],
    ["the '70s", `the ${MLA}70s`],
    ["the '80s", `the ${MLA}80s`],
    ["the '00s", `the ${MLA}00s`],
  ])('decade "%s"', (input, expected) => {
    expectQuotes(input, expected)
  })

  it("multiple decades in one sentence", () => {
    const result = niceQuotes("The '60s, '70s, and '80s were different.")
    expect(result).toContain(`${MLA}60s`)
    expect(result).toContain(`${MLA}70s`)
    expect(result).toContain(`${MLA}80s`)
  })

  it("decade inside single quotes — known limitation", () => {
    const input = "she said 'the '90s were great'"
    const result = niceQuotes(input)
    // The apostropheRegex lookahead for 'the stops at the second straight '
    // (before 90s) without finding RSQ, so 'the → MLA.
    // For '90s, the lookahead sees RSQ at great' → opening quote (LSQ).
    expect(result).toContain(`${MLA}the`)
    expect(result).toContain(`${LSQ}90s`)
    expect(result).toContain(`great${RSQ}`)
    expect(niceQuotes(result)).toBe(result)
  })
})

// ─── 'twas-style leading apostrophes (extended) ─────────────────────────────

describe("STRESS: 'twas-style leading apostrophes in extended contexts", () => {
  it.each([
    ["'cause", `${MLA}cause`],
    ["'bout", `${MLA}bout`],
    ["'neath", `${MLA}neath`],
    ["'til", `${MLA}til`],
  ])('leading contraction "%s"', (input, expected) => {
    expectQuotes(input, expected)
  })

  it("mid-sentence leading apostrophe", () => {
    expect(niceQuotes("It was 'twas the night")).toContain(`${MLA}twas`)
  })

  it("multiple leading apostrophes (no closing quote ahead)", () => {
    expectQuotes("'twas the night, 'twas indeed", `${MLA}twas the night, ${MLA}twas indeed`)
  })

  it("inside double quotes", () => {
    expectQuotes(`"'twas the night"`, `${LDQ}${MLA}twas the night${RDQ}`)
  })
})

// ─── Regex step ordering verification ───────────────────────────────────────

describe("STRESS: Regex step ordering", () => {
  it("possessive runs before closing: dog's → MLA (not RSQ)", () => {
    // Without possessive running first, closing regex would match (followed by space)
    expectQuotes("the dog's bone", `the dog${MLA}s bone`)
  })

  it("closing runs after possessive: trailing ' → RSQ", () => {
    expectQuotes("end'", `end${RSQ}`)
  })

  it("contraction runs after both: mid-word ' → MLA", () => {
    expectQuotes("don't", `don${MLA}t`)
  })
})

// ─── Pathological inputs ────────────────────────────────────────────────────

describe("STRESS: Pathological inputs (backtracking protection)", () => {
  it("handles 1500-char input without closing quote (hits 1000-char lookahead limit)", () => {
    const input = `'${"a".repeat(1500)}`
    const start = performance.now()
    const result = niceQuotes(input)
    expect(performance.now() - start).toBeLessThan(1000)
    expect(niceQuotes(result)).toBe(result)
  })

  it("handles 16 rapid apostrophes", () => {
    const input = "a'b'c'd'e'f'g'h'i'j'k'l'm'n'o'p"
    const start = performance.now()
    const result = niceQuotes(input)
    expect(performance.now() - start).toBeLessThan(1000)
    expect(result).not.toContain("'")
    expect(niceQuotes(result)).toBe(result)
  })

  it("handles alternating quotes and spaces", () => {
    const input = "' ' ' ' ' ' ' ' ' '"
    const start = performance.now()
    const result = niceQuotes(input)
    expect(performance.now() - start).toBeLessThan(1000)
    expect(niceQuotes(result)).toBe(result)
  })

  it("handles 500-char word + possessive", () => {
    const input = `${"a".repeat(500)}'s thing`
    const result = niceQuotes(input)
    expect(result).toContain(MLA)
  })
})

// ─── Complex combined scenarios ─────────────────────────────────────────────

describe("STRESS: Kitchen sink — all features combined", () => {
  it("dialogue with possessives, contractions, and 'n'", () => {
    expectQuotes(
      `"I can't find O'Brien's cat," she said. "It's the dog's fault."`,
      `${LDQ}I can${MLA}t find O${MLA}Brien${MLA}s cat,${RDQ} she said. ${LDQ}It${MLA}s the dog${MLA}s fault.${RDQ}`,
    )
  })

  it("nested quotes with contractions", () => {
    expectQuotes(
      `"She said, 'I can't go,' and left."`,
      `${LDQ}She said, ${LSQ}I can${MLA}t go,${RSQ} and left.${RDQ}`,
    )
  })

  it("'n' abbreviation in dialogue", () => {
    expectQuotes(
      `"Rock 'n' Roll is great," she said.`,
      `${LDQ}Rock ${MLA}n${MLA} Roll is great,${RDQ} she said.`,
    )
  })

  it("all types in one sentence (decade, O'Brien, 'n', contraction)", () => {
    expectQuotes(
      `He said, "the '90s were O'Brien's favorite decade, weren't they?"`,
      `He said, ${LDQ}the ${MLA}90s were O${MLA}Brien${MLA}s favorite decade, weren${MLA}t they?${RDQ}`,
    )
  })

  it("possessive plural + contraction in dialogue", () => {
    const result = niceQuotes(`"The dogs' bones aren't here," she said.`)
    expect(result).toContain(`dogs${RSQ}`)
    expect(result).toContain(`aren${MLA}t`)
  })

  it("kitchen sink with known '90s limitation", () => {
    const input = `"O'Brien's fish 'n' chips shop in the '90s wasn't the dogs' favorite," she said, 'twas better.`
    const result = niceQuotes(input)
    expect(result).toContain(`O${MLA}Brien${MLA}s`)
    expect(result).toContain(`fish ${MLA}n${MLA} chips`)
    // '90s → LSQ (closing quote at dogs' visible in lookahead — known limitation)
    expect(result).toContain(`${LSQ}90s`)
    expect(result).toContain(`wasn${MLA}t`)
    expect(result).toContain(`dogs${RSQ}`)
    expect(result).toContain(`${MLA}twas`)
    expect(niceQuotes(result)).toBe(result)
  })

  it("nested quotes with all apostrophe types", () => {
    const input = `"She said, 'O'Brien's '90s Rock 'n' Roll wasn't bad.'"`
    const result = niceQuotes(input)
    expect(result).toContain(LDQ)
    expect(result).toContain(RDQ)
    expect(result).toContain(`O${MLA}Brien${MLA}s`)
    expect(result).toContain(`${MLA}n${MLA}`)
    expect(result).toContain(`wasn${MLA}t`)
    expect(niceQuotes(result)).toBe(result)
  })

  it("'n' inside double quotes with possessives", () => {
    expectQuotes(
      `"Rock 'n' Roll's greatest hits."`,
      `${LDQ}Rock ${MLA}n${MLA} Roll${MLA}s greatest hits.${RDQ}`,
    )
  })
})
