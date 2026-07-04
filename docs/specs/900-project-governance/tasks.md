---
afx: true
type: TASKS
status: Living
owner: "@richard-sentino"
version: "1.1"
created_at: "2026-07-02T00:00:00.000Z"
updated_at: "2026-07-06T07:20:42.000Z"
tags: ["governance", "agents", "runbooks", "license", "supply-chain", "truthfulness"]
spec: spec.md
design: design.md
---

# 900 Project Governance — Tasks

> Implementation checklist for project governance and agent handoff. This began
> as a plan-first zone: Phase 1 saved the spec/design/tasks and overview route;
> Phases 2-7 landed the actual repo artifacts on 2026-07-06.

---

## Phase 1: Save Governance Plan

<!-- files: docs/specs/900-project-governance/{spec,design,tasks}.md, docs/specs/001-overview/spec.md -->
<!-- @see docs/specs/900-project-governance/spec.md [FR-1] [FR-5] [FR-6] [FR-7] [FR-8] [FR-10] -->
<!-- @see docs/specs/900-project-governance/design.md [DES-GOV-OVR] [DES-GOV-DEC] -->

- [x] Create `docs/specs/900-project-governance/spec.md`.
- [x] Create `docs/specs/900-project-governance/design.md`.
- [x] Create `docs/specs/900-project-governance/tasks.md`.
- [x] Update `docs/specs/001-overview/spec.md` routing index with `900-project-governance`.

---

## Phase 2: Agent And Contributor Handoff

<!-- files: AGENTS.md, CONTRIBUTING.md -->
<!-- @see docs/specs/900-project-governance/spec.md [FR-1] [FR-2] [FR-3] [FR-4] -->
<!-- @see docs/specs/900-project-governance/design.md [DES-AGENT-GUIDE] [DES-TRUTH-GUARD] -->

- [x] Add `AGENTS.md` with product truth, before-coding rules, verification commands, file ownership map, and governing-spec instructions.
- [x] Add or align `CONTRIBUTING.md` with setup, first-run smoke, coding conventions, traceability, verification commands, and commit guidance.
- [x] Ensure both docs link back to `docs/specs/900-project-governance/spec.md`.

---

## Phase 3: Hardware Smoke Runbook

<!-- files: docs/runbooks/hardware-smoke.md -->
<!-- @see docs/specs/900-project-governance/spec.md [FR-5] [FR-10] -->
<!-- @see docs/specs/900-project-governance/design.md [DES-HARDWARE-SMOKE] [DES-TRUTH-GUARD] -->

- [x] Create `docs/runbooks/hardware-smoke.md`.
- [x] Document prerequisites: Nano Cortex USB connection, OS MIDI permissions, device MIDI out configuration, BLE availability, app commit/version.
- [x] Add USB send checks for PC `0-63`, CC `37-41`, CC `42`, CC `43`, and CC `1`.
- [x] Add USB observe checks for hardware-originated preset/FX changes reflected in app logs/UI.
- [x] Add BLE checks for scan, connect, notification activity, disconnect unsubscribe, and reconnect.
- [x] Add evidence template: date, OS, app commit, firmware if known, pass/fail table, log excerpts.

---

## Phase 4: Release Checklist

<!-- files: docs/runbooks/release-checklist.md, CHANGELOG.md -->
<!-- @see docs/specs/900-project-governance/spec.md [FR-6] [FR-12] -->
<!-- @see docs/specs/900-project-governance/design.md [DES-RELEASE-CHECKLIST] -->

- [x] Create `docs/runbooks/release-checklist.md`.
- [x] Cover version sync across `backend/tauri.conf.json`, `backend/Cargo.toml`, root package metadata, and frontend package metadata if applicable.
- [x] Cover local verification commands, E2E, license/security checks, and hardware smoke completion.
- [x] Cover tag push, release draft inspection, artifact review, and publish steps.
- [x] Document unsigned v1.0.0 macOS Gatekeeper and Windows SmartScreen caveats.
- [x] Add `CHANGELOG.md` if missing and link it from the release checklist.

---

## Phase 5: Apache License And Dependency Governance

<!-- files: LICENSE, package.json, frontend/package.json, backend/Cargo.toml, scripts/check-licenses.mjs, .github/dependabot.yml -->
<!-- @see docs/specs/900-project-governance/spec.md [FR-7] [FR-8] -->
<!-- @see docs/specs/900-project-governance/design.md [DES-LICENSE-SUPPLY] -->

- [x] Add root `LICENSE` with Apache-2.0 text and `Copyright 2026 Desktop Nano Cortex Contributors`.
- [x] Add `"license": "Apache-2.0"` to root `package.json` and `frontend/package.json`.
- [x] Add `license = "Apache-2.0"` to `backend/Cargo.toml`.
- [x] Update npm lockfiles for package metadata if needed.
- [x] Add lightweight license allowlist script.
- [x] Add root npm scripts for production audit, license check, and composed security check.
- [x] Add Dependabot entries for root npm, frontend npm, backend Cargo, and GitHub Actions.

