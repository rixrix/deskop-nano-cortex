---
afx: true
type: TASKS
status: Living
owner: "@richard-sentino"
version: "1.0"
created_at: "2026-06-10T11:54:35.000Z"
updated_at: "2026-07-04T10:47:11.000Z"
tags: ["ipc", "tauri", "commands", "events", "app-state", "backend"]
spec: spec.md
design: design.md
---

# 120 Backend IPC — Tasks

> Backfilled implementation checklist. All phases were coded as part of the original sprint
> (2026-06-10 through 2026-06-12). Hardware-verification items remain open.

---

## Phase 0: AppState + Error Foundation

<!-- files: backend/src/app/state.rs, backend/src/app/error.rs, backend/src/app/config.rs, backend/src/app/mod.rs -->
<!-- @see docs/specs/120-backend-ipc/spec.md [FR-22] [FR-23] [FR-24] [FR-25] -->
<!-- @see docs/specs/120-backend-ipc/design.md [DES-IPC-STATE] [DES-IPC-ERROR] -->

- [x] Define `AppState` struct with all fields: `device`, `settings`, `ble_scanning`, `midi_input_connections`, `footswitches`, `nano_state`, `capability_matrix`, and (feature-gated) `ble_peripheral`.
- [x] Implement `AppState::new()` returning `Arc<AppState>` with all fields defaulted.
- [x] Implement `set_connected(name, kind)` — creates `Device::new`, sets `state = Connected`.
- [x] Implement `set_disconnected()` — sets `state = Disconnected`, clears USB listener handles, drops BLE peripheral (feature-gated).
- [x] Implement `is_connected()` and `device_name()` async helpers.
- [x] Define `AppError` enum with `Midi`, `Ble`, `Serialization`, `NotFound`, `AlreadyConnected`, `NotConnected`, `Io` variants.
- [x] Implement `Display` for `AppError` with prefixed messages.
- [x] Implement `From<AppError> for String` for Tauri command boundary crossing.
- [x] Implement `serde::Serialize` for `AppError` (serializes as Display string).
- [x] Define `AppResult<T>` type alias.
- [x] Define `BuildConfig` struct with `ble_enabled: bool`; implement `from_env()` using `cfg!(feature = "ble")`.
- [x] Declare `pub use` re-exports in `app/mod.rs`.

---

## Phase 1: Event Emitters + Protocol Log

<!-- files: backend/src/ipc/events.rs -->
<!-- @see docs/specs/120-backend-ipc/spec.md [FR-16] [FR-17] [FR-18] [FR-19] [FR-20] [FR-21] -->
<!-- @see docs/specs/120-backend-ipc/design.md [DES-IPC-EVENTS] -->

- [x] Define all `EVENT_*` string constants: `midi://message`, `midi://connected`, `midi://disconnected`, `midi://error`, `midi://ports-changed`, `midi://log`.
- [x] Implement `emit_midi_message(app, msg)` — calls `app.emit(EVENT_MIDI_MESSAGE, msg)`.
- [x] Implement `emit_connected(app, device_name)` — payload `{ "name": device_name }`.
- [x] Implement `emit_disconnected(app)` — payload `serde_json::Value::Null`.
- [x] Implement `emit_error(app, message)` — payload `{ "message": message }`.
- [x] Implement `emit_ports_changed(app, ports)` — payload `{ "ports": ports }`.
- [x] Implement `emit_log(app, level, message)`:
  - [x] Compute `ts` as `SystemTime::now()` milliseconds since UNIX epoch.
  - [x] `println!("[midi-log] {level}: {message}")`.
  - [x] Call `append_protocol_log(ts, level, message)`.
  - [x] `app.emit(EVENT_LOG, json!({ "ts", "level", "message" }))`.
- [x] Implement `append_protocol_log`: resolve `logs/protocol-lab.log` relative to cwd (handle `backend/` cwd offset); `create_dir_all` parent; open in append mode; write line.
- [x] All emitters generic over `R: Runtime` via `Emitter<R>` trait bound.

---

## Phase 2: Mapping Helpers

<!-- files: backend/src/ipc/mapping.rs, backend/src/ipc/mod.rs -->
<!-- @see docs/specs/120-backend-ipc/spec.md [FR-26] -->
<!-- @see docs/specs/120-backend-ipc/design.md [DES-IPC-MAPPING] -->

