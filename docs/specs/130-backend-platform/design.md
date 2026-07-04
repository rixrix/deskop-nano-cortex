---
afx: true
type: DESIGN
status: Living
owner: "@richard-sentino"
version: "1.0"
created_at: "2026-06-10T11:54:35.000Z"
updated_at: "2026-06-13T08:56:32.000Z"
tags: ["platform", "tray", "shortcuts", "settings", "footswitch", "tauri", "backend"]
spec: spec.md
---

# 130 Backend Platform — Design

## [DES-PLAT-OVR] Overview

The platform zone is the Tauri shell layer. It owns everything that integrates the app
with the host OS surface (tray, shortcuts, persistent store) and the pure domain types
that live in this concern (footswitch assignment model, settings). It also owns the two
entry-point files (`lib.rs`, `main.rs`) and the two Tauri configuration files
(`tauri.conf.json`, `capabilities/default.json`).

No MIDI I/O and no IPC command logic lives here. The platform modules return plain
`Result` values or silently drop failures; the `lib.rs` `setup` closure orchestrates them
in sequence. The domain types are pure value objects — no `Arc`, no `Mutex`, no async.

Flow map anchor from the overview: `[Flow.Platform]`.

---

## [DES-PLAT-SHELL] Tauri Shell

### Entry Points

**`backend/src/main.rs`** — three lines. Sets `windows_subsystem = "windows"` in release
builds to suppress the Windows console window, then delegates to `desktop_nano_cortex_lib::run()`.
No logic lives here.

**`backend/src/lib.rs`** — `pub fn run()`. Configures `tracing_subscriber` (env-filter, defaults
to `info`), constructs `AppState::new()`, calls `tauri::Builder::default()` and chains:

1. Plugin registration (four plugins, in order).
2. `.manage(app_state.clone())` — injects shared state into the Tauri DI container.
3. `.setup(|app| { … })` — runs synchronously before the first window opens.
4. `.invoke_handler(tauri::generate_handler![…])` — wires all 14 command handlers.
5. `.on_window_event(|window, event| { … })` — persists geometry on `CloseRequested`.
6. `.run(tauri::generate_context!())` — blocks until exit.

### Setup Closure Sequence

```text
setup(app) {
  1. load_settings(app.handle())        → writes AppState.settings (blocking_lock)
  2. create_tray(app.handle())          → builds TrayIcon; result is dropped (no further reference needed)
  3. register_shortcuts(app.handle())   → registers 11 global key bindings; failure → warn log
  4. spawn_usb_port_watchdog(handle, state) → starts the USB hotplug poll thread (zone 100/110)
}
```

Step 1 fails gracefully: a `warn` log, settings stay at `Default`. Steps 2–4 fail gracefully:
`warn` or silent `ok()`. The `setup` closure always returns `Ok(())`.

### `on_window_event` — Geometry Persistence

On `CloseRequested`, `lib.rs` captures `window.outer_position()` and `window.outer_size()`
synchronously (both return `Result`), then spawns an async task that locks `AppState.settings`
and calls `save_settings`. The spawn is fire-and-forget; a save failure is not surfaced to
the user. Window close is not intercepted — the OS proceeds normally.

### Plugin Registration Order

```rust
tauri::Builder::default()
    .plugin(tauri_plugin_shell::init())
    .plugin(tauri_plugin_global_shortcut::Builder::new().build())
    .plugin(tauri_plugin_store::Builder::new().build())
    .plugin(tauri_plugin_notification::init())
```

`tauri_plugin_notification` is registered but has no callers in the current codebase.

### Command Handler Wiring

All 14 commands are registered in a single `invoke_handler` macro call:

