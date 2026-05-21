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

import { Command, CommanderError, Option } from "commander"

import { transformMarkdown, type MarkdownOptions } from "./markdown.js"
import { transformHtml, type HtmlOptions } from "./html.js"
import type { PunctuationStyle } from "./quotes.js"
import type { DashStyle } from "./dashes.js"

type CliOptions = MarkdownOptions & HtmlOptions
type FileType = "md" | "html"

interface CliIO {
  stdin: AsyncIterable<string | Buffer>
  stdout: NodeJS.WritableStream
  stderr: NodeJS.WritableStream
}

class UsageError extends Error {}

const FILE_TYPES = ["md", "html"] as const satisfies readonly FileType[]
const PUNCTUATION_STYLES = ["american", "british", "german", "french", "none"] as const satisfies readonly PunctuationStyle[]
const DASH_STYLES = ["american", "british", "none"] as const satisfies readonly DashStyle[]
const EMPHASIS_MARKERS = ["*", "_"] as const
const BULLET_MARKERS = ["-", "*", "+"] as const
const RULE_MARKERS = ["-", "*", "_"] as const

const MARKDOWN_EXTENSIONS = new Set([".md", ".markdown"])
const HTML_EXTENSIONS = new Set([".html", ".htm"])

/**
 * Shape of `program.opts()` after parsing. Fields named after their CLI
 * flags (camelCased by commander). `commander.choices()` guarantees the
 * literal types at runtime; we assert them at the boundary.
 */
interface ParsedFlags {
  check?: boolean
  stdinFilepath?: string
  type?: FileType
  punctuationStyle?: PunctuationStyle
  dashStyle?: DashStyle
  symbols?: boolean
  nbsp?: boolean
  collapseSpaces?: boolean
  arrows?: boolean
  fractions?: boolean
  degrees?: boolean
  superscript?: boolean
  ligatures?: boolean
  emphasisMarker?: "*" | "_"
  strongMarker?: "*" | "_"
  bulletMarker?: "-" | "*" | "+"
  ruleMarker?: "-" | "*" | "_"
  skipTag?: string[]
  skipClass?: string[]
  fragment?: boolean
}

function buildProgram(version: string, io: CliIO): Command {
  return new Command()
    .name("punctilio")
    .description("Apply typographic improvements to Markdown and HTML files.")
    .version(version, "-V, --version", "show version")
    .argument("[files...]", "files to format (pass '-' to read from stdin)")
    .option("--check", "exit 1 if any file would change; write nothing")
    .option("--stdin-filepath <path>", "treat stdin as if it were this filename (infers type from extension)")
    .addOption(new Option("--type <type>", "force file type (otherwise inferred from extension)").choices(FILE_TYPES))
    .addOption(new Option("--punctuation-style <style>", "quote and punctuation style").choices(PUNCTUATION_STYLES))
    .addOption(new Option("--dash-style <style>", "dash style").choices(DASH_STYLES))
    .option("--no-symbols", "disable symbol transforms (ellipsis, ×, ©, etc.)")
    .option("--no-nbsp", "disable non-breaking space insertion")
    .option("--no-collapse-spaces", "preserve runs of consecutive spaces")
    .option("--no-arrows", "disable -> → arrow transforms")
    .option("--fractions", "enable 1/2 → ½")
    .option("--degrees", "enable 20 C → 20 °C")
    .option("--superscript", "enable 1st → 1ˢᵗ")
    .option("--ligatures", "enable !? → ⁉")
    .addOption(new Option("--emphasis-marker <char>", "markdown emphasis character").choices(EMPHASIS_MARKERS))
    .addOption(new Option("--strong-marker <char>", "markdown strong emphasis character").choices(EMPHASIS_MARKERS))
    .addOption(new Option("--bullet-marker <char>", "markdown list bullet character").choices(BULLET_MARKERS))
    .addOption(new Option("--rule-marker <char>", "markdown thematic break character").choices(RULE_MARKERS))
    .option("--skip-tag <tag...>", "HTML tags whose contents are left alone (repeatable)")
    .option("--skip-class <class...>", "HTML class names whose elements are skipped (repeatable)")
    .option("--no-fragment", "parse input as a full HTML document")
    .exitOverride()
    .configureOutput({
      writeOut: (str) => { io.stdout.write(str) },
      writeErr: (str) => { io.stderr.write(str) },
    })
}

