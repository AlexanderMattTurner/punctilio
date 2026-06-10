/**
 * Generate a shields.io endpoint JSON badge from Jest's coverage summary.
 *
 * Reads coverage/coverage-summary.json (requires the "json-summary"
 * coverage reporter) and writes coverage-badge.json in the schema
 * documented at https://shields.io/badges/endpoint-badge.
 *
 * Run: node .github/scripts/coverage-badge.mjs
 */

import { readFileSync, writeFileSync } from "node:fs"
import process from "node:process"

const { total } = JSON.parse(readFileSync("coverage/coverage-summary.json", "utf8"))
const pct = Math.min(
  total.branches.pct,
  total.functions.pct,
  total.lines.pct,
  total.statements.pct,
)

// jest.config.js enforces 100% via coverageThreshold, so anything below
// that means the threshold was loosened — flag it loudly in red.
const color = pct >= 100 ? "brightgreen" : "red"

writeFileSync(
  "coverage-badge.json",
  JSON.stringify({ schemaVersion: 1, label: "coverage", message: `${pct}%`, color }),
)

process.stdout.write(`coverage-badge.json written: ${pct}% (${color})\n`)
