import { spawnSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

import { UNICODE_SYMBOLS } from "../constants.js"
import { loadSinkTransform, MissingPeerDependencyError, type PeerImporter, SINK_PEER_DEPENDENCIES } from "../peer-dependencies.js"
import { runCli } from "../cli.js"
import { Readable, Writable } from "node:stream"

const { LEFT_DOUBLE_QUOTE: LDQ, RIGHT_DOUBLE_QUOTE: RDQ, EM_DASH } = UNICODE_SYMBOLS

const projectRoot = resolve(fileURLToPath(new URL(".", import.meta.url)), "../..")

function notFound(packageName: string): Error {
  return Object.assign(new Error(`Cannot find package '${packageName}' imported from /app/cli.js`), {
    code: "ERR_MODULE_NOT_FOUND",
  })
}

function importerMissing(...absent: string[]): PeerImporter {
  return async (packageName) => {
    if (absent.includes(packageName)) throw notFound(packageName)
    return {}
  }
}

describe("loadSinkTransform", () => {
  it.each([["md"], ["html"]] as const)("loads the %s transform when its peers are installed", async (type) => {
    const transform = await loadSinkTransform(type)
    expect(typeof transform).toBe("function")
  })

  it.each([
    ["md", ["unified"], "Markdown", "unified, which is not installed. Install with: npm install unified"],
    ["md", ["remark-gfm", "remark-parse"], "Markdown", "remark-parse, remark-gfm, which are not installed. Install with: npm install remark-parse remark-gfm"],
    ["html", ["rehype-stringify"], "HTML", "rehype-stringify, which is not installed. Install with: npm install rehype-stringify"],
    ["html", ["unified", "rehype-parse", "rehype-stringify"], "HTML", "unified, rehype-parse, rehype-stringify, which are not installed. Install with: npm install unified rehype-parse rehype-stringify"],
  ] as const)("names every missing peer for %s (%j)", async (type, absent, label, tail) => {
    const attempt = loadSinkTransform(type, importerMissing(...absent))
    await expect(attempt).rejects.toThrow(MissingPeerDependencyError)
    await expect(attempt).rejects.toThrow(`Processing ${label} files requires ${tail}`)
  })

  it("only imports the peers of the requested type", async () => {
    const imported: string[] = []
    await loadSinkTransform("html", async (packageName) => { imported.push(packageName) })
    expect(imported).toEqual([...SINK_PEER_DEPENDENCIES.html])
  })

  it.each([
    ["a failure that is not a missing module", new SyntaxError("Unexpected token")],
    ["a module-not-found error for some other package", Object.assign(new Error("Cannot find package 'left-pad' imported from /x"), { code: "ERR_MODULE_NOT_FOUND" })],
    ["an error without a code", new Error("Cannot find package 'unified'")],
  ])("rethrows %s rather than blaming the peer", async (_label, failure) => {
    await expect(loadSinkTransform("md", async () => { throw failure })).rejects.toBe(failure)
  })
})

function captureIO(stdin: string) {
  const out: string[] = []
  const err: string[] = []
  const sink = (chunks: string[]) => new Writable({ write(chunk, _enc, done) { chunks.push(String(chunk)); done() } })
  return {
    io: { stdin: Readable.from([stdin]), stdout: sink(out), stderr: sink(err) },
    stdout: () => out.join(""),
    stderr: () => err.join(""),
  }
}

describe("runCli with an uninstalled peer", () => {
  it.each([
    ["md", ["remark-gfm"], 2, "Error: Processing Markdown files requires remark-gfm, which is not installed. Install with: npm install remark-gfm\n"],
    ["md", ["rehype-parse", "rehype-stringify"], 0, ""],
    ["html", ["remark-parse"], 0, ""],
    ["html", ["rehype-parse"], 2, "Error: Processing HTML files requires rehype-parse, which is not installed. Install with: npm install rehype-parse\n"],
  ] as const)("--type %s with %j absent exits %i", async (type, absent, code, stderr) => {
    const cap = captureIO('"Hi"')
    expect(await runCli(["-", "--type", type, "--no-config"], { ...cap.io, importPeer: importerMissing(...absent) })).toBe(code)
    expect(cap.stderr()).toBe(stderr)
    expect(cap.stdout() === "").toBe(code === 2)
  })
})

describe("with the optional peers uninstalled", () => {
  let dir: string
  let registerUrl: string

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "punctilio-peers-"))
    writeFileSync(
      join(dir, "hooks.mjs"),
      `export async function resolve(specifier, context, nextResolve) {
  if (new RegExp(process.env.PUNCTILIO_BLOCKED_PEERS).test(specifier)) {
    throw Object.assign(new Error("Cannot find package '" + specifier + "' imported from " + context.parentURL), { code: "ERR_MODULE_NOT_FOUND" })
  }
  return nextResolve(specifier, context)
}
`,
    )
    writeFileSync(
      join(dir, "register.mjs"),
      'import { register } from "node:module"\nregister("./hooks.mjs", import.meta.url)\n',
    )
    registerUrl = pathToFileURL(join(dir, "register.mjs")).href
  })

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  function runWithoutPeers(entryArgs: string[], input = ""): ReturnType<typeof spawnSync<string>> {
    return spawnSync(process.execPath, ["--import", "tsx", "--import", registerUrl, ...entryArgs], {
      cwd: projectRoot,
      encoding: "utf8",
      input,
      env: { ...process.env, PUNCTILIO_BLOCKED_PEERS: "^(unified|rehype-.*|remark-.*)$" },
    })
  }

  it.each(["md", "html"])("the CLI reports the missing peers for --type %s", (type) => {
    const result = runWithoutPeers(["src/cli.ts", "-", "--type", type, "--no-config"], '"Hi"')
    expect(result.status).toBe(2)
    expect(result.stdout).toBe("")
    expect(result.stderr).toMatch(
      new RegExp(`^Error: Processing ${type === "md" ? "Markdown" : "HTML"} files requires unified, .* not installed\\. Install with: npm install unified `),
    )
  })

  it("the CLI still prints --help and --version", () => {
    expect(runWithoutPeers(["src/cli.ts", "--help"]).status).toBe(0)
    expect(runWithoutPeers(["src/cli.ts", "--version"]).status).toBe(0)
  })

  it("the Prettier plugin formats Markdown", () => {
    const script = `
      import plugin from ${JSON.stringify(pathToFileURL(join(projectRoot, "src/prettier-plugin.ts")).href)}
      import * as prettier from "prettier"
      process.stdout.write(await prettier.format('"Hi" -- x\\n', { parser: "markdown", plugins: [plugin] }))
    `
    const result = runWithoutPeers(["--input-type=module", "-e", script])
    expect(result.stderr).toBe("")
    expect(result.stdout).toBe(`${LDQ}Hi${RDQ}${EM_DASH}x\n`)
  })
}, 60_000)
