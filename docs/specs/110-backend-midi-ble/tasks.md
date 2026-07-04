---
afx: true
type: TASKS
status: Living
owner: "@richard-sentino"
version: "1.0"
created_at: "2026-06-10T11:54:35.000Z"
updated_at: "2026-07-04T10:47:11.000Z"
tags: ["110-backend-midi-ble", "ble", "provisional-protocol", "nano-state", "gatt"]
spec: spec.md
design: design.md
---

# 110 Backend MIDI BLE — Tasks

> Living task history for the BLE zone. Readback, metadata, packet logging, diagnostics,
> state-dump parsing, FX model readback, and amp-knob writes are source-backed; destructive save
> and deep editor writes remain hardware-gated.
> `[x]` = shipped in code; `[ ]` = pending hardware or future implementation.

---

## Phase 0: BLE Validation Prototype

<!-- files: backend/src/infrastructure/midi/ble.rs, backend/Cargo.toml -->
<!-- @see docs/specs/110-backend-midi-ble/spec.md [FR-1] [FR-2] docs/specs/110-backend-midi-ble/design.md [DES-BLE-CONNECT] -->

- [x] Add `btleplug = "0.11"` and `uuid = "1"` behind the `ble` Cargo feature in `backend/Cargo.toml`.
- [x] Implement `get_adapter()` / `get_adapter_with_log()` with a 5 s timeout via `tokio::time::timeout`.
- [x] Implement `scan_all_with_log()`: `start_scan → event stream + 500 ms periodic poll → stop_scan`.
- [x] Implement `looks_like_nano(name, uuids)` matching by name substring and known service UUID prefix.
- [x] Confirm BLE scan discovers a real Nano Cortex on macOS (hardware verified; logged in `journal.md`).
- [x] Confirm `c302`-prefixed write characteristic is selected and PC bytes can be written over BLE.

---

## Phase 1: Core BLE Infrastructure

### 1.1 BLE scan/connect with timeouts and progress logging

<!-- files: backend/src/infrastructure/midi/ble.rs -->
<!-- @see docs/specs/110-backend-midi-ble/spec.md [FR-1] [FR-2] [FR-6] docs/specs/110-backend-midi-ble/design.md [DES-BLE-CONNECT] [DES-BLE-DISCONNECT] -->

- [x] Implement `known_peripherals_with_log()` to check already-paired peripherals before scanning.
- [x] Implement `find_and_connect_with_log()` wrapping the full flow in `BLE_TOTAL_TIMEOUT` (40 s).
- [x] Harden CoreBluetooth connect with two bounded attempts, a 12 s per-attempt timeout, and a post-timeout `is_connected()` success check.
- [x] Implement `upsert_discovered_device()` to merge partial scan events with property updates.
- [x] Early-exit scan on first Nano Cortex match; log all candidate devices in scan summary.
- [x] Post-connect settle (800 ms) and post-discovery settle (300 ms) before characteristic enumeration.
- [x] Emit progress logs to the frontend log panel via `emit_log` at each major step.

### 1.2 Characteristic discovery, write selection, and subscribe

<!-- files: backend/src/infrastructure/midi/ble.rs, backend/src/infrastructure/midi/ble_inspector.rs -->
<!-- @see docs/specs/110-backend-midi-ble/spec.md [FR-3] [FR-4] [FR-5] docs/specs/110-backend-midi-ble/design.md [DES-BLE-CONNECT] [DES-BLE-DEBUG] -->

- [x] Call `inspect_characteristics()` after service discovery; log the full `BleInspectionReport`.
- [x] Select write characteristic: prefer UUID-prefix match on `MIDI_IO_CHAR_UUIDS`; fallback to first writable.
- [x] Subscribe to all NOTIFY/INDICATE characteristics (3 s per-char timeout; continue on failure).
- [x] Track `subscribed_characteristics` in `BleHandle` for later unsubscribe.
- [x] Spawn notification background task: log hex; `emit_log` to frontend; record in `BlePacketLogger` with provisional note.

