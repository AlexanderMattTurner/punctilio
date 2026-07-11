import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  globToRegExp,
  listSourceFiles,
  planAutoscaled,
  planShards,
  splitIntoUnits,
  weighFiles,
} from "./mutation-shards.mjs";
import { serialize, weightsFromReport } from "./mutation-weights.mjs";

const shardFiles = (shard) => shard.mutate.split(",");

test("globToRegExp: ** spans directories, * stops at a separator", () => {
  const deep = globToRegExp("src/**/*.ts");
  assert.ok(deep.test("src/cli.ts"));
  assert.ok(deep.test("src/tests/a/b.ts"));
  assert.ok(!deep.test("src/cli.js"));

  const shallow = globToRegExp("src/*.ts");
  assert.ok(shallow.test("src/cli.ts"));
  assert.ok(!shallow.test("src/tests/cli.ts"), "single * must not cross a slash");
});

test("listSourceFiles resolves the stryker globs to real, sorted source files", () => {
  const files = listSourceFiles(["src/**/*.ts", "!src/tests/**"]);
  assert.ok(files.includes("src/cli.ts"));
  assert.ok(files.includes("src/quote-classifier.ts"));
  assert.ok(
    !files.some((f) => f.startsWith("src/tests/")),
    "the test-exclude glob must drop src/tests",
  );
  assert.deepEqual([...files].sort(), files, "output must be sorted");
});

test("weighFiles uses the measured weight when present", () => {
  const [entry] = weighFiles(["src/cli.ts"], { "src/cli.ts": 1234 });
  assert.equal(entry.weight, 1234);
  assert.ok(entry.lines > 0);
});

test("weighFiles over-weights an untimed file to the p90 of known weights", () => {
  // dashes is timed cheaply; quote-classifier is untimed. Its weight must land
  // at least at the known p90, never below, so a new file never under-shards.
  const weights = { "src/dashes.ts": 10 };
  const [, untimed] = weighFiles(
    ["src/dashes.ts", "src/quote-classifier.ts"],
    weights,
  );
  assert.equal(untimed.file, "src/quote-classifier.ts");
  assert.ok(untimed.weight >= 10, "untimed weight must be >= known p90");
});

test("weighFiles falls back to line count when no weights are known", () => {
  const [entry] = weighFiles(["src/cli.ts"], {});
  assert.equal(entry.weight, entry.lines);
});

test("splitIntoUnits tiles a heavy file into gap-free, non-overlapping ranges", () => {
  const weighed = [{ file: "src/big.ts", weight: 100, lines: 100 }];
  const units = splitIntoUnits(weighed, 25);
  assert.ok(units.length >= 4, "a 4x-over-budget file splits into >= 4 units");
  assert.ok(units.every((u) => u.weight <= 25 + 1e-9), "no unit exceeds the cap");

  const ranges = units
    .map((u) => {
      const m = u.mutate.match(/:(?<start>\d+)-(?<end>\d+)$/);
      return [Number(m.groups.start), Number(m.groups.end)];
    })
    .sort((a, b) => a[0] - b[0]);
  assert.equal(ranges[0][0], 1, "ranges start at line 1");
  assert.equal(ranges.at(-1)[1], 100, "ranges end at the last line");
  for (let i = 1; i < ranges.length; i++)
    assert.equal(ranges[i][0], ranges[i - 1][1] + 1, "ranges are contiguous");
});

test("splitIntoUnits keeps a file at or under the cap whole", () => {
  const units = splitIntoUnits([{ file: "src/a.ts", weight: 20, lines: 40 }], 25);
  assert.deepEqual(units, [{ mutate: "src/a.ts", weight: 20 }]);
});

test("planShards balances load and is deterministic", () => {
  const units = [
    { mutate: "a", weight: 50 },
    { mutate: "b", weight: 40 },
    { mutate: "c", weight: 30 },
    { mutate: "d", weight: 20 },
  ];
  const shards = planShards(units, 2);
  assert.equal(shards.length, 2);
  // LPT: 50->s0, 40->s1, 30->s1(70), 20->s0(70): perfectly balanced.
  const loads = shards.map((s) =>
    shardFiles(s).reduce((sum, m) => sum + units.find((u) => u.mutate === m).weight, 0),
  );
  assert.equal(Math.max(...loads) - Math.min(...loads), 0, "packing is tight");
  assert.deepEqual(planShards(units, 2), shards, "same input -> same plan");
});

test("planShards never makes more bins than units", () => {
  const shards = planShards([{ mutate: "a", weight: 1 }], 8);
  assert.equal(shards.length, 1);
});

test("planAutoscaled grows the shard count with total weight, up to the cap", () => {
  const weighed = [
    { file: "a", weight: 100, lines: 100 },
    { file: "b", weight: 100, lines: 100 },
    { file: "c", weight: 100, lines: 100 },
  ];
  // 300 total / 100 budget -> 3 shards.
  assert.equal(planAutoscaled(weighed, 100, 12).length, 3);
  // Same total, tiny budget, capped at 2 shards.
  assert.equal(planAutoscaled(weighed, 10, 2).length, 2);
  // Generous budget -> a single shard.
  assert.equal(planAutoscaled(weighed, 1000, 12).length, 1);
});

test("planAutoscaled splits a dominant file across shards so no shard exceeds a fair share", () => {
  const weighed = [
    { file: "huge.ts", weight: 900, lines: 900 },
    { file: "small.ts", weight: 100, lines: 100 },
  ];
  const shards = planAutoscaled(weighed, 250, 12);
  // 1000/250 -> 4 shards; huge.ts must be range-split to fill them.
  assert.ok(shards.length >= 4);
  assert.ok(
    shards.some((s) => s.mutate.includes("huge.ts:")),
    "the dominant file must be range-split",
  );
});

test("planAutoscaled rejects a non-integer or non-positive shard cap", () => {
  const weighed = [{ file: "a", weight: 1, lines: 1 }];
  assert.throws(() => planAutoscaled(weighed, 1, 0));
  assert.throws(() => planAutoscaled(weighed, 1, 1.5));
  assert.throws(() => planAutoscaled(weighed, 0, 4));
});

test("weightsFromReport sums testsCompleted per file, floored at the mutant count", () => {
  const report = {
    files: {
      "src/a.ts": {
        mutants: [
          { testsCompleted: 5 },
          { testsCompleted: 3 },
        ],
      },
      // All NoCoverage: testsCompleted 0, so weight floors at the mutant count.
      "src/b.ts": { mutants: [{ testsCompleted: 0 }, { testsCompleted: 0 }] },
    },
  };
  const weights = weightsFromReport(report);
  assert.equal(weights["src/a.ts"], 8);
  assert.equal(weights["src/b.ts"], 2, "an all-NoCoverage file keeps a positive weight");
});

test("serialize writes sorted keys with a trailing newline", () => {
  const text = serialize({ b: 2, a: 1 });
  assert.equal(text, '{\n  "a": 1,\n  "b": 2\n}\n');
});
