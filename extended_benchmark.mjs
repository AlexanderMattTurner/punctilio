/**
 * Extended benchmark including typograf and retext-smartypants.
 * Addresses the concern that punctilio's benchmark omits major competitors.
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
// Enable additional rules for fair comparison
typografEn.enableRule('common/punctuation/*');
typografEn.enableRule('common/symbols/*');

// Configure typograf for German
const typografDe = new Typograf({ locale: ['de'] });

// Configure typograf for French
const typografFr = new Typograf({ locale: ['fr'] });

// Configure retext-smartypants processor
const retextProcessor = retext().use(retextSmartypants, {
  dashes: 'oldschool',  // Enable -- to em-dash
  ellipses: true,
  quotes: true
});

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
  for (const [category, cases] of Object.entries(testCases)) {
    categoryResults[category] = Object.fromEntries(
      packages.map(p => [p, { passed: 0, failed: 0, failures: [] }])
    );

    for (const [input, expected] of cases) {
      for (const pkg of packages) {
        try {
          const actual = await runPackage(pkg, input, category);
          const passed = actual === expected;

          if (passed) {
            results[pkg].passed++;
            categoryResults[category][pkg].passed++;
          } else {
            results[pkg].failed++;
            categoryResults[category][pkg].failed++;
            categoryResults[category][pkg].failures.push({ input, expected, actual });
          }
        } catch (e) {
          results[pkg].failed++;
          categoryResults[category][pkg].failed++;
          categoryResults[category][pkg].failures.push({ input, expected, actual: `ERROR: ${e.message}` });
        }
      }
    }
  }

  console.log('=== EXTENDED BENCHMARK RESULTS ===\n');
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

      // Show failures for all packages for transparency
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
}

runBenchmark().catch(console.error);
