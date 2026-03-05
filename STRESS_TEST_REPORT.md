# Stress Test Report

**Date:** 2026-03-05
**Library:** punctilio (typography transformation library)
**Test Environment:** Node.js, Linux 4.4.0

---

## Executive Summary

punctilio is a well-architected, production-quality library with 100% test coverage, strong correctness (96.2% benchmark accuracy — far ahead of competitors), and solid security posture. The stress test uncovered **no critical bugs**, **no ReDoS vulnerabilities**, and **no crashes**. The recommendations below are improvements, not fixes.

---

## 1. Performance Benchmarks

### Throughput

| Test | Input Size | Time | Throughput |
|------|-----------|------|-----------|
| Large mixed input | 450K chars | 250ms | ~1.7M chars/sec |
| Rehype (1000 `<p>` elements) | ~45K chars | 147ms | ~306K chars/sec |
| Small repeated transforms | 16 chars × 1000 | 107ms | 0.107ms/call |
| Repeated ellipsis | 30K chars | 6ms | ~5M chars/sec |
| Repeated dashes | 60K chars | 17ms | ~3.5M chars/sec |
| Repeated contractions | 75K chars | 40ms | ~1.9M chars/sec |
| Deep HTML nesting (50 levels) | ~2K chars | 5ms | — |

**Verdict:** Performance is adequate for document-processing workloads. The idempotency check doubles the cost of `transform()`, but at 0.1ms per call the absolute overhead is negligible — no reason to disable it.

### Comparison to Competitors

| Library | Accuracy | Speed (ops/sec) |
|---------|---------|-----------------|
| **punctilio** | **152/157 (96.8%)** | 4,174 |
| tipograph | 91/157 (58.0%) | 109,910 |
| smartquotes | 72/157 (45.9%) | 218,795 |
| smartypants | 68/157 (43.3%) | 96,116 |

punctilio trades ~25× speed for ~2.25× correctness. This is a reasonable tradeoff for a typography library — correctness matters far more than raw speed, and 0.1ms per call is already imperceptible.

---

## 2. Security & Robustness

### ReDoS Resistance

All tested pathological inputs completed in under 50ms:

| Pattern | Input Size | Time |
|---------|-----------|------|
| Repeated dots (`...` × 10K) | 30K | 6ms |
| Repeated dashes | 60K | 17ms |
| Repeated single quotes | 10K | 10ms |
| 100K single-character word | 100K | fast |

The quote regex in `quotes.ts:66-68` has an explicit 1000-char lookahead limit (`{0,1000}`) to prevent catastrophic backtracking — good defensive practice.

### Edge Cases (all passed)

- Empty string, whitespace-only, newlines, tabs
- CJK, Arabic, Cyrillic, emoji mixed with ASCII
- Single quote/double quote in isolation
- Already-converted Unicode (smart quotes, em-dashes, ellipsis, ×)
- Mixed converted/unconverted text
- Null bytes in input
- Regex-special characters in input
- 200 consecutive quote characters

### Separator Validation

The rehype/remark plugins correctly validate separator absence via `assertSeparatorAbsent`. The plain `transform()` API correctly uses `assertSeparatorCountPreserved` as a corruption guard. The MAX_RECURSION_DEPTH (1000) in rehype.ts protects against stack overflow from malicious HTML.

### Memory

10K repeated transforms grew heap by ~1.2MB — no evidence of memory leaks. The regex cache (capped at 1000 entries with FIFO eviction) prevents unbounded growth.

---

## 3. Benchmark Failures (5/157)

### 3a. Em dashes between curly quotes (1 failure)

**Input:** `"Hello"--"World"` (curly quotes already present)
**Expected:** `"Hello"—"World"`
**Got:** `"Hello"—"World"` (different quote direction)

This is an edge case where the input contains pre-existing curly quotes. The quote engine re-processes them and changes their direction. Low priority — real-world text rarely has curly quotes AND double-hyphens together.

### 3b. Leading apostrophe + prime ambiguity (1 failure)

**Input:** `'Twas a 5' board`
**Expected:** `'Twas a 5′ board`
**Got:** `'Twas a 5' board` (5' not converted to prime)

The leading `'Twas` consumes the opening quote budget, causing the prime-mark balance tracker to treat `5'` as a closing quote rather than a prime. This is a genuine ambiguity — the same character means different things in the same string. All competing libraries also fail this case.

### 3c. German quotes (2 failures) & French quotes (1 failure)

Not supported — punctilio currently implements American and British styles only. Adding `"german"` and `"french"` locale options would address this.

---

## 4. Suggested Improvements

### Done — Regex caching in quotes.ts, dashes.ts, and nbsp.ts

Converted all `new RegExp(...)` to `cachedRegExp()` across all transform modules. Repeated calls with the same separator now reuse pre-compiled regexes.

### Done — Centralized separator escaping

Added `getEscapedSeparator(options)` to `constants.ts`, replacing ~15 instances of the `options.separator ? escapeStringRegexp(options.separator) : ESCAPED_DEFAULT_SEPARATOR` pattern across `symbols.ts`, `dashes.ts`, and `nbsp.ts`.

### P1 — Feature: German and French locale support

Adding `punctuationStyle: "german"` (low-9 quotes: „...") and `punctuationStyle: "french"` (guillemets: «...») would address 3 of the 5 remaining benchmark failures and expand the library's audience. See `prompts/add-locale-support.md` for detailed implementation plan.

**Files affected:** `src/quotes.ts`, `src/index.ts`, `src/constants.ts`

### P2 — Bug: Pre-existing curly quotes get re-processed

When input already contains curly quotes with `--` between them (e.g., `\u201CHello\u201D--\u201CWorld\u201D`), the dash conversion works but the quote engine re-processes the curly quotes and changes their direction. See `prompts/fix-curly-quoted-dashes.md` for detailed implementation plan.

**Files affected:** `src/quotes.ts`

### P3 — Testing: Add explicit ReDoS regression tests

While no ReDoS issues were found, adding explicit regression tests with pathological inputs (long repeated patterns, nested quantifiers) would guard against future regressions as regex patterns evolve.

**Files affected:** `src/tests/index.test.ts` (new test cases)

### P4 — Feature: Streaming/chunked API

For very large documents (multi-MB), a streaming API that processes paragraph-by-paragraph would reduce peak memory usage. Currently the entire string must be in memory. Low priority since 450K chars only takes 250ms.

---

## 5. Overall Assessment

| Category | Rating | Notes |
|----------|--------|-------|
| **Correctness** | Excellent | 96.8% benchmark accuracy, 100% test coverage, idempotency guarantees |
| **Security** | Excellent | No ReDoS, recursion depth limits, separator validation, .npmrc hardening |
| **Performance** | Good | Adequate for document processing; 25× slower than simpler libs but 2× more correct |
| **Code Quality** | Excellent | Clean separation of concerns, descriptive naming, minimal dependencies |
| **API Design** | Excellent | Sensible defaults, progressive disclosure of options, unified ecosystem integration |
| **Edge Case Handling** | Excellent | Handles Unicode, empty inputs, already-converted text, regex-special chars |

**Bottom line:** This is a mature, well-tested library. The main areas for improvement are performance optimization (regex caching) and expanded locale support.
