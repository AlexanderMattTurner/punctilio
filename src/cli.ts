#!/usr/bin/env node
/**
 * Command-line entry point: format Markdown and HTML files in place,
 * or check whether they would be reformatted (for use as a pre-commit hook).
 *
 * @packageDocumentation
 */

import { readFile, writeFile } from "node:fs/promises"
import { extname } from "node:path"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"

import { transformMarkdown, type MarkdownOptions } from "./markdown.js"
import { transformHtml, type HtmlOptions } from "./html.js"
import type { PunctuationStyle } from "./quotes.js"
import type { DashStyle } from "./dashes.js"

type CliOptions = MarkdownOptions & HtmlOptions
type FileType = "md" | "html"
type Section = "transform" | "markdown" | "html"

interface CliIO {
  stdin: AsyncIterable<string | Buffer>
  stdout: NodeJS.WritableStream
  stderr: NodeJS.WritableStream
}

class UsageError extends Error {}

/**
 * Single source of truth for every CLI flag that maps onto a library
 * option. `parseArgs` config, `buildOptions`, and the HELP string are
 * all derived from this table. To add or rename a flag, edit exactly
 * one row here.
 */
type OptionSpec =
  | {
      kind: "flag"
      flag: string
      section: Section
      summary: string
      apply: (opts: CliOptions) => void
    }
  | {
      kind: "string"
      flag: string
      section: Section
      summary: string
      choices: readonly string[]
      apply: (opts: CliOptions, value: string) => void
    }
  | {
      kind: "multi"
      flag: string
      section: Section
      summary: string
      placeholder: string
      apply: (opts: CliOptions, value: string[]) => void
    }

const OPTIONS: readonly OptionSpec[] = [
  // ── Transform options (apply to both Markdown and HTML) ────────────
  {
    kind: "string", flag: "punctuation-style", section: "transform",
    choices: ["american", "british", "german", "french", "none"] satisfies readonly PunctuationStyle[],
    summary: "Quote/punctuation style",
    apply: (o, v) => { o.punctuationStyle = v as PunctuationStyle },
  },
  {
    kind: "string", flag: "dash-style", section: "transform",
    choices: ["american", "british", "none"] satisfies readonly DashStyle[],
    summary: "Dash style",
    apply: (o, v) => { o.dashStyle = v as DashStyle },
  },
  {
    kind: "flag", flag: "no-symbols", section: "transform",
    summary: "Disable symbol transforms (ellipsis, ×, ©, etc.)",
    apply: (o) => { o.symbols = false },
  },
  {
    kind: "flag", flag: "no-nbsp", section: "transform",
    summary: "Disable non-breaking space insertion",
    apply: (o) => { o.nbsp = false },
  },
  {
    kind: "flag", flag: "no-collapse-spaces", section: "transform",
    summary: "Preserve runs of consecutive spaces",
    apply: (o) => { o.collapseSpaces = false },
  },
  {
    kind: "flag", flag: "no-arrows", section: "transform",
    summary: "Disable -> → and friends",
    apply: (o) => { o.includeArrows = false },
  },
  {
    kind: "flag", flag: "fractions", section: "transform",
    summary: "Enable 1/2 → ½",
    apply: (o) => { o.fractions = true },
  },
  {
    kind: "flag", flag: "degrees", section: "transform",
    summary: "Enable 20 C → 20 °C",
    apply: (o) => { o.degrees = true },
  },
  {
    kind: "flag", flag: "superscript", section: "transform",
    summary: "Enable 1st → 1ˢᵗ",
    apply: (o) => { o.superscript = true },
  },
  {
    kind: "flag", flag: "ligatures", section: "transform",
    summary: "Enable !? → ⁉",
    apply: (o) => { o.ligatures = true },
  },
  // ── Markdown-only options ──────────────────────────────────────────
  {
    kind: "string", flag: "emphasis-marker", section: "markdown",
    choices: ["*", "_"], summary: "Emphasis character",
    apply: (o, v) => { o.emphasisMarker = v as "*" | "_" },
  },
  {
    kind: "string", flag: "strong-marker", section: "markdown",
    choices: ["*", "_"], summary: "Strong emphasis character",
    apply: (o, v) => { o.strongMarker = v as "*" | "_" },
  },
  {
    kind: "string", flag: "bullet-marker", section: "markdown",
    choices: ["-", "*", "+"], summary: "List bullet character",
    apply: (o, v) => { o.bulletMarker = v as "-" | "*" | "+" },
  },
  {
    kind: "string", flag: "rule-marker", section: "markdown",
    choices: ["-", "*", "_"], summary: "Thematic break character",
    apply: (o, v) => { o.ruleMarker = v as "-" | "*" | "_" },
  },
  // ── HTML-only options ──────────────────────────────────────────────
  {
    kind: "multi", flag: "skip-tag", section: "html",
    placeholder: "<tag>",
    summary: "Tags whose contents are left alone (repeatable)",
    apply: (o, v) => { o.skipTags = v },
  },
  {
    kind: "multi", flag: "skip-class", section: "html",
    placeholder: "<class>",
    summary: "Class names whose elements are skipped (repeatable)",
    apply: (o, v) => { o.skipClasses = v },
  },
  {
    kind: "flag", flag: "no-fragment", section: "html",
    summary: "Parse input as a full HTML document",
    apply: (o) => { o.fragment = false },
  },
]

