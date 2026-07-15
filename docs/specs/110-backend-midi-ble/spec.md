---
afx: true
type: SPEC
status: Living
owner: "@richard-sentino"
version: "1.2"
created_at: "2026-06-10T11:54:35.000Z"
updated_at: "2026-07-15T12:50:49.000Z"
tags: ["110-backend-midi-ble", "ble", "btleplug", "provisional-protocol", "nano-state", "gatt"]
---

# 110 Backend MIDI BLE — Spec

> BLE GATT transport, raw packet capture, provisional Nano Cortex state decoding,
> capability matrix, and NanoState domain model. Captured device-state payloads are
> firmware-specific and must stay provisional until this project has repeatable
> labelled hardware evidence. This is the defining constraint of this zone.

## References

- **001-overview spec**: [`../001-overview/spec.md`](../001-overview/spec.md) — traceability rules, routing index
- **001-overview design**: [`../001-overview/design.md`](../001-overview/design.md) — `[Flow.BleMidi]` system context
- **100-backend-midi-usb**: [`../100-backend-midi-usb/spec.md`](../100-backend-midi-usb/spec.md) — sibling USB transport zone (documented MIDI)
- **120-backend-ipc**: [`../120-backend-ipc/spec.md`](../120-backend-ipc/spec.md) — IPC command/event contracts that surface BLE state
- **Archived sprint brief** (history only; do not link `@see` to it): `../archive/01-deskop-nano-cortex.md`

---

## Problem Statement

The Nano Cortex exposes a BLE GATT interface used by this app for device observation,
metadata, state dumps, and selected verified writes. The implementation keeps the GATT
layer explicit: characteristic discovery works, the primary MIDI write path (`c302`)
accepts MIDI bytes, and the command/state path uses `c304` writes with `c305`/`c306`
notifications. Any payload field that is not backed by labelled hardware traces stays
provisional.

The zone must satisfy two conflicting forces:

1. **Connectivity** — BLE scan, connect, subscribe, write, and disconnect must work
   reliably on macOS and Windows (Linux BLE is off; the `ble` Cargo feature gates all BLE
   code).
2. **Honest state** — Every decoded value derived from BLE notifications is provisional.
   The UI must never display BLE-derived state as confirmed device truth. Capability flags,
   `NanoState.provisional`, and `SyncMode` encode this epistemic boundary in data, not just
   in comments.

---

## Requirements

### Functional Requirements

