import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  mkdirSync,
  chmodSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, "prepare.sh");
const scratch = () => mkdtempSync(join(tmpdir(), "auto-resolve-"));

const git = (cwd, ...args) =>
  execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" });

// Build an origin repo whose `main` and `feature` branches both edit `file`, so
// merging main into feature conflicts on exactly that path. Returns a `work`
// clone checked out on feature (with `origin` pointing at the bare repo).
function fixtureConflictingOn(file) {
  const root = scratch();
  const origin = join(root, "origin.git");
  const work = join(root, "work");
  git(root, "init", "--bare", "-q", origin);
  git(root, "clone", "-q", origin, work);
  git(work, "config", "user.email", "t@t");
  git(work, "config", "user.name", "t");

  mkdirSync(dirname(join(work, file)), { recursive: true });
  writeFileSync(join(work, file), "base\n");
  git(work, "add", "-A");
  git(work, "commit", "-q", "-m", "base");
  git(work, "branch", "-M", "main");
  git(work, "push", "-q", "origin", "main");

  git(work, "checkout", "-q", "-b", "feature");
  writeFileSync(join(work, file), "feature side\n");
  git(work, "commit", "-q", "-am", "feature");
  git(work, "push", "-q", "origin", "feature");

  git(work, "checkout", "-q", "main");
  writeFileSync(join(work, file), "main side\n");
  git(work, "commit", "-q", "-am", "main change");
  git(work, "push", "-q", "origin", "main");

  git(work, "checkout", "-q", "feature");
  return work;
}

// A `work` clone of a fresh bare origin, with an identity configured and one
// committed file so later commits can delete a path without emptying the tree.
// Left on `main`, already pushed.
function newRepo() {
  const root = scratch();
  const origin = join(root, "origin.git");
  const work = join(root, "work");
  git(root, "init", "--bare", "-q", origin);
  git(root, "clone", "-q", origin, work);
  git(work, "config", "user.email", "t@t");
  git(work, "config", "user.name", "t");
  writeFileSync(join(work, "keep.txt"), "keep\n");
  git(work, "add", "-A");
  git(work, "commit", "-q", "-m", "base");
  git(work, "branch", "-M", "main");
  git(work, "push", "-q", "origin", "main");
  return work;
}

// Switch to `branch`, creating it off the current commit the first time (the
// fixtures below build `feature` from the base, then return to `main`).
const checkoutBranch = (work, branch) =>
  branch === "feature"
    ? git(work, "checkout", "-q", "-b", "feature")
    : git(work, "checkout", "-q", "main");

// Build a repo where `file` exists at the merge base, one side DELETES it and
// the other MODIFIES it — git's modify/delete, which it resolves with NO
// conflict markers, leaving the surviving side's bytes in the worktree.
// `deletedOn` picks which branch does the deleting.
function fixtureModifyDelete(file, deletedOn) {
  const work = newRepo();
  mkdirSync(dirname(join(work, file)), { recursive: true });
  writeFileSync(join(work, file), "base\n");
  git(work, "add", "-A");
  git(work, "commit", "-q", "-m", "add file");
  git(work, "push", "-q", "origin", "main");

  const act = (branch) => {
    if (branch === deletedOn) {
      git(work, "rm", "-q", file);
    } else {
      writeFileSync(join(work, file), `${branch} side\n`);
      git(work, "add", "--", file);
    }
    git(work, "commit", "-q", "-m", `${branch} change`);
  };

  git(work, "checkout", "-q", "-b", "feature");
  act("feature");
  git(work, "push", "-q", "origin", "feature");

  git(work, "checkout", "-q", "main");
  act("main");
  git(work, "push", "-q", "origin", "main");

  git(work, "checkout", "-q", "feature");
  return work;
}

