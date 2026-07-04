---
afx: true
type: DESIGN
status: Living
owner: "@richard-sentino"
version: "1.0"
created_at: "2026-06-10T11:54:35.000Z"
updated_at: "2026-06-13T08:56:32.000Z"
tags: ["midi", "usb", "midir", "port-manager", "domain", "backend"]
spec: spec.md
---

# 100 Backend MIDI USB — Design

## [DES-USB-OVR] Overview

The USB MIDI zone is the lowest I/O layer of the Rust backend. It wraps `midir` in three
thin modules (`port_manager`, `connection`, `listener`) plus three domain value-object
modules (`port`, `midi_message`, `device`). No Tauri, no async runtime, and no event
emission live here — the modules return plain `Result` values or `mpsc` channels that the
IPC layer (`120-backend-ipc`) promotes into Tauri commands and `midi://*` events.

Flow map anchor from the overview: `[Flow.UsbMidi]`.

---

## [DES-USB-ARCH] Architecture

### File Map

```text
backend/src/
├── infrastructure/midi/
│   ├── mod.rs             — pub mod declarations; BLE sub-modules are feature-gated
│   ├── port_manager.rs    — enumerate output/input ports; Nano name matching   [FR-1..4]
│   ├── connection.rs      — send raw bytes to a named output port               [FR-5]
│   └── listener.rs        — persistent input listener thread via mpsc           [FR-6..7]
└── domain/
    ├── port.rs            — MidiPort / PortDirection / PortKind value objects   [FR-1,2,3,11]
    ├── midi_message.rs    — MidiMessage: ts_ms + bytes + helper predicates      [FR-7,8]
    └── device.rs          — Device / DeviceState value objects                  [FR-9,10]

backend/src/bin/
├── nano_usb_probe.rs      — diagnostic: listen all input ports, log events      [FR-12]
└── nano_usb_preset_probe.rs — diagnostic: send PC sequence to Nano output       [FR-13]
```

### Flow Map: `[Flow.UsbMidi]`

```text
[IPC layer — 120-backend-ipc]
        │ calls list_output_ports / list_input_ports
        │ calls send_to_port(port_name, bytes)
        │ calls start_listener(port_name)
        ▼
[port_manager.rs]                   [connection.rs]           [listener.rs]
  MidiOutput::new()                  MidiOutput::new()         MidiInput::new()
  .ports() → filter by name          .ports() → find by name   .ports() → find by name
  → Vec<MidiPort>                    .connect(port)            .connect(port, callback)
                                     .send(bytes)              callback: mpsc::Sender<MidiMessage>
                                     drop (port released)      ↓
                                                               mpsc::Receiver<MidiMessage>
                                                               → IPC layer emits midi://message
        ▼
[midir OS backend: CoreMIDI | WinMM | ALSA]
        ↕  USB cable
[Nano Cortex hardware]
```

---

## [DES-USB-DATA] Data Model

### `MidiPort` — `backend/src/domain/port.rs`

Identifies a single OS MIDI endpoint. Passed over IPC as JSON.

| Field       | Type            | Serde         | Description                                                                 |
| ----------- | --------------- | ------------- | --------------------------------------------------------------------------- |
| `id`        | `String`        | `"id"`        | Opaque stable key; `"usb:<name>"` for outputs, `"usb-in:<name>"` for inputs |
| `name`      | `String`        | `"name"`      | OS-assigned human-readable port name                                        |
| `direction` | `PortDirection` | `"direction"` | `Input` → `"in"`, `Output` → `"out"`                                        |
| `kind`      | `PortKind`      | `"kind"`      | `Usb` → `"usb"`, `Ble` → `"ble"`                                            |

**`PortDirection`** (`#[derive(Serialize, Deserialize)]`):

| Variant  | JSON    |
| -------- | ------- |
| `Input`  | `"in"`  |
| `Output` | `"out"` |

**`PortKind`** (`#[derive(Serialize, Deserialize)]`):

| Variant | JSON    |
| ------- | ------- |
| `Usb`   | `"usb"` |
| `Ble`   | `"ble"` |

**`MidiPort::is_nano_cortex(&self) -> bool`**: returns `true` when `self.name.to_lowercase()` contains `"nano"` or `"cortex"`. Used by both `port_manager` matching functions and the `nano_usb_preset_probe` diagnostic.

---

### `MidiMessage` — `backend/src/domain/midi_message.rs`

Timestamped raw MIDI bytes from the input listener. Serialized and emitted as the `midi://message` event payload.

| Field   | Type      | Description                                                       |
| ------- | --------- | ----------------------------------------------------------------- |
| `ts_ms` | `u64`     | Monotonic milliseconds since `start_listener` session start       |
| `bytes` | `Vec<u8>` | Raw MIDI bytes (e.g. `[0xC0, 0x00]` = Program Change to preset 0) |

**Methods**:

| Method              | Return        | Description                                            |
| ------------------- | ------------- | ------------------------------------------------------ |
| `new(ts_ms, bytes)` | `MidiMessage` | Constructor                                            |
| `status_byte()`     | `Option<u8>`  | First byte of the message                              |
| `is_realtime()`     | `bool`        | True for `0xF8..=0xFF` (clock, active sense, reset, …) |
| `is_sysex()`        | `bool`        | True when first byte is `0xF0`                         |

---

### `Device` / `DeviceState` — `backend/src/domain/device.rs`

Tracks connection state for a single device. Held in `AppState` (zone 120).

**`DeviceState`**:

| Variant        | JSON             |
| -------------- | ---------------- |
| `Disconnected` | `"disconnected"` |
| `Connecting`   | `"connecting"`   |
| `Connected`    | `"connected"`    |
| `Error`        | `"error"`        |

