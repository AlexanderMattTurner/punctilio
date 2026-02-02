/**
 * Stress tests for punctilio - edge cases and boundary conditions
 *
 * These tests cover:
 * 1. Edge cases not covered by existing tests
 * 2. Potential failure modes identified through competitor analysis
 * 3. Boundary conditions and unusual inputs
 */

import { transform } from "../index.js"
import { niceQuotes } from "../quotes.js"
import { hyphenReplace, enDashNumberRange, minusReplace } from "../dashes.js"
import {
  ellipsis,
  multiplication,
  primeMarks,
  fractions,
  degrees,
  arrows,
  mathSymbols,
  superscriptOrdinal,
  punctuationLigatures,
} from "../symbols.js"
import { UNICODE_SYMBOLS, DEFAULT_SEPARATOR } from "../constants.js"

const {
  LEFT_DOUBLE_QUOTE,
  RIGHT_DOUBLE_QUOTE,
  LEFT_SINGLE_QUOTE,
  RIGHT_SINGLE_QUOTE,
  EM_DASH,
  EN_DASH,
  MINUS,
  ELLIPSIS,
  MULTIPLICATION,
  PRIME,
  DOUBLE_PRIME,
  DEGREE,
  ARROW_RIGHT,
  ARROW_LEFT,
  COPYRIGHT,
  REGISTERED,
  TRADEMARK,
  NOT_EQUAL,
  PLUS_MINUS,
  LESS_EQUAL,
  GREATER_EQUAL,
  FRACTION_1_2,
  FRACTION_1_4,
  FRACTION_3_4,
  SUPERSCRIPT_ST,
  SUPERSCRIPT_ND,
  SUPERSCRIPT_TH,
  NBSP,
} = UNICODE_SYMBOLS

