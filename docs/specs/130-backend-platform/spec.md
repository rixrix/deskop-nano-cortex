---
afx: true
type: SPEC
status: Living
owner: "@richard-sentino"
version: "1.0"
created_at: "2026-06-10T11:54:35.000Z"
updated_at: "2026-07-04T10:19:30.000Z"
tags: ["platform", "tray", "shortcuts", "settings", "footswitch", "tauri", "backend"]
---

# 130 Backend Platform — Spec

> Platform integration and Tauri shell. Owns the system tray, global keyboard shortcuts,
> persistent settings via `tauri-plugin-store`, the footswitch assignment/live-access domain
> model, the Settings domain type, plugin registration and command wiring in `lib.rs`,
> window configuration and bundle targets in `tauri.conf.json`, and the capability allowlist.

## References

- **Architecture overview**: [`../001-overview/spec.md`](../001-overview/spec.md) — traceability rules, routing index, glossary
- **System flow map**: [`../001-overview/design.md`](../001-overview/design.md) — `[Flow.Platform]`
- **IPC bridge (consumer of platform state)**: [`../120-backend-ipc/spec.md`](../120-backend-ipc/spec.md)
- **USB MIDI zone**: [`../100-backend-midi-usb/spec.md`](../100-backend-midi-usb/spec.md) — port watchdog spawned from `lib.rs`
- **Tauri plugin store**: <https://v2.tauri.app/plugin/store/>
- **Tauri plugin global-shortcut**: <https://v2.tauri.app/plugin/global-shortcut/>
- **Tauri capabilities model**: <https://v2.tauri.app/security/capabilities/>

---

## Problem Statement

The Desktop Nano Cortex app needs host-OS integration beyond the MIDI and IPC layers: a
system tray that survives window hide/close, global keyboard shortcuts that work when the
window is unfocused (essential for live performance), persistent settings that survive
restarts (last device, last preset, window geometry), and a runtime capability allowlist that
locks down the Tauri webview to only the permissions the app actually uses.

In addition, the app's footswitch UX models the hardware's two-footswitch preset-operation
behavior (4-preset and 2-preset modes, A/B subslot assignment, global-bypass affordance)
as a domain type — not as unverified MIDI footswitch-press commands. That domain type
lives here alongside the Settings type because both are pure value objects owned by this zone.

This zone also owns the Tauri shell entry points: `lib.rs` (plugin registration, `setup`
closure, `invoke_handler`, `on_window_event`) and `main.rs` (binary entry), and the Tauri
configuration files (`tauri.conf.json`, `capabilities/default.json`).

---

## Requirements

### Functional Requirements

| ID    | Requirement                                                                                                                                                                                                                                                                                                                                      | Priority    |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------- |
| FR-1  | System tray icon is created on app launch with a fixed tooltip "Unofficial Nano Cortex".                                                                                                                                                                                                                                                         | Must Have   |
| FR-2  | Tray menu supports three actions: Show (reveals the main window), Hide (hides the main window), Quit (calls `app.exit(0)`).                                                                                                                                                                                                                      | Must Have   |
| FR-3  | Tray tooltip updates to reflect connection state: "Nano Cortex — Connected (<device>)" when connected, "Nano Cortex — Disconnected" otherwise.                                                                                                                                                                                                   | Should Have |
| FR-4  | Global keyboard shortcuts are registered on launch: digit keys `1`–`9` (map to preset indices 0–8) and `ArrowLeft` / `ArrowRight` (previous/next preset).                                                                                                                                                                                        | Must Have   |
| FR-5  | Shortcuts are registered without modifier keys via `tauri-plugin-global-shortcut` so they fire even when the window is unfocused.                                                                                                                                                                                                                | Must Have   |
| FR-6  | Settings are loaded from the Tauri store on `setup` and written to `AppState`; load failure is logged as a warning, not a crash.                                                                                                                                                                                                                 | Must Have   |
| FR-7  | On window `CloseRequested`, window geometry (`x`, `y`, `width`, `height`) is captured from `outer_position` / `outer_size` and persisted to the store.                                                                                                                                                                                           | Must Have   |
| FR-8  | `Settings` carries: `last_device_name: Option<String>`, `last_preset: Option<u8>`, `window_x/y/w/h: Option<i32>`. Default `window_w/h` is 800×600; all others are `None`.                                                                                                                                                                        | Must Have   |
| FR-9  | `NanoCortexFootswitchState` models: `preset_operation_mode` (4-preset or 2-preset), two footswitch structs (`FootswitchState` / `FootswitchIIState`) with subslot assignment, active subslot, and long-press action.                                                                                                                             | Must Have   |
| FR-10 | `FootswitchIIState` includes a `global_bypass_enabled: bool` field absent from `FootswitchState`.                                                                                                                                                                                                                                                | Must Have   |
| FR-11 | `NanoCortexFootswitchState::default()` initializes 4-preset mode: FS-I A=0, B=1, tap-tempo; FS-II A=2, B=3, tuner, bypass off.                                                                                                                                                                                                                   | Must Have   |
| FR-12 | `FootswitchEvent` is a tagged enum covering `FootswitchPressed`, `OperationModeChanged`, `PresetAssigned`, and `GlobalBypassToggled`.                                                                                                                                                                                                            | Must Have   |
| FR-13 | `lib.rs` registers all Tauri plugins in `Builder::default()`: `tauri_plugin_shell`, `tauri_plugin_global_shortcut`, `tauri_plugin_store`, `tauri_plugin_notification`.                                                                                                                                                                           | Must Have   |
| FR-14 | `lib.rs` wires all IPC command handlers via `invoke_handler(tauri::generate_handler![...])` including `trace_marker`, `export_settings_json`, `import_settings_json`, `list_ports`, `connect`, `disconnect`, `send_midi`, `get_state`, `get_device_name`, `get_nano_state`, `get_ble_capabilities`, `get_ble_debug_log`, `ble_scan`, `ble_ping`. | Must Have   |
| FR-15 | `tauri.conf.json` sets `productName`, `identifier`, window defaults (1360×900, min 860×640, resizable), and bundle targets `"all"` (dmg/msi/deb/appimage).                                                                                                                                                                                       | Must Have   |
| FR-16 | `capabilities/default.json` grants the `main` window: `core:default`, `core:event:default`, `shell:default`, `global-shortcut:default`, `store:default`, `notification:default`, and declares the six `midi://*` events.                                                                                                                         | Must Have   |
| FR-17 | `main.rs` is a thin binary entry: sets `windows_subsystem = "windows"` in release builds and calls `desktop_nano_cortex_lib::run()`.                                                                                                                                                                                                             | Must Have   |

