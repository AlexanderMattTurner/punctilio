import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as prettier from "prettier"
import plugin from "../prettier-plugin.js"
import { UNICODE_SYMBOLS } from "../constants.js"

const {
  LEFT_DOUBLE_QUOTE: LDQ,
  RIGHT_DOUBLE_QUOTE: RDQ,
  RIGHT_SINGLE_QUOTE: RSQ,
  EM_DASH,
  ELLIPSIS,
} = UNICODE_SYMBOLS

const createdDirs: string[] = []

afterAll(() => {
  for (const dir of createdDirs) rmSync(dir, { recursive: true, force: true })
})

async function format(input: string, options: prettier.Options = {}): Promise<string> {
  return prettier.format(input, { parser: "markdown", plugins: [plugin], ...options })
}

async function formatWithConfig(input: string, config: object): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), "punctilio-prettier-"))
  createdDirs.push(dir)
  writeFileSync(join(dir, ".punctiliorc.json"), JSON.stringify(config))
  return format(input, { filepath: join(dir, "doc.md") })
}

describe("prettier-plugin-punctilio", () => {
  it("applies smart quotes and em-dashes with defaults", async () => {
    const out = await formatWithConfig('"Hello" -- world.\n', { nbsp: false })
    expect(out).toContain(`${LDQ}Hello${RDQ}${EM_DASH}world.`)
  })

  it("ignores markdown-only and HTML-only keys from a config shared with the CLI", async () => {
    const out = await formatWithConfig('"Hello" -- world.\n', {
      emphasisMarker: "_",
      skipTags: ["aside"],
      fragment: true,
      nbsp: false,
    })
    expect(out).toContain(`${LDQ}Hello${RDQ}${EM_DASH}world.`)
  })

  it("respects punctuationStyle=british from .punctiliorc", async () => {
    const out = await formatWithConfig('"Hello."\n', { punctuationStyle: "british", nbsp: false })
    expect(out).toContain(`${LDQ}Hello${RDQ}.`)
  })

  it("respects dashStyle=british (spaced en-dashes)", async () => {
    const out = await formatWithConfig("word -- word\n", { dashStyle: "british", nbsp: false })
    expect(out).toContain(`word ${UNICODE_SYMBOLS.EN_DASH} word`)
  })

  it("leaves code spans untouched while transforming surrounding prose", async () => {
    const out = await formatWithConfig('She said "hi" then ran `"foo"` happily.\n', { nbsp: false })
    expect(out).toContain('`"foo"`')
    expect(out).toContain(`said ${LDQ}hi${RDQ}`)
  })

  it("leaves fenced code blocks untouched", async () => {
    const input = ['```', '"untouched" -- still', '```', ''].join("\n")
    const out = await formatWithConfig(input, { nbsp: false })
    expect(out).toContain('"untouched" -- still')
  })

  it("handles ellipses and apostrophes together", async () => {
    const out = await formatWithConfig("Wait... it's complicated.\n", { nbsp: false })
    expect(out).toContain(`Wait${ELLIPSIS} it${RSQ}s complicated.`)
  })

  it.each([
    ["fractions", { fractions: true, nbsp: false }, "Add 1/2 cup.\n", UNICODE_SYMBOLS.FRACTION_1_2],
    ["degrees", { degrees: true, nbsp: false }, "It is 20 C today.\n", "°C"],
    ["superscript", { superscript: true, nbsp: false }, "1st place\n", "1ˢᵗ"],
    ["ligatures", { ligatures: true, nbsp: false }, "Wait!?\n", "⁉"],
  ])("opt-in transform %s applies when set in config", async (_label, config, input, expected) => {
    const out = await formatWithConfig(input, config)
    expect(out).toContain(expected)
  })

  it("registers a Markdown parser only (HTML files go through the CLI or rehype plugin)", () => {
    // The README and CHANGELOG advertise the plugin as Markdown-only. Lock
    // that in: any change that registers extra parsers should update the
    // docs first (and probably ship dedicated tests for the new parser).
    expect(Object.keys(plugin.parsers ?? {})).toEqual(["markdown"])
  })

  it("falls back to defaults when no config is found", async () => {
    // No .punctiliorc anywhere reachable; prettier passes no filepath, so cosmiconfig
    // searches from cwd and finds nothing under the project root (or returns whatever
    // the project root happens to have). Either way the transform applies with defaults.
    const out = await format("Mr. Smith met Dr. Jones.\n")
    expect(out).toContain(" ") // NBSP after honorifics is the default
  })
})
