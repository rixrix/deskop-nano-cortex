---
afx: true
type: DESIGN
status: Living
owner: "@richard-sentino"
version: "1.1"
created_at: "2026-06-10T11:54:35.000Z"
updated_at: "2026-07-15T06:31:16.000Z"
tags: ["110-backend-midi-ble", "ble", "btleplug", "provisional-protocol", "nano-state", "gatt"]
spec: spec.md
---

# 110 Backend MIDI BLE — Design

## [DES-OVR] Overview

Zone 110 owns the BLE GATT transport layer and all Nano Cortex protocol instrumentation.
It uses `btleplug` (feature-gated behind `ble`) to scan for, connect to, write to, and
receive notifications from the Nano Cortex BLE peripheral. All inbound notification
payloads are captured raw in `BlePacketLogger`, filtered through a conservative
`NanoStateDecoder`, and applied to `NanoState` via `NanoSyncEngine`. Every decoded field
carries `provisional: true`; the `CapabilityMatrix` encodes per-field decode confidence.

The zone also owns the USB port watchdog (`port_watchdog.rs`), the NanoState domain model
(`nano_state.rs`), and all diagnostic tooling (`nano_ble_*_probe` binaries, Python and
Swift analysis scripts).

The honest-state invariant is the dominant design force: payloads without labelled project
evidence are captured and logged, not silently decoded into authoritative device state.

---

## [DES-ARCH] Architecture and File Map

### File Map

| File                                               | Role                                     | Key exports                                                                                                                       |
| -------------------------------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `backend/src/infrastructure/midi/ble.rs`           | BLE scan/connect/write/notify/disconnect | `BleHandle`, `find_and_connect_with_log`, `scan_all_with_log`, `get_adapter_with_log`, `MIDI_IO_CHAR_UUIDS`, `MIDI_SERVICE_UUIDS` |
| `backend/src/infrastructure/midi/ble_debug.rs`     | Packet log model, hex utilities          | `BlePacketLogger`, `BlePacketLogEntry`, `BlePacketDirection`, `hex`, `char_prop_names`, `now_ms`, `characteristic_snapshot`       |
| `backend/src/infrastructure/midi/ble_decoder.rs`   | Provisional Nano packet decoder          | `NanoStateDecoder`, `DecodeResult`, `NanoStatePatch`                                                                              |
| `backend/src/infrastructure/midi/ble_inspector.rs` | GATT characteristic inspection           | `inspect_characteristics`, `BleInspectionReport`                                                                                  |
| `backend/src/infrastructure/midi/ble_sync.rs`      | State sync engine                        | `NanoSyncEngine`, `NanoSyncSnapshot`                                                                                              |
| `backend/src/infrastructure/midi/port_watchdog.rs` | USB port polling + BLE fallback          | `spawn_usb_port_watchdog`                                                                                                         |
| `backend/src/domain/nano_state.rs`                 | Normalized device state domain types     | `NanoState`, `SyncMode`, `NanoSlotState`, `NanoSlotRole`, `CapabilityMatrix`, `CapabilityStatus`                                  |
| `backend/src/bin/nano_ble_scan_probe.rs`           | Diagnostic: BLE scan only                | CLI binary                                                                                                                        |
| `backend/src/bin/nano_ble_observe_probe.rs`        | Diagnostic: BLE observe + log            | CLI binary                                                                                                                        |
| `backend/src/bin/nano_ble_preset_probe.rs`         | Diagnostic: BLE preset write probing     | CLI binary with modes                                                                                                             |
| `tools/analyze_ble_observe.py`                     | Python: notification timeline analysis   | Standalone script                                                                                                                 |
| `tools/nano_hid_probe.swift`                       | Swift: USB HID inspection                | Standalone script                                                                                                                 |

### Flow: BLE MIDI ([Flow.BleMidi])

```text
[IPC: ble_scan command]
        │
        ▼
get_adapter_with_log()          ← 5 s timeout; emits progress via emit_log
        │
        ▼
known_peripherals_with_log()    ← already-paired devices check (3 s per-device timeout)
        │ none match
        ▼
scan_all_with_log()             ← start_scan → event stream + 500 ms polls → early-exit on Nano match
        │ found
        ▼
peripheral.connect()            ← 12 s timeout; two attempts; accept if CoreBluetooth reports connected after timeout
        │
        ▼
peripheral.discover_services()  ← 8 s timeout; 300 ms settle
        │
        ▼
inspect_characteristics()       ← produces BleInspectionReport; all chars logged
        │
        ▼
select write characteristic     ← prefer c302-prefix writable; fallback: first writable
        │
        ▼
subscribe to NOTIFY/INDICATE    ← per-char 3 s timeout; best-effort (continue on failure)
        │
        ▼
spawn notification task         ← stream.next() → hex log → emit_log → BlePacketLogger.record_payload
        │                            (note: "raw notification; decode is provisional")
        ▼
return BleHandle {              ← stored in AppState.ble_peripheral
    peripheral, characteristic,
    subscribed_characteristics,
    packet_logger
}

[On send_midi over BLE]
BleHandle::send()               ← determines WriteType; logs; BlePacketLogger.record_payload(Write)

[On disconnect command]
BleHandle::disconnect()         ← unsubscribe each (1 s per-char) → p.disconnect() (5 s)

[USB port watchdog]
spawn_usb_port_watchdog()       ← 1 s poll; on USB disappear: check ble_peripheral.is_connected()
                                   → BLE: emit_connected(BLE) / no BLE: emit_disconnected
```

