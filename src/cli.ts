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

const VALID_PUNCTUATION_STYLES: readonly PunctuationStyle[] = [
  "american", "british", "german", "french", "none",
]
const VALID_DASH_STYLES: readonly DashStyle[] = ["american", "british", "none"]
const VALID_EMPHASIS_MARKERS = ["*", "_"] as const
const VALID_BULLET_MARKERS = ["-", "*", "+"] as const
const VALID_RULE_MARKERS = ["-", "*", "_"] as const

const MARKDOWN_EXTENSIONS = new Set([".md", ".markdown"])
const HTML_EXTENSIONS = new Set([".html", ".htm"])

type FileType = "md" | "html"

interface CliIO {
  stdin: AsyncIterable<string | Buffer>
  stdout: NodeJS.WritableStream
  stderr: NodeJS.WritableStream
}

class UsageError extends Error {}

const HELP = `Usage:
  punctilio [options] <files...>           Format files in place
  punctilio --check <files...>             Exit 1 if any file would change
  punctilio --stdin --type <md|html>       Read stdin, write stdout

File-type detection (override with --type):
  .md, .markdown       markdown
  .html, .htm          html

Transform options:
  --punctuation-style <american|british|german|french|none>
  --dash-style <american|british|none>
  --no-symbols              Disable symbol transforms (ellipsis, ×, ©, etc.)
  --no-nbsp                 Disable non-breaking space insertion
  --no-collapse-spaces      Preserve runs of consecutive spaces
  --no-arrows               Disable -> → → and friends
  --fractions               Enable 1/2 → ½
  --degrees                 Enable 20 C → 20 °C
  --superscript             Enable 1st → 1ˢᵗ
  --ligatures               Enable !? → ⁉

Markdown-only options:
  --emphasis-marker <*|_>
  --strong-marker <*|_>
  --bullet-marker <-|*|+>
  --rule-marker <-|*|_>

HTML-only options:
  --skip-tag <tag>          (repeatable) Tags whose contents are left alone
  --skip-class <class>      (repeatable) Class names whose elements are skipped
  --no-fragment             Parse input as a full HTML document

Other:
  -h, --help                Show this help
  -V, --version             Show version
`

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

function validateChoice<T extends readonly string[]>(
  value: string | undefined,
  choices: T,
  flag: string,
): T[number] | undefined {
  if (value === undefined) return undefined
  if (!choices.includes(value)) {
    throw new UsageError(`Invalid value "${value}" for --${flag}. Choose from: ${choices.join(", ")}`)
  }
  return value as T[number]
}

type ParsedValues = {
  "punctuation-style"?: string
  "dash-style"?: string
  "no-symbols"?: boolean
  "no-nbsp"?: boolean
  "no-collapse-spaces"?: boolean
  "no-arrows"?: boolean
  fractions?: boolean
  degrees?: boolean
  superscript?: boolean
  ligatures?: boolean
  "emphasis-marker"?: string
  "strong-marker"?: string
  "bullet-marker"?: string
  "rule-marker"?: string
  "skip-tag"?: string[]
  "skip-class"?: string[]
  "no-fragment"?: boolean
}

interface BuiltOptions {
  markdown: MarkdownOptions
  html: HtmlOptions
}

function buildOptions(values: ParsedValues): BuiltOptions {
  const shared: HtmlOptions & MarkdownOptions = {}

  const punctuationStyle = validateChoice(values["punctuation-style"], VALID_PUNCTUATION_STYLES, "punctuation-style")
  if (punctuationStyle) shared.punctuationStyle = punctuationStyle

  const dashStyle = validateChoice(values["dash-style"], VALID_DASH_STYLES, "dash-style")
  if (dashStyle) shared.dashStyle = dashStyle

  if (values["no-symbols"]) shared.symbols = false
  if (values["no-nbsp"]) shared.nbsp = false
  if (values["no-collapse-spaces"]) shared.collapseSpaces = false
  if (values["no-arrows"]) shared.includeArrows = false
  if (values.fractions) shared.fractions = true
  if (values.degrees) shared.degrees = true
  if (values.superscript) shared.superscript = true
  if (values.ligatures) shared.ligatures = true

  const markdown: MarkdownOptions = { ...shared }
  const emphasisMarker = validateChoice(values["emphasis-marker"], VALID_EMPHASIS_MARKERS, "emphasis-marker")
  if (emphasisMarker) markdown.emphasisMarker = emphasisMarker
  const strongMarker = validateChoice(values["strong-marker"], VALID_EMPHASIS_MARKERS, "strong-marker")
  if (strongMarker) markdown.strongMarker = strongMarker
  const bulletMarker = validateChoice(values["bullet-marker"], VALID_BULLET_MARKERS, "bullet-marker")
  if (bulletMarker) markdown.bulletMarker = bulletMarker
  const ruleMarker = validateChoice(values["rule-marker"], VALID_RULE_MARKERS, "rule-marker")
  if (ruleMarker) markdown.ruleMarker = ruleMarker

  const html: HtmlOptions = { ...shared }
  if (values["skip-tag"]) html.skipTags = values["skip-tag"]
  if (values["skip-class"]) html.skipClasses = values["skip-class"]
  if (values["no-fragment"]) html.fragment = false

  return { markdown, html }
}

async function transformContent(
  input: string,
  type: FileType,
  opts: BuiltOptions,
): Promise<string> {
  return type === "md"
    ? transformMarkdown(input, opts.markdown)
    : transformHtml(input, opts.html)
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
    parsed = parseArgs({
      args,
      allowPositionals: true,
      strict: true,
      options: {
        help: { type: "boolean", short: "h" },
        version: { type: "boolean", short: "V" },
        check: { type: "boolean" },
        stdin: { type: "boolean" },
        type: { type: "string" },
        "punctuation-style": { type: "string" },
        "dash-style": { type: "string" },
        "no-symbols": { type: "boolean" },
        "no-nbsp": { type: "boolean" },
        "no-collapse-spaces": { type: "boolean" },
        "no-arrows": { type: "boolean" },
        fractions: { type: "boolean" },
        degrees: { type: "boolean" },
        superscript: { type: "boolean" },
        ligatures: { type: "boolean" },
        "emphasis-marker": { type: "string" },
        "strong-marker": { type: "string" },
        "bullet-marker": { type: "string" },
        "rule-marker": { type: "string" },
        "skip-tag": { type: "string", multiple: true },
        "skip-class": { type: "string", multiple: true },
        "no-fragment": { type: "boolean" },
      },
    })
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
  const opts = buildOptions(values as ParsedValues)
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
    if (check) {
      return input === output ? 0 : 1
    }
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
