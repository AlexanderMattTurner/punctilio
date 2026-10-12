import { strict as assert } from "node:assert";
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LIVE_SCRIPT = join(REPO_ROOT, "scripts", "version-bump.sh");
const AUTO_VERSION_YAML = join(
  REPO_ROOT,
  ".github",
  "workflows",
  "auto-version.yml",
);

test("the release checkout never uses the cross-account template-sync PAT", () => {
  // auto-version.yml's checkout uses TEMPLATE_SYNC_TOKEN_ORG — the org PAT
  // registered as a ruleset bypass actor, needed because the release commit +
  // tag push to protected main is rejected for GITHUB_TOKEN (GH013). The bare
  // TEMPLATE_SYNC_TOKEN is a different-owner PAT that this repo's remote rejects
  // 403, stranding every release. Guard that only the _ORG variant appears.
  const yaml = readFileSync(AUTO_VERSION_YAML, "utf8");
  assert.doesNotMatch(
    yaml,
    /TEMPLATE_SYNC_TOKEN(?!_ORG)/,
    "the release checkout must not use the bare cross-account PAT",
  );
});

// --- Automated major bumps are disabled ------------------------------------
// A breaking-change marker (`type!:` subject or `BREAKING CHANGE:` footer) must
// be CAPPED at a minor bump, never a major one: a stray `!` in a routine commit
// must not leap the whole version line. The npm stub reports the package at
// 5.0.0 and answers the `pkg@<version>` existence probe with success, so each
// run stops at the "already exists" guard BEFORE any publish/push — nothing
// leaves the sandbox.
//
// punctilio's script invokes `npm view <pkg> version` (existence check: $2 has
// no `@`, so the stub echoes 5.0.0) and later `npm view <pkg>@<ver> version`
// (existence probe: $2 contains `@`, so the stub exits 0).
const NPM_AT_5_STUB =
  'if [[ "$2" == *@* ]]; then exit 0; else echo "5.0.0"; fi';

/** Build a throwaway git repo tagged v0.0.0 at HEAD, plus a stubbed `npm`. */
function makeSandbox(npmStubBody, packageExtras = {}) {
  const dir = mkdtempSync(join(tmpdir(), "vbump-"));
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({ name: "sandbox-pkg", version: "0.0.0", ...packageExtras }) +
      "\n",
  );
  const binDir = join(dir, "stub-bin");
  mkdirSync(binDir);
  const npmStub = join(binDir, "npm");
  writeFileSync(npmStub, `#!/usr/bin/env bash\n${npmStubBody}\n`);
  chmodSync(npmStub, 0o755);

  const git = (...args) =>
    execFileSync("git", args, { cwd: dir, stdio: "ignore" });
  git("init", "-q");
  git("config", "user.email", "t@t.test");
  git("config", "user.name", "t");
  git("commit", "-q", "--allow-empty", "-m", "chore: seed");
  git("tag", "v0.0.0");
  return { dir, binDir };
}

/** Run the live script in `dir`; return {status, stderr, stdout}. */
function runScript(dir, binDir) {
  const env = { ...process.env, PATH: `${binDir}:${process.env.PATH}` };
  delete env.ANTHROPIC_API_KEY;
  const res = spawnSync("bash", [LIVE_SCRIPT], {
    cwd: dir,
    env,
    encoding: "utf8",
  });
  assert.equal(res.error, undefined, "failed to spawn the release script");
  return { status: res.status, stderr: res.stderr, stdout: res.stdout };
}

// `pnpm publish` succeeds offline (running an `on-publish` script beside the
// stub, if any) and `pnpm exec` runs the repo's real tsx, so the README pin and
// the CHANGELOG promotion run for real against main.
const PNPM_STUB = `#!/usr/bin/env bash\nif [[ "$1" == exec ]]; then exec "${join(REPO_ROOT, "node_modules", ".bin")}/$2" "\${@:3}"; fi\nif [[ -x "$(dirname "$0")/on-publish" ]]; then "$(dirname "$0")/on-publish"; fi\n`;
const README_AT_5 =
  "# sandbox\n\n- repo: https://github.com/AlexanderMattTurner/punctilio\n  rev: v5.0.0\n";
