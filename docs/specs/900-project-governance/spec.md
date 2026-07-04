---
afx: true
type: SPEC
status: Living
owner: "@richard-sentino"
version: "1.2"
created_at: "2026-07-02T00:00:00.000Z"
updated_at: "2026-07-06T07:20:42.000Z"
tags: ["governance", "agents", "runbooks", "license", "supply-chain", "truthfulness"]
---

# 900 Project Governance — Spec

> Cross-cutting project governance for Desktop Nano Cortex. This zone owns the
> contributor and agent guidance, manual hardware verification runbooks, release
> checklist, Apache-2.0/license metadata, lightweight dependency checks, community
> health files, the privacy posture, and the truthfulness guard that keeps the app
> honest about explicit MIDI commands vs. provisional BLE readback/write behavior.

## References

- **Project overview**: [`../001-overview/spec.md`](../001-overview/spec.md) — routing index, traceability rules, honest-state glossary
- **DX tooling**: [`../400-dx-tooling/spec.md`](../400-dx-tooling/spec.md) — local lint/format/test command surface
- **CI/release**: [`../500-ci-release/spec.md`](../500-ci-release/spec.md) — automation and release workflow ownership
- **USB MIDI**: [`../100-backend-midi-usb/spec.md`](../100-backend-midi-usb/spec.md) — USB MIDI send/observe behavior
- **BLE**: [`../110-backend-midi-ble/spec.md`](../110-backend-midi-ble/spec.md) — captured BLE readback/command handling
- **Frontend control surface**: [`../200-frontend-control-surface/spec.md`](../200-frontend-control-surface/spec.md) — UI ownership and experimental surface labeling

---

## Problem Statement

Desktop Nano Cortex is useful only if future contributors and coding agents preserve
the product truth: explicit MIDI commands and captured BLE readback are useful, while BLE
fields and write families remain provisional until hardware evidence proves otherwise.
Generic linting is not enough to protect that. The project also needs durable
hand-off docs, manual hardware smoke steps, release checklists, and lightweight
license/dependency governance so that future changes are repeatable and reviewable.

This zone exists to make those practices explicit, discoverable, and tied to the
same AFX traceability system as the code.

---

## Requirements

### Functional Requirements