// Run prepare.sh in `work` with a fake `gh` on PATH that records every
// invocation, so a test can assert prepare never talks to GitHub (warning about
// a protected path is the land step's job, on the comment it posts with the
// pushed resolution). Returns the parsed $GITHUB_OUTPUT, whether a merge is
// still in progress (MERGE_HEAD present), the recorded gh argv lines, and the
// run's own log.
// `mergiraf` controls the stubbed structural pre-pass:
//   "cannot-solve" (default) — exits 1 on every file, so every conflict falls
//                              through to the model exactly as it did before
//                              the pre-pass existed. This is the conservative
//                              default so the pre-existing cases keep asserting
//                              what they were written to assert.
//   "solves"                  — prints a marker-free result, so the file is
//                              staged and dropped from the model's list.
//   "absent"                  — no binary at all, to prove prepare refuses
//                              rather than silently skipping the pass.
//   "empty-success"           — exits 0 printing NOTHING, which is what the real
//                              binary does when it cannot generate a solution.
//                              The file must survive untouched.
// The stubs keep these unit tests hermetic; the real binary's behavior is
// pinned separately by install-mergiraf.sh's own CLI-contract probe.
function runPrepare(work, extraEnv = {}, { mergiraf = "cannot-solve" } = {}) {
  const outFile = join(work, ".gh-output");
  writeFileSync(outFile, "");
  const ghLog = join(work, ".gh-calls");
  writeFileSync(ghLog, "");
  const ghBin = join(work, ".fakebin");
  mkdirSync(ghBin, { recursive: true });
  const ghPath = join(ghBin, "gh");
  writeFileSync(
    ghPath,
    `#!/usr/bin/env bash\nprintf '%s\\n' "$*" >> "${ghLog}"\nexit 0\n`,
  );
  chmodSync(ghPath, 0o755);
  if (mergiraf !== "absent") {
    const mergirafPath = join(ghBin, "mergiraf");
    // "solves" emits the conflicted file with the marker lines stripped, which
    // is a marker-free result and so counts as a full solve.
    const bodies = {
      solves: `#!/usr/bin/env bash\nf="\${!#}"\ngrep -v -E '^(<<<<<<<|=======|>>>>>>>|\\|\\|\\|\\|\\|\\|\\|)' "$f"\nexit 0\n`,
      "empty-success": `#!/usr/bin/env bash\nexit 0\n`,
      "cannot-solve": `#!/usr/bin/env bash\nexit 1\n`,
    };
    const body = bodies[mergiraf] ?? bodies["cannot-solve"];
    writeFileSync(mergirafPath, body);
    chmodSync(mergirafPath, 0o755);
  }
  let error = null;
  let stdout = "";
  try {
    stdout = execFileSync("bash", [SCRIPT], {
      cwd: work,
      encoding: "utf8",
      env: {
        ...process.env,
        BASE_REF: "main",
        HEAD_REF: "feature",
        GITHUB_TOKEN: "x",
        GITHUB_OUTPUT: outFile,
        PATH: `${ghBin}:${process.env.PATH ?? ""}`,
        ...extraEnv,
      },
    });
  } catch (err) {
    error = err;
    stdout = String(err.stdout ?? "");
  }
  const outputs = Object.fromEntries(
    readFileSync(outFile, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const i = line.indexOf("=");
        return [line.slice(0, i), line.slice(i + 1)];
      }),
  );
  let merging = true;
  try {
    git(work, "rev-parse", "--verify", "-q", "MERGE_HEAD");
  } catch {
    merging = false;
  }
  const ghCalls = readFileSync(ghLog, "utf8").split("\n").filter(Boolean);
  const commented = ghCalls.some((c) => c.startsWith("pr comment"));
  return { outputs, merging, error, ghCalls, commented, stdout };
}

