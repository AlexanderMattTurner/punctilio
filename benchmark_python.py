#!/usr/bin/env python3
"""
Benchmark Python typography packages for fair cross-ecosystem comparison.
Run: python benchmark_python.py

This script tests Python's smartypants and typogrify packages against
the same test cases used in the JavaScript benchmark.

Install dependencies:
    pip install smartypants typogrify

FAIRNESS NOTE: This benchmark uses the same test cases as the JavaScript
benchmark (benchmark.mjs) to enable fair cross-ecosystem comparison.
Python's smartypants is the ORIGINAL implementation by John Gruber that
inspired all JavaScript ports.
"""

import sys

try:
    import smartypants
except ImportError:
    print("ERROR: smartypants not installed. Run: pip install smartypants")
    sys.exit(1)

try:
    from typogrify.filters import typogrify
except ImportError:
    typogrify = None
    print("WARNING: typogrify not installed. Run: pip install typogrify")
    print("Continuing without typogrify tests...\n")

# Unicode symbols for expected outputs
UNICODE_SYMBOLS = {
    "ELLIPSIS": "\u2026",
    "MULTIPLICATION": "\u00D7",
    "NOT_EQUAL": "\u2260",
    "PLUS_MINUS": "\u00B1",
    "COPYRIGHT": "\u00A9",
    "REGISTERED": "\u00AE",
    "TRADEMARK": "\u2122",
    "DEGREE": "\u00B0",
    "ARROW_RIGHT": "\u2192",
    "ARROW_LEFT": "\u2190",
    "ARROW_LEFT_RIGHT": "\u2194",
    "APPROXIMATE": "\u2248",
    "LESS_EQUAL": "\u2264",
    "GREATER_EQUAL": "\u2265",
    "PRIME": "\u2032",
    "DOUBLE_PRIME": "\u2033",
    "FRACTION_1_4": "\u00BC",
    "FRACTION_1_2": "\u00BD",
    "FRACTION_3_4": "\u00BE",
    "FRACTION_1_3": "\u2153",
    "FRACTION_2_3": "\u2154",
    "FRACTION_1_8": "\u215B",
    "SUPERSCRIPT_ST": "\u02E2\u1D57",
    "SUPERSCRIPT_ND": "\u207F\u1D48",
    "SUPERSCRIPT_RD": "\u02B3\u1D48",
    "SUPERSCRIPT_TH": "\u1D57\u02B0",
    "EM_DASH": "\u2014",
    "EN_DASH": "\u2013",
    "MINUS": "\u2212",
    "LEFT_DOUBLE_QUOTE": "\u201C",
    "RIGHT_DOUBLE_QUOTE": "\u201D",
    "LEFT_SINGLE_QUOTE": "\u2018",
    "RIGHT_SINGLE_QUOTE": "\u2019",
    # Ligatures
    "DOUBLE_QUESTION": "\u2047",
    "QUESTION_EXCLAMATION": "\u2048",
    "EXCLAMATION_QUESTION": "\u2049",
    # German quotes
    "GERMAN_LEFT_DOUBLE": "\u201E",
    "GERMAN_RIGHT_DOUBLE": "\u201C",
    "GERMAN_LEFT_SINGLE": "\u201A",
    "GERMAN_RIGHT_SINGLE": "\u2018",
    # French quotes
    "FRENCH_LEFT_DOUBLE": "\u00AB",
    "FRENCH_RIGHT_DOUBLE": "\u00BB",
}

