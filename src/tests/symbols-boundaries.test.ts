import {
  arrows,
  degrees,
  ellipsis,
  fractions,
  mathSymbols,
  multiplication,
  punctuationLigatures,
  superscriptOrdinal,
} from "../symbols.js"
import { legalSymbols } from "../symbols.js"
import { UNICODE_SYMBOLS } from "../constants.js"
import { SEP as S, viewTransform } from "./test-helpers.js"

const {
  MULTIPLICATION: X,
  ELLIPSIS,
  NOT_EQUAL,
  LESS_EQUAL,
  PLUS_MINUS,
  DEGREE,
  FRACTION_1_2,
  FRACTION_1_4,
  ARROW_RIGHT,
  ARROW_LEFT,
  ARROW_LEFT_RIGHT,
  DOUBLE_QUESTION,
  SUPERSCRIPT_ND,
  COPYRIGHT,
} = UNICODE_SYMBOLS

// These exercise the boundary-tolerance paths added when the passes moved onto
// the ProseView layer: a single node boundary at a v4 weave position is
// tolerated, two adjacent boundaries (v4's single `${chr}?`) block, and a
// boundary inside a digit run / unit / lookaround re-derives v4's behavior.

describe("multiplication boundary tolerance", () => {
  it.each([
    // Boundary splitting a digit operand keeps the chain v4 saw: 0x stays hex.
    [`1${S}0x2${S}0x30`, `1${S}0x2${S}0x30`],
    // Boundary breaks the 0x hex token, so the operator converts.
    [`0${S}x5F`, `0${S}${X}5F`],
    [`0${S}x`, `0${S}${X}`],
    // Boundary shadows the scientific-notation lookbehind (`(?<!\d[eE])`).
    [`1e${S}5x3`, `1e${S}5${X}3`],
    // Boundary inside an operand re-anchors the chain at the next operand.
    [`12x3${S}4x5`, `12${X}3${S}4${X}5`],
    // Two adjacent boundaries before the operator block the operator slot.
    [`5${S}${S}x5`, `5${S}${S}x5`],
    // One boundary after the operator is tolerated.
    [`10x${S}20x30`, `10${X}${S}20${X}30`],
    // Two boundaries before a unit suffix detach the operator.
    [`210${S}${S}mm*1999`, `210${S}${S}mm*1999`],
    // Two boundaries before a prime suffix detach the operator.
    [`5${S}${S}″x4th`, `5${S}${S}″x4th`],
    // Trailing multiplier: one boundary before/after the operator.
    [`2${S}x`, `2${S}${X}`],
    [`2x${S}`, `2${X}${S}`],
    // A word character after the trailing operator (through a boundary) blocks.
    [`2x${S}a`, `2x${S}a`],
    // Scientific-notation lookbehind fires with no boundary present.
    [`1e5x3`, `1e5x3`],
    // Hex stays hex with no boundary breaking the `0x`.
    [`0x5`, `0x5`],
    // A boundary inside a multi-letter unit detaches the operator.
    [`10c${S}mx3`, `10c${S}mx3`],
    // A boundary inside the operator's spacing slot blocks conversion.
    [`5 ${S}x 5`, `5 ${S}x 5`],
    // Trailing `*` is not a word character, so it never converts.
    [`5*`, `5*`],
    // A `0` operand with a unit before the operator is not hex.
    [`0mm x 5`, `0mm ${X} 5`],
  ])("converts %j to %j", (input, expected) => {
    expect(viewTransform(multiplication, input)).toBe(expected)
  })

  it("a single-node view matches the string path", () => {
    expect(viewTransform(multiplication, "5x5")).toBe(`5${X}5`)
  })
})

describe("mathSymbols boundary tolerance", () => {
  it.each([
    [`!${S}=`, `${NOT_EQUAL}${S}`],
    // Two adjacent boundaries between the operator chars block the match.
    [`!${S}${S}=`, `!${S}${S}=`],
    // Two boundaries before the forbidden `=` let the lookahead pass.
    [`<=${S}${S}=`, `${LESS_EQUAL}${S}${S}=`],
    // A boundary inside the multi-character left `+/` breaks the operator.
    [`+${S}/-`, `+${S}/-`],
    [`+/${S}-`, `${PLUS_MINUS}${S}`],
    // A boundary before the match (outside its span) does not block conversion.
    [`x${S}!=`, `x${S}${NOT_EQUAL}`],
  ])("converts %j to %j", (input, expected) => {
    expect(viewTransform(mathSymbols, input)).toBe(expected)
  })
})

describe("degrees boundary tolerance", () => {
  it.each([
    // A boundary after the unit shadows the `#` compound guard.
    [`20C${S}#`, `20 ${DEGREE}C${S}#`],
    [`20C${S}${S}#`, `20 ${DEGREE}C${S}${S}#`],
    // A boundary between the digit and the unit is tolerated.
    [`100${S} C`, `100${S} ${DEGREE}C`],
    // A boundary between the space and the unit blocks the match.
    [`100 ${S}C`, `100 ${S}C`],
    // `C` directly before a hyphen-letter compound is not a temperature.
    [`20C-x`, `20C-x`],
    // `C` before a hyphen-digit is still a temperature (not a compound word).
    [`20C-5`, `20 ${DEGREE}C-5`],
  ])("converts %j to %j", (input, expected) => {
    expect(viewTransform(degrees, input)).toBe(expected)
  })
})