| ID    | Requirement                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Priority    |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| FR-1  | BLE scan: acquire a `btleplug` adapter, emit progress to the app log, scan for Nano Cortex by name (`nano`/`cortex`/`neural`) OR by known service UUIDs, early-exit on first match.                                                                                                                                                                                                                                                                                 | Must Have   |
| FR-2  | BLE connect: check already-known peripherals first, then scan; connect with bounded retries (12 s connect timeout per attempt, two attempts), then discover services with an 8 s timeout; wrap the entire flow in a 40 s hard cap (`BLE_TOTAL_TIMEOUT`).                                                                                                                                                                                                            | Must Have   |
| FR-3  | Characteristic discovery: call `discover_services()`, enumerate characteristics, log all discovered UUIDs and properties, select the preferred writable characteristic (UUID prefix `c302`; fallback: first writable).                                                                                                                                                                                                                                              | Must Have   |
| FR-4  | Subscribe to all NOTIFY/INDICATE characteristics; spawn a background task that logs every notification payload as hex; record each packet in `BlePacketLogger` with direction, UUID, timestamp, and a note that the decode is provisional.                                                                                                                                                                                                                          | Must Have   |
| FR-5  | Write MIDI bytes over BLE: use `WriteType::WithoutResponse` when the characteristic supports it; fall back to `WriteType::WithResponse`. Log the write and record it in the packet logger. Every write (`BleHandle::send` and `write_to_char`) is bounded by a 3 s timeout so a stale/dropped connection surfaces an error instead of hanging.                                                                                                                      | Must Have   |
| FR-6  | Safe disconnect: unsubscribe each subscribed characteristic (1 s per-characteristic timeout, log warn on timeout), then disconnect (5 s timeout), skipping if already disconnected.                                                                                                                                                                                                                                                                                 | Must Have   |
| FR-7  | `BlePacketLogger` must be gated behind `NANO_BLE_DEBUG=1`; when disabled, characteristic snapshots still record metadata but payload capture is skipped. The logger caps at 2 000 entries (FIFO eviction).                                                                                                                                                                                                                                                          | Must Have   |
| FR-8  | `BleInspectionReport` must be produced for every GATT connect: list service UUIDs, all characteristic UUIDs with properties, and segregated readable/writable/notifying lists.                                                                                                                                                                                                                                                                                      | Must Have   |
| FR-9  | `NanoStateDecoder::decode_payload` must apply a conservative parser: only recognize a direct 2-byte MIDI Program Change shape (`0xCn`, `0-63`); everything else is `recognized: false`. All `DecodeResult` must carry `provisional: true`.                                                                                                                                                                                                                          | Must Have   |
| FR-10 | `CapabilityMatrix` must document per-field decode confidence (`ConfirmedReadable`, `ConfirmedWritable`, `Inferred`, `Unverified`, `Unsupported`) and carry a note stating that captured BLE fields remain provisional until verified. Default matrix must start every field at `Inferred` or `Unverified`.                                                                                                                                                          | Must Have   |
| FR-11 | `NanoSyncEngine` must own all state transitions: `mark_connected_command_only`, `mark_disconnected`, `optimistic_preset_change`, `ingest_notification`. Raw BLE packets must never directly write to UI-facing `NanoState`.                                                                                                                                                                                                                                         | Must Have   |
| FR-12 | `port_watchdog` must poll USB ports at 1 s intervals; on USB disconnect, fall back to BLE if still connected; emit `midi://connected` or `midi://disconnected` accordingly.                                                                                                                                                                                                                                                                                         | Must Have   |
| FR-13 | Diagnostic binaries (`nano_ble_scan_probe`, `nano_ble_observe_probe`, `nano_ble_preset_probe`, `nano_ble_command_probe`) must compile behind the `ble` feature, write timestamped logs to `logs/`, and disconnect cleanly after each run. `nano_ble_command_probe` writes an arbitrary `--frame` to the (default `c304`) write characteristic and logs `c305`/`c306` replies captured after the write — the verification tool for [DES-BLE-PROTOCOL].               | Should Have |
| FR-14 | `nano_ble_preset_probe` must support four send modes (`raw`, `sequential`, `ble-midi`, `all`), a `--sequence` of preset indices, `--char` UUID filter, `--all-writable` flag, configurable MIDI channel, and configurable settle time.                                                                                                                                                                                                                              | Should Have |
| FR-15 | `analyze_ble_observe.py` must parse `logs/ble-observe-probe.log`, filter `c305` notifications, deduplicate payloads by count, and emit a timeline with inter-event deltas and 4-byte-skip pair analysis.                                                                                                                                                                                                                                                            | Should Have |
| FR-16 | `nano_hid_probe.swift` must open the Nano Cortex by vendor ID `5418` / product ID `35047` via `IOHIDManager`, register input-report and value callbacks, poll report IDs 1 and 2, and write structured results to `logs/hid-probe.log`.                                                                                                                                                                                                                             | Should Have |
| FR-17 | The BLE handle must retain the full discovered characteristic set (UUID → characteristic map), not only the single preferred write characteristic, so specific characteristics (e.g. the `c304` write target, `c305` notify) can be addressed by later commands. See [DES-BLE-PROTOCOL].                                                                                                                                                                            | Should Have |
| FR-18 | Inbound `c305`/`c306` notifications must be emitted as a **structured event** (characteristic UUID, raw bytes, timestamp) in addition to the provisional debug-string log, so responses can be decoded and multi-packet dump replies reassembled without scraping log text. Metadata decoding must scan top-level protobuf records only, preserve preset slot order, and treat blank/internal identifier-like names as blank display names. See [DES-BLE-PROTOCOL]. | Should Have |
| FR-19 | The captured command/field protocol (Appendix, [DES-BLE-PROTOCOL]) remains bound by [NFR-8]: no write command may be surfaced in the UI as confirmed behaviour, and no dump-decoded field may upgrade a `CapabilityStatus`, until confirmed by this project's repeatable labelled hardware traces.                                                                                                                                                                  | Should Have |
| FR-20 | `ble_schema::decode_state_dump` must parse current-state dump fields 48-52 into typed FX model IDs for pre1/pre2/post1/post2/post3 and parse gate state from field 54 when present. Parsers must preserve raw ID bytes and tolerate both observed protobuf encodings for model IDs (varint value bytes and length-delimited bytes) before mapping to app model IDs.                                                                                                 | Should Have |
| FR-21 | `ble_encoder` must expose byte-exact frame builders for the Rust-port deep editor path: FX model select, FX float parameter write, FX block bypass, gate bypass/reduction, capture slot/volume, cab/IR slot, cab/IR float params, cab mic/position, and post-write refresh requests. Unit tests must assert exact bytes from [DES-BLE-PROTOCOL].                                                                                                                    | Should Have |
| FR-22 | FX/cab parameter refresh decoders must parse single-packet `c305` replies (`C0 08 06 22 <len> <float32...>` for FX params; cab/IR param blob for level/HPF/LPF/mic/position) without scraping frontend log strings. Values remain provisional until hardware traces graduate their capability fields.                                                                                                                                                               | Should Have |