test("a conflict in a SAFE path is handed to the LLM with no protected-path warning", () => {
  const work = fixtureConflictingOn("docs/thing.md");
  const { outputs, merging, commented, stdout } = runPrepare(work);
  assert.equal(outputs.needs_llm, "true");
  assert.equal(outputs.needs_commit, "true");
  assert.equal(outputs.conflict_list, "docs/thing.md");
  assert.ok(!stdout.includes("protected path"));
  assert.equal(merging, true); // merge left mid-flight for Claude + the bundle step
  assert.equal(commented, false);
});

test("an ordinary marker conflict leaves modify_delete empty", () => {
  const { outputs } = runPrepare(fixtureConflictingOn("docs/thing.md"));
  assert.equal(outputs.conflict_list, "docs/thing.md");
  assert.equal(outputs.modify_delete, "");
});

for (const deletedOn of ["feature", "main"]) {
  test(`a modify/delete conflict (deleted on ${deletedOn}) is reported in modify_delete AND kept in conflict_list`, () => {
    const work = fixtureModifyDelete("docs/gone.md", deletedOn);
    const { outputs, merging, commented } = runPrepare(work);
    // Still the LLM's to resolve — the decision is keep-or-delete, not a merge.
    assert.equal(outputs.needs_llm, "true");
    assert.equal(outputs.needs_commit, "true");
    assert.equal(outputs.conflict_list, "docs/gone.md");
    assert.equal(outputs.modify_delete, "docs/gone.md");
    assert.equal(outputs.unresolvable ?? "", "");
    assert.equal(merging, true);
    assert.equal(commented, false);
  });
}

test("a delete/delete alongside a marker conflict leaves modify_delete empty", () => {
  // Both sides delete `gone.txt` (git merges that cleanly, so it is never
  // conflicted) while both edit `shared.txt`.
  const work = newRepo();
  writeFileSync(join(work, "gone.txt"), "gone\n");
  writeFileSync(join(work, "shared.txt"), "base\n");
  git(work, "add", "-A");
  git(work, "commit", "-q", "-m", "add files");
  git(work, "push", "-q", "origin", "main");
  for (const branch of ["feature", "main"]) {
    checkoutBranch(work, branch);
    git(work, "rm", "-q", "gone.txt");
    writeFileSync(join(work, "shared.txt"), `${branch} side\n`);
    git(work, "commit", "-q", "-am", `${branch} change`);
    git(work, "push", "-q", "origin", branch);
  }
  git(work, "checkout", "-q", "feature");

  const { outputs } = runPrepare(work);
  assert.equal(outputs.conflict_list, "shared.txt");
  assert.equal(outputs.modify_delete, "");
});

test("an add/add conflict leaves modify_delete empty", () => {
  // Neither side has a merge-base entry for `new.txt`, so there is no stage 1
  // — a marker conflict, not a modify/delete.
  const work = newRepo();
  for (const branch of ["feature", "main"]) {
    checkoutBranch(work, branch);
    writeFileSync(join(work, "new.txt"), `${branch} side\n`);
    git(work, "add", "-A");
    git(work, "commit", "-q", "-m", `${branch} adds new.txt`);
    git(work, "push", "-q", "origin", branch);
  }
  git(work, "checkout", "-q", "feature");

  const { outputs } = runPrepare(work);
  assert.equal(outputs.conflict_list, "new.txt");
  assert.equal(outputs.modify_delete, "");
});

test("a conflict in a PROTECTED path is handed to the LLM and logged, not escalated away", () => {
  // Which paths count as protected is the shared predicate's contract, covered
  // member-by-member in lib.test.mjs; what prepare owns is that a
  // protected conflict still goes to the LLM and is named in the run's log.
  const work = fixtureConflictingOn(".github/workflows/ci.yaml");
  const { outputs, merging, ghCalls, stdout } = runPrepare(work);
  assert.equal(outputs.needs_llm, "true"); // resolved, not escalated away
  assert.equal(outputs.needs_commit, "true");
  assert.equal(outputs.conflict_list, ".github/workflows/ci.yaml");
  assert.match(stdout, /protected path\(s\) '\.github\/workflows\/ci\.yaml'/);
  assert.equal(merging, true); // merge KEPT for Claude + the bundle step, not aborted
  // Prepare never talks to GitHub — a run that resolves nothing says nothing,
  // so the warning rides the land step's pushed-resolution comment instead.
  assert.deepEqual(ghCalls, []);
});

