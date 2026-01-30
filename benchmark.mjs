/**
 * Benchmark punctilio against competitor packages.
 * Run: node benchmark.mjs
 */

import { readFileSync } from 'fs';
import { smartypantsu } from 'smartypants';
import tipograph from 'tipograph';
import smartquotes from 'smartquotes';
import { transform } from './dist/index.js';

const testCases = JSON.parse(readFileSync('./benchmark_cases.json', 'utf-8'));

const tipographEnglish = tipograph({ language: 'english' });
const tipographGerman = tipograph({ language: 'german' });
const tipographFrench = tipograph({ language: 'french' });

function getTipographForCategory(category) {
  if (category.includes('German')) return tipographGerman;
  if (category.includes('French')) return tipographFrench;
  return tipographEnglish;
}

function runPackage(pkg, input, category) {
  if (pkg === 'punctilio') {
    return transform(input, { symbols: true, fractions: true, degrees: true, superscript: true });
  } else if (pkg === 'smartypants') {
    return smartypantsu(input, "2");
  } else if (pkg === 'tipograph') {
    return getTipographForCategory(category)(input);
  } else if (pkg === 'smartquotes') {
    return smartquotes.string(input);
  }
}

const packages = ['punctilio', 'smartypants', 'tipograph', 'smartquotes'];
const results = Object.fromEntries(packages.map(p => [p, { passed: 0, failed: 0 }]));
const categoryResults = {};

for (const [category, cases] of Object.entries(testCases)) {
  categoryResults[category] = Object.fromEntries(
    packages.map(p => [p, { passed: 0, failed: 0, failures: [] }])
  );

  for (const [input, expected] of cases) {
    for (const pkg of packages) {
      const actual = runPackage(pkg, input, category);
      const passed = actual === expected;

      if (passed) {
        results[pkg].passed++;
        categoryResults[category][pkg].passed++;
      } else {
        results[pkg].failed++;
        categoryResults[category][pkg].failed++;
        categoryResults[category][pkg].failures.push({ input, expected, actual });
      }
    }
  }
}

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

    if (r.failures.length > 0 && pkg !== 'punctilio') {
      for (const f of r.failures.slice(0, 2)) {
        console.log(`    Input: "${f.input}"`);
        console.log(`    Expected: "${f.expected}"`);
        console.log(`    Got: "${f.actual}"`);
      }
    }
  }
}
