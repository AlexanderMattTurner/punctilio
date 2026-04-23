/**
 * Benchmark punctilio against competitor typography packages.
 *
 * FAIR COMPARISON: Normalizes before comparison:
 * 1. Space variants (nbsp, thin space, etc.) → regular space
 * 2. Dash styles: British spaced (word – word) → American unspaced (word—word)
 * 3. Copyright: "Copyright ©" → "©" (typograf removes "Copyright" text)
 *
 * This prevents penalizing packages for valid typographic choices.
 *
 * Run: node benchmark.mjs
 */

import { readFileSync } from 'fs';
import { smartypantsu } from 'smartypants';
import tipograph from 'tipograph';
import smartquotes from 'smartquotes';
import Typograf from 'typograf';
import retextSmartypants from 'retext-smartypants';
import { retext } from 'retext';
import { transform } from './dist/index.js';

const testCases = JSON.parse(readFileSync('./benchmark_cases.json', 'utf-8'));

// Configure tipograph
const tipographEnglish = tipograph({ language: 'english' });
const tipographGerman = tipograph({ language: 'german' });
const tipographFrench = tipograph({ language: 'french' });

// Configure typograf for English
const typografEn = new Typograf({ locale: ['en-US'] });
typografEn.enableRule('common/punctuation/*');
typografEn.enableRule('common/symbols/*');

// Configure typograf for German
const typografDe = new Typograf({ locale: ['de'] });

// Configure typograf for French
const typografFr = new Typograf({ locale: ['fr'] });

// Configure retext-smartypants processor
const retextProcessor = retext().use(retextSmartypants, {
  dashes: 'oldschool',
  ellipses: true,
  quotes: true
});

/**
 * Normalize space characters for fair comparison.
 * Treats all Unicode space variants as equivalent to regular space.
 */
function normalizeSpaces(str) {
  // U+00A0 = non-breaking space
  // U+2009 = thin space
  // U+202F = narrow no-break space
  // U+2007 = figure space
  // U+2008 = punctuation space
  return str.replace(/[\u00A0\u2009\u202F\u2007\u2008]/g, ' ');
}

/**
 * Normalize dash styles for fair comparison.
 * Converts British-style spaced dashes to American-style unspaced em-dashes.
 *
 * British: "word – word" (spaced en-dash) or "word — word" (spaced em-dash)
 * American: "word—word" (unspaced em-dash)
 */
function normalizeDashes(str) {
  // Spaced em-dash → unspaced em-dash
  str = str.replace(/ ?— ?/g, '—');
  // Spaced en-dash (used as parenthetical, not range) → unspaced em-dash
  // Only match when there are spaces on both sides (parenthetical use)
  str = str.replace(/ – /g, '—');
  return str;
}

/**
 * Normalize copyright handling.
 * Typograf removes "Copyright" text entirely: "Copyright © 2024" → "© 2024"
 * We normalize by removing "Copyright " prefix before ©.
 */
function normalizeCopyright(str) {
  return str.replace(/Copyright ©/gi, '©');
}

/**
 * Full normalization for fair comparison.
 */
function normalize(str) {
  str = normalizeSpaces(str);
  str = normalizeDashes(str);
  str = normalizeCopyright(str);
  return str;
}

function getTipographForCategory(category) {
  if (category.includes('German')) return tipographGerman;
  if (category.includes('French')) return tipographFrench;
  return tipographEnglish;
}

function getTypografForCategory(category) {
  if (category.includes('German')) return typografDe;
  if (category.includes('French')) return typografFr;
  return typografEn;
}

function getPunctuationStyleForCategory(category) {
  if (category.includes('German')) return 'german';
  if (category.includes('French')) return 'french';
  return 'american';
}

async function runPackage(pkg, input, category) {
  if (pkg === 'punctilio') {
    return transform(input, { symbols: true, punctuationStyle: getPunctuationStyleForCategory(category) });
  } else if (pkg === 'smartypants') {
    return smartypantsu(input, "2");
  } else if (pkg === 'tipograph') {
    return getTipographForCategory(category)(input);
  } else if (pkg === 'smartquotes') {
    return smartquotes.string(input);
  } else if (pkg === 'typograf') {
    return getTypografForCategory(category).execute(input);
  } else if (pkg === 'retext-smartypants') {
    const result = await retextProcessor.process(input);
    return String(result);
  }
}

