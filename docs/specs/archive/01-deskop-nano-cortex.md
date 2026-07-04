---
afx: true
type: SPRINT
status: Superseded
owner: "@richard-sentino"
version: "1.1"
created_at: "2026-06-10T11:54:35.000Z"
updated_at: "2026-06-12T08:44:34.000Z"
tags: ["01-deskop-nano-cortex", "sprint", "tauri", "rust", "midi", "ble"]
approval:
  spec: Approved
  design: Approved
  tasks: Approved
---

# 01 Deskop Nano Cortex — Sprint Brief

> **⚠️ SUPERSEDED (2026-06-13)**: This single-document sprint brief was graduated into a numbered
> multi-spec tree. The living source of truth is now [`docs/specs/001-overview`](../001-overview/spec.md)
> and its zone specs (`100`–`500`). This file is retained as history only — do not edit it or point
> `@see` links at it.

> **Format**: Single-document SDD. Carries spec + design + tasks in one file for fast, surgical feature work.
> **Approval gates**: Sections must be approved in order — Spec → Design → Tasks → Code. Track via the `approval` block in frontmatter.
> **Graduation**: Run `/afx-sprint graduate` to split into `spec.md` / `design.md` / `tasks.md` when scope grows. Section structure below mirrors the parent templates (demoted one heading level) so graduation is a clean extract + heading-level promote + `@see` path retarget.
>
> **Note on slug**: The user-provided slug `01-deskop-nano-cortex` contains a typo (`deskop` → `desktop`). Kept verbatim to honor the explicit input. If a rename is desired, run the next `new` under a clean slug and stop using this one.

---

