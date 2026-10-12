/**
 * Gate the aggregate mutation score across every shard of a sharded Stryker run.
 *
 *   node scripts/mutation-score.mjs <mutation.json...> [--expect-shards <n>] [--config <stryker.config.json>]
 *
 * Stryker applies `thresholds.break` per process, so a shard that happens to hold
 * a few weakly-tested files fails even when the project-wide score is healthy.
 * Shards run with the break disabled (stryker.shard.config.mjs); this script
 * merges their JSON reports and applies the same `thresholds.break` from
 * stryker.config.json to the combined score. The score comes from
 * mutation-testing-metrics, the package Stryker itself uses, so the formula is
 * Stryker's own.
 */
import { readFileSync } from "node:fs"
import { pathToFileURL } from "node:url"
import { parseArgs } from "node:util"

import {
  aggregateResultsByModule,
  calculateMutationTestMetrics,
} from "mutation-testing-metrics"

/** Reads `thresholds.break`, failing loudly when it is not a number. */
export function readBreakThreshold(config) {
  const threshold = config.thresholds?.break
  if (typeof threshold !== "number")
    throw new Error("stryker config needs a numeric thresholds.break")
  return threshold
}

/** Merges per-shard Stryker reports and returns the aggregate metrics. */
export function aggregateMetrics(reports) {
  if (reports.length === 0) throw new Error("no shard reports to aggregate")
  const reportsByShard = Object.fromEntries(
    reports.map((report, index) => [`shard-${index}`, report]),
  )
  return calculateMutationTestMetrics(aggregateResultsByModule(reportsByShard))
    .systemUnderTestMetrics.metrics
}

/** Throws unless the aggregate score meets the threshold. */
export function assertScoreMeetsThreshold(metrics, threshold) {
  const { mutationScore } = metrics
  if (Number.isNaN(mutationScore))
    throw new Error("no valid mutants across the shard reports")
  if (mutationScore < threshold)
    throw new Error(
      `Aggregate mutation score ${mutationScore.toFixed(2)} is under the breaking threshold ${threshold}`,
    )
}

function main(argv) {
  const { positionals: reportPaths, values: flags } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      "expect-shards": { type: "string" },
      config: { type: "string" },
    },
  })
  if (flags["expect-shards"] !== undefined) {
    const expected = Number(flags["expect-shards"])
    if (!Number.isInteger(expected) || expected < 1)
      throw new Error(`--expect-shards must be a positive integer`)
    if (reportPaths.length !== expected)
      throw new Error(
        `expected ${expected} shard reports but found ${reportPaths.length}; a shard produced no report`,
      )
  }
  const config = JSON.parse(readFileSync(flags.config ?? "stryker.config.json", "utf8"))
  const threshold = readBreakThreshold(config)
  const metrics = aggregateMetrics(
    reportPaths.map((path) => JSON.parse(readFileSync(path, "utf8"))),
  )
  console.log(
    `Aggregate over ${reportPaths.length} shards: score ${metrics.mutationScore.toFixed(2)} ` +
      `(killed ${metrics.killed}, timeout ${metrics.timeout}, survived ${metrics.survived}, ` +
      `no coverage ${metrics.noCoverage}); breaking threshold ${threshold}`,
  )
  assertScoreMeetsThreshold(metrics, threshold)
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2))
}
