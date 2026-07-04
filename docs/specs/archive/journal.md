---
afx: true
type: JOURNAL
status: Living
owner: "@richard-sentino"
created_at: "2026-06-10T11:54:35.000Z"
updated_at: "2026-06-12T08:44:34.000Z"
tags: ["01-deskop-nano-cortex", "journal"]
---

# Journal - 01 Deskop Nano Cortex

<!-- prefix: DNC -->

> Quick captures and discussion history for AI-assisted development sessions.
> See [agenticflowx.md](../agenticflowx.md) for workflow.

## Captures

<!-- Quick notes during active chat - cleared when recorded -->

---

## Discussions

<!-- Recorded discussions with IDs: DNC-D001, DNC-D002, etc. -->
<!-- Chronological order: oldest first, newest last -->

### DNC-D001 - Sprint scaffold + Tauri feasibility

`status:active` `2026-06-10T11:54:35.000Z` `[tauri, rust, midi, cross-platform, desktop-port]`

**Context**: User asked `/afx-sprint new 01-deskop-nano-cortex` with the brief: "create a desktop app for nano cortex using Rust's tauri", and asked us to assess a desktop implementation path that builds for macOS, Linux, and Windows.

**Summary**: Scoped the early React control-surface shape and confirmed a Tauri 2.x + Rust implementation is feasible, low-risk, and cross-platform. The frontend keeps UI concerns separate from transport, while the Rust backend absorbs the MIDI work via `midir` (USB) + `btleplug` (BLE, deferred). All 14 NFRs / 13 FRs / 16 tasks scaffolded as drafts for `/afx-sprint spec` review.

**Progress**:

