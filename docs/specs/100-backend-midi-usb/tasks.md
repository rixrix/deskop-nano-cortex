---
afx: true
type: TASKS
status: Living
owner: "@richard-sentino"
version: "1.0"
created_at: "2026-06-10T11:54:35.000Z"
updated_at: "2026-07-04T10:47:11.000Z"
tags: ["midi", "usb", "midir", "port-manager", "domain", "backend"]
spec: spec.md
design: design.md
---

# 100 Backend MIDI USB — Tasks

> Backfilled implementation checklist. Code shipped in phases 0–2 of the original sprint
> (2026-06-10). Hardware-verification items remain open.

---

## Phase 0: Validation Prototype

<!-- files: backend/src/infrastructure/midi/port_manager.rs, backend/src/infrastructure/midi/connection.rs -->
<!-- @see docs/specs/100-backend-midi-usb/spec.md [FR-1] [FR-2] [FR-3] [FR-5] -->
<!-- @see docs/specs/100-backend-midi-usb/design.md [DES-USB-ARCH] [DES-USB-API] -->

- [x] Spike `midir::MidiOutput::new()` on macOS; confirm port enumeration returns Nano Cortex port name.
- [x] Spike `send_to_port` with `[0xC0, 0x00]` (PC #0); confirm physical device switches to preset 0.
- [x] Record exact USB port names observed on macOS (CoreMIDI) in `docs/specs/archive/journal.md`.

---

## Phase 1: Domain Value Objects

<!-- files: backend/src/domain/port.rs, backend/src/domain/midi_message.rs, backend/src/domain/device.rs, backend/src/domain/mod.rs -->
<!-- @see docs/specs/100-backend-midi-usb/spec.md [FR-7] [FR-8] [FR-9] [FR-10] [FR-11] -->
<!-- @see docs/specs/100-backend-midi-usb/design.md [DES-USB-DATA] -->

- [x] Define `PortDirection` enum with serde rename `"in"` / `"out"`.
- [x] Define `PortKind` enum with serde rename `"usb"` / `"ble"`.
- [x] Define `MidiPort` struct with `id`, `name`, `direction`, `kind` fields.
- [x] Implement `MidiPort::is_nano_cortex()` (case-insensitive `"nano"` / `"cortex"` match).
- [x] Define `MidiMessage` struct with `ts_ms: u64`, `bytes: Vec<u8>`.
- [x] Implement `MidiMessage::new`, `status_byte`, `is_realtime`, `is_sysex`.
- [x] Define `DeviceState` enum with four variants serializing to lowercase strings.
- [x] Define `Device` struct and `Device::new(name, kind)`.
- [x] Re-export all types through `backend/src/domain/mod.rs`.

---

## Phase 2: Port Manager and Infrastructure

<!-- files: backend/src/infrastructure/midi/port_manager.rs, backend/src/infrastructure/midi/connection.rs, backend/src/infrastructure/midi/listener.rs, backend/src/infrastructure/midi/mod.rs -->
<!-- @see docs/specs/100-backend-midi-usb/spec.md [FR-1] [FR-2] [FR-3] [FR-4] [FR-5] [FR-6] -->
<!-- @see docs/specs/100-backend-midi-usb/design.md [DES-USB-API] [DES-USB-DEC] -->

- [x] Implement `list_output_ports()` using `MidiOutput::new("Nano Cortex Scanner")`.
- [x] Implement `list_input_ports()` using `MidiInput::new("Nano Cortex Input Scanner")`.
- [x] Implement `find_nano_cortex_port(ports)` — first `is_nano_cortex()` match.
- [x] Implement `find_nano_cortex_input_port(ports)` — prefer `"out"` in name; fall back.
- [x] Implement `send_to_port(port_name, bytes)` — per-call connect/send/drop.
- [x] Implement `start_listener(port_name)` — `Ignore::None`, `mpsc` channel, monotonic timestamp.
- [x] Declare `pub mod` entries in `infrastructure/midi/mod.rs`; BLE sub-modules behind `#[cfg(feature = "ble")]`.
- [x] Write in-file unit tests: `test_is_nano_cortex`, `test_find_nano_cortex_port`.

---

## Phase 3: Diagnostic Binaries

<!-- files: backend/src/bin/nano_usb_probe.rs, backend/src/bin/nano_usb_preset_probe.rs -->
<!-- @see docs/specs/100-backend-midi-usb/spec.md [FR-12] [FR-13] -->
<!-- @see docs/specs/100-backend-midi-usb/design.md [DES-USB-TEST] -->

- [x] Implement `nano_usb_probe`: `--list` mode enumerates input ports; listening mode connects all ports and logs hex/kind/stamp to stdout + `logs/usb-probe.log`.
- [x] Implement `nano_usb_preset_probe`: `--sequence`, `--channel`, `--delay-ms` flags; sends PC bytes to first matching Nano output port; logs to `logs/usb-preset-probe.log`.
- [ ] Run `nano_usb_probe --list` against a real Nano Cortex and confirm expected port names (hardware-only).
- [ ] Run `nano_usb_probe 30` while interacting with Nano hardware; confirm MIDI events are logged (hardware-only).
- [ ] Run `nano_usb_preset_probe --sequence 0,1,2` and confirm physical preset switches (hardware-only).

---

## Phase 4: Hardware Verification

<!-- files: (no source changes — manual verification against hardware) -->
<!-- @see docs/specs/100-backend-midi-usb/spec.md [FR-5] [FR-6] [FR-7] -->
<!-- @see docs/specs/100-backend-midi-usb/design.md [DES-USB-TEST] -->

- [ ] USB MIDI connect (via Tauri `connect` command) succeeds against a real Nano Cortex (hardware-only).
- [ ] USB MIDI send (`send_midi` PC 0–63, CC 1/37–43) switches presets and toggles FX on hardware (hardware-only).
- [ ] USB MIDI input listener emits `midi://message` events when the Nano is configured to send MIDI Out; frontend MIDI monitor reflects them (hardware-only).
- [ ] Disconnect path (`disconnect` command) stops the listener without panic (hardware-only).

---

## Work Sessions

| Date       | Task                 | Action | Files Modified                                                                                                               | Agent | Human |
| ---------- | -------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------- | ----- | ----- |
| 2026-06-13 | Phase 0–3 (backfill) | Coded  | docs/specs/100-backend-midi-usb/spec.md, docs/specs/100-backend-midi-usb/design.md, docs/specs/100-backend-midi-usb/tasks.md | [x]   | [x]   |
