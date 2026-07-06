#!/usr/bin/env node

import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { readFile, rename, writeFile } from "node:fs/promises"
import { dirname, extname, isAbsolute, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"

import { cosmiconfig } from "cosmiconfig"
import ignore, { type Ignore } from "ignore"
import { glob } from "tinyglobby"

import { MARKDOWN_ONLY_OPTION_KEYS, MARKDOWN_OPTION_KEYS, type MarkdownOptions, transformMarkdown } from "./markdown.js"
import { HTML_ONLY_OPTION_KEYS, HTML_OPTION_KEYS, type HtmlOptions, transformHtml } from "./html.js"
import { PUNCTUATION_STYLES, type PunctuationStyle } from "./quotes.js"
import { DASH_STYLES, type DashStyle } from "./dashes.js"
import { assertKnownOptionKeys, omitKeys, stableStringify } from "./utils.js"

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

// camelCased flag values; buildFlags validates choice literals at runtime.
interface ParsedFlags {
  write?: boolean
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

const PARSE_ARGS_OPTIONS = {
  "bullet-marker": { type: "string" },
  "cache-location": { type: "string" },
  check: { type: "boolean" },
  config: { type: "string" },
  "dash-style": { type: "string" },
  degrees: { type: "boolean" },
  "emphasis-marker": { type: "string" },
  fractions: { type: "boolean" },
  help: { short: "h", type: "boolean" },
  "ignore-path": { type: "string" },
  ligatures: { type: "boolean" },
  nbsp: { type: "boolean" },
  "no-arrows": { type: "boolean" },
  "no-cache": { type: "boolean" },
  "no-collapse-spaces": { type: "boolean" },
  "no-config": { type: "boolean" },
  "no-fragment": { type: "boolean" },
  "no-nbsp": { type: "boolean" },
  "no-symbols": { type: "boolean" },
  "punctuation-style": { type: "string" },
  "rule-marker": { type: "string" },
  "skip-class": { multiple: true, type: "string" },
  "skip-tag": { multiple: true, type: "string" },
  "stdin-filepath": { type: "string" },
  "strong-marker": { type: "string" },
  superscript: { type: "boolean" },
  type: { type: "string" },
  version: { short: "V", type: "boolean" },
  write: { type: "boolean" },
} as const

const HELP_TEXT = `Usage: punctilio [options] [files...]

Apply typographic improvements to Markdown and HTML files.

Arguments:
  files                       files to format (pass '-' to read from stdin)

Options:
  -V, --version               show version
  --write                     rewrite files in place (default prints formatted output to stdout)
  --check                     exit 1 if any file would change; write nothing
  --config <path>             path to a punctilio config file (otherwise auto-discovered)
  --no-config                 ignore any auto-discovered config file
  --ignore-path <path>        path to an ignore file (otherwise .punctilioignore in cwd)
  --no-cache                  disable the incremental cache (default location node_modules/.cache/punctilio/cache.json)
  --cache-location <path>     override the cache file location
  --stdin-filepath <path>     treat stdin as if it were this filename (infers type from extension)
  --type <type>               force file type (otherwise inferred from extension) (choices: ${FILE_TYPES.join(", ")})
  --punctuation-style <style> quote and punctuation style (choices: ${PUNCTUATION_STYLES.join(", ")})
  --dash-style <style>        dash style (choices: ${DASH_STYLES.join(", ")})
  --no-symbols                disable symbol transforms (ellipsis, ×, ©, etc.)
  --nbsp                      enable non-breaking space insertion (default: on for HTML, off for Markdown)
  --no-nbsp                   disable non-breaking space insertion
  --no-collapse-spaces        preserve runs of consecutive spaces
  --no-arrows                 disable -> → arrow transforms
  --fractions                 enable 1/2 → ½
  --degrees                   enable 20 C → 20 °C
  --superscript               enable 1st → 1ˢᵗ
  --ligatures                 enable !? → ⁉
  --emphasis-marker <char>    markdown emphasis character (choices: ${EMPHASIS_MARKERS.join(", ")})
  --strong-marker <char>      markdown strong emphasis character (choices: ${EMPHASIS_MARKERS.join(", ")})
  --bullet-marker <char>      markdown list bullet character (choices: ${BULLET_MARKERS.join(", ")})
  --rule-marker <char>        markdown thematic break character (choices: ${RULE_MARKERS.join(", ")})
  --skip-tag <tag>            HTML tag whose contents are left alone (repeatable)
  --skip-class <class>        HTML class name whose elements are skipped (repeatable)
  --no-fragment               parse input as a full HTML document
  -h, --help                  display help for command
`

function parseRawArgs(args: string[]) {
  try {
    return parseArgs({
      args,
      allowPositionals: true,
      options: PARSE_ARGS_OPTIONS,
      strict: true,
      tokens: true,
    })
  } catch (err) {
    // parseArgs throws on unknown options and missing option values.
    throw new UsageError((err as Error).message)
  }
}

type ParsedValues = ReturnType<typeof parseRawArgs>["values"]
type ParsedTokens = ReturnType<typeof parseRawArgs>["tokens"]

function parseChoice<T extends string>(
  flag: string,
  value: string | undefined,
  choices: readonly T[],
): T | undefined {
  if (value === undefined) return undefined
  if (!(choices as readonly string[]).includes(value)) {
    throw new UsageError(
      `option '${flag}' argument '${value}' is invalid. Allowed choices are ${choices.join(", ")}.`,
    )
  }
  return value as T
}

/** Maps a `--no-x` boolean to the library's `x: false`, or undefined when unset. */
function negated(noFlag: boolean | undefined): false | undefined {
  return noFlag ? false : undefined
}

/** Returns the name of whichever of `names` appears last on the command line. */
function lastFlagToken(tokens: ParsedTokens, names: readonly string[]): string | undefined {
  let lastName: string | undefined
  for (const token of tokens) {
    if (token.kind === "option" && names.includes(token.name)) lastName = token.name
  }
  return lastName
}

function buildFlags(values: ParsedValues, tokens: ParsedTokens): ParsedFlags {
  const flags: ParsedFlags = {
    write: values.write,
    check: values.check,
    cache: negated(values["no-cache"]),
    cacheLocation: values["cache-location"],
    ignorePath: values["ignore-path"],
    stdinFilepath: values["stdin-filepath"],
    type: parseChoice("--type", values.type, FILE_TYPES),
    punctuationStyle: parseChoice("--punctuation-style", values["punctuation-style"], PUNCTUATION_STYLES),
    dashStyle: parseChoice("--dash-style", values["dash-style"], DASH_STYLES),
    symbols: negated(values["no-symbols"]),
    collapseSpaces: negated(values["no-collapse-spaces"]),
    arrows: negated(values["no-arrows"]),
    fractions: values.fractions,
    degrees: values.degrees,
    superscript: values.superscript,
    ligatures: values.ligatures,
    emphasisMarker: parseChoice("--emphasis-marker", values["emphasis-marker"], EMPHASIS_MARKERS),
    strongMarker: parseChoice("--strong-marker", values["strong-marker"], EMPHASIS_MARKERS),
    bulletMarker: parseChoice("--bullet-marker", values["bullet-marker"], BULLET_MARKERS),
    ruleMarker: parseChoice("--rule-marker", values["rule-marker"], RULE_MARKERS),
    skipTag: values["skip-tag"],
    skipClass: values["skip-class"],
    fragment: negated(values["no-fragment"]),
  }
  // nbsp is tri-state: --nbsp / --no-nbsp / unset stays undefined so the
  // per-sink default applies (on for HTML, off for Markdown). When both
  // appear, the last one on the command line wins.
  const nbspToken = lastFlagToken(tokens, ["nbsp", "no-nbsp"])
  if (nbspToken !== undefined) flags.nbsp = nbspToken === "nbsp"
  // config is likewise last-one-wins between --config <path> and --no-config.
  const configToken = lastFlagToken(tokens, ["config", "no-config"])
  if (configToken !== undefined) flags.config = configToken === "config" ? values.config : false
  return flags
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

// A config file may legitimately mix markdown-only and HTML-only keys for use
// across file types; transformContent strips the keys the sink doesn't accept.
const CLI_CONFIG_KEYS: readonly string[] = [
  ...new Set([...MARKDOWN_OPTION_KEYS, ...HTML_OPTION_KEYS]),
]

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
  try {
    assertKnownOptionKeys(result.config as object, CLI_CONFIG_KEYS, `config file ${result.filepath}`)
  } catch (err) {
    throw new UsageError((err as Error).message)
  }
  return result.config as CliOptions
}

function loadIgnore(cwd: string, ignorePath: string | undefined): Ignore {
  const ig = ignore()
  const effective = ignorePath ?? join(cwd, ".punctilioignore")
  if (existsSync(effective)) ig.add(readFileSync(effective, "utf8"))
  return ig
}

function hasGlobMetacharacters(pattern: string): boolean {
  return /[*?[\]{}]/.test(pattern)
}

// A positional is a literal path when it has no glob metacharacters, or when a
// file with that exact name exists on disk (so a real file named `note[1].md`
// is not mistaken for a glob).
function isLiteralPath(pattern: string, cwd: string): boolean {
  return !hasGlobMetacharacters(pattern) || existsSync(resolve(cwd, pattern))
}

// Literal positionals pass through untouched so they error loudly if missing and
// bypass ignore rules (naming a file explicitly is an intent to format it).
// Ignore rules and the zero-match warning apply only to glob-expanded paths.
async function discoverFiles(
  patterns: string[],
  cwd: string,
  ig: Ignore,
  stderr: NodeJS.WritableStream,
): Promise<string[]> {
  const literals = patterns.filter((p) => isLiteralPath(p, cwd))
  const globs = patterns.filter((p) => !isLiteralPath(p, cwd))
  const expanded = globs.length > 0
    ? await glob(globs, { cwd, absolute: true, onlyFiles: true })
    : []
  const kept = expanded.filter((file) => {
    const rel = relative(cwd, file)
    return rel.startsWith("..") || !ig.ignores(rel)
  })
  if (globs.length > 0 && kept.length === 0) {
    stderr.write(`Warning: no files matched: ${globs.join(" ")}\n`)
  }
  return [...new Set([...literals.map((p) => resolve(cwd, p)), ...kept])]
}

interface CacheEntry {
  contentHash: string
  optionsHash: string
  type: FileType
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

// Replace a file's contents atomically: write a sibling temp file, then rename
// it over the target so an interrupted run can never leave a half-written file.
async function atomicWriteFile(path: string, contents: string): Promise<void> {
  const tmpPath = `${path}.${process.pid}.tmp`
  await writeFile(tmpPath, contents)
  await rename(tmpPath, path)
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
  if (flags.nbsp !== undefined) opts.nbsp = flags.nbsp
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

// The merged options may carry keys for the other sink (e.g. emphasisMarker
// alongside skipTags from one shared config); strip the inapplicable ones so
// each sink's strict key validation only sees keys it understands.
async function transformContent(input: string, type: FileType, opts: CliOptions): Promise<string> {
  return type === "md"
    ? transformMarkdown(input, omitKeys(opts, HTML_ONLY_OPTION_KEYS) as MarkdownOptions)
    : transformHtml(input, omitKeys(opts, MARKDOWN_ONLY_OPTION_KEYS) as HtmlOptions)
}

// The unified pipelines emit LF-only output and unconditionally append a
// trailing newline. Restore the source's line-ending style and trailing-newline
// presence so a CRLF file doesn't gain mixed endings (which would make --check
// report a change forever and --write churn on every run).
function matchLineEndings(original: string, formatted: string): string {
  // Normalize the LF output back to CRLF when the source used it.
  let out = original.includes("\r\n")
    ? formatted.replace(/\r\n/g, "\n").replace(/\n/g, "\r\n")
    : formatted
  // Drop the appended trailing newline if the original had none.
  if (!/\n$/.test(original)) out = out.replace(/\r?\n$/, "")
  return out
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

  try {
    const { positionals, tokens, values } = parseRawArgs(args)
    if (values.help) {
      io.stdout.write(HELP_TEXT)
      return 0
    }
    if (values.version) {
      io.stdout.write(`${version}\n`)
      return 0
    }
    return await runValidated(buildFlags(values, tokens), positionals, io, version)
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
  const write = flags.write ?? false
  if (check && write) {
    throw new UsageError("--write and --check are mutually exclusive.")
  }

  if (readsStdin(positionals, flags)) {
    if (write) {
      throw new UsageError("--write cannot be used when reading from stdin.")
    }
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
    const output = matchLineEndings(input, await transformContent(input, type, opts))
    if (check) return input === output ? 0 : 1
    io.stdout.write(output)
    return 0
  }

  if (positionals.length === 0) {
    io.stderr.write(HELP_TEXT)
    return 2
  }

  const ig = loadIgnore(cwd, flags.ignorePath)
  const files = await discoverFiles(positionals, cwd, ig, io.stderr)

  // In stdout mode every file's content must be produced, so a cache hit
  // could never skip work; only --write and --check use the cache.
  const cacheLocation = flags.cache === false || (!write && !check)
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
        entry.type === type &&
        entry.version === version
      ) continue
    }

    const formatted = matchLineEndings(original, await transformContent(original, type, opts))
    if (!write && !check) {
      io.stdout.write(formatted)
      continue
    }
    const unchanged = original === formatted
    if (!unchanged) {
      anyChanged = true
      if (check) {
        io.stderr.write(`Would reformat: ${path}\n`)
      } else {
        await atomicWriteFile(path, formatted)
        io.stdout.write(`Reformatted: ${path}\n`)
      }
    }
    if (cache && (unchanged || !check)) {
      cache.files[key] = { contentHash: hashString(formatted), optionsHash, type, version }
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