| Command                | Zone | Purpose                  |
| ---------------------- | ---- | ------------------------ |
| `trace_marker`         | 120  | Debug / tracing          |
| `export_settings_json` | 120  | Export settings          |
| `import_settings_json` | 120  | Import settings          |
| `list_ports`           | 120  | USB/BLE port enumeration |
| `connect`              | 120  | Device connect           |
| `disconnect`           | 120  | Device disconnect        |
| `send_midi`            | 120  | Raw MIDI send            |
| `get_state`            | 120  | Device state query       |
| `get_device_name`      | 120  | Device name query        |
| `get_nano_state`       | 120  | Normalized Nano state    |
| `get_ble_capabilities` | 120  | BLE capability matrix    |
| `get_ble_debug_log`    | 120  | BLE packet log snapshot  |
| `ble_scan`             | 120  | BLE scan/connect         |
| `ble_ping`             | 120  | BLE adapter ping         |

The implementations live in `backend/src/ipc/commands.rs` (zone 120); `lib.rs` only wires them.

---

## [DES-PLAT-TRAY] System Tray

### Implementation State

`create_tray` is **fully implemented**. `update_tray_connection` is **implemented but not wired**
to a live state observer — it must be called explicitly from a location that observes `AppState`
connection transitions; no such caller exists in the current codebase.

### `create_tray<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<TrayIcon<R>>`

Builds a `TrayIcon` via `TrayIconBuilder::new()` with:

- `.tooltip("Unofficial Nano Cortex")` — fixed initial tooltip.
- `.on_menu_event(|app, event| …)` — three arms: `"show"` → `window.show()`, `"hide"` →
  `window.hide()`, `"quit"` → `app.exit(0)`.

No icon image is set (uses OS default). The builder does not attach a `Menu` object
explicitly — the three `on_menu_event` arms are wired by event ID string rather than a
structured `Menu`. As a result, the tray icon currently has no visible right-click menu
entries beyond what the OS provides; adding a `Menu` object is a future task.

### `update_tray_connection<R: Runtime>(tray: &TrayIcon<R>, connected: bool, device_name: Option<&str>)`

Formats a tooltip string and calls `tray.set_tooltip(Some(&tip)).ok()`. The `.ok()` drop
silences errors (e.g., when the tray has already been destroyed). The function does not
change the icon image because no state-specific icon assets are registered.

---

## [DES-PLAT-SHORTCUTS] Global Keyboard Shortcuts

### Implementation State

`register_shortcuts` is **fully implemented** at the registration level. The per-shortcut
callback body is **not connected** — shortcut fires are silently ignored because the current
registration loop calls `global_shortcut.register(shortcut)` without attaching an event
handler. The IPC event or command that would translate the keypress into a MIDI send has not
been written.

### `register_shortcuts(app: &AppHandle) -> Result<(), String>`

Defines an array of 11 `(Code, &str)` pairs:

| Code         | Logical ID      | Mapped preset index |
| ------------ | --------------- | ------------------- |
| `Digit1`     | `"preset-0"`    | 0                   |
| `Digit2`     | `"preset-1"`    | 1                   |
| `Digit3`     | `"preset-2"`    | 2                   |
| `Digit4`     | `"preset-3"`    | 3                   |
| `Digit5`     | `"preset-4"`    | 4                   |
| `Digit6`     | `"preset-5"`    | 5                   |
| `Digit7`     | `"preset-6"`    | 6                   |
| `Digit8`     | `"preset-7"`    | 7                   |
| `Digit9`     | `"preset-8"`    | 8                   |
| `ArrowLeft`  | `"preset-prev"` | — (relative)        |
| `ArrowRight` | `"preset-next"` | — (relative)        |

Each shortcut is constructed as `Shortcut::new(Some(Modifiers::empty()), code)` — no
modifier key. The `_id` string is currently unused because the handler is not attached.
Registration failures are silently dropped (`let _ = global_shortcut.register(shortcut)`).

---

## [DES-PLAT-SETTINGS] Persistent Settings

### Implementation State

Both `load_settings` and `save_settings` are **fully implemented**. Geometry persistence
is **wired** via the `on_window_event` hook in `lib.rs`. Auto-reconnect on load
(`last_device_name`) and write-on-change for `last_preset` are **not yet wired**.

### Store Layout

| Store file      | Key          | Value type                           |
| --------------- | ------------ | ------------------------------------ |
| `settings.json` | `"settings"` | JSON object — full `Settings` struct |

