/** @type {import('jest').Config} */
export default {
  preset: "ts-jest/presets/default-esm",
  testEnvironment: "node",
  extensionsToTreatAsEsm: [".ts"],
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        useESM: true,
      },
    ],
  },
  testMatch: ["**/*.test.ts"],
  // Stryker copies the project (tests included) into its sandbox directory.
  testPathIgnorePatterns: ["/node_modules/", "/\\.stryker-tmp/"],
  collectCoverage: true,
  // Measure every source file, not just those a test happens to import, so the
  // 100% threshold below can't be satisfied by leaving a new module untested and
  // unreferenced. Tests and type declarations are excluded from the denominator.
  collectCoverageFrom: ["src/**/*.ts", "!src/tests/**", "!src/**/*.d.ts"],
  // Jest defaults plus json-summary, which .github/scripts/coverage-badge.mjs
  // reads to publish the live coverage badge.
  coverageReporters: ["clover", "json", "json-summary", "lcov", "text"],
  coverageThreshold: {
    global: {
      branches: 100,
      functions: 100,
      lines: 100,
      statements: 100,
    },
  },
}
