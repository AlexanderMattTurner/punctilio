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
 * - Character class boundary testing (digits, non-Latin, hyphens)
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

/** All stress tests use MLA mode to verify the apostrophe-vs-quote distinction. */
const MLA_OPTS = { useModifierLetterApostrophe: true } as const

/** Shorthand for niceQuotes with MLA enabled. */
function mla(input: string, opts?: QuoteOptions) {
  return niceQuotes(input, { ...MLA_OPTS, ...opts })
}

/** Assert correctness + idempotency in a single call. */
function expectQuotes(input: string, expected: string, opts?: QuoteOptions) {
  const merged = { ...MLA_OPTS, ...opts }
  const result = niceQuotes(input, merged)
  expect(result).toBe(expected)
  expect(niceQuotes(result, merged)).toBe(result)
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
    // R4: Hyphenated possessive
    ["mother-in-law's house", `mother-in-law${MLA}s house`],
    // R4: Accented Latin possessive
    ["café's menu", `café${MLA}s menu`],
    // R4: Adjacent possessives in sequence
    ["the cat's and dog's toys", `the cat${MLA}s and dog${MLA}s toys`],
    // R4: Contraction before sentence-final period
    ["I shouldn't.", `I shouldn${MLA}t.`],
    // R4: Double-quoted standalone contraction
    [`"can't"`, `${LDQ}can${MLA}t${RDQ}`],
    // R4: Contraction + digit context + second contraction
    ["it's 5 o'clock", `it${MLA}s 5 o${MLA}clock`],
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
    `l${MLA}homme d${MLA}accord`,
    `the dogs${RSQ} owner`,
    `${LSQ}hello${RSQ} ${LDQ}world${RDQ}`,
  ])('stable for: "%s"', (input) => {
    expect(mla(input)).toBe(input)
    expect(mla(mla(input))).toBe(input)
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
    const once = mla(input)
    const twice = mla(once)
    const thrice = mla(twice)
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
    // R4: RSQ possessive at end of string (contraction regex: Latin + RSQ + Latin)
    [`dog${RSQ}s`, `dog${MLA}s`],
  ])('normalizes "%s"', (input, expected) => {
    expectQuotes(input, expected)
  })

  it("does NOT normalize RSQ when it is a closing quote", () => {
    const input = `${LSQ}hello${RSQ} world`
    expect(mla(input)).toBe(input)
  })

  it("does not convert RSQ after non-Latin character", () => {
    const input = `[test]${RSQ}`
    expect(mla(input)).not.toContain(MLA)
  })
})

// ─── 'n' abbreviation boundaries ────────────────────────────────────────────

describe("STRESS: 'n' abbreviation boundaries", () => {
  it.each([
    ["quoted letter in word context (known false positive)", "the letter 'n' is common", `the letter ${MLA}n${MLA} is common`],
    ["uppercase 'N'", "Rock 'N' Roll", `Rock ${LSQ}N${RSQ} Roll`],
    ["multiple 'n' abbreviations", "Rock 'n' Roll and fish 'n' chips", `Rock ${MLA}n${MLA} Roll and fish ${MLA}n${MLA} chips`],
    // R4: 'n' handler uses \w (not LATIN_LETTERS), so digits satisfy lookbehind/lookahead
    ["digit neighbors (\\w includes digits)", "1 'n' 2", `1 ${MLA}n${MLA} 2`],
  ])('%s', (_label, input, expected) => {
    expectQuotes(input, expected)
  })

  it.each([
    ["start of string (no preceding word)", "'n' Roll"],
    ["end of string (no following word)", "Rock 'n'"],
    ["punctuation precedes first apostrophe", "said, 'n' is good"],
    ["newline replaces space", "Rock 'n'\nRoll"],
  ])('does not produce MLA-n-MLA: %s', (_label, input) => {
    expect(mla(input)).not.toContain(`${MLA}n${MLA}`)
  })

  it.each([
    ["Rock 'n'Roll", `Rock ${MLA}n${MLA}Roll`],
    ["Rock'n' Roll", undefined], // just verify it doesn't contain ʼnʼ
  ])("partial space: %s", (input, expected) => {
    const result = mla(input)
    if (expected) {
      expect(result).toBe(expected)
    } else {
      expect(result).not.toContain(`${MLA}n${MLA}`)
    }
    expect(mla(result)).toBe(result)
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
    // R4: Digit before possessive (possessiveSingle uses [^\s\u201C'] — matches digits)
    ["the 747's engine", `the 747${MLA}s engine`],
    // R4: Non-Latin (Cyrillic) before possessive (passes [^\s\u201C'] but not LATIN_LETTERS)
    ["Привет's", `Привет${MLA}s`],
  ])('%s', (input, expected) => {
    expectQuotes(input, expected)
  })
})

// ─── Ambiguous / tricky cases ───────────────────────────────────────────────

