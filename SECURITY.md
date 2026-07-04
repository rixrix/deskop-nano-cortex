# Security Policy

<!-- @see docs/specs/900-project-governance/spec.md [FR-11] -->

## Reporting a vulnerability

Report vulnerabilities privately via
[GitHub Security Advisories](https://github.com/rixrix/deskop-nano-cortex/security/advisories/new).
Do **not** open a public issue for security problems.

This is a solo-maintainer project: reports are handled best-effort, and there is
no bug-bounty program.

## Supported versions

Current supported line: **1.0.x**. Only the newest 1.0.x release receives
fixes. Update to the newest version before reporting.

## Logs and captures

BLE/USB reverse-engineering captures and diagnostic logs are often useful in
reports — but scrub them first. Do not attach anything containing personal
secrets (tokens, paths revealing private data, credentials). The `logs/`
directory is gitignored for a reason; treat its contents as potentially
sensitive before sharing.