**`Device`**:

| Field         | Type             | Description                                     |
| ------------- | ---------------- | ----------------------------------------------- |
| `name`        | `String`         | Display name (e.g. `"Nano Cortex"`)             |
| `state`       | `DeviceState`    | Current lifecycle state                         |
| `kind`        | `PortKind`       | Transport (`Usb` or `Ble`)                      |
| `last_preset` | `Option<u8>`     | Last known preset index `0–63` from incoming PC |
| `last_error`  | `Option<String>` | Error string when `state == Error`              |

**`Device::new(name, kind)`**: constructs with `state: Disconnected`, `last_preset: None`, `last_error: None`.

---

## [DES-USB-API] Internal API

All functions are `pub` within the crate. None are `#[tauri::command]`; the IPC bridge calls them.

### `port_manager.rs`

```rust
pub fn list_output_ports() -> Result<Vec<MidiPort>, String>
```

Creates a `MidiOutput` named `"Nano Cortex Scanner"`, iterates `.ports()`, converts each to
`MidiPort { id: "usb:<name>", direction: Output, kind: Usb }`. Returns `Err` if `MidiOutput::new` fails.

```rust
pub fn list_input_ports() -> Result<Vec<MidiPort>, String>
```

Same pattern with `MidiInput` named `"Nano Cortex Input Scanner"`. IDs are prefixed `"usb-in:"`.

```rust
pub fn find_nano_cortex_port(ports: &[MidiPort]) -> Option<&MidiPort>
```

First element where `p.is_nano_cortex()`. Used to select the output port for sending.

```rust
pub fn find_nano_cortex_input_port(ports: &[MidiPort]) -> Option<&MidiPort>
```

Prefers a port where `p.is_nano_cortex() && name.contains("out")`. Falls back to the first
`is_nano_cortex()` match. The "out" preference handles the device-perspective naming
convention (device calls its output "OUT"; that port is the host's input).

### `connection.rs`

```rust
pub fn send_to_port(port_name: &str, bytes: &[u8]) -> Result<(), String>
```

Opens a fresh `MidiOutput` connection named `"Nano Cortex Sender"` each call, finds the port by exact
name match, calls `conn.send(bytes)`, then drops the connection (releasing the OS port handle).
Returns descriptive `Err` strings for: output creation failure, port not found, connect failure, send failure.

### `listener.rs`

```rust
pub fn start_listener(
    port_name: &str,
) -> Result<(mpsc::Receiver<MidiMessage>, MidiInputConnection<()>), String>
```

Creates a `MidiInput` named `"Nano Cortex Listener"` with `Ignore::None` (passes SysEx and real-time
bytes). Finds the port by name. Spawns the `midir` callback thread: on each MIDI event, computes
`ts = start.elapsed().as_millis() as u64` and sends `MidiMessage::new(ts, data.to_vec())` over
an `mpsc::Sender`. Returns `(rx, conn)` — the caller drives the channel; dropping `conn` stops the listener.

---

## [DES-USB-DEC] Key Decisions

| Decision                                           | Choice                                                                | Rationale                                                                                                                                                            |
| -------------------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Per-send connect/disconnect                        | `send_to_port` opens and drops a `MidiOutputConnection` on every call | `midir` output connections are exclusive on some backends; short-lived connections avoid stale handles and let the OS manage the port lifecycle cleanly.             |
| `Ignore::None` on listener                         | Pass SysEx, time code, and real-time bytes through                    | Gives the diagnostic tools and the MIDI monitor full visibility; the IPC layer can filter later.                                                                     |
| `mpsc` channel over callbacks                      | `start_listener` returns `mpsc::Receiver<MidiMessage>`                | Decouples the midir OS callback thread from the Tauri async runtime; the IPC command layer drives the channel on its own task.                                       |
| Device-perspective "OUT" preference                | `find_nano_cortex_input_port` prefers names containing `"out"`        | On macOS CoreMIDI, the Nano Cortex exposes "Nano Cortex MIDI OUT" as a host input port. The preference makes the match deterministic without hardcoding a port name. |
| Domain types are pure value objects                | No `Arc`, no `Mutex`, no async in `domain/`                           | Keeps serialization and business logic free of infrastructure concerns; enables deterministic unit tests without mocking.                                            |
| Diagnostic binaries are separate `[[bin]]` targets | `nano_usb_probe`, `nano_usb_preset_probe`                             | Allows hardware-level verification without running the full Tauri app; output is dual-written to stdout and `logs/*.log`.                                            |

---

## [DES-USB-TEST] Testing Notes

**In-crate unit tests** (`port_manager.rs`, `#[cfg(test)]`):

- `test_is_nano_cortex`: verifies `"Nano Cortex MIDI OUT"` matches and `"MIDI OUT (Port 1)"` does not.
- `test_find_nano_cortex_port`: builds a two-element `Vec<MidiPort>` and asserts the correct one is returned.

Both tests run under `cargo test` with no MIDI hardware.

**Hardware verification** (manual, documented in the release smoke matrix):

- `nano_usb_probe --list`: confirms OS port enumeration matches expected Nano Cortex port names.
- `nano_usb_probe [seconds]`: confirms MIDI events arrive when the Nano Cortex is configured to send MIDI Out.
- `nano_usb_preset_probe --sequence 0,1,2`: confirms Program Change bytes reach the device and it switches presets.

**Integration** (exercised via zone 120 `connect` + `send_midi` Tauri commands):

- `send_to_port` is tested end-to-end when `send_midi` command is invoked from the frontend on a connected device.
- `start_listener` is exercised when `connect` succeeds and the input listener thread starts emitting `midi://message` events.
