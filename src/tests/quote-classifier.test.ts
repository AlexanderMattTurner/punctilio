import { UNICODE_SYMBOLS } from "../constants.js"
import { transform } from "../index.js"
import { classifyApostrophes, niceQuotes, type PunctuationStyle } from "../quotes.js"
import { primeMarks } from "../symbols.js"
import { buildMixedContent, SEP, viewTransform } from "./test-helpers.js"

const {
  LEFT_DOUBLE_QUOTE,
  RIGHT_DOUBLE_QUOTE,
  LEFT_SINGLE_QUOTE,
  RIGHT_SINGLE_QUOTE,
  MODIFIER_LETTER_APOSTROPHE,
  LEFT_GUILLEMET,
  RIGHT_GUILLEMET,
  NBSP,
  NNBSP,
  PRIME,
  DOUBLE_PRIME,
} = UNICODE_SYMBOLS

describe("quote classifier role-stream regressions", () => {
  it("plural possessive before a period stays outside on first and second pass", () => {
    // The balance scan must relabel the closer an APOSTROPHE so American
    // placement never pulls the period inside — including on re-processing
    // the pass's own U+2019 output.
    const first = niceQuotes("the boys'.")
    expect(first).toBe(`the boys${RIGHT_SINGLE_QUOTE}.`)
    expect(niceQuotes(first)).toBe(first)
    expect(classifyApostrophes("the boys'.")).toBe(`the boys${MODIFIER_LETTER_APOSTROPHE}.`)
  })

  it("decade elision beats the spurious closer ahead: '90s tape'", () => {
    const first = niceQuotes("'90s tape'")
    expect(first).toBe(`${RIGHT_SINGLE_QUOTE}90s tape${RIGHT_SINGLE_QUOTE}`)
    expect(niceQuotes(first)).toBe(first)
    expect(classifyApostrophes("'90s tape'")).toBe(`${MODIFIER_LETTER_APOSTROPHE}90s tape${RIGHT_SINGLE_QUOTE}`)
  })

  it.each([
    // A quoted number is a quote pair, not a decade elision: the closing
    // quote directly after the digits disqualifies the elision shortcut.
    ["'37'", `${LEFT_SINGLE_QUOTE}37${RIGHT_SINGLE_QUOTE}`],
    ["'37' x", `${LEFT_SINGLE_QUOTE}37${RIGHT_SINGLE_QUOTE} x`],
    ["'90s' tape", `${LEFT_SINGLE_QUOTE}90s${RIGHT_SINGLE_QUOTE} tape`],
    // A still-straight quote after the digits halts the closer scan, so the
    // leading quote elides whether or not the shortcut fires.
    ["'37'x", `${RIGHT_SINGLE_QUOTE}37'x`],
    // Without its own closer the elision fires as before.
    ["'37 x", `${RIGHT_SINGLE_QUOTE}37 x`],
  ])("quoted numbers are not decade elisions: niceQuotes(%j) === %j", (input, expected) => {
    expect(niceQuotes(input)).toBe(expected)
    expect(niceQuotes(expected)).toBe(expected)
  })

  it("feet-inches stay primes through the full pipeline: 5'10\"", () => {
    const first = transform(`He is 5'10" tall`, { nbsp: false })
    expect(first).toBe(`He is 5${PRIME}10${DOUBLE_PRIME} tall`)
    expect(transform(first, { nbsp: false })).toBe(first)
  })

  it("niceQuotes converts prime candidates by default and leaves them with primes: false", () => {
    expect(niceQuotes('5\'10" tall')).toBe(`5${PRIME}10${DOUBLE_PRIME} tall`)
    expect(niceQuotes('5\'10" tall', { primes: false })).toBe(`5'10${RIGHT_DOUBLE_QUOTE} tall`)
    // classifyApostrophes never converts primes.
    expect(classifyApostrophes('5\'10" tall')).toBe(`5'10${RIGHT_DOUBLE_QUOTE} tall`)
  })

  it("multi-paragraph dialogue: every paragraph opens, only the last closes", () => {
    const first = niceQuotes('"Para one.\n\n"Para two.\n\n"Para three."')
    expect(first).toBe(
      `${LEFT_DOUBLE_QUOTE}Para one.\n\n${LEFT_DOUBLE_QUOTE}Para two.\n\n${LEFT_DOUBLE_QUOTE}Para three.${RIGHT_DOUBLE_QUOTE}`
    )
    expect(niceQuotes(first)).toBe(first)
  })

  it.each([
    ["the boys'.", "american"],
    ["the boys'.", "british"],
    ["'90s tape'", "american"],
    [`He is 5'10" tall`, "american"],
    ['"Para one.\n\n"Para two.\n\n"Para three."', "american"],
    [`"She said 'hello,' didn't she?"`, "german"],
    [`"She said 'hello,' didn't she?"`, "french"],
    [`Er sagte: "Sie rief 'Halt!' und ging."`, "german"],
    [`"C'est 'la vie,'" dit-elle.`, "french"],
  ] as [string, PunctuationStyle][])(
    "transform is a fixed point on its own output: %s (%s)",
    (input, punctuationStyle) => {
      const first = transform(input, { punctuationStyle })
      expect(transform(first, { punctuationStyle })).toBe(first)
    }
  )
})

