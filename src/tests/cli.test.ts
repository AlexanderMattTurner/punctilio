import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs"
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

  it("reads stdin and writes stdout when --stdin --type md", async () => {
    const cap = captureIO('"Hello."')
    const code = await runCli(["--stdin", "--type", "md", "--no-nbsp"], cap.io)
    expect(code).toBe(0)
    expect(cap.stdout()).toContain(`${LDQ}Hello.${RDQ}`)
  })

  it("handles string-typed stdin chunks", async () => {
    const cap = captureIO('"Hello."', /* stdinAsString */ true)
    const code = await runCli(["--stdin", "--type", "md", "--no-nbsp"], cap.io)
    expect(code).toBe(0)
    expect(cap.stdout()).toContain(`${LDQ}Hello.${RDQ}`)
  })

  it("--stdin --check returns 1 when input would change", async () => {
    const cap = captureIO('"Hello."')
    const code = await runCli(
      ["--stdin", "--type", "md", "--check", "--no-nbsp"],
      cap.io,
    )
    expect(code).toBe(1)
  })

  it("--stdin --check returns 0 when input is already clean", async () => {
    const cap = captureIO(`${LDQ}Hello.${RDQ}`)
    const code = await runCli(
      ["--stdin", "--type", "md", "--check", "--no-nbsp"],
      cap.io,
    )
    expect(code).toBe(0)
  })

  it("--stdin rejects file arguments", async () => {
    const path = tmpFile("x", "doc.md")
    const cap = captureIO("x")
    const code = await runCli(["--stdin", "--type", "md", path], cap.io)
    expect(code).toBe(2)
    expect(cap.stderr()).toContain("cannot be combined")
  })

  it("--stdin requires --type", async () => {
    const cap = captureIO("x")
    const code = await runCli(["--stdin"], cap.io)
    expect(code).toBe(2)
    expect(cap.stderr()).toContain("requires --type")
  })

  it("errors when no positional and no --stdin", async () => {
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
    expect(cap.stderr()).toMatch(/Invalid --type/)
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
    expect(cap.stderr()).toMatch(/Invalid value/)
  })

  it("applies --punctuation-style british", async () => {
    const cap = captureIO('"Hello."')
    const code = await runCli(
      ["--stdin", "--type", "md", "--punctuation-style", "british", "--no-nbsp"],
      cap.io,
    )
    expect(code).toBe(0)
    expect(cap.stdout()).toContain(`${LDQ}Hello${RDQ}.`)
  })

  it("--fractions enables fraction transforms", async () => {
    const cap = captureIO("Add 1/2 cup.")
    const code = await runCli(
      ["--stdin", "--type", "md", "--fractions", "--no-nbsp"],
      cap.io,
    )
    expect(code).toBe(0)
    expect(cap.stdout()).toContain(UNICODE_SYMBOLS.FRACTION_1_2)
  })

  it("--degrees enables degree transforms", async () => {
    const cap = captureIO("It is 20 C today.")
    const code = await runCli(
      ["--stdin", "--type", "md", "--degrees", "--no-nbsp"],
      cap.io,
    )
    expect(code).toBe(0)
    expect(cap.stdout()).toContain("°C")
  })

  it("--superscript enables superscript ordinals", async () => {
    const cap = captureIO("1st place")
    const code = await runCli(
      ["--stdin", "--type", "md", "--superscript", "--no-nbsp"],
      cap.io,
    )
    expect(code).toBe(0)
    expect(cap.stdout()).toContain("1ˢᵗ")
  })

  it("--ligatures enables punctuation ligatures", async () => {
    const cap = captureIO("Wait!?")
    const code = await runCli(
      ["--stdin", "--type", "md", "--ligatures", "--no-nbsp"],
      cap.io,
    )
    expect(code).toBe(0)
    expect(cap.stdout()).toContain("⁉")
  })

  it("--no-symbols disables symbol transforms", async () => {
    const cap = captureIO("Wait... done.")
    const code = await runCli(
      ["--stdin", "--type", "md", "--no-symbols", "--no-nbsp"],
      cap.io,
    )
    expect(code).toBe(0)
    expect(cap.stdout()).not.toContain(UNICODE_SYMBOLS.ELLIPSIS)
  })

  it("--no-arrows disables arrow transforms", async () => {
    const cap = captureIO("Go -> back")
    const code = await runCli(
      ["--stdin", "--type", "md", "--no-arrows", "--no-nbsp"],
      cap.io,
    )
    expect(code).toBe(0)
    expect(cap.stdout()).toContain("->")
  })

  it("--no-collapse-spaces preserves multiple spaces", async () => {
    const cap = captureIO("two  spaces.")
    const code = await runCli(
      ["--stdin", "--type", "md", "--no-collapse-spaces", "--no-nbsp"],
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
    expect(cap.stderr()).toContain("Error:")
  })

  it("propagates unexpected errors instead of swallowing them", async () => {
    const cap = captureIO()
    await expect(
      runCli(["/does/not/exist.md", "--no-nbsp"], cap.io),
    ).rejects.toThrow(/ENOENT/)
  })
})
