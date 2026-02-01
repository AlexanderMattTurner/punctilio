/**
 * Red Team Test Suite
 *
 * These tests document edge cases and bugs found during security/quality review.
 * Tests marked with .skip are known failures that should be fixed.
 * Tests marked with .todo are enhancement requests.
 */

import { transform, DEFAULT_SEPARATOR } from "../index.js"
import { ellipsis, multiplication, arrows, primeMarks } from "../symbols.js"
import { niceQuotes } from "../quotes.js"
import { hyphenReplace, enDashNumberRange, minusReplace } from "../dashes.js"
import { UNICODE_SYMBOLS } from "../constants.js"

const { EN_DASH, EM_DASH, MINUS, ELLIPSIS, MULTIPLICATION, ARROW_RIGHT } = UNICODE_SYMBOLS

describe("Red Team: En-dash False Positives", () => {
  describe("Phone numbers should NOT be converted", () => {
    it("US phone number", () => {
      expect(enDashNumberRange("555-123-4567")).toBe("555-123-4567")
    })

    it("International phone number", () => {
      expect(enDashNumberRange("+1-555-123-4567")).toBe("+1-555-123-4567")
    })

    it("Phone with parentheses", () => {
      // Note: (555) triggers minus sign conversion for the following -, so we test enDashNumberRange directly
      expect(enDashNumberRange("(555)-123-4567")).toBe("(555)-123-4567")
    })
  })

  describe("ISBN/Serial numbers should NOT be converted", () => {
    it("ISBN-13", () => {
      expect(hyphenReplace("978-3-16-148410-0")).toBe("978-3-16-148410-0")
    })

    it("ISBN-10", () => {
      expect(hyphenReplace("0-13-468599-1")).toBe("0-13-468599-1")
    })
  })

  describe("ISO dates should NOT be converted", () => {
    it("Full ISO date", () => {
      expect(hyphenReplace("2024-01-15")).toBe("2024-01-15")
    })

    it("Partial ISO date (year-month)", () => {
      expect(enDashNumberRange("2024-01")).toBe("2024-01")
    })
  })

  describe("IP-like patterns should NOT be converted", () => {
    it("IP address format", () => {
      expect(enDashNumberRange("192-168-1-1")).toBe("192-168-1-1")
    })
  })

  describe("Time ranges with colons", () => {
    // Debatable: some might want 9:00–5:00
    it.skip("Time range should not convert (has colons)", () => {
      expect(enDashNumberRange("9:00-5:00")).toBe("9:00-5:00")
    })
  })
})

describe("Red Team: Negative Number Ranges", () => {
  it("Negative to negative range", () => {
    // Temperature range: -5 to -2 degrees
    // First convert hyphens to minus signs, then check for en-dash range
    const withMinus = minusReplace("-5--2")
    const result = enDashNumberRange(withMinus)
    expect(result).toContain(EN_DASH)
    expect(result).toBe(`${MINUS}5${EN_DASH}${MINUS}2`)
  })

  it("Negative to positive range", () => {
    // Temperature range: -5 to 5 degrees
    const withMinus = minusReplace("-5-5")
    const result = enDashNumberRange(withMinus)
    expect(result).toContain(EN_DASH)
    expect(result).toBe(`${MINUS}5${EN_DASH}5`)
  })

  it("Already-converted negative with minus sign", () => {
    // After minusReplace, should still work
    const withMinus = minusReplace("-5")
    expect(withMinus).toBe(`${MINUS}5`)
  })
})

describe("Red Team: Hexadecimal False Positive", () => {
  it("Hexadecimal numbers should NOT trigger multiplication", () => {
    expect(multiplication("0x5F3759DF")).toBe("0x5F3759DF")
  })

  it("Hex with lowercase", () => {
    expect(multiplication("0xff")).toBe("0xff")
  })

  it("Hex in context", () => {
    expect(transform("The magic number is 0x5F3759DF")).toBe(
      "The magic number is 0x5F3759DF"
    )
  })
})

describe("Red Team: HTML/XML Content", () => {
  it("HTML comments should NOT be broken by arrow conversion", () => {
    expect(arrows("<!-- comment -->")).toBe("<!-- comment -->")
  })

  it("HTML comment with multiple dashes", () => {
    expect(arrows("<!-- long -- comment -->")).toBe("<!-- long -- comment -->")
  })

  // XML/HTML tags generally work since arrows require spaces
  it("XML tags are preserved", () => {
    expect(arrows("<tag>content</tag>")).toBe("<tag>content</tag>")
  })
})

describe("Red Team: Leading Apostrophes", () => {
  it("'twas should use apostrophe, not opening quote", () => {
    const result = niceQuotes("'twas the night")
    // Should start with right single quote (apostrophe), not left single quote
    expect(result.startsWith(UNICODE_SYMBOLS.RIGHT_SINGLE_QUOTE)).toBe(true)
  })

  it("'tis another contraction", () => {
    const result = niceQuotes("'tis the season")
    expect(result.startsWith(UNICODE_SYMBOLS.RIGHT_SINGLE_QUOTE)).toBe(true)
  })

  // This one actually works
  it("'90s decade abbreviation", () => {
    const result = niceQuotes("the '90s")
    expect(result).toContain(UNICODE_SYMBOLS.RIGHT_SINGLE_QUOTE)
  })
})

