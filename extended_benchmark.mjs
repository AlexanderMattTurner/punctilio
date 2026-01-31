/**
 * Extended benchmark including typograf and retext-smartypants.
 *
 * FAIR COMPARISON: Normalizes space characters before comparison so that
 * non-breaking spaces (U+00A0), thin spaces (U+2009), etc. are treated
 * as equivalent to regular spaces. This prevents penalizing packages
 * that add typographically-correct non-breaking spaces.
 *
 * Run: node extended_benchmark.mjs
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
  // Replace various space characters with regular space
  // U+00A0 = non-breaking space
  // U+2009 = thin space
  // U+202F = narrow no-break space
  // U+2007 = figure space
  // U+2008 = punctuation space
  return str.replace(/[\u00A0\u2009\u202F\u2007\u2008]/g, ' ');
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

async function runPackage(pkg, input, category) {
  if (pkg === 'punctilio') {
    return transform(input, { symbols: true, fractions: true, degrees: true, superscript: true, ligatures: true });
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
  console.log('=== FAIR BENCHMARK (space-normalized) ===\n');
  console.log('Note: All space variants (nbsp, thin space, etc.) treated as equivalent.\n');

  for (const [category, cases] of Object.entries(testCases)) {
    categoryResults[category] = Object.fromEntries(
      packages.map(p => [p, { passed: 0, failed: 0, failures: [] }])
    );

    for (const [input, expected] of cases) {
      for (const pkg of packages) {
        try {
          const actual = await runPackage(pkg, input, category);
          // Normalize spaces before comparison for fairness
          const normalizedActual = normalizeSpaces(actual);
          const normalizedExpected = normalizeSpaces(expected);
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