describe("Stress Tests - Quotes", () => {
  describe("unbalanced and edge quotes", () => {
    it.each([
      // Unbalanced quotes - should still transform what's possible
      ['"unclosed', `${LEFT_DOUBLE_QUOTE}unclosed`],
      ["unclosed'", `unclosed${RIGHT_SINGLE_QUOTE}`],
      // Empty quoted strings
      ['""', `${LEFT_DOUBLE_QUOTE}${RIGHT_DOUBLE_QUOTE}`],
    ])('handles edge quote pattern: "%s"', (input, expected) => {
      expect(niceQuotes(input)).toBe(expected)
    })
  })

  describe("known limitations - edge quote patterns", () => {
    // These are documented edge cases that produce suboptimal but acceptable results
    it("empty single quotes become double apostrophes", () => {
      // Two single quotes in a row are treated as two apostrophes, not an empty quoted string
      // This is because standalone '' is ambiguous (could be apostrophe + apostrophe)
      expect(niceQuotes("''")).toBe(`${RIGHT_SINGLE_QUOTE}${RIGHT_SINGLE_QUOTE}`)
    })

    it("quote containing only whitespace has limited conversion", () => {
      // Opening quote before whitespace is not detected as quote start
      // because the pattern requires non-whitespace after the opening quote
      const result = niceQuotes('" "')
      expect(result).toBe(`" ${RIGHT_DOUBLE_QUOTE}`) // Only closing quote converts
    })

    it("single quote containing only whitespace has limited conversion", () => {
      const result = niceQuotes("' '")
      expect(result).toBe(`${RIGHT_SINGLE_QUOTE} ${RIGHT_SINGLE_QUOTE}`)
    })
  })

  describe("quotes after various punctuation", () => {
    it.each([
      // After semicolon
      ['text; "quote"', `text; ${LEFT_DOUBLE_QUOTE}quote${RIGHT_DOUBLE_QUOTE}`],
      // After colon
      ['title: "quote"', `title: ${LEFT_DOUBLE_QUOTE}quote${RIGHT_DOUBLE_QUOTE}`],
      // After question mark
      ['what? "quote"', `what? ${LEFT_DOUBLE_QUOTE}quote${RIGHT_DOUBLE_QUOTE}`],
      // After exclamation
      ['wow! "quote"', `wow! ${LEFT_DOUBLE_QUOTE}quote${RIGHT_DOUBLE_QUOTE}`],
      // After brackets
      ['[note] "quote"', `[note] ${LEFT_DOUBLE_QUOTE}quote${RIGHT_DOUBLE_QUOTE}`],
      ['{code} "quote"', `{code} ${LEFT_DOUBLE_QUOTE}quote${RIGHT_DOUBLE_QUOTE}`],
    ])('handles quotes after punctuation: "%s"', (input, expected) => {
      expect(niceQuotes(input)).toBe(expected)
    })
  })

  describe("consecutive contractions", () => {
    it.each([
      // Multiple contractions in sequence
      ["I'd've", `I${RIGHT_SINGLE_QUOTE}d${RIGHT_SINGLE_QUOTE}ve`],
      ["y'all'd've", `y${RIGHT_SINGLE_QUOTE}all${RIGHT_SINGLE_QUOTE}d${RIGHT_SINGLE_QUOTE}ve`],
      ["wouldn't've", `wouldn${RIGHT_SINGLE_QUOTE}t${RIGHT_SINGLE_QUOTE}ve`],
      ["couldn't've", `couldn${RIGHT_SINGLE_QUOTE}t${RIGHT_SINGLE_QUOTE}ve`],
    ])('handles double contraction: "%s"', (input, expected) => {
      expect(niceQuotes(input)).toBe(expected)
    })
  })

  describe("quotes with special Unicode", () => {
    it.each([
      // Emoji inside quotes
      ['"Hello! 😊"', `${LEFT_DOUBLE_QUOTE}Hello! 😊${RIGHT_DOUBLE_QUOTE}`],
      // CJK characters
      ['"你好"', `${LEFT_DOUBLE_QUOTE}你好${RIGHT_DOUBLE_QUOTE}`],
      ['"こんにちは"', `${LEFT_DOUBLE_QUOTE}こんにちは${RIGHT_DOUBLE_QUOTE}`],
      // Arabic
      ['"مرحبا"', `${LEFT_DOUBLE_QUOTE}مرحبا${RIGHT_DOUBLE_QUOTE}`],
      // Cyrillic
      ['"Привет"', `${LEFT_DOUBLE_QUOTE}Привет${RIGHT_DOUBLE_QUOTE}`],
    ])('handles Unicode content in quotes: "%s"', (input, expected) => {
      expect(niceQuotes(input)).toBe(expected)
    })
  })

  describe("multiline quotes", () => {
    it.each([
      // Quote spanning multiple lines
      ['"Hello\nWorld"', `${LEFT_DOUBLE_QUOTE}Hello\nWorld${RIGHT_DOUBLE_QUOTE}`],
      // Multiple separate quotes on lines
      ['"A"\n"B"', `${LEFT_DOUBLE_QUOTE}A${RIGHT_DOUBLE_QUOTE}\n${LEFT_DOUBLE_QUOTE}B${RIGHT_DOUBLE_QUOTE}`],
    ])('handles multiline: "%s"', (input, expected) => {
      expect(niceQuotes(input)).toBe(expected)
    })
  })
})

