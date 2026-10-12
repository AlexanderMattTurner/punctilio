import { spawnSync } from "node:child_process"
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { Readable, Writable } from "node:stream"
import { fileURLToPath, pathToFileURL } from "node:url"

import { atomicWriteFile, isMainModule, runCli } from "../cli.js"
import { UNICODE_SYMBOLS } from "../constants.js"
import { clearProcessorCache as clearMarkdownCache } from "../markdown.js"
import { clearProcessorCache as clearHtmlCache } from "../html.js"

const { LEFT_DOUBLE_QUOTE: LDQ, RIGHT_DOUBLE_QUOTE: RDQ, EM_DASH } = UNICODE_SYMBOLS

const createdDirs: string[] = []

function tmpFile(content: string, name: string): string {
  const dir = mkdtempSync(join(tmpdir(), "punctilio-cli-"))
  createdDirs.push(dir)
  const path = join(dir, name)
  writeFileSync(path, content)
  return path
}

function captureIO(stdinInput: string = "", stdinAsString: boolean = false) {
  const stdoutChunks: string[] = []
  const stderrChunks: string[] = []
  const stdout = new Writable({
    write(chunk, _enc, cb) {
      stdoutChunks.push(chunk.toString())
      cb()
    },
  })
  const stderr = new Writable({
    write(chunk, _enc, cb) {
      stderrChunks.push(chunk.toString())
      cb()
    },
  })
  const chunks = stdinInput
    ? [stdinAsString ? stdinInput : Buffer.from(stdinInput)]
    : []
  const stdin = Readable.from(chunks)
  return {
    io: { stdin, stdout, stderr },
    stdout: () => stdoutChunks.join(""),
    stderr: () => stderrChunks.join(""),
  }
}

// Chdir to a tempdir for the test suite so the default --cache location
// (cwd/node_modules/.cache/punctilio/cache.json) doesn't write into the
// real project. Tests that need a specific cwd override via withTempCwd.
let suiteRoot: string
let projectCwd: string

beforeAll(() => {
  projectCwd = process.cwd()
  suiteRoot = mkdtempSync(join(tmpdir(), "punctilio-test-root-"))
  createdDirs.push(suiteRoot)
  process.chdir(suiteRoot)
})

afterEach(() => {
  clearMarkdownCache()
  clearHtmlCache()
})

afterAll(() => {
  process.chdir(projectCwd)
  for (const dir of createdDirs) rmSync(dir, { recursive: true, force: true })
})

async function withTempCwd<T>(prefix: string, fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  createdDirs.push(dir)
  const originalCwd = process.cwd()
  process.chdir(dir)
  try {
    return await fn(dir)
  } finally {
    process.chdir(originalCwd)
  }
}