### Non-Functional Requirements

| ID    | Requirement                                                                                                                                                                                                                                                                                                                                 | Target                                        |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| NFR-1 | BLE adapter check must not block the UI for more than 5 s; all BLE I/O runs in `tauri::async_runtime`.                                                                                                                                                                                                                                      | 5 s adapter timeout; 40 s connect hard cap    |
| NFR-2 | The `ble` Cargo feature must be the sole compile guard; no BLE code path executes without it.                                                                                                                                                                                                                                               | Enforced by `#[cfg(feature = "ble")]`         |
| NFR-3 | All BLE log output uses the `"ble"` tracing target so it can be filtered independently of USB MIDI logs.                                                                                                                                                                                                                                    | `tracing::info!(target: "ble", ...)`          |
| NFR-4 | Notification packets recorded in `BlePacketLogger` must include a note: `"raw notification; decode is provisional"`.                                                                                                                                                                                                                        | Enforced in `ble.rs` notification handler     |
| NFR-5 | `NanoState.provisional` must be `true` by default and remain true after any BLE-notification-derived patch.                                                                                                                                                                                                                                 | Default value in `NanoState::default()`       |
| NFR-6 | `SyncMode` must be `DisconnectedPreview` on init/disconnect and `CommandOnly` after connect until a BLE notification reconciles state. No field must ever be set to `FullReadWriteSync` without verified traces.                                                                                                                            | Invariant in `NanoSyncEngine`                 |
| NFR-7 | `BleHandle::disconnect` must call `unsubscribe` before `disconnect` on every platform; skipping unsubscribe is not acceptable (CoreBluetooth keeps peripheral alive otherwise).                                                                                                                                                             | Verified on macOS hardware                    |
| NFR-8 | **Honest state**: no BLE-derived field may be displayed in the UI as authoritative without a verified trace and an explicit `CapabilityStatus::ConfirmedReadable` or `ConfirmedWritable` entry. This is the primary NFR of this zone.                                                                                                       | UI + code review gate                         |
| NFR-9 | **Third-party attribution**: any BLE protocol material derived from a third-party project must be attributed at its point of use and recorded in `THIRD-PARTY-NOTICES.md` with the upstream licence. Specs must identify derived protocol material as derived, not as original capture. See [Appendix → Protocol Provenance & Attribution]. | Docs + `THIRD-PARTY-NOTICES.md` + review gate |

---

## Acceptance Criteria