- [x] Implement `port_to_wire(port: &MidiPort) -> serde_json::Value` — `to_value(port).unwrap_or_default()`.
- [x] Implement `ports_to_wire(ports: &[MidiPort]) -> serde_json::Value` — `to_value(ports).unwrap_or_default()`.
- [x] Implement `message_to_wire(msg: &MidiMessage) -> serde_json::Value` — `to_value(msg).unwrap_or_default()`.
- [x] Declare `pub mod commands; pub mod events; pub mod mapping;` in `ipc/mod.rs`.

---

## Phase 3: Core Commands (USB Path)

<!-- files: backend/src/ipc/commands.rs -->
<!-- @see docs/specs/120-backend-ipc/spec.md [FR-1] [FR-2] [FR-3] [FR-4] [FR-6] [FR-7] -->
<!-- @see docs/specs/120-backend-ipc/design.md [DES-IPC-COMMANDS] [DES-IPC-STATE] -->

- [x] Implement `list_ports` — calls `port_manager::list_output_ports`, emits log, returns result.
- [x] Implement `connect(device_name)`:
  - [x] Enumerate output ports; find exact name match.
  - [x] Call `state.set_connected(port.name, PortKind::Usb)`.
  - [x] Reset `NanoState` (`connection_status`, `sync_mode`, `stale`).
  - [x] Call `start_usb_input_monitor`.
  - [x] Emit `midi://connected`.
- [x] Implement private `start_usb_input_monitor(app_handle, state)`:
  - [x] Filter `list_input_ports()` to Nano Cortex ports.
  - [x] Clear existing `midi_input_connections`.
  - [x] For each port: `listener::start_listener`, spawn thread emitting `midi://log` + `midi://message`.
  - [x] Store connections in `AppState`.
  - [x] Warn if no input ports found.
- [x] Implement `disconnect`:
  - [x] Optionally take BLE handle (feature-gated).
  - [x] Call `state.set_disconnected()`.
  - [x] Reset `NanoState`.
  - [x] Emit `midi://disconnected`.
  - [x] Spawn background BLE disconnect with 8 s timeout (feature-gated).
- [x] Implement `send_midi(port_name, bytes)`:
  - [x] Read `AppState.device` kind under lock.
  - [x] BLE-primary path: route raw MIDI through the Nano USB port when attached; otherwise fail honestly without dropping the BLE session.
  - [x] USB path: call `connection::send_to_port`.
  - [x] Update `NanoState` on recognized PC message.
- [x] Implement `get_state` — maps `DeviceState` variant to lowercase string.
- [x] Implement `get_device_name` — delegates to `AppState::device_name()`.

---

## Phase 4: State Query Commands + BLE Commands

<!-- files: backend/src/ipc/commands.rs -->
<!-- @see docs/specs/120-backend-ipc/spec.md [FR-8] [FR-9] [FR-10] [FR-11] [FR-12] -->
<!-- @see docs/specs/120-backend-ipc/design.md [DES-IPC-COMMANDS] -->

- [x] Implement `get_nano_state` — clone `NanoState` from `AppState.nano_state`.
- [x] Implement `get_ble_capabilities` — clone `CapabilityMatrix` from `AppState.capability_matrix`.
- [x] Implement `get_ble_debug_log` (feature-gated BLE / stub no-BLE).
- [x] Implement `ble_scan` (feature-gated):
  - [x] Check for existing connected peripheral; reuse without scan.
  - [x] Guard concurrent scan with `ble_scanning` mutex.
  - [x] Call `ble::find_and_connect_with_log`.
  - [x] Liveness check after handshake.
  - [x] Store handle in `AppState.ble_peripheral`.
  - [x] Call `start_usb_input_monitor` (attach USB observation).
  - [x] USB-primary mode: skip overwriting `AppState.device` if USB is primary.
  - [x] Spawn 500 ms disconnect watcher task.
  - [x] Emit `midi://connected` on success.
- [x] Implement `ble_ping` (feature-gated / stub).
- [x] Implement no-BLE stubs for `ble_scan`, `ble_ping`, `get_ble_debug_log` returning `Err("BLE not compiled in")` / `Ok(Vec::new())`.
- [x] Implement `send_ble_frame` for raw `c304` command-frame verification.
- [x] Implement `request_state_dump`, `request_metadata`, `set_amp_knob`, and `save_active_preset` scaffolding. `request_state_dump` scopes replies to packets after its own write and decodes both single-packet and segmented state dumps; `request_metadata` returns slot-ordered sanitized preset display names; `save_active_preset` is exposed through guarded UI only and still needs junk-slot persistence verification.

