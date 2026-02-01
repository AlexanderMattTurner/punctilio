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

### Testing

- Parametrize tests for maximum compactness while achieving high coverage
- Write focused, non-duplicative tests