---

## [DES-DATA] Data Model

### `SyncMode` (enum)

| Variant                 | Meaning                                                                        |
| ----------------------- | ------------------------------------------------------------------------------ |
| `FullReadWriteSync`     | Confirmed bidirectional sync — reserved, never set by current code             |
| `WriteNotificationSync` | Commands sent + notifications partially reconcile state (BLE active)           |
| `CommandOnly`           | Commands sent; UI state is optimistic/local (USB connect or post-preset-write) |
| `DisconnectedPreview`   | No device; UI renders cached defaults                                          |

### `CapabilityStatus` (enum)

| Variant             | Meaning                                                 |
| ------------------- | ------------------------------------------------------- |
| `ConfirmedReadable` | Field value comes from verified, repeated traces        |
| `ConfirmedWritable` | Write produces confirmed, repeatable device response    |
| `Inferred`          | Plausibly decoded but not verified against ground truth |
| `Unverified`        | Unknown — no trace data yet                             |
| `Unsupported`       | Confirmed not present or not observable                 |

### `NanoSlotRole` (enum)

Eight fixed Nano Cortex signal-chain roles in hardware order:
`Gate → PreFx1 → PreFx2 → Capture → IrCab → PostFx1 → PostFx2 → PostFx3`

### `NanoSlotState` (struct)

| Field         | Type             | Purpose                                                     |
| ------------- | ---------------- | ----------------------------------------------------------- |
| `role`        | `NanoSlotRole`   | Hardware slot identity                                      |
| `loaded_name` | `Option<String>` | Effect/capture/IR name; `None` when unknown                 |
| `bypassed`    | `Option<bool>`   | Bypass state; `None` when unobserved                        |
| `active`      | `Option<bool>`   | Active state; `None` when unobserved                        |
| `confirmed`   | `bool`           | `false` = optimistic/inferred; `true` = from verified trace |

### `NanoState` (struct)

| Field                | Type                                    | Default                           | Purpose                                     |
| -------------------- | --------------------------------------- | --------------------------------- | ------------------------------------------- |
| `connection_status`  | `String`                                | `"disconnected"`                  | Human-readable connection state             |
| `sync_mode`          | `SyncMode`                              | `DisconnectedPreview`             | Current sync quality                        |
| `active_preset_slot` | `Option<u8>`                            | `None`                            | Last known active preset (0-63)             |
| `preset_name`        | `Option<String>`                        | `None`                            | Preset name; `Unverified` capability        |
| `bank`               | `Option<String>`                        | `None`                            | Bank letter (A-H), derived from preset slot |
| `capture_assignment` | `Option<String>`                        | `None`                            | Capture block assignment; `Unverified`      |
| `ir_assignment`      | `Option<String>`                        | `None`                            | IR/Cab assignment; `Unverified`             |
| `slots`              | `BTreeMap<NanoSlotRole, NanoSlotState>` | All roles; all `confirmed: false` | Fixed chain state                           |
| `expression_value`   | `Option<u8>`                            | `None`                            | Raw 0-127 expression value                  |
| `expression_percent` | `Option<u8>`                            | `None`                            | `value * 100 / 127`                         |
| `stale`              | `bool`                                  | `false`                           | `true` = state may not reflect device       |
| `provisional`        | `bool`                                  | `true`                            | `true` = BLE-derived; never authoritative   |

### `CapabilityMatrix` (struct)