describe("STRESS: Ambiguous / tricky cases", () => {
  it.each([
    ["'the dog's'", `${LSQ}the dog${MLA}s${RSQ}`],
    ["a'b'c'd'e'f", `a${MLA}b${MLA}c${MLA}d${MLA}e${MLA}f`],
  ])('%s', (input, expected) => {
    expectQuotes(input, expected)
  })

  it.each([
    "'the dogs' bowl'",
    `"the dogs' owner"`,
    "a'''b",
  ])('stable: "%s"', (input) => {
    const result = mla(input)
    expect(mla(result)).toBe(result)
  })
})

// ─── Separator interactions ─────────────────────────────────────────────────

describe("STRESS: Separator interactions", () => {
  it.each([
    [`dog${SEP}'s bone`, `dog${SEP}${MLA}s bone`, "possessive across sep"],
    [`'hello${SEP}'`, `${LSQ}hello${SEP}${RSQ}`, "closing after sep"],
    [`${SEP}'hello'`, `${SEP}${LSQ}hello${RSQ}`, "opening after sep"],
    [`the dog'${SEP}s bone`, `the dog${MLA}${SEP}s bone`, "sep between apostrophe and s"],
    [`the dog's${SEP} bone`, `the dog${MLA}s${SEP} bone`, "sep after possessive 's"],
    [`the dog'${SEP}s${SEP} bone`, `the dog${MLA}${SEP}s${SEP} bone`, "sep both between and after"],
  ])('%s → %s (%s)', (input, expected) => {
    expectQuotes(input, expected, { separator: SEP })
  })

  it("'n' with separators around word boundaries", () => {
    const input = `Rock${SEP} 'n' ${SEP}Roll`
    const result = mla(input, { separator: SEP })
    expect(result).toContain(`${MLA}n${MLA}`)
    expect(mla(result, { separator: SEP })).toBe(result)
  })
})

// ─── Punctuation style with apostrophes ─────────────────────────────────────

describe("STRESS: Punctuation style — MLA excluded from period/comma movement", () => {
  it.each([
    // American: MLA period/comma stay put (MLA is not in the quote character class)
    [`the dog${MLA}s.`, `the dog${MLA}s.`, "american"],
    [`Brien${MLA}s,`, `Brien${MLA}s,`, "american"],
    [`Brien${MLA}s, hello`, `Brien${MLA}s, hello`, "american"],
    // American: RSQ period/comma move inside
    [`${LSQ}hello${RSQ}.`, `${LSQ}hello.${RSQ}`, "american"],
    [`${LSQ}hello${RSQ},`, `${LSQ}hello,${RSQ}`, "american"],
    // American: period inside closing DQ around possessive (straight → converted)
    [`"the dog's bone".`, `${LDQ}the dog${MLA}s bone.${RDQ}`, "american"],
    // British: MLA period stays put
    [`Brien${MLA}s.`, `Brien${MLA}s.`, "british"],
    // British: RSQ period moves outside
    [`${LSQ}hello.${RSQ}`, `${LSQ}hello${RSQ}.`, "british"],
    // British: MLA not in regex char class
    [`.${MLA}s`, `.${MLA}s`, "british"],
    // British: period outside closing DQ around possessive
    [`${LDQ}the dog${MLA}s bone.${RDQ}`, `${LDQ}the dog${MLA}s bone${RDQ}.`, "british"],
  ])('%s → %s (%s)', (input, expected, style) => {
    expectQuotes(input, expected, { punctuationStyle: style as "american" | "british" })
  })
})

// ─── Multi-line behavior ────────────────────────────────────────────────────

describe("STRESS: Multi-line behavior", () => {
  it.each([
    ["I can't\nbelieve it's\nnot butter", `I can${MLA}t\nbelieve it${MLA}s\nnot butter`],
    ["the dog's\nbone and\nthe cat's toy", `the dog${MLA}s\nbone and\nthe cat${MLA}s toy`],
    // Lookahead stops at newline → MLA + RSQ, not LSQ + RSQ
    ["'hello\nworld'", `${MLA}hello\nworld${RSQ}`],
  ])('multiline: "%s"', (input, expected) => {
    expectQuotes(input, expected)
  })

  it("complex multi-line is idempotent", () => {
    const input = "She said, 'I can't\ngo to O'Brien's\nfish 'n' chips shop.'"
    const first = mla(input)
    expect(mla(first)).toBe(first)
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
  ])('minimal "%s" → "%s"', (input, expected) => {
    expectQuotes(input, expected)
  })

  it("handles empty single quotes adjacent to words (stable)", () => {
    const result = mla("hello''world")
    expect(mla(result)).toBe(result)
  })

  it.each([
    ["'' hello", `${LSQ}${RSQ} hello`],
    ["hello ''", `hello ${LSQ}${RSQ}`],
    ["'' ''", `${LSQ}${RSQ} ${LSQ}${RSQ}`],
  ])('empty quotes: "%s"', (input, expected) => {
    expect(mla(input)).toBe(expected)
  })
})

// ─── Decade abbreviations (contexts beyond base tests) ──────────────────────