### 1.3 Safe disconnect

<!-- files: backend/src/infrastructure/midi/ble.rs -->
<!-- @see docs/specs/110-backend-midi-ble/spec.md [FR-6] [NFR-7] docs/specs/110-backend-midi-ble/design.md [DES-BLE-DISCONNECT] -->

- [x] Implement `BleHandle::disconnect()`: unsubscribe each characteristic with 1 s per-char timeout.
- [x] Skip `p.disconnect()` if `is_connected()` returns false.
- [x] Apply 5 s timeout to `p.disconnect()`.
- [x] Log unsubscribe result (ok / failed / timed out) for each characteristic.
- [ ] Hardware-verified on macOS: confirm peripheral does not linger in OS BLE peripheral list after disconnect.

---

## Phase 2: Packet Logger, Inspector, and Debug Tooling

### 2.1 Packet logger

<!-- files: backend/src/infrastructure/midi/ble_debug.rs -->
<!-- @see docs/specs/110-backend-midi-ble/spec.md [FR-7] docs/specs/110-backend-midi-ble/design.md [DES-BLE-DEBUG] -->

- [x] Implement `BlePacketLogger` with `Arc<Mutex<Vec<BlePacketLogEntry>>>` interior storage.
- [x] Implement `BlePacketLogger::is_enabled()` gated on `NANO_BLE_DEBUG` env var.
- [x] Implement `record_payload()` and `record_characteristic()` helpers.
- [x] Enforce 2 000 entry cap with FIFO eviction (`entries.drain(0..overflow)`).
- [x] Implement `snapshot()` returning a cloned `Vec<BlePacketLogEntry>`.
- [x] Implement `hex()` and `char_prop_names()` utilities.

### 2.2 Inspector

<!-- files: backend/src/infrastructure/midi/ble_inspector.rs -->
<!-- @see docs/specs/110-backend-midi-ble/spec.md [FR-8] docs/specs/110-backend-midi-ble/design.md [DES-BLE-DEBUG] -->

- [x] Implement `inspect_characteristics()` producing `BleInspectionReport` with `readable_characteristics`, `writable_characteristics`, `notifying_characteristics` split by `CharPropFlags`.
- [x] `BleInspectionReport` must not assume any Nano-specific schema (schema-agnostic inspection).

### 2.3 Provisional decoder

<!-- files: backend/src/infrastructure/midi/ble_decoder.rs -->
<!-- @see docs/specs/110-backend-midi-ble/spec.md [FR-9] [NFR-8] docs/specs/110-backend-midi-ble/design.md [DES-BLE-DECODER] -->

- [x] Implement `NanoStateDecoder::decode_payload()` with conservative 2-byte PC rule; `provisional: true` always.
- [x] Implement `NanoStateDecoder::apply_patch()` setting `provisional = true`, `stale = false`, `sync_mode = WriteNotificationSync`.
- [x] Implement `bank_for_preset()` deriving bank letter from preset slot.
- [x] Document the parser's conservative stance in a module-level doc comment.

### 2.4 Sync engine

<!-- files: backend/src/infrastructure/midi/ble_sync.rs -->
<!-- @see docs/specs/110-backend-midi-ble/spec.md [FR-11] docs/specs/110-backend-midi-ble/design.md [DES-BLE-DOMAIN] -->

- [x] Implement `NanoSyncEngine` with `mark_connected_command_only`, `mark_disconnected`, `optimistic_preset_change`, `ingest_notification`, `snapshot`.
- [x] Ensure raw BLE packets are never applied directly to `NanoState` outside of `NanoStateDecoder`.

### 2.5 NanoState domain model

<!-- files: backend/src/domain/nano_state.rs -->
<!-- @see docs/specs/110-backend-midi-ble/spec.md [FR-10] [NFR-5] [NFR-6] docs/specs/110-backend-midi-ble/design.md [DES-DATA] -->

