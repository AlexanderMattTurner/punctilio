import baseConfig from "./jest.config.js"

// Jest config used only by Stryker (see stryker.config.json). Istanbul
// coverage is disabled because it slows every mutant run and the base
// config's 100% coverageThreshold would fail runs on Stryker-instrumented
// code. regex-safety.test.ts is excluded because it is a recheck ReDoS
// analysis gate with a 10-minute budget, not a behavioral test, so running
// it per-mutant gives no mutation-killing signal. fuzz.test.ts is excluded
// because its properties draw a fresh random seed every run: per-mutant they
// are slow and kill mutants nondeterministically, which poisons the
// incremental report.
/** @type {import('jest').Config} */
export default {
  ...baseConfig,
  collectCoverage: false,
  coverageThreshold: undefined,
  testPathIgnorePatterns: [
    "/node_modules/",
    "src/tests/fuzz.test.ts",
    "src/tests/regex-safety.test.ts",
  ],
}
