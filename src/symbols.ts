/**
 * Symbol and character transformations for common typography improvements.
 *
 * Handles ellipses, multiplication signs, mathematical symbols, and
 * common character sequences that should use proper Unicode glyphs.
 *
 * @module symbols
 */

export interface SymbolOptions {
  /**
   * Boundary marker character for text spanning HTML elements.
   * Default: "\uE000" (Unicode Private Use Area)
   */
  separator?: string
  /**
   * Whether to include arrow transformations (-> to →, etc.).
   * Default: true
   */
  includeArrows?: boolean
}

const DEFAULT_SEPARATOR = "\uE000"

/**
 * Escapes special regex characters in a string.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

// Unicode characters
const ELLIPSIS = "\u2026" // …
const MULTIPLICATION = "\u00D7" // ×
const NOT_EQUAL = "\u2260" // ≠
const PLUS_MINUS = "\u00B1" // ±
const COPYRIGHT = "\u00A9" // ©
const REGISTERED = "\u00AE" // ®
const TRADEMARK = "\u2122" // ™
const DEGREE = "\u00B0" // °
const ARROW_RIGHT = "\u2192" // →
const ARROW_LEFT = "\u2190" // ←
const ARROW_LEFT_RIGHT = "\u2194" // ↔
const APPROXIMATE = "\u2248" // ≈
const LESS_EQUAL = "\u2264" // ≤
const GREATER_EQUAL = "\u2265" // ≥
const PRIME = "\u2032" // ′
const DOUBLE_PRIME = "\u2033" // ″

/**
 * Converts three periods to a proper ellipsis character.
 *
 * @example
 * ```ts
 * ellipsis("Wait for it...")
 * // → "Wait for it…"
 * ```
 */
export function ellipsis(text: string, options: SymbolOptions = {}): string {
  const chr = escapeRegex(options.separator ?? DEFAULT_SEPARATOR)

  // Replace three periods with ellipsis, allowing for separator chars between
  const pattern = new RegExp(`\\.${chr}?\\.${chr}?\\.`, "g")
  text = text.replace(pattern, ELLIPSIS)

  // Add space after ellipsis when followed by a word character
  text = text.replace(new RegExp(`${ELLIPSIS}(?=\\w)`, "gu"), `${ELLIPSIS} `)

  return text
}

/**
 * Converts ASCII multiplication patterns to proper multiplication sign (×).
 *
 * Handles:
 * - Dimensions: "5x5" → "5×5"
 * - Trailing multiplier: "5x" → "5×" (when followed by word boundary)
 * - Asterisk multiplication: "5*3" → "5×3" (when between numbers)
 *
 * @example
 * ```ts
 * multiplication("The room is 10x12 feet")
 * // → "The room is 10×12 feet"
 *
 * multiplication("2x speed")
 * // → "2× speed"
 * ```
 */
export function multiplication(text: string, options: SymbolOptions = {}): string {
  const chr = escapeRegex(options.separator ?? DEFAULT_SEPARATOR)

  // Dimensions with spaces: preserve spacing
  const loosePattern = new RegExp(`(\\d${chr}?)\\s+[xX*]\\s+(${chr}?\\d)`, "g")
  text = text.replace(loosePattern, `$1 ${MULTIPLICATION} $2`)

  // Dimensions without spaces: keep tight
  const tightPattern = new RegExp(`(\\d${chr}?)[xX*](${chr}?\\d)`, "g")
  text = text.replace(tightPattern, `$1${MULTIPLICATION}$2`)

  // Trailing multiplier: 5x (followed by space or end, not letters or numbers)
  const trailingPattern = new RegExp(`(\\d${chr}?)[xX*](?=${chr}?(?:\\s|$))`, "g")
  text = text.replace(trailingPattern, `$1${MULTIPLICATION}`)

  return text
}

/**
 * Converts ASCII mathematical symbols to proper Unicode equivalents.
 *
 * Handles:
 * - "!=" → "≠"
 * - "+-" or "+/-" → "±"
 * - "<=" → "≤"
 * - ">=" → "≥"
 * - "~=" or "=~" → "≈"
 *
 * @example
 * ```ts
 * mathSymbols("x != y and a <= b")
 * // → "x ≠ y and a ≤ b"
 *
 * mathSymbols("The answer is +- 5%")
 * // → "The answer is ± 5%"
 * ```
 */