describe("Stress Tests - Dashes", () => {
  describe("dashes in technical patterns", () => {
    it.each([
      // URLs should preserve hyphens
      ["https://example-site.com", "https://example-site.com"],
      ["http://sub-domain.example.com/path-to-file", "http://sub-domain.example.com/path-to-file"],
      // Email addresses
      ["user-name@example.com", "user-name@example.com"],
      // UUID patterns
      ["550e8400-e29b-41d4-a716-446655440000", "550e8400-e29b-41d4-a716-446655440000"],
      // Git commit hashes with leading numbers could be tricky
      ["commit 1a2b3c4d-5e6f", "commit 1a2b3c4d-5e6f"],
    ])('preserves technical pattern: "%s"', (input, expected) => {
      expect(hyphenReplace(input)).toBe(expected)
    })
  })

  describe("scientific notation", () => {
    it.each([
      // Scientific notation - should these convert the exponent minus?
      ["1e-10", "1e-10"],
      ["5.5e-3", "5.5e-3"],
      ["1E-5", "1E-5"],
      ["3.14e+10", "3.14e+10"],
    ])('handles scientific notation: "%s"', (input, expected) => {
      // Note: minus in exponent should probably stay as hyphen
      expect(hyphenReplace(input)).toBe(expected)
    })
  })

  describe("version numbers", () => {
    it.each([
      // Semantic versions with pre-release identifiers
      ["v1.0.0-beta", "v1.0.0-beta"],
      ["1.0.0-rc.1", "1.0.0-rc.1"],
      ["2.0.0-alpha.1", "2.0.0-alpha.1"],
      // Multiple pre-release segments
      ["1.0.0-beta.1-hotfix", "1.0.0-beta.1-hotfix"],
    ])('preserves version number: "%s"', (input, expected) => {
      expect(hyphenReplace(input)).toBe(expected)
    })
  })

  describe("edge number ranges", () => {
    it.each([
      // Very large numbers
      ["1000000-2000000", `1000000${EN_DASH}2000000`],
      // Decimal ranges
      ["1.5-2.5", `1.5${EN_DASH}2.5`],
      // Page ranges with mixed formats
      ["pp. 100-200", `pp. 100${EN_DASH}200`],
      // Roman numeral ranges (should NOT convert)
      ["I-V", "I-V"],
      ["i-v", "i-v"],
      ["Chapter I-III", "Chapter I-III"],
    ])('handles number range edge case: "%s"', (input, expected) => {
      expect(hyphenReplace(input)).toBe(expected)
    })
  })

  describe("dashes in social media patterns", () => {
    it.each([
      // Hashtags
      ["#my-hashtag", "#my-hashtag"],
      // Mentions (not a real concern but check)
      ["@user-name", "@user-name"],
    ])('preserves social pattern: "%s"', (input, expected) => {
      expect(hyphenReplace(input)).toBe(expected)
    })
  })

  describe("mixed dash types", () => {
    it.each([
      // Already has en-dash
      [`pages 1${EN_DASH}5`, `pages 1${EN_DASH}5`],
      // Already has em-dash
      [`word${EM_DASH}word`, `word${EM_DASH}word`],
      // Mix of converted and unconverted
      [`pages 1-5 and word${EM_DASH}word`, `pages 1${EN_DASH}5 and word${EM_DASH}word`],
    ])('handles mixed dashes: "%s"', (input, expected) => {
      expect(hyphenReplace(input)).toBe(expected)
    })
  })

  describe("negative temperatures and ranges", () => {
    it.each([
      // Temperature ranges with negative numbers
      ["-5 to -10", `${MINUS}5 to ${MINUS}10`],
      // Weather forecast style
      ["High: 5, Low: -10", `High: 5, Low: ${MINUS}10`],
    ])('handles negative temperatures: "%s"', (input, expected) => {
      expect(hyphenReplace(input)).toBe(expected)
    })
  })
})