const packages = ['punctilio', 'smartypants', 'tipograph', 'smartquotes', 'typograf', 'retext-smartypants'];
const results = Object.fromEntries(packages.map(p => [p, { passed: 0, failed: 0 }]));
const categoryResults = {};

async function runBenchmark() {
  console.log('=== BENCHMARK (with fair normalization) ===\n');
  console.log('Normalizations applied:');
  console.log('  - Space variants (nbsp, thin space) → regular space');
  console.log('  - British spaced dashes (word – word) → American unspaced (word—word)');
  console.log('  - Copyright: "Copyright ©" → "©"\n');

  for (const [category, cases] of Object.entries(testCases)) {
    categoryResults[category] = Object.fromEntries(
      packages.map(p => [p, { passed: 0, failed: 0, failures: [] }])
    );

    for (const [input, expected] of cases) {
      for (const pkg of packages) {
        try {
          const actual = await runPackage(pkg, input, category);
          const normalizedActual = normalize(actual);
          const normalizedExpected = normalize(expected);
          const passed = normalizedActual === normalizedExpected;

          if (passed) {
            results[pkg].passed++;
            categoryResults[category][pkg].passed++;
          } else {
            results[pkg].failed++;
            categoryResults[category][pkg].failed++;
            categoryResults[category][pkg].failures.push({
              input,
              expected: normalizedExpected,
              actual: normalizedActual,
              rawActual: actual
            });
          }
        } catch (e) {
          results[pkg].failed++;
          categoryResults[category][pkg].failed++;
          categoryResults[category][pkg].failures.push({ input, expected, actual: `ERROR: ${e.message}` });
        }
      }
    }
  }

  console.log('Overall Scores (sorted by accuracy):');
  const sortedPackages = [...packages].sort((a, b) => results[b].passed - results[a].passed);
  for (const pkg of sortedPackages) {
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

      if (r.failures.length > 0) {
        for (const f of r.failures.slice(0, 1)) {
          console.log(`    Input: "${f.input}"`);
          console.log(`    Expected: "${f.expected}"`);
          console.log(`    Got: "${f.actual}"`);
        }
      }
    }
  }

  // Performance benchmark
  console.log('\n\n=== PERFORMANCE BENCHMARK ===\n');
  const sampleText = `"Hello," she said. "It's a beautiful day -- isn't it?" The temperature was 20 C and he was 5'10" tall. Pages 1-5 contain important info... See section 1/2 for details.`;
  const iterations = 1000;

  console.log(`Sample text (${sampleText.length} chars), ${iterations} iterations:\n`);

  for (const pkg of packages) {
    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      await runPackage(pkg, sampleText, 'test');
    }
    const elapsed = performance.now() - start;
    const opsPerSec = (iterations / (elapsed / 1000)).toFixed(0);
    console.log(`  ${pkg}: ${elapsed.toFixed(1)}ms total, ${opsPerSec} ops/sec`);
  }

  // Typograf-specific features not in punctilio
  console.log('\n\n=== TYPOGRAF UNIQUE FEATURES ===\n');
  console.log('Features typograf provides that punctilio lacks:\n');

  const typografFeatures = [
    { input: 'See section 5.', desc: 'Non-breaking space before numbers at end' },
    { input: 'Dr. Smith', desc: 'Non-breaking space after honorifics' },
    { input: '© 2024', desc: 'Non-breaking space after symbols' },
    { input: 'I said: "Hello"', desc: 'Non-breaking space after colon before quote' },
    { input: '100 kg', desc: 'Non-breaking space between number and unit' },
    { input: 'Chapter 1', desc: 'Non-breaking space before single digit' },
  ];

  for (const { input, desc } of typografFeatures) {
    const typografOut = typografEn.execute(input);
    const punctilioOut = transform(input, { symbols: true });

    // Check if typograf added nbsp where punctilio didn't
    const typografHasNbsp = typografOut.includes('\u00A0');
    const punctilioHasNbsp = punctilioOut.includes('\u00A0');

    if (typografHasNbsp && !punctilioHasNbsp) {
      console.log(`${desc}:`);
      console.log(`  Input:     "${input}"`);
      console.log(`  Typograf:  "${typografOut}" (has nbsp)`);
      console.log(`  Punctilio: "${punctilioOut}" (no nbsp)`);
      console.log();
    }
  }
}

runBenchmark().catch(console.error);