describe("runCli", () => {
  it("--write formats a markdown file in place", async () => {
    const path = tmpFile('"Hello" -- world.\n', "doc.md")
    const cap = captureIO()
    const code = await runCli(["--write", path, "--no-nbsp"], cap.io)
    expect(code).toBe(0)
    expect(readFileSync(path, "utf8")).toBe(`${LDQ}Hello${RDQ}${EM_DASH}world.\n`)
    expect(cap.stdout()).toContain(`Reformatted: ${path}`)
  })

  it("without --write prints formatted output to stdout and leaves the file untouched", async () => {
    const original = '"Hello" -- world.\n'
    const path = tmpFile(original, "doc.md")
    const cap = captureIO()
    const code = await runCli([path, "--no-nbsp"], cap.io)
    expect(code).toBe(0)
    expect(readFileSync(path, "utf8")).toBe(original)
    expect(cap.stdout()).toBe(`${LDQ}Hello${RDQ}${EM_DASH}world.\n`)
  })

  it("stdout mode concatenates multiple files in argument order", async () => {
    const a = tmpFile('"a"\n', "a.md")
    const b = tmpFile('"b"\n', "b.md")
    const cap = captureIO()
    const code = await runCli([a, b, "--no-nbsp"], cap.io)
    expect(code).toBe(0)
    expect(cap.stdout()).toBe(`${LDQ}a${RDQ}\n${LDQ}b${RDQ}\n`)
  })

  it("stdout mode prints already-formatted files verbatim", async () => {
    const path = tmpFile(`${LDQ}done${RDQ}\n`, "doc.md")
    const cap = captureIO()
    const code = await runCli([path, "--no-nbsp"], cap.io)
    expect(code).toBe(0)
    expect(cap.stdout()).toBe(`${LDQ}done${RDQ}\n`)
  })

  it("--write and --check are mutually exclusive", async () => {
    const path = tmpFile('"x"\n', "doc.md")
    const cap = captureIO()
    const code = await runCli(["--write", "--check", path], cap.io)
    expect(code).toBe(2)
    expect(cap.stderr()).toContain("mutually exclusive")
  })

  it("'-' rejects --write", async () => {
    const cap = captureIO('"x"')
    const code = await runCli(["-", "--type", "md", "--write"], cap.io)
    expect(code).toBe(2)
    expect(cap.stderr()).toContain("--write cannot be used when reading from stdin")
  })

  it("--write preserves the file's missing trailing newline", async () => {
    const original = '"Already done."'
    const path = tmpFile(`${LDQ}Already done.${RDQ}`, "doc.md")
    const cap = captureIO()
    const code = await runCli(["--write", path, "--no-nbsp"], cap.io)
    expect(code).toBe(0)
    expect(readFileSync(path, "utf8")).toBe(`${LDQ}Already done.${RDQ}`)
    expect(original).toBe('"Already done."') // sanity
  })

  it("--check returns 1 and leaves the file untouched when reformatting needed", async () => {
    const original = '"Hi" -- there.\n'
    const path = tmpFile(original, "doc.md")
    const cap = captureIO()
    const code = await runCli(["--check", path, "--no-nbsp"], cap.io)
    expect(code).toBe(1)
    expect(readFileSync(path, "utf8")).toBe(original)
    expect(cap.stderr()).toContain(`Would reformat: ${path}`)
  })

  it("--check returns 0 on already-formatted file", async () => {
    const path = tmpFile(`${LDQ}Hi${RDQ}${EM_DASH}there.\n`, "doc.md")
    const cap = captureIO()
    const code = await runCli(["--check", path, "--no-nbsp"], cap.io)
    expect(code).toBe(0)
  })

  it("--write preserves CRLF line endings instead of producing mixed endings", async () => {
    const path = tmpFile('"Hello" -- world.\r\nSecond line.\r\n', "doc.md")
    const cap = captureIO()
    const code = await runCli(["--write", path, "--no-nbsp"], cap.io)
    expect(code).toBe(0)
    const written = readFileSync(path, "utf8")
    expect(written).toBe(`${LDQ}Hello${RDQ}${EM_DASH}world.\r\nSecond line.\r\n`)
    expect(written).not.toMatch(/[^\r]\n/) // no lone LF
  })

  it("--check is stable on an already-formatted CRLF file (no perpetual churn)", async () => {
    const path = tmpFile(`${LDQ}Hi${RDQ}${EM_DASH}there.\r\nDone.\r\n`, "doc.md")
    const cap = captureIO()
    const code = await runCli(["--check", path, "--no-nbsp"], cap.io)
    expect(code).toBe(0)
  })

  it("--write preserves CRLF for HTML files", async () => {
    const path = tmpFile('<p>"Hello"</p>\r\n', "page.html")
    const cap = captureIO()
    const code = await runCli(["--write", path, "--no-nbsp"], cap.io)
    expect(code).toBe(0)
    expect(readFileSync(path, "utf8")).toBe(`<p>${LDQ}Hello${RDQ}</p>\r\n`)
  })

  it("handles HTML files via .html extension", async () => {
    const path = tmpFile('<p>"Hello"</p>\n', "page.html")
    const cap = captureIO()
    const code = await runCli(["--write", path, "--no-nbsp"], cap.io)
    expect(code).toBe(0)
    expect(readFileSync(path, "utf8")).toContain(`${LDQ}Hello${RDQ}`)
  })

  it.each([".md", ".markdown", ".html", ".htm"])(
    "infers type from %s extension",
    async (ext) => {
      const path = tmpFile(ext.startsWith(".m") ? '"x"\n' : '<p>"x"</p>\n', `file${ext}`)
      const cap = captureIO()
      const code = await runCli(["--write", path, "--no-nbsp"], cap.io)
      expect(code).toBe(0)
      expect(readFileSync(path, "utf8")).toContain(`${LDQ}x${RDQ}`)
    },
  )

  it.each([
    ["md", "Dr. Smith arrived.", [] as string[], false],
    ["md", "Dr. Smith arrived.", ["--nbsp"], true],
    ["md", "Dr. Smith arrived.", ["--no-nbsp"], false],
    ["html", "<p>Dr. Smith arrived.</p>", [] as string[], true],
    ["html", "<p>Dr. Smith arrived.</p>", ["--nbsp"], true],
    ["html", "<p>Dr. Smith arrived.</p>", ["--no-nbsp"], false],
  ])("nbsp tri-state: type %s with flags %p → nbsp %p", async (type, input, flags, expectNbsp) => {
    const cap = captureIO(input)
    const code = await runCli(["-", "--type", type, ...flags], cap.io)
    expect(code).toBe(0)
    expect(cap.stdout().includes("\u00A0")).toBe(expectNbsp)
  })

  it("reads stdin when positional is '-'", async () => {
    const cap = captureIO('"Hello."')
    const code = await runCli(["-", "--type", "md", "--no-nbsp"], cap.io)
    expect(code).toBe(0)
    expect(cap.stdout()).toContain(`${LDQ}Hello.${RDQ}`)
  })

  it("reads stdin when --stdin-filepath is set (no positional)", async () => {
    const cap = captureIO('"Hello."')
    const code = await runCli(["--stdin-filepath", "doc.md", "--no-nbsp"], cap.io)
    expect(code).toBe(0)
    expect(cap.stdout()).toContain(`${LDQ}Hello.${RDQ}`)
  })

  it("--stdin-filepath infers type from extension", async () => {
    const cap = captureIO('<p>"Hello"</p>')
    const code = await runCli(["--stdin-filepath", "page.html", "--no-nbsp"], cap.io)
    expect(code).toBe(0)
    expect(cap.stdout()).toContain(`${LDQ}Hello${RDQ}`)
  })

  it("handles string-typed stdin chunks", async () => {
    const cap = captureIO('"Hello."', /* stdinAsString */ true)
    const code = await runCli(["-", "--type", "md", "--no-nbsp"], cap.io)
    expect(code).toBe(0)
    expect(cap.stdout()).toContain(`${LDQ}Hello.${RDQ}`)
  })

  it("--stdin --check returns 1 when input would change", async () => {
    const cap = captureIO('"Hello."')
    const code = await runCli(
      ["-", "--type", "md", "--check", "--no-nbsp"],
      cap.io,
    )
    expect(code).toBe(1)
  })

  it("--stdin --check returns 0 when input is already clean", async () => {
    const cap = captureIO(`${LDQ}Hello.${RDQ}`)
    const code = await runCli(
      ["-", "--type", "md", "--check", "--no-nbsp"],
      cap.io,
    )
    expect(code).toBe(0)
  })

  it("'-' rejects file arguments alongside it", async () => {
    const path = tmpFile("x", "doc.md")
    const cap = captureIO("x")
    const code = await runCli(["-", "--type", "md", path], cap.io)
    expect(code).toBe(2)
    expect(cap.stderr()).toContain("cannot be combined")
  })

  it("'-' without --type or --stdin-filepath errors", async () => {
    const cap = captureIO("x")
    const code = await runCli(["-"], cap.io)
    expect(code).toBe(2)
    expect(cap.stderr()).toMatch(/--type/)
  })

  it("errors when no positional and no stdin signal", async () => {
    const cap = captureIO()
    const code = await runCli([], cap.io)
    expect(code).toBe(2)
    expect(cap.stderr()).toMatch(/Usage:/)
  })

  it("--help prints help and returns 0", async () => {
    const cap = captureIO()
    const code = await runCli(["--help"], cap.io)
    expect(code).toBe(0)
    expect(cap.stdout()).toMatch(/Usage:/)
  })

  it("--version prints a non-empty version and returns 0", async () => {
    const cap = captureIO()
    const code = await runCli(["--version"], cap.io)
    expect(code).toBe(0)
    expect(cap.stdout().trim().length).toBeGreaterThan(0)
  })

  it("rejects unknown file extensions without --type", async () => {
    const path = tmpFile("text", "file.txt")
    const cap = captureIO()
    const code = await runCli([path], cap.io)
    expect(code).toBe(2)
    expect(cap.stderr()).toMatch(/Cannot infer file type/)
  })

  it("respects --type override for unknown extensions", async () => {
    const path = tmpFile('"Hello."\n', "file.txt")
    const cap = captureIO()
    const code = await runCli(["--write", "--type", "md", "--no-nbsp", path], cap.io)
    expect(code).toBe(0)
    expect(readFileSync(path, "utf8")).toContain(`${LDQ}Hello.${RDQ}`)
  })

  it("rejects invalid --type values", async () => {
    const path = tmpFile("x", "file.txt")
    const cap = captureIO()
    const code = await runCli(["--type", "rtf", path], cap.io)
    expect(code).toBe(2)
    expect(cap.stderr()).toContain("--type")
    expect(cap.stderr()).toMatch(/invalid/i)
  })

  it.each([
    ["punctuation-style", "german"],
    ["dash-style", "british"],
    ["emphasis-marker", "_"],
    ["strong-marker", "_"],
    ["bullet-marker", "*"],
    ["rule-marker", "*"],
  ])("accepts valid --%s=%s", async (flag, value) => {
    const path = tmpFile("Hi.\n", "doc.md")
    const cap = captureIO()
    const code = await runCli([`--${flag}`, value, "--no-nbsp", path], cap.io)
    expect(code).toBe(0)
  })

  it.each([
    ["punctuation-style", "klingon"],
    ["dash-style", "swedish"],
    ["emphasis-marker", "$"],
    ["strong-marker", "$"],
    ["bullet-marker", "@"],
    ["rule-marker", "@"],
  ])("rejects invalid --%s=%s", async (flag, value) => {
    const path = tmpFile("x\n", "doc.md")
    const cap = captureIO()
    const code = await runCli([`--${flag}`, value, path], cap.io)
    expect(code).toBe(2)
    expect(cap.stderr()).toContain(`--${flag}`)
    expect(cap.stderr()).toMatch(/invalid/i)
  })

  it("applies --punctuation-style british", async () => {
    const cap = captureIO('"Hello."')
    const code = await runCli(
      ["-", "--type", "md", "--punctuation-style", "british", "--no-nbsp"],
      cap.io,
    )
    expect(code).toBe(0)
    expect(cap.stdout()).toContain(`${LDQ}Hello${RDQ}.`)
  })

  it("--fractions enables fraction transforms", async () => {
    const cap = captureIO("Add 1/2 cup.")
    const code = await runCli(
      ["-", "--type", "md", "--fractions", "--no-nbsp"],
      cap.io,
    )
    expect(code).toBe(0)
    expect(cap.stdout()).toContain(UNICODE_SYMBOLS.FRACTION_1_2)
  })

  it("--degrees enables degree transforms", async () => {
    const cap = captureIO("It is 20 C today.")
    const code = await runCli(
      ["-", "--type", "md", "--degrees", "--no-nbsp"],
      cap.io,
    )
    expect(code).toBe(0)
    expect(cap.stdout()).toContain("°C")
  })

  it("--superscript enables superscript ordinals", async () => {
    const cap = captureIO("1st place")
    const code = await runCli(
      ["-", "--type", "md", "--superscript", "--no-nbsp"],
      cap.io,
    )
    expect(code).toBe(0)
    expect(cap.stdout()).toContain("1ˢᵗ")
  })

  it("--ligatures enables punctuation ligatures", async () => {
    const cap = captureIO("Wait!?")
    const code = await runCli(
      ["-", "--type", "md", "--ligatures", "--no-nbsp"],
      cap.io,
    )
    expect(code).toBe(0)
    expect(cap.stdout()).toContain("⁉")
  })

  it("--no-symbols disables symbol transforms", async () => {
    const cap = captureIO("Wait... done.")
    const code = await runCli(
      ["-", "--type", "md", "--no-symbols", "--no-nbsp"],
      cap.io,
    )
    expect(code).toBe(0)
    expect(cap.stdout()).not.toContain(UNICODE_SYMBOLS.ELLIPSIS)
  })

  it("--no-arrows disables arrow transforms", async () => {
    const cap = captureIO("Go -> back")
    const code = await runCli(
      ["-", "--type", "md", "--no-arrows", "--no-nbsp"],
      cap.io,
    )
    expect(code).toBe(0)
    expect(cap.stdout()).toContain("->")
  })

  it("--no-collapse-spaces preserves multiple spaces", async () => {
    const cap = captureIO("two  spaces.")
    const code = await runCli(
      ["-", "--type", "md", "--no-collapse-spaces", "--no-nbsp"],
      cap.io,
    )
    expect(code).toBe(0)
    expect(cap.stdout()).toContain("two  spaces")
  })

  it("--skip-tag is repeatable for HTML", async () => {
    const path = tmpFile('<p>"a"</p><aside>"b"</aside>\n', "page.html")
    const cap = captureIO()
    const code = await runCli(
      ["--write", "--skip-tag", "aside", "--no-nbsp", path],
      cap.io,
    )
    expect(code).toBe(0)
    const out = readFileSync(path, "utf8")
    expect(out).toContain(`${LDQ}a${RDQ}`)
    expect(out).toContain('"b"')
  })

  it("--skip-class is honored for HTML", async () => {
    const path = tmpFile('<p>"a"</p><div class="raw">"b"</div>\n', "page.html")
    const cap = captureIO()
    const code = await runCli(
      ["--write", "--skip-class", "raw", "--no-nbsp", path],
      cap.io,
    )
    expect(code).toBe(0)
    const out = readFileSync(path, "utf8")
    expect(out).toContain(`${LDQ}a${RDQ}`)
    expect(out).toContain('"b"')
  })

  it("--no-fragment parses input as a full document", async () => {
    const path = tmpFile(
      '<!DOCTYPE html><html><body><p>"Hi"</p></body></html>\n',
      "page.html",
    )
    const cap = captureIO()
    const code = await runCli(["--write", "--no-fragment", "--no-nbsp", path], cap.io)
    expect(code).toBe(0)
    expect(readFileSync(path, "utf8")).toContain(`${LDQ}Hi${RDQ}`)
  })

  it("processes multiple files and reports each that changed", async () => {
    const a = tmpFile('"a"\n', "a.md")
    const b = tmpFile(`${LDQ}b${RDQ}\n`, "b.md")
    const cap = captureIO()
    const code = await runCli(["--write", "--no-nbsp", a, b], cap.io)
    expect(code).toBe(0)
    expect(cap.stdout()).toContain(`Reformatted: ${a}`)
    expect(cap.stdout()).not.toContain(`Reformatted: ${b}`)
  })

  it("returns 2 on unknown flag", async () => {
    const cap = captureIO()
    const code = await runCli(["--bogus"], cap.io)
    expect(code).toBe(2)
    expect(cap.stderr()).toMatch(/unknown option/i)
  })

  it("cache writes a cache file and skips unchanged files on the second run", async () => {
    await withTempCwd("punctilio-cache-", async (dir) => {
      writeFileSync(join(dir, "doc.md"), '"Hello."\n')
      const cacheLocation = join(dir, "cache.json")
      const args = ["--write", "doc.md", "--cache-location", cacheLocation, "--no-nbsp"]

      const first = captureIO()
      expect(await runCli(args, first.io)).toBe(0)
      expect(first.stdout()).toContain("Reformatted")
      expect(existsSync(cacheLocation)).toBe(true)

      const second = captureIO()
      expect(await runCli(args, second.io)).toBe(0)
      expect(second.stdout()).not.toContain("Reformatted")
    })
  })

  it("cache without --cache-location uses the default location under cwd", async () => {
    await withTempCwd("punctilio-cache-default-", async (dir) => {
      writeFileSync(join(dir, "doc.md"), '"Hello."\n')
      const cap = captureIO()
      expect(await runCli(["--write", "doc.md", "--no-nbsp"], cap.io)).toBe(0)
      expect(existsSync(join(dir, "node_modules", ".cache", "punctilio", "cache.json"))).toBe(true)
    })
  })

  it("cache invalidates when options change", async () => {
    await withTempCwd("punctilio-cache-opts-", async (dir) => {
      writeFileSync(join(dir, "doc.md"), `${LDQ}Hello.${RDQ}\n`)
      const cacheLocation = join(dir, "cache.json")
      const baseArgs = ["--write", "doc.md", "--cache-location", cacheLocation, "--no-nbsp"]

      const first = captureIO()
      await runCli(baseArgs, first.io)

      const second = captureIO()
      expect(await runCli([...baseArgs, "--punctuation-style", "british"], second.io)).toBe(0)
      expect(second.stdout()).toContain("Reformatted")
    })
  })

  it.each([
    ["recovers gracefully from a corrupt cache file", "{not valid json", /could not be parsed/],
    ["ignores a JSON cache file missing the `files` key", "{}", /missing the "files" key/],
  ])("cache %s", async (_label, seedContent, expectedWarning) => {
    await withTempCwd("punctilio-cache-bad-", async (dir) => {
      writeFileSync(join(dir, "doc.md"), '"Hello."\n')
      const cacheLocation = join(dir, "cache.json")
      writeFileSync(cacheLocation, seedContent)

      const cap = captureIO()
      expect(await runCli(["--write", "doc.md", "--cache-location", cacheLocation, "--no-nbsp"], cap.io)).toBe(0)
      expect(cap.stdout()).toContain("Reformatted")
      expect(cap.stderr()).toMatch(expectedWarning)
    })
  })

  it("cache silently drops absolute-path keys carried over from older versions", async () => {
    await withTempCwd("punctilio-cache-migrate-", async (dir) => {
      writeFileSync(join(dir, "doc.md"), `${LDQ}Hello.${RDQ}\n`)
      const cacheLocation = join(dir, "cache.json")
      // Seed the cache with a stale absolute-path entry that no modern
      // lookup could ever hit.
      writeFileSync(
        cacheLocation,
        JSON.stringify({
          files: {
            [join("/", "stale", "absolute", "doc.md")]: {
              contentHash: "deadbeef00000000",
              optionsHash: "deadbeef00000000",
              version: "0.0.0",
            },
          },
        }),
      )

      const cap = captureIO()
      expect(await runCli(["--write", "doc.md", "--cache-location", cacheLocation, "--no-nbsp"], cap.io)).toBe(0)
      expect(cap.stderr()).toBe("") // silent migration

      const parsed = JSON.parse(readFileSync(cacheLocation, "utf8")) as {
        files: Record<string, unknown>
      }
      const keys = Object.keys(parsed.files)
      expect(keys).toContain("doc.md")
      for (const key of keys) expect(key.startsWith("/")).toBe(false)
    })
  })

  it("cache keys are cwd-relative so cache survives a project move", async () => {
    // The visible "Reformatted" output is the same whether the cache hit
    // or missed (a miss still re-transforms to an unchanged result and
    // skips the rewrite), so neither stdout nor file mtime distinguishes
    // the two code paths. Inspect the cache file directly instead.
    await withTempCwd("punctilio-cache-portable-src-", async (srcDir) => {
      writeFileSync(join(srcDir, "doc.md"), '"Hello."\n')
      const cacheLocation = join(srcDir, "cache.json")
      const args = ["--write", "doc.md", "--cache-location", cacheLocation, "--no-nbsp"]

      expect(await runCli(args, captureIO().io)).toBe(0)
      const parsed = JSON.parse(readFileSync(cacheLocation, "utf8")) as {
        files: Record<string, unknown>
      }
      expect(Object.keys(parsed.files)).toEqual(["doc.md"])
      for (const key of Object.keys(parsed.files)) {
        expect(key.startsWith("/")).toBe(false)
        expect(key.includes(srcDir)).toBe(false)
      }
    })
  })

  it("--no-cache disables the cache (no cache file written)", async () => {
    await withTempCwd("punctilio-no-cache-", async (dir) => {
      writeFileSync(join(dir, "doc.md"), '"Hello."\n')
      const cap = captureIO()
      expect(await runCli(["--write", "doc.md", "--no-cache", "--no-nbsp"], cap.io)).toBe(0)
      expect(existsSync(join(dir, "node_modules", ".cache", "punctilio", "cache.json"))).toBe(false)
    })
  })

  it("stdout mode skips the cache entirely (no cache file, warm cache still prints)", async () => {
    await withTempCwd("punctilio-stdout-cache-", async (dir) => {
      writeFileSync(join(dir, "doc.md"), '"Hello."\n')
      const cacheLocation = join(dir, "cache.json")
      // Warm the cache via --write, then confirm stdout mode still prints
      // full content (a cache hit would otherwise skip the file).
      expect(await runCli(["--write", "doc.md", "--cache-location", cacheLocation, "--no-nbsp"], captureIO().io)).toBe(0)
      const cap = captureIO()
      expect(await runCli(["doc.md", "--cache-location", cacheLocation, "--no-nbsp"], cap.io)).toBe(0)
      expect(cap.stdout()).toBe(`${LDQ}Hello.${RDQ}\n`)
      // And a fresh stdout-mode run never creates the default cache file.
      expect(existsSync(join(dir, "node_modules", ".cache", "punctilio", "cache.json"))).toBe(false)
    })
  })

  it("cache caches no-op (idempotent) files too, then skips them next run", async () => {
    await withTempCwd("punctilio-cache-noop-", async (dir) => {
      writeFileSync(join(dir, "doc.md"), `${LDQ}Hello.${RDQ}\n`)
      const cacheLocation = join(dir, "cache.json")
      const args = ["--write", "doc.md", "--cache-location", cacheLocation, "--no-nbsp"]

      const first = captureIO()
      await runCli(args, first.io)
      const second = captureIO()
      expect(await runCli(args, second.io)).toBe(0)
      expect(second.stdout()).not.toContain("Reformatted")
    })
  })

  it("propagates unexpected errors instead of swallowing them", async () => {
    const cap = captureIO()
    await expect(
      runCli(["/does/not/exist.md", "--no-nbsp"], cap.io),
    ).rejects.toThrow(/ENOENT/)
  })

  it("loads transform options from --config <path>", async () => {
    const configPath = tmpFile(
      JSON.stringify({ punctuationStyle: "british", nbsp: false }),
      ".punctiliorc.json",
    )
    const cap = captureIO('"Hello."')
    const code = await runCli(["-", "--type", "md", "--config", configPath], cap.io)
    expect(code).toBe(0)
    expect(cap.stdout()).toContain(`${LDQ}Hello${RDQ}.`)
  })

  it("CLI flags override config-file values", async () => {
    const configPath = tmpFile(
      JSON.stringify({ punctuationStyle: "british", nbsp: false }),
      ".punctiliorc.json",
    )
    const cap = captureIO('"Hello."')
    const code = await runCli(
      ["-", "--type", "md", "--config", configPath, "--punctuation-style", "american"],
      cap.io,
    )
    expect(code).toBe(0)
    expect(cap.stdout()).toContain(`${LDQ}Hello.${RDQ}`)
  })

  it("expands glob patterns and respects .punctilioignore", async () => {
    await withTempCwd("punctilio-glob-", async (dir) => {
      writeFileSync(join(dir, "a.md"), '"a"\n')
      writeFileSync(join(dir, "b.md"), '"b"\n')
      writeFileSync(join(dir, ".punctilioignore"), "b.md\n")

      const cap = captureIO()
      expect(await runCli(["--write", "*.md", "--no-nbsp"], cap.io)).toBe(0)
      expect(readFileSync(join(dir, "a.md"), "utf8")).toContain(`${LDQ}a${RDQ}`)
      expect(readFileSync(join(dir, "b.md"), "utf8")).toBe('"b"\n')
    })
  })

  it("deduplicates files when a literal path also matches a glob", async () => {
    await withTempCwd("punctilio-dedup-", async (dir) => {
      writeFileSync(join(dir, "a.md"), '"a"\n')
      const cap = captureIO()
      expect(await runCli(["--write", "a.md", "*.md", "--no-nbsp"], cap.io)).toBe(0)
      const out = cap.stdout()
      const reformatted = out.split("\n").filter((l) => l.includes("Reformatted"))
      expect(reformatted).toHaveLength(1)
    })
  })

  it("--ignore-path overrides the default .punctilioignore lookup", async () => {
    await withTempCwd("punctilio-ignore-", async (dir) => {
      writeFileSync(join(dir, "a.md"), '"a"\n')
      writeFileSync(join(dir, "b.md"), '"b"\n')
      const customIgnore = join(dir, "custom.ignore")
      writeFileSync(customIgnore, "a.md\n")

      const cap = captureIO()
      expect(await runCli(["--write", "*.md", "--ignore-path", customIgnore, "--no-nbsp"], cap.io)).toBe(0)
      expect(readFileSync(join(dir, "a.md"), "utf8")).toBe('"a"\n')
      expect(readFileSync(join(dir, "b.md"), "utf8")).toContain(`${LDQ}b${RDQ}`)
    })
  })

  it("rejects a config file containing an unknown option key", async () => {
    const configPath = tmpFile(
      JSON.stringify({ fraction: true }), // typo of "fractions"
      ".punctiliorc.json",
    )
    const cap = captureIO('"Hello."')
    const code = await runCli(["-", "--type", "md", "--config", configPath], cap.io)
    expect(code).toBe(2)
    expect(cap.stderr()).toContain('Unknown option "fraction"')
    expect(cap.stderr()).toContain(configPath)
    expect(cap.stderr()).toContain("Valid options:")
  })

  it("a config mixing markdown-only and html-only keys formats both file types", async () => {
    const configPath = tmpFile(
      JSON.stringify({
        emphasisMarker: "_", // markdown-only
        skipTags: ["aside"], // html-only
        fragment: true, // html-only
        nbsp: false,
      }),
      ".punctiliorc.json",
    )
    const md = tmpFile('*hi* and "quote"\n', "doc.md")
    const html = tmpFile('<p>"a"</p><aside>"b"</aside>\n', "page.html")
    const cap = captureIO()
    const code = await runCli(["--write", "--config", configPath, md, html], cap.io)
    expect(code).toBe(0)
    expect(readFileSync(md, "utf8")).toContain(`_hi_ and ${LDQ}quote${RDQ}`)
    const htmlOut = readFileSync(html, "utf8")
    expect(htmlOut).toContain(`${LDQ}a${RDQ}`)
    expect(htmlOut).toContain('"b"')
  })

  it("treats a positional with glob metacharacters as a literal when the file exists", async () => {
    await withTempCwd("punctilio-literal-glob-", async (dir) => {
      writeFileSync(join(dir, "note[1].md"), '"x"\n')
      const cap = captureIO()
      expect(await runCli(["--write", "note[1].md", "--no-nbsp"], cap.io)).toBe(0)
      expect(readFileSync(join(dir, "note[1].md"), "utf8")).toContain(`${LDQ}x${RDQ}`)
      expect(cap.stderr()).toBe("")
    })
  })

  // pre-commit passes every staged file by name, so the ignore file must
  // apply to explicit paths too, not only to glob expansions.
  it("skips an explicitly named file that .punctilioignore lists", async () => {
    await withTempCwd("punctilio-explicit-ignored-", async (dir) => {
      writeFileSync(join(dir, "a.md"), '"a"\n')
      writeFileSync(join(dir, "b.md"), '"b"\n')
      writeFileSync(join(dir, ".punctilioignore"), "b.md\n")
      const cap = captureIO()
      expect(await runCli(["--write", "a.md", "b.md", "--no-nbsp"], cap.io)).toBe(0)
      expect(readFileSync(join(dir, "a.md"), "utf8")).toBe(`${LDQ}a${RDQ}\n`)
      expect(readFileSync(join(dir, "b.md"), "utf8")).toBe('"b"\n')
    })
  })

  it.each([
    ["--write", ["--write"]],
    ["--check", ["--check"]],
    ["stdout mode", []],
    ["--write with a matching literal path alongside", ["--write", "a.md"]],
    ["--write with a matching glob alongside", ["--write", "*.md"]],
  ])("exits 2 without touching files when a glob matches nothing (%s)", async (_label, args) => {
    await withTempCwd("punctilio-glob-empty-", async (dir) => {
      writeFileSync(join(dir, "a.md"), '"a"\n')
      const cap = captureIO()
      expect(await runCli([...args, "*.html", "--no-nbsp"], cap.io)).toBe(2)
      expect(cap.stderr()).toBe("Error: no files matched: *.html\n")
      expect(cap.stdout()).toBe("")
      expect(readFileSync(join(dir, "a.md"), "utf8")).toBe('"a"\n')
    })
  })

  it.each([
    ["one unmatched glob after a matching one", ["*.md", "*.htlm"], "*.htlm"],
    ["one unmatched glob before a matching one", ["*.htlm", "*.md"], "*.htlm"],
    ["every unmatched glob", ["*.nope", "*.md", "*.htlm"], "*.nope *.htlm"],
    ["a glob whose matches are all negated", ["*.md", "!a.*"], "*.md"],
    ["only negated globs", ["!a.*"], "!a.*"],
  ])("exits 2 naming each glob that matches nothing, before writing (%s)", async (_label, patterns, unmatched) => {
    await withTempCwd("punctilio-glob-each-", async (dir) => {
      writeFileSync(join(dir, "a.md"), '"a"\n')
      const cap = captureIO()
      expect(await runCli(["--write", "--no-nbsp", ...patterns], cap.io)).toBe(2)
      expect(cap.stderr()).toBe(`Error: no files matched: ${unmatched}\n`)
      expect(readFileSync(join(dir, "a.md"), "utf8")).toBe('"a"\n')
    })
  })

  it("excludes files matched by a negated glob", async () => {
    await withTempCwd("punctilio-glob-negated-", async (dir) => {
      writeFileSync(join(dir, "a.md"), '"a"\n')
      writeFileSync(join(dir, "b.md"), '"b"\n')
      expect(await runCli(["--write", "--no-nbsp", "*.md", "!b.*"], captureIO().io)).toBe(0)
      expect(readFileSync(join(dir, "a.md"), "utf8")).toBe(`${LDQ}a${RDQ}\n`)
      expect(readFileSync(join(dir, "b.md"), "utf8")).toBe('"b"\n')
    })
  })

  it("warns about only the glob whose matches are all ignored", async () => {
    await withTempCwd("punctilio-glob-one-ignored-", async (dir) => {
      mkdirSync(join(dir, "skipped"))
      writeFileSync(join(dir, "skipped", "s.md"), '"s"\n')
      writeFileSync(join(dir, "a.md"), '"a"\n')
      writeFileSync(join(dir, ".punctilioignore"), "skipped/\n")
      const cap = captureIO()
      expect(await runCli(["--write", "--no-nbsp", "*.md", "skipped/*.md"], cap.io)).toBe(0)
      expect(cap.stderr()).toBe("Warning: every file matched by skipped/*.md is ignored\n")
      expect(readFileSync(join(dir, "a.md"), "utf8")).toBe(`${LDQ}a${RDQ}\n`)
    })
  })

  it("warns when a glob matches only ignored files", async () => {
    await withTempCwd("punctilio-glob-all-ignored-", async (dir) => {
      writeFileSync(join(dir, "a.md"), '"a"\n')
      writeFileSync(join(dir, ".punctilioignore"), "*.md\n")
      const cap = captureIO()
      expect(await runCli(["--write", "*.md", "--no-nbsp"], cap.io)).toBe(0)
      expect(cap.stderr()).toBe("Warning: every file matched by *.md is ignored\n")
      expect(readFileSync(join(dir, "a.md"), "utf8")).toBe('"a"\n')
    })
  })

  it.each(["node_modules", ".git"])("glob expansion skips files under %s", async (skippedDir) => {
    await withTempCwd("punctilio-glob-default-ignores-", async (dir) => {
      mkdirSync(join(dir, skippedDir, "pkg"), { recursive: true })
      writeFileSync(join(dir, skippedDir, "pkg", "readme.md"), '"dep"\n')
      writeFileSync(join(dir, "a.md"), '"a"\n')
      const cap = captureIO()
      expect(await runCli(["--write", "--no-cache", "**/*.md", "--no-nbsp"], cap.io)).toBe(0)
      expect(readFileSync(join(dir, "a.md"), "utf8")).toBe(`${LDQ}a${RDQ}\n`)
      expect(readFileSync(join(dir, skippedDir, "pkg", "readme.md"), "utf8")).toBe('"dep"\n')
    })
  })

  it("cache invalidates when the resolved file type changes across runs", async () => {
    await withTempCwd("punctilio-cache-type-", async (dir) => {
      writeFileSync(join(dir, "file.txt"), '"x"\n')
      const cacheLocation = join(dir, "cache.json")
      const readType = () =>
        (JSON.parse(readFileSync(cacheLocation, "utf8")) as {
          files: Record<string, { type: string }>
        }).files["file.txt"].type

      expect(await runCli(
        ["--write", "file.txt", "--type", "md", "--cache-location", cacheLocation, "--no-nbsp"],
        captureIO().io,
      )).toBe(0)
      expect(readType()).toBe("md")

      // Same content and options, only --type differs: a type-agnostic cache
      // key would stale-hit and never re-record the entry as html.
      expect(await runCli(
        ["--write", "file.txt", "--type", "html", "--cache-location", cacheLocation, "--no-nbsp"],
        captureIO().io,
      )).toBe(0)
      expect(readType()).toBe("html")
    })
  })

  it("--write leaves no leftover temp file behind", async () => {
    await withTempCwd("punctilio-atomic-", async (dir) => {
      writeFileSync(join(dir, "doc.md"), '"Hello."\n')
      expect(await runCli(["--write", "doc.md", "--no-nbsp"], captureIO().io)).toBe(0)
      expect(readFileSync(join(dir, "doc.md"), "utf8")).toContain(`${LDQ}Hello.${RDQ}`)
      expect(readdirSync(dir).some((name) => name.includes(".tmp"))).toBe(false)
    })
  })

  it("--no-config skips config-file loading", async () => {
    const configPath = tmpFile(
      JSON.stringify({ punctuationStyle: "british", nbsp: false }),
      ".punctiliorc.json",
    )
    const cap = captureIO('"Hello."')
    const code = await runCli(
      ["-", "--type", "md", "--config", configPath, "--no-config", "--no-nbsp"],
      cap.io,
    )
    expect(code).toBe(0)
    expect(cap.stdout()).toContain(`${LDQ}Hello.${RDQ}`)
  })

  it("rejects --stdin-filepath combined with file arguments", async () => {
    const path = tmpFile('"x"\n', "doc.md")
    const cap = captureIO('"y"')
    const code = await runCli(["--stdin-filepath", "doc.md", path], cap.io)
    expect(code).toBe(2)
    expect(cap.stderr()).toBe("Error: --stdin-filepath cannot be combined with file arguments.\n")
    expect(cap.stdout()).toBe("")
  })

  it("validates every file's type before writing any of them", async () => {
    await withTempCwd("punctilio-unknown-ext-", async (dir) => {
      writeFileSync(join(dir, "a.md"), '"a"\n')
      writeFileSync(join(dir, "notes.txt"), '"b"\n')
      const cap = captureIO()
      expect(await runCli(["--write", "a.md", "notes.txt", "--no-nbsp"], cap.io)).toBe(2)
      expect(cap.stderr()).toMatch(/Cannot infer file type from extension ".txt"/)
      expect(readFileSync(join(dir, "a.md"), "utf8")).toBe('"a"\n')
    })
  })

  it.each([
    ["nbsp", "false", "a boolean"],
    ["fragment", 0, "a boolean"],
    ["skipTags", "code", "an array of strings"],
    ["skipClasses", ["raw", 1], "an array of strings"],
    ["punctuationStyle", "klingon", `one of ${["american", "british", "german", "french", "none"].join(", ")}`],
    ["dashStyle", true, "one of american, british, none"],
    ["emphasisMarker", "$", "one of *, _"],
    ["bulletMarker", "@", "one of -, *, +"],
    ["ruleMarker", null, "one of -, *, _"],
    ["shouldSkipText", "yes", "a function"],
  ])("rejects a config file whose %s has the wrong type (%p)", async (key, value, expected) => {
    const configPath = tmpFile(JSON.stringify({ [key]: value }), ".punctiliorc.json")
    const cap = captureIO('"Hello."')
    const code = await runCli(["-", "--type", "md", "--config", configPath], cap.io)
    expect(code).toBe(2)
    expect(cap.stderr()).toBe(
      `Error: Invalid value for "${key}" in config file ${configPath}: expected ${expected}, got ${JSON.stringify(value)}.\n`,
    )
    expect(cap.stdout()).toBe("")
  })

  it("treats a config key set to undefined as unset", async () => {
    const configPath = tmpFile("module.exports = { punctuationStyle: undefined, nbsp: false }", ".punctiliorc.cjs")
    const cap = captureIO('"Hello."')
    expect(await runCli(["-", "--type", "md", "--config", configPath], cap.io)).toBe(0)
    expect(cap.stdout()).toBe(`${LDQ}Hello.${RDQ}`)
  })

  it.each([["an array", "[]"], ["a string", '"nbsp"']])(
    "rejects a config file that is %s rather than an object",
    async (_label, contents) => {
      const configPath = tmpFile(contents, ".punctiliorc.json")
      const cap = captureIO('"Hello."')
      const code = await runCli(["-", "--type", "md", "--config", configPath], cap.io)
      expect(code).toBe(2)
      expect(cap.stderr()).toBe(`Error: config file ${configPath} must contain an object of options.\n`)
    },
  )

  it.each([
    ["md file", "file", "md", '\uFEFF"Hello" -- world.\n', `\uFEFF${LDQ}Hello${RDQ}${EM_DASH}world.\n`],
    ["html file", "file", "html", '\uFEFF<p>"Hello"</p>\n', `\uFEFF<p>${LDQ}Hello${RDQ}</p>\n`],
    ["md stdin", "stdin", "md", '\uFEFF"Hello" -- world.\n', `\uFEFF${LDQ}Hello${RDQ}${EM_DASH}world.\n`],
  ])("preserves a leading UTF-8 BOM (%s)", async (_label, source, type, input, expected) => {
    if (source === "stdin") {
      const cap = captureIO(input)
      expect(await runCli(["-", "--type", type, "--no-nbsp"], cap.io)).toBe(0)
      expect(cap.stdout()).toBe(expected)
      return
    }
    const path = tmpFile(input, `doc.${type}`)
    expect(await runCli(["--write", "--no-cache", path, "--no-nbsp"], captureIO().io)).toBe(0)
    expect(readFileSync(path, "utf8")).toBe(expected)
    const check = captureIO()
    expect(await runCli(["--check", "--no-cache", path, "--no-nbsp"], check.io)).toBe(0)
  })

  // The parser drops whitespace after a bare doctype, so the output lacks the
  // newline the source ended with.
  it.each([["\n"], ["\r\n"]])("--write restores the final line ending a document's output lacks (%j)", async (eol) => {
    const path = tmpFile(`<!DOCTYPE html>${eol}`, "page.html")
    expect(await runCli(["--write", "--no-cache", path], captureIO().io)).toBe(0)
    expect(readFileSync(path, "utf8")).toBe(`<!doctype html><html><head></head><body></body></html>${eol}`)
  })

  it("--write updates a symlink's target and keeps the symlink", async () => {
    await withTempCwd("punctilio-symlink-", async (dir) => {
      mkdirSync(join(dir, "real"))
      const target = join(dir, "real", "doc.md")
      writeFileSync(target, '"Hello."\n')
      symlinkSync(join("real", "doc.md"), join(dir, "link.md"))
      expect(await runCli(["--write", "--no-cache", "link.md", "--no-nbsp"], captureIO().io)).toBe(0)
      expect(lstatSync(join(dir, "link.md")).isSymbolicLink()).toBe(true)
      expect(readFileSync(target, "utf8")).toBe(`${LDQ}Hello.${RDQ}\n`)
      expect(readdirSync(join(dir, "real"))).toEqual(["doc.md"])
    })
  })

  it.each([0o600, 0o755])("--write preserves file mode %o", async (mode) => {
    const path = tmpFile('"Hello."\n', "doc.md")
    chmodSync(path, mode)
    // Windows cannot set POSIX permission bits, so compare against what the
    // platform reports rather than the requested mode.
    const modeBeforeWrite = statSync(path).mode & 0o777
    expect(await runCli(["--write", "--no-cache", path, "--no-nbsp"], captureIO().io)).toBe(0)
    expect(readFileSync(path, "utf8")).toBe(`${LDQ}Hello.${RDQ}\n`)
    expect(statSync(path).mode & 0o777).toBe(modeBeforeWrite)
  })

  const FULL_DOCUMENT_HEAD = '<!DOCTYPE html>\n<html lang="en">\n<head><title>T</title></head>\n<body class="page">'
  it.each([
    ["LF with a trailing newline", "\n", "\n"],
    ["CRLF with a trailing newline", "\r\n", "\r\n"],
    ["LF without a trailing newline", "\n", ""],
    ["CRLF without a trailing newline", "\r\n", ""],
  ])("--write keeps a full HTML document's structure and trailing newline (%s)", async (_label, eol, finalEol) => {
    const source = `${FULL_DOCUMENT_HEAD}<p>"Hi" -- there</p></body>\n</html>`.replace(/\n/g, eol) + finalEol
    const path = tmpFile(source, "page.html")
    expect(await runCli(["--write", "--no-cache", path, "--no-nbsp"], captureIO().io)).toBe(0)
    const expected = (
      `<!doctype html><html lang="en"><head><title>T</title></head>\n<body class="page"><p>${LDQ}Hi${RDQ}${EM_DASH}there</p>\n</body></html>`
    ).replace(/\n/g, eol) + finalEol
    expect(readFileSync(path, "utf8")).toBe(expected)
    // A second run must be a no-op: the trailing newline cannot migrate into <body>.
    const check = captureIO()
    expect(await runCli(["--check", "--no-cache", path, "--no-nbsp"], check.io)).toBe(0)
  })
})