---

## Phase 6: PR Truthfulness Checklist

<!-- files: .github/PULL_REQUEST_TEMPLATE.md, SECURITY.md -->
<!-- @see docs/specs/900-project-governance/spec.md [FR-9] [FR-10] [FR-11] -->
<!-- @see docs/specs/900-project-governance/design.md [DES-TRUTH-GUARD] -->

- [x] Add `.github/PULL_REQUEST_TEMPLATE.md` with traceability, verification, hardware smoke, and truthfulness guard checkboxes.
- [x] Add `SECURITY.md` with vulnerability reporting expectations and BLE/hardware log hygiene.
- [x] Ensure PR template asks reviewers to reject unsupported claims of full editing, preset sync, parameter sync, or authoritative BLE state.
- [x] Ensure PR template asks for hardware-smoke evidence when MIDI/BLE behavior changes.

---

## Phase 7: Community Health, Privacy, And Agent Entry

<!-- files: .github/FUNDING.yml, PRIVACY.md, CLAUDE.md, CODE_OF_CONDUCT.md, .github/CODEOWNERS, .github/ISSUE_TEMPLATE/, SUPPORT.md -->
<!-- @see docs/specs/900-project-governance/spec.md [FR-14] [FR-15] [FR-16] [FR-17] -->
<!-- @see docs/specs/900-project-governance/design.md [DES-GOV-COMMUNITY] -->

- [x] Add `.github/FUNDING.yml` mirroring the in-app About panel support links: GitHub Sponsors `AgenticFlowX`, Ko-fi `rixrix`, Buy Me a Coffee `rixrix`.
- [x] Add `PRIVACY.md`: Clarity telemetry on by default with an off toggle in About, device MIDI/BLE data and diagnostics always stay local, sole other network call is the optional once-per-session GitHub release update check (superseded 2026-07-06 — see the telemetry task row below; originally shipped as zero-telemetry, revised at the maintainer's direction).
- [x] Add `CLAUDE.md` as the coding-agent entry point: imports `AGENTS.md` via `@AGENTS.md`, documents the verify → fix → verify loop plus AFX traceability/frontmatter conventions.
- [x] Add `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1).
- [x] Add `.github/CODEOWNERS`.
- [x] Add `.github/ISSUE_TEMPLATE/` forms; the bug report asks whether the issue concerns documented MIDI or provisional BLE.
- [x] Add `SUPPORT.md`.
- [x] Revise `PRIVACY.md` (2026-07-06, maintainer direction): reverse the zero-telemetry stance to default-on Microsoft Clarity with an off toggle in About; update `AGENTS.md`, `README.md`, and `210-frontend-ipc-contracts` FR-28 / `[DES-SHARED-TELEMETRY]` to match. See `docs/specs/210-frontend-ipc-contracts/spec.md` [FR-28] for the underlying module.

---

## Work Sessions

<!-- Append-only. Columns: Date | Task | Action | Files | Agent | Human -->

| Date       | Task                                                      | Action  | Files Modified                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Agent | Human |
| ---------- | --------------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ----- |
| 2026-07-02 | Phase 1                                                   | Planned | docs/specs/900-project-governance/{spec,design,tasks}.md, docs/specs/001-overview/spec.md                                                                                                                                                                                                                                                                                                                                                                             | [x]   | [x]   |
| 2026-07-06 | Phases 2-7 (governance artifacts landed)                  | Coded   | AGENTS.md, CONTRIBUTING.md, docs/runbooks/hardware-smoke.md, docs/runbooks/release-checklist.md, CHANGELOG.md, LICENSE, package.json, frontend/package.json, backend/Cargo.toml, scripts/check-licenses.mjs, .github/dependabot.yml, .github/PULL_REQUEST_TEMPLATE.md, SECURITY.md, .github/FUNDING.yml, PRIVACY.md, CLAUDE.md, CODE_OF_CONDUCT.md, .github/CODEOWNERS, .github/ISSUE_TEMPLATE/, SUPPORT.md, docs/specs/900-project-governance/{spec,design,tasks}.md | [x]   | [x]   |
| 2026-07-06 | Telemetry stance reversal: default-on Clarity, off toggle | Coded   | PRIVACY.md, AGENTS.md, README.md, frontend/src/shared/telemetry/clarity.ts, frontend/src/shared/hooks/useLogs.tsx, frontend/src/app/main.tsx, frontend/src/features/midi/components/AboutPanel.tsx, docs/specs/210-frontend-ipc-contracts/{spec,design}.md, docs/specs/200-frontend-control-surface/spec.md, docs/specs/900-project-governance/{spec,design,tasks}.md                                                                                                 | [x]   | [ ]   |