| Field                | Default `CapabilityStatus`                                                                       |
| -------------------- | ------------------------------------------------------------------------------------------------ |
| `active_preset_slot` | `Inferred`                                                                                       |
| `preset_name`        | `Unverified`                                                                                     |
| `bank`               | `Inferred`                                                                                       |
| `capture_assignment` | `Unverified`                                                                                     |
| `ir_assignment`      | `Unverified`                                                                                     |
| `pre_fx_slot_1`      | `Unverified`                                                                                     |
| `pre_fx_slot_2`      | `Unverified`                                                                                     |
| `post_fx_slot_1`     | `Unverified`                                                                                     |
| `post_fx_slot_2`     | `Unverified`                                                                                     |
| `post_fx_slot_3`     | `Unverified`                                                                                     |
| `bypass_flags`       | `Inferred`                                                                                       |
| `expression_values`  | `Unverified`                                                                                     |
| `amp_knobs`          | `Unverified` (default) → `ConfirmedReadable` at runtime once `request_state_dump` decodes a dump |
| `notes`              | `["Captured BLE fields remain provisional until verified from repeated labelled traces."]`       |

**Runtime graduation (confirmed reads).** The `request_state_dump` command
(`docs/specs/120-backend-ipc/spec.md [FR-31]`) writes the state-dump request to `c304`, decodes
the `c305` reply via `ble_schema::decode_state_dump`, and — having a repeatable labeled hardware
trace ([NFR-8]) — graduates `amp_knobs`, `capture_assignment`, and `ir_assignment` to
`ConfirmedReadable`. Backed by the unit-tested parser (`ble_schema.rs`, real-packet fixture).

**Runtime graduation (confirmed writes).** The `set_amp_knob` command
(`docs/specs/120-backend-ipc/spec.md [FR-32]`) builds an amp-knob frame via
`ble_encoder::amp_knob_frame`, writes it to `c304`, and graduates `amp_knobs` to
`ConfirmedWritable`. This write path is hardware-verified: a reversible round-trip
(gain `73 → 150 → 73`) confirmed the device applies the write and echoes the new value in the next
dump. The frame builder is unit-tested (`ble_encoder.rs`) against the verified template. These two
commands are the only sanctioned paths that upgrade a `CapabilityStatus` above `Inferred`.

**Save frame (guarded destructive write).** `ble_encoder::save_preset_frame(slot, name)` builds the
preset-save frame written to `c304`:
`LEN C0 08 01 18 <slot> 2A <nameLen> <name utf-8…> 03 00 00 00`, where `LEN = nameLen + 10` and
`slot` is the 0-based preset index. The frame carries the preset name, so a device save persists
name plus live parameters into the slot (consistent with names returning in the metadata dump).
Exposed as `save_active_preset` (`120 [FR-34]`). Because the slot byte addresses which preset gets
overwritten, the frontend only exposes this as an explicit guarded device save: full USB+Bluetooth
control, a loaded preset name, dirty state, confirmation, then state/metadata refresh. The `save`
capability stays below `ConfirmedWritable` until a guided junk-slot test confirms the frame saves
the intended slot and persists across reselect/re-read ([NFR-8]).

### `DecodeResult` (struct)

| Field         | Type                     | Purpose                                 |
| ------------- | ------------------------ | --------------------------------------- |
| `recognized`  | `bool`                   | `true` only for 2-byte direct PC shape  |
| `provisional` | `bool`                   | Always `true`                           |
| `notes`       | `Vec<String>`            | Human-readable decode rationale         |
| `state_patch` | `Option<NanoStatePatch>` | Fields to apply; `None` if unrecognized |

### `NanoStatePatch` (struct)

| Field                | Type         | Purpose                                          |
| -------------------- | ------------ | ------------------------------------------------ |
| `active_preset_slot` | `Option<u8>` | Sets `active_preset_slot` and `bank`             |
| `expression_value`   | `Option<u8>` | Sets `expression_value` and `expression_percent` |

### `BlePacketLogEntry` (struct — `ble_debug.rs`)

| Field                 | Type                  | Purpose                                                                             |
| --------------------- | --------------------- | ----------------------------------------------------------------------------------- |
| `timestamp_ms`        | `u128`                | Unix epoch milliseconds                                                             |
| `direction`           | `BlePacketDirection`  | `Read`, `Write`, `Notification`, `Indication`, `Characteristic`, `Service`, `Event` |
| `device_name`         | `Option<String>`      | Device name if available                                                            |
| `service_uuid`        | `Option<String>`      | Parent service UUID                                                                 |
| `characteristic_uuid` | `Option<String>`      | Characteristic UUID                                                                 |
| `properties`          | `Option<Vec<String>>` | String-encoded property flags                                                       |
| `payload_hex`         | `Option<String>`      | Space-separated hex bytes                                                           |
| `note`                | `Option<String>`      | Decode note (e.g., "raw notification; decode is provisional")                       |

---

## [DES-BLE-CONNECT] BLE Scan and Connect

`find_and_connect_with_log` is the main entry point. It wraps the entire flow in a
`time::timeout(BLE_TOTAL_TIMEOUT, ...)` hard cap (40 s) so the UI never hangs.