### Non-Functional Requirements

| ID    | Requirement                                                                                                                                                               | Target                  |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| NFR-1 | Tray creation failure must not crash the app; the error is silently dropped in the `setup` closure.                                                                       | Architectural invariant |
| NFR-2 | Shortcut registration failure is logged as a warning, not a panic; the app continues without shortcuts.                                                                   | Architectural invariant |
| NFR-3 | Settings load/save use `serde_json` defaults (`unwrap_or_default`) so a missing or corrupted store does not crash the app.                                                | Defensive invariant     |
| NFR-4 | Domain types (`Settings`, `NanoCortexFootswitchState` and all sub-types) are pure value objects: no I/O, no `Arc`/`Mutex`, all `Clone + Serialize + Deserialize + Debug`. | Code invariant          |
| NFR-5 | Geometry persistence runs inside a `tauri::async_runtime::spawn` block on the `CloseRequested` event so it does not block the OS event loop.                              | Architectural invariant |

---

## Acceptance Criteria

- [x] `platform::tray::create_tray()` builds a `TrayIcon` with tooltip "Unofficial Nano Cortex" and three menu items (Show/Hide/Quit).
- [x] `platform::tray::update_tray_connection()` updates the tooltip to the connected or disconnected string.
- [x] `platform::shortcuts::register_shortcuts()` registers 11 shortcuts (1–9, ArrowLeft, ArrowRight) without modifiers.
- [x] `platform::settings_store::load_settings()` deserializes a `Settings` from the store; returns `Settings::default()` when the key is absent.
- [x] `platform::settings_store::save_settings()` serializes and writes `Settings` under key `"settings"` and calls `store.save()`.
- [x] `Settings::default()` has `window_w: Some(800)`, `window_h: Some(600)`, all other fields `None`.
- [x] `NanoCortexFootswitchState::default()` satisfies FR-11.
- [x] All footswitch enums serialise with `serde(rename_all = "kebab-case")` or explicit renames.
- [x] `lib.rs` `setup` closure loads settings, creates tray, registers shortcuts, and spawns the USB port watchdog in that order.
- [x] `lib.rs` `on_window_event` persists geometry asynchronously on `CloseRequested`.
- [x] `tauri.conf.json` window config matches FR-15 (size, min-size, resizable, not fullscreen).
- [x] `capabilities/default.json` lists all six `midi://*` events and all six permission strings.
- [ ] Tray icon dynamically reflects connection state (tooltip updates wired to `AppState` change — scaffolded but not yet wired to a live state observer).
- [ ] Global shortcut handler emits a `midi://hotkey` event or invokes `switchPreset` (shortcut registration is wired; the per-shortcut handler body is not yet connected to MIDI send).
- [ ] Settings `last_device_name` is used on launch for auto-reconnect (loaded but not yet passed to an auto-connect call on startup).
- [ ] Settings `last_preset` is written on each preset change (field defined; no write-on-change hook exists yet).