# Shorter aliases
LDQ = UNICODE_SYMBOLS["LEFT_DOUBLE_QUOTE"]
RDQ = UNICODE_SYMBOLS["RIGHT_DOUBLE_QUOTE"]
LSQ = UNICODE_SYMBOLS["LEFT_SINGLE_QUOTE"]
RSQ = UNICODE_SYMBOLS["RIGHT_SINGLE_QUOTE"]
EM_DASH = UNICODE_SYMBOLS["EM_DASH"]
EN_DASH = UNICODE_SYMBOLS["EN_DASH"]
ELLIPSIS = UNICODE_SYMBOLS["ELLIPSIS"]
MULTIPLICATION = UNICODE_SYMBOLS["MULTIPLICATION"]
NOT_EQUAL = UNICODE_SYMBOLS["NOT_EQUAL"]
PLUS_MINUS = UNICODE_SYMBOLS["PLUS_MINUS"]
COPYRIGHT = UNICODE_SYMBOLS["COPYRIGHT"]
REGISTERED = UNICODE_SYMBOLS["REGISTERED"]
TRADEMARK = UNICODE_SYMBOLS["TRADEMARK"]
ARROW_RIGHT = UNICODE_SYMBOLS["ARROW_RIGHT"]
ARROW_LEFT = UNICODE_SYMBOLS["ARROW_LEFT"]
ARROW_LEFT_RIGHT = UNICODE_SYMBOLS["ARROW_LEFT_RIGHT"]
DEGREE = UNICODE_SYMBOLS["DEGREE"]
PRIME = UNICODE_SYMBOLS["PRIME"]
DOUBLE_PRIME = UNICODE_SYMBOLS["DOUBLE_PRIME"]
FRACTION_1_2 = UNICODE_SYMBOLS["FRACTION_1_2"]
FRACTION_1_4 = UNICODE_SYMBOLS["FRACTION_1_4"]
FRACTION_3_4 = UNICODE_SYMBOLS["FRACTION_3_4"]
FRACTION_1_3 = UNICODE_SYMBOLS["FRACTION_1_3"]
FRACTION_2_3 = UNICODE_SYMBOLS["FRACTION_2_3"]
FRACTION_1_8 = UNICODE_SYMBOLS["FRACTION_1_8"]
SUPERSCRIPT_ST = UNICODE_SYMBOLS["SUPERSCRIPT_ST"]
SUPERSCRIPT_ND = UNICODE_SYMBOLS["SUPERSCRIPT_ND"]
SUPERSCRIPT_RD = UNICODE_SYMBOLS["SUPERSCRIPT_RD"]
SUPERSCRIPT_TH = UNICODE_SYMBOLS["SUPERSCRIPT_TH"]
MINUS = UNICODE_SYMBOLS["MINUS"]
APPROXIMATE = UNICODE_SYMBOLS["APPROXIMATE"]
LESS_EQUAL = UNICODE_SYMBOLS["LESS_EQUAL"]
GREATER_EQUAL = UNICODE_SYMBOLS["GREATER_EQUAL"]
DOUBLE_QUESTION = UNICODE_SYMBOLS["DOUBLE_QUESTION"]
QUESTION_EXCLAMATION = UNICODE_SYMBOLS["QUESTION_EXCLAMATION"]
EXCLAMATION_QUESTION = UNICODE_SYMBOLS["EXCLAMATION_QUESTION"]
GLD = UNICODE_SYMBOLS["GERMAN_LEFT_DOUBLE"]
GRD = UNICODE_SYMBOLS["GERMAN_RIGHT_DOUBLE"]
GLS = UNICODE_SYMBOLS["GERMAN_LEFT_SINGLE"]
GRS = UNICODE_SYMBOLS["GERMAN_RIGHT_SINGLE"]
FLD = UNICODE_SYMBOLS["FRENCH_LEFT_DOUBLE"]
FRD = UNICODE_SYMBOLS["FRENCH_RIGHT_DOUBLE"]