export function mathSymbols(text: string): string {
  // Not equal
  text = text.replace(/!=/g, NOT_EQUAL)

  // Plus/minus
  text = text.replace(/\+\/-/g, PLUS_MINUS)
  text = text.replace(/\+-/g, PLUS_MINUS)

  // Less than or equal
  text = text.replace(/<=/g, LESS_EQUAL)

  // Greater than or equal
  text = text.replace(/>=/g, GREATER_EQUAL)

  // Approximately equal
  text = text.replace(/~=/g, APPROXIMATE)
  text = text.replace(/=~/g, APPROXIMATE)

  return text
}

/**
 * Converts ASCII representations of copyright, registered, and trademark
 * symbols to proper Unicode characters.
 *
 * Handles:
 * - "(c)" or "(C)" → "©"
 * - "(r)" or "(R)" → "®"
 * - "(tm)" or "(TM)" → "™"
 *
 * @example
 * ```ts
 * legalSymbols("Copyright (c) 2024 Acme Inc.")
 * // → "Copyright © 2024 Acme Inc."
 *
 * legalSymbols("Brand Name(tm)")
 * // → "Brand Name™"
 * ```
 */
export function legalSymbols(text: string): string {
  // Copyright - must be surrounded by word boundaries or spaces to avoid false matches
  text = text.replace(/\(c\)/gi, COPYRIGHT)

  // Registered trademark
  text = text.replace(/\(r\)/gi, REGISTERED)

  // Trademark
  text = text.replace(/\(tm\)/gi, TRADEMARK)

  return text
}

/**
 * Converts arrow character sequences to Unicode arrows.
 *
 * Handles:
 * - "->" or "-->" → "→"
 * - "<-" or "<--" → "←"
 * - "<->" or "<-->" → "↔"
 *
 * Note: Only converts when surrounded by spaces or at word boundaries
 * to avoid false matches in code or URLs.
 *
 * @example
 * ```ts
 * arrows("A -> B -> C")
 * // → "A → B → C"
 *
 * arrows("left <-> right")
 * // → "left ↔ right"
 * ```
 */
export function arrows(text: string, options: SymbolOptions = {}): string {
  const chr = escapeRegex(options.separator ?? DEFAULT_SEPARATOR)

  // Bidirectional arrow first (to avoid partial matches)
  text = text.replace(new RegExp(`<-{1,2}${chr}?>`, "g"), ARROW_LEFT_RIGHT)

  // Right arrow
  text = text.replace(new RegExp(`(?<=[\\s${chr}]|^)-{1,2}>(?=[\\s${chr}]|$)`, "g"), ARROW_RIGHT)

  // Left arrow
  text = text.replace(new RegExp(`(?<=[\\s${chr}]|^)<-{1,2}(?=[\\s${chr}]|$)`, "g"), ARROW_LEFT)

  return text
}

/**
 * Adds degree symbol in temperature contexts.
 *
 * Handles:
 * - "20 C" or "20C" → "20 °C" (Celsius)
 * - "68 F" or "68F" → "68 °F" (Fahrenheit)
 *
 * Only matches when followed by C or F (case insensitive) to avoid
 * false positives.
 *
 * @example
 * ```ts
 * degrees("The temperature is 20 C")
 * // → "The temperature is 20 °C"
 *
 * degrees("Water boils at 212F")
 * // → "Water boils at 212 °F"
 * ```
 */
export function degrees(text: string): string {
  // Temperature with optional space before C or F
  text = text.replace(/(\d+) ?([CF])\b/gi, (_, num, unit) => {
    return `${num} ${DEGREE}${unit.toUpperCase()}`
  })

  return text
}

/**
 * Converts straight quotes after numbers to prime marks.
 *
 * Prime marks are used for:
 * - Feet and inches: 5'10" → 5′10″
 * - Arcminutes and arcseconds: 45° 30' 15" → 45° 30′ 15″
 *
 * This should be called BEFORE smart quote transformations to prevent
 * quotes in measurements from being curled.
 *
 * @example
 * ```ts
 * primeMarks("He's 5'10\" tall")
 * // → "He's 5′10″ tall"
 *
 * primeMarks("Location: 45° 30' 15\"")
 * // → "Location: 45° 30′ 15″"
 * ```
 */