**Step 1 — Adapter acquisition** (`get_adapter_with_log`):

- `Manager::new()` → `manager.adapters()`, pick first; 5 s timeout.
- Logs each adapter's `adapter_info()` for diagnostics.

**Step 2 — Known peripherals check** (`known_peripherals_with_log`):

- `adapter.peripherals()` with 3 s timeout; `p.properties()` with 1.5 s per-peripheral.
- Runs `looks_like_nano(name, uuids)`: name contains `nano`/`cortex`/`neural` OR any
  service UUID prefix-matches a known MIDI service UUID (8-char prefix match).
- If a matching peripheral is already known, skip scanning — handles already-paired devices.

**Step 3 — Active scan** (`scan_all_with_log`):

- `adapter.start_scan(ScanFilter::default())` with 3 s start timeout.
- Consumes the `CentralEvent` stream with `now_or_never()` (non-blocking poll).
- Also polls `adapter.peripherals()` every 500 ms to catch devices the event stream misses.
- Logs each device once on first property appearance, then again if properties change from empty.
- Keeps any named/service-advertising device as a scan candidate; only auto-connects if `is_nano`.
- Early-exits when a Nano match is found; calls `adapter.stop_scan()` after.

**Step 4 — Connect and discover**:

- Skips `peripheral.connect()` if already connected.
- 800 ms post-connect settle before `discover_services()`.
- 300 ms post-discovery settle before characteristic enumeration.
- Calls `inspect_characteristics()` and logs the full `BleInspectionReport`.

**Step 5 — Write characteristic selection**:

- Prefers any characteristic whose UUID 8-char prefix matches `MIDI_IO_CHAR_UUIDS` and has a writable property.
- Falls back to the first writable characteristic.
- Returns an error if no writable characteristic is found.

**Step 6 — Subscribe**:

- Iterates all NOTIFY/INDICATE characteristics with a 3 s per-characteristic subscribe timeout.
- Continues on failure (logs "FAILED (continuing anyway)"); only pushes to `subscribed_characteristics` on success.
- If any subscription succeeded, calls `peripheral.notifications()` and spawns a Tokio task.

**Notification task** (spawned, lives until stream closes):

- `stream.next().await` on the btleplug notification stream.
- Logs payload as hex; emits to the app log panel via `emit_log` at `"debug"` level.
- Records each packet in `BlePacketLogger` with `note: "raw notification; decode is provisional"`.

---

## [DES-BLE-DECODER] Provisional Packet Decoder

`NanoStateDecoder` is the mandatory boundary between raw BLE bytes and `NanoState`.
All BLE notification payloads must pass through `decode_payload` before any field is set.

**Conservative parser (current rules)**:

```
payload.len() == 2 && (payload[0] & 0xF0) == 0xC0 && payload[1] < 64
  → recognized: true, provisional: true
  → NanoStatePatch { active_preset_slot: Some(payload[1]), expression_value: None }
  → note: "Observed direct MIDI Program Change shape; treat as provisional until confirmed in BLE traces."

everything else
  → recognized: false, provisional: true
  → state_patch: None
  → note: "Unmapped Nano Cortex BLE payload; retained in debug log for trace comparison."
```

**`apply_patch`** sets fields on `NanoState` and always:

- Sets `state.provisional = true`.
- Sets `state.stale = false`.
- Sets `state.sync_mode = SyncMode::WriteNotificationSync`.
- Derives `bank` from `active_preset_slot` using `bank_for_preset` (A=slots 0-7, B=8-15, ..., H=56-63).

**Protocol stance**: The Nano Cortex BLE preset/config protocol is private. Parsers added
to this file must be backed by repeatable labeled packet traces before any `CapabilityStatus`
field is upgraded beyond `Inferred`. Adding a new rule without trace evidence is prohibited
by [NFR-8].

**Observed expression-pedal packet (labeled Capture Lab traces, 2026-07-01)**: repeated slow
and fast sweeps of two different expression pedals (Line 6, Boss) produced an identical,
repeatable notification family on `c305` (mirrored on `c306`):

| payload (hex)                         | field-4 varint | zone   |
| ------------------------------------- | -------------- | ------ |
| `C0 08 01 18 02 40 00 00 00`          | (omitted) = 0  | heel   |
| `C0 08 01 18 02 20 80 01 40 00 00 00` | 128            | center |
| `C0 08 01 18 02 20 FF 01 40 00 00 00` | 255            | toe    |