- [x] Implement `SyncMode`, `CapabilityStatus`, `NanoSlotRole`, `NanoSlotState`, `NanoState`, `CapabilityMatrix` with serde derives.
- [x] `NanoState::default()`: all 8 slot roles initialized; `provisional = true`; `sync_mode = DisconnectedPreview`.
- [x] `CapabilityMatrix::default()`: `active_preset_slot = Inferred`, `bank = Inferred`, all others `Unverified`; `notes` non-empty.
- [x] `NanoSlotState::confirmed` defaults to `false` for all slots.

### 2.6 Port watchdog

<!-- files: backend/src/infrastructure/midi/port_watchdog.rs -->
<!-- @see docs/specs/110-backend-midi-ble/spec.md [FR-12] docs/specs/110-backend-midi-ble/design.md [DES-BLE-DOMAIN] -->

- [x] Implement `spawn_usb_port_watchdog()` polling every 1 s.
- [x] Emit `midi://ports-changed` on port signature diff.
- [x] On USB device disappearance: check BLE handle connectivity; transition to BLE or full disconnect.
- [x] Feature-gate BLE handle check with `#[cfg(feature = "ble")]`; compile without BLE cleanly.

---

## Phase 3: Diagnostic Binaries and Analysis Tools

### 3.1 BLE scan probe

<!-- files: backend/src/bin/nano_ble_scan_probe.rs -->
<!-- @see docs/specs/110-backend-midi-ble/spec.md [FR-13] docs/specs/110-backend-midi-ble/design.md [DES-TEST] -->

- [x] `nano_ble_scan_probe [timeout_secs]`: acquire adapter, scan, log all devices with `is_nano` flag.
- [x] Write timestamped log to `logs/ble-scan-probe.log` (creates directory if needed).
- [x] Guard entry point with `#[cfg(not(feature = "ble"))]` fail + `#[cfg(feature = "ble")]` impl.

### 3.2 BLE observe probe

<!-- files: backend/src/bin/nano_ble_observe_probe.rs -->
<!-- @see docs/specs/110-backend-midi-ble/spec.md [FR-13] docs/specs/110-backend-midi-ble/design.md [DES-TEST] -->

- [x] `nano_ble_observe_probe [duration_secs]`: connect, observe for duration, dump notification snapshot to log.
- [x] Print observation reminder: "Perform actions now: BANK, FX, FS I twist/press, FS II twist/press."
- [x] Filter `BlePacketLogEntry` for `Notification | Indication` direction only in final summary.
- [x] Disconnect cleanly after observation window.

### 3.3 BLE preset probe

<!-- files: backend/src/bin/nano_ble_preset_probe.rs -->
<!-- @see docs/specs/110-backend-midi-ble/spec.md [FR-13] [FR-14] docs/specs/110-backend-midi-ble/design.md [DES-TEST] -->

- [x] Implement `ProbeMode::Raw`, `Sequential`, `BleMidi`, `All`.
- [x] Implement `--sequence`, `--mode`, `--char`, `--all-writable`, `--channel`, `--settle-ms` args.
- [x] `preferred_writable()` prefers `c303`, `c302`, `c304` suffix order; falls back to `handle.characteristic`.
- [x] Log all sent payloads (`[hex]`) and settle waits with timestamps.
- [x] Dump notification snapshot at end (last 20 entries logged).
- [x] Disconnect cleanly; write to `logs/ble-preset-probe.log`.

### 3.4 Analysis tools

<!-- files: tools/analyze_ble_observe.py, tools/nano_hid_probe.swift -->
<!-- @see docs/specs/110-backend-midi-ble/spec.md [FR-15] [FR-16] docs/specs/110-backend-midi-ble/design.md [DES-TEST] -->

- [x] `analyze_ble_observe.py`: parse `logs/ble-observe-probe.log`, filter `c305` notifications, count unique payloads, print timeline with inter-event deltas and 4-byte-skip pair analysis.
- [x] `nano_hid_probe.swift`: open Nano by VID `5418` / PID `35047` via `IOHIDManager`, register report/value callbacks, poll report IDs 1 and 2, write to `logs/hid-probe.log`.