describe("Stress Tests - Symbols", () => {
  describe("multiple multiplications", () => {
    it.each([
      // Mixed tight and spaced - works correctly
      ["5x5 x 5", `5${MULTIPLICATION}5 ${MULTIPLICATION} 5`],
    ])('handles mixed multiplication: "%s"', (input, expected) => {
      expect(multiplication(input)).toBe(expected)
    })
  })

  describe("known limitation - chained tight multiplications", () => {
    // BUG: Chained tight multiplications only convert first occurrence
    // After 5x5 → 5×5, the pattern for ×5x5 doesn't match because
    // the regex expects \d before x, but × is not a digit
    it("only converts first tight multiplication in chain", () => {
      // Ideally 5x5x5 should become 5×5×5, but currently becomes 5×5x5
      expect(multiplication("5x5x5")).toBe(`5${MULTIPLICATION}5x5`)
    })

    it("spaced multiplications have same issue", () => {
      // 5 x 5 x 5 becomes 5 × 5 x 5 (only first converts)
      expect(multiplication("5 x 5 x 5")).toBe(`5 ${MULTIPLICATION} 5 x 5`)
    })

    it("asterisks have the same chained issue", () => {
      // After converting 5*5 → 5×5, the next *5 doesn't match
      // because the regex requires a digit before *
      expect(multiplication("5*5*5")).toBe(`5${MULTIPLICATION}5*5`)
    })

    it("alternating chain produces mixed results", () => {
      // 5*5*5*5 → 5×5*5×5 (first and third convert, second and fourth don't)
      expect(multiplication("5*5*5*5")).toBe(`5${MULTIPLICATION}5*5${MULTIPLICATION}5`)
    })
  })

  describe("multiplication edge cases", () => {
    it.each([
      // Very large numbers
      ["1000000x2000000", `1000000${MULTIPLICATION}2000000`],
      // Leading zeros (not hex)
      ["01x02", `01${MULTIPLICATION}02`],
      // Single digit
      ["2x", `2${MULTIPLICATION}`],
    ])('handles multiplication edge: "%s"', (input, expected) => {
      expect(multiplication(input)).toBe(expected)
    })
  })

  describe("ellipsis edge cases", () => {
    it.each([
      // Multiple ellipses
      ["One... Two... Three...", `One${ELLIPSIS} Two${ELLIPSIS} Three${ELLIPSIS}`],
      // Ellipsis before number
      ["...5 items", `${ELLIPSIS} 5 items`],
      // Four dots (ellipsis + period)
      ["End of sentence....", `End of sentence${ELLIPSIS}.`],
      // Ellipsis in quotes - transform() applies ellipsis before quote conversion
      ['"Wait..."', `"Wait${ELLIPSIS}"`],
    ])('handles ellipsis edge: "%s"', (input, expected) => {
      expect(ellipsis(input)).toBe(expected)
    })
  })

  describe("prime marks edge cases", () => {
    it.each([
      // Very large measurements
      ['100\'50"', `100${PRIME}50${DOUBLE_PRIME}`],
      // Just single prime
      ["5' boards", `5${PRIME} boards`],
      // Just double prime
      ['12" pipe', `12${DOUBLE_PRIME} pipe`],
      // After comma
      ["5', 10'", `5${PRIME}, 10'`], // Second one may not convert (quote balancing)
    ])('handles prime mark edge: "%s"', (input, expected) => {
      expect(primeMarks(input)).toBe(expected)
    })
  })

  describe("degrees with edge temperatures", () => {
    it.each([
      // Negative temperatures
      ["-40 C", `-40 ${DEGREE}C`],
      ["-40 F", `-40 ${DEGREE}F`],
      // Zero
      ["0 C", `0 ${DEGREE}C`],
      ["0 F", `0 ${DEGREE}F`],
      // Very high
      ["1000 C", `1000 ${DEGREE}C`],
      ["1000 F", `1000 ${DEGREE}F`],
    ])('handles temperature edge: "%s"', (input, expected) => {
      expect(degrees(input)).toBe(expected)
    })
  })

  describe("arrow edge cases", () => {
    it.each([
      // Multiple arrows
      ["A -> B -> C", `A ${ARROW_RIGHT} B ${ARROW_RIGHT} C`],
      ["A <- B <- C", `A ${ARROW_LEFT} B ${ARROW_LEFT} C`],
      // Very long arrows
      ["A ---> B", `A ${ARROW_RIGHT} B`],
      ["A <--- B", `A ${ARROW_LEFT} B`],
      // At line start/end
      ["-> output", `${ARROW_RIGHT} output`],
      ["input ->", `input ${ARROW_RIGHT}`],
    ])('handles arrow edge: "%s"', (input, expected) => {
      expect(arrows(input)).toBe(expected)
    })
  })

  describe("fractions edge cases", () => {
    it.each([
      // Multiple fractions
      ["1/2 and 1/4", `${FRACTION_1_2} and ${FRACTION_1_4}`],
      // Fraction at end of sentence
      ["Add 1/2.", `Add ${FRACTION_1_2}.`],
      // Fraction in parentheses
      ["(1/2)", `(${FRACTION_1_2})`],
      // Non-standard fractions should NOT convert
      ["5/7", "5/7"],
      ["11/12", "11/12"],
    ])('handles fraction edge: "%s"', (input, expected) => {
      expect(fractions(input)).toBe(expected)
    })
  })
})