Findings: (1) the pedal transmits **only** over the proprietary BLE stream — the USB-MIDI port
emitted **zero** device→app bytes across every capture (not just expression: no knobs, no
footswitches); (2) the value is **quantized to three zones** (`0`/`128`/`255`), never
continuous, even on slow sweeps; (3) both pedals are signature-identical, so the quantization
is the device's, not the pedal's. This packet does not match the conservative 2-byte PC rule
above, so the backend `NanoStateDecoder` leaves it unrecognized — the zone decode and the
position animation are implemented frontend-side in `protocolLabDecoder.ts` (see
[DES-FRONT-DECODER] in `docs/specs/200-frontend-control-surface/design.md`). `expression_values`
therefore stays `Unverified` at the backend capability level (the backend does not decode it),
while the frontend surfaces it as a provisional heel/center/toe position.

**Per-pedal accuracy caveat (2026-07-02).** The two pedals produce the _same packet signature_ but
**do not reach the same range**: the Line 6 pedal sweeps the full heel→toe span (reports `255` at
toe), whereas the Boss pedal pressed fully down only ever reaches the **center zone (`128`, ~50%)**
and never `255`. This is a device-side analog calibration effect — the Boss pedal's pot taper /
resistance range maps into a narrower slice of the Nano Cortex's ADC — **not** a software bug and
not something the decoder can correct (there is no exposed min/max calibration in the BLE protocol
we've mapped). Practical guidance: an expression pedal must be matched to the Nano's expected
impedance/taper to reach full travel; the app faithfully reports whatever zone the device sends.

---

## [DES-BLE-CAPABILITY] Capability Matrix

`CapabilityMatrix` tracks decode confidence per NanoState field independently of the field
value itself. It is returned by the `get_ble_capabilities` IPC command and displayed in
the frontend's log/debug panel.

Rules for updating a field's status:

1. `Unverified` → `Inferred`: a plausible decode exists but has not been validated against hardware.
2. `Inferred` → `ConfirmedReadable`: repeated labeled hardware traces confirm the decode across preset changes and firmware versions.
3. `ConfirmedReadable` → `ConfirmedWritable`: write + observed device response confirmed.
4. Any field may be set to `Unsupported` when confirmed not available.

The default `CapabilityMatrix` note states: _"Captured BLE fields remain provisional until
verified from repeated labelled traces."_
This note must not be removed.

---

## [DES-BLE-PROTOCOL] Captured Command And Editor Protocol

The device exposes a command/response path on top of GATT: commands are written to
`c304`, replies stream back on `c305` as protobuf-style messages. The **byte-exact command
frames, current-state field map, and non-linear encoders are catalogued in `spec.md` → Appendix
→ "Captured Command & Field Protocol"**. This section is the design stance for adopting it.
Unverified rows stay provisional until hardware traces graduate them ([FR-19], [NFR-8]).

> **Provenance ([NFR-8], [NFR-9]).** This command/editor protocol is **adopted from the
> MIT-licensed [`nano-cortex-web-editor`](https://github.com/choldy/nano-cortex-web-editor)**,
> not independently captured by this project. We reimplement it in Rust (`ble_schema.rs`,
> `ble_encoder.rs`); the protocol knowledge originates upstream and is attributed in
> `spec.md` → Appendix → "Protocol Provenance & Attribution" and in `THIRD-PARTY-NOTICES.md`.
> What _is_ this project's own capture — the expression-pedal 3-zone decode, the event decoder,
> the transport plumbing, and the probe/analysis toolchain — is listed alongside it there so the
> two are never conflated; do not describe derived frames as this project's own reverse-engineering.

### ASCII readback/request flow

```text
Frontend action
  request_state_dump | request_metadata | request_fx_params
        │
        ▼
120 IPC command wrapper
  validates transport + records request start time
        │
        ▼
BLE handle
  write raw command frame to c304
        │
        ▼
Nano Cortex
  emits reply packets on c305/c306
        │
        ▼
notification task
  logs raw payload · emits structured packet · stores debug snapshot
        │
        ▼
request decoder
  filters packets after this request
  prefers newest complete FE segmented stream over stale C1 dumps
  strips packet headers · parses protobuf fields
        │
        ▼
normalized state
  NanoState / metadata cache / FX param values
        │
        ▼
capability gate
  values remain provisional until repeated labelled hardware traces graduate them
```

**Two distinct field namespaces — never merge them.** There are two unrelated encodings:

1. **Knob-twist EVENT packets** — real-time, one-control-per-notification telemetry emitted when
   a physical control moves. Decoded today by `protocolLabDecoder.ts` (`CONTROL_ID_BY_FIELD`,
   frontend). The `0x18 <n>` selector is a real-time control index.
2. **Full-state DUMP messages** — the device's persisted-state serialization, returned in
   response to a dump request, carrying all parameters at once. The same schema can arrive either
   as a single `C1` notification or as a segmented `FE` stream reassembled by stripping each
   packet's 2-byte header and concatenating the body bytes. Field numbers (gain=3, level=4,
   bass=5, mid=6, treble=7, …) are the _storage_ schema and are unrelated to the event indices.

The same physical knob legitimately carries different field numbers in the two message types.
Re-mapping the event decoder onto the dump schema (or vice-versa) would corrupt live-knob
decoding. The dump schema must live in its own module, separate from `CONTROL_ID_BY_FIELD`.

**Where each half lives:**

- **Dump decode → backend.** A dump response is a raw-BLE→normalized-state transform, so it
  belongs behind the `NanoStateDecoder` boundary (`ble_decoder.rs`) with the schema in a new
  module (e.g. `ble_schema.rs`), producing a `NanoStatePatch` applied via
  `NanoSyncEngine::ingest_notification`. Only then can it (per the trace-evidence rules) upgrade
  a `CapabilityMatrix` field. The frontend consumes the already-normalized `NanoSyncSnapshot`,
  not raw dump bytes.
- **Event decode → frontend.** Live knob/button/expression events stay in `protocolLabDecoder.ts`
  as the provisional log-text observer they already are.

**Write / command plumbing (the missing pieces):**

- **Retain the full characteristic set** ([FR-17]). `find_and_connect_with_log` currently keeps
  only the single preferred write characteristic; to address `c304` specifically the `BleHandle`
  must store a UUID→characteristic map.
- **Characteristic-addressable raw write.** `send_midi` writes only to `BleHandle.characteristic`
  (the `c302`/fallback target). Sending editor frames needs either a `c304`-preferring selection
  change or a new raw-write IPC that names the target characteristic and passes bytes verbatim
  (`BleHandle::send` already writes raw bytes with no MIDI framing).
- **Structured response event + reassembly** ([FR-18]). The notification task currently only
  emits a debug _string_ (`emit_log`) that the frontend scrapes. A typed event
  (`{characteristicUuid, bytes, timestampMs}`) plus a notification broadcast channel on
  `BleHandle` lets a request/response wrapper collect and reassemble multi-packet `c305` dump
  replies (strip 2-byte header per packet; debounce; parse protobuf). Request/response commands
  must scope decoding to packets received after their own write and prefer the newest complete
  segmented stream over older single-packet dumps.

**Honest-state gating.** None of the above may present confirmed capability. Write commands ship
behind the experimental flag and are labelled unverified until repeatable labelled traces
confirm the device's response; only then may the relevant `CapabilityStatus` graduate
([DES-BLE-CAPABILITY] rules, [NFR-8], [FR-19]). Cross-refs: IPC surface in
`docs/specs/120-backend-ipc/design.md [DES-IPC-COMMANDS]`; frontend decode in
`docs/specs/200-frontend-control-surface/design.md [DES-FRONT-DECODER]`.

---

## [DES-BLE-DISCONNECT] Safe Disconnect

`BleHandle::disconnect` follows an unsubscribe-first protocol:

```
for each characteristic in subscribed_characteristics:
    time::timeout(1s, peripheral.unsubscribe(ch))
    → Ok(Ok(())) : log info "unsubscribed {uuid}"
    → Ok(Err(e)) : log warn "unsubscribe {uuid} failed: {e}"
    → Err(_)     : log warn "unsubscribe {uuid} timed out"

if !peripheral.is_connected():
    return Ok(())          ← already gone, skip disconnect call

time::timeout(5s, peripheral.disconnect())
    → Ok(Ok(()))  : success
    → Ok(Err(e))  : Err("BLE disconnect failed: {e}")
    → Err(_)      : Err("BLE disconnect timed out (5s)")
```

This pattern is required on macOS/CoreBluetooth because the OS keeps a peripheral alive
if NOTIFY/INDICATE subscriptions are still active at the time `disconnect()` is called.
Skipping unsubscribe is not acceptable — it causes the peripheral to remain in a
half-connected state visible to subsequent scan attempts.

The `BleHandle` is stored as `Arc<Mutex<BtlePeripheral>>` so it can be cloned into the
IPC command layer (`AppState.ble_peripheral`) without locking the entire peripheral for
the duration of the notification task.

---

## [DES-BLE-DOMAIN] NanoSyncEngine and Port Watchdog

### NanoSyncEngine

`NanoSyncEngine` is the single owner of `NanoState` and `CapabilityMatrix` transitions.
It is not stored directly in `AppState`; callers access it through `AppState.nano_state`
(`Mutex<NanoState>`) and `AppState.ble_capabilities` (`Mutex<CapabilityMatrix>`).

| Method                             | State transition                                                                        |
| ---------------------------------- | --------------------------------------------------------------------------------------- |
| `mark_connected_command_only`      | `connection_status = "connected"`, `sync_mode = CommandOnly`, `stale = false`           |
| `mark_disconnected`                | `connection_status = "disconnected"`, `sync_mode = DisconnectedPreview`, `stale = true` |
| `optimistic_preset_change(preset)` | Calls `apply_patch` with the given preset (clamped to 63); `sync_mode = CommandOnly`    |
| `ingest_notification(payload)`     | Calls `decode_payload → apply_patch`; no direct field mutation                          |
| `snapshot()`                       | Returns `NanoSyncSnapshot { state, capabilities }` (cloned)                             |

### Port Watchdog (`spawn_usb_port_watchdog`)

Spawned as a background Tokio task on app start:

1. Sleeps 1 s.
2. Calls `port_manager::list_output_ports()`.
3. Computes `port_signature` (sorted `"id|name|direction"` strings).
4. If signature differs from last: emits `midi://ports-changed`.
5. If a USB device is currently connected and is missing from the new port list:
   - Clears `AppState.midi_input_connections`.
   - If `#[cfg(feature = "ble")]` and `ble_peripheral.is_connected()`: transitions state to BLE (`CommandOnly`); emits `midi://connected("Neural DSP Nano Cortex (BLE)")`.
   - Otherwise: transitions state to disconnected; emits `midi://disconnected`.

---

## [DES-BLE-DEBUG] Packet Logger and Inspection

### BlePacketLogger

Thread-safe packet capture buffer (`Arc<Mutex<Vec<BlePacketLogEntry>>>`). Max 2 000 entries;
FIFO eviction when exceeded.

**Enabled only when `NANO_BLE_DEBUG=1`** (environment variable, any of `1/true/TRUE/yes/YES`).
When disabled, `record_characteristic` still records metadata (no payload); `record_payload`
is a no-op outside the notification task (the notification task always records because that is
the primary capture surface).

Entry types recorded by `ble.rs`:

- `Characteristic` — on GATT discovery for each characteristic.
- `Read` — on initial characteristic read (debug mode only, with timeout).
- `Write` — on each `BleHandle::send()` call.
- `Notification` — on each notification received in the background task.

### BleInspectionReport

Produced by `ble_inspector::inspect_characteristics()` after `discover_services()`.
Segregates characteristics into `readable_characteristics`, `writable_characteristics`,
and `notifying_characteristics` by property flags. Does not assume any Nano-specific schema.
Logged to the app log panel on every BLE connect.

---

## [DES-DEC] Key Decisions

| Decision                 | Choice                                                   | Rationale                                                                                                                                               |
| ------------------------ | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BLE library              | `btleplug 0.11` behind `ble` Cargo feature               | Cross-platform GATT access for macOS/Windows. Linux BLE remains feature-gated off for this app.                                                         |
| UUID matching strategy   | 8-char prefix match for service and characteristic UUIDs | Nano Cortex advertises Nordic-style UUIDs (`0000a002-...`), not SIG-adopted ones (`03b80e5a-...`); both must match; prefix match handles variant forms. |
| Protocol stance          | Conservative parser; all payloads provisional            | Guessing packet meanings risks presenting wrong state as truth (violates NFR-8).                                                                        |
| Notification decode gate | `NanoStateDecoder` is mandatory boundary                 | Ensures provisional flag and capability metadata always accompany decoded values; raw bytes never touch NanoState directly.                             |
| Disconnect protocol      | Unsubscribe-first, then disconnect (per-step timeouts)   | CoreBluetooth keeps peripherals alive if subscriptions remain active; 1 s per-char + 5 s disconnect prevents UI hang.                                   |
| Packet logger gating     | `NANO_BLE_DEBUG=1` env var                               | Avoids log noise in normal use; characteristic snapshots always recorded for diagnostics.                                                               |
| Known peripherals check  | Before active scan                                       | Already-paired Nano Cortex does not always re-advertise; checking known peripherals first avoids a full scan delay on reconnect.                        |
| Scan early-exit          | Break on first Nano match                                | Reduces connect latency; full scan still runs if no match in known peripherals.                                                                         |
| `BLE_TOTAL_TIMEOUT`      | 40 s                                                     | Covers worst-case: adapter init + known-peripherals + scan + two connect attempts + discover + subscribe; prevents UI deadlock on slow/absent BLE.      |

---

## [DES-ERR] Error Handling

| Scenario                                            | Handling                                                                                                                           |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| No BLE adapter found                                | `get_adapter_with_log` returns `Err("No BLE adapter")`; emits log error; `ble_scan` IPC returns error string.                      |
| Adapter check times out (5 s)                       | `Err("BLE adapter check timed out (5s)")`                                                                                          |
| `start_scan` times out (3 s)                        | Calls `stop_scan()`; returns `Err("start_scan timed out (3s)")`                                                                    |
| Nano Cortex not found in known/scan                 | `Err("Nano Cortex not found over BLE. If it is already paired, keep it awake and try again; otherwise enter pairing mode.")`       |
| `peripheral.connect()` times out (12 s per attempt) | Retries once; if CoreBluetooth reports connected after a timeout, continue; otherwise returns `Err("BLE connect timed out (12s)")` |
| `discover_services()` times out (8 s)               | `Err("Service discovery timed out (8s)")`                                                                                          |
| No writable characteristic found                    | `Err("No writable MIDI characteristic found. Available: [uuids]")`                                                                 |
| Subscribe fails                                     | Log warn "FAILED (continuing anyway)"; characteristic not added to `subscribed_characteristics`; BLE still returns a `BleHandle`.  |
| Write fails                                         | `Err("BLE write failed: {btleplug error}")`; caller (IPC `send_midi`) surfaces this as an IPC error.                               |
| Write times out                                     | Handled by `btleplug` internal path; currently no per-write timeout in `BleHandle::send`.                                          |
| Unsubscribe times out (1 s per char)                | Log warn; continue to next characteristic; does not abort disconnect.                                                              |
| Disconnect times out (5 s)                          | `Err("BLE disconnect timed out (5s)")`                                                                                             |
| Entire connect flow times out (40 s)                | `Err("BLE operation timed out after 40s. Try again or restart the app.")`                                                          |
| BLE notification parse fails                        | `decode_payload` returns `recognized: false`; payload retained in log; no state mutation.                                          |
| USB port watchdog poll fails                        | Logs warn; continues polling; does not emit a spurious disconnect.                                                                 |

---

## [DES-TEST] Testing

### Unit Tests (cargo test)

- `NanoStateDecoder::decode_payload` — table-driven tests covering: 2-byte PC (recognized/provisional), 1-byte payloads (not recognized), 4-byte BLE-MIDI framed payloads (not recognized), empty payload (not recognized).
- `apply_patch` — verify `bank_for_preset` mapping for slots 0, 7, 8, 55, 56, 63; verify `sync_mode` transition to `WriteNotificationSync`; verify `provisional = true` always set.
- `CapabilityMatrix::default` — assert all fields are `Inferred` or `Unverified`; assert `notes` non-empty.
- `NanoState::default` — assert `provisional = true`, `sync_mode = DisconnectedPreview`, all slot `confirmed = false`.
- `looks_like_nano` — table-driven: "Nano Cortex", "NEURAL DSP", "cortex", unknown name with Nano service UUID prefix, unknown name with unknown UUID (should not match).
- `port_signature` — assert sort order is stable regardless of input order.
- `NanoSyncEngine` — state machine transitions: connected → optimistic preset → notification ingest → disconnected.

### Mock-Adapter Integration Tests (pending)

- Simulate btleplug `Peripheral` + `Characteristic` to exercise scan → connect → subscribe → notification → unsubscribe → disconnect flow.
- Verify `BleHandle::disconnect` calls `unsubscribe` before `p.disconnect()`.
- Verify `BlePacketLogger` FIFO eviction at 2 001 entries.

### Hardware Manual Matrix (macOS and Windows only)

| Step                                       | Expected result                                                                                      |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| App BLE scan with Nano in Bluetooth mode   | Nano Cortex discovered; log shows `is_nano=true`                                                     |
| BLE connect                                | `BleHandle` returned; write characteristic selected (c302 prefix); `c305`/`c306` subscribed          |
| Send PC#0 over BLE                         | Device may switch preset; app log shows write hex                                                    |
| Receive notification after hardware action | Notification hex appears in app log; no fictitious editor claim                                      |
| BLE disconnect                             | Log shows unsubscribe for each char then disconnect; BLE peripheral not visible in next scan attempt |
| USB disconnect while BLE connected         | Watchdog transitions to BLE `CommandOnly`; `midi://connected(BLE)` emitted                           |

### Diagnostic Probes

- `nano_ble_scan_probe` — verifies scan discovers Nano; logs to `logs/ble-scan-probe.log`.
- `nano_ble_observe_probe [duration]` — connects, observes notifications for `duration` seconds, logs all `Notification` packets to `logs/ble-observe-probe.log`.
- `nano_ble_preset_probe [preset] [--mode all|raw|sequential|ble-midi]` — sends PC bytes in multiple formats; captures notifications; logs to `logs/ble-preset-probe.log`.
- `analyze_ble_observe.py` — post-processes `logs/ble-observe-probe.log`; prints unique payload histogram and timeline.
- `nano_hid_probe.swift` — opens Nano by HID VID/PID; polls input reports for `duration` seconds; logs to `logs/hid-probe.log`.
