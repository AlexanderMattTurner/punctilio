import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Readable, Writable } from "node:stream"

import { runCli } from "../cli.js"
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

afterEach(() => {
  clearMarkdownCache()
  clearHtmlCache()
})

afterAll(() => {
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
  it("formats a markdown file in place", async () => {
    const path = tmpFile('"Hello" -- world.\n', "doc.md")
    const cap = captureIO()
    const code = await runCli([path, "--no-nbsp"], cap.io)
    expect(code).toBe(0)
    expect(readFileSync(path, "utf8")).toBe(`${LDQ}Hello${RDQ}${EM_DASH}world.\n`)
    expect(cap.stdout()).toContain(`Reformatted: ${path}`)
  })

  it("preserves the file's missing trailing newline", async () => {
    const original = '"Already done."'
    const path = tmpFile(`${LDQ}Already done.${RDQ}`, "doc.md")
    const cap = captureIO()
    const code = await runCli([path, "--no-nbsp"], cap.io)
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

  it("handles HTML files via .html extension", async () => {
    const path = tmpFile('<p>"Hello"</p>\n', "page.html")
    const cap = captureIO()
    const code = await runCli([path, "--no-nbsp"], cap.io)
    expect(code).toBe(0)
    expect(readFileSync(path, "utf8")).toContain(`${LDQ}Hello${RDQ}`)
  })

  it.each([".md", ".markdown", ".html", ".htm"])(
    "infers type from %s extension",
    async (ext) => {
      const path = tmpFile(ext.startsWith(".m") ? '"x"\n' : '<p>"x"</p>\n', `file${ext}`)
      const cap = captureIO()
      const code = await runCli([path, "--no-nbsp"], cap.io)
      expect(code).toBe(0)
      expect(readFileSync(path, "utf8")).toContain(`${LDQ}x${RDQ}`)
    },
  )

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
    const code = await runCli(["--type", "md", "--no-nbsp", path], cap.io)
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
      ["--skip-tag", "aside", "--no-nbsp", path],
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
      ["--skip-class", "raw", "--no-nbsp", path],
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
    const code = await runCli(["--no-fragment", "--no-nbsp", path], cap.io)
    expect(code).toBe(0)
    expect(readFileSync(path, "utf8")).toContain(`${LDQ}Hi${RDQ}`)
  })

  it("processes multiple files and reports each that changed", async () => {
    const a = tmpFile('"a"\n', "a.md")
    const b = tmpFile(`${LDQ}b${RDQ}\n`, "b.md")
    const cap = captureIO()
    const code = await runCli(["--no-nbsp", a, b], cap.io)
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

  it("--cache writes a cache file and skips unchanged files on the second run", async () => {
    await withTempCwd("punctilio-cache-", async (dir) => {
      writeFileSync(join(dir, "doc.md"), '"Hello."\n')
      const cacheLocation = join(dir, "cache.json")
      const args = ["doc.md", "--cache", "--cache-location", cacheLocation, "--no-nbsp"]

      const first = captureIO()
      expect(await runCli(args, first.io)).toBe(0)
      expect(first.stdout()).toContain("Reformatted")
      expect(existsSync(cacheLocation)).toBe(true)

      const second = captureIO()
      expect(await runCli(args, second.io)).toBe(0)
      expect(second.stdout()).not.toContain("Reformatted")
    })
  })

  it("--cache without --cache-location uses the default location under cwd", async () => {
    await withTempCwd("punctilio-cache-default-", async (dir) => {
      writeFileSync(join(dir, "doc.md"), '"Hello."\n')
      const cap = captureIO()
      expect(await runCli(["doc.md", "--cache", "--no-nbsp"], cap.io)).toBe(0)
      expect(existsSync(join(dir, "node_modules", ".cache", "punctilio", "cache.json"))).toBe(true)
    })
  })

  it("--cache invalidates when options change", async () => {
    await withTempCwd("punctilio-cache-opts-", async (dir) => {
      writeFileSync(join(dir, "doc.md"), `${LDQ}Hello.${RDQ}\n`)
      const cacheLocation = join(dir, "cache.json")
      const baseArgs = ["doc.md", "--cache", "--cache-location", cacheLocation, "--no-nbsp"]

      const first = captureIO()
      await runCli(baseArgs, first.io)

      const second = captureIO()
      expect(await runCli([...baseArgs, "--punctuation-style", "british"], second.io)).toBe(0)
      expect(second.stdout()).toContain("Reformatted")
    })
  })

  it.each([
    ["recovers gracefully from a corrupt cache file", "{not valid json"],
    ["ignores a JSON cache file missing the `files` key", "{}"],
  ])("--cache %s", async (_label, seedContent) => {
    await withTempCwd("punctilio-cache-bad-", async (dir) => {
      writeFileSync(join(dir, "doc.md"), '"Hello."\n')
      const cacheLocation = join(dir, "cache.json")
      writeFileSync(cacheLocation, seedContent)

      const cap = captureIO()
      expect(await runCli(["doc.md", "--cache", "--cache-location", cacheLocation, "--no-nbsp"], cap.io)).toBe(0)
      expect(cap.stdout()).toContain("Reformatted")
    })
  })

  it("--cache caches no-op (idempotent) files too, then skips them next run", async () => {
    await withTempCwd("punctilio-cache-noop-", async (dir) => {
      writeFileSync(join(dir, "doc.md"), `${LDQ}Hello.${RDQ}\n`)
      const cacheLocation = join(dir, "cache.json")
      const args = ["doc.md", "--cache", "--cache-location", cacheLocation, "--no-nbsp"]

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
      expect(await runCli(["*.md", "--no-nbsp"], cap.io)).toBe(0)
      expect(readFileSync(join(dir, "a.md"), "utf8")).toContain(`${LDQ}a${RDQ}`)
      expect(readFileSync(join(dir, "b.md"), "utf8")).toBe('"b"\n')
    })
  })

  it("--ignore-path overrides the default .punctilioignore lookup", async () => {
    await withTempCwd("punctilio-ignore-", async (dir) => {
      writeFileSync(join(dir, "a.md"), '"a"\n')
      writeFileSync(join(dir, "b.md"), '"b"\n')
      const customIgnore = join(dir, "custom.ignore")
      writeFileSync(customIgnore, "a.md\n")

      const cap = captureIO()
      expect(await runCli(["*.md", "--ignore-path", customIgnore, "--no-nbsp"], cap.io)).toBe(0)
      expect(readFileSync(join(dir, "a.md"), "utf8")).toBe('"a"\n')
      expect(readFileSync(join(dir, "b.md"), "utf8")).toContain(`${LDQ}b${RDQ}`)
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
})