describe("Stress Tests - Full Transform", () => {
  describe("complex combined transformations", () => {
    it.each([
      // Quote + dash + ellipsis
      [
        '"Wait..." she said - "it\'s pages 1-5."',
        `${LEFT_DOUBLE_QUOTE}Wait${ELLIPSIS}${RIGHT_DOUBLE_QUOTE} she said${EM_DASH}${LEFT_DOUBLE_QUOTE}it${RIGHT_SINGLE_QUOTE}s pages 1${EN_DASH}5.${RIGHT_DOUBLE_QUOTE}`,
      ],
      // Legal + multiplication + temperature
      [
        "(c) 2024 - Room is 10x12, set to 72 F",
        `${COPYRIGHT} 2024${EM_DASH}Room is 10${MULTIPLICATION}12, set to 72 ${DEGREE}F`,
      ],
    ])('handles complex transform: "%s"', (input, expected) => {
      expect(transform(input, { degrees: true })).toBe(expected)
    })
  })

  describe("empty and whitespace inputs", () => {
    it.each([
      ["", ""],
      [" ", " "],
      ["\n", "\n"],
      ["\t", "\t"],
      ["   ", " "], // Multiple spaces collapse
    ])('handles empty/whitespace: "%s"', (input, expected) => {
      expect(transform(input)).toBe(expected)
    })
  })

  describe("very long inputs", () => {
    it("handles long repeated patterns", () => {
      const input = '"Hello" '.repeat(100)
      const result = transform(input)
      expect(result).toContain(LEFT_DOUBLE_QUOTE)
      expect(result).toContain(RIGHT_DOUBLE_QUOTE)
    })

    it("handles long continuous text", () => {
      const input = "word ".repeat(1000)
      const result = transform(input)
      expect(result).toBe(input.trim() + " ") // Just whitespace normalization
    })
  })

  describe("Unicode edge cases", () => {
    it.each([
      // Zero-width characters
      ['"test\u200Bword"', `${LEFT_DOUBLE_QUOTE}test\u200Bword${RIGHT_DOUBLE_QUOTE}`],
      // Right-to-left marks
      ['"test\u200Fword"', `${LEFT_DOUBLE_QUOTE}test\u200Fword${RIGHT_DOUBLE_QUOTE}`],
      // Combining diacriticals
      ['"caf\u0065\u0301"', `${LEFT_DOUBLE_QUOTE}caf\u0065\u0301${RIGHT_DOUBLE_QUOTE}`],
    ])('handles Unicode edge case: input with special chars', (input, expected) => {
      expect(transform(input)).toBe(expected)
    })
  })

  describe("option combinations", () => {
    it("applies all optional transforms together", () => {
      const input = "1st place: 1/2 at 72 F - wow!!"
      const result = transform(input, {
        fractions: true,
        degrees: true,
        superscript: true,
        ligatures: true,
      })
      expect(result).toContain(SUPERSCRIPT_ST)
      expect(result).toContain(FRACTION_1_2)
      expect(result).toContain(DEGREE)
    })

    it("respects disabled transforms", () => {
      const input = "1/2 at 72 F"
      const result = transform(input, {
        fractions: false,
        degrees: false,
      })
      expect(result).not.toContain(FRACTION_1_2)
      expect(result).not.toContain(DEGREE)
    })
  })
})

