# Performance Test Flakiness — Research

## Problem

`src/tests/test-helpers.ts::assertLinearScaling` is the test we use to guard
against catastrophic regex backtracking. It measures wall-clock time at two
input sizes (4× and 8× of a base N), normalises against a known-linear
baseline, and asserts the ratio stays below 1.5×.

This is a custom design and it's flaky in CI: shared-runner CPU contention,
GC pauses, and per-Node-version JIT differences inflate the ratio even for
truly linear code. Recent example: `test (22)` failed on PR #175 while
`test (20)` and `test (24)` passed the same code.

The premise of the test is sound — we want to catch ReDoS / super-linear
regex behaviour. But the **mechanism** (wall-clock scaling) is the wrong
tool for the job, and the literature converged on better answers several
years ago.

## What the literature says

The class of bug we care about — super-linear regex behaviour from
ambiguous quantifiers — is detectable **statically**. You don't need to
run the regex to know whether it backtracks; you can analyse its NFA.
This means the check is deterministic and free from CI noise.

### Tier 1 — Static regex analysis (no runtime, no flakiness)

1. **`eslint-plugin-regexp`** with `regexp/no-super-linear-backtracking`
   and `regexp/no-super-linear-move` rules. Detects polynomial and
   exponential backtracking by NFA inspection. Simple to drop into our
   existing ESLint setup. Caveat: the authors are explicit that
   detection is "simplistic" and won't catch every case — false
   negatives are possible but false positives are rare.
   <https://ota-meshi.github.io/eslint-plugin-regexp/rules/no-super-linear-backtracking.html>
   <https://ota-meshi.github.io/eslint-plugin-regexp/rules/no-super-linear-move.html>

2. **`recheck`** (`@makenowjust-labs/recheck`). State-of-the-art ReDoS
   checker that combines NFA static analysis with attack-string fuzzing.
   Handles lookarounds and backreferences. Available as a CLI and as a
   library. More thorough than the ESLint rule, with correspondingly
   more setup.
   <https://makenowjust-labs.github.io/recheck/>

3. **`eslint-plugin-redos`** — ESLint wrapper around `recheck`. Best of
   both: deep analysis exposed through the linter we already run.
   <https://www.npmjs.com/package/eslint-plugin-redos>

4. **`redos-detector`** / **`eslint-plugin-redos-detector`** — alternative
   analyser by Tom Jenkinson, scores each pattern's vulnerability.
   <https://github.com/tjenkinson/redos-detector>

5. **`js-regex-security-scanner`** — Eric Cornelissen's scanner that
   wraps the ESLint plugin for CI-friendly reporting.
   <https://github.com/ericcornelissen/js-regex-security-scanner>

### Tier 2 — Absolute-timeout regression tests (runtime, but stable)

If we still want a runtime safety net (e.g. to catch
algorithmic regressions outside the regex layer, like an accidentally
quadratic JS loop), the standard pattern is **not** to compare scaling
ratios — it's to set a generous absolute budget:

```ts
it("transforms 100k pathological input under 2s", () => {
  const input = '"a"'.repeat(33_000)
  const start = performance.now()
  transform(input)
  expect(performance.now() - start).toBeLessThan(2_000)
})
```

Tradeoff: less precise (would miss a 1.5× → 2× regression) but the
threshold has so much headroom that CI noise can't trip it. This is the
common pattern in production JS codebases — set a budget that's an order
of magnitude above linear-case runtime and only fail on catastrophic
regressions.

For property-based coverage, `fast-check` can shrink failing inputs:

```ts
import fc from "fast-check"
test("transform terminates on arbitrary input", () =>
  fc.assert(
    fc.property(fc.string({ maxLength: 50_000 }), (s) => {
      const t0 = performance.now()
      transform(s)
      return performance.now() - t0 < 5_000
    }),
    { numRuns: 50 },
  ))
```

### Tier 3 — Pragmatic flake mitigations

If we keep the current scaling test, we can dampen its noise:

- `jest.retryTimes(3, { logErrorsBeforeRetry: true })` for the perf
  describe block. Bandaid, not a fix.
- Run perf tests on a single Node version in a dedicated job (not in the
  20/22/24 matrix). They don't test Node-version-specific behaviour.
- Skip in CI entirely (`it.skipIf(process.env.CI)`) and run them in a
  separate "benchmark" workflow on a self-hosted runner.

## Recommendation

1. **Add `eslint-plugin-regexp`** with `no-super-linear-backtracking` and
   `no-super-linear-move` enabled as errors. This is the smallest,
   highest-leverage change — the ESLint config already exists and the
   `lint` CI job already runs. It directly checks the property we care
   about, deterministically, in milliseconds.

2. **Replace `assertLinearScaling` with absolute-timeout tests.** Pick
   inputs that would take many seconds under quadratic behaviour and a
   threshold (e.g. 2s) that linear behaviour will comfortably hit even
   on a contended runner. Lose some precision, gain stability.

3. **Optionally, add `eslint-plugin-redos`** as a stronger second check
   if the simpler plugin proves too lossy. It wraps the `recheck`
   engine, which is published academic work (Sugiyama et al.) and is
   maintained — a higher-confidence analysis than the simpler NFA scan
   in `eslint-plugin-regexp`.

Together, (1) covers the bug class statically with zero flakiness, and
(2) covers algorithmic regressions outside the regex layer with enough
headroom that runner noise can't trip it. The custom scaling helper can
be deleted.

## What we shouldn't do

- Don't keep iterating on the wall-clock-ratio approach. It's
  fundamentally noise-bound; tightening trial counts and thresholds
  trades one flake mode for another.
- Don't pin everything to retries. Retries hide real regressions and
  inflate CI time.