---

## Phase 4: Unit Test Coverage

### 4.1 Decoder unit tests

<!-- files: backend/src/infrastructure/midi/ble_decoder.rs -->
<!-- @see docs/specs/110-backend-midi-ble/spec.md [FR-9] [NFR-8] docs/specs/110-backend-midi-ble/design.md [DES-BLE-DECODER] [DES-TEST] -->

- [x] Table-driven tests: 2-byte PC (preset 0, 31, 63) → `recognized: true`, `provisional: true`, correct `active_preset_slot`.
- [x] Empty payload → `recognized: false`, `provisional: true`, `state_patch: None`.
- [x] 1-byte payload → `recognized: false`.
- [x] 4-byte BLE-MIDI framed payload (`0x80 0x80 0xC0 0x00`) → `recognized: false` (conservative parser).
- [x] Preset 64+ in a 2-byte payload → `recognized: false` (out of range).
- [x] `apply_patch` → `bank_for_preset` table: preset 0 → "A", 7 → "A", 8 → "B", 55 → "H", 63 → "H".

### 4.1a State-dump schema tests

<!-- files: backend/src/infrastructure/midi/ble_schema.rs, backend/src/ipc/commands.rs -->
<!-- @see docs/specs/110-backend-midi-ble/spec.md [FR-18] [FR-19] docs/specs/110-backend-midi-ble/design.md [DES-BLE-PROTOCOL] [DES-TEST] -->

- [x] Decode single-packet current-state dump (`C1`) for amp knobs, capture/IR names, firmware, bypass, and capture volume.
- [x] Decode segmented current-state dump (`FE` stream) by stripping 2-byte packet headers and parsing the reassembled protobuf body.
- [x] Prefer the latest post-request segmented dump over older single-packet dumps so UI state cannot reuse stale knob values.
- [x] Scope `request_state_dump` decoding to notifications captured after its own `c304` request write.
- [x] Decode metadata names from top-level protobuf records only, preserve preset slot order, and blank internal identifier-like values instead of exposing them as preset names.

### 4.2 Domain model unit tests

<!-- files: backend/src/domain/nano_state.rs -->
<!-- @see docs/specs/110-backend-midi-ble/spec.md [FR-10] [NFR-5] [NFR-6] docs/specs/110-backend-midi-ble/design.md [DES-DATA] [DES-TEST] -->

- [x] `NanoState::default()` — assert `provisional = true`, `sync_mode = DisconnectedPreview`, 8 slots all `confirmed = false`.
- [x] `CapabilityMatrix::default()` — assert no field is `ConfirmedReadable` or `ConfirmedWritable`; `notes` non-empty.

### 4.3 BLE scanner unit tests (mock adapter)

<!-- files: backend/src/infrastructure/midi/ble.rs -->
<!-- @see docs/specs/110-backend-midi-ble/spec.md [FR-1] [FR-2] docs/specs/110-backend-midi-ble/design.md [DES-BLE-CONNECT] [DES-TEST] -->

- [ ] `looks_like_nano` — table-driven: exact matches, case-insensitive, service UUID prefix match, non-matching.
- [ ] `upsert_discovered_device` — verify merge does not duplicate by peripheral ID; name update only when empty.
- [ ] Mock BLE adapter: simulate scan + connect + discover_services + subscribe + notification + unsubscribe + disconnect flow end-to-end.

### 4.4 Packet logger unit tests

<!-- files: backend/src/infrastructure/midi/ble_debug.rs -->
<!-- @see docs/specs/110-backend-midi-ble/spec.md [FR-7] docs/specs/110-backend-midi-ble/design.md [DES-BLE-DEBUG] [DES-TEST] -->

- [ ] Push 2 001 entries; assert `snapshot().len() == 2000` (FIFO eviction).
- [ ] `is_enabled()` returns `false` when `NANO_BLE_DEBUG` is unset.
- [ ] `hex()` produces uppercase space-separated output.