test("a clean merge (no conflict) is a no-op", () => {
  // feature edits a different file than main → no conflict.
  const root = scratch();
  const origin = join(root, "origin.git");
  const work = join(root, "work");
  git(root, "init", "--bare", "-q", origin);
  git(root, "clone", "-q", origin, work);
  git(work, "config", "user.email", "t@t");
  git(work, "config", "user.name", "t");
  writeFileSync(join(work, "a.txt"), "a\n");
  writeFileSync(join(work, "b.txt"), "b\n");
  git(work, "add", "-A");
  git(work, "commit", "-q", "-m", "base");
  git(work, "branch", "-M", "main");
  git(work, "push", "-q", "origin", "main");
  git(work, "checkout", "-q", "-b", "feature");
  writeFileSync(join(work, "a.txt"), "a changed on feature\n");
  git(work, "commit", "-q", "-am", "feature");
  git(work, "checkout", "-q", "main");
  writeFileSync(join(work, "b.txt"), "b changed on main\n");
  git(work, "commit", "-q", "-am", "main");
  git(work, "push", "-q", "origin", "main");
  git(work, "checkout", "-q", "feature");

  // A real merge commit that git produced cleanly. Something upstream called
  // this PR conflicting, so the merge is worth pushing — the PR is behind its
  // base and this run is what catches it up. Dropping it on the floor strands
  // the PR, and the attempt mark then suppresses every later scan for a TTL.
  const { outputs, merging } = runPrepare(work);
  assert.equal(outputs.needs_commit, "true");
  assert.equal(outputs.needs_llm, "false");
  assert.equal(outputs.no_op_head, undefined, "a real merge is not a no-op");
  assert.equal(merging, false); // clean merge auto-committed, no conflict
});

test("a merge that FAST-FORWARDS the PR branch is refused, not pushed", () => {
  // feature has no commits of its own that main lacks, so merging main moves
  // HEAD onto the base tip. Pushing that empties the pull request's diff.
  const root = scratch();
  const origin = join(root, "origin.git");
  const work = join(root, "work");
  git(root, "init", "--bare", "-q", origin);
  git(root, "clone", "-q", origin, work);
  git(work, "config", "user.email", "t@t");
  git(work, "config", "user.name", "t");
  writeFileSync(join(work, "a.txt"), "a\n");
  git(work, "add", "-A");
  git(work, "commit", "-q", "-m", "base");
  git(work, "branch", "-M", "main");
  git(work, "push", "-q", "origin", "main");
  git(work, "checkout", "-q", "-b", "feature"); // branched, then never committed
  git(work, "checkout", "-q", "main");
  writeFileSync(join(work, "a.txt"), "a changed on main\n");
  git(work, "commit", "-q", "-am", "main moves on");
  git(work, "push", "-q", "origin", "main");
  git(work, "checkout", "-q", "feature");

  const { outputs, stdout } = runPrepare(work);
  assert.equal(outputs.needs_commit, "false");
  assert.equal(outputs.needs_llm, "false");
  assert.ok(
    outputs.no_op_head,
    "the attempt must be handed back on the marked head",
  );
  assert.match(stdout, /empty the pull request/);
});