- [ ] `cargo check --manifest-path backend/Cargo.toml --features ble` passes.
- [ ] `cargo build --manifest-path backend/Cargo.toml --features ble --bin nano_ble_scan_probe` passes.
- [ ] `cargo build --manifest-path backend/Cargo.toml --features ble --bin nano_ble_observe_probe` passes.
- [ ] `cargo build --manifest-path backend/Cargo.toml --features ble --bin nano_ble_preset_probe` passes.
- [ ] BLE scan discovers a Nano Cortex on macOS by name match or service UUID match and logs found devices.
- [ ] BLE connect selects the `c302`-prefixed writable characteristic (or first writable fallback) and logs the chosen UUID.
- [ ] BLE subscribe succeeds on at least the `c305`/`c306` characteristics; notification payloads appear in the app log as hex.
- [ ] BLE disconnect calls `unsubscribe` on each subscribed characteristic before calling `p.disconnect()`, with per-characteristic 1 s timeouts.
- [ ] `BleInspectionReport` is produced after GATT discovery and includes all discovered characteristic UUIDs.
- [ ] `NanoStateDecoder::decode_payload` returns `provisional: true` for every payload, including the 2-byte PC shortcut.
- [ ] `CapabilityMatrix::default()` has no field set to `ConfirmedReadable` or `ConfirmedWritable`; at most `Inferred` for `active_preset_slot` and `bank`.
- [ ] `NanoState::default()` has `provisional: true`, `sync_mode: DisconnectedPreview`, and all slot `confirmed: false`.
- [ ] `port_watchdog` detects USB disconnect and transitions state to BLE (if BLE handle present) or full disconnect.
- [ ] BLE decoder stays permanently labeled provisional in code and spec; no path sets a field to `ConfirmedReadable` without verified traces.
- [ ] `analyze_ble_observe.py` produces a timeline and unique-payload table when given a valid probe log.

---

## Non-Goals

- Treating full preset editing, parameter editing, capture management, or IR loading over BLE as confirmed behaviour before this project has labelled hardware traces for each command family. Every adopted frame stays provisional until verification graduates it.
- Treating Nano Cortex BLE notification payloads as stable across firmware without proof.
- Presenting any BLE-decoded field as authoritative device state; all decoded values are provisional until verified from repeated labelled traces.
- BLE on Linux — the `ble` Cargo feature is intentionally off in the recommended Linux build.
- SysEx, raw HID MIDI, or any protocol channel other than GATT write/notify over `btleplug`.

---

## Dependencies

| Dependency                  | Role                                                                  | Notes                                                             |
| --------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `btleplug = "0.11"`         | Cross-platform BLE GATT                                               | Optional, behind `ble` Cargo feature                              |
| `uuid = "1"`                | UUID type for characteristic matching                                 | Optional, behind `ble` Cargo feature                              |
| `tokio`                     | Async runtime for all BLE I/O                                         | Runtime provided by Tauri                                         |
| `futures`                   | `StreamExt`/`FutureExt` for notification streams and scan event loop  |                                                                   |
| `tauri::Runtime`            | Generic bound for `AppHandle` used to emit log events                 |                                                                   |
| `ble` Cargo feature         | Compile gate for all BLE code paths                                   | `backend/Cargo.toml`                                              |
| macOS Bluetooth permission  | `NSBluetoothAlwaysUsageDescription` in `backend/Info.plist`           | Required by macOS before BLE scan/connect can prompt the user     |
| macOS Bluetooth entitlement | `com.apple.security.device.bluetooth` in `backend/entitlements.plist` | Required by signed macOS bundles that use Bluetooth               |
| Zone 100 (`port_manager`)   | USB port list used by `port_watchdog`                                 | `port_watchdog.rs` depends on `port_manager::list_output_ports()` |
| Zone 120 (`ipc::events`)    | `emit_log`, `emit_connected`, `emit_disconnected`                     | BLE progress log forwarded to frontend                            |

---

## Appendix

### Protocol Provenance & Attribution