The store file is created in the Tauri app-data directory (platform-specific:
`~/Library/Application Support/<identifier>/` on macOS, `%APPDATA%/<identifier>/` on Windows).

### `load_settings(app: &AppHandle) -> Result<Settings, String>`

1. Opens the store via `app.store(STORE_FILE)`.
2. Calls `store.get("settings")` → `Option<serde_json::Value>`.
3. Deserializes via `serde_json::from_value(value.unwrap_or(json!({})))`, falling back to
   `Settings::default()` on deserialization failure.

### `save_settings(app: &AppHandle, settings: &Settings) -> Result<(), String>`

1. Opens the store.
2. Serializes `settings` to a `serde_json::Value`.
3. Calls `store.set("settings", value)`.
4. Calls `store.save()` — flushes to disk.

---

## [DES-PLAT-FOOTSWITCH] Footswitch Domain Model

### Design Rationale

The Nano Cortex has two physical footswitches with a rotary encoder on each. The hardware
supports two preset-operation modes (4-preset and 2-preset) that affect how the A/B subslot
assignment maps to presets. No documented MIDI command exists to programmatically press a
footswitch. The domain model represents the **assignment and live-access state** only — not
hardware switch presses. `FootswitchEvent` covers UI-level assignment changes sent back to
the device state model.

### Type Field Tables

**`PresetOperationMode`** (`kebab-case`):

| Variant      | JSON            | Hardware behavior                                  |
| ------------ | --------------- | -------------------------------------------------- |
| `FourPreset` | `"four-preset"` | Each footswitch covers two presets via A/B subslot |
| `TwoPreset`  | `"two-preset"`  | Each footswitch covers one preset; A/B unused      |

**`FootswitchId`**:

| Variant | JSON   | Hardware label   |
| ------- | ------ | ---------------- |
| `I`     | `"I"`  | Left footswitch  |
| `II`    | `"II"` | Right footswitch |

**`FootswitchSubslot`**:

| Variant | JSON  | Description                |
| ------- | ----- | -------------------------- |
| `A`     | `"A"` | First subslot (primary)    |
| `B`     | `"B"` | Second subslot (alternate) |

**`QuickPresetSlot`**:

| Variant | JSON    | Footswitch / subslot mapping |
| ------- | ------- | ---------------------------- |
| `IA`    | `"IA"`  | Footswitch I, subslot A      |
| `IB`    | `"IB"`  | Footswitch I, subslot B      |
| `IIA`   | `"IIA"` | Footswitch II, subslot A     |
| `IIB`   | `"IIB"` | Footswitch II, subslot B     |

**`FootswitchPressRole`** (`kebab-case`):

| Variant        | JSON              | Short-press behavior                 |
| -------------- | ----------------- | ------------------------------------ |
| `PresetToggle` | `"preset-toggle"` | Toggle A/B subslot (switches preset) |
| `GlobalBypass` | `"global-bypass"` | Engage / disengage global bypass     |

**`FootswitchLongPressAction`** (`kebab-case`):

| Variant    | JSON          | Long-press behavior  |
| ---------- | ------------- | -------------------- |
| `TapTempo` | `"tap-tempo"` | Sends tap-tempo CC42 |
| `Tuner`    | `"tuner"`     | Toggles tuner CC43   |

**`RotaryEncoderRole`** (`kebab-case`):

| Variant         | JSON               | Rotary behavior               |
| --------------- | ------------------ | ----------------------------- |
| `CaptureScroll` | `"capture-scroll"` | Scrolls through capture slots |
| `IrScroll`      | `"ir-scroll"`      | Scrolls through IR/cab slots  |

**`FootswitchState`** (Footswitch I):

| Field                | Type                        | Description                         |
| -------------------- | --------------------------- | ----------------------------------- |
| `role`               | `FootswitchPressRole`       | Short-press role                    |
| `current_assigned_a` | `u8`                        | PC index 0–63 assigned to subslot A |
| `current_assigned_b` | `u8`                        | PC index 0–63 assigned to subslot B |
| `active_subslot`     | `FootswitchSubslot`         | Which subslot is currently active   |
| `long_press_action`  | `FootswitchLongPressAction` | Long-press role                     |