### 4.5 Port watchdog unit tests

<!-- files: backend/src/infrastructure/midi/port_watchdog.rs -->
<!-- @see docs/specs/110-backend-midi-ble/spec.md [FR-12] docs/specs/110-backend-midi-ble/design.md [DES-BLE-DOMAIN] [DES-TEST] -->

- [ ] `port_signature` — assert stable sort regardless of input order.
- [ ] Mock watchdog: inject port list changes; verify `midi://ports-changed` emitted on diff but not on no-diff.

---

## Phase 5: Rust Port of Deep Preset Editor Protocol

<!-- files: backend/src/infrastructure/midi/ble_schema.rs, backend/src/infrastructure/midi/ble_encoder.rs, backend/src/domain/nano_state.rs, backend/src/bin/nano_ble_command_probe.rs -->
<!-- @see docs/specs/110-backend-midi-ble/spec.md [FR-19] [FR-20] [FR-21] [FR-22] [NFR-8] -->
<!-- @see docs/specs/110-backend-midi-ble/design.md [DES-BLE-PROTOCOL] [DES-BLE-CAPABILITY] [DES-TEST] -->

- [x] Extend `StateDump` with FX model ID fields for pre1/pre2/post1/post2/post3; parse both varint and length-delimited encodings for fields 48-52.
- [ ] Add gate state once field 54 is captured and labelled in project traces.
- [x] Add byte-exact unit tests for the captured dump: pre1 Transpose, pre2 Green 808, post1 Chief DC2W (ST), post2 Analog Delay, post3 Mind Hall, plus bypass handling.
- [x] Add encoder frame builders and byte-exact tests for currently exposed write paths: amp knobs and save-active-preset frame.
- [ ] Add encoder frame builders and byte-exact tests for FX model select, FX float param, FX bypass, gate bypass/reduction, capture slot/volume, cab/IR slot, cab/IR params, cab mic/position, param refresh, and post-save refresh.
- [x] Add decoder helpers for FX parameter refresh replies without relying on frontend log text scraping.
- [ ] Add decoder helpers for cab/IR parameter refresh replies without relying on frontend log text scraping.
- [x] Keep `CapabilityMatrix` defaults for new read/write capabilities at `Unverified`/`Inferred`; graduate only from guided hardware traces.
- [x] Keep `nano_ble_command_probe` usable as the manual verification tool: write a specific frame, tail `logs/protocol-lab.log`, and collect c305/c306 replies for comparison.

---

## Work Sessions

<!-- Append-only. Date | Task | Action | Files Modified | Agent | Human -->

| Date       | Task        | Action             | Files Modified                                                                                                                                                                                                                                                                                                                         | Agent | Human |
| ---------- | ----------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ----- |
| 2026-06-10 | 0, 1, 2, 3  | Coded (all phases) | `backend/src/infrastructure/midi/ble.rs`, `ble_debug.rs`, `ble_decoder.rs`, `ble_inspector.rs`, `ble_sync.rs`, `port_watchdog.rs`, `backend/src/domain/nano_state.rs`, `backend/src/bin/nano_ble_scan_probe.rs`, `nano_ble_observe_probe.rs`, `nano_ble_preset_probe.rs`, `tools/analyze_ble_observe.py`, `tools/nano_hid_probe.swift` | [x]   | [x]   |
| 2026-06-10 | 1.1         | Fixed              | `ble.rs` — BLE discovery now keeps live Peripheral handles; connect no longer hits "Device not found"                                                                                                                                                                                                                                  | [x]   | [x]   |
| 2026-06-12 | Living docs | Aligned            | Sprint brief updated to match current implemented BLE features: provisional decoder stance, capability matrix, sync engine, watchdog fallback                                                                                                                                                                                          | [x]   | [x]   |
| 2026-06-13 | Zone spec   | Extracted          | `docs/specs/110-backend-midi-ble/spec.md`, `design.md`, `tasks.md` created from sprint brief + source read                                                                                                                                                                                                                             | [x]   | [x]   |
