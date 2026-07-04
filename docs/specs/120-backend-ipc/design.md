---
afx: true
type: DESIGN
status: Living
owner: "@richard-sentino"
version: "1.0"
created_at: "2026-06-10T11:54:35.000Z"
updated_at: "2026-06-13T08:56:32.000Z"
tags: ["ipc", "tauri", "commands", "events", "app-state", "backend"]
spec: spec.md
---

# 120 Backend IPC — Design

## [DES-IPC-OVR] Overview

The IPC zone is the narrow waist of the backend: every UI-initiated action arrives as a
Tauri command, every device-originated notification leaves as a Tauri event. The zone owns
three modules (`commands`, `events`, `mapping`) plus the `app/` sub-crate (`state`,
`config`, `error`). Nothing in this zone opens a MIDI port, writes a BLE characteristic,
or reads a file system path except for the two settings-transfer commands and the protocol
log appender.

Flow map anchor from the overview: `[Flow.IpcBridge]`.

The central organizing invariant is **thin dispatch**: each command validates input, calls
one or two infrastructure functions, updates `AppState`, and emits an event. Protocol
decisions (port name matching, packet decoding, BLE sync) are fully delegated to zones 100
and 110.

---

## [DES-IPC-ARCH] Architecture

### File Map

```text
backend/src/
├── ipc/
│   ├── mod.rs         — pub mod declarations
│   ├── commands.rs    — all #[tauri::command] handlers + start_usb_input_monitor  [FR-1..15]
│   ├── events.rs      — EVENT_* constants + emit_* helpers + protocol log writer   [FR-16..21]
│   └── mapping.rs     — serde boundary helpers (port/message → serde_json::Value)  [FR-26]
└── app/
    ├── mod.rs         — pub use re-exports
    ├── state.rs       — AppState struct + async helpers                             [FR-22..23]
    ├── config.rs      — BuildConfig (compile-time feature detection)               [FR-25]
    └── error.rs       — AppError enum + AppResult type alias                       [FR-24]
```

### Flow Map: `[Flow.IpcBridge]`

```text
[React webview — 200/210]
    │  invoke("list_ports" | "connect" | "send_midi" | …)
    ▼
[commands.rs — Tauri command handlers]
    │  calls into zone 100 (port_manager, connection, listener)
    │  calls into zone 110 (ble::find_and_connect_with_log, BleHandle::send)
    │  reads/writes AppState (tokio::Mutex)
    ▼
[infrastructure layer — zones 100 / 110]
    │  returns Result<T, String> or mpsc channel
    ▼
[commands.rs — on success / error]
    │  calls events::emit_* helpers
    ▼
[events.rs — Tauri event emission]
    │  app.emit(EVENT_NAME, payload)
    │  also: println! + append_protocol_log (file I/O side-channel)
    ▼
[React webview — listen("midi://*", handler)]
```

### USB Input Monitor (private helper)

`start_usb_input_monitor` is not a Tauri command. It is called by both `connect` (USB path)
and `ble_scan` (BLE attach), making USB input observation a side-effect of any successful
connection. It:

1. Calls `port_manager::list_input_ports()` and filters to Nano Cortex ports.
2. Clears any existing handles from `AppState.midi_input_connections`.
3. For each matching input port: calls `listener::start_listener(port_name)`, spawns a
   `std::thread` that loops `rx.recv()` and calls `events::emit_log` + `events::emit_midi_message`
   per message, then stores the `MidiInputConnection<()>` handle in `AppState`.
4. Logs a warning if no Nano input is found (USB output control still works).

---

## [DES-IPC-COMMANDS] Command Handlers

### `list_ports` [FR-1]

```rust
#[tauri::command]
pub fn list_ports(app_handle: tauri::AppHandle) -> Result<Vec<MidiPort>, String>
```

Synchronous (no `async`). Calls `port_manager::list_output_ports()`, emits `midi://log`
with count or error string, and returns the result directly. The caller receives a JSON
array of `MidiPort` objects.

### `connect` [FR-2]

```rust
#[tauri::command]
pub async fn connect(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, Arc<AppState>>,
    device_name: String,
) -> Result<String, String>
```

1. Calls `port_manager::list_output_ports()` and finds the port by exact `name` match.
2. Calls `state.set_connected(port.name, PortKind::Usb)`.
3. Resets `NanoState`: `connection_status = "connected"`, `sync_mode = CommandOnly`, `stale = false`.
4. Calls `start_usb_input_monitor` (non-fatal; warns if no input port found).
5. Emits `midi://connected { name }`.
6. Returns `Ok("Connected to {name}")`.

### `disconnect` [FR-3]

