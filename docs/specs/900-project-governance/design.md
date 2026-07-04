---
afx: true
type: DESIGN
status: Living
owner: "@richard-sentino"
version: "1.1"
created_at: "2026-07-02T00:00:00.000Z"
updated_at: "2026-07-06T07:20:42.000Z"
tags: ["governance", "agents", "runbooks", "license", "supply-chain", "truthfulness"]
spec: spec.md
---

# 900 Project Governance — Design

## [DES-GOV-OVR] Overview

This zone adds project memory in the repo itself: a coding-agent guide, human
contribution docs, hardware smoke runbooks, release checklist, and lightweight
license/dependency checks. These artifacts are not runtime features, but they
protect the runtime by making future changes harder to misrepresent.

The design follows the existing repo shape:

- Docs live in root Markdown files or `docs/runbooks/`.
- Automation stays behind root npm scripts where possible.
- GitHub metadata lives in `.github/`.
- Specs remain the source of truth for why each artifact exists.

---

## [DES-AGENT-GUIDE] Agent Guide

`AGENTS.md` is the first file a coding agent should read before changing this
repo. It must be short and operational rather than essay-like.

Required sections:

1. **Product Truth**
   - Desktop Nano Cortex is a documented-MIDI live control surface first.
   - BLE protocol work is experimental/provisional unless linked to repeatable hardware evidence.
   - Do not add or preserve UI/docs that imply full editing, preset sync, or authoritative BLE state.

2. **Before Coding**
   - Read the governing `docs/specs/<zone>/spec.md` and `design.md`.
   - Keep source `@see` links pointed at the owning zone.
   - Prefer small, behavior-scoped changes.

3. **Verification**
   - Always run or report inability to run:
     - `npm run format:check`
     - `npm run lint`
     - `npm run typecheck`
     - `npm test`
   - Run `npm run e2e` for UI flow changes.
   - Run hardware smoke when MIDI/BLE send, observe, connect, disconnect, or labels change.

4. **File Ownership**
   - `backend/`: Rust/Tauri host, MIDI/BLE, IPC, platform integration.
   - `frontend/`: React control surface and IPC wrappers.
   - `docs/specs/`: source-of-truth specs/design/tasks.
   - `docs/runbooks/`: manual procedures that CI cannot prove.
   - `.github/`: CI, release, dependency, PR metadata.

`CONTRIBUTING.md` may be longer, but should point back to `AGENTS.md` for the
short operational version.

---

## [DES-HARDWARE-SMOKE] Hardware Smoke Runbook

`docs/runbooks/hardware-smoke.md` captures checks that cannot run in CI because
GitHub-hosted runners do not have a Nano Cortex attached.

Required prerequisites:

- Nano Cortex connected over USB for MIDI checks.
- OS MIDI permissions granted where required.
- Device MIDI out configured in Cortex Cloud or device settings when observing hardware-originated changes.
- BLE enabled and not connected to another host for BLE checks.
- App build/commit identified before testing.

Required checks:

| Area        | Check                                                                                           |
| ----------- | ----------------------------------------------------------------------------------------------- |
| USB send    | Recall presets with Program Change `0-63`; verify the physical device changes preset.           |
| USB send    | Toggle FX slots with CC `37-41`; verify expected on/off behavior.                               |
| USB send    | Send tap tempo CC `42`; verify device receives tap.                                             |
| USB send    | Toggle tuner CC `43`; verify tuner behavior.                                                    |
| USB send    | Send expression CC `1`; verify supported expression behavior.                                   |
| USB observe | Change preset/FX on hardware; verify app log and UI update when device MIDI out is configured.  |
| BLE         | Scan and connect to Nano Cortex.                                                                |
| BLE         | Verify notification subscriptions are active by observing incoming BLE/log lines when possible. |
| BLE         | Disconnect; verify unsubscribe/disconnect log lines and a clean reconnect.                      |

Evidence format:

- Date/time.
- OS and version.
- App commit.
- App version.
- Nano Cortex firmware version if known.
- Pass/fail table.
- Relevant log excerpts, especially inbound MIDI/BLE messages.

---

## [DES-RELEASE-CHECKLIST] Release Checklist

`docs/runbooks/release-checklist.md` is the release operator's step-by-step
guide. It must make it hard to ship mismatched versions or unverified artifacts.

Required sections:

1. **Preflight**
   - Confirm working tree ownership and intended release version.
   - Confirm no runtime claims were added without supporting evidence.

2. **Version Sync**
   - `backend/tauri.conf.json`
   - `backend/Cargo.toml`
   - root `package.json` if versioned
   - `frontend/package.json` if versioned
   - `CHANGELOG.md`

3. **Verification**
   - `npm run format:check`
   - `npm run lint`
   - `npm run typecheck`
   - `npm test`
   - `npm run e2e`
   - license/security checks once added

