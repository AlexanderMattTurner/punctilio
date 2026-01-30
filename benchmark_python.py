#!/usr/bin/env python3
"""
Benchmark Python typography packages.
Run: pip install smartypants typogrify && python benchmark_python.py
"""

import html
import json
import smartypants
from typogrify.filters import smartypants as typogrify_smartypants

with open('benchmark_cases.json') as f:
    test_cases = json.load(f)

packages = ['smartypants (Python)', 'typogrify']
results = {pkg: {'passed': 0, 'failed': 0} for pkg in packages}
category_results = {}

for category, cases in test_cases.items():
    category_results[category] = {pkg: {'passed': 0, 'failed': 0, 'failures': []} for pkg in packages}

    for input_text, expected in cases:
        for pkg in packages:
            if pkg == 'smartypants (Python)':
                actual = html.unescape(smartypants.smartypants(input_text, smartypants.Attr.set2))
            else:
                actual = html.unescape(typogrify_smartypants(input_text))

            passed = actual == expected
            if passed:
                results[pkg]['passed'] += 1
                category_results[category][pkg]['passed'] += 1
            else:
                results[pkg]['failed'] += 1
                category_results[category][pkg]['failed'] += 1
                category_results[category][pkg]['failures'].append({
                    'input': input_text, 'expected': expected, 'actual': actual
                })

print('=== PYTHON BENCHMARK RESULTS ===\n')
print('Overall Scores:')
for pkg in packages:
    r = results[pkg]
    total = r['passed'] + r['failed']
    pct = (r['passed'] / total) * 100
    print(f"  {pkg}: {r['passed']}/{total} ({pct:.1f}%)")

print('\n=== CATEGORY BREAKDOWN ===\n')
for category, pkg_results in category_results.items():
    print(f'\n### {category}')
    for pkg in packages:
        r = pkg_results[pkg]
        status = '✓' if r['failed'] == 0 else f"✗ ({r['failed']} failed)"
        print(f'  {pkg}: {status}')
        for f in r['failures'][:2]:
            print(f"    Input: \"{f['input']}\"")
            print(f"    Expected: \"{f['expected']}\"")
            print(f"    Got: \"{f['actual']}\"")
