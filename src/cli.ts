#!/usr/bin/env node

import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { readFile, writeFile } from "node:fs/promises"
import { dirname, extname, isAbsolute, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { Command, CommanderError, Option } from "commander"
import { cosmiconfig } from "cosmiconfig"
import ignore, { type Ignore } from "ignore"
import { glob } from "tinyglobby"

import { type MarkdownOptions, transformMarkdown } from "./markdown.js"
import { type HtmlOptions, transformHtml } from "./html.js"
import { PUNCTUATION_STYLES, type PunctuationStyle } from "./quotes.js"
import { DASH_STYLES, type DashStyle } from "./dashes.js"
import { stableStringify } from "./utils.js"

type CliOptions = MarkdownOptions & HtmlOptions
type FileType = "md" | "html"

interface CliIO {
  stdin: AsyncIterable<string | Buffer>
  stdout: NodeJS.WritableStream
  stderr: NodeJS.WritableStream
}

class UsageError extends Error {}

const FILE_TYPES = ["md", "html"] as const satisfies readonly FileType[]
const EMPHASIS_MARKERS = ["*", "_"] as const
const BULLET_MARKERS = ["-", "*", "+"] as const
const RULE_MARKERS = ["-", "*", "_"] as const

const MARKDOWN_EXTENSIONS = new Set([".md", ".markdown"])
const HTML_EXTENSIONS = new Set([".html", ".htm"])

// Fields match commander's camelCased flag names; .choices() guarantees literals at runtime.
interface ParsedFlags {
  check?: boolean
  cache?: boolean
  cacheLocation?: string
  config?: string | false  // string if --config <path>, false if --no-config
  ignorePath?: string
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
    .option("--config <path>", "path to a punctilio config file (otherwise auto-discovered)")
    .option("--no-config", "ignore any auto-discovered config file")
    .option("--ignore-path <path>", "path to an ignore file (otherwise .punctilioignore in cwd)")
    .option("--no-cache", "disable the incremental cache (default location node_modules/.cache/punctilio/cache.json)")
    .option("--cache-location <path>", "override the cache file location")
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

// Config keys must match library option names (punctuationStyle, skipTags, …),
// not the kebab-cased CLI flag names.
async function loadConfig(
  cwd: string,
  configPath: string | undefined,
  disabled: boolean,
): Promise<CliOptions> {
  if (disabled) return {}
  const explorer = cosmiconfig("punctilio")
  const result = configPath ? await explorer.load(configPath) : await explorer.search(cwd)
  if (!result || result.isEmpty) return {}
  return result.config as CliOptions
}

function loadIgnore(cwd: string, ignorePath: string | undefined): Ignore {
  const ig = ignore()
  const effective = ignorePath ?? join(cwd, ".punctilioignore")
  if (existsSync(effective)) ig.add(readFileSync(effective, "utf8"))
  return ig
}

function isGlobPattern(pattern: string): boolean {
  return /[*?[\]{}]/.test(pattern)
}

// Non-glob positionals pass through as literal paths so they error loudly if missing.
async function discoverFiles(
  patterns: string[],
  cwd: string,
  ig: Ignore,
): Promise<string[]> {
  const literals = patterns.filter((p) => !isGlobPattern(p))
  const globs = patterns.filter(isGlobPattern)
  const expanded = globs.length > 0
    ? await glob(globs, { cwd, absolute: true, onlyFiles: true })
    : []
  const all = [...literals.map((p) => resolve(cwd, p)), ...expanded]
  return all.filter((file) => {
    const rel = relative(cwd, file)
    return rel.startsWith("..") || !ig.ignores(rel)
  })
}

interface CacheEntry {
  contentHash: string
  optionsHash: string
  version: string
}

interface Cache {
  files: Record<string, CacheEntry>
}

const DEFAULT_CACHE_LOCATION = join("node_modules", ".cache", "punctilio", "cache.json")

function hashString(s: string): string {
  return createHash("sha256").update(s).digest("hex").slice(0, 16)
}

function hashOptions(opts: CliOptions): string {
  return hashString(stableStringify(opts))
}

function loadCache(location: string, stderr: NodeJS.WritableStream): Cache {
  if (!existsSync(location)) return { files: {} }
  try {
    const parsed = JSON.parse(readFileSync(location, "utf8")) as Cache
    if (!parsed.files) {
      stderr.write(`Warning: cache at ${location} is missing the "files" key; discarding.\n`)
      return { files: {} }
    }
    // Drop absolute-path keys carried over from a pre-cwd-relative version
    // of the cache. They never match modern lookups, so keeping them
    // forever would just bloat the cache file on every save.
    const files: Record<string, CacheEntry> = {}
    for (const [k, v] of Object.entries(parsed.files)) {
      if (!isAbsolute(k)) files[k] = v
    }
    return { files }
  } catch {
    stderr.write(`Warning: cache at ${location} could not be parsed; discarding.\n`)
    return { files: {} }
  }
}

function saveCache(location: string, cache: Cache): void {
  mkdirSync(dirname(location), { recursive: true })
  writeFileSync(location, JSON.stringify(cache))
}

// cwd-relative so the cache survives directory moves and cross-machine syncs.
function cacheKey(filePath: string, cwd: string): string {
  return relative(cwd, filePath)
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

// Unified pipelines unconditionally append a trailing newline; undo if original lacked one.
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

/** Returns exit code: 0 success, 1 `--check` saw changes, 2 usage error. */
export async function runCli(args: string[], io: CliIO): Promise<number> {
  const version = await readPackageVersion()
  const program = buildProgram(version, io)

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
    return await runValidated(flags, positionals, io, program, version)
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
  version: string,
): Promise<number> {
  const cwd = process.cwd()
  const config = await loadConfig(
    cwd,
    typeof flags.config === "string" ? flags.config : undefined,
    flags.config === false,
  )
  const opts: CliOptions = { ...config, ...buildOptions(flags) }
  const check = flags.check ?? false

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

  const ig = loadIgnore(cwd, flags.ignorePath)
  const files = await discoverFiles(positionals, cwd, ig)

  const cacheLocation = flags.cache === false
    ? undefined
    : resolve(cwd, flags.cacheLocation ?? DEFAULT_CACHE_LOCATION)
  const cache = cacheLocation ? loadCache(cacheLocation, io.stderr) : undefined
  const optionsHash = cache ? hashOptions(opts) : ""

  let anyChanged = false
  for (const path of files) {
    const type = inferFileType(path, flags.type)
    const original = await readFile(path, "utf8")
    const key = cache ? cacheKey(path, cwd) : ""
    if (cache) {
      const entry = cache.files[key]
      if (
        entry !== undefined &&
        entry.contentHash === hashString(original) &&
        entry.optionsHash === optionsHash &&
        entry.version === version
      ) continue
    }

    const formatted = matchTrailingNewline(original, await transformContent(original, type, opts))
    const unchanged = original === formatted
    if (!unchanged) {
      anyChanged = true
      if (check) {
        io.stderr.write(`Would reformat: ${path}\n`)
      } else {
        await writeFile(path, formatted)
        io.stdout.write(`Reformatted: ${path}\n`)
      }
    }
    if (cache && (unchanged || !check)) {
      cache.files[key] = { contentHash: hashString(formatted), optionsHash, version }
    }
  }

  if (cacheLocation && cache) saveCache(cacheLocation, cache)
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
