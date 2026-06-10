# Security Policy

## Reporting a vulnerability

Please report vulnerabilities privately via [GitHub Security Advisories](https://github.com/alexander-turner/punctilio/security/advisories/new) on `alexander-turner/punctilio`. **Do not open a public issue** for security reports.

You should receive a response within a few days. Please include a minimal reproduction where possible—for this library, that usually means an input string and the options that trigger the problem (e.g. a ReDoS-suspect pattern).

## Supported versions

Only the latest release receives security fixes.

## Supply-chain posture

The project ships some hardening by default: GitHub Actions are pinned to commit SHAs (enforced in CI), and `.npmrc` enables install-time auditing, exact versions, and a minimum release age for dependencies.