describe("Stress Tests - Separator Robustness", () => {
  const sep = DEFAULT_SEPARATOR

  describe("separators in quotes", () => {
    it.each([
      // Separator at quote boundaries
      [`${sep}"test"${sep}`, `${sep}${LEFT_DOUBLE_QUOTE}test${RIGHT_DOUBLE_QUOTE}${sep}`],
      // Separator inside quotes
      [`"test${sep}word"`, `${LEFT_DOUBLE_QUOTE}test${sep}word${RIGHT_DOUBLE_QUOTE}`],
      // Multiple separators
      [`${sep}${sep}"test"${sep}${sep}`, `${sep}${sep}${LEFT_DOUBLE_QUOTE}test${RIGHT_DOUBLE_QUOTE}${sep}${sep}`],
    ])('handles separator in quotes', (input, expected) => {
      expect(transform(input, { separator: sep })).toBe(expected)
    })
  })

  describe("separators in dashes", () => {
    it.each([
      // Separator around dash
      [`word${sep} - ${sep}word`, `word${sep}${EM_DASH}${sep}word`],
      // Separator in number range
      [`1${sep}-${sep}5`, `1${sep}${EN_DASH}${sep}5`],
    ])('handles separator in dashes', (input, expected) => {
      expect(transform(input, { separator: sep })).toBe(expected)
    })
  })

  describe("separator count preservation", () => {
    it("preserves exact separator count through transform", () => {
      const input = `${sep}text${sep}more${sep}text${sep}`
      const result = transform(input, { separator: sep })
      const inputCount = (input.match(new RegExp(sep, "g")) || []).length
      const resultCount = (result.match(new RegExp(sep, "g")) || []).length
      expect(resultCount).toBe(inputCount)
    })
  })
})

describe("Stress Tests - Idempotency", () => {
  describe("double application produces same result", () => {
    it.each([
      '"Hello" - she said, "it\'s pages 1-5..."',
      'Product(tm) 5x5 at 72 F (c) 2024',
      "Add 1/2 cup - that's about 3/4 done",
      '1st place winner said "congrats!!"',
    ])('is idempotent: "%s"', (input) => {
      const first = transform(input, { fractions: true, degrees: true, superscript: true, ligatures: true })
      const second = transform(first, { fractions: true, degrees: true, superscript: true, ligatures: true })
      expect(second).toBe(first)
    })
  })

  describe("already-transformed text is stable", () => {
    it.each([
      `${LEFT_DOUBLE_QUOTE}Hello${RIGHT_DOUBLE_QUOTE}`,
      `word${EM_DASH}word`,
      `1${EN_DASH}5`,
      `Wait${ELLIPSIS}`,
      `5${MULTIPLICATION}5`,
      `20 ${DEGREE}C`,
      `${COPYRIGHT} 2024`,
    ])('stable for: "%s"', (input) => {
      expect(transform(input)).toBe(input)
    })
  })
})

describe("Stress Tests - Style Combinations", () => {
  describe("American style full pipeline", () => {
    it("applies American conventions throughout", () => {
      const input = '"Hello." - word - "World."'
      const result = transform(input, { punctuationStyle: "american", dashStyle: "american" })
      // Period inside quotes
      expect(result).toContain(`Hello.${RIGHT_DOUBLE_QUOTE}`)
      // Unspaced em-dash
      expect(result).toContain(EM_DASH)
      expect(result).not.toContain(` ${EM_DASH} `)
    })
  })

  describe("British style full pipeline", () => {
    it("applies British conventions throughout", () => {
      const input = '"Hello." - word - "World."'
      const result = transform(input, { punctuationStyle: "british", dashStyle: "british" })
      // Period outside quotes
      expect(result).toContain(`${RIGHT_DOUBLE_QUOTE}.`)
      // Spaced en-dash
      expect(result).toContain(` ${EN_DASH} `)
    })
  })

  describe("mixed styles", () => {
    it("applies American punctuation with British dashes", () => {
      const input = '"Hello." - word'
      const result = transform(input, { punctuationStyle: "american", dashStyle: "british" })
      // Period inside quotes (American)
      expect(result).toContain(`Hello.${RIGHT_DOUBLE_QUOTE}`)
      // Spaced en-dash (British)
      expect(result).toContain(` ${EN_DASH} `)
    })
  })
})

