---
afx: true
type: TASKS
status: Living
owner: "@richard-sentino"
version: "2.0"
created_at: "2026-06-10T11:54:35.000Z"
updated_at: "2026-07-04T10:47:11.000Z"
tags: ["overview", "graduation", "traceability"]
spec: spec.md
design: design.md
---

# Desktop Nano Cortex — Overview Tasks

> Graduation + repo-polish tasks. Per-feature implementation tasks live in each zone's `tasks.md`.

---

## Phase 1 — Spec graduation

### 1.1 Establish taxonomy and routing index

<!-- files: docs/specs/001-overview/{spec,design,tasks}.md -->
<!-- @see docs/specs/001-overview/spec.md [FR-2] [FR-3] -->

- [x] Define numbering ranges, traceability contract, and the authoritative routing index.
- [x] Archive the single sprint brief under `docs/specs/archive/`.

### 1.2 Split into zone specs

<!-- files: docs/specs/{100,110,120,130,200,210,400,500}-*/ -->
<!-- @see docs/specs/001-overview/spec.md [FR-3] [FR-4] -->

- [x] Create one zone folder per owned surface with spec/design/tasks and zone-local node IDs.

---

## Phase 2 — Repo polish

### 2.1 Tooling, traceability, and tests

<!-- files: see zones 400-dx-tooling, 500-ci-release -->
<!-- @see docs/specs/001-overview/spec.md [FR-1] [FR-8] -->

- [x] Add ESLint + Prettier + rustfmt/clippy config and npm/cargo scripts (zone 400).
- [x] Gate + label experimental UI behind `EXPERIMENTAL_FEATURES` (zone 200).
- [ ] Add `@see` traceability headers to all owned source files.
- [ ] Add Rust + Vitest unit tests and Playwright E2E (zone 400).
- [ ] Add CI workflow (zone 500).

---

## Work Sessions

<!-- Append-only. Columns: Date | Task | Action | Files | Agent | Human -->

| Date       | Task     | Action | Files Modified                               | Agent | Human |
| ---------- | -------- | ------ | -------------------------------------------- | ----- | ----- |
| 2026-06-13 | 1.1, 1.2 | Coded  | docs/specs/** (graduation from sprint brief) | [x]   | [x]   |
| 2026-06-13 | 2.1      | Coded  | tooling configs, experimental gating         | [x]   | [x]   |