test("a PR branch already containing its base is a no-op", () => {
  const root = scratch();
  const origin = join(root, "origin.git");
  const work = join(root, "work");
  git(root, "init", "--bare", "-q", origin);
  git(root, "clone", "-q", origin, work);
  git(work, "config", "user.email", "t@t");
  git(work, "config", "user.name", "t");
  writeFileSync(join(work, "a.txt"), "a\n");
  git(work, "add", "-A");
  git(work, "commit", "-q", "-m", "base");
  git(work, "branch", "-M", "main");
  git(work, "push", "-q", "origin", "main");
  git(work, "checkout", "-q", "-b", "feature");
  writeFileSync(join(work, "b.txt"), "b\n");
  git(work, "add", "-A");
  git(work, "commit", "-q", "-m", "feature only");

  const { outputs } = runPrepare(work);
  assert.equal(outputs.needs_commit, "false");
  assert.equal(outputs.needs_llm, "false");
  assert.ok(outputs.no_op_head);
});

test("mergiraf solving a conflict keeps it away from the model entirely", () => {
  const work = fixtureConflictingOn("src/thing.js");
  const { outputs } = runPrepare(work, {}, { mergiraf: "solves" });
  // The whole point of the structural pass: the file is resolved and staged, so
  // it never appears in the list the model is paid to read.
  assert.equal(outputs.conflict_list, "");
  assert.equal(outputs.needs_llm, "false");
  assert.equal(outputs.needs_commit, "true");
});

test("a conflict mergiraf cannot solve reaches the model unchanged, and is named", () => {
  const work = fixtureConflictingOn("src/thing.js");
  const { outputs, stdout } = runPrepare(
    work,
    {},
    { mergiraf: "cannot-solve" },
  );
  assert.equal(outputs.conflict_list, "src/thing.js");
  assert.equal(outputs.needs_llm, "true");
  // Both halves are logged so `solved / (solved + left)` is readable from a run
  // of real resolves. That ratio is the only measure of what the pass is worth,
  // and it needs no new code to collect.
  assert.match(
    stdout,
    /mergiraf left 1 conflict\(s\) for the model: src\/thing\.js/,
  );
});

test("an EMPTY mergiraf success never overwrites the file", () => {
  // The real binary exits 0 and prints nothing when it cannot generate a
  // solution — notably on diff2-style markers, which it refuses outright. An
  // exit-status-and-no-markers test alone accepts that empty output, and the
  // file would be overwritten with nothing, staged, and dropped from the
  // model's list: silent data loss reported as a structural solve.
  const work = fixtureConflictingOn("src/thing.js");
  const { outputs } = runPrepare(work, {}, { mergiraf: "empty-success" });
  assert.equal(
    outputs.conflict_list,
    "src/thing.js",
    "the conflict must reach the model",
  );
  const onDisk = readFileSync(join(work, "src/thing.js"), "utf8");
  assert.notEqual(onDisk.trim(), "", "prepare truncated the conflicted file");
  assert.match(
    onDisk,
    /<<<<<<</,
    "the unresolved conflict must be left intact",
  );
});

test("the merge uses diff3 markers, without which mergiraf solves nothing", () => {
  // mergiraf refuses a diff2 conflict outright ("Cannot solve conflicts in
  // diff2 style"). With git's default style the structural pass would be inert:
  // every structural conflict routes to the paid pass and nothing reports it.
  const work = fixtureConflictingOn("src/thing.js");
  runPrepare(work, {}, { mergiraf: "cannot-solve" });
  assert.match(
    readFileSync(join(work, "src/thing.js"), "utf8"),
    /^\|{7}/m,
    "no diff3 base section — mergiraf cannot solve these markers",
  );
});

test("a MISSING mergiraf fails the run rather than skipping the pre-pass", () => {
  // The inert-feature failure this guards: with the binary absent and no
  // refusal, nothing goes red, the structural pass is simply dead, and every
  // structural conflict quietly routes to the paid model pass.
  const work = fixtureConflictingOn("src/thing.js");
  const { error, outputs } = runPrepare(work, {}, { mergiraf: "absent" });
  assert.ok(error, "prepare must exit non-zero when mergiraf is absent");
  assert.equal(outputs.conflict_list, undefined);
});
