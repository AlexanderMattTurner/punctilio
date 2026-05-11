# CLAUDE.md

## Design Philosophy

- Minimal, targeted changes only
- Verify all information before generating code
- Derive style from existing codebase
- Security-first approach
- Modern best practices with explicit typing
- No unnecessary refactoring or whitespace changes

## Development Practices

### Before Writing Code

- Ask clarifying questions if uncertain about scope or approach
- Check for existing libraries before rolling custom solutions
- Look for existing patterns in the codebase before creating new ones

### Code Style

- Prefer throwing errors that "fail loudly" over logging warnings for critical issues
- Un-nest conditionals where possible; combine related checks into single blocks
- Create shared helpers when the same logic is needed in multiple places
- Use descriptive variable names; don't shorten for brevity
- Split complex regex logic into named helper functions (pattern builder + replace callback)
- Never leave comments that describe code that's no longer there ("the prior form did X", "previously this was Y", "we used to..."). Comments describe the current code; the diff and PR description carry the history. If a comment would lose its meaning once the change is merged and the diff is forgotten, rewrite it.

### Testing

- Parametrize tests for maximum compactness while achieving high coverage
- Write focused, non-duplicative tests
