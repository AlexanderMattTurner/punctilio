/**
 * Extract the committed per-file mutation weights that mutation-shards.mjs
 * balances shards from.
 *
 *   node scripts/mutation-weights.mjs [--report <mutation.json>] [--out <path>]
 *
 * Reads a full Stryker JSON report and emits a `{ file: weight }` map, where
 * weight is that file's total test executions — the sum of Stryker's per-mutant
 * `testsCompleted`, floored at the mutant count so an all-NoCoverage file still
 * carries a small positive weight rather than reading as untimed. Test executions
 * are the dominant driver of mutation wall time, so they predict a shard's cost
 * far better than line count, and — being a count of tests run, not wall clock —
 * they are runner-independent, so a map measured on any machine balances CI.
 *
 * Keys are written sorted so the committed map has a stable, reviewable diff.
 * refresh-mutation-weights.yml regenerates it from a full run on a schedule.
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
  const flags = {}
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) flags[argv[i].slice(2)] = argv[++i]
    else throw new Error(`unexpected argument ${JSON.stringify(argv[i])}`)
  }
  return flags
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const flags = parseArgs(process.argv.slice(2))
  const reportPath = flags.report ?? "reports/mutation/mutation.json"
  const report = JSON.parse(readFileSync(reportPath, "utf8"))
  const text = serialize(weightsFromReport(report))
  if (flags.out) writeFileSync(flags.out, text)
  else process.stdout.write(text)
}