const MARKDOWN_EXTENSIONS = new Set([".md", ".markdown"])
const HTML_EXTENSIONS = new Set([".html", ".htm"])

function inferFileType(path: string, override?: string): FileType {
  if (override !== undefined) {
    if (override !== "md" && override !== "html") {
      throw new UsageError(`Invalid --type "${override}". Use "md" or "html".`)
    }
    return override
  }
  const ext = extname(path).toLowerCase()
  if (MARKDOWN_EXTENSIONS.has(ext)) return "md"
  if (HTML_EXTENSIONS.has(ext)) return "html"
  throw new UsageError(
    `Cannot infer file type from extension "${ext}" for ${path}. Pass --type md|html.`
  )
}

function parseArgsOptions(): Record<string, { type: "string" | "boolean"; short?: string; multiple?: boolean }> {
  const out: Record<string, { type: "string" | "boolean"; short?: string; multiple?: boolean }> = {
    help:    { type: "boolean", short: "h" },
    version: { type: "boolean", short: "V" },
    check:   { type: "boolean" },
    stdin:   { type: "boolean" },
    type:    { type: "string" },
  }
  for (const spec of OPTIONS) {
    out[spec.flag] = spec.kind === "multi"
      ? { type: "string", multiple: true }
      : { type: spec.kind === "flag" ? "boolean" : "string" }
  }
  return out
}

function buildOptions(values: Record<string, unknown>): CliOptions {
  const opts: CliOptions = {}
  for (const spec of OPTIONS) {
    const value = values[spec.flag]
    if (value === undefined) continue
    switch (spec.kind) {
      case "flag":
        if (value === true) spec.apply(opts)
        break
      case "multi":
        spec.apply(opts, value as string[])
        break
      case "string": {
        const v = value as string
        if (!spec.choices.includes(v)) {
          throw new UsageError(
            `Invalid value "${v}" for --${spec.flag}. Choose from: ${spec.choices.join(", ")}`,
          )
        }
        spec.apply(opts, v)
        break
      }
    }
  }
  return opts
}

const HELP_COL = 28

function formatHelpLine(spec: OptionSpec): string {
  let lhs = `  --${spec.flag}`
  let suffix = ""
  if (spec.kind === "multi") lhs += ` ${spec.placeholder}`
  if (spec.kind === "string") suffix = ` (${spec.choices.join("|")})`
  return `${lhs.padEnd(HELP_COL)}${spec.summary}${suffix}`
}

function buildHelp(): string {
  const sections: Array<[Section, string]> = [
    ["transform", "Transform options:"],
    ["markdown", "Markdown-only options:"],
    ["html", "HTML-only options:"],
  ]
  const lines = [
    "Usage:",
    "  punctilio [options] <files...>           Format files in place",
    "  punctilio --check <files...>             Exit 1 if any file would change",
    "  punctilio --stdin --type <md|html>       Read stdin, write stdout",
    "",
    "File-type detection (override with --type):",
    "  .md, .markdown       markdown",
    "  .html, .htm          html",
    "",
  ]
  for (const [section, header] of sections) {
    lines.push(header)
    for (const spec of OPTIONS) {
      if (spec.section === section) lines.push(formatHelpLine(spec))
    }
    lines.push("")
  }
  lines.push("Other:")
  lines.push("  -h, --help                  Show this help")
  lines.push("  -V, --version               Show version")
  return lines.join("\n") + "\n"
}

