---
afx: true
type: SPEC
status: Living
owner: "@richard-sentino"
version: "1.0"
created_at: "2026-06-10T11:54:35.000Z"
updated_at: "2026-07-04T10:19:30.000Z"
tags: ["midi", "usb", "midir", "port-manager", "domain", "backend"]
---

# 100 Backend MIDI USB — Spec

> USB MIDI infrastructure via `midir`: output/input port enumeration, Nano Cortex name
> matching, raw MIDI send, MIDI input listener thread, and the MIDI port/message/device
> domain value objects that cross the IPC boundary.

## References

- **Architecture overview**: [`../001-overview/spec.md`](../001-overview/spec.md) — traceability rules, routing index, glossary
- **System flow map**: [`../001-overview/design.md`](../001-overview/design.md) — `[Flow.UsbMidi]`
- **IPC bridge (consumer of this zone)**: [`../120-backend-ipc/spec.md`](../120-backend-ipc/spec.md)
- **BLE MIDI sibling**: [`../110-backend-midi-ble/spec.md`](../110-backend-midi-ble/spec.md)
- **midir crate**: <https://docs.rs/midir/>

---

## Problem Statement

The Desktop Nano Cortex app needs a reliable, cross-platform USB MIDI path that does not
depend on WebMIDI or any browser API. On macOS the host uses CoreMIDI; on Windows, WinMM;
on Linux, ALSA. Port names are OS-assigned and follow device-perspective naming conventions:
a port the device calls "OUT" is an input on the host side.

This zone owns the Rust layer that:

1. Enumerates all USB MIDI output and input ports via `midir`.
2. Identifies Nano Cortex ports by name heuristic ("nano" or "cortex", case-insensitive).
3. Opens an output connection, sends raw MIDI bytes, and closes it per send.
4. Opens a persistent input connection with a callback thread that packages incoming bytes as
   timestamped `MidiMessage` values and delivers them to the IPC layer.
5. Provides the `MidiPort`, `MidiMessage`, and `Device` domain types that are serialized
   across the IPC boundary.

---

## Requirements

### Functional Requirements

| ID    | Requirement                                                                                                                                                                                           | Priority    |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| FR-1  | Enumerate all USB MIDI output ports via `midir::MidiOutput`; return `Vec<MidiPort>` with `id`, `name`, `direction: Output`, `kind: Usb`.                                                              | Must Have   |
| FR-2  | Enumerate all USB MIDI input ports via `midir::MidiInput`; return `Vec<MidiPort>` with `direction: Input`, `kind: Usb`.                                                                               | Must Have   |
| FR-3  | Match Nano Cortex ports by case-insensitive substring: name contains `"nano"` or `"cortex"`.                                                                                                          | Must Have   |
| FR-4  | When selecting the host input port for receive, prefer ports whose name also contains `"out"` (device perspective); fall back to any matching Nano port.                                              | Must Have   |
| FR-5  | Send raw MIDI bytes to a named output port: enumerate, find by exact name, connect, `send`, drop connection.                                                                                          | Must Have   |
| FR-6  | Start a persistent MIDI input listener on a named port; deliver incoming bytes as `MidiMessage { ts_ms, bytes }` via an `mpsc` channel.                                                               | Must Have   |
| FR-7  | `MidiMessage` carries a monotonic timestamp (`ts_ms`) as milliseconds elapsed since listener session start, plus raw `bytes`.                                                                         | Must Have   |
| FR-8  | `MidiMessage` exposes helper predicates: `status_byte()`, `is_realtime()`, `is_sysex()`.                                                                                                              | Should Have |
| FR-9  | `Device` tracks `name`, `state: DeviceState`, `kind: PortKind`, `last_preset: Option<u8>`, and `last_error: Option<String>`.                                                                          | Must Have   |
| FR-10 | `DeviceState` serializes to the lowercase strings `"disconnected"`, `"connecting"`, `"connected"`, `"error"` for IPC parity with the frontend.                                                        | Must Have   |
| FR-11 | `PortDirection` serializes as `"in"` / `"out"`; `PortKind` serializes as `"usb"` / `"ble"`.                                                                                                           | Must Have   |
| FR-12 | Diagnostic binary `nano_usb_probe`: enumerate all input ports, connect all simultaneously, log each raw MIDI event (hex, kind, stamp) to stdout and `logs/usb-probe.log` for a configurable duration. | Should Have |
| FR-13 | Diagnostic binary `nano_usb_preset_probe`: connect first matching Nano Cortex output port, send a configurable PC preset sequence with configurable inter-message delay and channel.                  | Should Have |