| ID    | Requirement                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Priority    |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| FR-1  | Add a short, operational `AGENTS.md` that tells coding agents the product truth, governing specs, file ownership map, and required checks.                                                                                                                                                                                                                                                                                                                                                                                                               | Must Have   |
| FR-2  | `AGENTS.md` states that explicit MIDI command paths and hardware-proven BLE fields are authoritative, unverified BLE state is provisional, and fake full-editor/preset-sync/parameter-sync claims are forbidden.                                                                                                                                                                                                                                                                                                                                         | Must Have   |
| FR-3  | `AGENTS.md` lists required checks before claiming done: `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test`, plus hardware smoke when MIDI/BLE behavior changes.                                                                                                                                                                                                                                                                                                                                                                     | Must Have   |
| FR-4  | Add or align `CONTRIBUTING.md` with setup, test commands, traceability expectations, Conventional Commit guidance, and hardware verification expectations.                                                                                                                                                                                                                                                                                                                                                                                               | Must Have   |
| FR-5  | Add `docs/runbooks/hardware-smoke.md` with executable manual Nano Cortex checks for USB send, USB observe, BLE connect/disconnect, and evidence capture.                                                                                                                                                                                                                                                                                                                                                                                                 | Must Have   |
| FR-6  | Add `docs/runbooks/release-checklist.md` covering version sync, verify gates, hardware smoke, tag/release flow, draft release inspection, and unsigned-artifact caveats.                                                                                                                                                                                                                                                                                                                                                                                 | Must Have   |
| FR-7  | Switch project metadata to Apache-2.0 in root `package.json`, `frontend/package.json`, `backend/Cargo.toml`, and root `LICENSE`.                                                                                                                                                                                                                                                                                                                                                                                                                         | Must Have   |
| FR-8  | Add lightweight dependency and license governance: production npm audit scripts, allowed-license checks, and Dependabot for npm, Cargo, and GitHub Actions.                                                                                                                                                                                                                                                                                                                                                                                              | Must Have   |
| FR-9  | Add `.github/PULL_REQUEST_TEMPLATE.md` with traceability, verification, hardware smoke, and truthfulness checklist items.                                                                                                                                                                                                                                                                                                                                                                                                                                | Must Have   |
| FR-10 | Truthfulness guard: no UI, README, spec, PR, or release note may imply full editing, preset sync, parameter sync, or authoritative BLE state unless verified and linked to governing spec/hardware evidence.                                                                                                                                                                                                                                                                                                                                             | Must Have   |
| FR-11 | Add `SECURITY.md` with vulnerability-reporting expectations and a note that hardware/BLE reverse-engineering logs must not contain personal secrets.                                                                                                                                                                                                                                                                                                                                                                                                     | Should Have |
| FR-12 | Add `CHANGELOG.md` as the human-readable release history source used by the release checklist.                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Should Have |
| FR-13 | All new governance docs carry `@see` traceability comments where the file format allows comments, or explicit Markdown links back to this zone where comments are inappropriate.                                                                                                                                                                                                                                                                                                                                                                         | Must Have   |
| FR-14 | `.github/FUNDING.yml` mirrors the in-app About panel support links: GitHub Sponsors `AgenticFlowX`, Ko-fi `rixrix`, Buy Me a Coffee `rixrix`.                                                                                                                                                                                                                                                                                                                                                                                                            | Should Have |
| FR-15 | `PRIVACY.md` documents the honest privacy posture: telemetry (Microsoft Clarity — session interactions, heatmaps, JS errors, plus app diagnostic log lines forwarded as custom events) is enabled by default and can be turned off in About → Telemetry posture; device MIDI/BLE data and diagnostic files never leave the machine regardless of the telemetry setting; the only other network call is the optional once-per-session GitHub release update check; any additional telemetry vendor beyond Clarity must be disclosed here before shipping. | Must Have   |
| FR-16 | `CLAUDE.md` exists as the coding-agent entry point, imports `AGENTS.md` via `@AGENTS.md`, and documents the verify → fix → verify loop plus AFX traceability/frontmatter conventions.                                                                                                                                                                                                                                                                                                                                                                    | Must Have   |
| FR-17 | Community health files: `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1), `.github/CODEOWNERS`, `.github/ISSUE_TEMPLATE/` forms (bug report asks whether the issue concerns documented MIDI or provisional BLE), and `SUPPORT.md`.                                                                                                                                                                                                                                                                                                                        | Should Have |

### Non-Functional Requirements

| ID    | Requirement                                                                                     | Target                 |
| ----- | ----------------------------------------------------------------------------------------------- | ---------------------- |
| NFR-1 | Governance docs stay short enough to be read before coding.                                     | Agent-friendly handoff |
| NFR-2 | Hardware smoke remains manual and does not block CI because CI has no Nano Cortex hardware.     | Architecture invariant |
| NFR-3 | License/dependency checks remain lightweight and compatible with the current npm + Cargo setup. | Low-maintenance DX     |
| NFR-4 | Truthfulness checks are reviewable in PRs even when not fully automatable.                      | Review invariant       |

---

## Acceptance Criteria

- [ ] `AGENTS.md` exists and can guide a new coding agent without reading chat history.
- [ ] `CONTRIBUTING.md` exists and references this zone plus `400-dx-tooling`.
- [ ] `docs/runbooks/hardware-smoke.md` includes prerequisites, pass/fail tables, and evidence format.
- [ ] `docs/runbooks/release-checklist.md` includes version sync, verify gates, smoke gate, tag flow, and unsigned release notes.
- [ ] Root `LICENSE` is Apache-2.0 with `Copyright 2026 Desktop Nano Cortex Contributors`.
- [ ] Root, frontend, and backend package manifests declare Apache-2.0.
- [ ] Dependency/license scripts are available from root `package.json`.
- [ ] Dependabot covers root npm, frontend npm, Cargo, and GitHub Actions.
- [ ] PR template includes the truthfulness guard and hardware-smoke checkbox.
- [ ] `node scripts/check-traceability.mjs` resolves governance references.
- [ ] `.github/FUNDING.yml` lists GitHub Sponsors `AgenticFlowX`, Ko-fi `rixrix`, and Buy Me a Coffee `rixrix`, matching the in-app About panel support links (FR-14).
- [ ] `PRIVACY.md` states: Clarity telemetry is on by default with an off toggle in About, device MIDI/BLE data and diagnostics stay local regardless of the telemetry setting, and the only other network call is the optional once-per-session GitHub release update check (FR-15).
- [ ] `CLAUDE.md` imports `AGENTS.md` via `@AGENTS.md` and documents the verify → fix → verify loop plus AFX traceability/frontmatter conventions (FR-16).
- [ ] `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1), `.github/CODEOWNERS`, `.github/ISSUE_TEMPLATE/` forms, and `SUPPORT.md` exist; the bug report form asks whether the issue concerns documented MIDI or provisional BLE (FR-17).