const HELP = buildHelp()

async function transformContent(input: string, type: FileType, opts: CliOptions): Promise<string> {
  return type === "md" ? transformMarkdown(input, opts) : transformHtml(input, opts)
}

/**
 * Preserves whether the original file ends with a trailing newline.
 * The unified pipelines for Markdown and HTML both unconditionally append
 * one, so without this adjustment every file lacking a trailing newline
 * would always appear as needing a rewrite.
 */
function matchTrailingNewline(original: string, formatted: string): string {
  const originalHas = original.endsWith("\n")
  const formattedHas = formatted.endsWith("\n")
  if (originalHas === formattedHas) return formatted
  if (originalHas) return formatted + "\n"
  return formatted.replace(/\n$/, "")
}

async function readStdin(stdin: AsyncIterable<string | Buffer>): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of stdin) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk)
  }
  return Buffer.concat(chunks).toString("utf8")
}

/**
 * Runs the CLI with the given arguments and I/O streams.
 *
 * @returns Exit code: 0 if no changes (or all changes written),
 * 1 if `--check` saw a file that would change, 2 for usage errors.
 */
export async function runCli(args: string[], io: CliIO): Promise<number> {
  let parsed
  try {
    parsed = parseArgs({ args, allowPositionals: true, strict: true, options: parseArgsOptions() })
  } catch (err) {
    io.stderr.write(`Error: ${(err as Error).message}\n`)
    return 2
  }
  const { values, positionals } = parsed

  if (values.help) {
    io.stdout.write(HELP)
    return 0
  }
  if (values.version) {
    io.stdout.write(`${await readPackageVersion()}\n`)
    return 0
  }

  try {
    return await runValidated(values, positionals as string[], io)
  } catch (err) {
    if (err instanceof UsageError) {
      io.stderr.write(`Error: ${err.message}\n`)
      return 2
    }
    throw err
  }
}

async function runValidated(
  values: Record<string, unknown>,
  positionals: string[],
  io: CliIO,
): Promise<number> {
  const opts = buildOptions(values)
  const typeOverride = values.type as string | undefined
  const check = values.check === true

  if (values.stdin) {
    if (positionals.length > 0) {
      throw new UsageError("--stdin cannot be combined with file arguments.")
    }
    if (typeOverride === undefined) {
      throw new UsageError("--stdin requires --type md|html.")
    }
    const type = inferFileType("<stdin>", typeOverride)
    const input = await readStdin(io.stdin)
    const output = matchTrailingNewline(input, await transformContent(input, type, opts))
    if (check) return input === output ? 0 : 1
    io.stdout.write(output)
    return 0
  }

  if (positionals.length === 0) {
    io.stderr.write(HELP)
    return 2
  }

  let anyChanged = false
  for (const path of positionals) {
    const type = inferFileType(path, typeOverride)
    const original = await readFile(path, "utf8")
    const formatted = matchTrailingNewline(original, await transformContent(original, type, opts))
    if (original === formatted) continue
    anyChanged = true
    if (check) {
      io.stderr.write(`Would reformat: ${path}\n`)
    } else {
      await writeFile(path, formatted)
      io.stdout.write(`Reformatted: ${path}\n`)
    }
  }
  return check && anyChanged ? 1 : 0
}

async function readPackageVersion(): Promise<string> {
  const pkgPath = new URL("../package.json", import.meta.url)
  /* istanbul ignore next -- the catch only fires when package.json is missing or unreadable */
  try {
    const raw = await readFile(pkgPath, "utf8")
    return JSON.parse(raw).version ?? "unknown"
  } catch {
    return "unknown"
  }
}

/* istanbul ignore next -- entry-point bootstrap; logic is covered via runCli */
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runCli(process.argv.slice(2), {
    stdin: process.stdin,
    stdout: process.stdout,
    stderr: process.stderr,
  })
    .then((code) => process.exit(code))
    .catch((err: Error) => {
      process.stderr.write(`Error: ${err.message}\n`)
      process.exit(2)
    })
}
