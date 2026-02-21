# Chromium Bug Report Draft

**File at:** https://issues.chromium.org/issues/new

---

## Title

Find-in-page does not match U+02BC MODIFIER LETTER APOSTROPHE when searching with ASCII apostrophe

## Component

Blink>Editing>FindInPage

## Description

### What steps will reproduce the problem?

1. Open a page containing text with U+02BC MODIFIER LETTER APOSTROPHE, for example:
   - Hawaiian text: `Hawaiʻi` (the ʻ is U+02BC)
   - Or any page using U+02BC as a typographic apostrophe: `donʼt` (with U+02BC)
2. Press Ctrl+F and search for `Hawai'i` or `don't` using a straight ASCII apostrophe (U+0027)
3. No match is found

### What is the expected result?

The search should find the text, because Chromium already folds other quote-like characters (U+2018 LEFT SINGLE QUOTATION MARK, U+2019 RIGHT SINGLE QUOTATION MARK, U+05F3 HEBREW PUNCTUATION GERESH) to ASCII equivalents in `FoldQuoteMarkOrSoftHyphen`. U+02BC should receive the same treatment.

### What happens instead?

No match. Users cannot find text containing U+02BC via Ctrl+F unless they somehow type the exact U+02BC character.

### Why this matters

U+02BC is the Unicode-recommended character for representing the apostrophe when it functions as a letter (Unicode Standard, Chapter 6, Section 6.2). It is used in:

- Hawaiian (ʻokina)
- Tongan
- Several African orthographies
- Typographic processing libraries that distinguish the apostrophe from the closing single quotation mark

### Proposed fix

Add `kModifierLetterApostrophe = 0x02BC` to `character_names.h` and a corresponding `case` to the `FoldQuoteMarkOrSoftHyphen` switch in `unicode_utilities.cc`, mapping it to ASCII `'` (U+0027).

The change is ~3 lines of production code plus a test update. A draft patch is available at:
https://github.com/alexander-turner/punctilio/tree/claude/codepoint-browser-find-6HecZ/chromium-patch

### Affected files

- `third_party/blink/renderer/platform/wtf/text/character_names.h`
- `third_party/blink/renderer/platform/text/unicode_utilities.cc`
- `third_party/blink/renderer/platform/text/unicode_utilities_test.cc`
