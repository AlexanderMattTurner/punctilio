const ERROR_STRING_THRESHOLD = 2000

/**
 * Formats a string for error messages, truncating above the threshold.
 * When the PUNCTILIO_DEBUG environment variable is set to a non-empty
 * value, also writes the full content to stderr in Node.js so build logs
 * capture it.
 */
export function formatErrorString(content: string, label: string): string {
  if (content.length <= ERROR_STRING_THRESHOLD) {
    return JSON.stringify(content)
  }

  // In Node.js, write full content to stderr for debugging when opted in
  try {
    if (globalThis.process?.env?.PUNCTILIO_DEBUG && typeof globalThis.process?.stderr?.write === "function") {
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

/** Throws if `options` contains a key not present in `validKeys`. @internal */
export function assertKnownOptionKeys(
  options: object,
  validKeys: readonly string[],
  context: string,
): void {
  for (const key of Object.keys(options)) {
    if (!validKeys.includes(key)) {
      throw new Error(
        `Unknown option "${key}" for ${context}. Valid options: ${[...validKeys].sort().join(", ")}.`
      )
    }
  }
}

/** Returns a copy of `obj` without the listed keys. @internal */
export function omitKeys<T extends object>(obj: T, keys: readonly string[]): Partial<T> {
  const result: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (!keys.includes(k)) result[k] = v
  }
  return result as Partial<T>
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
    .map(([k, v]) => [k, Array.isArray(v) ? [...v].sort() : v])
  return JSON.stringify(entries)
}