4. **Hardware Gate**
   - Complete `docs/runbooks/hardware-smoke.md`.
   - Capture evidence before publishing release artifacts.

5. **Tag And Release**
   - Create/push `v*` tag only after verification.
   - Inspect the drafted GitHub Release and platform artifacts.
   - Keep v1.0.0 unsigned caveats visible for macOS Gatekeeper and Windows SmartScreen.

---

## [DES-LICENSE-SUPPLY] License And Supply Chain

The project should be Apache-2.0 and keep dependency checks lightweight.

Metadata targets:

- Root `LICENSE`: Apache License 2.0 text with `Desktop Nano Cortex Contributors`.
- Root `package.json`: `"license": "Apache-2.0"`.
- `frontend/package.json`: `"license": "Apache-2.0"`.
- `backend/Cargo.toml`: `license = "Apache-2.0"`.

Script targets:

- `check:audit`: production npm audit for root/frontend where applicable.
- `check:licenses`: allowed-license check for package locks and project metadata.
- `check:security`: composed security gate that can be run locally and in CI.

Allowed dependency licenses should start with common permissive licenses already
present in the lockfiles: `MIT`, `ISC`, `Apache-2.0`, `BSD-2-Clause`,
`BSD-3-Clause`, `CC0-1.0`, `CC-BY-4.0`, `0BSD`, `Unlicense`,
`BlueOak-1.0.0`, and compatible dual-license forms such as
`Apache-2.0 OR MIT`.

Dependabot should cover:

- Root npm package lock.
- `frontend/` npm package lock.
- `backend/` Cargo lock.
- GitHub Actions.

---

## [DES-TRUTH-GUARD] Truthfulness Guard

Truthfulness is a product requirement, not a copywriting preference.

Review surfaces:

- PR template checklist.
- `AGENTS.md` product-truth section.
- `CONTRIBUTING.md` verification section.
- Relevant zone specs when behavior/labels change.
- README/release notes before shipping.

PR checklist items must ask whether the change:

- Adds or changes UI/docs that describe editing, sync, BLE state, preset names, captures, IRs, or parameter values.
- Is backed by documented MIDI behavior, observed incoming MIDI, or hardware-verified BLE evidence.
- Labels provisional BLE behavior clearly.
- Adds hardware-smoke evidence when MIDI/BLE behavior changes.

If a claim cannot be tied to a spec and evidence, the claim must be softened,
removed, or moved behind an experimental/provisional label.

---

## [DES-GOV-COMMUNITY] Community, Privacy, And Agent Entry

The zone also owns the public-facing community surface and the privacy
contract. These follow the same rule as the truthfulness guard: say only what
is true, and keep stated facts synchronized with their sources.

- **Funding** (`.github/FUNDING.yml`): mirrors the in-app About panel support
  links exactly — GitHub Sponsors `AgenticFlowX`, Ko-fi `rixrix`, Buy Me a
  Coffee `rixrix`. If the About panel links change, this file changes in the
  same change set.

- **Privacy** (`PRIVACY.md`): the truthfulness guard applied to data handling.
  Telemetry (Microsoft Clarity — session interactions, heatmaps, JS errors,
  plus app diagnostic log lines forwarded as custom events; see
  `210-frontend-ipc-contracts` `[DES-SHARED-TELEMETRY]`) is enabled by default
  and can be turned off from About → Telemetry posture. Device MIDI/BLE data
  and diagnostic files never leave the machine regardless of that setting; the
  only other network call is the optional once-per-session GitHub release
  update check. Any telemetry vendor beyond Clarity must be disclosed in
  `PRIVACY.md` before it ships.

- **Agent entry** (`CLAUDE.md`): the coding-agent entry point. It stays thin —
  it imports `AGENTS.md` via `@AGENTS.md` rather than duplicating it, and adds
  the verify → fix → verify loop plus the AFX traceability and frontmatter
  conventions agents must follow.

- **Community health** (`CODE_OF_CONDUCT.md` as Contributor Covenant 2.1,
  `.github/CODEOWNERS`, `.github/ISSUE_TEMPLATE/` forms, `SUPPORT.md`): the
  bug report form asks whether the issue concerns documented MIDI or
  provisional BLE, so triage inherits the product-truth split from the first
  report onward.

---

## [DES-GOV-DEC] Decisions

| Decision                                   | Rationale                                                               |
| ------------------------------------------ | ----------------------------------------------------------------------- |
| Use `900-project-governance`               | `001-overview` reserves `900-999` for cross-cutting living behavior.    |
| Keep the first pass doc-heavy              | The user requested a saved plan that coding agents can pick up later.   |
| Keep supply-chain checks lightweight       | This repo is npm + Cargo, not the larger pnpm/Turbo reference monorepo. |
| Keep hardware smoke manual                 | CI cannot validate physical Nano Cortex behavior.                       |
| Use Apache-2.0 with contributors copyright | Neutral and compatible with future contributors.                        |