describe("fractions boundary tolerance", () => {
  it.each([
    // A boundary shadows the numerator lookbehind `(?<![/.\d])`.
    [`3.${S}1/4`, `3.${S}${FRACTION_1_4}`],
    [`1${S}/2`, `${S}${FRACTION_1_2}`],
    // Two adjacent boundaries at the slash slot block the fraction.
    [`1/${S}${S}2`, `1/${S}${S}2`],
    // A boundary breaks the `\.\d` lookahead, so the fraction converts.
    [`1/2${S}.5`, `${FRACTION_1_2}${S}.5`],
    // A boundary strictly inside the numerator (not at the slash) blocks it.
    // (Multi-digit numerators never match, but a leading boundary is allowed.)
    [`x${S}1/2`, `x${S}${FRACTION_1_2}`],
  ])("converts %j to %j", (input, expected) => {
    expect(viewTransform(fractions, input)).toBe(expected)
  })
})

describe("ellipsis boundary tolerance", () => {
  it.each([
    [`.${S}..`, `${ELLIPSIS}${S}`],
    // Two adjacent boundaries in a gap block the fold.
    [`..${S}${S}.`, `..${S}${S}.`],
    // A space-plus-boundary gap does not fold.
    [`. ${S}. .`, `. ${S}. .`],
    // A boundary after the ellipsis blocks the trailing space.
    [`...${S}a`, `${ELLIPSIS}${S}a`],
  ])("converts %j to %j", (input, expected) => {
    expect(viewTransform(ellipsis, input)).toBe(expected)
  })
})

describe("arrows boundary tolerance", () => {
  it.each([
    // A boundary splitting the dash run matches only the valid suffix.
    [`--${S}->`, `--${S}${ARROW_RIGHT}`],
    [`-${S}${S}->`, `-${S}${S}${ARROW_RIGHT}`],
    [`<${S}-> `, `${ARROW_LEFT_RIGHT}${S} `],
    // Two boundaries after `<` block the bidi shape; `->` still matches as a
    // right arrow.
    [`a <${S}${S}-> b`, `a <${S}${S}${ARROW_RIGHT} b`],
    [`a <${S}${S}- b`, `a <${S}${S}- b`],
    [`a -${S}${S}> b`, `a -${S}${S}> b`],
    // Left arrow with one boundary after `<`.
    [`a <${S}- b`, `a ${ARROW_LEFT}${S} b`],
    // `<` with no dash run matches no arrow shape.
    [`a < b`, `a < b`],
    [`a <> b`, `a <> b`],
  ])("converts %j to %j", (input, expected) => {
    expect(viewTransform(arrows, input)).toBe(expected)
  })
})

describe("legalSymbols boundary-measured context window", () => {
  it.each([
    // A long boundary-free path keeps the slash inside the 25-char window, so
    // the path context blocks the conversion.
    [`a/${"x".repeat(23)}(c) 2024`, `a/${"x".repeat(23)}(c) 2024`],
    // A boundary inside the path costs window space, pushing the slash out so
    // the year evidence converts it.
    [`a/${S}${"x".repeat(23)}(c) 2024`, `a/${S}${"x".repeat(23)}${COPYRIGHT} 2024`],
  ])("converts %j to %j", (input, expected) => {
    expect(viewTransform(legalSymbols, input)).toBe(expected)
  })
})

describe("punctuationLigatures boundary tolerance", () => {
  it.each([
    [`?${S}?`, `${DOUBLE_QUESTION}${S}`],
    // Two adjacent boundaries break the repeat run.
    [`?${S}${S}?`, `?${S}${S}?`],
    [`?${S}?${S}?`, `${DOUBLE_QUESTION}${S}${S}`],
  ])("converts %j to %j", (input, expected) => {
    expect(viewTransform(punctuationLigatures, input)).toBe(expected)
  })
})

describe("superscriptOrdinal boundary tolerance", () => {
  it.each([
    [`2${S}nd`, `2${S}${SUPERSCRIPT_ND}`],
    // Two adjacent boundaries between digit and suffix block the match.
    [`2${S}${S}nd`, `2${S}${S}nd`],
    // Boundaries outside the ordinal's span (before and after) are ignored.
    [`x ${S}2nd`, `x ${S}2${SUPERSCRIPT_ND}`],
    [`2nd${S} x`, `2${SUPERSCRIPT_ND}${S} x`],
    // A boundary inside the suffix (not the digit slot) blocks the match.
    [`2n${S}d`, `2n${S}d`],
  ])("converts %j to %j", (input, expected) => {
    expect(viewTransform(superscriptOrdinal, input)).toBe(expected)
  })
})

// Plain (no-boundary) variants that exercise the same boundary-aware helpers
// down their non-boundary arms.
describe("plain-text arms of boundary-aware helpers", () => {
  it.each([
    [`a <--> b`, `a ${ARROW_LEFT_RIGHT} b`],
    [`a <---> b`, `a ${ARROW_LEFT_RIGHT} b`],
    // Two boundaries before the closing `>` block the bidi arrow's `>` slot;
    // the leading `<--` still matches as a left arrow.
    [`a <--${S}${S}> b`, `a ${ARROW_LEFT}${S}${S}> b`],
  ])("arrows %j to %j", (input, expected) => {
    expect(viewTransform(arrows, input)).toBe(expected)
  })

  it.each([
    [`20C-5`, `20 ${DEGREE}C-5`],
    [`20C#`, `20C#`],
    // A trailing hyphen at end of string is not a compound; converts.
    [`20C-`, `20 ${DEGREE}C-`],
  ])("degrees %j to %j", (input, expected) => {
    expect(degrees(input)).toBe(expected)
  })

  it.each([
    // A `0` operand followed by a space (not `x`) is not hex.
    [`0 x 5`, `0 ${X} 5`],
  ])("multiplication %j to %j", (input, expected) => {
    expect(multiplication(input)).toBe(expected)
  })
})