```rust
#[tauri::command]
pub async fn disconnect(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, Arc<AppState>>,
) -> Result<(), String>
```

1. (BLE feature only) Takes the `BleHandle` out of `AppState.ble_peripheral`.
2. Calls `state.set_disconnected()` immediately (updates UI state; does not wait for BLE).
3. Resets `NanoState`: `connection_status = "disconnected"`, `sync_mode = DisconnectedPreview`, `stale = true`.
4. Emits `midi://disconnected`.
5. (BLE feature only) Spawns a `tokio::spawn` that calls `handle.disconnect()` with an 8 s
   `tokio::time::timeout`, logging success, error, or timeout.

The two-phase approach (UI first, physical BLE disconnect in background) avoids blocking the
UI on CoreBluetooth's potentially slow unsubscribe path.

### `send_midi` [FR-4] [FR-5]

```rust
#[tauri::command]
pub async fn send_midi(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, Arc<AppState>>,
    port_name: String,
    bytes: Vec<u8>,
) -> Result<(), String>
```

**Transport routing** (reads `AppState.device` under lock; releases before I/O):

- `PortKind::Ble` → calls `BleHandle::send(&bytes)`.
  - Success: if the message is a valid PC (`0xC0xx`, `bytes[1] < 64`), updates
    `NanoState.active_preset_slot`, `bank`, `sync_mode = CommandOnly`, `provisional = true`,
    `stale = false`.
  - Failure: emits `midi://disconnected`, updates `NanoState`, calls `state.set_disconnected()`,
    returns `Err`.
- `PortKind::Usb` (or no device) → calls `connection::send_to_port(&port_name, &bytes)`;
  updates `NanoState` on PC message the same way.

**NanoState bank calculation**: `bank = char('A' + (preset / 8).min(7))` as a string.

### `get_state` [FR-6]

Reads `AppState.device` under lock; maps `DeviceState` variant to lowercase string.
Returns `"disconnected"` if `device` is `None`.

### `get_device_name` [FR-7]

Delegates to `AppState::device_name()` — returns `Some(name)` or `None`.

### `get_nano_state` [FR-8]

Clones the `NanoState` from `AppState.nano_state` under lock.

### `get_ble_capabilities` [FR-9]

Clones the `CapabilityMatrix` from `AppState.capability_matrix` under lock.

### `get_ble_debug_log` [FR-10]

Feature-gated. Clones the `BleHandle` option, calls `handle.packet_logger.snapshot()`,
returns the result. Stub (no-`ble` build) returns `Ok(Vec::new())`.

### `ble_scan` [FR-11]

```rust
#[cfg(feature = "ble")]
#[tauri::command]
pub async fn ble_scan(
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, Arc<AppState>>,
) -> Result<Vec<String>, String>
```

Key behaviors:

1. **Reuse existing handle**: if `AppState.ble_peripheral` holds a handle that `is_connected()`,
   skip scanning; update NanoState and optionally emit `midi://connected`.
2. **Concurrent scan guard**: `AppState.ble_scanning` (a `Mutex<bool>`) is set to `true` before
   and `false` after scanning. Returns `Err("Already scanning")` if already locked.
3. **Liveness check**: immediately after `find_and_connect_with_log` succeeds, calls
   `handle.is_connected()` again; if false, disconnects and returns an error (guards against
   a device that disconnects during BLE handshake).
4. **USB-primary mode**: if USB is already connected when `ble_scan` is called, BLE attaches
   as an observation channel without overwriting the primary `AppState.device`; the disconnect
   watcher skips emitting `midi://disconnected` when `preserve_usb_on_ble_disconnect` is true.
5. **Disconnect watcher**: spawns a `tokio::spawn` loop that sleeps 500 ms, checks
   `handle.is_connected()`, and on drop: clears `AppState.ble_peripheral`, optionally calls
   `set_disconnected` + emits `midi://disconnected`.

Stub (no-`ble` build) returns `Err("BLE not compiled in")`.

### `ble_ping` [FR-12]

Calls `ble::get_adapter()`. Returns `Ok("BLE adapter OK")` on success.
Stub returns `Err("BLE not compiled in")`.

### `trace_marker` [FR-13]

Trims `label` and uppercases `phase`; rejects blanks. Formats `"TRACE {PHASE}: {label}"`,
calls `tracing::info!`, and calls `events::emit_log(&app_handle, "info", &marker)`.

### `export_settings_json` [FR-14]

Expands `~` via `$HOME` env var in `expand_user_path`. Validates:

- Path is not a directory.
- Parent directory exists.

Writes `contents` with `std::fs::write`. Emits `midi://log` with saved path. Returns the
absolute path string.

### `import_settings_json` [FR-15]