export function primeMarks(text: string, options: SymbolOptions = {}): string {
  const chr = escapeRegex(options.separator ?? DEFAULT_SEPARATOR)

  // Single prime: digit followed by ' and then either digit, ", or end/space/punctuation
  // This handles feet (5') and arcminutes (30')
  const singlePrimePattern = new RegExp(
    `(\\d${chr}?)'(?=${chr}?(?:\\d|"|$|[\\s.,;:!?)]))`,
    "g"
  )
  text = text.replace(singlePrimePattern, `$1${PRIME}`)

  // Double prime: Only match when it's clearly a measurement context
  // Pattern 1: Feet-inches pattern (5'10" or 5′10")
  const feetInchesPattern = new RegExp(`(${PRIME}${chr}?\\d${chr}?)"`, "g")
  text = text.replace(feetInchesPattern, `$1${DOUBLE_PRIME}`)

  // Pattern 2: Standalone inches - match digit followed by " but NOT when it's a closing quote
  // Use negative lookbehind to ensure there's no opening quote before the number
  // This matches: 12" wide, but not: "Term 1"
  const standaloneInchesPattern = new RegExp(
    `(?<!["\u201C]${chr}?[^"${chr}]{0,20})(\\d${chr}?)"(?!${chr}?[\\w])`,
    "g"
  )
  text = text.replace(standaloneInchesPattern, `$1${DOUBLE_PRIME}`)

  return text
}

/**
 * Converts common fractions to Unicode fraction characters.
 *
 * Handles: 1/4, 1/2, 3/4, 1/3, 2/3, 1/5, 2/5, 3/5, 4/5,
 * 1/6, 5/6, 1/8, 3/8, 5/8, 7/8
 *
 * Only converts when the fraction is surrounded by word boundaries
 * to avoid breaking URLs, file paths, or dates.
 *
 * @example
 * ```ts
 * fractions("Add 1/2 cup of flour")
 * // → "Add ½ cup of flour"
 *
 * fractions("About 3/4 complete")
 * // → "About ¾ complete"
 * ```
 */
export function fractions(text: string): string {
  const fractionMap: Record<string, string> = {
    "1/4": "\u00BC", // ¼
    "1/2": "\u00BD", // ½
    "3/4": "\u00BE", // ¾
    "1/3": "\u2153", // ⅓
    "2/3": "\u2154", // ⅔
    "1/5": "\u2155", // ⅕
    "2/5": "\u2156", // ⅖
    "3/5": "\u2157", // ⅗
    "4/5": "\u2158", // ⅘
    "1/6": "\u2159", // ⅙
    "5/6": "\u215A", // ⅚
    "1/8": "\u215B", // ⅛
    "3/8": "\u215C", // ⅜
    "5/8": "\u215D", // ⅝
    "7/8": "\u215E", // ⅞
  }

  for (const [ascii, unicode] of Object.entries(fractionMap)) {
    // Match fraction at word boundaries, not inside numbers like "21/4"
    const pattern = new RegExp(`(?<!\\d)${ascii.replace("/", "\\/")}(?!\\d)`, "g")
    text = text.replace(pattern, unicode)
  }

  return text
}

/**
 * Applies all symbol transformations.
 *
 * Runs in order:
 * 1. ellipsis
 * 2. multiplication
 * 3. mathSymbols
 * 4. legalSymbols
 * 5. arrows
 *
 * Note: `degrees` and `fractions` are not included by default as they
 * may be too aggressive for some use cases. Call them explicitly if needed.
 *
 * @example
 * ```ts
 * symbolTransform("Wait... 5x5 != 20 (c) 2024")
 * // → "Wait… 5×5 ≠ 20 © 2024"
 * ```
 */
export function symbolTransform(text: string, options: SymbolOptions = {}): string {
  text = ellipsis(text, options)
  text = multiplication(text, options)
  text = mathSymbols(text)
  text = legalSymbols(text)
  if (options.includeArrows !== false) {
    text = arrows(text, options)
  }
  return text
}
