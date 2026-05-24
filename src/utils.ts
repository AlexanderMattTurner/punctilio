import { DEFAULT_SEPARATOR, ISSUES_URL } from "./constants.js"

const ERROR_STRING_THRESHOLD = 2000

/**
 * Formats a string for error messages, truncating above the threshold.
 * Writes full content to stderr in Node.js so build logs capture it.
 */
export function formatErrorString(content: string, label: string): string {
  if (content.length <= ERROR_STRING_THRESHOLD) {
    return JSON.stringify(content)
  }

  // In Node.js, write full content to stderr for debugging
  try {
    if (typeof globalThis.process?.stderr?.write === "function") {
      globalThis.process.stderr.write(
        `\n[punctilio ${label} full content (${content.length} chars)]:\n${content}\n\n`
      )
    }
  } catch {
    // Ignore — not in Node.js or stderr unavailable
  }

  const truncated = content.slice(0, ERROR_STRING_THRESHOLD)
  return `[${label}: ${JSON.stringify(truncated)}... (${content.length} chars total)]`
}

/** Throws if any text node contains the separator (would corrupt split/join). */
export function assertSeparatorAbsent(textValues: string[], separator: string): void {
  for (const value of textValues) {
    if (!value.includes(separator)) continue

    const codePoints = [...separator]
      .map(ch => `U+${ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}`)
      .join(" ")
    throw new Error(
      `Text contains the separator sequence ${codePoints} which is used internally by punctilio ` +
      `to track element boundaries. Pass a different separator via the "separator" option.\n` +
      `Text: ${formatErrorString(value, "input")}`
    )
  }
}

export function countSeparators(text: string, separator: string = DEFAULT_SEPARATOR): number {
  if (separator.length === 0) return 0
  let count = 0
  let index = 0
  while ((index = text.indexOf(separator, index)) !== -1) {
    count++
    index += separator.length
  }
  return count
}

interface TextNode {
  value: string
}

/**
 * Applies a text transformation across an array of text nodes using the
 * separator-marking technique: appends the separator to each node's value,
 * concatenates, transforms, then splits back on the separator and writes
 * each fragment into the corresponding text node. Mutates `textNodes`.
 */
export function transformTextNodes(
  textNodes: TextNode[],
  transformFn: (input: string) => string,
  separator: string,
): void {
  assertSeparatorAbsent(textNodes.map((n) => n.value), separator)

  const markedContent = textNodes.map((n) => n.value + separator).join("")
  const transformedContent = transformFn(markedContent)
  const transformedFragments = transformedContent.split(separator).slice(0, -1)

  /* istanbul ignore if -- defensive: transform should never consume separator chars */
  if (transformedFragments.length !== textNodes.length) {
    throw new Error(
      `Transformation altered the number of text nodes. ` +
        `Expected ${textNodes.length}, got ${transformedFragments.length}. ` +
        `Input: ${formatErrorString(markedContent, "input")}`
    )
  }

  textNodes.forEach((n, index) => {
    n.value = transformedFragments[index]
  })
}

/** Throws if a transformation changed the separator count. */
export function assertSeparatorCountPreserved(
  original: string,
  transformed: string,
  separator: string = DEFAULT_SEPARATOR,
  transformName: string = "transform"
): void {
  const originalCount = countSeparators(original, separator)
  const transformedCount = countSeparators(transformed, separator)
  if (originalCount !== transformedCount) {
    throw new Error(
      `${transformName} altered separator count: expected ${originalCount}, got ${transformedCount}.\n` +
      `This is a bug in punctilio. Please file an issue at ${ISSUES_URL}\n` +
      `Include the input text that caused this error.`
    )
  }
}

/** Returns a copy of `obj` with `undefined`-valued keys removed. @internal */
export function filterUndefined<T extends object>(obj: T): Partial<T> {
  const result: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) result[k] = v
  }
  return result as Partial<T>
}

/** Deterministic JSON string for an options object, suitable as cache key. @internal */
export function stableStringify(obj: object): string {
  const entries = Object.entries(obj)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
  return JSON.stringify(entries)
}

/** Extracts named groups from a `.replace()` callback's arguments. @internal */
export function namedGroups<G>(args: unknown[]): G {
  return args[args.length - 1] as G
}
