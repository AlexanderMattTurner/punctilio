import { renameSync, writeFileSync } from "node:fs"

/** Write `contents` to `path` via a temp file + rename so the replacement is atomic. */
export function atomicWrite(path: string, contents: string): void {
  const tmpPath = `${path}.tmp`
  writeFileSync(tmpPath, contents)
  renameSync(tmpPath, path)
}