---

## Non-Goals

- MIDI send/receive (owned by zones `100-backend-midi-usb` and `110-backend-midi-ble`).
- Tauri IPC command implementations (owned by `120-backend-ipc`); this zone owns plugin registration only.
- App-level `AppState` struct definition (owned by `120-backend-ipc` / `app/state.rs`).
- Code signing configuration (deferred to `500-ci-release`).
- Auto-update plugin registration (deferred to v0.2).
- Literal MIDI footswitch-press commands; `FootswitchEvent` models assignment changes, not hardware switch presses.
- Notification plugin usage (registered but not yet invoked).

---

## Dependencies

- `tauri = "2"` with `tray-icon` feature — tray builder and icon update API.
- `tauri-plugin-global-shortcut = "2"` — `GlobalShortcutExt`, `Shortcut`, `Code`, `Modifiers`.
- `tauri-plugin-store = "2"` — `StoreExt`, `store.get/set/save`.
- `tauri-plugin-shell = "2"` — registered in `lib.rs`; no direct platform use.
- `tauri-plugin-notification = "2"` — registered in `lib.rs`; no direct platform use yet.
- `serde` + `serde_json` — domain type serialization and store value round-trips.
- Consuming zone: `120-backend-ipc` reads `Settings` and `NanoCortexFootswitchState` from `AppState`.
- Spawning zone: `lib.rs` calls `infrastructure::midi::port_watchdog::spawn_usb_port_watchdog` (owned by `110-backend-midi-ble`).

---

## Appendix

### Agent Entry Map

| Owned file                               | Local anchors                  | Key functions / types                                                                                                                                                                                                                                                  | Implementation status                                                                                         | Out of scope                                             |
| ---------------------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `backend/src/platform/tray.rs`           | [FR-1] [FR-2] [FR-3]           | `create_tray`, `update_tray_connection`                                                                                                                                                                                                                                | `create_tray` fully implemented; `update_tray_connection` implemented but not wired to a live state observer  | State-reflecting icon image (only tooltip changes today) |
| `backend/src/platform/shortcuts.rs`      | [FR-4] [FR-5]                  | `register_shortcuts`                                                                                                                                                                                                                                                   | Registration loop fully implemented; per-shortcut event/MIDI handler body not connected                       | Modifier keys, shortcut conflict UI                      |
| `backend/src/platform/settings_store.rs` | [FR-6] [FR-7] [FR-8]           | `load_settings`, `save_settings`                                                                                                                                                                                                                                       | Both functions fully implemented; geometry save wired via `on_window_event`; auto-reconnect on load not wired | Settings UI, export/import beyond JSON                   |
| `backend/src/platform/mod.rs`            | —                              | `pub mod` declarations                                                                                                                                                                                                                                                 | Complete (3 sub-modules)                                                                                      | —                                                        |
| `backend/src/domain/footswitch.rs`       | [FR-9] [FR-10] [FR-11] [FR-12] | `NanoCortexFootswitchState`, `FootswitchState`, `FootswitchIIState`, `FootswitchEvent`, `PresetOperationMode`, `FootswitchId`, `FootswitchSubslot`, `QuickPresetSlot`, `FootswitchPressRole`, `FootswitchLongPressAction`, `RotaryEncoderRole`, `RotaryEncoderMapping` | Fully implemented as domain value objects; not yet consumed by IPC commands                                   | Literal MIDI footswitch press, BLE footswitch sync       |
| `backend/src/domain/settings.rs`         | [FR-8]                         | `Settings` struct, `Settings::default`                                                                                                                                                                                                                                 | Fully implemented                                                                                             | Encrypted settings, cloud sync                           |
| `backend/src/lib.rs`                     | [FR-13] [FR-14]                | `run()`, plugin registration, `setup` closure, `invoke_handler`, `on_window_event`                                                                                                                                                                                     | Fully implemented                                                                                             | Plugin-level configuration beyond registration           |
| `backend/src/main.rs`                    | [FR-17]                        | `main()`                                                                                                                                                                                                                                                               | Fully implemented (3 lines)                                                                                   | —                                                        |
| `backend/tauri.conf.json`                | [FR-15]                        | Window config, bundle targets, identifier                                                                                                                                                                                                                              | Fully implemented; CSP is `null` (should be tightened)                                                        | Code signing fields, auto-update config                  |
| `backend/capabilities/default.json`      | [FR-16]                        | Capability identifier, permission list, event allowlist                                                                                                                                                                                                                | Fully implemented                                                                                             | Per-command capability scoping                           |