**`FootswitchIIState`** (Footswitch II, extends FootswitchState fields):

| Field                   | Type                        | Description                               |
| ----------------------- | --------------------------- | ----------------------------------------- |
| `role`                  | `FootswitchPressRole`       | Short-press role                          |
| `current_assigned_a`    | `u8`                        | PC index 0–63 assigned to subslot A       |
| `current_assigned_b`    | `u8`                        | PC index 0–63 assigned to subslot B       |
| `active_subslot`        | `FootswitchSubslot`         | Which subslot is currently active         |
| `long_press_action`     | `FootswitchLongPressAction` | Long-press role                           |
| `global_bypass_enabled` | `bool`                      | Whether global bypass is currently active |

**`NanoCortexFootswitchState`**:

| Field                   | Type                  | Description            |
| ----------------------- | --------------------- | ---------------------- |
| `preset_operation_mode` | `PresetOperationMode` | Hardware mode          |
| `footswitch_i`          | `FootswitchState`     | Left footswitch state  |
| `footswitch_ii`         | `FootswitchIIState`   | Right footswitch state |

**`FootswitchEvent`** (tagged with `#[serde(tag = "type")]`):

| Variant                | JSON `type`                | Fields                                | Description                                          |
| ---------------------- | -------------------------- | ------------------------------------- | ---------------------------------------------------- |
| `FootswitchPressed`    | `"footswitch-pressed"`     | `footswitch: FootswitchId`            | Footswitch was pressed (UI event, not hardware MIDI) |
| `OperationModeChanged` | `"operation-mode-changed"` | `mode: PresetOperationMode`           | User changed 4-preset/2-preset mode                  |
| `PresetAssigned`       | `"preset-assigned"`        | `slot: QuickPresetSlot`, `preset: u8` | User assigned a PC index to a quick-access slot      |
| `GlobalBypassToggled`  | `"global-bypass-toggled"`  | `enabled: bool`                       | Global bypass state changed                          |

**`RotaryEncoderMapping`**:

| Field        | Type                | Description                |
| ------------ | ------------------- | -------------------------- |
| `footswitch` | `FootswitchId`      | Which footswitch's encoder |
| `role`       | `RotaryEncoderRole` | What the encoder controls  |

### Default State (`NanoCortexFootswitchState::default()`)

```text
preset_operation_mode: FourPreset
footswitch_i:
  role:                PresetToggle
  current_assigned_a:  0   (preset 1)
  current_assigned_b:  1   (preset 2)
  active_subslot:      A
  long_press_action:   TapTempo
footswitch_ii:
  role:                PresetToggle
  current_assigned_a:  2   (preset 3)
  current_assigned_b:  3   (preset 4)
  active_subslot:      A
  long_press_action:   Tuner
  global_bypass_enabled: false
```

---

## [DES-PLAT-DEC] Key Decisions

