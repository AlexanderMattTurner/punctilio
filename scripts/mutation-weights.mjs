/**
 * Extract and merge the per-file mutation weights that mutation-shards.mjs
 * balances shards from.
 *
 *   node scripts/mutation-weights.mjs report [--report <mutation.json>] [--out <path>]
 *   node scripts/mutation-weights.mjs merge <weights.json...> [--out <path>]
 *
 * `report` reads one shard's Stryker JSON report and emits a `{ file: weight }`
 * map, where weight is that file's total test executions — the sum of Stryker's
 * per-mutant `testsCompleted`, floored at the mutant count so an all-NoCoverage
 * file still carries a small positive weight rather than reading as untimed. Test
 * executions are the dominant driver of mutation wall time, so they predict a
 * shard's cost far better than line count, and — being a count of tests run, not
 * wall clock — they are runner-independent, so a map measured on any machine
 * balances CI.
 *
 * `merge` sums those maps across a refresh run's shards into the committed map. A
 * range-split file appears in several shards, each mutating part of it; summing
 * reconstructs the whole-file weight. Keys are written sorted so the committed
 * map has a stable, reviewable diff. refresh-mutation-weights.yml regenerates it
 * from a full sharded run on a schedule.
 */
import { readFileSync, writeFileSync } from "node:fs"
import { pathToFileURL } from "node:url"

/** Sum test executions per file from a parsed Stryker JSON report. */
export function weightsFromReport(report) {
  const weights = {}
  for (const [file, entry] of Object.entries(report.files ?? {})) {
    const mutants = entry.mutants ?? []
    const executions = mutants.reduce((sum, m) => sum + (m.testsCompleted ?? 0), 0)
    weights[file] = Math.max(executions, mutants.length)
  }
  return weights
}

/** Sum several per-file weight maps into one. */
export function mergeWeights(maps) {
  const merged = {}
  for (const map of maps) {
    for (const [file, weight] of Object.entries(map)) {
      merged[file] = (merged[file] ?? 0) + weight
    }
  }
  return merged
}

/** Serialize a weights map with sorted keys and a trailing newline. */
export function serialize(weights) {
  const sorted = Object.fromEntries(
    Object.keys(weights)
      .sort()
      .map((k) => [k, weights[k]]),
  )
  return `${JSON.stringify(sorted, null, 2)}\n`
}

function parseArgs(argv) {
  const positional = []
  const flags = {}
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) flags[argv[i].slice(2)] = argv[++i]
    else positional.push(argv[i])
  }
  return { positional, flags }
}

function emit(weights, out) {
  const text = serialize(weights)
  if (out) writeFileSync(out, text)
  else process.stdout.write(text)
}

function main(argv) {
  const [command, ...rest] = argv
  const { positional, flags } = parseArgs(rest)

  if (command === "report") {
    const report = JSON.parse(
      readFileSync(flags.report ?? "reports/mutation/mutation.json", "utf8"),
    )
    emit(weightsFromReport(report), flags.out)
    return
  }
  if (command === "merge") {
    if (positional.length === 0)
      throw new Error("merge needs at least one weights file")
    emit(
      mergeWeights(positional.map((p) => JSON.parse(readFileSync(p, "utf8")))),
      flags.out,
    )
    return
  }
  throw new Error(
    `unknown command ${JSON.stringify(command)}; use "report" or "merge"`,
  )
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2))
}