# Test cases - same as JavaScript benchmark for fair comparison
test_cases = {
    # === QUOTES ===
    "Double quotes - basic": [
        ('"This is a quote", she said.', f'{LDQ}This is a quote,{RDQ} she said.'),
        ('She said, "This is a quote."', f'She said, {LDQ}This is a quote.{RDQ}'),
        ('"Hello." Mary', f'{LDQ}Hello.{RDQ} Mary'),
    ],
    "Double quotes - multiple": [
        ('"I am" so "tired" of "these" "quotes".', f'{LDQ}I am{RDQ} so {LDQ}tired{RDQ} of {LDQ}these{RDQ} {LDQ}quotes.{RDQ}'),
    ],
    "Double quotes - with punctuation": [
        ('"This is a quote!".', f'{LDQ}This is a quote!{RDQ}.'),
        ('"world model";', f'{LDQ}world model{RDQ};'),
        ('("the best")', f'({LDQ}the best{RDQ})'),
    ],
    "Single quotes - basic": [
        ("He said, 'Hi'", f"He said, {LSQ}Hi{RSQ}"),
        ("He wanted 'power.'", f"He wanted {LSQ}power.{RSQ}"),
    ],
    "Contractions": [
        ("I'd", f"I{RSQ}d"),
        ("don't", f"don{RSQ}t"),
        ("I'm not the best, haven't you heard?", f"I{RSQ}m not the best, haven{RSQ}t you heard?"),
    ],
    "Apostrophe ambiguity - leading apostrophe": [
        ("'SUP", f"{RSQ}SUP"),
        ("Rock 'n' Roll", f"Rock {RSQ}n{RSQ} Roll"),
        ("I was born in '99", f"I was born in {RSQ}99"),
        ("'99 tigers weren't a match", f"{RSQ}99 tigers weren{RSQ}t a match"),
    ],
    "Possessives": [
        ("strategy s's return is good", f"strategy s{RSQ}s return is good"),
    ],
    "Nested quotes": [
        ('"She said \'hello\'"', f'{LDQ}She said {LSQ}hello{RSQ}{RDQ}'),
        ('"\'sup"', f'{LDQ}{RSQ}sup{RDQ}'),
    ],

    # === DASHES ===
    "Em dashes - basic": [
        ("This is a - hyphen.", "This is a—hyphen."),
        ("word — word", "word—word"),
    ],
    "Em dashes - double/triple": [
        ("word ---", "word—"),
        ("Hi-- what do you think?", "Hi—what do you think?"),
        ("since--as you know", "since—as you know"),
    ],
    "Number ranges - en dash": [
        ("Pages 1-5", "Pages 1–5"),
        ("2000-2020", "2000–2020"),
        ("p.10-15", "p.10–15"),
    ],
    "Date ranges - en dash": [
        ("January-March", "January–March"),
        ("Jan-Mar", "Jan–Mar"),
    ],
    "Minus signs": [
        ("-5", "−5"),
        ("(-5)", "(−5)"),
        ("The value is -10", "The value is −10"),
    ],
    "Compound words preserved": [
        ("a browser- or OS-specific fashion", "a browser- or OS-specific fashion"),
        ("well-known", "well-known"),
    ],

    # === SYMBOLS ===
    "Ellipsis": [
        ("Wait for it...", f"Wait for it{ELLIPSIS}"),
        ("Hmm... let me think", f"Hmm{ELLIPSIS} let me think"),
        ("...", ELLIPSIS),
    ],
    "Ellipsis - preserve abbreviations": [
        ("e.g.", "e.g."),
        ("U.S.A.", "U.S.A."),
    ],
    "Multiplication": [
        ("5x5", f"5{MULTIPLICATION}5"),
        ("10 x 20", f"10 {MULTIPLICATION} 20"),
        ("Resolution: 1920x1080", f"Resolution: 1920{MULTIPLICATION}1080"),
    ],
    "Multiplication - preserve words": [
        ("extra", "extra"),
        ("complex", "complex"),
        ("x-axis", "x-axis"),
    ],
    "Math symbols": [
        ("x != y", f"x {NOT_EQUAL} y"),
        ("+-5", f"{PLUS_MINUS}5"),
        ("a <= b", f"a {LESS_EQUAL} b"),
        ("x >= y", f"x {GREATER_EQUAL} y"),
        ("~= 5", f"{APPROXIMATE} 5"),
    ],
    "Legal symbols": [
        ("Copyright (c) 2024", f"Copyright {COPYRIGHT} 2024"),
        ("Brand(r)", f"Brand{REGISTERED}"),
        ("Name(tm)", f"Name{TRADEMARK}"),
    ],
    "Arrows": [
        ("A -> B", f"A {ARROW_RIGHT} B"),
        ("A <- B", f"A {ARROW_LEFT} B"),
        ("A <-> B", f"A {ARROW_LEFT_RIGHT} B"),
    ],
    "Arrows - preserve code patterns": [
        ("function->call", "function->call"),
        ("array[0]->value", "array[0]->value"),
    ],
    "Prime marks - feet/inches": [
        ('5\'10"', f"5{PRIME}10{DOUBLE_PRIME}"),
        ('He is 6\'2" tall', f"He is 6{PRIME}2{DOUBLE_PRIME} tall"),
        ("The board is 8' long", f"The board is 8{PRIME} long"),
    ],
    "Prime marks - coordinates": [
        ("Location: 45° 30' 15\"", f"Location: 45° 30{PRIME} 15{DOUBLE_PRIME}"),
    ],
    "Degrees": [
        ("20 C", f"20 {DEGREE}C"),
        ("68 F", f"68 {DEGREE}F"),
        ("Water boils at 100 C", f"Water boils at 100 {DEGREE}C"),
    ],
    "Fractions": [
        ("1/2", FRACTION_1_2),
        ("1/4", FRACTION_1_4),
        ("3/4", FRACTION_3_4),
    ],
    "Fractions - preserve non-standard": [
        ("page 1/25", "page 1/25"),
        ("1/7", "1/7"),
    ],
    "Superscripts - ordinals": [
        ("1st", f"1{SUPERSCRIPT_ST}"),
        ("2nd", f"2{SUPERSCRIPT_ND}"),
        ("3rd", f"3{SUPERSCRIPT_RD}"),
        ("4th", f"4{SUPERSCRIPT_TH}"),
        ("21st place", f"21{SUPERSCRIPT_ST} place"),
        ("The 100th anniversary", f"The 100{SUPERSCRIPT_TH} anniversary"),
    ],

    # === COMPETITOR STRENGTH TESTS ===
    "Ligatures - punctuation": [
        ("What??", f"What{DOUBLE_QUESTION}"),
        ("Really?!", f"Really{QUESTION_EXCLAMATION}"),
        ("Wait!?", f"Wait{EXCLAMATION_QUESTION}"),
    ],
    "German quotes": [
        ('"Guten Tag"', f'{GLD}Guten Tag{GRD}'),
        ("'Hallo'", f'{GLS}Hallo{GRS}'),
    ],
    # Note: French typography uses non-breaking spaces inside guillemets
    "French quotes": [
        ('"Bonjour"', f'{FLD}\u00A0Bonjour\u00A0{FRD}'),
    ],
}