Validates:

- Path exists.
- Path is not a directory.
- File size ≤ `SETTINGS_FILE_SIZE_LIMIT_BYTES` (10 MB).

Reads with `std::fs::read_to_string`. Emits `midi://log`. Returns raw JSON string.

---

## [DES-IPC-EVENTS] Event System

### Tauri Events

| Event                  | Payload type                                         | Emitter function     | Trigger                                                        |
| ---------------------- | ---------------------------------------------------- | -------------------- | -------------------------------------------------------------- |
| `midi://message`       | `MidiMessage { ts_ms: u64, bytes: Vec<u8> }`         | `emit_midi_message`  | USB input listener thread receives bytes                       |
| `midi://connected`     | `{ "name": String }`                                 | `emit_connected`     | `connect` success; `ble_scan` success                          |
| `midi://disconnected`  | `null`                                               | `emit_disconnected`  | `disconnect` command; BLE watcher drop; BLE send failure       |
| `midi://error`         | `{ "message": String }`                              | `emit_error`         | backend error paths (reserved; not yet wired to all paths)     |
| `midi://ports-changed` | `{ "ports": Vec<MidiPort> }`                         | `emit_ports_changed` | hotplug / port refresh (reserved for zone 130 `port_watchdog`) |
| `midi://log`           | `{ "ts": u128, "level": String, "message": String }` | `emit_log`           | all command lifecycle, BLE diagnostics, incoming MIDI debug    |

All emitters are generic over `R: Runtime` via the `tauri::Emitter` trait, making them
callable from both `AppHandle` (in commands) and test/mock contexts.

### Protocol Log Side-Channel (`emit_log`)

`emit_log` does three things atomically from the caller's perspective:

1. `println!("[midi-log] {level}: {message}")` to stdout.
2. `append_protocol_log(ts, level, message)` — opens `logs/protocol-lab.log` in append mode
   (creates the file and directory if needed), writes a single `"{ts} {level} {message}\n"` line,
   and closes the handle. No persistent file handle; each call opens/closes.
3. `app.emit(EVENT_LOG, json!({ "ts", "level", "message" }))`.

The log path is computed relative to `std::env::current_dir()`: if the cwd's file name is
`"backend"`, the log lands at `../logs/protocol-lab.log`; otherwise at `./logs/protocol-lab.log`.

---

## [DES-IPC-STATE] AppState

```text
AppState
├── device: Mutex<Option<Device>>
│     None = no connection. Some(Device) has .state (Connected/Disconnected/…) and .kind (Usb/Ble).
├── settings: Mutex<Settings>
│     Persisted settings. Loaded/saved by zone 130 (settings_store).
├── ble_scanning: Mutex<bool>
│     Concurrency guard for ble_scan; reset to false in all exit paths.
├── midi_input_connections: Mutex<Vec<MidiInputConnection<()>>>
│     One handle per Nano Cortex input port. Dropped by set_disconnected.
├── footswitches: Mutex<NanoCortexFootswitchState>
│     Live-access footswitch model. Mutated by platform shortcuts (zone 130).
├── nano_state: Mutex<NanoState>
│     Normalized Nano state: preset slot, bank, signal-chain slots, expression,
│     sync_mode, provisional, stale, connection_status. Updated by send_midi and BLE sync.
├── capability_matrix: Mutex<CapabilityMatrix>
│     Reverse-engineering tracking: which Nano fields are confirmed/inferred/unsupported.
└── ble_peripheral: Mutex<Option<BleHandle>>   [cfg(feature = "ble")]
      Live BLE peripheral. None = disconnected/not compiled.
```

**`AppState::new()`** initializes all fields to their empty/default values and wraps self in
`Arc<AppState>`, which is registered as a Tauri managed state via `.manage()` in `lib.rs`.

**`set_connected(name, kind)`**: locks `device`, creates `Device::new(name, kind)`, sets
`state = Connected`.

**`set_disconnected()`**: locks `device`, sets `state = Disconnected`; locks
`midi_input_connections` and clears (dropping handles stops the OS listener);
(BLE feature) takes and drops the `ble_peripheral`.

**`is_connected()`**: reads `device.state == DeviceState::Connected`.

**`device_name()`**: reads `device.as_ref().map(|d| d.name.clone())`.

---

## [DES-IPC-MAPPING] Mapping Module

`mapping.rs` provides three pure functions that convert domain values to `serde_json::Value`
for use in event payloads. No I/O, no async, no side effects.

