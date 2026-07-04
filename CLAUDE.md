@AGENTS.md

> **Verification**: run `npm run verify` after every change; `npm run fix` to auto-resolve
> mechanical violations, then `npm run verify` again. `npm run verify:full` before merging.
> See `## Verification` in AGENTS.md for the full loop.

## Documentation References (Living Documentation Traceability)

> Bidirectional code↔spec linking keeps agents aligned with the specs. The gate:
> `npm run lint:trace` (part of `npm run lint`).

All spec-driven files MUST have a top-level comment with `@see` references linking back to the
governing zone documents:

```typescript
/**
 * Brief description of what this file does.
 *
 * @see docs/specs/XXX-zone-name/spec.md [FR-X]
 * @see docs/specs/XXX-zone-name/design.md [DES-SECTION]
 */
```

Rust uses `//` doc comments, scripts (`.mjs`) use `//`, YAML/TOML/ini configs use `#`, JSONC uses
`//`. One `@see` line per target doc; multiple space-separated IDs on a line mean the file
implements all of them.

**Node ID format:**

- Spec anchors: `[FR-X]` / `[NFR-X]` matching the requirement tables in `spec.md`
- Design anchors: `[DES-SECTION]` — uppercase kebab-case section anchors in `design.md`
- Never link into `docs/specs/archive/` — archived briefs are superseded

**Inline annotations** (`TODO`, `FIXME`, `NOTE`, …) must carry a spec link:

```typescript
// TODO: debounce preset-change bursts
// @see docs/specs/100-backend-midi-usb/spec.md [FR-4]
```

### AFX Frontmatter Schema

All AFX-managed docs use YAML frontmatter; `afx: true` marks AFX ownership:

```yaml
---
afx: true
type: SPEC # SPEC | DESIGN | TASKS
status: Living # Draft | Approved | Planned | Living
owner: "@handle"
version: "1.0"
created_at: YYYY-MM-DDTHH:MM:SS.mmmZ # ISO 8601, millisecond precision
updated_at: YYYY-MM-DDTHH:MM:SS.mmmZ
tags: [feature, topic]
---
```

> **Timestamp rule:** always run `date -u +"%Y-%m-%dT%H:%M:%S.000Z"` for timestamps. Never guess,
> never use midnight.

YAML frontmatter is the single source of truth for status/version/owner — do not duplicate these
as bold lines in the markdown body.

### Session continuity

The spec tells you _what_ to build; the zone's `tasks.md` tells you _where work left off_.

- After completing work in a zone: update `tasks.md` checkboxes and append a Work Session row
  (the Work Sessions table stays the LAST section).
- When resuming: read the zone's `spec.md` → `design.md` → `tasks.md` before touching code.
- Cross-cutting plans live in `docs/specs/plans/` — check there for in-flight multi-zone work.

### Global vs feature context

- **Global (`CLAUDE.md` / `AGENTS.md`)**: product truth, verification loop, commit rules, layout.
- **Feature (zone docs)**: exact requirements, design anchors, and honest-state labelling for that
  surface. Always check the zone docs before implementing against them.