| Decision                                                       | Choice                                                | Rationale                                                                                                                                                                                                                                                     |
| -------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tray creation failures are silently dropped                    | `let _ = tray;` in `setup`                            | Tray unavailability (e.g., no system tray on a headless Linux session) must not crash the app; tray is a non-essential comfort feature.                                                                                                                       |
| No `Menu` object attached to the tray                          | Event-ID string dispatch in `on_menu_event`           | Tauri 2.x `TrayIconBuilder` allows event-ID dispatch without a structured `Menu`; deferring structured `Menu` avoids complexity while the tray feature is scaffolded. The three actions (Show/Hide/Quit) still work via the OS-level tray icon click handler. |
| Shortcut registration uses `Modifiers::empty()`                | No modifier keys                                      | Live performance: musicians must hit a bare digit or arrow key without holding Alt/Ctrl. Conflict with other apps is a known trade-off documented in spec [NFR-2].                                                                                            |
| Shortcut handler not yet connected                             | Registration separated from handling                  | Allows the shortcut registration infrastructure to be landed and tested independently before the MIDI send path is wired. Marked as scaffolded in acceptance criteria.                                                                                        |
| Settings stored as a single JSON key `"settings"`              | `store.set("settings", full_struct)`                  | Simple; the `Settings` struct is small and infrequently written. Granular per-key storage would complicate the `Default`-merge logic with no material benefit.                                                                                                |
| Geometry written on `CloseRequested` only                      | Not on every resize/move                              | Resize/move events fire continuously; writing on every event would hammer the store. On-close write captures the final geometry, which is the only value that matters for the next launch.                                                                    |
| `FootswitchState` and `FootswitchIIState` are separate structs | Not a single struct with an `Option<bool>` for bypass | `FootswitchIIState` has a semantic role difference (only FS-II has global-bypass affordance). Separate types make the hardware asymmetry explicit in the type system.                                                                                         |
| CSP is `null` in `tauri.conf.json`                             | Permissive for development                            | CSP `null` means the OS WebView's default policy applies — acceptable during active development. Must be tightened to `"default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:;"` before shipping.                                        |

---

## [DES-PLAT-ARCH] Architecture: File Map

```text
backend/
├── tauri.conf.json                         — Tauri 2 shell config [FR-15]
├── capabilities/default.json               — Tauri 2 capability allowlist [FR-16]
├── entitlements.plist                      — macOS sandbox entitlements (bundle config)
└── src/
    ├── main.rs                             — binary entry [FR-17]
    ├── lib.rs                              — tauri::Builder, plugins, commands, events [FR-13] [FR-14]
    ├── platform/
    │   ├── mod.rs                          — pub mod re-exports
    │   ├── tray.rs                         — create_tray, update_tray_connection [FR-1] [FR-2] [FR-3]
    │   ├── shortcuts.rs                    — register_shortcuts [FR-4] [FR-5]
    │   └── settings_store.rs               — load_settings, save_settings [FR-6] [FR-7]
    └── domain/
        ├── footswitch.rs                   — NanoCortexFootswitchState + all sub-types [FR-9–12]
        └── settings.rs                     — Settings struct + Default [FR-8]
```

---

## Appendix: Agent Entry Map

| Owned file                               | Design anchor(s)      | Key functions / types                                                                                 | Status                                                                     |
| ---------------------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `backend/src/platform/tray.rs`           | [DES-PLAT-TRAY]       | `create_tray`, `update_tray_connection`                                                               | `create_tray` implemented; `update_tray_connection` implemented, not wired |
| `backend/src/platform/shortcuts.rs`      | [DES-PLAT-SHORTCUTS]  | `register_shortcuts`                                                                                  | Registration implemented; handler body not connected                       |
| `backend/src/platform/settings_store.rs` | [DES-PLAT-SETTINGS]   | `load_settings`, `save_settings`                                                                      | Both implemented; auto-reconnect and last-preset write not wired           |
| `backend/src/platform/mod.rs`            | [DES-PLAT-SHELL]      | `pub mod` declarations                                                                                | Complete                                                                   |
| `backend/src/domain/footswitch.rs`       | [DES-PLAT-FOOTSWITCH] | `NanoCortexFootswitchState`, `FootswitchState`, `FootswitchIIState`, `FootswitchEvent`, all sub-enums | Fully implemented as domain value objects                                  |
| `backend/src/domain/settings.rs`         | [DES-PLAT-SETTINGS]   | `Settings`, `Settings::default`                                                                       | Fully implemented                                                          |
| `backend/src/lib.rs`                     | [DES-PLAT-SHELL]      | `run()`                                                                                               | Fully implemented                                                          |
| `backend/src/main.rs`                    | [DES-PLAT-SHELL]      | `main()`                                                                                              | Fully implemented                                                          |
| `backend/tauri.conf.json`                | [DES-PLAT-SHELL]      | Window config, bundle targets                                                                         | Implemented; CSP needs tightening                                          |
| `backend/capabilities/default.json`      | [DES-PLAT-SHELL]      | Capability + event allowlist                                                                          | Fully implemented                                                          |