describe("boundary-sensitive edges (ports of v4 sentinel behavior)", () => {
  it.each([
    // Possessive lookbehind sees through a single boundary; two adjacent
    // boundaries block the s-lookahead exactly as two sentinels did.
    [`dog${SEP}${SEP}'s bone`, `dog${SEP}${SEP}${MODIFIER_LETTER_APOSTROPHE}s bone`],
    [`dog'${SEP}${SEP}s bone`, `dog'${SEP}${SEP}s bone`],
    // End-of-input closer tolerates one trailing boundary, not two.
    [`"hi"${SEP}`, `${LEFT_DOUBLE_QUOTE}hi${RIGHT_DOUBLE_QUOTE}${SEP}`],
    [`"hi"${SEP}${SEP}`, `${LEFT_DOUBLE_QUOTE}hi${RIGHT_DOUBLE_QUOTE}${SEP}${SEP}`],
    // A bare boundary before a double quote is an opener prefix.
    [`say${SEP}"hi"`, `say${SEP}${LEFT_DOUBLE_QUOTE}hi${RIGHT_DOUBLE_QUOTE}`],
    // Opener arm 1: boundary then space after the quote.
    [`x "${SEP} y"`, `x ${LEFT_DOUBLE_QUOTE}${SEP} y${RIGHT_DOUBLE_QUOTE}`],
    // Contraction lookbehind is not boundary-transparent, but the possessive
    // lookbehind treats the boundary as an ordinary non-space character.
    [`can't${SEP}${SEP} stop`, `can${MODIFIER_LETTER_APOSTROPHE}t${SEP}${SEP} stop`],
  ])("classifyApostrophes(%j) === %j", (input, expected) => {
    expect(viewTransform(classifyApostrophes, input, SEP)).toBe(expected)
  })

  it.each([
    // Two boundaries between digit and quote block the prime candidate.
    [`5${SEP}${SEP}' tall`, `5${SEP}${SEP}' tall`],
    // A boundary after the quote passes the not-a-letter lookahead.
    [`5'${SEP}x`, `5${PRIME}${SEP}x`],
  ])("primeMarks(%j) === %j", (input, expected) => {
    expect(viewTransform(primeMarks, input, SEP)).toBe(expected)
  })

  it.each([
    // Two boundaries before an eligible single quote block the opener rule
    // (the quote survives straight: a closer lies ahead so it is no elision).
    [`x${SEP}${SEP}'a b' c`, `x${SEP}${SEP}'a b${RIGHT_SINGLE_QUOTE} c`],
    // One boundary stays transparent, and a boundary after the quote
    // satisfies the opener's non-space lookahead.
    [`'${SEP}a b' c`, `${LEFT_SINGLE_QUOTE}${SEP}a b${RIGHT_SINGLE_QUOTE} c`],
    // Opener arm 1 with a comma after the boundary.
    [`x "${SEP}, y"`, `x ${LEFT_DOUBLE_QUOTE}${SEP}, y${RIGHT_DOUBLE_QUOTE}`],
    // Two boundaries after a double quote fail both opener arms, but the
    // bare-boundary prefix lets the second fragment open it via context.
    [`x "${SEP}${SEP}y"`, `x ${LEFT_DOUBLE_QUOTE}${SEP}${SEP}y${RIGHT_DOUBLE_QUOTE}`],
    // The quoted-punctuation opener rule sees through boundaries: a quote
    // that merely starts a node after a word character closes even when a
    // later quote pair follows in the same block (quoted link titles).
    [`"${SEP}Reward${SEP}" x "y"`, `${LEFT_DOUBLE_QUOTE}${SEP}Reward${SEP}${RIGHT_DOUBLE_QUOTE} x ${LEFT_DOUBLE_QUOTE}y${RIGHT_DOUBLE_QUOTE}`],
    // ...while opener context on the far side of the boundary run still fires
    // the rule (space, opener char, or start of text).
    [`say ${SEP}"?" x`, `say ${SEP}${LEFT_DOUBLE_QUOTE}?${RIGHT_DOUBLE_QUOTE} x`],
    [`(${SEP}"?" x)`, `(${SEP}${LEFT_DOUBLE_QUOTE}?${RIGHT_DOUBLE_QUOTE} x)`],
    [`${SEP}"?" x`, `${SEP}${LEFT_DOUBLE_QUOTE}?${RIGHT_DOUBLE_QUOTE} x`],
    // 'n' lookahead without the trailing space is not the abbreviation.
    ["the 'n'y test b' c", `the ${LEFT_SINGLE_QUOTE}n${RIGHT_SINGLE_QUOTE}y test b${RIGHT_SINGLE_QUOTE} c`],
    // Brace quirk with no space.
    ['{"x"}', `{${LEFT_DOUBLE_QUOTE}x${RIGHT_DOUBLE_QUOTE}}`],
    // Brace quirk where the general opener rule fails (ending char after).
    ['{"}', `{${LEFT_DOUBLE_QUOTE}}`],
    ['{ ".', `{ ${LEFT_DOUBLE_QUOTE}.`],
    // A surviving straight quote followed by a space never opens: the curly
    // closer ahead keeps the elision pass away, and the opener rule requires
    // a non-space follower.
    [`x ' b${RIGHT_SINGLE_QUOTE} c`, `x ' b${RIGHT_SINGLE_QUOTE} c`],
  ])("niceQuotes(%j) === %j", (input, expected) => {
    expect(viewTransform(niceQuotes, input, SEP)).toBe(expected)
  })

  it("a single-node view behaves like the plain-string path", () => {
    expect(viewTransform(niceQuotes, '"x"')).toBe(`${LEFT_DOUBLE_QUOTE}x${RIGHT_DOUBLE_QUOTE}`)
    expect(viewTransform(niceQuotes, "don't")).toBe(`don${RIGHT_SINGLE_QUOTE}t`)
    expect(viewTransform(primeMarks, "5'")).toBe(`5${PRIME}`)
  })
})

