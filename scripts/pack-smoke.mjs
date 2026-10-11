/**
 * Smoke-tests a packed punctilio tarball the way a consumer meets it: installs
 * it into throwaway projects with and without the optional peers, runs the
 * `punctilio` bin through its `node_modules/.bin` link, and imports every
 * `exports` subpath.
 *
 *   pnpm run build && pnpm pack --pack-destination /tmp/pack
 *   node scripts/pack-smoke.mjs /tmp/pack/punctilio-0.0.0-git.tgz
 *
 * Without the peers, `.`, `./rehype` and `./remark` must import; every other
 * subpath must either import or fail with ERR_MODULE_NOT_FOUND naming a
 * declared optional peer, and `punctilio --help` must still exit 0.
 */

import { execFileSync, spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const PEERLESS_SUBPATHS = [".", "./rehype", "./remark"]
const CLI_CASES = [
  { type: "md", input: '"Hello" -- world...\n', expected: "“Hello”—world…" },
  { type: "html", input: '<p>"Hello" -- world...</p>\n', expected: "<p>“Hello”—world…</p>" },
]

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const manifest = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"))
const subpaths = Object.keys(manifest.exports)
const optionalPeers = Object.entries(manifest.peerDependenciesMeta)
  .filter(([, meta]) => meta.optional)
  .map(([name]) => name)

const tarballArg = process.argv[2]
if (!tarballArg) {
  throw new Error("Usage: node scripts/pack-smoke.mjs <path-to-punctilio.tgz>")
}
const tarball = resolve(tarballArg)

const failures = []
function check(ok, message) {
  console.log(`${ok ? "ok  " : "FAIL"} ${message}`)
  if (!ok) failures.push(message)
}

/** Peers install at the devDependency version the test suite runs against. */
function pinnedPeer(name) {
  const version = manifest.devDependencies[name]
  if (!version) throw new Error(`Optional peer ${name} has no pinned devDependency version`)
  return `${name}@${version}`
}

function createConsumer(label, extraPackages) {
  const dir = mkdtempSync(join(tmpdir(), `punctilio-smoke-${label}-`))
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: `smoke-${label}`, private: true, type: "module" }))
  execFileSync("npm", ["install", "--no-audit", "--no-fund", tarball, ...extraPackages], { cwd: dir, stdio: "inherit" })
  return dir
}

function importSubpath(dir, subpath) {
  const specifier = subpath === "." ? manifest.name : `${manifest.name}/${subpath.slice(2)}`
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", `await import(${JSON.stringify(specifier)})`], {
    cwd: dir,
    encoding: "utf8",
  })
  return { specifier, status: result.status, stderr: result.stderr }
}

function runBin(dir, args, input) {
  return spawnSync(join(dir, "node_modules", ".bin", manifest.name), args, { cwd: dir, encoding: "utf8", input })
}

/** The optional peer named by an ERR_MODULE_NOT_FOUND, or null for any other failure. */
function missingOptionalPeer(stderr) {
  if (!stderr.includes("ERR_MODULE_NOT_FOUND")) return null
  const missing = /Cannot find package '(?<name>[^']+)'/u.exec(stderr)?.groups?.name
  return optionalPeers.includes(missing) ? missing : null
}

console.log("\n== With the optional peers installed ==")
const withPeers = createConsumer("peers", optionalPeers.map(pinnedPeer))
for (const subpath of subpaths) {
  const { specifier, status, stderr } = importSubpath(withPeers, subpath)
  check(status === 0, `import ${specifier}${status === 0 ? "" : `\n${stderr}`}`)
}
for (const { type, input, expected } of CLI_CASES) {
  const result = runBin(withPeers, ["--type", type, "-"], input)
  check(
    result.status === 0 && result.stdout.includes(expected),
    `punctilio --type ${type} transforms stdin (status ${result.status}, stdout ${JSON.stringify(result.stdout)}, stderr ${JSON.stringify(result.stderr)})`,
  )
}

console.log("\n== Without the optional peers ==")
const withoutPeers = createConsumer("bare", [])
for (const subpath of subpaths) {
  const { specifier, status, stderr } = importSubpath(withoutPeers, subpath)
  if (PEERLESS_SUBPATHS.includes(subpath)) {
    check(status === 0, `import ${specifier} needs no optional peer${status === 0 ? "" : `\n${stderr}`}`)
    continue
  }
  const peer = status === 0 ? null : missingOptionalPeer(stderr)
  check(
    status === 0 || peer !== null,
    status === 0 || peer !== null
      ? `import ${specifier} ${status === 0 ? "succeeds" : `asks for optional peer ${peer}`}`
      : `import ${specifier} fails with something other than a missing optional peer\n${stderr}`,
  )
}
const help = runBin(withoutPeers, ["--help"])
check(
  help.status === 0 && help.stdout.includes(`Usage: ${manifest.name}`),
  `punctilio --help works without the peers (status ${help.status}, stderr ${JSON.stringify(help.stderr)})`,
)

if (failures.length > 0) {
  console.error(`\n${failures.length} smoke check(s) failed.`)
  process.exit(1)
}
console.log("\nAll smoke checks passed.")
