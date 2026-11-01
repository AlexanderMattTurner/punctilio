/**
 * Corpus oracle for `transformMarkdown`: every Markdown file in the repository
 * must re-parse to exactly the text remarkPunctilio produces on it, so every
 * edit was written in place. It transforms whole documents, so Stryker leaves
 * it out (see jest.stryker.config.js).
 */

import { readFileSync } from "fs"
import { resolve } from "path"
import { fileURLToPath } from "url"
import { globSync } from "tinyglobby"

import { transformMarkdownSync } from "../markdown.js"
import { markdownTextOracle } from "./markdown-oracle.js"

const __dirname = fileURLToPath(new URL(".", import.meta.url))

describe("transformMarkdown corpus oracle", () => {
  const FRONTMATTER_RE = /^---\r?\n[\s\S]*?\r?\n---\r?\n/
  const repoRoot = resolve(__dirname, "../..")
  const files = globSync("**/*.md", {
    cwd: repoRoot,
    dot: true,
    ignore: ["**/node_modules/**", "dist/**", ".stryker-tmp/**", "reports/**", ".claude/worktrees/**"],
  })

  it("finds the corpus", () => {
    expect(files.length).toBeGreaterThan(10)
  })

  // Re-parsing the output must yield exactly the text remarkPunctilio
  // produces on the parsed input: every edit was written in place.
  it.each(files)("%s", (file) => {
    const input = readFileSync(resolve(repoRoot, file), "utf-8").replace(FRONTMATTER_RE, "")
    const { transformed, actual } = markdownTextOracle(input, transformMarkdownSync(input))
    expect(actual).toEqual(transformed)
  })
})
