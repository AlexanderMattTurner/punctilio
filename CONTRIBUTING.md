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
```

## Testing

Jest enforces **100% coverage** (branches, functions, lines, statements) via `coverageThreshold` in `jest.config.js`—CI fails below that, so new branches need tests. Parametrize tests for compactness; avoid duplicative cases. Transformations must be idempotent: `transform(transform(x)) === transform(x)`.

## Regex safety

This library is regex-heavy, so ReDoS prevention is taken seriously:

- `pnpm lint` runs `eslint-plugin-redos` and `eslint-plugin-regexp` to guard against unsafe patterns.
- The test suite uses [`recheck`](https://makenowjust-labs.github.io/recheck/) to statically verify regexes are free of catastrophic backtracking.

If your change adds or modifies a regex, expect both gates to weigh in.

## Changelog

`CHANGELOG.md` keeps an `## Unreleased` section at the top. Add a bullet there describing your change; on publish, `scripts/promote-changelog.ts` promotes that block into a dated version section. Don’t add dated sections yourself.

## CI

Pull requests run the test and lint workflows on Node 20, 22, and 24. GitHub Actions are SHA-pinned, and the lint workflow rejects unpinned `uses:` references.