const CHANGELOG_AT_5 =
  "# Changelog\n\n## Unreleased\n\n## [5.0.0] - 2026-01-01\n\n- old\n";

/** A sandbox whose releasable HEAD is pushed to a bare origin's main. */
function makeReleaseSandbox(changelog = CHANGELOG_AT_5) {
  const { dir, binDir } = makeSandbox(
    'if [[ "$2" == *@* ]]; then exit 1; else echo "5.0.0"; fi',
  );
  writeFileSync(join(binDir, "pnpm"), PNPM_STUB);
  chmodSync(join(binDir, "pnpm"), 0o755);
  // retry_cmd sleeps between attempts; make the failing-push retries instant.
  writeFileSync(join(binDir, "sleep"), "#!/usr/bin/env bash\nexit 0\n");
  chmodSync(join(binDir, "sleep"), 0o755);
  const origin = join(dir, "origin.git");
  git(dir, "init", "-q", "--bare", origin);
  git(dir, "remote", "add", "origin", origin);
  writeFileSync(join(dir, "CHANGELOG.md"), changelog);
  writeFileSync(join(dir, "README.md"), README_AT_5);
  git(dir, "add", "CHANGELOG.md", "README.md");
  git(dir, "commit", "-q", "-m", "feat: releasable work");
  git(dir, "push", "-q", "origin", "HEAD:main");
  return { dir, binDir, origin };
}

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

/** Merge a commit to origin's main from another clone, as a PR landing mid-release. */
function mergeToMain(origin, dir, subject, files) {
  const other = join(dir, "other");
  git(dir, "clone", "-q", "--branch", "main", origin, other);
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(other, name), content);
  }
  git(other, "add", "-A");
  git(other, "-c", "user.name=o", "-c", "user.email=o@o.test", "commit", "-q", "-m", subject);
  git(other, "push", "-q", "origin", "main");
}