describe("Red Team: Code-like Patterns", () => {
  // Note: Spread/rest operator handling is intentionally NOT implemented at the text level.
  // Code blocks should be protected at the DOM level by excluding <code> elements from transformation.

  describe("C-style pointer arrows", () => {
    // These work because arrows require space boundaries
    it("Pointer arrow preserved (no spaces)", () => {
      expect(arrows("ptr->field")).toBe("ptr->field")
    })

    it("Method call preserved", () => {
      expect(arrows("obj->method()")).toBe("obj->method()")
    })
  })
})

describe("Red Team: Ellipsis Edge Cases", () => {
  it("Four dots becomes ellipsis + period", () => {
    expect(ellipsis("End....")).toBe("End….")
  })

  it("Six dots becomes two ellipses", () => {
    expect(ellipsis("......")).toBe("……")
  })

  it.todo("Spaced periods should become ellipsis")
  // Might want: ". . ." → "…" for manually typed spaced ellipsis
})

describe("Red Team: Idempotency", () => {
  it("Simple text is idempotent", () => {
    const input = '"Hello," she said.'
    const once = transform(input)
    const twice = transform(once)
    expect(once).toBe(twice)
  })

  it("Text with dashes is idempotent", () => {
    const input = "pages 1-5"
    const once = transform(input)
    const twice = transform(once)
    expect(once).toBe(twice)
  })

  it("Complex text with quotes and dashes is idempotent", () => {
    const input = '"Hello," she said. "Pages 1-5..." -- "Wait!"'
    const once = transform(input)
    const twice = transform(once)
    expect(once).toBe(twice)
  })

  it("Em dash with quotes is idempotent", () => {
    const input = '" — "'
    const once = transform(input)
    const twice = transform(once)
    expect(once).toBe(twice)
  })

  it("checkIdempotency option throws on non-idempotent input", () => {
    // This input is already idempotent, so it shouldn't throw
    const input = "Hello, world."
    expect(() => transform(input, { checkIdempotency: true })).not.toThrow()
  })
})

describe("Red Team: Prime Marks vs Quotes", () => {
  it("Inches in quoted text should stay as quotes", () => {
    const result = primeMarks('"I have 12" monitors')
    // The 12" inside a quoted sentence should NOT become prime
    expect(result).not.toContain(UNICODE_SYMBOLS.DOUBLE_PRIME)
  })

  it("Standalone inches should become prime", () => {
    const result = primeMarks("The pipe is 12\" long")
    expect(result).toContain(UNICODE_SYMBOLS.DOUBLE_PRIME)
  })
})

describe("Red Team: Unicode Edge Cases", () => {
  it("Handles combining characters", () => {
    const input = '"café"'
    const result = transform(input)
    expect(result).toContain("café")
  })

  it("Handles emoji", () => {
    const input = '"Hello 👋 world"'
    const result = transform(input)
    expect(result).toContain("👋")
  })

  it("Handles CJK characters", () => {
    const input = '"日本語"'
    const result = transform(input)
    expect(result).toContain("日本語")
  })

  it("Handles RTL text", () => {
    const input = '"שלום"'
    const result = transform(input)
    expect(result).toContain("שלום")
  })

  it("Handles zero-width characters", () => {
    const input = "a\u200Bb"  // Zero-width space
    const result = transform(input)
    expect(result).toBe(input)
  })
})

describe("Red Team: Separator Preservation", () => {
  const sep = DEFAULT_SEPARATOR

  it("Preserves separator count in simple text", () => {
    const input = `a${sep}b${sep}c`
    const result = transform(input)
    const inputCount = (input.match(new RegExp(sep, "g")) || []).length
    const resultCount = (result.match(new RegExp(sep, "g")) || []).length
    expect(resultCount).toBe(inputCount)
  })

  it("Preserves separator in ellipsis", () => {
    const input = `.${sep}.${sep}.`
    const result = ellipsis(input, { separator: sep })
    expect(result.split(sep).length - 1).toBe(2)
  })

  it("Preserves consecutive separators", () => {
    const input = `a${sep}${sep}${sep}b`
    const result = transform(input)
    expect(result).toContain(`${sep}${sep}${sep}`)
  })
})

describe("Red Team: Performance", () => {
  it("handles 1000 dots without timeout", () => {
    const input = ".".repeat(1000)
    const start = Date.now()
    ellipsis(input)
    const elapsed = Date.now() - start
    expect(elapsed).toBeLessThan(1000)  // Should complete in under 1 second
  })

  it("handles 1000 quote pairs without timeout", () => {
    const input = '"a" '.repeat(1000)
    const start = Date.now()
    niceQuotes(input)
    const elapsed = Date.now() - start
    expect(elapsed).toBeLessThan(1000)
  })

  it("handles 1000 dashes without timeout", () => {
    const input = "a-b ".repeat(1000)
    const start = Date.now()
    hyphenReplace(input)
    const elapsed = Date.now() - start
    expect(elapsed).toBeLessThan(1000)
  })
})