---

## Phase 4.5: Typed Deep Editor BLE Commands (planned)

<!-- files: backend/src/ipc/commands.rs, backend/src/lib.rs, backend/src/domain/nano_state.rs -->
<!-- @see docs/specs/120-backend-ipc/spec.md [FR-29] [FR-31] [FR-32] [FR-34] [FR-35] -->
<!-- @see docs/specs/110-backend-midi-ble/spec.md [FR-20] [FR-21] [FR-22] [NFR-8] -->

- [ ] Extend `request_state_dump` to update `NanoState.slots` with decoded FX model names/IDs, bypass flags, and gate state from the Rust `StateDump`.
- [ ] Add typed, BLE-gated Tauri commands for FX model select, FX float param write, FX block bypass, gate bypass/reduction, capture slot/volume, cab/IR slot, cab/IR float params, and cab mic/position.
- [ ] Register each typed command in `backend/src/lib.rs` and provide no-BLE stubs returning `Err("BLE not compiled in")`.
- [ ] Keep command handlers thin: validate inputs, call `ble_encoder`, write to `c304`, update `NanoState` optimistically only where the UI needs immediate feedback, and emit log lines for hardware tailing.
- [ ] Do not graduate any new `CapabilityMatrix` write field until the user-run hardware script verifies the exact command family.

---

## Phase 5: Utility Commands

<!-- files: backend/src/ipc/commands.rs -->
<!-- @see docs/specs/120-backend-ipc/spec.md [FR-13] [FR-14] [FR-15] -->
<!-- @see docs/specs/120-backend-ipc/design.md [DES-IPC-COMMANDS] -->

- [x] Implement `trace_marker(label, phase)`:
  - [x] Trim and uppercase inputs; reject blank label/phase.
  - [x] Format `"TRACE {PHASE}: {label}"`.
  - [x] Call `tracing::info!` and `events::emit_log`.
- [x] Implement private `expand_user_path(path: &str) -> Result<PathBuf, String>`:
  - [x] Reject empty/blank paths.
  - [x] Expand leading `~` or `~/` via `$HOME` env var.
- [x] Implement `export_settings_json(path, contents)`:
  - [x] Call `expand_user_path`; reject if path is a directory.
  - [x] Validate parent directory exists.
  - [x] `std::fs::write`; emit success log; return absolute path string.
- [x] Implement `import_settings_json(path)`:
  - [x] Call `expand_user_path`; validate file exists and is not a directory.
  - [x] Check `metadata().len() <= SETTINGS_FILE_SIZE_LIMIT_BYTES` (10 MB).
  - [x] `std::fs::read_to_string`; emit info log; return raw JSON string.

---

## Phase 6: Hardware Verification

<!-- files: (no source changes — manual verification against hardware) -->
<!-- @see docs/specs/120-backend-ipc/spec.md [FR-2] [FR-3] [FR-4] [FR-11] -->
<!-- @see docs/specs/120-backend-ipc/design.md [DES-IPC-COMMANDS] -->

- [ ] `connect` + `send_midi` (PC 0–63, CC 1/37–43) verified against a real Nano Cortex over USB (hardware-only).
- [ ] `disconnect` stops USB input listener cleanly without panic (hardware-only).
- [ ] `ble_scan` connects to Nano Cortex over BLE; `send_midi` routes via BLE (hardware-only).
- [ ] BLE disconnect watcher detects physical BLE drop and emits `midi://disconnected` (hardware-only).
- [ ] USB `midi://message` events appear in the frontend log when the Nano sends MIDI Out (hardware-only).
- [ ] `trace_marker` events appear in both terminal and in-app log panel during a hardware RE session (hardware-only).

---

## Work Sessions

| Date       | Task                  | Action | Files Modified                                                                                                | Agent | Human |
| ---------- | --------------------- | ------ | ------------------------------------------------------------------------------------------------------------- | ----- | ----- |
| 2026-06-13 | Phases 0–5 (backfill) | Coded  | docs/specs/120-backend-ipc/spec.md, docs/specs/120-backend-ipc/design.md, docs/specs/120-backend-ipc/tasks.md | [x]   | [x]   |