---

## Non-Goals

- Changing runtime MIDI, BLE, IPC, or UI behavior.
- Automating hardware-in-the-loop tests in CI.
- Migrating from npm to pnpm or adding Turbo.
- Adding heavyweight supply-chain tooling that requires a new hosted service.
- Proving unverified BLE preset/parameter editing.

---

## Dependencies

- Existing root npm scripts and `justfile` commands from `400-dx-tooling`.
- Existing CI/release workflows from `500-ci-release`.
- Current MIDI/BLE truth from `100-backend-midi-usb` and `110-backend-midi-ble`.
- Current frontend labels and experimental gating from `200-frontend-control-surface`.

---

## Appendix

### Owned Files

| File or path                         | Purpose                                                                                              |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `AGENTS.md`                          | Fast operational handoff for coding agents and contributors                                          |
| `CONTRIBUTING.md`                    | Human contribution workflow, setup, commits, verification                                            |
| `SECURITY.md`                        | Vulnerability reporting and security expectations                                                    |
| `CHANGELOG.md`                       | Human-readable release history                                                                       |
| `docs/runbooks/hardware-smoke.md`    | Manual Nano Cortex verification checklist                                                            |
| `docs/runbooks/release-checklist.md` | Release preparation and publishing checklist                                                         |
| `.github/PULL_REQUEST_TEMPLATE.md`   | PR review checklist, including truthfulness guard                                                    |
| `.github/dependabot.yml`             | Scheduled dependency update policy                                                                   |
| `LICENSE`                            | Apache-2.0 license text                                                                              |
| `scripts/check-licenses.mjs`         | Lightweight dependency license allowlist check                                                       |
| `.github/FUNDING.yml`                | Support links mirroring the in-app About panel                                                       |
| `PRIVACY.md`                         | Honest privacy posture: Clarity telemetry on by default with an off toggle, device data always local |
| `CLAUDE.md`                          | Coding-agent entry point; imports `AGENTS.md`, verify loop, AFX conventions                          |
| `CODE_OF_CONDUCT.md`                 | Contributor Covenant 2.1                                                                             |
| `.github/CODEOWNERS`                 | Default review ownership                                                                             |
| `.github/ISSUE_TEMPLATE/`            | Issue forms, including documented-MIDI vs. provisional-BLE bug triage                                |
| `SUPPORT.md`                         | Where to get help and what to include                                                                |
| `docs/runbooks/windows-build.md`     | Borrowed-Windows-machine build procedure (shared with `500-ci-release` FR-18)                        |

### Truthfulness Guard

Forbidden unless hardware-verified and linked to the governing spec/evidence:

- Claims that the app is a full Nano Cortex editor.
- Claims that BLE-derived state is authoritative.
- Claims that preset names, full preset contents, capture/IR data, or arbitrary parameter values are synced.
- UI labels that hide provisional BLE behavior behind confident language.

Allowed language patterns:

- "Documented MIDI"
- "Observed incoming MIDI"
- "Experimental BLE diagnostics"
- "Provisional BLE decode"
- "Hardware verification required"