describe("classifier quirks carried over from v4", () => {
  it("a straight single quote directly before a closing double quote closes", () => {
    // The second ' survives every single-quote rule (blocked lookbehind,
    // closer visible ahead, no opener context) and is resolved by the
    // '-before-CLOSE_DOUBLE rule.
    expect(niceQuotes(`b''" x${RIGHT_SINGLE_QUOTE} y`)).toBe(
      `b'${RIGHT_SINGLE_QUOTE}${RIGHT_DOUBLE_QUOTE} x${RIGHT_SINGLE_QUOTE} y`
    )
  })

  it("leading-elision closer scan accepts a closer with a possessive s", () => {
    expect(niceQuotes(`'abc 5${RIGHT_SINGLE_QUOTE}s end`)).toBe(
      `${LEFT_SINGLE_QUOTE}abc 5${RIGHT_SINGLE_QUOTE}s end`
    )
  })

  it("british outside-moves merge into one insertion after the quote run", () => {
    // The period moves out first, then the comma lands between the closer and
    // the period — both anchored at the same offset.
    expect(niceQuotes('x,."', { punctuationStyle: "british" })).toBe(
      `x${RIGHT_DOUBLE_QUOTE},.`
    )
  })

  it("empty double-quote pair context checks at string edges", () => {
    expect(niceQuotes('"" x')).toBe(`${LEFT_DOUBLE_QUOTE}${RIGHT_DOUBLE_QUOTE} x`)
    expect(niceQuotes('("")')).toBe(`(${LEFT_DOUBLE_QUOTE}${RIGHT_DOUBLE_QUOTE})`)
  })

  it("french pre-label accepts unpadded and NBSP-padded guillemets", () => {
    const rendered = `${LEFT_GUILLEMET}${NNBSP}Bonjour${NNBSP}${RIGHT_GUILLEMET}`
    expect(niceQuotes(`${LEFT_GUILLEMET}Bonjour${RIGHT_GUILLEMET}`, { punctuationStyle: "french" })).toBe(rendered)
    expect(niceQuotes(`${LEFT_GUILLEMET}${NBSP}Bonjour${NBSP}${RIGHT_GUILLEMET}`, { punctuationStyle: "french" })).toBe(rendered)
  })
})

describe("fuzz: transform is a fixed point on mixed content", () => {
  const styles: PunctuationStyle[] = ["american", "british", "german", "french", "none"]
  const seeds = Array.from({ length: 60 }, (_, i) => `fuzz-${i}`)

  it.each(styles)("style %s", (punctuationStyle) => {
    for (const seed of seeds) {
      const input = buildMixedContent(400, seed)
      const first = transform(input, { punctuationStyle })
      const second = transform(first, { punctuationStyle })
      if (second !== first) {
        throw new Error(
          `transform not idempotent (style ${punctuationStyle}, seed ${seed})\n` +
          `first:  ${JSON.stringify(first)}\nsecond: ${JSON.stringify(second)}`
        )
      }
    }
  })
})
