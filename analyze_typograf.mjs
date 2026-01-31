/**
 * Analyze typograf's transformations to see if they're producing
 * valid alternatives rather than wrong answers.
 */

import Typograf from 'typograf';
import { transform } from './dist/index.js';

const typografEn = new Typograf({ locale: ['en-US'] });

// Test cases where typograf might produce valid alternatives
const testCases = [
  { input: '"Hello"', desc: 'Simple quotes' },
  { input: 'He said, \'Hi\'', desc: 'Single quotes' },
  { input: 'don\'t', desc: 'Contraction' },
  { input: 'A -> B', desc: 'Arrow' },
  { input: 'Pages 1-5', desc: 'Number range' },
  { input: '-5', desc: 'Minus sign' },
  { input: 'Wait for it...', desc: 'Ellipsis' },
  { input: '5x5', desc: 'Multiplication' },
  { input: 'Copyright (c) 2024', desc: 'Copyright' },
  { input: '20 C', desc: 'Degrees' },
  { input: 'This is a - test.', desc: 'Em dash context' },
];

console.log('=== TYPOGRAF ANALYSIS ===\n');
console.log('Comparing typograf output to punctilio expected output:\n');

for (const { input, desc } of testCases) {
  const typografOut = typografEn.execute(input);
  const punctilioOut = transform(input, { symbols: true, fractions: true, degrees: true });

  const match = typografOut === punctilioOut;

  console.log(`${desc}:`);
  console.log(`  Input:     "${input}"`);
  console.log(`  Punctilio: "${punctilioOut}"`);
  console.log(`  Typograf:  "${typografOut}"`);
  console.log(`  Match: ${match ? '✓' : '✗'}`);

  if (!match) {
    // Show character codes for differences
    console.log('  Char analysis:');
    for (let i = 0; i < Math.max(typografOut.length, punctilioOut.length); i++) {
      const tChar = typografOut[i] || '';
      const pChar = punctilioOut[i] || '';
      if (tChar !== pChar) {
        console.log(`    Position ${i}: typograf='${tChar}' (U+${tChar.charCodeAt(0)?.toString(16).toUpperCase().padStart(4, '0') || 'N/A'}), punctilio='${pChar}' (U+${pChar.charCodeAt(0)?.toString(16).toUpperCase().padStart(4, '0') || 'N/A'})`);
      }
    }
  }
  console.log();
}

// Show typograf's capabilities
console.log('\n=== TYPOGRAF RULES ===\n');
console.log('Enabled rules for English:', typografEn.getEnabledRules().filter(r => r.includes('quote') || r.includes('dash') || r.includes('ellipsis') || r.includes('arrow')).slice(0, 20));
