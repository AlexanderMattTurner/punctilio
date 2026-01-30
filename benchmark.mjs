/**
 * Benchmark punctilio against competitor packages.
 * Run: node benchmark.mjs
 */

import { smartypantsu } from 'smartypants';
import * as trembySmartypants from '@tremby/smartypants';
import tipograph from 'tipograph';
import smartquotes from 'smartquotes';
import { transform } from './dist/index.js';

// Unicode symbols for expected outputs
const UNICODE_SYMBOLS = {
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
  FRACTION_1_8: "\u215B",
  EM_DASH: "\u2014",
  EN_DASH: "\u2013",
  MINUS: "\u2212",
  LEFT_DOUBLE_QUOTE: "\u201C",
  RIGHT_DOUBLE_QUOTE: "\u201D",
  LEFT_SINGLE_QUOTE: "\u2018",
  RIGHT_SINGLE_QUOTE: "\u2019",
};

const {
  LEFT_DOUBLE_QUOTE: LDQ,
  RIGHT_DOUBLE_QUOTE: RDQ,
  LEFT_SINGLE_QUOTE: LSQ,
  RIGHT_SINGLE_QUOTE: RSQ,
  EM_DASH,
  EN_DASH,
  ELLIPSIS,
  MULTIPLICATION,
  NOT_EQUAL,
  PLUS_MINUS,
  COPYRIGHT,
  REGISTERED,
  TRADEMARK,
  ARROW_RIGHT,
  ARROW_LEFT,
  ARROW_LEFT_RIGHT,
  DEGREE,
  PRIME,
  DOUBLE_PRIME,
  FRACTION_1_2,
  FRACTION_1_4,
  FRACTION_3_4,
  FRACTION_1_3,
  FRACTION_2_3,
  FRACTION_1_8,
  MINUS,
  APPROXIMATE,
  LESS_EQUAL,
  GREATER_EQUAL,
} = UNICODE_SYMBOLS;

// Test cases from punctilio's test suite, organized by category
const testCases = {
  // === QUOTES ===
  "Double quotes - basic": [
    ['"This is a quote", she said.', `${LDQ}This is a quote,${RDQ} she said.`],  // American: comma inside
    ['She said, "This is a quote."', `She said, ${LDQ}This is a quote.${RDQ}`],
    ['"Hello." Mary', `${LDQ}Hello.${RDQ} Mary`],
  ],
  "Double quotes - multiple": [
    ['"I am" so "tired" of "these" "quotes".', `${LDQ}I am${RDQ} so ${LDQ}tired${RDQ} of ${LDQ}these${RDQ} ${LDQ}quotes.${RDQ}`],
  ],
  "Double quotes - with punctuation": [
    ['"This is a quote!".', `${LDQ}This is a quote!${RDQ}.`],
    ['"world model";', `${LDQ}world model${RDQ};`],
    ['("the best")', `(${LDQ}the best${RDQ})`],
  ],
  "Single quotes - basic": [
    ["He said, 'Hi'", `He said, ${LSQ}Hi${RSQ}`],
    ["He wanted 'power.'", `He wanted ${LSQ}power.${RSQ}`],
  ],
  "Contractions": [
    ["I'd", `I${RSQ}d`],
    ["don't", `don${RSQ}t`],
    ["I'm not the best, haven't you heard?", `I${RSQ}m not the best, haven${RSQ}t you heard?`],
  ],
  "Apostrophe ambiguity - leading apostrophe": [
    ["'SUP", `${RSQ}SUP`],
    ["Rock 'n' Roll", `Rock ${RSQ}n${RSQ} Roll`],
    ["I was born in '99", `I was born in ${RSQ}99`],
    ["'99 tigers weren't a match", `${RSQ}99 tigers weren${RSQ}t a match`],
  ],
  "Possessives": [
    ["strategy s's return is good", `strategy s${RSQ}s return is good`],
  ],
  "Nested quotes": [
    ['"She said \'hello\'"', `${LDQ}She said ${LSQ}hello${RSQ}${RDQ}`],
    ['"\'sup"', `${LDQ}${RSQ}sup${RDQ}`],
  ],

  // === DASHES ===
  "Em dashes - basic": [
    ["This is a - hyphen.", "This is a—hyphen."],
    ["word — word", "word—word"],
  ],
  "Em dashes - double/triple": [
    ["word ---", "word—"],
    ["Hi-- what do you think?", "Hi—what do you think?"],
    ["since--as you know", "since—as you know"],
  ],
  "Number ranges - en dash": [
    ["Pages 1-5", "Pages 1–5"],
    ["2000-2020", "2000–2020"],
    ["p.10-15", "p.10–15"],
  ],
  "Date ranges - en dash": [
    ["January-March", "January–March"],
    ["Jan-Mar", "Jan–Mar"],
  ],
  "Minus signs": [
    ["-5", "−5"],
    ["(-5)", "(−5)"],
    ["The value is -10", "The value is −10"],
  ],
  "Compound words preserved": [
    ["a browser- or OS-specific fashion", "a browser- or OS-specific fashion"],
    ["well-known", "well-known"],
  ],

  // === SYMBOLS ===
  "Ellipsis": [
    ["Wait for it...", `Wait for it${ELLIPSIS}`],
    ["Hmm... let me think", `Hmm${ELLIPSIS} let me think`],
    ["...", ELLIPSIS],
  ],
  "Ellipsis - preserve abbreviations": [
    ["e.g.", "e.g."],
    ["U.S.A.", "U.S.A."],
  ],
  "Multiplication": [
    ["5x5", `5${MULTIPLICATION}5`],
    ["10 x 20", `10 ${MULTIPLICATION} 20`],
    ["Resolution: 1920x1080", `Resolution: 1920${MULTIPLICATION}1080`],
  ],
  "Multiplication - preserve words": [
    ["extra", "extra"],
    ["complex", "complex"],
    ["x-axis", "x-axis"],
  ],
  "Math symbols": [
    ["x != y", `x ${NOT_EQUAL} y`],
    ["+-5", `${PLUS_MINUS}5`],
    ["a <= b", `a ${LESS_EQUAL} b`],
    ["x >= y", `x ${GREATER_EQUAL} y`],
    ["~= 5", `${APPROXIMATE} 5`],
  ],
  "Legal symbols": [
    ["Copyright (c) 2024", `Copyright ${COPYRIGHT} 2024`],
    ["Brand(r)", `Brand${REGISTERED}`],
    ["Name(tm)", `Name${TRADEMARK}`],
  ],
  "Arrows": [
    ["A -> B", `A ${ARROW_RIGHT} B`],
    ["A <- B", `A ${ARROW_LEFT} B`],
    ["A <-> B", `A ${ARROW_LEFT_RIGHT} B`],
  ],
  "Arrows - preserve code patterns": [
    ["function->call", "function->call"],
    ["array[0]->value", "array[0]->value"],
  ],
  "Prime marks - feet/inches": [
    ['5\'10"', `5${PRIME}10${DOUBLE_PRIME}`],
    ['He is 6\'2" tall', `He is 6${PRIME}2${DOUBLE_PRIME} tall`],
    ["The board is 8' long", `The board is 8${PRIME} long`],
  ],
  "Prime marks - coordinates": [
    ["Location: 45° 30' 15\"", `Location: 45° 30${PRIME} 15${DOUBLE_PRIME}`],
  ],
  "Degrees": [
    ["20 C", `20 ${DEGREE}C`],
    ["68 F", `68 ${DEGREE}F`],
    ["Water boils at 100 C", `Water boils at 100 ${DEGREE}C`],
  ],
  "Fractions": [
    ["1/2", FRACTION_1_2],
    ["1/4", FRACTION_1_4],
    ["3/4", FRACTION_3_4],
  ],
  "Fractions - preserve non-standard": [
    ["page 1/25", "page 1/25"],
    ["1/7", "1/7"],
  ],
};

