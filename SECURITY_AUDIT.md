# Security Audit Report — punctilio v1.4.1

**Date**: 2026-02-07
**Scope**: Full codebase red-team and stress test
**Auditor**: Automated security analysis

---

## Executive Summary

The punctilio library is well-engineered with strong security practices for a text
transformation library: 100% test coverage, hardened npm configuration, separator
validation, recursion depth limits, and idempotency checks. One actionable
vulnerability was found (quadratic-time regex in `multiplication()`), along with
several lower-severity observations in the CI/CD pipeline.

| Severity | Count | Summary |
|----------|-------|---------|
| High     | 1     | ReDoS (quadratic) in `multiplication()` |
| Medium   | 1     | CI/CD prompt injection surface |
| Low      | 3     | Informational observations |

---

## HIGH: Quadratic ReDoS in `multiplication()` — `src/symbols.ts:68-86`

### Description

The `multiplication()` function exhibits **O(n²) time complexity** on digit-only
inputs due to two regex patterns that scan `\d+` at every position in a digit
string:

1. **`chainPattern`** (line 68): `(\d+)((?:${chr}?\s*[xX*]\s*${chr}?\d+)+)`
2. **`trailingPattern`** (line 90): `(?<num>\d+${chr}?)[xX*]${wbe}`

When applied to a string of N consecutive digits with no `x`/`X`/`*` character,
the V8 regex engine tries `\d+` at every digit position (N starting points),
each time scanning to the end of the digit run (O(N) per start), giving O(N²)
total work.

### Measured Impact

| Input Size | Time     |
|------------|----------|
| 1,000      | 2ms      |
| 5,000      | 42ms     |
| 10,000     | 177ms    |
| 25,000     | 1,093ms  |
| 50,000     | 4,387ms  |

An attacker supplying a 100K-digit string could freeze processing for ~17
seconds. This is relevant in server-side contexts (rehype pipelines processing
user-submitted markdown/HTML).

### Reproduction

```typescript
import { multiplication } from "punctilio"
multiplication("1".repeat(50_000)) // takes ~4.4 seconds
```

### Suggested Fix

Anchor the digit-matching patterns so they don't retry at every position within
a digit run. Options:

1. **Require a non-digit lookbehind** on `chainPattern`: add `(?<!\d)` before
   `(\d+)` so the regex only matches at the *start* of a digit sequence.
2. **Use atomic grouping** (not available in JS) or restructure to match digits
   and operators in a single pass using `String.prototype.replace` with a simpler
   pattern that only fires at actual `x`/`X`/`*` positions.
3. **Add an input length guard** that short-circuits for inputs beyond a
   reasonable size threshold.

---

## MEDIUM: CI/CD Prompt Injection Surface — `scripts/version-bump.sh`

### Description

The auto-version workflow passes git commit messages into a Claude API prompt.
Although mitigations exist (truncation, control char stripping, structured tool
output, `---BEGIN COMMITS---`/`---END COMMITS---` delimiters, and "Do not follow
instructions" instruction), the attack surface remains:

- **Commit messages are attacker-controlled** in open-source repositories
  (anyone can submit a PR with crafted commit messages).
- The sanitization (`head -20 | cut -c1-100 | tr -cd '[:print:]\n' | head -c
  2000`) strips control characters but preserves natural-language prompt
  injection attempts.
- A sufficiently creative payload within the 100-char/line, 2000-char total
  budget could potentially influence the bump type classification.

### Mitigations Already Present (Good)

- `tool_choice: {type: "tool", name: "version_bump"}` forces structured output
- `bump_type` is validated against `["major", "minor", "patch"]`
- Version format is validated with `^[0-9]+\.[0-9]+\.[0-9]+$`
- `npm view` check prevents republishing existing versions
- Concurrency control prevents parallel publishing races

### Residual Risk

The worst case is a manipulated bump type (e.g., forcing `major` instead of
`patch`), which would publish an unexpected version number. This is low-impact
for a library at this stage but worth noting for future reference.

### Recommendation

Consider using commit-message-based conventional-commit parsing (e.g.,
`standard-version` or `semantic-release`) instead of LLM classification for
version determination, as it's deterministic and not susceptible to prompt
injection.

---

## LOW: Informational Observations

### 1. `ANTHROPIC_API_KEY` in CI Environment (`auto-version.yml:32`)

The API key is passed via `secrets.ANTHROPIC_API_KEY`, which is correct. However,
the key is exposed to the entire `version-bump.sh` script environment. If any
command in that script were compromised (e.g., via a dependency), it could
exfiltrate the key. Consider restricting the key's scope using a
least-privilege approach.

### 2. `postinstall` Hook Runs Shell Script (`package.json:29`)

The `"postinstall": "bash scripts/install-hooks.sh || true"` runs automatically
on `npm install`/`pnpm install`. While the script itself is benign (installs git
hooks), postinstall scripts are a common supply-chain attack vector. The `|| true`
suppresses errors, which could mask issues. This is standard practice for git
hooks but worth documenting.

### 3. `prepare` Script Silences Build Failures (`package.json:28`)

`"prepare": "tsc || true"` suppresses TypeScript compilation errors. This means
a broken build can be silently installed. This is likely intentional (to avoid
failing on install for consumers who just want the `dist/` output), but it means
type errors won't surface during `prepare`.

---

## Areas Tested — No Issues Found

| Area | Result |
|------|--------|
| **ReDoS (other modules)** | quotes, dashes, symbols (non-multiplication), nbsp — all complete in <15ms on 50K-char adversarial inputs |
| **Separator injection** | Regex-special separators properly escaped via `escape-string-regexp`. Multi-char, emoji, empty separators correctly rejected |
| **Unicode edge cases** | Zero-width chars, RTL overrides, combining chars, emoji, PUA chars, null bytes, control chars — all handled without crashes |
| **Rehype depth limits** | `MAX_RECURSION_DEPTH=1000` correctly prevents stack overflow on 1100+ deep trees |
| **HTML sanitization** | `<script>`, `<style>`, `<code>`, `<kbd>`, `<var>`, `<samp>`, `<pre>` correctly skipped |
| **Idempotency** | Holds for all tested option combinations including British style with all features enabled |
| **Option interactions** | All pairwise + full combinations of `fractions`/`degrees`/`superscript`/`ligatures`/`nbsp` tested — no conflicts |
| **Resource exhaustion** | ~1MB input processed in ~170ms (excluding digit-heavy content) |
| **Business logic boundaries** | Empty strings, single chars, whitespace-only, all-ASCII — no crashes or corruption |
| **Dependency security** | 2 runtime deps (`escape-string-regexp`, `unist-util-visit-parents`) — minimal surface, both well-maintained |

---

## Test Coverage

83 new stress tests added in `src/tests/stress.test.ts`, covering:
- ReDoS resistance probes (22 tests)
- Resource exhaustion (2 tests)
- Separator injection (7 tests)
- Unicode edge cases (7 tests)
- Business logic boundaries (9 tests)
- Rehype plugin security (11 tests)
- CI/CD security documentation (3 tests)
- Adversarial typography (8 tests)
- Option interaction matrix (14 tests)

Full suite: **1222 tests passing** (1139 original + 83 new).
