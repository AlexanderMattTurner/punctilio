import { pinReadmeRev, README_PATH } from "../../scripts/pin-readme-rev.impl.js"

const README = `# punctilio

### pre-commit

\`\`\`yaml
# .pre-commit-config.yaml
repos:
  - repo: https://github.com/AlexanderMattTurner/punctilio
    rev: v5.0.0
    hooks:
      - id: punctilio
\`\`\`
`

describe("pinReadmeRev", () => {
  it("rewrites the rev line to the new version", () => {
    const outcome = pinReadmeRev(README, "5.2.3")
    expect(outcome.pinned).toBe(true)
    if (!outcome.pinned) throw new Error("expected a pin")
    expect(outcome.readme).toContain("rev: v5.2.3")
    expect(outcome.readme).not.toContain("rev: v5.0.0")
    expect(outcome.message).toContain("v5.2.3")
  })

  it("touches only the rev line, leaving the rest byte-identical", () => {
    const outcome = pinReadmeRev(README, "5.2.3")
    if (!outcome.pinned) throw new Error("expected a pin")
    expect(outcome.readme).toBe(README.replace("rev: v5.0.0", "rev: v5.2.3"))
  })

  it.each([
    ["undefined version", undefined, "missing or malformed"],
    ["malformed version", "5.x", "missing or malformed"],
  ])("skips on %s", (_name, version, expected) => {
    const outcome = pinReadmeRev(README, version)
    expect(outcome.pinned).toBe(false)
    expect(outcome.message).toContain(expected)
  })

  it("skips and warns when the pre-commit block is absent", () => {
    const outcome = pinReadmeRev("# punctilio\n\nNo hooks here.\n", "5.2.3")
    expect(outcome.pinned).toBe(false)
    expect(outcome.message).toContain(`pattern not found in ${README_PATH}`)
  })

  it("is a no-op when the rev already matches", () => {
    const outcome = pinReadmeRev(README, "5.0.0")
    expect(outcome.pinned).toBe(false)
    expect(outcome.message).toContain("already at v5.0.0")
  })

  it.each([
    ["trailing space after the repo URL", "/punctilio", "/punctilio  "],
    ["tab indentation before rev", "    rev:", "\trev:"],
    ["extra spaces after rev:", "rev: v5.0.0", "rev:   v5.0.0"],
  ])("tolerates %s", (_name, from, to) => {
    const outcome = pinReadmeRev(README.replace(from, to), "5.2.3")
    expect(outcome.pinned).toBe(true)
    if (!outcome.pinned) throw new Error("expected a pin")
    expect(outcome.readme).toContain("v5.2.3")
  })

  it("does not match a rev line under a different repo", () => {
    const other = README.replace(
      "https://github.com/AlexanderMattTurner/punctilio",
      "https://github.com/someone-else/other-tool",
    )
    const outcome = pinReadmeRev(other, "5.2.3")
    expect(outcome.pinned).toBe(false)
    expect(outcome.message).toContain("pattern not found")
  })
})
