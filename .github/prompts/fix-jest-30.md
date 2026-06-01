# Unblock Jest 30 upgrade

Dependabot proposes bumping `jest` (and `@types/jest`) from 29.x to 30.x. The
bump installs cleanly but breaks the project's 100 % branch-coverage threshold:
when the suite runs under Jest 30 / `ts-jest` 29, three "false" branches stop
being counted as covered even though the underlying assertions still run.

## Reproduction

1. On a clean checkout: `pnpm install`.
2. Bump: `pnpm update jest@30 @types/jest@30`.
3. Run `pnpm test`.

Expected: coverage at 100 %. Actual: branches drop to ~99.43 % with these three
sites flagged:

- `src/html.ts:52` — false branch of `if (!processor)` (cache hit path)
- `src/rehype.ts:417` — false branch of `if (!transformed.has(elt))`
- `src/utils.ts:16` — false branch of `if (typeof globalThis.process?.stderr?.write === "function")`

All three are exercised by existing tests (jest 29 reports them as covered),
so the regression is in how Jest 30's coverage pipeline (babel-plugin-istanbul
via `@jest/transform` 30) instruments these conditionals when ts-jest emits
ESM with optional chaining.

## Remediation options

1. **Investigate ts-jest + Jest 30 coverage instrumentation.** Likely fix is
   to upgrade `babel-plugin-istanbul` / pin a specific `@jest/transform`
   version, or switch the coverage provider to `v8` in `jest.config.js`.
2. **Add direct tests for the missed branches.** Quick, but masks the real
   instrumentation regression and increases test surface.
3. **Accept reduced coverage threshold.** Discouraged — the 100 % bar exists
   on purpose.

Prefer option 1. Once green, drop the `jest` / `@types/jest` ignore entries
from `.github/dependabot.yml`.