Per [NFR-9], this zone's BLE knowledge has two origins: the **live device→app telemetry**
(expression-pedal, control-event, and FX-readback decode) was reverse-engineered by this project
from its own `c305`/`c306` hardware captures, while the **outbound command/write frames and
encoder constants** were adopted from the MIT-licensed
[`nano-cortex-web-editor`](https://github.com/choldy/nano-cortex-web-editor). Full attribution and
the adopted-vs-original list live in the authoritative record:
**[`THIRD-PARTY-NOTICES.md`](../../../THIRD-PARTY-NOTICES.md)**.

### Capture & Analysis Methodology & Tools

How this project captures and analyses BLE traffic — the reproducible harness behind every
"observed" claim in this zone. (Adopted command frames were **not** discovered by this
harness; they came from the web editor and are cross-checked against these captures.)

**1. Live capture (`NANO_BLE_DEBUG=1`).** With the env var set, the notification task records
every `c305`/`c306` payload into `BlePacketLogger` (hex, direction, UUID, timestamp, note
`"raw notification; decode is provisional"`; 2 000-entry FIFO). This is the in-app capture path.

**2. Standalone probes (behind the `ble` feature).** Each writes a timestamped log to `logs/`
and disconnects cleanly:

| Probe                    | Command                                                                  | Captures                                                                                                             |
| ------------------------ | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `nano_ble_scan_probe`    | `cargo run --features ble --bin nano_ble_scan_probe`                     | Adapter + advertisement discovery → `logs/ble-scan-probe.log`                                                        |
| `nano_ble_observe_probe` | `cargo run --features ble --bin nano_ble_observe_probe -- 60`            | All notifications for N seconds → `logs/ble-observe-probe.log`                                                       |
| `nano_ble_preset_probe`  | `cargo run --features ble --bin nano_ble_preset_probe -- <p> --mode all` | PC in raw/sequential/ble-midi forms; captures replies                                                                |
| `nano_ble_command_probe` | `cargo run --features ble --bin nano_ble_command_probe -- --frame <hex>` | Writes an arbitrary frame to `c304`, logs `c305`/`c306` replies — the verification tool for adopted frames ([FR-13]) |
| `nano_hid_probe.swift`   | `swift tools/nano_hid_probe.swift`                                       | USB-HID cross-check (VID 5418 / PID 35047) → `logs/hid-probe.log`                                                    |

**3. Offline analysis (`tools/analyze_ble_observe.py`).** Parses `logs/ble-observe-probe.log`,
filters `c305`, deduplicates payloads by count, and emits a timeline with inter-event deltas and
the 4-byte-skip pair analysis used to spot structure ([FR-15]).

**4. Labelled hardware method (how a row graduates, [NFR-8]).** A stimulus is applied on the
device (e.g. slow + fast expression sweeps, a knob turned to a known value), captured with a
probe, correlated to the payload, and only marked confirmed when the mapping is **repeatable
across sessions**. The expression-pedal decode ([DES-BLE-DECODER]) and the `set_amp_knob`
round-trip (gain `73 → 150 → 73`) were established this way. Adopted-but-unverified frames stay
provisional until they pass this same bar — adoption is a hypothesis, a repeatable trace is proof.

### Known BLE UUIDs and Captured Traces

The following UUIDs and trace observations are sourced from the journal
(`docs/specs/archive/journal.md`, discussion DNC-D001, notes N9 and DNC-P005) and the
as-built code. They are **provisional and subject to silent firmware change**.

#### Service UUIDs

| UUID                                   | Description                                                     |
| -------------------------------------- | --------------------------------------------------------------- |
| `0000a002-0000-1000-8000-00805f9b34fb` | Nano Cortex primary service (Nordic-style, observed in journal) |
| `03b80e5a-ede8-4b33-a751-6ce34ec4c700` | Bluetooth-SIG BLE-MIDI service UUID (standard fallback)         |
| `7772e5db-3868-4112-a1a9-f2669d106bf3` | BLE-MIDI I/O characteristic UUID also used as service fallback  |
| `00cb7a5b-bf06-470a-b9b8-1c5d2c7e7b00` | Vendor-specific service UUID (observed fallback in code)        |

#### Characteristic UUIDs

| UUID                                   | Properties                     | Role                                                                                                    |
| -------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `0000c302-0000-1000-8000-00805f9b34fb` | WRITE / WRITE_WITHOUT_RESPONSE | Preferred MIDI write characteristic (current app write target)                                          |
| `0000c304-0000-1000-8000-00805f9b34fb` | WRITE                          | Command/editor write target for dump requests, knob frames, FX readback requests, and gated save frames |
| `0000c305-0000-1000-8000-00805f9b34fb` | NOTIFY                         | Primary notification / command-response stream (analyzed by `analyze_ble_observe.py`)                   |
| `0000c306-0000-1000-8000-00805f9b34fb` | INDICATE                       | Duplicate/secondary indication stream                                                                   |
| `7772e5db-3868-4112-a1a9-f2669d106bf3` | WRITE / NOTIFY                 | Standard BLE-MIDI I/O characteristic (SIG-adopted)                                                      |

> The current app selects `c302` (or the first writable characteristic) as its single write
> target. The captured command/editor protocol ([DES-BLE-PROTOCOL], Appendix) instead
> writes to **`c304`** and reads replies on **`c305`** — targeting `c304` specifically requires
> retaining the full characteristic set (FR-17). Selected request / amp-knob frames already use
> this path; save and deep-editor command families remain unverified until they graduate through
> labeled hardware traces (`110 [NFR-8]`).

#### Captured Notification Shape (provisional)

Based on `analyze_ble_observe.py` internals: notifications arrive on `c305` (and
duplicated on `c306`). The script skips the first 4 bytes and interprets the remaining
bytes as 2-byte pairs for pattern analysis. No stable payload schema has been confirmed.

The `NanoStateDecoder` recognizes a 2-byte direct Program Change shape
(`[0xCn, program]`, `program < 64`) as a provisional preset indicator. All other payloads
return `recognized: false`. This conservative stance must not be relaxed without verified
labeled traces.

### Captured Command & Field Protocol (provisional until verified)

**Provenance.** The frames, field numbers, and encoders in this subsection are derived from a
third-party project (`nano-cortex-web-editor`, MIT), not independently captured here. Attribution
and the derived-vs-original split are recorded in `THIRD-PARTY-NOTICES.md` and
[Appendix → Protocol Provenance & Attribution] ([NFR-9]).

> **Verification warning.** No `CapabilityStatus` field may be upgraded on the strength of this
> table alone — per [NFR-8], graduation requires this project's own repeatable labelled traces.
> Treat every unverified row as a hypothesis to verify against hardware, not confirmed behaviour.

**Channel roles (write/editor path).** Commands are written to **`c304`** (write); the device
replies on **`c305`** (notify), the same stream our event decoder observes. Frame convention:
`byte[0]` = length prefix (`payload.length − 2`), `byte[1]` = `0xC0`, and each frame ends with a
`<tag> 00 00 00` footer where the pre-zero **tag byte is command-specific** (e.g. `1A` amp/knob,
`1F` bypass, `63` FX float, `88` FX model, `1C` slot-select, `5E` cab/IR, `03` SAVE — see the
per-command layouts below). `<v…>` = little-endian base-128 varint; `<f32>` = little-endian
IEEE-754 float32.

#### State-dump request commands (→ `c304`)

| Purpose                                      | Exact bytes (hex)                           |
| -------------------------------------------- | ------------------------------------------- |
| Metadata dump (preset/capture/IR name lists) | `06 C0 08 03 01 00 00 00`                   |
| Current-preset-state dump                    | `0C C0 08 03 18 01 20 01 28 01 01 00 00 00` |
| Post-save state refresh                      | `0C C0 08 03 18 00 20 01 28 01 01 00 00 00` |
| Preset-change acknowledgement (after app PC) | `06 C0 20 01 1E 00 00 00`                   |

**Multi-packet response reassembly (`c305`):** a stream packet is detected when `data[0]` ∈
{`FE`,`FD`,`CE`,`D0`} (or, in metadata/current mode, `data[1] & 0x80 == 0x80`), `len ≥ 3`.
Reassembly appends `data.slice(2)` of each packet (drops the 2-byte header), then parses the
concatenation as a protobuf message after a debounce (~600 ms current-state, ~1500 ms metadata).
Preset-change acks (`10 C0 …`) and single-packet FX/cab-param replies are handled separately.

#### Current-state message field map (protobuf; `tag = field<<3 | wire`)

| Field | Meaning                                                                                                                                                                                                                   | Wire              |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| 3     | Amp **Gain** (raw 0-255)                                                                                                                                                                                                  | varint            |
| 4     | Amp **Level**                                                                                                                                                                                                             | varint            |
| 5     | Amp **Bass**                                                                                                                                                                                                              | varint            |
| 6     | Amp **Mid**                                                                                                                                                                                                               | varint            |
| 7     | Amp **Treble**                                                                                                                                                                                                            | varint            |
| 11    | **Capture rotary position within the current bank** (0 = bypassed; 1-5 = position, NOT the absolute 1-25 slot — hardware-observed: selecting slot 25 reports 5). Absolute identity comes from field 32 (capture name/id). | varint            |
| 12    | **Cab/IR on** flag                                                                                                                                                                                                        | varint (presence) |
| 31    | **FX bypass bytes** — 5-byte array `[pre1,pre2,post1,post2,post3]`, `0x00` = ON, non-zero = bypassed                                                                                                                      | length-delimited  |
| 32    | **Capture** submsg `{1:enabled, 2:name, 3:id}`                                                                                                                                                                            | length-delimited  |
| 33    | **IR** submsg `{1:enabled, 2:shortName, 3:fullName}`                                                                                                                                                                      | length-delimited  |
| 44    | **Capture volume** (raw 0-255 → dB, non-linear)                                                                                                                                                                           | varint            |
| 48-52 | **FX model IDs** for pre1/pre2/post1/post2/post3 (raw ID bytes or varint value bytes)                                                                                                                                     | varint or bytes   |
| 54    | **Gate on** flag (inverted: `on = !field54`)                                                                                                                                                                              | varint            |

> **Namespace warning — do not conflate with the event decoder.** The field numbers above
> belong to the **full-state DUMP** message (the device's persisted-state serialization). They
> are a _different namespace_ from the real-time **knob-twist EVENT** selectors that
> `protocolLabDecoder.ts` (`CONTROL_ID_BY_FIELD`) decodes, where the same physical knob can carry
> a different index. Mapping one onto the other would break live-knob decoding. See
> [DES-BLE-PROTOCOL] and `docs/specs/200-frontend-control-surface/design.md [DES-FRONT-DECODER]`.
>
> **Model-ID encoding caution.** The protocol table originally described fields 48-52 as
> length-delimited raw bytes, but captured current-state dumps also encode those fields as protobuf
> varints. A safe Rust port must normalize either representation to a comparable raw-id byte vector
> before mapping to the app catalogue.

**Metadata message:** field `17` = captures[], `18` = presets[] (64), `19` = IRs[] (5). Records:
capture `{1:id, 2:name, 4:creator, 10:instrument}`; preset `{1:name, 7:captureName, 8:captureID,
9:irShort, 10:irFull}`; IR `{1:short, 3:full}`.

#### Write-command byte layouts (→ `c304`)

| Command                | Layout                                                                                                                                                                                                                                                                            |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Set amp knob           | `LEN C0 18 <id> 20 <value v> 28 00 1A 00 00 00` — id: gain=0, level=1, bass=2, mid=3, treble=4; value `clamp(0,255)`                                                                                                                                                              |
| Toggle FX-block bypass | `0A C0 08 01 18 <enableSlot> 20 <0=on/1=off> 1F 00 00 00` — enableSlot: pre1=4…post3=8                                                                                                                                                                                            |
| Toggle gate bypass     | `0A C0 08 01 18 09 20 <0=on/1=off> 1F 00 00 00`                                                                                                                                                                                                                                   |
| Switch preset          | Web-MIDI PC `[C0, preset-1]`, then `06 C0 20 01 1E 00 00 00`, then current-state request                                                                                                                                                                                          |
| **SAVE** preset        | `LEN C0 08 01 18 <preset-1> 2A <nameLen> <utf8 name…> 03 00 00 00` (LEN = nameLen+10), then post-save refresh                                                                                                                                                                     |
| Set FX float param     | `0F C0 08 01 18 <modelSlot> 20 <paramIndex> 2D <f32 normalized> 63 00 00 00` — modelSlot: pre1=0…post3=4                                                                                                                                                                          |
| Set FX model           | `LEN C0 18 <modelSlot> 20 <id bytes…> 88 00 00 00` (LEN = 7+id.length)                                                                                                                                                                                                            |
| Set capture volume     | `LEN C0 18 0A 20 <raw v> 28 00 1A 00 00 00` — raw = `captureDbToRaw(clamp(db,-24,12))`                                                                                                                                                                                            |
| Set gate reduction     | `LEN C0 18 0B 20 <(pct+108) v> 28 00 1A 00 00 00` — pct 0-100                                                                                                                                                                                                                     |
| Select capture slot    | `08 C0 18 04 20 <slot-1> 1C 00 00 00` — zero-based index, full 1-25 range. Bypass: `08 C0 18 01 20 00 1C 00 00 00`. The `18 01` selector must not be used for selection: it only resolves low slots and leaves the capture silent for slots >= 16 (hardware-observed 2026-07-16). |
| Select cab/IR slot     | `08 C0 18 03 20 <slot> 1C 00 00 00`                                                                                                                                                                                                                                               |
| Cab/IR float param     | `09 C0 <paramId> <f32 norm> 5E 00 00 00` — paramId: level=0x2D, HPF=0x35, LPF=0x3D                                                                                                                                                                                                |

#### Non-linear encoders (exact math)

- **Capture volume** (dB↔raw, knee at raw 128): `db≤0 → raw = round((db+24)/24·128)`;
  `db>0 → raw = round(128 + db/12·127)`. Inverse: `raw≤128 → db = raw/128·24 − 24`;
  `raw>128 → db = (raw−128)/127·12`. (raw 0 = −24 dB, 128 = 0 dB, 255 = +12 dB.)
- **Gate reduction:** wire value = `clamp(round(pct),0,100) + 108` (range 108-208).
- **Cab/IR level** (dB↔normalized, pivot `0.66212219`): `db≤0 → n = (db+96)/96·0.66212219`;
  `db>0 → n = 0.66212219 + db/12·(1−0.66212219)`. Range params (HPF/LPF): linear
  `n = (v−min)/(max−min)`.
- **Amp knobs are linear** raw 0-255 (`percent = round(raw/255·100)`) — no transform. Our
  existing `expression_percent = value·100/127` and knob `percent = raw·100/255` math is
  consistent with this.

#### FX-param float32 protocol (per block)

- **Read/refresh:** request `08 C0 08 03 18 <refreshSlot> 89 00 00 00`; single-packet reply
  `… C0 08 06 22 <len> <float32-LE array…>` decoded as normalized 0-1 params.
- **Write:** the `Set FX float param` layout above (`2D` fixed32 tag, `63 00 00 00` footer).
- Physical range/unit/enum meaning of each normalized param is defined by a per-model metadata
  table (range: `{min,max,step,unit,decimals}`; enum: option list) — a large but portable
  dataset to reimplement for full FX editing.

### Agent Entry Map

| Task                          | Start here                        | Owned files                                              | Commands                                                      |
| ----------------------------- | --------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------- |
| Fix BLE disconnect            | `design.md [DES-BLE-DISCONNECT]`  | `ble.rs::BleHandle::disconnect`                          | `cargo check --features ble`                                  |
| Improve scan reliability      | `design.md [DES-BLE-CONNECT]`     | `ble.rs::find_and_connect_with_log`, `scan_all_with_log` | `cargo run --features ble --bin nano_ble_scan_probe`          |
| Add provisional decoder rule  | `design.md [DES-BLE-DECODER]`     | `ble_decoder.rs::NanoStateDecoder::decode_payload`       | Read `NFR-8`, verify `DecodeResult.provisional = true`        |
| Upgrade a capability status   | `design.md [DES-BLE-CAPABILITY]`  | `nano_state.rs::CapabilityMatrix`                        | Requires verified labeled traces first                        |
| Add packet log field          | `design.md [DES-BLE-DEBUG]`       | `ble_debug.rs::BlePacketLogEntry`                        | `cargo check --features ble`                                  |
| Port deep editor protocol     | Appendix [DES-BLE-PROTOCOL]       | `ble_schema.rs`, `ble_encoder.rs`, `nano_state.rs`       | Byte-exact unit tests, then hardware log tail                 |
| Fix watchdog false-disconnect | `design.md [DES-BLE-DOMAIN]`      | `port_watchdog.rs`                                       | Check `port_signature` diff logic                             |
| Run a BLE observe session     | Diagnostic probes summary (below) | `nano_ble_observe_probe.rs`                              | `cargo run --features ble --bin nano_ble_observe_probe -- 60` |
| Analyze captured packets      | `tools/analyze_ble_observe.py`    | `logs/ble-observe-probe.log`                             | `python3 tools/analyze_ble_observe.py`                        |