describe("STRESS: Decade abbreviations in extended contexts", () => {
  it("'00s (zeros)", () => {
    expectQuotes("the '00s", `the ${MLA}00s`)
  })

  it("multiple decades in one sentence", () => {
    const result = mla("The '60s, '70s, and '80s were different.")
    expect(result).toContain(`${MLA}60s`)
    expect(result).toContain(`${MLA}70s`)
    expect(result).toContain(`${MLA}80s`)
  })

  it("decade inside single quotes — known limitation", () => {
    const input = "she said 'the '90s were great'"
    const result = mla(input)
    // The apostropheRegex lookahead for 'the stops at the second straight '
    // (before 90s) without finding RSQ, so 'the → MLA.
    // For '90s, the lookahead sees RSQ at great' → opening quote (LSQ).
    expect(result).toContain(`${MLA}the`)
    expect(result).toContain(`${LSQ}90s`)
    expect(result).toContain(`great${RSQ}`)
    expect(mla(result)).toBe(result)
  })
})

// ─── 'twas-style leading apostrophes (extended) ─────────────────────────────

describe("STRESS: 'twas-style leading apostrophes in extended contexts", () => {
  it.each([
    ["'cause", `${MLA}cause`],
    ["'til", `${MLA}til`],
    ["'twas the night, 'twas indeed", `${MLA}twas the night, ${MLA}twas indeed`],
    [`"'twas the night"`, `${LDQ}${MLA}twas the night${RDQ}`],
  ])('"%s"', (input, expected) => {
    expectQuotes(input, expected)
  })

  it("mid-sentence leading apostrophe", () => {
    expect(mla("It was 'twas the night")).toContain(`${MLA}twas`)
  })
})

// ─── Pathological inputs ────────────────────────────────────────────────────

describe("STRESS: Pathological inputs (backtracking protection)", () => {
  it("handles 1500-char input without closing quote (hits 1000-char lookahead limit)", () => {
    const input = `'${"a".repeat(1500)}`
    const start = performance.now()
    const result = mla(input)
    expect(performance.now() - start).toBeLessThan(1000)
    expect(mla(result)).toBe(result)
  })

  it("handles 16 rapid apostrophes", () => {
    const input = "a'b'c'd'e'f'g'h'i'j'k'l'm'n'o'p"
    const start = performance.now()
    const result = mla(input)
    expect(performance.now() - start).toBeLessThan(1000)
    expect(result).not.toContain("'")
    expect(mla(result)).toBe(result)
  })

  it("handles alternating quotes and spaces", () => {
    const input = "' ' ' ' ' ' ' ' ' '"
    const start = performance.now()
    const result = mla(input)
    expect(performance.now() - start).toBeLessThan(1000)
    expect(mla(result)).toBe(result)
  })

  it("handles 500-char word + possessive", () => {
    const input = `${"a".repeat(500)}'s thing`
    const result = mla(input)
    expect(result).toContain(MLA)
  })
})

// ─── Complex combined scenarios ─────────────────────────────────────────────

describe("STRESS: Kitchen sink — all features combined", () => {
  it.each([
    [
      "dialogue with possessives, contractions, and 'n'",
      `"I can't find O'Brien's cat," she said. "It's the dog's fault."`,
      `${LDQ}I can${MLA}t find O${MLA}Brien${MLA}s cat,${RDQ} she said. ${LDQ}It${MLA}s the dog${MLA}s fault.${RDQ}`,
    ],
    [
      "nested quotes with contractions",
      `"She said, 'I can't go,' and left."`,
      `${LDQ}She said, ${LSQ}I can${MLA}t go,${RSQ} and left.${RDQ}`,
    ],
    [
      "'n' abbreviation in dialogue",
      `"Rock 'n' Roll is great," she said.`,
      `${LDQ}Rock ${MLA}n${MLA} Roll is great,${RDQ} she said.`,
    ],
    [
      "all types in one sentence (decade, O'Brien, 'n', contraction)",
      `He said, "the '90s were O'Brien's favorite decade, weren't they?"`,
      `He said, ${LDQ}the ${MLA}90s were O${MLA}Brien${MLA}s favorite decade, weren${MLA}t they?${RDQ}`,
    ],
    [
      "'n' inside double quotes with possessives",
      `"Rock 'n' Roll's greatest hits."`,
      `${LDQ}Rock ${MLA}n${MLA} Roll${MLA}s greatest hits.${RDQ}`,
    ],
  ])('%s', (_label, input, expected) => {
    expectQuotes(input, expected)
  })

  it("possessive plural + contraction in dialogue", () => {
    const result = mla(`"The dogs' bones aren't here," she said.`)
    expect(result).toContain(`dogs${RSQ}`)
    expect(result).toContain(`aren${MLA}t`)
  })

  it("kitchen sink with known '90s limitation", () => {
    const input = `"O'Brien's fish 'n' chips shop in the '90s wasn't the dogs' favorite," she said, 'twas better.`
    const result = mla(input)
    expect(result).toContain(`O${MLA}Brien${MLA}s`)
    expect(result).toContain(`fish ${MLA}n${MLA} chips`)
    // '90s → LSQ (closing quote at dogs' visible in lookahead — known limitation)
    expect(result).toContain(`${LSQ}90s`)
    expect(result).toContain(`wasn${MLA}t`)
    expect(result).toContain(`dogs${RSQ}`)
    expect(result).toContain(`${MLA}twas`)
    expect(mla(result)).toBe(result)
  })
})
