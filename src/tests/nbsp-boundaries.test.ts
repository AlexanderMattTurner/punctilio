import {
  nbspAfterCopyrightSymbols,
  nbspAfterHonorifics,
  nbspAfterReferenceAbbreviations,
  nbspAfterSectionSymbols,
  nbspAfterShortWords,
  nbspBeforeLastWord,
  nbspBetweenInitials,
  nbspBetweenNumberAndUnit,
} from "../nbsp.js"
import { UNICODE_SYMBOLS } from "../constants.js"
import type { ProseView } from "../prose-view.js"
import { SEP as S, viewTransform } from "./test-helpers.js"

const { NBSP, COPYRIGHT } = UNICODE_SYMBOLS

type Fn = (view: ProseView) => void

/**
 * Boundary-tolerance fidelity: each v4 `${sep}?` slot tolerates exactly one
 * node boundary; two adjacent boundaries (or a boundary inside a literal/word)
 * block the match. These cases exercise the ProseView `allowBoundaries` paths
 * and the re-anchoring driver that the byte-identity corpus tests don't reach.
 */
describe("nbsp boundary tolerance", () => {
  it.each<[string, Fn, string, string]>([
    // One boundary in a `${sep}?` slot is tolerated.
    ["shortWord marker", nbspAfterShortWords, `a${S} cat`, `a${S}${NBSP}cat`],
    ["number/unit marker1", nbspBetweenNumberAndUnit, `5${S} kg`, `5${S}${NBSP}kg`],
    ["number/unit marker2", nbspBetweenNumberAndUnit, `5 ${S}kg`, `5${NBSP}${S}kg`],
    ["abbrev marker", nbspAfterReferenceAbbreviations, `Fig.${S} 1`, `Fig.${S}${NBSP}1`],
    ["abbrev lookahead", nbspAfterReferenceAbbreviations, `Fig. ${S}1`, `Fig.${NBSP}${S}1`],
    ["section marker", nbspAfterSectionSymbols, `§${S} 5`, `§${S}${NBSP}5`],
    ["honorific lookahead", nbspAfterHonorifics, `Dr. ${S}Smith`, `Dr.${NBSP}${S}Smith`],
    ["copyright lookahead", nbspAfterCopyrightSymbols, `${COPYRIGHT} ${S}2024`, `${COPYRIGHT}${NBSP}${S}2024`],
    ["initials marker", nbspBetweenInitials, `J.${S} K. R`, `J.${S}${NBSP}K.${NBSP}R`],
    // One boundary before the trailing `\n\n` is tolerated (ending `sep?`).
    ["lastWord ending \\n\\n", nbspBeforeLastWord, `the end${S}\n\nNew x`, `the${NBSP}end${S}\n\nNew${NBSP}x`],
    // A boundary directly before the space stands in for `(?<=\w|sep)` even when
    // the preceding clean char is not a word char.
    ["lastWord sep-lookbehind", nbspBeforeLastWord, `ab.${S} cd`, `ab.${S}${NBSP}cd`],
  ])("tolerates one boundary: %s", (_label, fn, input, expected) => {
    expect(viewTransform(fn, input)).toBe(expected)
  })

  it.each<[string, Fn, string]>([
    // Two adjacent boundaries in a slot block the match (single-boundary budget).
    ["shortWord marker x2", nbspAfterShortWords, `a${S}${S} cat`],
    ["number/unit marker1 x2", nbspBetweenNumberAndUnit, `5${S}${S} kg`],
    ["number/unit marker2 x2", nbspBetweenNumberAndUnit, `5 ${S}${S}kg`],
    ["abbrev lookahead x2", nbspAfterReferenceAbbreviations, `Fig. ${S}${S}1`],
    ["section lookahead x2", nbspAfterSectionSymbols, `§ ${S}${S}5`],
    // Two boundaries before end-of-text block the lastWord ending `sep?`.
    ["lastWord ending x2", nbspBeforeLastWord, `the end${S}${S}`],
    // A boundary inside a literal/word blocks (literal must be contiguous).
    ["boundary inside unit", nbspBetweenNumberAndUnit, `5 k${S}g`],
    ["boundary inside shortWord", nbspAfterShortWords, `a${S}n cat`],
    ["boundary inside lastWord", nbspBeforeLastWord, `hello wor${S}ld`],
  ])("blocks two-boundary / split-literal: %s", (_label, fn, input) => {
    expect(viewTransform(fn, input)).toBe(input)
  })

  it("re-anchors to a shorter abbreviation when a boundary splits the longer one", () => {
    // `Ca` + boundary + `p.` cannot match `Cap.`, but `p.` (a known abbreviation)
    // still matches after the boundary — reproducing the v4 sentinel-aware scan.
    expect(viewTransform(nbspAfterReferenceAbbreviations, `Ca${S}p. 1`)).toBe(`Ca${S}p.${NBSP}1`)
  })

  it("a boundary directly before a short word fails the lookbehind", () => {
    // The sentinel before the short word is not `^|space|punct|>`.
    expect(viewTransform(nbspAfterShortWords, `.${S}a cat`)).toBe(`.${S}a cat`)
  })

  it("a single-node view behaves like the plain-string path", () => {
    expect(viewTransform(nbspBetweenInitials, "J. K. R")).toBe(`J.${NBSP}K.${NBSP}R`)
    expect(viewTransform(nbspAfterShortWords, "a cat")).toBe(`a${NBSP}cat`)
  })

  it("a boundary breaks the NBSP cascade run, re-enabling the last-word match", () => {
    // `x` + NBSP + `word` would normally block (cascade), but a boundary between
    // the run and the space breaks `[NBSP][LATIN]{1,15}`.
    expect(viewTransform(nbspBeforeLastWord, `x${NBSP}word${S} end`))
      .toBe(`x${NBSP}word${S}${NBSP}end`)
    // Without the boundary, the cascade blocks the widow protection.
    expect(nbspBeforeLastWord(`x${NBSP}word end`)).toBe(`x${NBSP}word end`)
  })
})
