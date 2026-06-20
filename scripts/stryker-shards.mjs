/**
 * Computes a balanced Stryker shard matrix for CI, emitted as GitHub Actions
 * matrix JSON on stdout: `[{ "index": 0, "mutate": "src/a.ts,src/b.ts:1-200" }, …]`.
 *
 * Ranges are derived from the *current* file line counts on every run, so they
 * never drift as the source grows — there is nothing to hand-tune. Files larger
 * than a fair share (total lines / shard count) are split into contiguous
 * line-range units so the busiest shard is bounded by the fair share rather
 * than by the single largest file; units are then packed first-fit-decreasing
 * onto the lightest shard. Cold-run wall time is roughly the fair share's worth
 * of mutants; steady-state PR runs lean on Stryker's incremental cache, which
 * re-tests only the mutants whose source or covering tests changed.
 *
 * Shard count defaults to 6 and honors the `SHARD_COUNT` env var.
 *
 * Run from the repo root (reads `stryker.config.json`):
 *   SHARD_COUNT=8 node scripts/stryker-shards.mjs
 */

import { readFileSync } from "node:fs"

import { globSync } from "tinyglobby"

const DEFAULT_SHARD_COUNT = 6

/** Expands the Stryker `mutate` patterns (with `!`-prefixed ignores) to a sorted file list. */
function expandMutatePatterns(patterns) {
  const include = patterns.filter((p) => !p.startsWith("!"))
  const ignore = patterns.filter((p) => p.startsWith("!")).map((p) => p.slice(1))
  return globSync(include, { ignore }).sort()
}

/** `[{ file, lines }]` for each path, lines being the packing weight. */
function weighFiles(files) {
  return files.map((file) => ({
    file,
    lines: readFileSync(file, "utf8").split("\n").length,
  }))
}

/**
 * Splits any file heavier than `maxUnitWeight` into contiguous line-range units
 * (`file:start-end`) that together cover every line with no gaps or overlap;
 * lighter files stay whole.
 */
function splitIntoUnits(weighted, maxUnitWeight) {
  const units = []
  for (const { file, lines } of weighted) {
    if (lines <= maxUnitWeight) {
      units.push({ spec: file, weight: lines })
      continue
    }
    const parts = Math.ceil(lines / maxUnitWeight)
    const size = Math.ceil(lines / parts)
    for (let start = 1; start <= lines; start += size) {
      const end = Math.min(start + size - 1, lines)
      units.push({ spec: `${file}:${start}-${end}`, weight: end - start + 1 })
    }
  }
  return units
}

/** First-fit-decreasing bin packing: heaviest unit onto the lightest shard. */
function planShards(units, shardCount) {
  const shards = Array.from({ length: shardCount }, () => ({ weight: 0, specs: [] }))
  for (const unit of [...units].sort((a, b) => b.weight - a.weight)) {
    const lightest = shards.reduce((a, b) => (b.weight < a.weight ? b : a))
    lightest.specs.push(unit.spec)
    lightest.weight += unit.weight
  }
  return shards
}

export function planFileShards(patterns, shardCount = DEFAULT_SHARD_COUNT) {
  const weighted = weighFiles(expandMutatePatterns(patterns))
  if (weighted.length === 0) {
    throw new Error(`No files matched the mutate patterns: ${JSON.stringify(patterns)}`)
  }
  const total = weighted.reduce((sum, w) => sum + w.lines, 0)
  const fairShare = Math.ceil(total / shardCount)
  const units = splitIntoUnits(weighted, fairShare)
  return planShards(units, shardCount)
    .filter((shard) => shard.specs.length > 0)
    .map((shard, index) => ({ index, mutate: shard.specs.join(",") }))
}

function main() {
  const shardCount = Number(process.env.SHARD_COUNT) || DEFAULT_SHARD_COUNT
  const config = JSON.parse(readFileSync("stryker.config.json", "utf8"))
  process.stdout.write(JSON.stringify(planFileShards(config.mutate, shardCount)))
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}