function inferFileType(path: string, override?: FileType): FileType {
  if (override !== undefined) return override
  const ext = extname(path).toLowerCase()
  if (MARKDOWN_EXTENSIONS.has(ext)) return "md"
  if (HTML_EXTENSIONS.has(ext)) return "html"
  throw new UsageError(
    `Cannot infer file type from extension "${ext}" for ${path}. Pass --type md|html.`,
  )
}

function buildOptions(flags: ParsedFlags): CliOptions {
  const opts: CliOptions = {}
  if (flags.punctuationStyle) opts.punctuationStyle = flags.punctuationStyle
  if (flags.dashStyle) opts.dashStyle = flags.dashStyle
  if (flags.symbols === false) opts.symbols = false
  if (flags.nbsp === false) opts.nbsp = false
  if (flags.collapseSpaces === false) opts.collapseSpaces = false
  if (flags.arrows === false) opts.includeArrows = false
  if (flags.fractions) opts.fractions = true
  if (flags.degrees) opts.degrees = true
  if (flags.superscript) opts.superscript = true
  if (flags.ligatures) opts.ligatures = true
  if (flags.emphasisMarker) opts.emphasisMarker = flags.emphasisMarker
  if (flags.strongMarker) opts.strongMarker = flags.strongMarker
  if (flags.bulletMarker) opts.bulletMarker = flags.bulletMarker
  if (flags.ruleMarker) opts.ruleMarker = flags.ruleMarker
  if (flags.skipTag) opts.skipTags = flags.skipTag
  if (flags.skipClass) opts.skipClasses = flags.skipClass
  if (flags.fragment === false) opts.fragment = false
  return opts
}

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

/**
 * Runs the CLI with the given arguments and I/O streams.
 *
 * @returns Exit code: 0 if no changes (or all changes written),
 * 1 if `--check` saw a file that would change, 2 for usage errors.
 */
export async function runCli(args: string[], io: CliIO): Promise<number> {
  const program = buildProgram(await readPackageVersion(), io)

  try {
    program.parse(args, { from: "user" })
  } catch (err) {
    /* istanbul ignore if -- commander only throws CommanderError from parse */
    if (!(err instanceof CommanderError)) throw err
    if (err.code === "commander.helpDisplayed" || err.code === "commander.version") return 0
    return 2
  }

  const flags = program.opts() as ParsedFlags
  const positionals = program.args

  try {
    return await runValidated(flags, positionals, io, program)
  } catch (err) {
    if (err instanceof UsageError) {
      io.stderr.write(`Error: ${err.message}\n`)
      return 2
    }
    throw err
  }
}

function readsStdin(positionals: string[], flags: ParsedFlags): boolean {
  if (positionals.includes("-")) return true
  return flags.stdinFilepath !== undefined && positionals.length === 0
}

async function runValidated(
  flags: ParsedFlags,
  positionals: string[],
  io: CliIO,
  program: Command,
): Promise<number> {
  const opts = buildOptions(flags)
  const check = flags.check === true

  if (readsStdin(positionals, flags)) {
    const fileArgs = positionals.filter((p) => p !== "-")
    if (fileArgs.length > 0) {
      throw new UsageError("'-' cannot be combined with file arguments.")
    }
    const type: FileType | undefined =
      flags.type ?? (flags.stdinFilepath !== undefined ? inferFileType(flags.stdinFilepath) : undefined)
    if (type === undefined) {
      throw new UsageError("Reading from stdin requires --type md|html or --stdin-filepath <path>.")
    }
    const input = await readStdin(io.stdin)
    const output = matchTrailingNewline(input, await transformContent(input, type, opts))
    if (check) return input === output ? 0 : 1
    io.stdout.write(output)
    return 0
  }

  if (positionals.length === 0) {
    io.stderr.write(program.helpInformation())
    return 2
  }

  let anyChanged = false
  for (const path of positionals) {
    const type = inferFileType(path, flags.type)
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