def run_smartypants(text):
    """Run Python smartypants with optimal settings."""
    # Use Attr.set2 for better dash handling (-- = en-dash, --- = em-dash)
    return smartypants.smartypants(text, smartypants.Attr.set2)


def run_typogrify(text):
    """Run typogrify (which uses smartypants internally)."""
    if typogrify is None:
        return None
    # typogrify wraps text in HTML spans, so we need to extract the content
    # For fair comparison, we'll use just the smartypants filter
    try:
        from typogrify.filters import smartypants as typo_smartypants
        return typo_smartypants(text)
    except Exception as e:
        return f"ERROR: {e}"


def main():
    packages = ["smartypants (Python)"]
    if typogrify:
        packages.append("typogrify")

    results = {pkg: {"passed": 0, "failed": 0} for pkg in packages}
    category_results = {}

    for category, cases in test_cases.items():
        category_results[category] = {}
        for pkg in packages:
            category_results[category][pkg] = {"passed": 0, "failed": 0, "failures": []}

        for input_text, expected in cases:
            for pkg in packages:
                if pkg == "smartypants (Python)":
                    actual = run_smartypants(input_text)
                elif pkg == "typogrify":
                    actual = run_typogrify(input_text)
                else:
                    continue

                if actual is None:
                    continue

                passed = actual == expected
                if passed:
                    results[pkg]["passed"] += 1
                    category_results[category][pkg]["passed"] += 1
                else:
                    results[pkg]["failed"] += 1
                    category_results[category][pkg]["failed"] += 1
                    category_results[category][pkg]["failures"].append({
                        "input": input_text,
                        "expected": expected,
                        "actual": actual
                    })

    # Output results
    print("=== PYTHON BENCHMARK RESULTS ===\n")
    print("Overall Scores:")
    for pkg in packages:
        r = results[pkg]
        total = r["passed"] + r["failed"]
        if total > 0:
            pct = (r["passed"] / total) * 100
            print(f"  {pkg}: {r['passed']}/{total} ({pct:.1f}%)")

    print("\n=== CATEGORY BREAKDOWN ===\n")
    for category, pkg_results in category_results.items():
        print(f"\n### {category}")
        for pkg in packages:
            r = pkg_results[pkg]
            status = "✓" if r["failed"] == 0 else f"✗ ({r['failed']} failed)"
            print(f"  {pkg}: {status}")

            # Show failures
            if r["failures"]:
                for f in r["failures"][:2]:
                    print(f"    Input: \"{f['input']}\"")
                    print(f"    Expected: \"{f['expected']}\"")
                    print(f"    Got: \"{f['actual']}\"")

    print("\n=== NOTES ===")
    print("Python's smartypants is the ORIGINAL implementation by John Gruber (2003).")
    print("Most JavaScript ports (including 'smartypants' npm package) are derived from it.")
    print("This benchmark uses the same test cases as benchmark.mjs for fair comparison.")


if __name__ == "__main__":
    main()
