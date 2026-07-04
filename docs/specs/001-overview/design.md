---
afx: true
type: DESIGN
status: Living
owner: "@richard-sentino"
version: "2.0"
created_at: "2026-06-10T11:54:35.000Z"
updated_at: "2026-07-04T10:19:30.000Z"
tags: ["overview", "architecture", "tauri", "rust", "midi", "ble"]
spec: spec.md
---

# Desktop Nano Cortex — Architecture Overview

## [DES-OVR] Overview

A Tauri 2.x shell with a Rust backend owning device I/O (USB MIDI via `midir`, BLE GATT via
`btleplug`) and a React/TS/Tailwind webview frontend. Commands flow UI → Rust; events stream
Rust → UI (`midi://*`). State honesty is the central invariant: explicit MIDI commands are
authoritative, USB availability is observed, and captured BLE decoding is provisional/instrumented
until project hardware evidence graduates it.

## [DES-ARCH] System Context & Flow Map

```text
[Flow.Webview]  React control surface (200) ── IPC contracts (210)
      │  invoke(cmd)                ▲  listen(midi://*)
      ▼                             │
[Flow.IpcBridge]  Tauri commands/events (120) + AppState
      │                             ▲
      ▼                             │ emit
[Flow.UsbMidi] midir send/listen (100) ──► Nano Cortex (USB)
[Flow.BleMidi] btleplug scan/notify/write (110) ──► Nano Cortex (BLE, experimental)
[Flow.Platform] tray / shortcuts / settings store (130)
```

| Map ID             | Owner zone | Owned files                                                 |
| ------------------ | ---------- | ----------------------------------------------------------- |
| `[Flow.UsbMidi]`   | 100        | `infrastructure/midi/{port_manager,connection,listener}.rs` |
| `[Flow.BleMidi]`   | 110        | `infrastructure/midi/{ble,ble_*}.rs`                        |
| `[Flow.IpcBridge]` | 120        | `ipc/{commands,events,mapping}.rs`, `app/state.rs`          |
| `[Flow.Platform]`  | 130        | `platform/{tray,shortcuts,settings_store}.rs`, `lib.rs`     |
| `[Flow.Webview]`   | 200/210    | `frontend/src/**`                                           |

## [DES-DEC] Cross-Cutting Key Decisions

| Decision      | Choice                             | Rationale                                                                  |
| ------------- | ---------------------------------- | -------------------------------------------------------------------------- |
| Desktop shell | Tauri 2.x                          | Small binary, low idle RAM, Rust owns device I/O, React UI retained.       |
| USB MIDI      | `midir`                            | Cross-platform CoreMIDI/ALSA/WinMM without WebMIDI permission gates.       |
| BLE           | `btleplug`, feature-gated          | Connection works; no public Nano preset protocol → keep provisional.       |
| State model   | Documented send + observe incoming | No full state query exists; reflect device-originated PC/CC when received. |
| Honest state  | Gate + label experimental          | `EXPERIMENTAL_FEATURES` hides speculative editors in production builds.    |
| IPC           | Commands + events                  | Commands for actions, events for inbound MIDI/logs/lifecycle.              |

## [DES-FILES] Repository Map

```text
backend/   Rust + Tauri 2.x crate        → zones 100/110/120/130
frontend/  React + Vite + Tailwind 4     → zones 200/210
docs/specs/ numbered zone specs          → this tree
tools/     BLE analysis (python/swift)   → zone 110
```

## [DES-TEST] Testing Strategy (summary)

Owned in detail by [400-dx-tooling](../400-dx-tooling/design.md): Rust unit tests (`cargo test`),
Vitest unit tests (jsdom), and Playwright E2E driving the webview against the Vite dev server with
mocked Tauri IPC. Hardware (USB/BLE) verification stays a documented manual matrix.

## [DES-SEC] Security Posture (summary)

No telemetry, no network calls at runtime. Tauri CSP is `self`-only. MIDI helpers clamp PC/CC to
valid ranges. Code signing is deferred to v0.2 (see `500-ci-release`).