// Initialize tipograph
const tipographTransform = tipograph();

// Run a package on a test case
function runPackage(pkg, input, options = {}) {
  try {
    if (pkg === 'punctilio') {
      return transform(input, { symbols: true, fractions: true, degrees: true, ...options });
    } else if (pkg === 'smartypants') {
      return smartypantsu(input);
    } else if (pkg === 'tipograph') {
      return tipographTransform(input);
    } else if (pkg === 'smartquotes') {
      return smartquotes.string(input);
    }
  } catch (e) {
    return `ERROR: ${e.message}`;
  }
}

// Compare outputs
function isMatch(actual, expected) {
  return actual === expected;
}

// Run benchmark
const results = {
  punctilio: { passed: 0, failed: 0, details: {} },
  smartypants: { passed: 0, failed: 0, details: {} },
  tipograph: { passed: 0, failed: 0, details: {} },
  smartquotes: { passed: 0, failed: 0, details: {} },
};

const packages = ['punctilio', 'smartypants', 'tipograph', 'smartquotes'];
const categoryResults = {};

for (const [category, cases] of Object.entries(testCases)) {
  categoryResults[category] = {};

  for (const pkg of packages) {
    categoryResults[category][pkg] = { passed: 0, failed: 0, failures: [] };
  }

  for (const [input, expected] of cases) {
    for (const pkg of packages) {
      const actual = runPackage(pkg, input);
      const passed = isMatch(actual, expected);

      if (passed) {
        results[pkg].passed++;
        categoryResults[category][pkg].passed++;
      } else {
        results[pkg].failed++;
        categoryResults[category][pkg].failed++;
        categoryResults[category][pkg].failures.push({
          input,
          expected,
          actual
        });
      }
    }
  }
}

// Output results
console.log('=== BENCHMARK RESULTS ===\n');

console.log('Overall Scores:');
for (const pkg of packages) {
  const r = results[pkg];
  const total = r.passed + r.failed;
  const pct = ((r.passed / total) * 100).toFixed(1);
  console.log(`  ${pkg}: ${r.passed}/${total} (${pct}%)`);
}

console.log('\n=== CATEGORY BREAKDOWN ===\n');

for (const [category, pkgResults] of Object.entries(categoryResults)) {
  console.log(`\n### ${category}`);
  for (const pkg of packages) {
    const r = pkgResults[pkg];
    const status = r.failed === 0 ? '✓' : `✗ (${r.failed} failed)`;
    console.log(`  ${pkg}: ${status}`);

    // Show failures for non-punctilio packages
    if (r.failures.length > 0 && pkg !== 'punctilio') {
      for (const f of r.failures.slice(0, 2)) {
        console.log(`    Input: "${f.input}"`);
        console.log(`    Expected: "${f.expected}"`);
        console.log(`    Got: "${f.actual}"`);
      }
    }
  }
}

// Generate JSON summary for markdown table
console.log('\n\n=== JSON SUMMARY FOR TABLE ===\n');
console.log(JSON.stringify({ categoryResults, results }, null, 2));
