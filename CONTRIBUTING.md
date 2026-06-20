# Contributing to `punctilio`

Thanks for your interest! This document covers the practical bits.

## Setup

You need Node.js 20+ and [pnpm](https://pnpm.io) (the version pinned in `package.json`’s `packageManager` field).

```bash
pnpm install
```

## Development commands

```bash
pnpm test        # Jest test suite
pnpm lint        # ESLint over src/
pnpm benchmark   # build, then run benchmark.mjs against competitor libraries
pnpm build       # tsc
pnpm mutation    # Stryker mutation testing (slow; CI runs it weekly)
```

## Testing

Jest enforces **100% coverage** (branches, functions, lines, statements) via `coverageThreshold` in `jest.config.js`—CI fails below that, so new branches need tests. Parametrize tests for compactness; avoid duplicative cases. Transformations must be idempotent: `transform(transform(x)) === transform(x)`.

### Property-based fuzzing

`src/tests/fuzz.test.ts` runs [fast-check](https://fast-check.dev/) properties on every test run: transform idempotence over arbitrary unicode and option combinations, multi-node `ProseView` semantics against a flat-string oracle, `definePass` template semantics against `String.replace`, and HTML/Markdown round-trips. Each run draws a fresh seed, so CI keeps exploring new inputs. A failure prints the seed and the shrunken counterexample; reproduce with `FUZZ_SEED=<seed> FUZZ_PATH=<path> pnpm test fuzz`, and soak locally with `FUZZ_RUNS=200000`. If the fuzzer finds a counterexample, fix the underlying gate (usually a later pipeline pass rewriting a character an earlier pass's rule keyed on) rather than special-casing the input.

### Mutation testing

`pnpm mutation` runs [Stryker](https://stryker-mutator.io/) over `src/` using the Jest suite (minus the regex-safety analysis gate and the randomized fuzz file — see `jest.stryker.config.js`). CI runs it on every pull request via `mutation.yml`, sharded across a matrix of size-balanced file groups with a per-shard incremental cache, so only mutants touched by your diff actually re-run; each shard publishes its HTML report as an artifact. Surviving mutants point at assertions worth strengthening; aim not to lower the score with new code.

## Regex safety

This library is regex-heavy, so ReDoS prevention is taken seriously:

- `pnpm lint` runs `eslint-plugin-redos` and `eslint-plugin-regexp` to guard against unsafe patterns.
- The test suite uses [`recheck`](https://makenowjust-labs.github.io/recheck/) to statically verify regexes are free of catastrophic backtracking.

If your change adds or modifies a regex, expect both gates to weigh in.

## Changelog

`CHANGELOG.md` keeps an `## Unreleased` section at the top. Add a bullet there describing your change; on publish, `scripts/promote-changelog.ts` promotes that block into a dated version section. Don’t add dated sections yourself.

## CI

Pull requests run the test and lint workflows on Node 20, 22, and 24, plus the sharded mutation-testing matrix. GitHub Actions are SHA-pinned, and the lint workflow rejects unpinned `uses:` references.