describe("atomicWriteFile", () => {
  it("removes its temp file when the final rename fails", async () => {
    const dir = mkdtempSync(join(tmpdir(), "punctilio-atomic-"))
    createdDirs.push(dir)
    // A directory target lets the temp file be written but makes the rename fail.
    const target = join(dir, "target")
    mkdirSync(target)
    await expect(atomicWriteFile(target, "x")).rejects.toThrow()
    expect(readdirSync(dir)).toEqual(["target"])
  })
})

describe("isMainModule", () => {
  let dir: string
  let modulePath: string

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "punctilio-main-"))
    createdDirs.push(dir)
    modulePath = join(dir, "cli.js")
    writeFileSync(modulePath, "")
    writeFileSync(join(dir, "other.js"), "")
    symlinkSync(modulePath, join(dir, "punctilio"))
  })

  it.each([
    ["the module's own path", true, () => modulePath],
    ["a symlink to the module (npm bin link)", true, () => join(dir, "punctilio")],
    ["a different file", false, () => join(dir, "other.js")],
    ["a path that does not exist", false, () => join(dir, "missing.js")],
    ["no entry script", false, () => undefined],
  ])("given %s → %p", (_label, expected, entryPath) => {
    expect(isMainModule(pathToFileURL(modulePath).href, entryPath())).toBe(expected)
  })

  it("fails loudly on an entry path it cannot resolve for a reason other than absence", () => {
    const loop = join(dir, "loop")
    symlinkSync(loop, loop)
    expect(() => isMainModule(pathToFileURL(modulePath).href, loop)).toThrow(/ELOOP/)
  })

  it("runs the CLI when invoked through a symlink", () => {
    const projectRoot = resolve(fileURLToPath(new URL(".", import.meta.url)), "../..")
    const link = join(dir, "punctilio-src")
    symlinkSync(join(projectRoot, "src", "cli.ts"), link)
    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", link, "-", "--type", "md", "--no-config"],
      { cwd: projectRoot, encoding: "utf8", input: '"Hi" -- x\n' },
    )
    expect(result.stderr).toBe("")
    expect(result.stdout).toBe(`${LDQ}Hi${RDQ}${EM_DASH}x\n`)
    expect(result.status).toBe(0)
  }, 60_000)
})