| Function          | Input          | Output              | Usage                                                   |
| ----------------- | -------------- | ------------------- | ------------------------------------------------------- |
| `port_to_wire`    | `&MidiPort`    | `serde_json::Value` | Single port serialization                               |
| `ports_to_wire`   | `&[MidiPort]`  | `serde_json::Value` | Port list in `midi://ports-changed` payload             |
| `message_to_wire` | `&MidiMessage` | `serde_json::Value` | Available for callers needing manual value construction |

All three call `serde_json::to_value(x).unwrap_or_default()` — the `unwrap_or_default()`
means a serialization failure silently becomes a JSON `null` rather than a panic. This is
safe because `MidiPort` and `MidiMessage` are simple `#[derive(Serialize)]` value objects
that cannot fail serialization in practice.

Note: `emit_midi_message` in `events.rs` calls `app.emit(EVENT_MIDI_MESSAGE, msg)` directly
(Tauri serializes the `MidiMessage` struct itself); the `message_to_wire` helper is available
for callers that need manual JSON value construction.

---

## [DES-IPC-ERROR] Error Types

### `AppError` — `backend/src/app/error.rs`

```text
AppError
├── Midi(String)          — MIDI infrastructure error
├── Ble(String)           — BLE infrastructure error
├── Serialization(String) — serde error
├── NotFound(String)      — resource/port not found
├── AlreadyConnected      — guard: already in connected state
├── NotConnected          — guard: operation requires connection
└── Io(std::io::Error)    — filesystem error
```

**`Display`**: prefixed strings, e.g. `"MIDI error: {msg}"`, `"BLE error: {msg}"`.

**`From<AppError> for String`**: enables `AppError` to be returned directly where
`#[tauri::command]` expects `Result<T, String>` (the error arm).

**`serde::Serialize`**: serializes as the `Display` string — supports Tauri's automatic
JSON error serialization in command returns.

**`AppResult<T>`**: type alias `Result<T, AppError>`. Used internally; boundary crossing uses
`Result<T, String>` per Tauri command convention.

### `BuildConfig` — `backend/src/app/config.rs`

```rust
pub struct BuildConfig {
    pub ble_enabled: bool,
}
impl BuildConfig {
    pub fn from_env() -> Self { Self { ble_enabled: cfg!(feature = "ble") } }
}
```

A simple compile-time struct. `ble_enabled` is `true` iff the `ble` Cargo feature is active.
Currently consumed by zone 130 (`lib.rs`) to gate BLE plugin setup; not exposed over IPC directly.

---

## [DES-IPC-DEC] Key Decisions

| Decision                                                | Choice                                                                     | Rationale                                                                                                                                                                                                                |
| ------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Commands return `Result<T, String>`                     | Not `Result<T, AppError>` at the IPC boundary                              | Tauri's command macro requires `Serialize` on `Err`; `String` is the simplest serializable error type. `AppError` is used internally and converted via `From<AppError> for String`.                                      |
| `AppState` uses `tokio::sync::Mutex`                    | Not `std::sync::Mutex`                                                     | Commands are `async`; locking a `std::sync::Mutex` across an `await` point is unsound. `tokio::Mutex` is safe to hold across `await`.                                                                                    |
| `Arc<AppState>` not `AppState`                          | Wrapped at construction                                                    | Tauri's `manage`/`State` requires `Send + Sync + 'static`; `Arc` allows shared ownership between the Tauri command dispatcher and `tokio::spawn` watcher tasks.                                                          |
| BLE disconnect is two-phase                             | UI updates immediately; physical disconnect is background with 8 s timeout | CoreBluetooth unsubscribe can stall for multiple seconds. Users should not see a frozen UI while BLE tears down.                                                                                                         |
| USB input monitor runs in `std::thread`                 | Not `tokio::spawn`                                                         | `midir`'s callback thread is already OS-managed; routing through `std::thread` avoids wrapping an OS-blocking listener in the tokio executor.                                                                            |
| `emit_log` file I/O is open/close per call              | No persistent `File` handle in `events.rs`                                 | `events.rs` is shared across async command invocations; a persistent `Mutex<File>` would require an `Arc<Mutex<File>>` in every emitter signature. Open/close per call is simpler and the throughput requirement is low. |
| `ble_scan` concurrent scan guard                        | `Mutex<bool>` in `AppState`                                                | Prevents the user from clicking "BLE Scan" twice simultaneously; simpler than a `tokio::Semaphore` for a single-concurrency use case.                                                                                    |
| `mapping.rs` is a pure utility                          | No state, no I/O                                                           | Keeps serialization helpers easily testable in isolation; separates them from event-emission logic.                                                                                                                      |
| `trace_marker` emits to both `tracing` and `midi://log` | Both channels                                                              | `tracing` goes to the terminal (for RE session capture); `midi://log` goes to the in-app log panel visible to the user during a hardware RE session.                                                                     |