### Non-Functional Requirements

| ID    | Requirement                                                                                                                                                              | Target                  |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------- |
| NFR-1 | Port enumeration must not block the Tauri main thread; it is called synchronously but completes in < 50 ms under normal OS conditions.                                   | Observed acceptable     |
| NFR-2 | MIDI send path (enumerate → connect → send → drop) adds no perceptible latency beyond the OS MIDI stack; the Nano Cortex switches presets within 1–2 frames of the send. | Hardware-observed       |
| NFR-3 | The listener callback is invoked on a `midir`-managed OS thread; it must not block. The `mpsc::Sender::send` call in the callback is non-blocking under backpressure.    | Architectural invariant |
| NFR-4 | Domain types (`MidiPort`, `MidiMessage`, `Device`) are pure value objects with no I/O; they are `Clone`, `Serialize`, and `Debug`.                                       | Code invariant          |
| NFR-5 | Unit tests for name matching and port selection run in CI without MIDI hardware (`cargo test`).                                                                          | CI-enforced             |

---

## Acceptance Criteria

- [x] `list_output_ports()` returns a `Vec<MidiPort>` with `direction: Output` and `kind: Usb` for each OS-visible MIDI output.
- [x] `list_input_ports()` returns a `Vec<MidiPort>` with `direction: Input` and `kind: Usb` for each OS-visible MIDI input.
- [x] `MidiPort::is_nano_cortex()` returns true for names containing "nano" or "cortex" (case-insensitive).
- [x] `find_nano_cortex_port()` returns the first matching output port.
- [x] `find_nano_cortex_input_port()` prefers ports also containing "out", falls back to any Nano port.
- [x] `send_to_port()` sends exact bytes to the named output; returns `Err` with a descriptive message if port is not found or send fails.
- [x] `start_listener()` opens the named input port and delivers `MidiMessage` values over the returned `mpsc::Receiver`.
- [x] `MidiMessage::is_realtime()` returns true for bytes `0xF8–0xFF`; `is_sysex()` returns true for `0xF0`.
- [x] `DeviceState` round-trips through serde as lowercase strings.
- [x] Unit test `test_is_nano_cortex` and `test_find_nano_cortex_port` pass under `cargo test` (no hardware required).
- [x] `nano_usb_probe --list` output verified against a real Nano Cortex (2026-07-01): CoreMIDI exposes one input port, `Nano Cortex`.
- [ ] `nano_usb_preset_probe` switches physical presets on a real Nano Cortex (hardware-only).
- [~] USB MIDI input listener emits `MidiMessage` events from the Nano Cortex — **listener verified functional, but the device transmits nothing over USB MIDI.** Across every 2026-07-01 capture (standalone `nano_usb_probe` and the app's own listener, 20-60 s windows) the Nano Cortex sent **zero** device→app USB-MIDI bytes — not just expression, but no knobs or footswitches either. The onboard controls (incl. the expression pedal) stream only over BLE (see `110-backend-midi-ble`). USB is **command-in only** for this device. See Appendix → "Hardware finding: no USB MIDI-out".

---

## Non-Goals

- BLE MIDI transport (owned by zone `110-backend-midi-ble`).
- Tauri IPC command/event wiring (owned by zone `120-backend-ipc`); this zone provides functions, not Tauri commands.
- Platform hotplug / port watchdog (see `backend/src/infrastructure/midi/port_watchdog.rs`, documented in `130-backend-platform`).
- SysEx editing, preset dump/restore, or unverified Nano Cortex command families.
- Virtual MIDI port creation.
- Multi-device routing or MIDI through.

---

## Dependencies

- `midir = "0.10"` — cross-platform MIDI I/O (CoreMIDI on macOS, WinMM on Windows, ALSA on Linux).
- `serde` + `serde_json` — domain type serialization for IPC boundary.
- `std::sync::mpsc` — listener thread → caller channel (stdlib, no external crate).
- Consuming zones: `120-backend-ipc` (commands/events), `110-backend-midi-ble` (shares `PortKind::Ble` and `MidiMessage`).

---

## Appendix

### Hardware finding: no USB MIDI-out (2026-07-01)

Verified against a real Nano Cortex with two expression pedals (Line 6, Boss) over USB and BLE
simultaneously:

- **The Nano Cortex transmits nothing over USB MIDI.** Every capture — the standalone
  `nano_usb_probe` (20-60 s) and the app's own `start_listener` — recorded **zero** inbound
  CoreMIDI bytes while knobs, footswitches, and the expression pedal were actively moved. Only
  the `Nano Cortex` input port exists; it never emits.
- **USB is command-in only** for this device: it _receives_ documented MIDI (Program Change, CC)
  from the host but does not _transmit_ control changes back. The two-way-feedback path that
  `start_listener` (FR-6) enables therefore has no data source on this hardware.
- **All device→host telemetry is BLE-only** (proprietary `c305` stream — knobs, footswitches,
  and the expression pedal), documented in `110-backend-midi-ble` [DES-BLE-DECODER].
- **Expression pedal specifics** (also in `110`): BLE-only, quantized to 3 zones
  (`0`/`128`/`255` = heel/center/toe), signature-identical across both pedals.

Implication: `start_listener` and the `nano_usb_probe` diagnostics remain correct and useful for
_other_ MIDI hardware, but for the Nano Cortex the inbound-USB acceptance path cannot pass — it is
a device limitation, not a code defect. Do not "fix" it by fabricating inbound events.

### Agent Entry Map

| Owned file                                        | Local anchors                | Key functions / types                                                                           | Tests                                                         | Dependencies                                                | Out of scope                     |
| ------------------------------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------- | -------------------------------- |
| `backend/src/infrastructure/midi/port_manager.rs` | [FR-1] [FR-2] [FR-3] [FR-4]  | `list_output_ports`, `list_input_ports`, `find_nano_cortex_port`, `find_nano_cortex_input_port` | `test_is_nano_cortex`, `test_find_nano_cortex_port` (in-file) | `midir`, `crate::domain::{MidiPort,PortDirection,PortKind}` | BLE ports, hotplug               |
| `backend/src/infrastructure/midi/connection.rs`   | [FR-5]                       | `send_to_port`                                                                                  | none                                                          | `midir`                                                     | persistent connection, BLE send  |
| `backend/src/infrastructure/midi/listener.rs`     | [FR-6] [FR-7]                | `start_listener`                                                                                | none                                                          | `midir`, `crate::domain::MidiMessage`, `std::sync::mpsc`    | BLE notify, event emission       |
| `backend/src/infrastructure/midi/mod.rs`          | —                            | module re-exports                                                                               | —                                                             | —                                                           | BLE sub-modules (feature-gated)  |
| `backend/src/domain/port.rs`                      | [FR-1] [FR-2] [FR-3] [FR-11] | `MidiPort`, `PortDirection`, `PortKind`, `MidiPort::is_nano_cortex`                             | (via port_manager tests)                                      | `serde`                                                     | BLE-specific fields              |
| `backend/src/domain/midi_message.rs`              | [FR-7] [FR-8]                | `MidiMessage`, `MidiMessage::new`, `status_byte`, `is_realtime`, `is_sysex`                     | none                                                          | `serde`                                                     | decoded MIDI semantics           |
| `backend/src/domain/device.rs`                    | [FR-9] [FR-10]               | `Device`, `DeviceState`, `Device::new`                                                          | none                                                          | `serde`, `crate::domain::port::PortKind`                    | BLE capability matrix, NanoState |
| `backend/src/bin/nano_usb_probe.rs`               | [FR-12]                      | `main`, `scan_input_ports`, `connect_port`, `describe`                                          | manual/hardware                                               | `midir`, stdlib                                             | app integration, IPC             |
| `backend/src/bin/nano_usb_preset_probe.rs`        | [FR-13]                      | `main`, `program_change_bytes`, `preset_label`, `parse_sequence`                                | manual/hardware                                               | `midir`, stdlib                                             | app integration, IPC             |
