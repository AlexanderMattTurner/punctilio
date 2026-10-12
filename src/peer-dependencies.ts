import type { HtmlOptions } from "./html.js"
import type { MarkdownOptions } from "./markdown.js"

export type SinkType = "md" | "html"

/** Imports a bare package specifier; injectable so tests can simulate an uninstalled peer. */
export type PeerImporter = (packageName: string) => Promise<unknown>

export interface SinkTransformers {
  md: (input: string, options: MarkdownOptions) => Promise<string>
  html: (input: string, options: HtmlOptions) => Promise<string>
}

/** The optional peer dependencies each sink needs at runtime. */
export const SINK_PEER_DEPENDENCIES: Readonly<Record<SinkType, readonly string[]>> = {
  md: ["unified", "remark-parse", "remark-gfm", "remark-stringify"],
  html: ["unified", "rehype-parse", "rehype-stringify"],
}

/** Thrown when an optional peer dependency needed for the requested file type is not installed. */
export class MissingPeerDependencyError extends Error {}

const MODULE_NOT_FOUND_CODES = new Set(["ERR_MODULE_NOT_FOUND", "MODULE_NOT_FOUND"])

function isMissingPackage(err: unknown, packageName: string): boolean {
  const { code, message } = err as NodeJS.ErrnoException
  return MODULE_NOT_FOUND_CODES.has(code ?? "") && message.includes(`'${packageName}'`)
}

const importPackage: PeerImporter = (packageName) => import(packageName)

/**
 * Lazily loads the transform for `type`, so only the peers for the file type
 * being processed need to be installed.
 * @throws MissingPeerDependencyError naming every absent peer and the install command.
 */
export async function loadSinkTransform<T extends SinkType>(
  type: T,
  importPeer: PeerImporter = importPackage,
): Promise<SinkTransformers[T]> {
  const missing: string[] = []
  for (const packageName of SINK_PEER_DEPENDENCIES[type]) {
    try {
      await importPeer(packageName)
    } catch (err) {
      if (!isMissingPackage(err, packageName)) throw err
      missing.push(packageName)
    }
  }
  if (missing.length > 0) {
    throw new MissingPeerDependencyError(
      `Processing ${type === "md" ? "Markdown" : "HTML"} files requires ${missing.join(", ")}, which ` +
      `${missing.length === 1 ? "is" : "are"} not installed. Install with: npm install ${missing.join(" ")}`,
    )
  }
  if (type === "md") return (await import("./markdown.js")).transformMarkdown as SinkTransformers[T]
  return (await import("./html.js")).transformHtml as SinkTransformers[T]
}
