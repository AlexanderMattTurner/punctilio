/**
 * Shared Unicode constants used throughout the punctilio package.
 * 
 * This module provides a centralized location for all Unicode symbols
 * used in typography transformations, making the codebase more maintainable
 * and self-documenting.
 * 
 * @module constants
 */

/**
 * Unicode symbols for typography transformations.
 */
export const UNICODE_SYMBOLS = {
  ELLIPSIS: "\u2026",
  MULTIPLICATION: "\u00D7",
  NOT_EQUAL: "\u2260",
  PLUS_MINUS: "\u00B1",
  COPYRIGHT: "\u00A9",
  REGISTERED: "\u00AE",
  TRADEMARK: "\u2122",
  DEGREE: "\u00B0",
  ARROW_RIGHT: "\u2192",
  ARROW_LEFT: "\u2190",
  ARROW_LEFT_RIGHT: "\u2194",
  APPROXIMATE: "\u2248",
  LESS_EQUAL: "\u2264",
  GREATER_EQUAL: "\u2265",
  PRIME: "\u2032",
  DOUBLE_PRIME: "\u2033",
  FRACTION_1_4: "\u00BC",
  FRACTION_1_2: "\u00BD",
  FRACTION_3_4: "\u00BE",
  FRACTION_1_3: "\u2153",
  FRACTION_2_3: "\u2154",
  FRACTION_1_5: "\u2155",
  FRACTION_2_5: "\u2156",
  FRACTION_3_5: "\u2157",
  FRACTION_4_5: "\u2158",
  FRACTION_1_6: "\u2159",
  FRACTION_5_6: "\u215A",
  FRACTION_1_8: "\u215B",
  FRACTION_3_8: "\u215C",
  FRACTION_5_8: "\u215D",
  FRACTION_7_8: "\u215E",
  EM_DASH: "\u2014",
  EN_DASH: "\u2013",
  MINUS: "\u2212",
  LEFT_DOUBLE_QUOTE: "\u201C",
  RIGHT_DOUBLE_QUOTE: "\u201D",
  LEFT_SINGLE_QUOTE: "\u2018",
  RIGHT_SINGLE_QUOTE: "\u2019",
  NBSP: "\u00A0",
} as const

/**
 * Default separator character for text spanning HTML elements.
 * Uses Unicode Private Use Area character U+E000.
 */
export const DEFAULT_SEPARATOR = "\uE000"
export const ESCAPED_DEFAULT_SEPARATOR = DEFAULT_SEPARATOR.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