- [x] Confirmed the control surface can keep transport concerns behind a narrow connection interface _(N1)_
- [x] Selected Tauri 2.x over Electron / native / Flutter with rationale captured in [DES-DEC] _(N2)_
- [x] Drafted cross-platform packaging + signing story for all 3 OSes _(N3)_
- [x] Resolved Open Q2 (signing) and Open Q5 (frontend reuse) — see D6/D7 and [DNC-P001](#d-p001--spec-open-questions-q2--q5-resolved) _(N4, N5)_
- [x] User tightened Spec (FR-1 / FR-13 wording accepted as-is; Q6 slug typo confirmed keep as-typed per user default) and approved the Spec section — see [DNC-P002](#d-p002--spec-section-approved) _(N6)_
- [x] Restructured `[DES-FILES]` into a Tauri 2.x monorepo tree — see D9 / [DNC-P003](#d-p003--des-files-restructured-to-tauri-2x-monorepo-layout) _(N7)_
- [x] Restructured `[DES-FILES]` again to a proper polyglot monorepo with feature-sliced frontend + layered backend — see D10 / [DNC-P004](#d-p004--des-files-restructured-to-feature-sliced-frontend--layered-backend) _(N8)_
- [x] Expanded `[DES-DEC]` BLE row with btleplug 1135⭐ + bluer 434⭐ + BLE-MIDI protocol evidence — see D11 / [DNC-P005](#d-p005--des-dec-ble-row-expanded-with-btleplug-evidence) _(N9)_
- [x] Promoted BLE to v0.1 (USB + BLE both in this sprint) — see D12 / [DNC-P006](#d-p006--ble-promoted-to-v01-sprint-scope-expanded) _(N10)_
- [x] Spec section re-approved post-BLE-expansion — see D13 / [DNC-P007](#d-p007--spec-section-re-approved-post-ble-expansion) _(N11)_
- [x] Design section approved — see D14 / [DNC-P008](#d-p008--design-section-approved) _(N12)_
- [x] Tasks section approved — overall sprint status now Approved — see D15 / [DNC-P009](#d-p009--tasks-section-approved-sprint-status-approved) _(N13)_

**Decisions**:

- **D1**: Tauri 2.x is the shell. Rationale: smallest binary, lowest RAM, single codebase, matches the team's existing web-tech skills, and keeps the React UI purpose-built for desktop control.
- **D2**: `midir` for USB MIDI in v0.1. BLE deferred to v0.2 behind a feature flag.
- **D3**: _(Superseded by D7 on 2026-06-10.)_ Originally: reuse an existing source tree. Updated: new React/TS/Tailwind frontend built from scratch.
- **D4**: BLE on Linux is unreliable → BLE is macOS / Windows only in v0.2, explicitly off on Linux.
- **D5**: CI matrix on GitHub Actions is the release path; signed macOS + Windows installers in v0.1.
- **D6** (2026-06-10, from Q2): v0.1 ships **unsigned** on macOS / Windows. No Apple Developer ID available. Windows cert status TBD — treat as unsigned until a cert is added to CI secrets. v0.2 acquires Developer ID + Windows Authenticode; signing infrastructure (`tauri.bundle` config, CI secrets schema) is in place from v0.1.
- **D7** (2026-06-10, from Q5): Build a new React/TS/Tailwind frontend from scratch. No non-project app code is copied or imported. FR-3, NFR-7, FR-12, DES-OVR / DES-UI / DES-FILES, and Task 3.1 updated to match.
- **D8** (2026-06-10): **Spec section Approved** at `2026-06-10T12:16:10.000Z`. Audit passed: 17 FRs, 12 acceptance criteria, 0 `Open + Blocking=Yes` rows. Frontmatter `approval.spec` flipped to `Approved`; top-level `status` remains `Draft` (Design + Tasks still pending — will auto-promote to `Approved` when all three are approved). Design gate is now unblocked.
- **D9** (2026-06-10, from `[DES-FILES]` restructure): **Tauri 2.x monorepo layout adopted.** Frontend in `src/`, Rust crate in `src-tauri/`, with Tauri 2.x conventions: `capabilities/` for ACLs, `lib.rs` for builder + plugin registration, `state.rs` for shared `AppState`, `error.rs` for `AppError`. The monolithic `midi/port_manager.rs` is split into `port_manager.rs` (enumeration + name matching + hotplug), `connection.rs` (open / close / send per device), `listener.rs` (input thread + event emission). Each Rust feature (tray, shortcuts, settings) gets its own top-level module rather than living inline in `main.rs`. Task 1.2 `<!-- files: -->` comment extended to cover the new split.
- **D10** (2026-06-10, from `[DES-FILES]` re-restructure): **Polyglot monorepo with feature-sliced frontend and layered backend adopted.** Top-level `src/` → `frontend/`, `src-tauri/` → `backend/`. Frontend layout: `frontend/src/{app,features,shared,assets,styles}/` — features are `midi/`, `settings/`, `shortcuts/`, each owning its own `components/`, `hooks/`, `services/`, `constants.ts`, `types.ts`. Cross-platform IPC contracts in `frontend/src/shared/ipc/{commands,events,errors}.ts` (single source of truth). Backend layout: `backend/src/{app,domain,infrastructure,ipc,platform}/` — `app/` is composition (state, error, config); `domain/` has zero I/O and zero Tauri deps (value objects only); `infrastructure/` owns I/O (`infrastructure/midi/` with the `MidiInfra` trait); `ipc/` is the Tauri command/event layer with `mapping.rs` doing the serde boundary; `platform/` wraps Tauri plugins (tray, shortcuts, settings_store). `[DES-ARCH]` Component Diagram updated (`bridge/` → `ipc/`, `midi/` → `infrastructure/midi/`). 11 task `<!-- files: -->` comments updated.
- **D11** (2026-06-10, from `[DES-DEC]` BLE evidence expansion): **BLE row rationale hardened with dependency and protocol evidence.** Confirmed `deviceplug/btleplug` is the right crate: 1135 stars, last push 2026-05-25, unarchived, cross-platform. `bluez/bluer` (434 stars) is the Linux-only BlueZ alternative. No Rust BLE-MIDI crate exists; the protocol is GATT subscribe + write-without-response on the standard MIDI I/O characteristic. The Nano Cortex advertises the older Nordic-style UUIDs (`0000a002-…` / `0000c302-…`) rather than the Bluetooth-SIG-adopted UUIDs (`03B80E5A-…` / `7772E5DB-…`) — both work the same way. No spec change; FR-10 / Q1 / DES-ROLLOUT all unchanged.
- **D12** (2026-06-10, from user decision to include BLE in v0.1): **BLE promoted from v0.2 to v0.1 — USB + BLE both ship in this sprint.** FR-10 priority `Could Have` → `Should Have`. Open Q1 resolved (BLE in v0.1, macOS/Windows only, Linux BLE off). Task 1.4 rewritten from scaffold to full implementation. `approval.spec` demoted back to `Draft` (re-approval rule triggered by editing FR-10). The Rust desktop app can provide native BLE transport where browser BLE would be too fragile for this product.
- **D13** (2026-06-10): **Spec section re-approved post-BLE-expansion.** Frontmatter `approval.spec`: `Draft` → `Approved`. Full audit passed: 17 FRs, 12 acceptance criteria, 0 `Open + Blocking=Yes` rows. `status` remains `Draft` until all three sections are approved. Design gate is now unblocked.
- **D14** (2026-06-10): **Design section approved.** Frontmatter `approval.design`: `Draft` → `Approved`. Audit: 12 `[DES-X]` sections present, Key Decisions table fully filled (8/8 rows), all task `<!-- files: -->` references updated for new folder structure. Tasks gate is now unblocked.
- **D15** (2026-06-10): **Tasks section approved — overall sprint status promoted to Approved.** Frontmatter `approval.tasks`: `Draft` → `Approved`. Top-level `status`: `Draft` → `Approved` (auto-promoted when all three sections approved). Final audit: 19 task groups with @see, 17/17 FRs covered, 7/7 NFRs covered, 12/12 DES sections covered, 0 malformed checkboxes. Code gate is now unblocked.

**Tips/Ideas**:

- BLE work should be re-derived through `TauriMidiConnection` and the Rust backend rather than carrying browser transport assumptions forward.
- Tauri 2.x's `tauri::AppHandle::emit` makes the event payload structure (Rust struct → `serde_json::Value` → TS) the highest-leverage type to nail down first; once `MidiMessage` and `DeviceEvent` are stable, the rest follows.
- Keep unused prototype/editor pages out of the new build unless they become product-owned surfaces.

**Notes**:

- **[DNC-D001.N1]** **[2026-06-10T11:54:35.000Z]** A narrow connection interface is the single seam that lets us swap transport without touching React feature components. `[midi, architecture]`
- **[DNC-D001.N2]** **[2026-06-10T11:54:35.000Z]** Tauri 2.x vs Electron sizing: Tauri binaries are typically 5–30 MB; Electron's baseline (Chromium + Node) is ~150 MB+ before app code. This is the primary lever for satisfying NFR-1. `[tauri, perf]`
- **[DNC-D001.N3]** **[2026-06-10T11:54:35.000Z]** macOS signing needs Developer ID Application cert + Apple notarytool credentials; Windows needs an Authenticode cert (EV best). Without them, Gatekeeper / SmartScreen warning UX is unusable in practice. Document required GH Actions secrets in the release runbook. `[signing, release]`
- **[DNC-D001.N4]** **[2026-06-10T12:09:33.000Z]** Q2 resolved: user does not have Apple Developer ID. v0.1 macOS / Windows binaries are unsigned; README documents Gatekeeper right-click bypass and (Windows) SmartScreen caveat. v0.2 acquires certs — config-only change, no architectural rework. `[signing, scope]`
- **[DNC-D001.N5]** **[2026-06-10T12:09:33.000Z]** Q5 resolved: build a new React frontend from scratch. Implies rewriting FR-3, NFR-7, FR-12, DES-OVR / DES-UI / DES-FILES, and Task 3.1. Also implies all component files are new and app-owned. `[scope-cut, architecture]`
- **[DNC-D001.N6]** **[2026-06-10T12:16:10.000Z]** Spec section approved. Frontmatter `approval.spec` flipped from `Draft` to `Approved`; top-level `status` stays `Draft` (Design + Tasks still pending). Open Q1 / Q3 / Q4 / Q6 remain Open / No (non-blocking) and can be tightened during Design or accepted as v0.1 trade-offs. Next gate: `/afx-sprint design 01-deskop-nano-cortex`. `[approval, gate]`
- **[DNC-D001.N7]** **[2026-06-10T12:23:28.000Z]** `[DES-FILES]` restructured from a 16-row flat table into a Tauri 2.x monorepo tree. Frontend at `src/` (assets, components, services, styles, App.tsx, main.tsx, constants.ts, types.ts), backend at `src-tauri/` (capabilities/, src/{main,lib,state,error}.rs, src/{bridge,midi}/, src/{tray,shortcuts,settings}.rs, tests/, Cargo.toml, tauri.conf.json), CI at `.github/workflows/`, docs at `docs/`, scripts at `scripts/`. MIDI module split: `port_manager.rs` (enumeration + name matching + hotplug), `connection.rs` (open / close / send per device), `listener.rs` (input thread + `midi://message` emission). Tauri 2.x essentials added: `capabilities/`, `lib.rs`, `state.rs`, `error.rs`. Top-level feature modules added: `tray.rs`, `shortcuts.rs`, `settings.rs`. Task 1.2 `<!-- files: -->` comment updated to list the three split files. No data model or API change. `[structure, design]`
- **[DNC-D001.N8]** **[2026-06-10T12:31:26.000Z]** `[DES-FILES]` restructured **again** to address the user's "doesn't look like a properly architectured folder structure" critique. Renamed top-level `src/` → `frontend/`, `src-tauri/` → `backend/`. Frontend now feature-sliced: `frontend/src/{app,features,shared,assets,styles}/` with `features/{midi,settings,shortcuts}/` each owning their own components + hooks + services + types. Shared cross-platform IPC contracts live in `frontend/src/shared/ipc/{commands,events,errors}.ts`. Backend now layered: `backend/src/{app,domain,infrastructure,ipc,platform}/` — `app/` (composition + state + errors + config), `domain/` (no I/O, no Tauri deps — value objects), `infrastructure/` (I/O — `infrastructure/midi/` with the `MidiInfra` trait), `ipc/` (Tauri commands + events + `mapping.rs` for the serde boundary), `platform/` (Tauri-plugin wrappers: tray, shortcuts, settings_store). `[DES-ARCH]` Component Diagram updated: `bridge/` → `ipc/`, `midi/` → `infrastructure/midi/`. All 11 affected task `<!-- files: -->` comments updated to new paths (1.2, 1.3, 1.4, 2.1, 2.2, 3.1, 3.2, 3.3, 4.1, 4.2, 4.3, 4.4). `[structure, architecture, design]`
- **[DNC-D001.N9]** **[2026-06-10T12:54:03.000Z]** `[DES-DEC]` BLE row expanded with dependency and protocol evidence. Confirmed `deviceplug/btleplug` is the right crate: 1135 stars, last push 2026-05-25 (active), unarchived, cross-platform (Linux/Windows/macOS/iOS/Android). `bluez/bluer` (434 stars) is the official BlueZ binding — Linux only, useful as a Linux-specific fallback. No Rust BLE-MIDI crate exists; the protocol is just GATT subscribe + `write_value_without_response` on the MIDI I/O characteristic. The Nano Cortex advertises the older Nordic-style UUIDs (`0000a002-…` / `0000c302-…`) rather than the Bluetooth-SIG-adopted UUIDs (`03B80E5A-…` / `7772E5DB-…`) — both work the same way at the GATT level. `[evidence, bluetooth, design]`
- **[DNC-D001.N10]** **[2026-06-10T13:03:46.000Z]** **BLE promoted to v0.1** per user decision (`/afx-sprint design usb and ble in this sprint`). Major changes: FR-10 priority `Could Have` → `Should Have` (BLE is now a core transport, not optional). Open Q1 resolved. DES-OVR updated (`optional BLE` → `BLE`). DES-DEC BLE row updated (choice now `active in v0.1 — macOS/Windows only, Linux off`). DES-UI BLE connection UX added (two-button connect). DES-ERR BLE row updated from "reference only" to real error handling. DES-TEST BLE testing added. DES-ROLLOUT v0.1 now includes BLE; v0.2 is just auto-update + system tray. Task 1.4 completely rewritten from BLE scaffold → BLE implementation (btleplug scan, connect, send, subscribe, disconnect, write queue, unit tests). Task 3.1/3.3 updated to wire BLE connection path. Frontmatter `approval.spec` demoted back to `Draft` (re-approval rule — FR-10 edited post-Approval). `[scope, decision, sprint-change]`
- **[DNC-D001.N11]** **[2026-06-10T13:06:45.000Z]** Spec section **re-approved** after BLE scope expansion. Audit: 17 FRs (FR-10 now Should Have), 12 acceptance criteria, 0 `Open + Blocking=Yes` rows. Frontmatter `approval.spec` flipped back to `Approved`. Design and Tasks gates are now unblocked in sequence. `[approval, gate]`
- **[DNC-D001.N12]** **[2026-06-10T13:16:34.000Z]** Design section **approved**. Audit: 12 `[DES-X]` sections present ([DES-OVR] through [DES-ROLLOUT]), Key Decisions table fully filled (8 rows, all columns populated). File structure documented as Tauri 2.x monorepo with feature-sliced frontend and layered backend. BLE promoted to v0.1 per user decision. Phase 0 (validation prototype) added as a pre-implementation gate. Tasks gate is now unblocked. `[approval, gate, design]`
- **[DNC-D001.N13]** **[2026-06-10T13:19:52.000Z]** **Tasks section approved — overall sprint status Approved.** Final audit: 19/19 task groups with @see, 17/17 FRs covered (FR-11 added retroactively after initial gap), 7/7 NFRs covered, 12/12 DES sections covered. All checkboxes are valid `- [ ]`. `approval.tasks`: `Draft` → `Approved`. Top-level `status`: `Draft` → `Approved`. Code gate is now unblocked — Phase 0 (validation prototype) can begin. The overall sprint is now in 'Living' mode. `[approval, gate, tasks, complete]`
- **[DNC-D001.N14]** **[2026-06-10T13:27:00.000Z]** Phase 0.1 (USB MIDI validation prototype) coded. Tauri 2.x project scaffolded with `frontend/` + `backend/` structure. `list_ports` command (midir enumeration) and `send_midi` command (raw byte send) wired through Tauri IPC. React frontend has two buttons + port list display. Both `cargo check` and `npm run build` pass cleanly. Ready for physical testing with a Nano Cortex. `[phase0, implementation]`
- **[DNC-D001.N15]** **[2026-06-10T13:35:42.000Z]** **Phase 0.1 verified — USB MIDI works.** "List USB Ports" shows `"Nano Cortex"` as the detected MIDI output port. "Send PC#0" successfully switched the physical device to preset 0. Single output port detected (named simply `Nano Cortex`, not `"Nano Cortex MIDI OUT"` as expected — this is the port naming convention on macOS). Both Agent and Human confirmed the result. Ground truth established: midir enumeration + send path works on macOS with a real Nano Cortex. BLE validation (0.2) is next. `[phase0, verified, usb]`
- **[DNC-D001.N16]** **[2026-06-10T13:46:24.000Z]** **All phases coded — full app built.** Phase 0.2 (BLE MIDI via btleplug), Phase 1 (layered Rust backend with app/domain/infrastructure/ipc/platform modules), Phase 2 (Tauri IPC bridge with list_ports, connect, disconnect, send_midi, get_state, ble_scan commands), Phase 3 (React feature-sliced frontend with PresetGrid, EffectControls, Navigation, Header, InfoBox, Footer, useMidiConnection, usePreset, useExpression hooks, shared IPC contracts), Phase 4 signal (shortcuts, settings store, tray scaffold). BLE feature-gated behind `ble` cargo feature (on by default). Both `cargo check` and `npm run build` pass. The app compiles and is ready for `npm run dev:tauri` testing. `[implementation, all-phases, complete]`

**Related Files**: docs/specs/01-deskop-nano-cortex/01-deskop-nano-cortex.md, docs/specs/01-deskop-nano-cortex/journal.md

**Participants**: @richard-sentino

---

## Prompt Captures

<!-- Verbatim user prompts + agent reply excerpts at pivotal moments. Append-only. -->
<!-- IDs: DNC-P001, DNC-P002, ... (P for "prompt", distinct from D for "discussion") -->
<!-- Trigger kinds: new-fr | new-nfr | removed-fr | design-pivot | missed-req | scope-cut | ambiguity-resolved | question-resolved | other -->

### DNC-P001 — Spec Open Questions Q2 and Q5 resolved

- `type:prompt-capture` `2026-06-10T12:09:33.000Z` `[signing, scope-cut, frontend, tauri, rust]`
- trigger: `scope-cut` (FR-3 rewritten, NFR-7 rewritten) + `question-resolved` (Q2, Q5) + `ambiguity-resolved`
- triggered-change: FR-3, FR-12, NFR-7, Acceptance Criterion, Open Q2, Open Q5, DES-OVR, DES-UI, DES-FILES, Dependencies, Task 3.1
- agent: unknown
- model: unknown

**User prompt** (verbatim):

> /afx-sprint spec 01-deskop-nano-cortex
>
> open question answer
> - i don't have an apple developer account
> - create a new react frontend

**Agent reply** (excerpt):

> I'll apply the resolution. Two blocking questions answered -> consequential edits across Spec, Design, and Tasks. Frontend strategy pivots to a new React/TS/Tailwind implementation from scratch. This propagates to FR-3, NFR-7, DES-OVR / DES-UI / DES-FILES, Task 3.1, and Dependencies. Signing pivots from "must have in v0.1" to "unsigned v0.1, infrastructure in place, v0.2 acquires certs". This propagates to FR-12, the signing acceptance criterion, and the Open Q2 resolution note.

**Outcome**:

- FR-3 rewritten for a new React/TS/Tailwind frontend from scratch
- NFR-7 rewritten for independent frontend ownership
- FR-12 rewritten: explicit v0.1-unsigned / v0.2-signed split
- Acceptance criterion "macOS build is Developer-ID signed…" rewritten to "unsigned for v0.1"
- Open Q2: Status `Open` → `Resolved`, Blocking `Yes` → `No`
- Open Q5: Status `Open` → `Resolved`, Blocking `Yes` → `No`
- DES-OVR, DES-UI first paragraph, DES-FILES `src/` row, and Dependencies first bullet updated to reflect "new, no source reuse"
- Task 3.1 items rewritten to create new `src/components/`, `src/constants.ts`, `src/types.ts`, `App.tsx`
- Frontmatter `updated_at` bumped to `2026-06-10T12:09:33.000Z`
- Journal: D3 superseded, D6 / D7 added, N4 / N5 added, Progress checkboxes updated, Related Files extended

### DNC-P002 — Spec section approved

- `type:prompt-capture` `2026-06-10T12:16:10.000Z` `[approval, gate, spec]`
- trigger: `other` (gate transition: spec Draft → Approved)
- triggered-change: approval.spec, status (still Draft; will auto-promote to Approved after `task --approve` completes the trio)
- agent: unknown
- model: unknown

**User prompt** (verbatim):

> /afx-sprint spec 01-deskop-nano-cortex --approve

**Agent reply** (excerpt):

> Spec section approved for 01-deskop-nano-cortex. Approval state: spec=Approved, design=Draft, tasks=Draft. Next: /afx-sprint design 01-deskop-nano-cortex.

**Outcome**:

- Frontmatter `approval.spec`: `Draft` → `Approved`
- Frontmatter `updated_at` bumped to `2026-06-10T12:16:10.000Z`
- Top-level `status` remains `Draft` (Design and Tasks still pending — will auto-promote to `Approved` when both are also approved)
- Journal: D8 added, N6 added, last progress checkbox checked, DNC-P002 added

### DNC-P003 — [DES-FILES] restructured to Tauri 2.x monorepo layout

- `type:prompt-capture` `2026-06-10T12:23:28.000Z` `[structure, design, tauri, rust]`
- trigger: `design-pivot` (file-structure overhaul — concerns re-grouped, MIDI module split)
- triggered-change: `[DES-FILES]`, Task 1.2 `<!-- files: -->` comment
- agent: unknown
- model: unknown

**User prompt** (verbatim):

> /afx-sprint design 01-deskop-nano-cortex
>
> let's make sure to have a proper folder structure for rust and react projects. the current documented structure looks chaotic

**Agent reply** (excerpt):

> `[DES-FILES]` restructured into a Tauri 2.x monorepo tree: frontend at `src/` (assets, components, services, styles, App.tsx, main.tsx, constants.ts, types.ts), backend at `src-tauri/` (capabilities/, src/{main,lib,state,error}.rs, src/{bridge,midi}/, src/{tray,shortcuts,settings}.rs, tests/, Cargo.toml, tauri.conf.json), CI at `.github/workflows/`, docs at `docs/`, scripts at `scripts/`. Task 1.2 `<!-- files: -->` comment extended to include the new `connection.rs` and `listener.rs` split files. No data model or API change.

**Outcome**:

- `[DES-FILES]` replaced: 16-row flat table → ~80-line Tauri 2.x idiomatic tree + key-entry-points table
- Added Tauri 2.x essentials: `capabilities/{default,midi}.json`, `lib.rs`, `state.rs`, `error.rs`
- Split `port_manager.rs` into `port_manager.rs` (enumeration + name matching + hotplug) + `connection.rs` (open / close / send per device) + `listener.rs` (input thread + `midi://message` emission)
- Added top-level feature modules: `tray.rs`, `shortcuts.rs`, `settings.rs`
- Task 1.2 `<!-- files: -->` comment updated to list the three new split files
- Frontmatter `updated_at` bumped to `2026-06-10T12:23:28.000Z`
- Journal: D9 added, N7 added, Progress updated, DNC-P003 added

### DNC-P004 — [DES-FILES] restructured to feature-sliced frontend + layered backend

- `type:prompt-capture` `2026-06-10T12:31:26.000Z` `[structure, architecture, design, monorepo, feature-sliced]`
- trigger: `design-pivot` (deeper restructure in response to "doesn't look properly architected" critique)
- triggered-change: `[DES-FILES]`, `[DES-ARCH]` Component Diagram, 11 task `<!-- files: -->` comments
- agent: unknown
- model: unknown

**User prompt** (verbatim):

> /afx-sprint design 01-deskop-nano-cortex
>
> src/ and src-tauri doesn't look like a properly architectured folder structure

**Agent reply** (excerpt):

> Restructured `[DES-FILES]` to a proper polyglot monorepo: `src/` → `frontend/`, `src-tauri/` → `backend/`. Frontend is feature-sliced (`app/`, `features/{midi,settings,shortcuts}/`, `shared/{ipc,ui,lib}/`). Backend is layered (`app/`, `domain/` (no I/O), `infrastructure/`, `ipc/`, `platform/`). The `frontend/src/shared/ipc/` folder is the single source of truth for command + event contracts; `backend/src/ipc/mapping.rs` is the serde boundary. Updated `[DES-ARCH]` Component Diagram and 11 task `<!-- files: -->` references.

**Outcome**:

- Top-level: `src/` → `frontend/`, `src-tauri/` → `backend/`
- Frontend: `frontend/src/{app,features,shared,assets,styles}/` (feature-sliced)
- Backend: `backend/src/{app,domain,infrastructure,ipc,platform}/` (layered clean architecture lite)
- `domain/` has zero I/O and zero Tauri deps (pure value objects)
- `infrastructure/midi/` declares the `MidiInfra` trait; `domain/` can depend on it through the trait
- `ipc/{commands,events}.rs` are thin Tauri wrappers; `ipc/mapping.rs` does the domain ↔ wire type conversion
- `frontend/src/shared/ipc/` is the TS single source of truth for command + event contracts
- `[DES-ARCH]` Component Diagram: `bridge/` → `ipc/`, `midi/` → `infrastructure/midi/`
- 11 task `<!-- files: -->` comments updated to new paths
- Frontmatter `updated_at` bumped to `2026-06-10T12:31:26.000Z`
- Journal: D10 added, N8 added, Progress updated, DNC-P004 added

### DNC-P005 — [DES-DEC] BLE row expanded with btleplug evidence

- `type:prompt-capture` `2026-06-10T12:54:03.000Z` `[evidence, bluetooth, design, library-selection]`
- trigger: `other` (evidence-driven rationale expansion in [DES-DEC] BLE row)
- triggered-change: `[DES-DEC]` BLE row (expanded with btleplug 1135 stars, bluer 434 stars, BLE-MIDI protocol note, and Nano Cortex UUIDs)
- agent: unknown
- model: unknown

**User prompt** (verbatim):

> /afx-sprint design 01-deskop-nano-cortex expand [DES-DEC] BLE row with the evidence

**Agent reply** (excerpt):

> Expanded the [DES-DEC] BLE row with: `deviceplug/btleplug` 1135 stars, last push 2026-05-25, unarchived (the de-facto cross-platform async Rust BLE library). `bluez/bluer` 434 stars as a Linux-only BlueZ alternative. No Rust BLE-MIDI crate exists; the protocol is just GATT subscribe + `write_value_without_response` on the standard MIDI I/O characteristic. The Nano Cortex advertises the older Nordic-style UUIDs (`0000a002-…` / `0000c302-…`) rather than the Bluetooth-SIG-adopted UUIDs (`03B80E5A-…` / `7772E5DB-…`) — both work the same way.

**Outcome**:

- `[DES-DEC]` BLE row expanded with full evidence chain
- No spec change (FR-10 / Q1 / DES-ROLLOUT all unchanged)
- No task change (Task 1.4 BLE scaffold unchanged)
- Frontmatter `updated_at` bumped to `2026-06-10T12:54:03.000Z`
- Journal: D11 added, N9 added, Progress updated, DNC-P005 added

### DNC-P006 — BLE promoted to v0.1 — sprint scope expanded

- `type:prompt-capture` `2026-06-10T13:03:46.000Z` `[scope, sprint-change, bluetooth, design]`
- trigger: `scope-cut` (BLE upgraded from Could-Have to Should-Have, pulled from v0.2 to v0.1)
- triggered-change: FR-10, Open Q1, DES-OVR, DES-DEC BLE row, DES-UI, DES-ERR, DES-TEST, DES-ROLLOUT, Task 1.4, Task 3.1, Task 3.3, approval.spec
- agent: unknown
- model: unknown

**User prompt** (verbatim):

> /afx-sprint design 01-deskop-nano-cortex let's both support usb and ble in this sprint. update the sprint and spec

**Agent reply** (excerpt):

> Scope change: BLE promoted from v0.2 to v0.1 — USB + BLE both ship in this sprint. FR-10 priority `Could Have` → `Should Have`. Open Q1 resolved. Task 1.4 rewritten from scaffold to full BLE implementation (btleplug scan, connect, subscribe, send, write queue, disconnect, unit tests). DES-UI adds two-button connect (USB / BLE). DES-ERR BLE row is now real handling. DES-TEST adds BLE testing. DES-ROLLOUT v0.1 now covers USB + BLE; v0.2 is just auto-update + system tray. `approval.spec` demoted to `Draft` per re-approval rule (FR-10 edited post-Approval).

**Outcome**:

- FR-10: "Optional Bluetooth MIDI … follow-up" (Could Have) → "Bluetooth MIDI (BLE) via btleplug … gated behind `ble` cargo feature" (Should Have)
- Open Q1: `Open` → `Resolved` (BLE in v0.1, macOS/Windows only, Linux off)
- DES-OVR: `optional BLE` → `BLE` (now a core transport)
- DES-DEC BLE row: `defer to v0.2` → `active in v0.1 — macOS/Windows only, Linux off`
- DES-UI: Connection UI updated (two-button USB/BLE connect, BLE status indicator)
- DES-ERR BLE row: `(reference only)` → real error handling with btleplug integration
- DES-TEST: BLE manual smoke + BLE unit tests with mock btleplug adapter added
- DES-ROLLOUT: v0.1 = USB + BLE; v0.2 = auto-update + system tray
- Task 1.4: completely rewritten — BLE scan, connect, subscribe, send, write queue, disconnect, unit tests, platform docs
- Task 3.1: BLE connection UI + status indicator wired
- Task 3.3: USB/BLE button pair both functional, `kind` payload handling
- `approval.spec`: `Approved` → `Draft` (re-approval rule triggered)
- Frontmatter `updated_at` bumped to `2026-06-10T13:03:46.000Z`
- Journal: D12 added, N10 added, Progress updated, DNC-P006 added

### DNC-P007 — Spec section re-approved post-BLE-expansion

- `type:prompt-capture` `2026-06-10T13:06:45.000Z` `[approval, gate, spec]`
- trigger: `other` (gate transition: spec Draft → Approved, second pass after BLE scope expansion)
- triggered-change: approval.spec (Draft → Approved)
- agent: unknown
- model: unknown

**User prompt** (verbatim):

> /afx-sprint spec 01-deskop-nano-cortex --approve

**Agent reply** (excerpt):

> Spec section re-approved for 01-deskop-nano-cortex. Approval state: spec=Approved, design=Draft, tasks=Draft. BLE is now included in v0.1 (FR-10 Should Have, macOS/Windows only, Linux BLE off). Next: /afx-sprint design 01-deskop-nano-cortex — start or continue refining the Design section.

**Outcome**:

- Frontmatter `approval.spec`: `Draft` → `Approved` (re-approved post-BLE scope expansion)
- Frontmatter `updated_at` bumped to `2026-06-10T13:06:45.000Z`
- Top-level `status` remains `Draft` (Design and Tasks still pending — will auto-promote to `Approved` when all three sections are approved)
- Journal: D13 added, N11 added, Progress updated, DNC-P007 added

### DNC-P008 — Design section approved

- `type:prompt-capture` `2026-06-10T13:16:34.000Z` `[approval, gate, design]`
- trigger: `other` (gate transition: design Draft → Approved)
- triggered-change: approval.design (Draft → Approved)
- agent: unknown
- model: unknown

**User prompt** (verbatim):

> /afx-sprint design 01-deskop-nano-cortex --approve

**Agent reply** (excerpt):

> Design section approved for 01-deskop-nano-cortex. Approval state: spec=Approved, design=Approved, tasks=Draft. Next: /afx-sprint task 01-deskop-nano-cortex — break into tasks (Phase 0 is already drafted, ready to refine and approve).

**Outcome**:

- Frontmatter `approval.design`: `Draft` → `Approved`
- Frontmatter `updated_at` bumped to `2026-06-10T13:16:34.000Z`
- Top-level `status` remains `Draft` (Tasks still pending — will auto-promote to `Approved` when all three sections are approved)
- Journal: D14 added, N12 added, Progress updated, DNC-P008 added

### DNC-P009 — Tasks section approved — sprint status Approved

- `type:prompt-capture` `2026-06-10T13:19:52.000Z` `[approval, gate, tasks, complete]`
- trigger: `other` (gate transition: tasks Draft → Approved, auto-promoting status to Approved)
- triggered-change: approval.tasks (Draft → Approved), status (Draft → Approved)
- agent: unknown
- model: unknown

**User prompt** (verbatim):

> /afx-sprint task 01-deskop-nano-cortex --approve

**Agent reply** (excerpt):

> Tasks section approved for 01-deskop-nano-cortex. Approval state: spec=Approved, design=Approved, tasks=Approved. Overall status: Approved. All three gates are now passed. Code gate is unblocked. Next: /afx-sprint code 01-deskop-nano-cortex — start with Phase 0 (validation prototype) to validate USB MIDI and BLE MIDI before committing to the full stack.

**Outcome**:

- Frontmatter `approval.tasks`: `Draft` → `Approved`
- Top-level `status`: `Draft` → `Approved` (auto-promoted — all three sections now approved)
- Frontmatter `updated_at` bumped to `2026-06-10T13:19:52.000Z`
- Journal: D15 added, N13 added, Progress updated, DNC-P009 added


### DNC-P010 — Living docs realigned to implemented MIDI-first controller

- `type:prompt-capture` `2026-06-12T08:44:34.000Z` `[living-docs, traceability, midi, ble, usb, ui]`
- trigger: `missed-req` + `design-pivot` + `scope-cut`
- triggered-change: FR-2, FR-4, FR-5, FR-10, FR-13, FR-15, FR-16, FR-17, NFR-8, DES-OVR, DES-UI, DES-DEC, DES-DATA, DES-API, DES-FILES, DES-ERR, DES-TEST, DES-ROLLOUT, tasks 0.1/0.2/0.3/1.2/1.4/2.1/2.2/3.1/3.2/3.3
- agent: unknown
- model: unknown

**User prompt** (verbatim):

> next update the specs based on the current features, keep it in living format as per afx rules on spec and design. put all traceability, @see and docs should refect 1:1 with the code
>
> apply

**Agent reply** (excerpt):

> The sprint brief was updated as a living document rather than an aspirational scaffold. The current truth is documented MIDI-first control, USB send/receive, BLE diagnostics/provisional state, fixed Nano signal-chain UI, footswitch assignment/live-access modeling, and monitor/logging. The docs now remove placeholder FRs and add traceability to the files and IPC contracts that actually exist.

**Outcome**:

- Sprint frontmatter promoted from `status: Approved` to `status: Living`, `version: "1.1"`, `updated_at: "2026-06-12T08:44:34.000Z"`; approval gates remain Approved because this is post-implementation living-doc alignment.
- FR-15, FR-16, and FR-17 replaced placeholders with real current features: fixed signal-chain UI, footswitch/live-access model, and MIDI monitor/app log/debugging.
- Added NFR-8: honest state model that distinguishes confirmed incoming MIDI, locally-sent provisional state, and experimental BLE decoding.
- DES sections updated to reflect current files and code paths: `backend/src/infrastructure/midi/{port_manager,connection,listener,ble,ble_debug,ble_inspector,ble_decoder,ble_sync}.rs`, `backend/src/ipc/{commands,events,mapping}.rs`, `frontend/src/shared/ipc/{commands,events}.ts`, `frontend/src/features/midi/**`.
- Tauri command/event contracts documented 1:1 with current wrappers: `list_ports`, `connect`, `disconnect`, `send_midi`, `get_state`, `get_device_name`, `get_nano_state`, `get_ble_capabilities`, `get_ble_debug_log`, `ble_scan`, `ble_ping`, plus `midi://message`, `midi://connected`, `midi://disconnected`, `midi://error`, `midi://ports-changed`, `midi://log`.
- Tasks and Cross-Reference Index updated with `@see` coverage for USB receive, BLE diagnostics, documented MIDI helpers, fixed signal chain, footswitch model, and monitor/logging.

---

## Template Notes

### Discussion Entry Structure

Each discussion has:

| Field             | Purpose                                             |
| ----------------- | --------------------------------------------------- |
| `status:active`   | Inline status tag (active/blocked/closed)           |
| `[tags]`          | Auto-generated from content keywords                |
| **Context**       | What prompted the discussion                        |
| **Summary**       | 2-3 sentence overview                               |
| **Progress**      | Checkbox items for tracking (auto-synced on append) |
| **Decisions**     | Key decisions made                                  |
| **Tips/Ideas**    | Insights captured during discussion                 |
| **Notes**         | Later additions via `/afx-session note --ref ID`    |
| **Related Files** | Cumulative list of files mentioned across all notes |
| **Participants**  | Who was involved                                    |

### Prompt Capture Entry Structure

Prompt captures preserve **verbatim** user prompts + focused agent-reply excerpts at pivotal moments — complementing summary-style Discussions. Appended by `/afx-session capture`.

| Field                 | Purpose                                                                                                                                                  |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `type:prompt-capture` | Inline marker distinguishing from discussion entries                                                                                                     |
| ISO 8601 timestamp    | When the exchange happened                                                                                                                               |
| `[tags]`              | Auto-generated from content keywords                                                                                                                     |
| `trigger`             | Kind: `new-fr`, `new-nfr`, `removed-fr`, `design-pivot`, `missed-req`, `scope-cut`, `ambiguity-resolved`, `question-resolved`, `other`                   |
| `triggered-change`    | Anchors affected (FR-X, DES-X, task X.Y) — lets future agents trace why an anchor exists                                                                 |
| `agent`               | Agent identity: `claude-code`, `codex`, `copilot`, `gemini-code-assist`, `other`, or `unknown`. Follows the git co-author convention.                    |
| `model`               | Model identifier: e.g., `claude-opus-4-7`, `claude-sonnet-4-6`, `gpt-5-codex`, `gemini-2.5-pro`, or `unknown`. Lets reviewers filter by capability tier. |
| **User prompt**       | Exact text from the conversation, quoted as a markdown blockquote                                                                                        |
| **Agent reply**       | Focused excerpt (1–5 sentences) covering the decision; `[...]` for omissions                                                                             |
| **Outcome**           | Bullet list of concrete file/anchor changes the prompt produced                                                                                          |

IDs use `DNC-P{NNN}` to distinguish from discussion IDs (`DNC-D{NNN}`). Append-only, chronological, never rewrite.

### Related Files Tracking

The `**Related Files**:` field is **cumulative** - it grows as notes are appended:

1. When recording a discussion, include files mentioned in context
2. When appending notes, add any new files mentioned to the list
3. Keep files comma-separated for easy scanning
4. Include both source files and config files as relevant

**Example accumulation**:

```markdown
# Initial record

**Related Files**: .env, packages/configs/src/backend.ts

# After N1 mentions amplify config

**Related Files**: .env, packages/configs/src/backend.ts, infrastructure/amplify/amplify.yml

# After N2 mentions dashboard config

**Related Files**: .env, packages/configs/src/backend.ts, infrastructure/amplify/amplify.yml, infrastructure/dashboard/amplify-dashboard.yml
```

### Prefix Convention

Each feature journal uses a 2-4 character prefix for discussion IDs:

| Feature           | Prefix | Example    |
| ----------------- | ------ | ---------- |
| (global)          | `GEN`  | `GEN-D001` |
| user-auth         | `UA`   | `UA-D001`  |
| infrastructure    | `INF`  | `INF-D001` |
| users-permissions | `UP`   | `UP-D001`  |

Define prefix in `<!-- prefix: XX -->` comment after title.