for (const { name, subject, body } of [
  {
    name: "a `type!:` subject",
    subject: "feat(api)!: drop the legacy field",
    body: "",
  },
  {
    name: "a `BREAKING CHANGE:` footer",
    subject: "refactor(core): rework the seam",
    body: "\n\nBREAKING CHANGE: the transform signature changed",
  },
]) {
  test(`${name} is capped at a minor bump, never a major one`, () => {
    const { dir, binDir } = makeSandbox(NPM_AT_5_STUB);
    try {
      const git = (...args) =>
        execFileSync("git", args, { cwd: dir, stdio: "ignore" });
      // A breaking-change commit past the v0.0.0 tag — the exact input that used
      // to decide a major bump (5.x -> 6.0).
      git("commit", "-q", "--allow-empty", "-m", subject + body);
      const { status, stderr } = runScript(dir, binDir);
      assert.equal(status, 0, stderr);
      assert.match(stderr, /Conventional Commits bump level: minor/);
      assert.match(stderr, /New version: 5\.1\.0/);
      assert.doesNotMatch(stderr, /bump level: major/);
      assert.doesNotMatch(stderr, /New version: 6\./);
      assert.match(stderr, /automated MAJOR bumps are disabled/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}

// --- Current-version lookup and self-publish guard ------------------------
// Only npm's E404 for a never-published package means "first release"; any
// other `npm view` failure must abort, never restart the line at 0.0.1. Each
// releasable case stops at the "already exists" probe, so nothing publishes.
const PROBE_EXISTS = 'if [[ "$2" == *@* ]]; then exit 0; fi;';
for (const { name, npmStub, packageExtras, status, expected, forbidden } of [
  {
    name: "an npm 404 starts the first release",
    npmStub: `${PROBE_EXISTS} echo "npm error code E404" >&2; exit 1`,
    status: 0,
    expected: /New version: 0\.0\.1/,
  },
  {
    name: "a non-404 npm failure aborts",
    npmStub: `${PROBE_EXISTS} echo "npm error code ECONNRESET" >&2; exit 1`,
    status: 1,
    expected: /npm view failed for 'sandbox-pkg' \(not a 404 for an unpublished package\):\nnpm error code ECONNRESET/,
    forbidden: /New version:/,
  },
  {
    name: "a non-semver npm version aborts",
    npmStub: `${PROBE_EXISTS} echo "5.0.0-beta.1"`,
    status: 1,
    expected: /non-semver current version: '5\.0\.0-beta\.1'/,
    forbidden: /New version:/,
  },
  {
    name: "a private package never publishes",
    npmStub: "exit 99",
    packageExtras: { private: true },
    status: 0,
    expected: /"private": true; this repo does not publish to npm\. Skipping\./,
    forbidden: /Current npm version/,
  },
]) {
  test(name, () => {
    const { dir, binDir } = makeSandbox(npmStub, packageExtras);
    try {
      execFileSync("git", ["commit", "-q", "--allow-empty", "-m", "fix: x"], {
        cwd: dir,
      });
      const result = runScript(dir, binDir);
      assert.equal(result.status, status, result.stderr);
      assert.match(result.stderr, expected);
      if (forbidden) assert.doesNotMatch(result.stderr, forbidden);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}

test("an unreadable package.json fails closed instead of publishing", () => {
  const { dir, binDir } = makeSandbox("exit 99");
  try {
    writeFileSync(join(dir, "package.json"), "{ not json");
    const { status, stderr } = runScript(dir, binDir);
    assert.equal(status, 1, stderr);
    assert.match(stderr, /could not read package\.json "private" field/);
    assert.doesNotMatch(stderr, /Current npm version/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

for (const state of ["published", "staged"]) {
  test(`a publish rejected as already ${state} is treated as success`, () => {
    const { dir, binDir } = makeSandbox(
      'if [[ "$2" == *@* ]]; then exit 1; else echo "5.0.0"; fi',
    );
    try {
      writeFileSync(
        join(binDir, "pnpm"),
        `#!/usr/bin/env bash\necho 'npm error 409 Conflict - Cannot publish over previously ${state} version "5.0.1".' >&2\nexit 1\n`,
      );
      chmodSync(join(binDir, "pnpm"), 0o755);
      execFileSync("git", ["commit", "-q", "--allow-empty", "-m", "fix: x"], {
        cwd: dir,
      });
      const { status, stderr } = runScript(dir, binDir);
      assert.equal(status, 0, stderr);
      assert.match(stderr, /already published \(detected at publish time\)/);
      assert.doesNotMatch(stderr, /Pushed tag/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}

test("a release tag newer than npm's view sets the floor for the bump", () => {
  // npm still reports 5.0.0 just after 5.2.0 was published and tagged; bumping
  // from npm's view would re-publish 5.0.1 / 5.1.0 over an existing line.
  const { dir, binDir } = makeSandbox(NPM_AT_5_STUB);
  try {
    const git = (...args) => execFileSync("git", args, { cwd: dir });
    git("commit", "-q", "--allow-empty", "-m", "fix: released as 5.2.0");
    git("tag", "v5.2.0");
    git("commit", "-q", "--allow-empty", "-m", "fix: x");
    const { status, stderr } = runScript(dir, binDir);
    assert.equal(status, 0, stderr);
    assert.match(
      stderr,
      /npm reports 5\.0\.0, but v5\.2\.0 is already released/,
    );
    assert.match(stderr, /New version: 5\.2\.1/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a range containing only release-docs commits is skipped, not re-released", () => {
  // The tag marks the published commit, so after every successful release HEAD
  // sits one "docs: release ..." commit past it; a re-dispatch must not read
  // that commit as releasable work.
  const { dir, binDir } = makeSandbox(NPM_AT_5_STUB);
  try {
    execFileSync(
      "git",
      ["commit", "-q", "--allow-empty", "-m", "docs: release 5.0.0 [skip ci]"],
      { cwd: dir },
    );
    const { status, stderr } = runScript(dir, binDir);
    assert.equal(status, 0, stderr);
    assert.match(stderr, /Only release-docs commits since v0\.0\.0\. Skipping\./);
    assert.doesNotMatch(stderr, /New version:/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// --- Truncation never aborts the run -----------------------------------------
// The script runs under `set -euo pipefail`, so a size cap built from a pipe
// whose reader closes early (`... | head -c N`) kills the writer with SIGPIPE
// (status 141) once its output outgrows the pipe buffer, aborting the release
// before it versions or publishes.
const OVERSIZED_UNRELEASED_ENTRY = "- a changelog entry\n";

test("an Unreleased section larger than the pipe buffer does not abort the run", () => {
  const { dir, binDir } = makeReleaseSandbox(
    `# Changelog\n\n## Unreleased\n\n${OVERSIZED_UNRELEASED_ENTRY.repeat(
      (512 * 1024) / OVERSIZED_UNRELEASED_ENTRY.length,
    )}\n## 0.0.0\n\n- seed\n`,
  );
  try {
    const { status, stderr } = runScript(dir, binDir);
    assert.equal(status, 0, stderr.slice(-2000));
    assert.match(stderr, /New version: 5\.1\.0/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the commit list handed to the changelog drafter is capped at 20 lines, 100 characters each, 2000 in total", () => {
  const { dir, binDir } = makeSandbox(NPM_AT_5_STUB);
  try {
    for (let index = 0; index < 30; index += 1) {
      execFileSync(
        "git",
        ["commit", "-q", "--allow-empty", "-m", `fix: ${"x".repeat(150)}`],
        { cwd: dir },
      );
    }
    const { status, stderr } = runScript(dir, binDir);
    assert.equal(status, 0, stderr);
    const listed = stderr
      .split("Commits to analyze:\n")[1]
      .split("\nConventional Commits bump level")[0];
    const lines = listed.split("\n");
    assert.equal(lines.length, 20);
    assert.ok(lines.every((line) => line.length <= 100));
    assert.equal(listed.length, 2000);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// A docs push that fails after the retries must fail the run, but only after
// the vX.Y.Z tag reached the remote (otherwise the next run re-reads the
// climbing npm version and bumps again), and without touching main.
for (const { name, breakOrigin, failure } of [
  {
    name: "the remote rejects the branch push",
    breakOrigin: (origin) => {
      const preReceive = join(origin, "hooks", "pre-receive");
      writeFileSync(
        preReceive,
        '#!/usr/bin/env bash\nwhile read -r _old _new ref; do\n  [[ "$ref" == refs/heads/* ]] && exit 1\ndone\nexit 0\n',
      );
      chmodSync(preReceive, 0o755);
    },
    failure: "failed to push the release-docs update",
  },
  {
    name: "a merge during the publish adds an Unreleased changelog entry",
    breakOrigin: (origin, dir, binDir) => {
      writeFileSync(
        join(dir, "mid-release-CHANGELOG.md"),
        CHANGELOG_AT_5.replace("## Unreleased\n", "## Unreleased\n\n- a mid-release entry\n"),
      );
      writeFileSync(
        join(binDir, "on-publish"),
        `#!/usr/bin/env bash\nset -e\ngit clone -q --branch main "${origin}" "${dir}/other"\ncd "${dir}/other"\ncp "${dir}/mid-release-CHANGELOG.md" CHANGELOG.md\ngit -c user.name=o -c user.email=o@o.test commit -q -am "docs: note a change"\ngit push -q origin main\n`,
      );
      chmodSync(join(binDir, "on-publish"), 0o755);
    },
    failure: '"## Unreleased" changelog block changed during the release',
  },
]) {
  test(`when ${name}, the run fails after the tag landed and leaves main alone`, () => {
    const { dir, binDir, origin } = makeReleaseSandbox();
    try {
      breakOrigin(origin, dir, binDir);

      const { status, stderr } = runScript(dir, binDir);
      assert.notEqual(status, 0, "a failed docs push must fail the run");
      const tagIndex = stderr.indexOf("Pushed tag v5.1.0");
      assert.ok(tagIndex !== -1, stderr);
      assert.ok(stderr.indexOf(failure) > tagIndex, stderr);
      assert.match(git(dir, "ls-remote", "--tags", origin), /refs\/tags\/v5\.1\.0/);
      assert.doesNotMatch(
        git(dir, "log", "--format=%s", "-1", "origin/main"),
        /^docs: release/,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}

test("a release that merges to main mid-release gets the docs built on top of it", () => {
  // The previous release's docs commit landed after this run checked out, so
  // both rewrite the same CHANGELOG anchor and README rev line, and HEAD's
  // Unreleased entry is one that release already shipped.
  const { dir, binDir, origin } = makeReleaseSandbox(
    CHANGELOG_AT_5.replace("## Unreleased\n", "## Unreleased\n\n- fix\n"),
  );
  try {
    mergeToMain(origin, dir, "docs: release 5.0.1 [skip ci]", {
      "CHANGELOG.md": CHANGELOG_AT_5.replace(
        "## Unreleased\n",
        "## Unreleased\n\n## [5.0.1] - 2026-01-02\n\n- fix\n",
      ),
      "README.md": README_AT_5.replace("v5.0.0", "v5.0.1"),
    });

    const { status, stderr } = runScript(dir, binDir);
    assert.equal(status, 0, stderr);
    assert.deepEqual(git(dir, "log", "--format=%s", "-2", "origin/main").split("\n"), [
      "docs: release 5.1.0 [skip ci]",
      "docs: release 5.0.1 [skip ci]",
    ]);
    assert.equal(
      git(dir, "show", "origin/main:CHANGELOG.md").replace(
        /^## \[5\.1\.0\] - \d{4}-\d{2}-\d{2}$/m,
        "## [5.1.0] - DATE",
      ),
      "# Changelog\n\n## Unreleased\n\n## [5.1.0] - DATE\n\n### Changed\n\n- feat: releasable work\n\n## [5.0.1] - 2026-01-02\n\n- fix\n\n## [5.0.0] - 2026-01-01\n\n- old",
    );
    assert.equal(
      git(dir, "show", "origin/main:README.md"),
      README_AT_5.replace("v5.0.0", "v5.1.0").trim(),
    );
    assert.equal(git(dir, "log", "-1", "--format=%s"), "feat: releasable work");
    assert.equal(
      git(dir, "diff", "--name-only", "origin/main~1", "origin/main"),
      "CHANGELOG.md\nREADME.md",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a docs push whose acknowledgment is lost is not promoted twice", () => {
  const { dir, binDir } = makeReleaseSandbox();
  try {
    // The first push to main lands on the remote but reports failure.
    const realGit = execFileSync("bash", ["-c", "command -v git"], {
      encoding: "utf8",
    }).trim();
    writeFileSync(
      join(binDir, "git"),
      `#!/usr/bin/env bash\nif [[ "$1" == push && "$3" == *:refs/heads/main && ! -e "${binDir}/acked" ]]; then\n  touch "${binDir}/acked"\n  "${realGit}" "$@"\n  exit 1\nfi\nexec "${realGit}" "$@"\n`,
    );
    chmodSync(join(binDir, "git"), 0o755);

    const { status, stderr } = runScript(dir, binDir);
    assert.equal(status, 0, stderr);
    assert.ok(existsSync(join(binDir, "acked")), stderr);
    assert.deepEqual(git(dir, "log", "--format=%s", "-2", "origin/main").split("\n"), [
      "docs: release 5.1.0 [skip ci]",
      "feat: releasable work",
    ]);
    assert.equal(
      git(dir, "show", "origin/main:CHANGELOG.md").match(/^## \[5\.1\.0\]/gm).length,
      1,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
