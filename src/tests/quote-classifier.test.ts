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
  DOUBLE_LOW_9_QUOTE,
  ELLIPSIS,
  MULTIPLICATION,
  EM_DASH,
  APPROXIMATE,
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

  it.each([
    ["5'000", `5${RIGHT_SINGLE_QUOTE}000`],
    ["1'000'000", `1${RIGHT_SINGLE_QUOTE}000${RIGHT_SINGLE_QUOTE}000`],
    ["CHF 5'000.50", `CHF 5${RIGHT_SINGLE_QUOTE}000.50`],
    // Not a three-digit group, so still a foot/minute prime.
    ["5'0", `5${PRIME}0`],
  ])("Swiss thousands separators curl to apostrophes, not primes: %j", (input, expected) => {
    const first = transform(input, { nbsp: false })
    expect(first).toBe(expected)
    expect(transform(first, { nbsp: false })).toBe(first)
  })

  it("keeps feet-inches as primes even next to a thousands-grouped number", () => {
    expect(transform(`5'000 at 6'2" tall`, { nbsp: false })).toBe(
      `5${RIGHT_SINGLE_QUOTE}000 at 6${PRIME}2${DOUBLE_PRIME} tall`,
    )
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
    // A closing double quote isolated in its own node (a boundary on each side,
    // e.g. `"Hi<sup>"</sup>there`) closes the open quotation. The bare-boundary
    // opener prefix must not turn it into a second opener while a quote is open.
    [`"Hi${SEP}"${SEP}there`, `${LEFT_DOUBLE_QUOTE}Hi${SEP}${RIGHT_DOUBLE_QUOTE}${SEP}there`],
    [`"Hi${SEP}"${SEP} there`, `${LEFT_DOUBLE_QUOTE}Hi${SEP}${RIGHT_DOUBLE_QUOTE}${SEP} there`],
    // ...but at depth zero the same isolated position is still a valid opener.
    [`a ${SEP}"${SEP}quote"`, `a ${SEP}${LEFT_DOUBLE_QUOTE}${SEP}quote${RIGHT_DOUBLE_QUOTE}`],
    // A continued opener separated from its space by an inline-element boundary
    // (`"Para one <em>"Para two</em>`) still opens: real opener context sits
    // across the boundary, so it matches the single-node reading, not a closer.
    [`"Para one ${SEP}"Para two"`, `${LEFT_DOUBLE_QUOTE}Para one ${SEP}${LEFT_DOUBLE_QUOTE}Para two${RIGHT_DOUBLE_QUOTE}`],
    // A fresh pair after the first closes opens again from a boundary-isolated node.
    [`"a" and ${SEP}"${SEP}b"`, `${LEFT_DOUBLE_QUOTE}a${RIGHT_DOUBLE_QUOTE} and ${SEP}${LEFT_DOUBLE_QUOTE}${SEP}b${RIGHT_DOUBLE_QUOTE}`],
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

  describe("fold-stable gates and placement guards", () => {
    // Each output is a fixed point: rules that read characters a later pass
    // folds (`×`, `≠`, `…`, superscripts) or that relocate punctuation decide
    // the way a re-run of the rendered text would.
    it.each<[string, PunctuationStyle, string]>([
      // `!=` folds to `≠`, which is not an ending char: openers open past
      // it, closers do not close on it (`!==` never folds and still blocks).
      ['"!=x', "american", `${LEFT_DOUBLE_QUOTE}!=x`],
      ['"!==x', "american", '"!==x'],
      [`".'!=`, "german", `".${RIGHT_SINGLE_QUOTE}!=`],
      // A spaced dot triple folds to `…`, which the opener arm reads through.
      ['". . .x', "american", `${LEFT_DOUBLE_QUOTE}. . .x`],
      // Inside moves: punctuation this pass relocates stops blocking the
      // terminal lookbehind of later runs, and the movers iterate to a
      // fixed point.
      ['"".".', "american", `${LEFT_DOUBLE_QUOTE}.${RIGHT_DOUBLE_QUOTE}.${RIGHT_DOUBLE_QUOTE}`],
      ['"",".', "american", `${LEFT_DOUBLE_QUOTE},${RIGHT_DOUBLE_QUOTE}.${RIGHT_DOUBLE_QUOTE}`],
      // Inside moves stay put when the landing or removal site would re-read
      // differently: completing `'s` + ending, completing a dot triple, or
      // vacating the `.` that blocks a number range.
      [`".'s'.`, "american", `".'s${RIGHT_SINGLE_QUOTE}.`],
      [`".. '.`, "american", `".. ${RIGHT_SINGLE_QUOTE}.`],
      [`'.3-3`, "american", `${RIGHT_SINGLE_QUOTE}.3-3`],
      // Outside moves: `…` blocks the movable-punctuation chain guards like
      // the dots it folds from; interleaved period+closer pairs don't cascade.
      [`x."${ELLIPSIS}`, "british", `x.${RIGHT_DOUBLE_QUOTE}${ELLIPSIS}`],
      [`${ELLIPSIS},"`, "british", `${ELLIPSIS},${RIGHT_DOUBLE_QUOTE}`],
      [`.'.'`, "british", `.${RIGHT_SINGLE_QUOTE}${RIGHT_SINGLE_QUOTE}.`],
      // German re-derivation guards: moves that would strip a single
      // closer's ending context, create a plural-possessive reading, or
      // expose an opener prefix stay put; input U+02BC re-derives like the
      // U+2019 it renders to; folded `×` reads as the letter it folds from.
      [`"a'.'`, "german", `${DOUBLE_LOW_9_QUOTE}a${LEFT_SINGLE_QUOTE}.${LEFT_SINGLE_QUOTE}`],
      [`as.'`, "german", `as.${LEFT_SINGLE_QUOTE}`],
      [`-."`, "german", `-.${LEFT_DOUBLE_QUOTE}`],
      [`x${MODIFIER_LETTER_APOSTROPHE}y`, "german", `x${RIGHT_SINGLE_QUOTE}y`],
      [`"3${MULTIPLICATION}''`, "german", `${DOUBLE_LOW_9_QUOTE}3${MULTIPLICATION}'${RIGHT_SINGLE_QUOTE}`],
      // An orphan single closer freezes punctuation placement in German:
      // moving the comma outward would let a re-run read the pair as a quoted
      // number (`'06,'` → opener) and oscillate, so the comma stays inside.
      [`'06,'`, "german", `${RIGHT_SINGLE_QUOTE}06,${LEFT_SINGLE_QUOTE}`],
      // French NNBSP padding: adjacent NBSPs absorb into the guillemet
      // render instead of oscillating with collapseSpaces, a space after a
      // classified opener reads as the opener, and the outside mover sees
      // through the space a padded closer will absorb.
      [`" "${EM_DASH}`, "french", `${LEFT_GUILLEMET}${NNBSP} ${NNBSP}${RIGHT_GUILLEMET}${EM_DASH}`],
      [`"a${NBSP}"`, "french", `${LEFT_GUILLEMET}${NNBSP}a${NNBSP}${RIGHT_GUILLEMET}`],
      [`"${NBSP}a"`, "french", `${LEFT_GUILLEMET}${NNBSP}a${NNBSP}${RIGHT_GUILLEMET}`],
      [`${LEFT_GUILLEMET}a. ${RIGHT_GUILLEMET}`, "french", `${LEFT_GUILLEMET}${NNBSP}a ${NNBSP}${RIGHT_GUILLEMET}.`],
    ])("%s (%s) renders a fixed point", (input, style, expected) => {
      const once = niceQuotes(input, { punctuationStyle: style })
      expect(once).toBe(expected)
      expect(niceQuotes(once, { punctuationStyle: style })).toBe(once)
    })

    it("a boundary stranded by a fold fails the opener prefix; an ordinary char before it passes", () => {
      // `~=` folds to `≈` consuming the junction boundary, so pass 1 (which
      // read the blocking `=` in the prefix slot) must agree with the re-run.
      expect(viewTransform((view) => niceQuotes(view), `${APPROXIMATE}${SEP}"x`)).toBe(`${APPROXIMATE}${SEP}"x`)
      expect(viewTransform((view) => niceQuotes(view), `x!${SEP}"y`)).toBe(`x!${SEP}"y`)
      expect(viewTransform((view) => niceQuotes(view), `a${SEP}"x`)).toBe(`a${SEP}${LEFT_DOUBLE_QUOTE}x`)
    })
  })

  it("british chained movable punctuation stays in place before the closer", () => {
    // Moving the period out would leave the comma group-adjacent to the run,
    // and the next run would move it too (one mark per run, a cascade); the
    // chain guard keeps both marks where they are.
    expect(niceQuotes('x,."', { punctuationStyle: "british" })).toBe(
      `x,.${RIGHT_DOUBLE_QUOTE}`
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

describe("transform idempotency edges (heavy-fuzz regressions)", () => {
  // A trailing multiplier before a curly apostrophe the quotes pass already
  // produced: rewriting the `x` to `×` would flip the following `${RIGHT_SINGLE_QUOTE}` from an
  // elision to a closer on re-run and relocate the trailing comma, so the
  // multiplication pass leaves the letter alone.
  it("american trailing multiplier before an elided apostrophe: 21707x',,", () => {
    const first = transform("21707x',,", { punctuationStyle: "american" })
    expect(first).toBe(`21707x${RIGHT_SINGLE_QUOTE},,`)
    expect(transform(first, { punctuationStyle: "american" })).toBe(first)
  })

  // An orphan German single closer keeps the comma inside so the pair is not
  // re-read as a quoted number (opener + closer) on the next run.
  it("german decade with a trailing orphan closer: —'06,'", () => {
    const first = transform(`${EM_DASH}'06,'`, { punctuationStyle: "german" })
    expect(first).toBe(`${EM_DASH}${RIGHT_SINGLE_QUOTE}06,${LEFT_SINGLE_QUOTE}`)
    expect(transform(first, { punctuationStyle: "german" })).toBe(first)
  })
})

describe("placement and opener stability across boundaries", () => {
  // Each case pins the fixed point of a fold/boundary configuration: the
  // first application must already produce the state a re-run reproduces.
  it.each([
    // The period's node empties if it moves, stacking two boundaries after
    // the closer; the leading-apostrophe scan then stops reading it as a
    // closer, so the period stays put.
    [`~'}'${SEP}.${SEP}`, `~'}${RIGHT_SINGLE_QUOTE}${SEP}.${SEP}`],
    // Same shape with a non-ending follower after the period.
    [`~'}'${SEP}.2`, `~'}${RIGHT_SINGLE_QUOTE}${SEP}.2`],
    // An ending follower keeps the run a closer for the scan, so the period
    // moves inside as usual.
    [`~'}'${SEP}.,`, `~'}.${RIGHT_SINGLE_QUOTE}${SEP},`],
    // Terminal punctuation blocks the inside move through one boundary, the
    // slot a ligature fold can pull it across.
    [`${UNICODE_SYMBOLS.QUESTION_EXCLAMATION}${SEP}",`, `${UNICODE_SYMBOLS.QUESTION_EXCLAMATION}${SEP}${RIGHT_DOUBLE_QUOTE},`],
    // A `!` behind one boundary marks a fold-stranded opener prefix (the
    // ligature pass folds `!`-runs across the edge), blocking the opener.
    [`!${SEP}!${SEP}""${SEP}`, `!${SEP}!${SEP}"${RIGHT_DOUBLE_QUOTE}${SEP}`],
    // The stranded-prefix lookbehind reads through stacked boundaries left
    // by emptied nodes.
    [`!${SEP}${SEP}""${SEP}`, `!${SEP}${SEP}"${RIGHT_DOUBLE_QUOTE}${SEP}`],
    // A dot triple split as `.` + boundary + `..` folds to an ellipsis, so
    // the closer reads its ending context through the gap.
    [`x".${SEP}..`, `x${RIGHT_DOUBLE_QUOTE}.${SEP}..`],
    // A double-only closing run is no closer for the single-quote scan, so
    // the unresolved straight quote does not pin the period.
    [`5'x${SEP}"q"${SEP}.2`, `5'x${SEP}${LEFT_DOUBLE_QUOTE}q${RIGHT_DOUBLE_QUOTE}${SEP}.2`],
    [`5'x${SEP}"q"${SEP}.z`, `5'x${SEP}${LEFT_DOUBLE_QUOTE}q.${RIGHT_DOUBLE_QUOTE}${SEP}z`],
    // A single trailing boundary keeps the run a closer for the re-run's
    // scan, so the period still moves inside.
    [`~'}'${SEP}.`, `~'}.${RIGHT_SINGLE_QUOTE}${SEP}`],
    // Two stacked boundaries hide the dot from the terminal lookbehind; the
    // landing-site dot-gap probe then reads through the boundary pair.
    [`q.${SEP}${SEP}".`, `q.${SEP}${SEP}.${RIGHT_DOUBLE_QUOTE}`],
  ])("niceQuotes(%j) === %j", (input, expected) => {
    const once = viewTransform(niceQuotes, input, SEP)
    expect(once).toBe(expected)
    expect(viewTransform(niceQuotes, once, SEP)).toBe(expected)
  })
})

describe("fold-stability of the != / ellipsis / possessive guards", () => {
  const { DOUBLE_PRIME } = UNICODE_SYMBOLS

  // A `"` whose following `!=` folds to `≠` (not an ending context) is not a
  // closing double, and a digit-led `"` candidate folds to a double prime
  // there rather than closing. Both decisions survive the `!=` → `≠` fold.
  it.each([
    [`x"!=y`, `x"!=y`],
    [`5"!=y`, `5${DOUBLE_PRIME}!=y`],
  ])("niceQuotes(%j) === %j", (input, expected) => {
    expect(niceQuotes(input)).toBe(expected)
    expect(niceQuotes(expected)).toBe(expected)
  })

  // An unresolved straight single quote pins a single closer's run; a `!=`
  // (folding to `≠`) after the period is no ending context, so the post-move
  // lookahead blocks the inside move.
  it("blocks the inside move when the post-move follower folds to not-equal", () => {
    const input = `~'}'${SEP}.!=2`
    const once = viewTransform(niceQuotes, input, SEP)
    expect(once).toBe(`~'}${UNICODE_SYMBOLS.RIGHT_SINGLE_QUOTE}${SEP}.!=2`)
    expect(viewTransform(niceQuotes, once, SEP)).toBe(once)
  })

  // French: a straight `"` one space after the opening guillemet absorbs into
  // the opener as a closer candidate.
  it.each([
    `${UNICODE_SYMBOLS.LEFT_GUILLEMET} "x`,
    // A straight quote in the absorbed-opener slot whose ending context makes
    // it a closer reads as a closing guillemet.
    `${UNICODE_SYMBOLS.LEFT_GUILLEMET} ".`,
  ])("french reads a straight quote after the opener padding as a closer slot: %j", (input) => {
    const once = niceQuotes(input, { punctuationStyle: "french" })
    expect(niceQuotes(once, { punctuationStyle: "french" })).toBe(once)
  })

  // More multi-node placement/prime fixed points pinning specific guards: a
  // backward dot-gap probe across a boundary, the post-move two-boundary
  // lookahead budget, a digit-led prime candidate whose `!=` follower folds
  // to `≠`, and a terminal lookbehind that skips a moved period behind the
  // fold-transparent boundary.
  it.each([
    [`'.${SEP}".`, `.${RIGHT_SINGLE_QUOTE}${SEP}.${RIGHT_DOUBLE_QUOTE}`],
    [`~'}'${SEP}.${SEP}${SEP}z`, `~'}${RIGHT_SINGLE_QUOTE}${SEP}.${SEP}${SEP}z`],
    [`("5"!=3)`, `(${LEFT_DOUBLE_QUOTE}5${UNICODE_SYMBOLS.DOUBLE_PRIME}!=3)`],
    [`'.${SEP}"`, `.${RIGHT_SINGLE_QUOTE}${SEP}${RIGHT_DOUBLE_QUOTE}`],
    // A dash directly after the period is a wall: the minus rule reads the
    // char left of the hyphen, and the moved period would change it.
    [`'.-2`, `${RIGHT_SINGLE_QUOTE}.-2`],
    // The decade-elision gate reads a folded word glyph like the word char
    // it folds from, so the apostrophe call is stable across the fold.
    [`{'39${UNICODE_SYMBOLS.MULTIPLICATION}${SEP}'`, `{'39${UNICODE_SYMBOLS.MULTIPLICATION}${SEP}${RIGHT_SINGLE_QUOTE}`],
  ])("niceQuotes(%j) === %j", (input, expected) => {
    const once = viewTransform(niceQuotes, input, SEP)
    expect(once).toBe(expected)
    expect(viewTransform(niceQuotes, once, SEP)).toBe(expected)
  })
})