<!-- SPRINT-SECTION-START: SPEC (maps to spec.md on graduation — includes References + Section 1 body; drop `## 1. Spec` wrapper, promote ### → ##) -->

## References

> **Upstream Context**: Link to relevant proposals, research, or architecture docs that drove this sprint.

- **Tauri**: https://tauri.app/ — Rust + WebView shell, cross-platform desktop apps
- **midir (Rust MIDI)**: https://docs.rs/midir/ — cross-platform USB MIDI (CoreMIDI / ALSA / WinMM)
- **btleplug (Rust BLE)**: https://docs.rs/btleplug/ — cross-platform BLE stack used for Nano Cortex GATT connect/notify/write diagnostics
- **Official Nano Cortex MIDI manual**: https://neuraldsp.com/manual/nano-cortex#Incoming-MIDI-CC-List — source of documented PC/CC scope

---

## 1. Spec

> The WHAT — requirements, acceptance, scope. Mirrors `afx-spec/assets/spec-template.md`. Use `[FR-X]` / `[NFR-X]` anchors so code `@see` links can be retargeted cleanly after graduation.

### Problem Statement

A compact React/TypeScript control surface established the product's earliest live-controller shape: documented Program Change / Control Change sends, MIDI input reflection, and a clear separation between transport and UI state. That early surface was not proof of a full preset editor, parameter editor, capture manager, or stable Nano Cortex BLE configuration API.

A cross-platform native desktop app eliminates the browser dependency, exposes direct USB MIDI via the OS MIDI stack, and gives musicians a polished desktop control surface for live/studio use. The current product scope is intentionally honest: documented MIDI control first, USB MIDI receive where the Nano is configured to send MIDI Out, and BLE connection/notification instrumentation as a guarded experimental path. The app must not present fictitious full-editor state derived from unknown BLE packets.

**Current vehicle: Tauri 2.x + Rust backend + a new React/TS/Tailwind frontend.** Tauri was chosen over Electron (10-50x smaller binary, much lower idle RAM, no bundled Chromium), over native per-OS toolchains (one codebase, one release pipeline), and over Flutter / Compose Desktop (a new React/TS/Tailwind app matches the team's existing web skills while keeping the desktop UX purpose-built).

### User Stories

#### Primary Users

- **Performing / session guitarists** using a Nano Cortex on stage or in studio.
- **Tone tinkerers** who want a fast preset / effect switcher that works on any OS.
- **Linux users** who currently have no first-class option for WebMIDI-based Nano Cortex control.
- **Desktop users** who want a one-click install with auto-reconnect on launch.

#### Stories

**As a** Nano Cortex player on macOS
**I want** a signed `.dmg` / `.app` I can drag into Applications
**So that** I have a one-click install with no browser, no SysEx prompt, and a Dock icon that remembers my last device.

**As a** Nano Cortex player on Windows
**I want** a signed `.msi` / `.exe` installer
**So that** I get a Start Menu entry, system tray icon, and WebView2 pre-flight — no extra setup.

**As a** Nano Cortex player on Linux
**I want** a `.deb` and an `.AppImage`
**So that** I can install on Debian / Ubuntu and run portably elsewhere without a browser.

**As a** performing musician
**I want** global keyboard shortcuts (1–9, arrows) that work even when the app is unfocused
**So that** I can switch presets with my off-hand mid-take without alt-tabbing.

**As a** returning user
**I want** the app to auto-reconnect to my Nano Cortex the moment I plug in via USB
**So that** I don't have to click "Connect MIDI" every session.

**As a** Linux user with a non-Chromium browser
**I want** a binary that does not depend on WebMIDI
**So that** I can finally use the tool on Firefox or any browser, because the actual MIDI path is in Rust, not the WebView.

### Requirements

#### Functional Requirements

| ID   | Requirement                                                                                                              | Priority    |
| ---- | ------------------------------------------------------------------------------------------------------------------------ | ----------- |
| FR-1 | Ship installable binaries for macOS (`.dmg` / `.app`), Windows (`.msi` / `.exe`), and Linux (`.deb` + `.AppImage`).       | Should Have |
| FR-2 | Direct USB MIDI access in the Rust backend via `midir`: enumerate output ports, select a Nano-looking port, send raw MIDI bytes, and start a host input listener for device-originated MIDI where available. | Must Have   |
| FR-3 | Build a new React / TypeScript / Tailwind frontend from scratch, shaped around this app's desktop control-surface workflow. | Must Have   |
| FR-4 | Implement a `TauriMidiConnection` frontend service that wraps Tauri IPC and exposes documented Nano Cortex MIDI helpers: Program Change, Control Change, preset recall, FX slot enable, tuner, tap tempo, and expression. | Must Have   |
| FR-5 | Route MIDI I/O through Tauri commands/events: `list_ports`, `connect`, `disconnect`, `send_midi`, `midi://message`, `midi://disconnected`, `midi://log`, and related state/debug commands. | Must Have   |
| FR-6 | System tray icon showing connection state, with quick show / hide / quit actions.                                         | Should Have |
| FR-7 | Persistent settings on disk: last connected device name, last preset, window position, and window geometry.              | Should Have |
| FR-8 | Global keyboard shortcuts (1–9, ArrowLeft, ArrowRight) registered via `tauri-plugin-global-shortcut`, working even when the window is unfocused. | Should Have |
| FR-9 | USB auto-reconnect/hotplug support may be implemented as polling or manual refresh; current v0.1 must at least expose reliable connect/disconnect and port refresh. | Should Have |
| FR-10 | BLE support via `btleplug` must connect to Nano Cortex, select write characteristic `0000c302-...` when present, subscribe to notification/indication characteristics (`c305`, `c306`), log raw packets, and disconnect cleanly. BLE preset/config decoding remains provisional. | Must Have   |
| FR-11 | Auto-update via `tauri-plugin-updater` (GitHub Releases channel), with a manual "Check for updates" fallback.            | Could Have  |
| FR-12 | Code-signing for v0.2+: macOS Developer ID + notarization and Windows Authenticode when certs are available. v0.1 may ship unsigned with documented Gatekeeper/SmartScreen caveats. | Could Have  |
| FR-13 | Documented Nano Cortex MIDI command scope: PC `0-63`, CC `1` expression, CC `37-41` FX slots 1-5 (`0` off / `127` on), CC `42` tap tempo (`127`), CC `43` tuner (`0` off / `127` on), all on selected MIDI channel 1-16. | Must Have   |
| FR-14 | CI/build workflow should produce repeatable frontend/backend build artifacts and, later, release installers from a single tagged commit. | Should Have |
| FR-15 | Fixed Nano Cortex signal-chain UI must model role-based hardware containers (`Gate -> Pre FX 1 -> Pre FX 2 -> Capture -> IR/Cab -> Post FX 1 -> Post FX 2 -> Post FX 3`) rather than a freeform modeler grid. | Must Have   |
| FR-16 | Footswitch/live-access UI must model hardware assignment behavior (4-preset/2-preset modes, subslot toggles, global-bypass affordance) without implying undocumented MIDI footswitch press commands. | Should Have |
| FR-17 | MIDI monitor and app log must show outgoing commands, incoming USB MIDI messages, BLE notifications/debug packets, connection lifecycle, and errors for stage/studio troubleshooting. | Must Have   |

#### Non-Functional Requirements

| ID    | Requirement         | Target                                                                                                          |
| ----- | ------------------- | --------------------------------------------------------------------------------------------------------------- |
| NFR-1 | Installer size      | < 30 MB per platform (vs Electron baseline ~150 MB+).                                                           |
| NFR-2 | Cold start          | App window visible < 1.5 s on a modern laptop.                                                                  |
| NFR-3 | Idle memory         | < 150 MB resident on macOS / Windows / Linux when connected and idle.                                           |
| NFR-4 | MIDI round-trip     | UI → device send path should be effectively immediate over wired USB; device → UI feedback depends on Nano MIDI Out configuration and should be reflected without optimistic-only state when received. |
| NFR-5 | Reproducible builds | All platform artifacts should be produced from a single `git describe` tag via CI where signing keys allow. |
| NFR-6 | Cross-OS parity     | Core documented MIDI control verified on at least one machine per OS in CI smoke or documented manual hardware matrix. |
| NFR-7 | Independent frontend | The frontend must remain an app-owned implementation: independently buildable, shippable, and shaped around the desktop control-surface UX. |
| NFR-8 | Honest state model | UI state must distinguish confirmed incoming MIDI, locally-sent provisional state, and provisional/experimental BLE decoding; no undocumented BLE-derived field is presented as authoritative. |

### Acceptance Criteria

- [ ] `cargo check --manifest-path backend/Cargo.toml --features ble` passes.
- [ ] `npm --prefix frontend run build` passes.
- [ ] USB MIDI connect / disconnect works against a real Nano Cortex.
- [ ] USB MIDI input listening emits `midi://message` and updates preset/CC/expression/tuner UI when the Nano is configured to send MIDI Out.
- [ ] Documented outgoing MIDI commands work on hardware: PC `0-63`, CC1, CC37-41, CC42, CC43, and selected MIDI channel 1-16.
- [ ] BLE scan/connect works against the real Nano Cortex and logs service/characteristic details, selected write characteristic, and notify/indicate subscriptions.
- [ ] BLE disconnect unsubscribes notification/indication characteristics before disconnecting and logs the cleanup result.
- [ ] Fixed signal-chain UI displays role containers in Nano hardware order, not a freeform grid.
- [ ] Footswitch UI communicates live access/assignment behavior without claiming undocumented MIDI footswitch press support.
- [ ] MIDI monitor/app log shows outgoing commands, incoming USB MIDI, BLE debug notifications, lifecycle events, and errors.
- [ ] No WebMIDI, no Chromium-only API surface, no browser dependency at runtime.
- [ ] First-run/connection UI explains USB MIDI vs BLE and identifies BLE protocol decoding as experimental/provisional.

### Non-Goals (Out of Scope)

- Cloud preset sync, full preset editing, capture management, IR/library management, or amp modeling — those are owned by Neural DSP's Cortex Cloud unless a stable public API is documented later.
- Treating undocumented Nano Cortex BLE notification payloads as a stable public preset/config protocol.
- Presenting speculative BLE-derived fields as authoritative device state without repeatable labeled traces and graceful fallback.
- Literal MIDI "press footswitch" commands; footswitches are modeled as live-access/assignment behavior only.
- Firmware updates for the Nano Cortex itself.
- iOS / Android targets.
- Audio I/O, IR loading, or any signal-processing inside the app.
- A plug-in host (VST3 / AU / CLAP).
- Multi-device MIDI routing.

### Open Questions

| #   | Question                                                                                                          | Status   | Blocking | Resolution                                                                                  |
| --- | ----------------------------------------------------------------------------------------------------------------- | -------- | -------- | ------------------------------------------------------------------------------------------- |
| 1   | Should BLE MIDI be in MVP (FR-10) or follow-up? BLE on Linux is unreliable; macOS / Windows work fine.            | Resolved | No       | **Resolved 2026-06-10** ([DNC-P006](#d-p006--ble-promoted-to-v01-sprint-scope-expanded)): **BLE promoted to v0.1** per user decision. macOS/Windows only; Linux BLE off via `ble` cargo feature. btleplug 0.11+ confirmed active (1135 stars, 2026-05-25 push). The Rust desktop app uses native BLE rather than browser BLE, avoiding browser-level limitations. v0.1 now ships USB + BLE. |
| 2   | Do we have an Apple Developer ID + a Windows code-signing EV cert? Without them, install prompts scare users.     | Resolved | No       | **Resolved 2026-06-10** ([DNC-P001](#d-p001--spec-open-questions-q2--q5-resolved)): User does not have an Apple Developer ID. v0.1 ships **unsigned** on macOS (README documents the Gatekeeper right-click bypass). Windows cert status not yet confirmed by the user; treat the same way (unsigned v0.1 with SmartScreen caveat) unless a cert is added to CI secrets. Signing infrastructure (`tauri.bundle` config, CI secrets schema) is in place from v0.1 so adding certs in v0.2 is configuration-only. |
| 3   | Distribution: GitHub Releases only, or also `brew tap`, `scoop`, `apt`? Affects CI scope.                         | Open     | No       | Recommend: GitHub Releases for v0.1; package managers for v0.2 once signing + update channel are solid. |
| 4   | Auto-update (FR-11) — Tauri updater over GitHub Releases, or a third-party (Squirrel / Sparkle)?                  | Open     | No       | Recommend: Tauri updater (single cross-platform path).                                      |
| 5   | Should the React frontend be a reused source tree, a git submodule, a package, or a purpose-built implementation? | Resolved | No       | **Resolved 2026-06-10** ([DNC-P001](#d-p001--spec-open-questions-q2--q5-resolved)): Build a new React/TS/Tailwind frontend from scratch. No non-project app code is copied or imported. FR-3, NFR-7, FR-12, DES-OVR / DES-UI / DES-FILES, and Task 3.1 updated to match. |
| 6   | Slug typo: keep `01-deskop-nano-cortex` or rename to `desktop-nano-cortex`?                                        | Open     | No       | Default: keep as-typed. User must explicitly request rename.                                 |
| 7   | Are CC `34-36` officially supported for Gate/Capture/Cab on Nano Cortex, or only present in the reference app?       | Open     | No       | Current documented-control scope remains CC `1`, `37-43` and PC `0-63`; do not expose CC `34-36` as documented controls until verified against official manual/hardware. |

### Dependencies

- **Rust toolchain** (1.77+ stable, Tauri 2.x minimum).
- **Node 20+** for the Vite frontend build.
- **Tauri 2.x CLI** (`cargo install tauri-cli --version "^2.0"` or `npm i -D @tauri-apps/cli`).
- **Platform SDKs**:
  - macOS: Xcode Command Line Tools, `dmg` tool for packaging, `codesign` + `notarytool` for signing.
  - Windows: WebView2 runtime (preinstalled on Win10 21H2+ / Win11), MSVC build tools, `signtool` for Authenticode.
  - Linux: `webkit2gtk-4.1`, `libayatana-appindicator3-dev`, `librsvg2-dev`, `patchelf`, `fakeroot` + `dpkg-deb` for `.deb`.
- **External crates** (current backend):
  - `tauri` 2.x with tray icon support, `tauri-plugin-shell`, `tauri-plugin-global-shortcut`, `tauri-plugin-store`, `tauri-plugin-notification`
  - `midir` 0.10 for USB MIDI
  - `btleplug` 0.11 and `uuid` behind the `ble` feature
  - `serde`, `serde_json`, `tokio`, `tracing`, `tracing-subscriber`, `anyhow`, `thiserror`, `futures`
- **External npm** (current frontend; no `webmidi` import): `react`, `react-dom`, `@tauri-apps/api`, `@tauri-apps/cli`, `@tailwindcss/vite`, `tailwindcss`, `vite`, `typescript`, `@vitejs/plugin-react`.

<!-- SPRINT-SECTION-END: SPEC -->

---

<!-- SPRINT-SECTION-START: DESIGN (maps to design.md on graduation; promote ### → ##) -->

## 2. Design

> The HOW — architecture, decisions, data model. Mirrors `afx-design/assets/design-template.md`. Use `[DES-X]` anchors on section headings so code `@see` links can be retargeted cleanly after graduation.

### [DES-OVR] Overview

<!-- @see docs/specs/01-deskop-nano-cortex/01-deskop-nano-cortex.md [FR-2] [FR-3] [FR-4] [FR-5] [FR-10] [FR-13] [FR-15] [FR-16] [FR-17] [NFR-7] [NFR-8] -->

Tauri 2.x shell with a Rust backend owning USB MIDI via `midir`, BLE GATT connect/notify/write via `btleplug`, and a new React/TS/Tailwind frontend. The app is a documented MIDI live controller first: outgoing PC/CC commands are explicit, incoming USB MIDI is observed through `midi://message`, and BLE private-protocol state remains provisional/debuggable rather than authoritative.

The Rust backend exposes typed Tauri commands (`list_ports`, `connect`, `disconnect`, `send_midi`, `get_state`, `get_device_name`, `get_nano_state`, `get_ble_capabilities`, `get_ble_debug_log`, `ble_scan`, `ble_ping`) and emits Tauri events (`midi://message`, `midi://connected`, `midi://disconnected`, `midi://error`, `midi://ports-changed`, `midi://log`) consumed by the React UI. `TauriMidiConnection` wraps the command surface and provides documented Nano MIDI helpers; inbound event subscription is handled through `frontend/src/shared/ipc/events.ts` and `App.tsx`.

### [DES-ARCH] Architecture

#### System Context

```
┌──────────────────────────────────────────────────────────┐
│ Desktop (macOS / Windows / Linux)                        │
│ ┌──────────────────────────────────────────────────────┐ │
│ │ Tauri Shell (Rust)                                   │ │
│ │ ┌──────────────────┐        ┌─────────────────────┐  │ │
│ │ │ MIDI Backend     │        │  Tauri IPC Bridge   │  │ │
│ │ │  - midir (USB)   │◀──────▶│  - commands (req)   │  │ │
│ │ │  - btleplug(BLE) │        │  - events  (push)   │  │ │
│ │ │  - hotplug watch │        └──────────┬──────────┘  │ │
│ │ └────────┬─────────┘                   │             │ │
│ │          │ MIDI (USB / BLE)            │             │ │
│ └──────────┼────────────────────────────┼─────────────┘ │
└────────────┼────────────────────────────┼───────────────┘
             │                            │
             ▼                            ▼
   ┌───────────────────┐         ┌────────────────────────┐
   │  Nano Cortex      │         │  WebView (system)      │
   │  (USB / BLE)      │         │  React + TS + Tailwind │
   │                   │         │  (desktop UI)          │
   │                   │         │                       │
   └───────────────────┘         └────────────────────────┘
```

#### Component Diagram

- **Tauri Host (`backend/`)**: entry point, plugin registration, command handlers, shared `AppState`, tray/shortcuts/settings plugin setup.
- **MIDI Infrastructure (`backend/src/infrastructure/midi/`)**: `midir` output send, `midir` input listener, port enumeration/name matching, BLE GATT scan/connect/notify/write/disconnect, BLE packet logging/inspection/provisional decoding.
- **IPC (`backend/src/ipc/`)**: Tauri command handlers + event emitters. `commands.rs` maps UI actions to infrastructure; `events.rs` centralizes event names and payload emission; `mapping.rs` owns serde boundary helpers.
- **Domain (`backend/src/domain/`)**: no I/O; value objects for MIDI ports/messages, device state, settings, footswitch model, normalized Nano state/capability matrix.
- **Frontend (`frontend/src/`)**: composition root in `app/`, MIDI feature slice in `features/midi/`, cross-feature IPC contracts in `shared/ipc/`, log/theme/shared UI in `shared/`. No `webmidi` import.
- **`TauriMidiConnection` (`frontend/src/features/midi/services/TauriMidiConnection.ts`)**: wraps `send_midi` and exposes documented PC/CC helpers; `App.tsx` handles inbound `midi://message` updates.

### [DES-UI] User Interface & UX

<!-- @see docs/specs/01-deskop-nano-cortex/01-deskop-nano-cortex.md [FR-3] [FR-13] [FR-15] [FR-16] [FR-17] [NFR-8] -->

The React / Tailwind UI is a desktop live control surface built from scratch, with a lighter premium hardware-panel feel. Cyan is reserved for selected/connected/active states.

Current UI composition maps 1:1 to code:

- **`StatusBar.tsx`**: app identity, USB connect, BLE connect, disconnect, BLE ping, log-panel toggle, status/error text.
- **`MidiTransportSettings.tsx`**: transport selector (`usb` / conceptual `trs`), selected MIDI channel 1-16, connection/device summary. TRS is currently user-facing state; backend still sends to the selected OS MIDI port.
- **`SignalChain.tsx`**: fixed Nano Cortex chain: `Gate -> Pre FX 1 -> Pre FX 2 -> Capture -> IR/Cab -> Post FX 1 -> Post FX 2 -> Post FX 3`. Slots are role containers first; loaded names are secondary. Fixed blocks are not presented as documented MIDI toggles.
- **`LiveControlPanel.tsx`**: documented controls only: FX slots 1-5 (CC37-41), tuner (CC43), tap tempo (CC42), expression (CC1).
- **`PresetGrid.tsx`**: 64 presets mapped to Program Change `0-63`.
- **`Footswitches.tsx`**: 4-preset/2-preset mode live-access model, subslot assignment, and global-bypass affordance without claiming literal MIDI footswitch presses.
- **`MidiMonitor.tsx`**: rolling outgoing/incoming MIDI command log for stage/studio debugging.
- **`LogPanel.tsx`**: backend/app logs, including BLE scan/connect/debug notification output.

### [DES-DEC] Key Decisions

| Decision | Options Considered | Choice | Rationale |
| -------- | ------------------ | ------ | --------- |
| Desktop shell | Tauri 2.x, Electron, native per-OS, Flutter/Compose Desktop | Tauri 2.x | Small binary, low idle RAM, single codebase, React UI skills retained, Rust owns device I/O. |
| USB MIDI library | `midir`, raw OS MIDI APIs, WebMIDI | `midir` | Cross-platform Rust access to CoreMIDI/ALSA/WinMM without browser/WebMIDI permission gates. |
| USB state model | Fire-and-forget only, query device state, listen to incoming MIDI | Send documented MIDI and listen for incoming MIDI | Nano MIDI does not expose full state query/preset names, but device-originated PC/CC can update UI when Nano MIDI Out is configured. |
| BLE approach | Treat as stable editor API, remove BLE, instrument/provisionally decode | Instrumented BLE connect/notify/write with provisional decoding | BLE connection works, but no public Nano preset/config protocol exists. Keep raw packet logs, capability matrix, provisional state, and graceful fallback. |
| Frontend implementation strategy | Reuse source tree, submodule, package, new build | New build from scratch | The codebase stays independent and lets the desktop UX evolve around this app's control-surface workflow. |
| Device mental model | Freeform modeler grid, flat CC buttons, fixed hardware chain | Fixed chain + live MIDI controls | Nano Cortex has fixed role slots. UI should match hardware: role containers first, loaded effect identity second. |
| Footswitch model | Literal MIDI footswitch press commands, ignore footswitches, assignment model | Assignment/live-access model only | No documented MIDI command exists for pressing hardware footswitches; UI models 4-preset/2-preset behavior without false protocol claims. |
| IPC pattern | Commands only, events only, both | Tauri commands + Tauri events | Commands handle actions (`send_midi`, `connect`); events stream inbound MIDI/logs/lifecycle (`midi://message`, `midi://log`). |
| Settings persistence | Manual JSON, `tauri-plugin-store`, none | `tauri-plugin-store` | Current code loads/saves app settings and window geometry through the Tauri store plugin. |
| Code signing | Developer ID/AuthentiCode now, unsigned v0.1, no signing | Unsigned v0.1 with documented caveats; signing later | User has no Apple Developer ID. Keep signing infrastructure direction but do not block useful hardware testing. |

### [DES-DATA] Data Model

<!-- @see docs/specs/01-deskop-nano-cortex/01-deskop-nano-cortex.md [FR-2] [FR-4] [FR-5] [FR-10] [FR-13] [FR-15] [FR-16] [FR-17] [NFR-8] -->

#### TypeScript Contracts (frontend)

Source of truth: `frontend/src/shared/ipc/commands.ts`, `frontend/src/shared/ipc/events.ts`, `frontend/src/features/midi/types.ts`, `frontend/src/features/midi/constants.ts`.

| Type / Constant | Current code path | Purpose |
| --------------- | ----------------- | ------- |
| `MidiPort` | `frontend/src/shared/ipc/commands.ts` | `{ id, name, direction: "in" | "out", kind: "usb" | "ble" }` |
| `NanoState` | `frontend/src/shared/ipc/commands.ts` | Normalized command/provisional BLE state with `syncMode`, active preset, bank, fixed-chain slots, expression, stale/provisional flags |
| `BleCapabilityMatrix` | `frontend/src/shared/ipc/commands.ts` | Documents which Nano fields are confirmed/inferred/unsupported/unverified |
| `BlePacketLogEntry` | `frontend/src/shared/ipc/commands.ts` | BLE debug/inspector packet log entries |
| `MidiMessagePayload` | `frontend/src/shared/ipc/events.ts` | Incoming MIDI event payload `{ ts_ms, bytes }` |
| `MIDI_CC` / `FX_SLOT_CC` | `frontend/src/features/midi/constants.ts` | Documented control map: CC1, CC37-43 |
| `NanoCortexFootswitchState` | `frontend/src/features/midi/types.ts` | Assignment/live-access footswitch state |

#### Rust Domain Types (backend)

Source of truth: `backend/src/domain/*.rs`.

| Type | Current code path | Purpose |
| ---- | ----------------- | ------- |
| `MidiPort` / `PortDirection` / `PortKind` | `backend/src/domain/port.rs` | Host MIDI/BLE port metadata exposed over IPC |
| `MidiMessage` | `backend/src/domain/midi_message.rs` | Timestamped raw MIDI bytes emitted as `midi://message` |
| `Device` / `DeviceState` | `backend/src/domain/device.rs` | Current connection state |
| `Settings` | `backend/src/domain/settings.rs` | Persisted app/window/device settings |
| `NanoState` / `SyncMode` / `NanoSlotState` / `CapabilityMatrix` | `backend/src/domain/nano_state.rs` | Normalized Nano state with provisional/confirmed capability metadata |
| `NanoCortexFootswitchState` | `backend/src/domain/footswitch.rs` | Footswitch assignment/live-access model |

### [DES-API] API Contracts

<!-- @see docs/specs/01-deskop-nano-cortex/01-deskop-nano-cortex.md [FR-2] [FR-4] [FR-5] [FR-10] [FR-13] [FR-17] -->

#### Tauri Commands (Rust → callable from TS)

| Command | TS wrapper | Rust handler | Payload / Return | Trace |
| ------- | ---------- | ------------ | ---------------- | ----- |
| `list_ports` | `listPorts()` | `backend/src/ipc/commands.rs::list_ports` | `Result<Vec<MidiPort>, String>` | [FR-2] |
| `connect` | `connect(deviceName)` | `commands.rs::connect` | `{ deviceName: String } -> Result<String, String>`; starts USB input listener if available | [FR-2], [FR-5] |
| `disconnect` | `disconnect()` | `commands.rs::disconnect` | disconnects UI/app state; BLE physical disconnect runs with timeout | [FR-5], [FR-10] |
| `send_midi` | `sendMidi(portName, bytes)` | `commands.rs::send_midi` | `{ portName, bytes } -> Result<(), String>`; routes USB vs BLE by stored device kind | [FR-4], [FR-13] |
| `get_state` | `getState()` | `commands.rs::get_state` | `"connected" | "connecting" | "disconnected" | "error"` | [FR-5] |
| `get_device_name` | `getDeviceName()` | `commands.rs::get_device_name` | `Option<String>` | [FR-5] |
| `get_nano_state` | `getNanoState()` | `commands.rs::get_nano_state` | `NanoState` | [FR-10], [NFR-8] |
| `get_ble_capabilities` | `getBleCapabilities()` | `commands.rs::get_ble_capabilities` | `CapabilityMatrix` | [FR-10], [NFR-8] |
| `get_ble_debug_log` | `getBleDebugLog()` | `commands.rs::get_ble_debug_log` | BLE packet log snapshot | [FR-10], [FR-17] |
| `ble_scan` | `bleScan()` | `commands.rs::ble_scan` | connects Nano BLE and stores `BleHandle` | [FR-10] |
| `ble_ping` | `blePing()` | `commands.rs::ble_ping` | BLE adapter availability string | [FR-10] |

#### Tauri Events (Rust → TS)

| Event | Payload | Emitted by | Trigger | Trace |
| ----- | ------- | ---------- | ------- | ----- |
| `midi://message` | `MidiMessage { ts_ms, bytes }` | `events::emit_midi_message` | USB MIDI input listener receives bytes | [FR-2], [FR-5], [FR-17] |
| `midi://connected` | `{ name }` | `events::emit_connected` | BLE connect succeeds; USB connect currently returns status and frontend stores connection | [FR-5], [FR-10] |
| `midi://disconnected` | `null` | `events::emit_disconnected` | user disconnect, BLE watcher disconnect, BLE send failure | [FR-5], [FR-10] |
| `midi://error` | `{ message }` | `events::emit_error` | backend-side MIDI/BLE error path | [FR-17] |
| `midi://ports-changed` | `{ ports }` | `events::emit_ports_changed` | reserved for hotplug/port refresh | [FR-9] |
| `midi://log` | `{ ts, level, message }` | `events::emit_log` | command lifecycle, BLE diagnostics, incoming MIDI debug | [FR-17] |

#### Tauri Events (TS → Rust, none required; commands are enough)

### [DES-FILES] File Structure

<!-- @see docs/specs/01-deskop-nano-cortex/01-deskop-nano-cortex.md [FR-2] [FR-3] [FR-4] [FR-5] [FR-6] [FR-7] [FR-8] [FR-10] [FR-13] [FR-15] [FR-16] [FR-17] -->

Current implementation is a polyglot monorepo with a feature-sliced frontend and layered backend. This section is the 1:1 source map for current files; future CI/release/runbook files remain planned until created.

```text
project-root/
├── .afx/context.md                         # latest handoff bundle
├── .gitignore
├── .vscode/settings.json
├── package.json / package-lock.json         # root scripts: frontend + Tauri dev/build helpers
├── docs/specs/01-deskop-nano-cortex/
│   ├── 01-deskop-nano-cortex.md             # living sprint doc
│   └── journal.md                           # append-only decisions/history
├── backend/                                 # Rust + Tauri 2.x crate
│   ├── Cargo.toml / Cargo.lock
│   ├── build.rs
│   ├── tauri.conf.json
│   ├── capabilities/default.json
│   ├── entitlements.plist
│   ├── icons/*.png
│   └── src/
│       ├── main.rs                          # binary entry
│       ├── lib.rs                           # tauri::Builder, plugins, commands
│       ├── app/
│       │   ├── config.rs
│       │   ├── error.rs
│       │   ├── mod.rs
│       │   └── state.rs                     # AppState incl. BLE handle + USB input listener
│       ├── domain/
│       │   ├── device.rs
│       │   ├── footswitch.rs                # Nano footswitch assignment/live-access model
│       │   ├── midi_message.rs
│       │   ├── mod.rs
│       │   ├── nano_state.rs                # normalized/provisional Nano state + capabilities
│       │   ├── port.rs
│       │   └── settings.rs
│       ├── infrastructure/midi/
│       │   ├── ble.rs                       # btleplug scan/connect/write/notify/disconnect
│       │   ├── ble_debug.rs                 # packet log model + env-gated raw capture
│       │   ├── ble_decoder.rs               # provisional Nano packet decoder
│       │   ├── ble_inspector.rs             # characteristic/service diagnostics
│       │   ├── ble_sync.rs                  # provisional sync/capability update helpers
│       │   ├── connection.rs                # USB send_to_port
│       │   ├── listener.rs                  # USB MIDI input listener
│       │   ├── mod.rs
│       │   └── port_manager.rs              # USB input/output enumeration + Nano matching
│       ├── ipc/
│       │   ├── commands.rs                  # Tauri command handlers
│       │   ├── events.rs                    # midi://* event names + emit helpers
│       │   ├── mapping.rs
│       │   └── mod.rs
│       └── platform/
│           ├── mod.rs
│           ├── settings_store.rs
│           ├── shortcuts.rs
│           └── tray.rs
└── frontend/                                # React + TS + Vite + Tailwind 4
    ├── index.html
    ├── package.json / package-lock.json
    ├── tsconfig.json / tsconfig.node.json
    ├── vite.config.ts
    └── src/
        ├── app/
        │   ├── App.tsx                      # composition + incoming MIDI state updates
        │   └── main.tsx
        ├── features/midi/
        │   ├── components/
        │   │   ├── ExpressionPedal.tsx
        │   │   ├── Footswitches.tsx
        │   │   ├── Header.tsx
        │   │   ├── LiveControlPanel.tsx
        │   │   ├── MidiMonitor.tsx
        │   │   ├── MidiTransportSettings.tsx
        │   │   ├── PresetGrid.tsx
        │   │   ├── SignalChain.tsx
        │   │   └── StatusBar.tsx
        │   ├── constants.ts                 # documented MIDI CC + fixed-chain constants
        │   ├── hooks/
        │   │   ├── useExpression.ts
        │   │   ├── useMidiConnection.ts
        │   │   └── usePreset.ts
        │   ├── services/TauriMidiConnection.ts
        │   └── types.ts
        ├── shared/
        │   ├── hooks/useLogs.tsx
        │   ├── hooks/useTheme.tsx
        │   ├── ipc/commands.ts
        │   ├── ipc/errors.ts
        │   ├── ipc/events.ts
        │   └── ui/components/{LogPanel.tsx,ThemeToggle.tsx}
        ├── styles/index.css
        └── env.d.ts
```

**Key entry points by concern:**

| Concern | Primary files | Trace |
| ------- | ------------- | ----- |
| Tauri shell + plugins | `backend/src/main.rs`, `backend/src/lib.rs`, `backend/tauri.conf.json` | [FR-1], [FR-6], [FR-7], [FR-8] |
| App state | `backend/src/app/state.rs` | [FR-2], [FR-5], [FR-10] |
| USB MIDI enumeration/send/listen | `backend/src/infrastructure/midi/{port_manager,connection,listener}.rs` | [FR-2], [FR-13], [FR-17] |
| BLE connect/debug/provisional sync | `backend/src/infrastructure/midi/{ble,ble_debug,ble_inspector,ble_decoder,ble_sync}.rs` | [FR-10], [FR-17], [NFR-8] |
| IPC commands/events | `backend/src/ipc/{commands,events,mapping}.rs`, `frontend/src/shared/ipc/{commands,events,errors}.ts` | [FR-5], [FR-17] |
| Documented MIDI helpers | `frontend/src/features/midi/services/TauriMidiConnection.ts`, `frontend/src/features/midi/constants.ts` | [FR-4], [FR-13] |
| Fixed signal chain | `frontend/src/features/midi/components/SignalChain.tsx` | [FR-15], [NFR-8] |
| Live controls | `frontend/src/features/midi/components/LiveControlPanel.tsx`, `ExpressionPedal.tsx`, `PresetGrid.tsx` | [FR-13] |
| Footswitch/live access | `backend/src/domain/footswitch.rs`, `frontend/src/features/midi/components/Footswitches.tsx` | [FR-16] |
| Monitor/logging | `frontend/src/features/midi/components/MidiMonitor.tsx`, `frontend/src/shared/ui/components/LogPanel.tsx`, `backend/src/ipc/events.rs` | [FR-17] |
| Theme/premium desktop UI | `frontend/src/styles/index.css`, `frontend/src/shared/hooks/useTheme.tsx`, `ThemeToggle.tsx` | [FR-3] |

### [DES-DEPS] Dependencies

<!-- @see docs/specs/01-deskop-nano-cortex/01-deskop-nano-cortex.md [FR-2] [FR-3] [FR-5] [FR-6] [FR-7] [FR-8] [FR-10] [FR-13] -->

- **Rust current**: `tauri = "2"` with `tray-icon`, `tauri-plugin-shell = "2"`, `tauri-plugin-global-shortcut = "2"`, `tauri-plugin-store = "2"`, `tauri-plugin-notification = "2"`, `midir = "0.10"`, `btleplug = "0.11"` optional behind `ble`, `uuid = "1"` optional behind `ble`, `serde`, `serde_json`, `tokio`, `tracing`, `tracing-subscriber` with `env-filter`, `anyhow`, `thiserror`, `futures`.
- **JS / TS current**: `react = "^19.2.0"`, `react-dom = "^19.2.0"`, `@tauri-apps/api = "^2.0.0"`, `@tauri-apps/cli = "^2.0.0"`, `@tailwindcss/vite = "^4.3.0"`, `tailwindcss = "^4.3.0"`, `vite = "^7.2.4"`, `typescript = "~5.9.3"`, `@vitejs/plugin-react`, React type packages.
- **Removed browser MIDI dependency**: `webmidi` is not used; MIDI access goes through Tauri IPC + Rust `midir`.
- **System** (build-time only): Xcode CLT on macOS, MSVC + WebView2 on Windows, webkit2gtk/ayatana-appindicator/librsvg/patchelf equivalents on Linux.

### [DES-SEC] Security Considerations

- **Tauri CSP**: `default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:;` — no remote origins, no eval. If any visual asset or font is added, bundle it locally in v0.1.
- **MIDI command scope**: frontend helpers clamp Program Change/Control Change values to valid MIDI ranges. Current Nano-facing product scope is documented PC/CC, not arbitrary SysEx/editor writes.
- **Code signing**: macOS Developer ID + notarization ticket; Windows Authenticode. Without these, OS-level warnings scare end users.
- **Auto-update signature**: Tauri updater verifies the update bundle's signature against an embedded public key. Key rotation procedure documented in release runbook.
- **No telemetry, no network calls** in v0.1 — surface explicitly in the README.

### [DES-ERR] Error Handling

| Scenario                                   | Handling                                                                                          |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| No MIDI device found                       | `connect` returns `Err("No MIDI device detected.")`. UI shows a red banner with a "Retry" button. |
| Multiple Nano Cortex devices               | If `lastDeviceName` is set, prefer it; otherwise surface a small picker (v0.2). v0.1: pick the first match. |
| Device disconnects mid-session              | Emit `midi://disconnected`; UI reverts to "Connect" button; auto-reconnect watcher kicks in.     |
| USB hotplug never detected (Linux ALSA)    | Fall back to a 2 s poll of `list_ports` if the OS event hook is unreliable; surface a "manual refresh" button. |
| MIDI send to closed port                   | `send_midi` returns `Err`; UI logs to dev console + a non-modal toast (v0.2).                     |
| `midir` initialization fails (no ALSA)     | `connect` returns `Err` with the OS error string; README documents Linux deps.                    |
| BLE pair/connect fails                      | `ble_scan` returns `Err` with btleplug/context string; UI shows error/status and log panel contains discovered-device diagnostics. Always suggest USB MIDI as fallback. |
| BLE notification stream stays subscribed    | `BleHandle` tracks subscribed characteristics; `disconnect` unsubscribes before disconnecting and logs each unsubscribe result. |
| BLE protocol packet cannot be decoded       | Keep raw packet log and capability as `unverified`/`inferred`; UI must not present it as authoritative state. |
| USB input listener cannot start             | USB outgoing control still works; backend logs "No Nano Cortex USB MIDI input found" or listener error. |

### [DES-TEST] Testing Strategy

- **Rust unit tests** (`cargo test`): port name matching logic, hotplug watcher behavior with mock events, send queue ordering.
- **Rust integration tests** (`cargo test --features test-harness`): drive a virtual MIDI loopback port (e.g., `snd-virmidi` on Linux, IAC on macOS, loopMIDI on Windows CI is impractical — gate per platform).
- **Frontend unit tests** (Vitest): `TauriMidiConnection` against mocked Tauri IPC; `App.tsx` reducer logic; effect toggling state machine.
- **Manual smoke matrix** (documented in release checklist, not in CI): one machine per OS with a real Nano Cortex; connect via USB and BLE (separate runs), switch 5 presets, toggle FX slots, send tap tempo, test expression, verify two-way feedback by changing hardware state with Nano MIDI Out enabled.
- **BLE unit tests / diagnostics**: mock or instrument btleplug `Peripheral` + `Characteristic` to simulate scan, connect, subscribe, write, notification, unsubscribe, disconnect. BLE decoder tests must distinguish confirmed vs provisional fields.
- **BLE E2E** (manual): macOS and Windows only — pair a real Nano Cortex over BLE, verify MIDI I/O works end-to-end.
- **E2E on Linux CI**: virtual MIDI via `snd-virmidi` + `aseqdump`; assert that `send_midi` produces expected bytes on the loopback. Gate macOS / Windows smoke to release-day manual runs.

### [DES-ROLLOUT] Migration / Rollout Plan

<!-- @see docs/specs/01-deskop-nano-cortex/01-deskop-nano-cortex.md [FR-1] [FR-10] [FR-11] [FR-12] [FR-13] [FR-17] [NFR-8] -->

- **v0.1 living target**: documented MIDI live controller with USB send/receive, BLE connect/notify/write diagnostics, fixed signal-chain UI, footswitch/live-access UI, MIDI monitor/log panel. BLE private protocol decoding remains experimental/provisional.
- **v0.1 verification before release**: physical USB two-way MIDI test, documented PC/CC hardware test, BLE disconnect unsubscribe test, and UI audit for no fictitious editor claims.
- **v0.2**: installer/signing hardening, auto-update (`tauri-plugin-updater`), fuller system tray UX, explicit input/output MIDI port selection.
- **v0.3**: package manager distribution (`brew`, `scoop`, `apt` repo) and any full-editor work only if a stable public API or robust labeled-trace decoder exists.
- **Rollback plan**: v0.1 remains opt-in; users can keep their existing device workflow if the desktop app is not adopted.
- **No data migration**: the desktop app starts with empty settings on first launch.

### Open Technical Questions

| #   | Question                                                                                                            | Status   |
| --- | ------------------------------------------------------------------------------------------------------------------- | -------- |
| 1   | `midir` on Linux uses ALSA by default. Do we need JACK or PipeWire-native support for low-latency audio path? (Out of scope per Non-Goals, but document.) | Open     |
| 2   | Hotplug watcher: `midir` has no cross-platform event API. Best cross-OS strategy is a poll thread (~1 Hz) + OS event hook on macOS. Confirm with `midir` maintainers. | Open     |
| 3   | Tauri updater signing key: where is the private key stored in CI? GH Actions secret? HSM? Document the policy.      | Open     |
| 4   | Do we ship a single `.dmg` for both Apple Silicon and Intel, or two `.dmg` files? Apple Silicon-only is the modern default. | Open     |
| 5   | WebView2 on Windows: is the runtime guaranteed on the target Windows versions, or do we need a bootstrapper?        | Open     |

<!-- SPRINT-SECTION-END: DESIGN -->

---

<!-- SPRINT-SECTION-START: TASKS (maps to tasks.md on graduation; promote ### → ##, #### → ###) -->

## 3. Tasks

> The WHEN — hierarchical implementation checklist. Mirrors `afx-task/assets/tasks-template.md`. Every task group references the FR/DES it implements via an `@see` comment using the full project-relative sprint brief path while sprint mode is active.

### Task Numbering Convention

- **0.x** — Phase 0: validation prototype (prove USB + BLE MIDI with a minimal app before committing to the full stack)
- **1.x** — Phase 1: scaffold + Rust MIDI backend
- **2.x** — Phase 2: Tauri IPC bridge
- **3.x** — Phase 3: frontend port
- **4.x** — Phase 4: platform integration (tray, shortcuts, settings, signing)
- **5.x** — Phase 5: CI / release pipeline

References use Node IDs: `[FR-X]`, `[NFR-X]` (Spec section), `[DES-X]` (Design section), `[X.Y]` (this Tasks section).

### Phase 0: Validation prototype

> Ref: [DES-ARCH], [FR-2], [FR-10], [DES-API]

#### 0.1 USB MIDI validation (list ports, send Program Change)

<!-- files: backend/src/infrastructure/midi/{port_manager,connection,listener}.rs, frontend/src/app/App.tsx -->
<!-- @see docs/specs/01-deskop-nano-cortex/01-deskop-nano-cortex.md [FR-2] [FR-13] [FR-17] [DES-ARCH] [DES-API] -->

- [ ] Create a minimal Tauri 2.x app with one window displaying a "List USB Ports" button and a "Send PC#0" button.
- [ ] Wire the Tauri IPC: `list_ports` command → Rust midir enumeration → return port names to the frontend → render in a `<pre>` block.
- [ ] Connect a Nano Cortex via USB. Click "List USB Ports". Confirm the device appears with the expected port name convention ("Nano Cortex MIDI OUT" / "MIDI IN").
- [ ] Implement a `send_midi` command that sends `[0xC0, 0x00]` (Program Change to preset 0) to the first matching Nano Cortex output port.
- [ ] Click "Send PC#0" while connected to a Nano Cortex. Confirm the physical device switches to preset 0.
- [ ] Record the exact USB port names observed on the target OS (macOS / Windows / Linux) in `journal.md`.

#### 0.2 BLE MIDI validation (scan, discover, subscribe, send)

<!-- files: backend/src/infrastructure/midi/ble.rs, backend/Cargo.toml, frontend/src/app/App.tsx -->
<!-- @see docs/specs/01-deskop-nano-cortex/01-deskop-nano-cortex.md [FR-10] [FR-17] [DES-DATA] [DES-API] [NFR-8] -->

- [ ] Add `btleplug` to `Cargo.toml` (behind `ble` feature). Add a "Scan BLE" button to the prototype frontend.
- [ ] Implement BLE scan: btleplug `Central::start_scan()`, filter peripherals by name containing "nano" or "cortex".
- [ ] Click "Scan BLE" while the Nano Cortex is in Bluetooth mode. Confirm the device is discovered.
- [ ] Log the advertised service UUIDs. Determine whether the Nano Cortex uses Nordic-style (`0000a002-…`) or SIG-adopted (`03B80E5A-…`) MIDI service UUID. Record in `journal.md`.
- [ ] Implement BLE connect: open the MIDI I/O characteristic, subscribe to notifications.
- [ ] If BLE connect + subscribe succeeds: send `[0xC0, 0x00]` over BLE. Confirm the physical device switches to preset 0.
- [ ] If BLE connect or subscribe fails: document the btleplug error in `journal.md`. Decide whether BLE stays in v0.1 scope or is cut back to v0.2.

#### 0.3 Document findings and freeze architecture decisions

<!-- files: docs/specs/01-deskop-nano-cortex/journal.md -->
<!-- @see docs/specs/01-deskop-nano-cortex/01-deskop-nano-cortex.md [FR-2] [FR-10] [FR-13] [FR-17] [DES-OVR] [DES-DEC] [DES-ROLLOUT] [NFR-8] -->

- [ ] Record all validated UUIDs, port names, and any BLE quirks in `journal.md`.
- [ ] Freeze the `MidiPortInfo` type's `kind` field enum (confirmed: `usb` and `ble` work).
- [ ] Commit the prototype code to a `prototype/` branch or tag for reference.
- [ ] Proceed to Phase 1 with validated ground truth. If any validation failed, update the spec accordingly before starting Phase 1.

### Phase 1: Scaffold + Rust MIDI backend

> Ref: [DES-ARCH], [DES-FILES], [FR-1], [FR-2], [NFR-1], [NFR-2], [NFR-3]

#### 1.1 Tauri project init + window config

<!-- files: package.json, backend/Cargo.toml, backend/tauri.conf.json, backend/build.rs, frontend/package.json, frontend/vite.config.ts, frontend/index.html -->
<!-- @see docs/specs/01-deskop-nano-cortex/01-deskop-nano-cortex.md [FR-1] [FR-3] [DES-FILES] [DES-DEPS] -->

- [ ] Run `npm create tauri-app@latest` (React + TS template).
- [ ] Pin Rust toolchain to 1.77+ in `rust-toolchain.toml`.
- [ ] Configure `tauri.conf.json` window: title, size, decorations, dev URL.
- [ ] Set `productName`, `identifier`, `version` fields.
- [ ] Add bundle targets: `dmg`, `msi`, `deb`, `appimage`.
- [ ] Add `tauri-plugin-store`, `tauri-plugin-global-shortcut`, `tauri-plugin-notification` to `Cargo.toml` and `package.json`.
- [ ] Add `midir` to `Cargo.toml`.

#### 1.2 MIDI port manager (Rust)

<!-- files: backend/src/domain/{midi_message,port,device}.rs, backend/src/infrastructure/midi/{mod,port_manager,connection,listener}.rs -->
<!-- @see docs/specs/01-deskop-nano-cortex/01-deskop-nano-cortex.md [FR-2] [FR-13] [FR-17] [DES-ARCH] [DES-DATA] [DES-API] [NFR-4] -->

- [x] Implement USB output enumeration with `midir::MidiOutput` in `port_manager::list_output_ports()`.
- [x] Implement USB input enumeration with `midir::MidiInput` in `port_manager::list_input_ports()`.
- [x] Filter/match ports by name containing "nano" or "cortex" and prefer host input names containing device-perspective "OUT" for receive.
- [x] Implement `connect(device_name: String)` that stores connected state and starts the best matching USB input listener when available.
- [x] Implement USB `send_to_port(port_name, bytes)` for raw outgoing MIDI bytes.
- [x] Implement a listener thread that reads MIDI input and emits `midi://message` events with `MidiMessage { ts_ms, bytes }`.
- [x] Write unit tests for Nano port-name matching.

#### 1.3 Hotplug watcher (Rust)

<!-- files: backend/src/infrastructure/midi/port_manager.rs -->
<!-- @see docs/specs/01-deskop-nano-cortex/01-deskop-nano-cortex.md [FR-9] [DES-ERR] -->

- [ ] macOS / Windows: rely on `midir`'s internal port enumeration on `connect` failure.
- [ ] Linux: spawn a poll thread (~1 Hz) that re-runs `list_ports` and emits `midi://ports-changed` on diff.
- [ ] On hotplug + matching `lastDeviceName`, auto-reconnect.
- [ ] Emit `midi://connected` / `midi://disconnected` events.

#### 1.4 BLE MIDI implementation (macOS/Windows, feature-gated)

<!-- files: backend/src/domain/{midi_message,port}.rs, backend/src/infrastructure/midi/ble.rs, backend/Cargo.toml -->
<!-- @see docs/specs/01-deskop-nano-cortex/01-deskop-nano-cortex.md [FR-10] [FR-17] [DES-DATA] [DES-API] [NFR-8] -->

- [ ] Add `btleplug` 0.11+ behind a `ble` cargo feature (on by default for macOS/Windows, off for Linux).
- [x] Implement BLE scan/connect using btleplug and Nano Cortex service UUID `0000a002-0000-1000-8000-00805f9b34fb`.
- [x] Implement BLE characteristic discovery and select write characteristic `0000c302-0000-1000-8000-00805f9b34fb` when present.
- [x] Subscribe to notification/indication characteristics `c305` and `c306`; log raw notifications to terminal/app log and packet logger.
- [x] Implement BLE send through the stored `BleHandle` and route `send_midi` over BLE when connected device kind is `PortKind::Ble`.
- [x] Implement BLE disconnect + cleanup with tracked subscribed characteristics, unsubscribe-first behavior, 5s internal disconnect timeout, and 8s outer task timeout.
- [x] Add BLE inspector/debug/provisional decoder/sync modules for trace capture and capability metadata.
- [ ] Write unit tests with a mock btleplug adapter (simulate scan → peripheral → characteristic → subscribe → notification → write → unsubscribe).
- [ ] Document macOS Bluetooth entitlement (`NSBluetoothAlwaysUsageDescription` in `tauri.conf.json`) + Windows BLE requirements (Bluetooth 4.0+ adapter, the app does not need admin).

### Phase 2: Tauri IPC bridge

> Ref: [DES-API], [FR-4], [FR-5]

#### 2.1 Tauri command handlers

<!-- files: backend/src/ipc/{mod,commands,mapping}.rs, backend/src/lib.rs, backend/src/main.rs -->
<!-- @see docs/specs/01-deskop-nano-cortex/01-deskop-nano-cortex.md [FR-5] [FR-13] [DES-API] -->

- [x] Implement `#[tauri::command] fn list_ports(app_handle) -> Result<Vec<MidiPort>, String>`.
- [x] Implement `#[tauri::command] async fn connect(app_handle, state, device_name: String) -> Result<String, String>`.
- [x] Implement `#[tauri::command] async fn disconnect(app_handle, state) -> Result<(), String>`.
- [x] Implement `#[tauri::command] async fn send_midi(app_handle, state, port_name: String, bytes: Vec<u8>) -> Result<(), String>`.
- [x] Implement `get_state`, `get_device_name`, `get_nano_state`, `get_ble_capabilities`, `get_ble_debug_log`, `ble_scan`, and `ble_ping`.
- [x] Register all commands in `backend/src/lib.rs` via `.invoke_handler(tauri::generate_handler![...])`.

#### 2.2 Tauri event emitter

<!-- files: backend/src/ipc/events.rs -->
<!-- @see docs/specs/01-deskop-nano-cortex/01-deskop-nano-cortex.md [FR-5] [FR-17] [DES-API] -->

- [x] Define event names: `midi://message`, `midi://connected`, `midi://disconnected`, `midi://error`, `midi://ports-changed`, `midi://log`.
- [x] Emit incoming USB MIDI from the listener thread using `events::emit_midi_message`.
- [x] Emit lifecycle/log events from connect, disconnect, BLE scan/connect/send/disconnect, and error paths.
- [x] Document payload types in `frontend/src/shared/ipc/events.ts` and emit helpers in `backend/src/ipc/events.rs`.

### Phase 3: Frontend (new build)

> Ref: [FR-3], [FR-4], [FR-13], [DES-UI]

#### 3.1 Build the desktop control surface from scratch

<!-- files: frontend/src/app/{App.tsx,main.tsx}, frontend/src/features/midi/{components/*,constants.ts,types.ts}, frontend/src/features/midi/services/TauriMidiConnection.ts, frontend/src/styles/index.css -->
<!-- @see docs/specs/01-deskop-nano-cortex/01-deskop-nano-cortex.md [FR-3] [FR-13] [FR-15] [FR-16] [FR-17] [DES-UI] [NFR-7] [NFR-8] -->

- [x] Create a new `frontend/src/features/midi/components/` tree from scratch: `StatusBar`, `Header`, `MidiTransportSettings`, `SignalChain`, `LiveControlPanel`, `PresetGrid`, `Footswitches`, `MidiMonitor`, `ExpressionPedal`.
- [x] Define `frontend/src/features/midi/constants.ts` with documented MIDI map (`MIDI_CC`: CC1, CC37-43), FX slot ordering, preset PC map, fixed-chain labels/icons, and footswitch defaults.
- [x] Define `frontend/src/features/midi/types.ts` with MIDI log entries, transport/channel types, preset/footswitch types, and state maps.
- [x] Build a new `App.tsx` wiring components to `TauriMidiConnection`, Tauri IPC events, MIDI monitor logging, BLE scan/ping, and no `webmidi` import.
- [x] Wire BLE connection path: "Connect BLE" calls `bleScan()` and then marks the frontend connection as BLE-backed for subsequent `send_midi` routing through backend state.
- [x] Add connection/log status in `StatusBar` and `LogPanel`; BLE details are logged rather than shown as authoritative editor state.
- [x] Set the page title to "Desktop Nano Cortex" in `index.html`.

#### 3.2 Implement TauriMidiConnection

<!-- files: frontend/src/features/midi/services/TauriMidiConnection.ts, frontend/src/shared/ipc/{commands,events,errors}.ts -->
<!-- @see docs/specs/01-deskop-nano-cortex/01-deskop-nano-cortex.md [FR-4] [FR-5] [FR-13] [DES-DATA] [DES-API] [NFR-2] -->

- [x] Define `TauriMidiConnection` as the frontend send/control abstraction.
- [x] `connect(portName)`: stores selected port name and local connected state after backend `connectTo` succeeds.
- [x] `disconnect()`: clears selected port and local connected state; backend disconnect is invoked through shared IPC.
- [x] `send(data)`: `sendMidi(portName, data)` → backend `send_midi`.
- [x] Add documented helpers: `sendProgramChange`, `sendControlChange`, `recallPreset`, `setFxSlotEnabled`, `setTunerEnabled`, `sendTapTempo`, `setExpression`.
- [x] Handle inbound `midi://message` in `App.tsx` via `frontend/src/shared/ipc/events.ts`, updating preset/CC/expression/tuner UI from device-originated bytes.
- [ ] Surface backend `midi://error` events in a first-class user-visible error channel beyond log/toast state.

#### 3.3 Wire App.tsx to the new connection

<!-- files: frontend/src/app/App.tsx, frontend/src/features/midi/hooks/{useMidiConnection,usePreset,useExpression}.ts, frontend/src/features/midi/services/TauriMidiConnection.ts -->
<!-- @see docs/specs/01-deskop-nano-cortex/01-deskop-nano-cortex.md [FR-13] [FR-15] [FR-16] [FR-17] [DES-UI] [NFR-8] -->

- [x] Replace browser WebMIDI/Web Bluetooth classes with `TauriMidiConnection` + shared IPC wrappers.
- [x] Keep the "Connect USB" / "Connect BLE" button pair in `StatusBar`.
- [x] Add incoming `midi://message` handling: PC updates current preset; CC updates FX slots/tuner/expression and appends MIDI monitor entries.
- [x] Keep keyboard preset shortcuts through `usePreset`.
- [x] Add fixed signal-chain, live controls, footswitch assignment UI, MIDI monitor, and app log panel.
- [ ] Verify preset switching, FX slots, expression, tap tempo, tuner, selected channel, USB input feedback, and BLE send/disconnect end-to-end with a real device.

### Phase 4: Platform integration

> Ref: [FR-6], [FR-7], [FR-8], [FR-9], [FR-12], [NFR-5]

#### 4.1 System tray

<!-- files: backend/src/platform/tray.rs, backend/src/lib.rs, backend/src/main.rs -->
<!-- @see docs/specs/01-deskop-nano-cortex/01-deskop-nano-cortex.md [FR-6] -->

- [ ] Add a tray icon (green / red / grey) reflecting `get_state()`.
- [ ] Tray menu: Show / Hide / Quit.
- [ ] On click, toggle window visibility.

#### 4.2 Global keyboard shortcuts

<!-- files: backend/src/platform/shortcuts.rs, backend/src/lib.rs, frontend/src/features/midi/hooks/usePreset.ts -->
<!-- @see docs/specs/01-deskop-nano-cortex/01-deskop-nano-cortex.md [FR-8] -->

- [ ] Register `1`–`9`, `ArrowLeft`, `ArrowRight` via `tauri-plugin-global-shortcut`.
- [ ] Map each to a `switchPreset` Tauri command call (or, simpler: send a `midi://hotkey` event to the frontend which calls its own `switchPreset`).
- [ ] Document the conflict-warning UX (shortcuts are global — could clash with other apps).

#### 4.3 Persistent settings

<!-- files: backend/src/platform/settings_store.rs, backend/src/app/state.rs, backend/src/domain/settings.rs, frontend/src/app/App.tsx -->
<!-- @see docs/specs/01-deskop-nano-cortex/01-deskop-nano-cortex.md [FR-7] [DES-DATA] [NFR-3] -->

- [ ] On connect, read `lastDeviceName` from `tauri-plugin-store` and pass it to `connect`.
- [ ] On preset change, write `lastPreset` to store.
- [ ] On window move/resize, write geometry to store.
- [ ] On launch, restore window geometry.

#### 4.4 Auto-reconnect

<!-- files: backend/src/infrastructure/midi/port_manager.rs, frontend/src/app/App.tsx -->
<!-- @see docs/specs/01-deskop-nano-cortex/01-deskop-nano-cortex.md [FR-9] -->

- [ ] On `midi://ports-changed` event with a matching `lastDeviceName`, call `connect(lastDeviceName)`.
- [ ] On successful reconnect, emit `midi://connected` and a frontend toast.

#### 4.5 Code signing

<!-- files: .github/workflows/release.yml, backend/tauri.conf.json, backend/entitlements.plist -->
<!-- @see docs/specs/01-deskop-nano-cortex/01-deskop-nano-cortex.md [FR-12] [DES-SEC] -->

- [ ] Add `signingIdentity` + `entitlements` to `tauri.conf.json` for macOS.
- [ ] Add Windows signing config (`tauri.bundle.windows.signCommand`) using `signtool`.
- [ ] Document required GitHub Actions secrets: `APPLE_CERT_P12_BASE64`, `APPLE_CERT_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER_ID`, `APPLE_API_KEY_P8`, `WINDOWS_CERT_PFX_BASE64`, `WINDOWS_CERT_PASSWORD`.

### Phase 5: CI / release

> Ref: [FR-1], [FR-14], [NFR-5]

#### 5.1 GitHub Actions matrix

<!-- files: .github/workflows/release.yml, .github/workflows/ci.yml -->
<!-- @see docs/specs/01-deskop-nano-cortex/01-deskop-nano-cortex.md [FR-1] [FR-14] [NFR-5] [FR-11] [NFR-1] -->

- [ ] Create `.github/workflows/ci.yml`: `cargo test`, `cargo clippy`, `npm run build`, `npm run lint`, on PRs to `main`.
- [ ] Create `.github/workflows/release.yml`: matrix on `macos-latest` / `windows-latest` / `ubuntu-latest`, triggered by tag `v*`.
- [ ] Each matrix leg runs `npm ci && npm run tauri build` and uploads artifacts.
- [ ] On tag push, draft a GitHub Release with the three artifacts attached.

#### 5.2 Smoke harness

<!-- files: scripts/smoke-linux.sh, docs/runbooks/smoke-matrix.md -->
<!-- @see docs/specs/01-deskop-nano-cortex/01-deskop-nano-cortex.md [NFR-6] [DES-TEST] -->

- [ ] Linux CI: start `snd-virmidi` loopback, launch the app, drive `connect` + `send_midi` via a sidecar script, assert output with `aseqdump`.
- [ ] macOS / Windows: document manual smoke checklist in `docs/runbooks/smoke-matrix.md`.

### Cross-Reference Index

| Task | Spec Requirement                       | Design Section                       |
| ---- | -------------------------------------- | ------------------------------------ |
| 0.1  | [FR-2], [FR-13], [FR-17]               | [DES-ARCH], [DES-API]                |
| 0.2  | [FR-10], [FR-17], [NFR-8]              | [DES-DATA], [DES-API]                |
| 0.3  | [FR-2], [FR-10], [FR-13], [FR-17], [NFR-8] | [DES-OVR], [DES-DEC], [DES-ROLLOUT] |
| 1.1  | [FR-1], [FR-3]                         | [DES-FILES], [DES-DEPS]              |
| 1.2  | [FR-2], [FR-13], [FR-17], [NFR-4]      | [DES-ARCH], [DES-DATA], [DES-API]    |
| 1.3  | [FR-9]                                 | [DES-ERR]                            |
| 1.4  | [FR-10], [FR-17], [NFR-8]              | [DES-DATA], [DES-API]                |
| 2.1  | [FR-5], [FR-13]                        | [DES-API]                            |
| 2.2  | [FR-5], [FR-17]                        | [DES-API]                            |
| 3.1  | [FR-3], [FR-13], [FR-15], [FR-16], [FR-17], [NFR-7], [NFR-8] | [DES-UI] |
| 3.2  | [FR-4], [FR-5], [FR-13]                | [DES-DATA], [DES-API]                |
| 3.3  | [FR-13], [FR-15], [FR-16], [FR-17], [NFR-8] | [DES-UI]                       |
| 4.1  | [FR-6]                                 | [DES-FILES]                          |
| 4.2  | [FR-8]                                 | [DES-FILES]                          |
| 4.3  | [FR-7], [NFR-3]                        | [DES-DATA]                           |
| 4.4  | [FR-9]                                 | [DES-ERR]                            |
| 4.5  | [FR-12]                                | [DES-SEC]                            |
| 5.1  | [FR-1], [FR-11], [FR-14], [NFR-1], [NFR-5] | [DES-ROLLOUT]                    |
| 5.2  | [NFR-6]                                | [DES-TEST]                           |

<!-- SPRINT-SECTION-END: TASKS -->

---

<!-- SPRINT-SECTION-START: SESSIONS (appended to tasks.md on graduation — tasks-template.md requires Work Sessions as the last section) -->

## 4. Work Sessions

<!-- IMPORTANT: This section MUST remain the LAST section in 01-deskop-nano-cortex.md. Do not add content below it. -->
<!-- Task execution log — append-only, updated by /afx-sprint code, /afx-task pick, /afx-task code, /afx-task complete -->
<!-- Columns: Date (YYYY-MM-DD) | Task (WBS ID) | Action (Picked/Coded/Completed/Verified/Reviewed) | Files Modified | Agent ([x] or []) | Human ([x] or []) -->

| Date | Task | Action | Files Modified | Agent | Human |
| ---- | ---- | ------ | -------------- | ----- | ----- |
| 2026-06-10 | 0.1 | Coded | backend/Cargo.toml, backend/src/main.rs, backend/src/lib.rs, backend/tauri.conf.json, backend/build.rs, frontend/package.json, frontend/vite.config.ts, frontend/index.html, frontend/src/app/main.tsx, frontend/src/app/App.tsx, frontend/src/styles/index.css, frontend/src/env.d.ts | [x] | |
| 2026-06-10 | 0.1 | Verified | — | [x] | [x] |
| 2026-06-10 | 0.2, 1, 2, 3, 4 | Coded | backend/Cargo.toml, backend/src/{main,lib}.rs, backend/src/{app,domain,infrastructure,ipc,platform}/*.rs, frontend/src/app/App.tsx, frontend/src/app/main.tsx, frontend/src/features/midi/{components,hooks,services}/*.ts, frontend/src/shared/ipc/{commands,events,errors}.ts | [x] | |
| 2026-06-10 | 0.2 | Fixed | backend/src/infrastructure/midi/ble.rs, backend/src/ipc/commands.rs — BLE discovery now keeps live Peripheral handles; connect no longer hits "Device not found". Light/dark theme system added. | [x] | |
| 2026-06-10 | UI, Logs | Redesigned | Pedal-board style effect controls, Quad-Cortex-inspired colors, event log viewer with Tauri backend logging, log count badge, log panel with auto-scroll | [x] | |
| 2026-06-12 | Living docs | Refined | Updated sprint spec/design/tasks to match current implemented features: documented MIDI-first scope, USB input listener, BLE diagnostics/provisional sync, fixed signal-chain UI, footswitch model, MIDI monitor/logging, and current file/API map | [x] | |

<!-- SPRINT-SECTION-END: SESSIONS -->
