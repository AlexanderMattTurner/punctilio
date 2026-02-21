# Chromium Patch: Fold U+02BB and U+02BC in Find-in-Page

## Problem

Chromium's find-in-page (Ctrl+F) folds several Unicode quote characters to
their ASCII equivalents so that searching with a straight quote matches curly
quotes on the page. However, **U+02BB MODIFIER LETTER TURNED COMMA** and
**U+02BC MODIFIER LETTER APOSTROPHE** are not included in this folding.

U+02BB is used as a letter in Hawaiian (ʻokina), Tongan, and Samoan.
U+02BC is the [Unicode-recommended character][unicode-apostrophe] for
representing the apostrophe where it functions as a letter (e.g. Kazakh Latin,
several African orthographies). It is also used by typographic processing
libraries (like [punctilio][]) that distinguish the apostrophe from the right
single quotation mark (U+2019).

When a page uses either character, a user searching for `Hawaiʻi` or `don't`
(with ASCII `'` or curly `'`) gets **no match**, which is confusing.

[unicode-apostrophe]: https://www.unicode.org/versions/Unicode16.0.0/core-spec/chapter-6/#G30602
[punctilio]: https://github.com/alexander-turner/punctilio

## Fix

Add U+02BB and U+02BC to the existing quote-folding switch in
`FoldQuoteMarkOrSoftHyphen` so they map to ASCII `'`, just like U+2018, U+2019,
and U+05F3 already do.

### Files changed

| File | Change |
|------|--------|
| `third_party/blink/renderer/platform/wtf/text/character_names.h` | Add `kModifierLetterTurnedComma = 0x02BB` and `kModifierLetterApostrophe = 0x02BC` constants |
| `third_party/blink/renderer/platform/text/unicode_utilities.cc` | Add `case` entries for both to the folding functions |
| `third_party/blink/renderer/platform/text/unicode_utilities_test.cc` | Add U+02BB and U+02BC to `FoldQuoteMarkOrSoftHyphenTest` |

## How to submit

Chromium uses **Gerrit**, not GitHub PRs. To submit this patch:

1. Follow the [Chromium contributor guide](https://chromium.googlesource.com/chromium/src/+/main/docs/contributing.md)
2. Set up a local Chromium checkout (`fetch chromium`)
3. Create a new branch: `git new-branch fold-modifier-letter-apostrophes`
4. Apply the changes described in `fold-modifier-letter-apostrophe.patch`
5. Run the relevant tests:
   ```
   autoninja -C out/Default blink_platform_unittests
   out/Default/blink_platform_unittests --gtest_filter="*FoldQuoteMarkOrSoftHyphen*"
   ```
6. Upload: `git cl upload`
7. File a companion bug at https://issues.chromium.org if desired

## Rationale

The existing folding table already treats several non-ASCII quote-like
characters as equivalent to ASCII quotes for search purposes:

| Codepoint | Name | Folds to |
|-----------|------|----------|
| U+05F3 | HEBREW PUNCTUATION GERESH | `'` |
| U+05F4 | HEBREW PUNCTUATION GERSHAYIM | `"` |
| U+2018 | LEFT SINGLE QUOTATION MARK | `'` |
| U+2019 | RIGHT SINGLE QUOTATION MARK | `'` |
| U+201C | LEFT DOUBLE QUOTATION MARK | `"` |
| U+201D | RIGHT DOUBLE QUOTATION MARK | `"` |
| U+00AD | SOFT HYPHEN | (ignored) |
| **U+02BB** | **MODIFIER LETTER TURNED COMMA** | **`'`** (proposed) |
| **U+02BC** | **MODIFIER LETTER APOSTROPHE** | **`'`** (proposed) |

Adding U+02BB and U+02BC is consistent with the existing approach and improves
find-in-page for any page that uses these characters.
