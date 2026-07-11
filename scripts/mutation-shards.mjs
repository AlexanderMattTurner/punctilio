/**
 * Partition the mutated source files into balanced shards for parallel CI
 * runners, auto-rebalanced from the previous run's measured cost.
 *
 * Stryker has no shard-index flag, but it DOES support a per-file mutation range
 * (`--mutate path:startLine-endLine`), so a file heavier than a fair share is
 * split into contiguous line-range units that pack onto different shards. The
 * busiest shard is therefore bounded by total_weight / shardCount, not by the
 * single largest file.
 *
 * Weight per file is read from config/mutation-weights.json — a committed map of
 * measured test executions per source file (the sum of Stryker's testsCompleted
 * over that file's mutants, the dominant driver of a shard's wall time),
 * refreshed on every push to main by refresh-mutation-weights.yml. Because a
 * mutant's cost is the covering tests it runs, test executions predict wall time
 * far better than line count and rebalance automatically as tests change.
 *
 * The shard count autoscales so no shard exceeds SHARD_BUDGET test executions —
 * a single knob calibrated so a shard runs in roughly the wall-time target on
 * ubuntu-latest. As the suite grows, shards get MORE NUMEROUS, not longer.
 *
 * Emits a GitHub Actions matrix `include` array on stdout:
 *   [{ "index": 0, "mutate": "a.ts,b.ts:1-200" }, ...]
 */
import { readdirSync, readFileSync } from "node:fs"
import { dirname, join, relative } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")
const WEIGHTS_FILE = join(REPO_ROOT, "config", "mutation-weights.json")
const STRYKER_CONFIG = join(REPO_ROOT, "stryker.config.json")

// Directories never worth walking when resolving the source glob.
const PRUNE_DIRS = new Set(["node_modules", "dist", ".git", ".stryker-tmp"])

/**
 * Compile a minimal file glob (`**`, `*`, literal segments) to an anchored
 * RegExp over POSIX paths. `**` spans path separators; `*` stops at one.
 */
export function globToRegExp(glob) {
  let out = "^"
  for (let i = 0; i < glob.length; i++) {
    const ch = glob[i]
    if (ch === "*") {
      if (glob[i + 1] === "*") {
        out += ".*"
        i++
        // Swallow the separator after `**/` so it also matches zero segments.
        if (glob[i + 1] === "/") i++
      } else {
        out += "[^/]*"
      }
    } else if (/[.+?^${}()|[\]\\]/.test(ch)) {
      out += `\\${ch}`
    } else {
      out += ch
    }
  }
  return new RegExp(`${out}$`)
}

function walk(dir, root, out) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (PRUNE_DIRS.has(entry.name)) continue
      walk(join(dir, entry.name), root, out)
    } else if (entry.isFile()) {
      out.push(relative(root, join(dir, entry.name)).split("\\").join("/"))
    }
  }
}

/**
 * Resolve Stryker's `mutate` globs to the concrete source files, so the shard
 * plan can never drift from what Stryker actually mutates.
 */
export function listSourceFiles(mutatePatterns, root = REPO_ROOT) {
  const includes = []
  const excludes = []
  for (const pattern of mutatePatterns) {
    if (pattern.startsWith("!")) excludes.push(globToRegExp(pattern.slice(1)))
    else includes.push(globToRegExp(pattern))
  }
  const all = []
  walk(root, root, all)
  return all
    .filter(
      (file) =>
        includes.some((re) => re.test(file)) &&
        !excludes.some((re) => re.test(file)),
    )
    .sort()
}

function lineCount(file, root = REPO_ROOT) {
  return readFileSync(join(root, file), "utf8").split("\n").length
}

/**
 * Attach a weight (measured test executions) and line count to each file.
 *
 * A file absent from the weights map (a freshly added source file, untimed
 * until the next post-merge refresh) is weighted at the larger of the known
 * files' p90 and its own line count times the known median executions-per-line —
 * so a big new file is not under-weighted onto one shard. Over-weighting only
 * under-fills a shard, so the conservative bias is the safe direction. With no
 * map at all (a fresh clone), weight falls back to raw line count, which still
 * packs correctly, just not cost-balanced.
 */