describe("Stress Tests - Potential Bug Scenarios", () => {
  describe("regex catastrophic backtracking prevention", () => {
    it("handles pathological quote patterns efficiently", () => {
      // Patterns that could cause backtracking in naive regex
      const input = '"a"'.repeat(50) + "'"
      const start = Date.now()
      transform(input)
      const duration = Date.now() - start
      expect(duration).toBeLessThan(1000) // Should complete in under 1 second
    })

    it("handles pathological dash patterns efficiently", () => {
      const input = "1-2-3-4-5-6-7-8-9-10-11-12-13-14-15"
      const start = Date.now()
      transform(input)
      const duration = Date.now() - start
      expect(duration).toBeLessThan(1000)
    })
  })

  describe("special regex characters in input", () => {
    it.each([
      // Regex special chars that could cause issues
      ['"test [bracket]"', `${LEFT_DOUBLE_QUOTE}test [bracket]${RIGHT_DOUBLE_QUOTE}`],
      ['"test (paren)"', `${LEFT_DOUBLE_QUOTE}test (paren)${RIGHT_DOUBLE_QUOTE}`],
      ['"test {brace}"', `${LEFT_DOUBLE_QUOTE}test {brace}${RIGHT_DOUBLE_QUOTE}`],
      ['"test $dollar"', `${LEFT_DOUBLE_QUOTE}test $dollar${RIGHT_DOUBLE_QUOTE}`],
      ['"test ^caret"', `${LEFT_DOUBLE_QUOTE}test ^caret${RIGHT_DOUBLE_QUOTE}`],
      ['"test .dot"', `${LEFT_DOUBLE_QUOTE}test .dot${RIGHT_DOUBLE_QUOTE}`],
      ['"test |pipe"', `${LEFT_DOUBLE_QUOTE}test |pipe${RIGHT_DOUBLE_QUOTE}`],
    ])('handles regex special chars: "%s"', (input, expected) => {
      expect(transform(input)).toBe(expected)
    })
  })

  describe("boundary conditions", () => {
    it.each([
      // Start of string
      ['"start', `${LEFT_DOUBLE_QUOTE}start`],
      ["'start", `${RIGHT_SINGLE_QUOTE}start`],
      ["-5 start", `${MINUS}5 start`],
      ["...start", `${ELLIPSIS} start`],
      // End of string
      ['end"', `end${RIGHT_DOUBLE_QUOTE}`],
      ["end'", `end${RIGHT_SINGLE_QUOTE}`],
      ["end...", `end${ELLIPSIS}`],
      ["5x", `5${MULTIPLICATION}`],
    ])('handles boundary: "%s"', (input, expected) => {
      expect(transform(input)).toBe(expected)
    })
  })
})

describe("Competitor Feature Gaps", () => {
  /**
   * These tests document features from competitor libraries that punctilio
   * doesn't currently support. They serve as documentation for potential
   * future enhancements.
   */

  describe("features not supported (for documentation)", () => {
    // German quotes: „text" and ‚text'
    it("does not convert to German-style quotes", () => {
      // German opening quote is at bottom: „
      // Punctilio converts to standard curly quotes, not locale-specific
      const result = transform('"German text"')
      expect(result).toBe(`${LEFT_DOUBLE_QUOTE}German text${RIGHT_DOUBLE_QUOTE}`)
      // A German mode would produce: „German text"
    })

    // French quotes: « text » with non-breaking spaces
    it("does not convert to French-style quotes", () => {
      const result = transform('"French text"')
      expect(result).toBe(`${LEFT_DOUBLE_QUOTE}French text${RIGHT_DOUBLE_QUOTE}`)
      // A French mode would produce: « French text »
    })

    // Widows prevention (typogr.js feature)
    it("does not prevent widows", () => {
      const input = "This is a sentence with a short word at the end."
      const result = transform(input)
      // typogr.js would add &nbsp; before "end." to prevent widow
      expect(result).not.toContain(NBSP)
    })

    // Ampersand wrapping (typogr.js feature)
    it("does not wrap ampersands", () => {
      const input = "A & B"
      const result = transform(input)
      // typogr.js wraps & in <span class="amp">
      expect(result).toBe("A & B")
    })

    // Stupefy/reverse mode (smartypants feature)
    it("does not have a reverse mode", () => {
      // Would convert curly quotes back to straight quotes
      const input = `${LEFT_DOUBLE_QUOTE}Hello${RIGHT_DOUBLE_QUOTE}`
      const result = transform(input)
      // No reverse transformation available
      expect(result).toBe(input)
    })
  })
})
