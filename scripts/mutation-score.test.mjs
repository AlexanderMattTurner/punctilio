import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  aggregateMetrics,
  assertScoreMeetsThreshold,
  readBreakThreshold,
} from "./mutation-score.mjs";

const SCRIPT = join(
  dirname(fileURLToPath(import.meta.url)),
  "mutation-score.mjs",
);
const REPO_ROOT = join(dirname(SCRIPT), "..");

const location = { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } };

/** Builds a Stryker report where each file has the given mutant statuses. */
const reportOf = (statusesByFile) => ({
  schemaVersion: "1",
  thresholds: { high: 80, low: 60 },
  files: Object.fromEntries(
    Object.entries(statusesByFile).map(([file, statuses]) => [
      file,
      {
        language: "typescript",
        source: "x",
        mutants: statuses.map((status, id) => ({
          id: String(id),
          mutatorName: "m",
          location,
          status,
        })),
      },
    ]),
  ),
});

const repeat = (status, count) => Array(count).fill(status);

// Shard one scores 50% alone, shard two 100%; together 8 of 10 are detected.
const weakShard = reportOf({
  "src/a.ts": [...repeat("Killed", 2), ...repeat("Survived", 2)],
});
const strongShard = reportOf({
  "src/b.ts": repeat("Killed", 4),
  "src/c.ts": ["Timeout", "Timeout"],
});

for (const { name, reports, expected } of [
  {
    name: "pools mutants across shards instead of averaging shard scores",
    reports: [weakShard, strongShard],
    expected: { killed: 6, timeout: 2, survived: 2, score: 80 },
  },
  {
    name: "counts NoCoverage as undetected and ignores compile errors",
    reports: [
      reportOf({
        "src/a.ts": ["Killed", "NoCoverage", "CompileError", "Ignored"],
      }),
    ],
    expected: { killed: 1, timeout: 0, survived: 0, score: 50 },
  },
  {
    name: "sums a file split by mutation range across shards",
    reports: [
      reportOf({ "src/a.ts": ["Killed", "Survived"] }),
      reportOf({ "src/a.ts": ["Killed", "Killed"] }),
    ],
    expected: { killed: 3, timeout: 0, survived: 1, score: 75 },
  },
]) {
  test(`aggregateMetrics ${name}`, () => {
    const metrics = aggregateMetrics(reports);
    assert.equal(metrics.killed, expected.killed);
    assert.equal(metrics.timeout, expected.timeout);
    assert.equal(metrics.survived, expected.survived);
    assert.equal(metrics.mutationScore, expected.score);
  });
}

test("aggregateMetrics rejects an empty report list", () => {
  assert.throws(() => aggregateMetrics([]), /no shard reports/);
});

for (const { score, threshold, error } of [
  { score: 60, threshold: 60, error: null },
  {
    score: 59.99,
    threshold: 60,
    error: /59\.99 is under the breaking threshold 60/,
  },
  { score: 99, threshold: 60, error: null },
  { score: NaN, threshold: 60, error: /no valid mutants/ },
]) {
  test(`assertScoreMeetsThreshold score ${score} vs ${threshold}`, () => {
    const check = () =>
      assertScoreMeetsThreshold({ mutationScore: score }, threshold);
    if (error) assert.throws(check, error);
    else assert.doesNotThrow(check);
  });
}

for (const { thresholds, error } of [
  { thresholds: { break: 60 }, error: null },
  { thresholds: { break: null }, error: /numeric thresholds\.break/ },
  { thresholds: {}, error: /numeric thresholds\.break/ },
  { thresholds: undefined, error: /numeric thresholds\.break/ },
]) {
  test(`readBreakThreshold ${JSON.stringify(thresholds)}`, () => {
    const read = () => readBreakThreshold({ thresholds });
    if (error) assert.throws(read, error);
    else assert.equal(read(), 60);
  });
}

test("shard config differs from the base config only by disabling the break", async () => {
  const base = JSON.parse(
    readFileSync(join(REPO_ROOT, "stryker.config.json"), "utf8"),
  );
  const { default: shard } = await import(
    pathToFileURL(join(REPO_ROOT, "stryker.shard.config.mjs")).href
  );
  assert.deepEqual(shard, {
    ...base,
    thresholds: { ...base.thresholds, break: null },
  });
});

test("CLI exit code follows the aggregate score and the expected shard count", () => {
  const dir = mkdtempSync(join(tmpdir(), "mutation-score-"));
  try {
    const write = (name, contents) => {
      const path = join(dir, name);
      writeFileSync(path, JSON.stringify(contents));
      return path;
    };
    const weak = write("weak.json", weakShard);
    const strong = write("strong.json", strongShard);
    const lenient = write("lenient.json", { thresholds: { break: 75 } });
    const strict = write("strict.json", { thresholds: { break: 85 } });
    const run = (...args) =>
      spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8" });

    // The weak shard alone scores 50 (under 75) yet the pooled score of 80 passes.
    assert.equal(
      run(weak, strong, "--config", lenient, "--expect-shards", "2").status,
      0,
    );
    const weakAlone = run(weak, "--config", lenient);
    assert.notEqual(weakAlone.status, 0);
    assert.match(weakAlone.stderr, /50\.00 is under the breaking threshold 75/);

    const underThreshold = run(weak, strong, "--config", strict);
    assert.notEqual(underThreshold.status, 0);
    assert.match(
      underThreshold.stderr,
      /80\.00 is under the breaking threshold 85/,
    );

    const missingShard = run(weak, "--config", lenient, "--expect-shards", "2");
    assert.notEqual(missingShard.status, 0);
    assert.match(missingShard.stderr, /expected 2 shard reports but found 1/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