export function weighFiles(files, weights, root = REPO_ROOT) {
  const lines = new Map(files.map((f) => [f, lineCount(f, root)]))
  const known = files
    .map((f) => weights[f])
    .filter((w) => typeof w === "number" && w > 0)
    .sort((a, b) => a - b)

  const p90 = known.length
    ? known[Math.min(known.length - 1, Math.floor(known.length * 0.9))]
    : 0
  const perLine = known.length
    ? median(files.filter((f) => weights[f] > 0).map((f) => weights[f] / lines.get(f)))
    : 0

  return files.map((file) => {
    const measured = weights[file]
    const weight =
      typeof measured === "number" && measured > 0
        ? measured
        : known.length
          ? Math.max(p90, lines.get(file) * perLine)
          : lines.get(file)
    return { file, weight, lines: lines.get(file) }
  })
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/**
 * Break files whose weight exceeds `maxUnitWeight` into contiguous line-range
 * units (Stryker `path:startLine-endLine`, 1-indexed inclusive) so no unit
 * exceeds the cap, unless a single line already does (one line is the finest
 * grain Stryker's range flag can address); lighter files stay whole. The ranges
 * tile 1..lines with no gap or overlap, so every mutant falls in exactly one
 * unit. Weight is split proportionally to lines, the only per-line signal the
 * range flag exposes.
 */
export function splitIntoUnits(weighed, maxUnitWeight) {
  if (maxUnitWeight <= 0)
    throw new Error(`maxUnitWeight must be > 0, got ${maxUnitWeight}`)
  const units = []
  for (const { file, weight, lines } of weighed) {
    if (weight <= maxUnitWeight || lines <= 1) {
      units.push({ mutate: file, weight })
      continue
    }
    const perLine = weight / lines
    const chunkLines = Math.max(1, Math.floor(maxUnitWeight / perLine))
    for (let start = 1; start <= lines; start += chunkLines) {
      const end = Math.min(start + chunkLines - 1, lines)
      units.push({ mutate: `${file}:${start}-${end}`, weight: (end - start + 1) * perLine })
    }
  }
  return units
}

/** Pack weighted units into at most `shardCount` balanced shards (LPT greedy). */
export function planShards(units, shardCount) {
  if (units.length === 0) throw new Error("no units to shard")
  if (!Number.isInteger(shardCount) || shardCount < 1)
    throw new Error(`shardCount must be an integer >= 1, got ${shardCount}`)

  const binCount = Math.min(shardCount, units.length)
  const bins = Array.from({ length: binCount }, (_unused, index) => ({
    index,
    load: 0,
    specs: [],
  }))

  // Heaviest first, each into the currently lightest bin; ties resolve to the
  // lowest index, so the result is deterministic.
  const sorted = [...units].sort((left, right) => right.weight - left.weight)
  for (const { mutate, weight } of sorted) {
    const lightest = bins.reduce((best, bin) => (bin.load < best.load ? bin : best))
    lightest.specs.push(mutate)
    lightest.load += weight
  }
  return bins.map((bin) => ({ index: bin.index, mutate: bin.specs.join(",") }))
}

/**
 * Plan an autoscaled fan-out: pick the shard count so no shard exceeds
 * `budget` test executions, then split any file heavier than a fair share and
 * pack. Returns the matrix `include` array.
 */
export function planAutoscaled(weighed, budget, maxShards) {
  if (weighed.length === 0) throw new Error("no files to shard")
  if (budget <= 0) throw new Error(`budget must be > 0, got ${budget}`)
  if (!Number.isInteger(maxShards) || maxShards < 1)
    throw new Error(`maxShards must be an integer >= 1, got ${maxShards}`)

  const total = weighed.reduce((sum, { weight }) => sum + weight, 0)
  const shardCount = Math.max(1, Math.min(maxShards, Math.ceil(total / budget)))
  const fairShare = Math.ceil(total / shardCount)
  return planShards(splitIntoUnits(weighed, fairShare), shardCount)
}

export function loadWeights(path = WEIGHTS_FILE) {
  try {
    return JSON.parse(readFileSync(path, "utf8"))
  } catch (error) {
    if (error.code === "ENOENT") return {}
    throw error
  }
}

/**
 * The budget to plan with. With a measured map, use the execution-calibrated
 * `budget`. Without one, the fallback weights are line counts whose scale
 * doesn't match that budget, so ignore it and pick the budget that fills all
 * `maxShards` — cold runs still get full parallelism (each shard ~= total wall /
 * maxShards) until the first refresh commits real weights.
 */
export function effectiveBudget(weighed, hasMap, budget, maxShards) {
  if (hasMap) return budget
  const total = weighed.reduce((sum, { weight }) => sum + weight, 0)
  return Math.max(1, Math.ceil(total / maxShards))
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  // Max test executions per shard, calibrated so a shard runs within the
  // ~10-15 minute wall-time target on ubuntu-latest (dry-run/setup overhead plus
  // the shard's mutation work). MAX_SHARDS caps the fan-out at GitHub's practical
  // concurrency; for this static-mutant-heavy suite the cap binds, so the plan is
  // ~MAX_SHARDS shards balanced by measured weight. Tune if shard wall times drift.
  const budget = parseInt(process.env.SHARD_BUDGET ?? "25000", 10)
  const maxShards = parseInt(process.env.MAX_SHARDS ?? "20", 10)

  const config = JSON.parse(readFileSync(STRYKER_CONFIG, "utf8"))
  const files = listSourceFiles(config.mutate)
  const weights = loadWeights()
  const weighed = weighFiles(files, weights)
  const hasMap = Object.keys(weights).length > 0
  const shards = planAutoscaled(
    weighed,
    effectiveBudget(weighed, hasMap, budget, maxShards),
    maxShards,
  )
  process.stdout.write(JSON.stringify(shards))
}
