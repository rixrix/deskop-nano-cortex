---
afx: true
type: TASKS
status: Living
owner: "@richard-sentino"
version: "1.0"
created_at: "2026-06-10T11:54:35.000Z"
updated_at: "2026-07-04T10:47:11.000Z"
tags: ["platform", "tray", "shortcuts", "settings", "footswitch", "tauri", "backend"]
spec: spec.md
design: design.md
---

# 130 Backend Platform — Tasks

> Backfilled implementation checklist. Core platform modules were coded in phase 0–4 of the
> original sprint (2026-06-10). Several items are scaffolded (structure and registration exist)
> but not fully wired; those are marked `[ ]` with an explanation comment.

---

## Phase 0: Shell and Configuration

<!-- files: backend/src/main.rs, backend/src/lib.rs, backend/tauri.conf.json, backend/capabilities/default.json -->
<!-- @see docs/specs/130-backend-platform/spec.md [FR-13] [FR-14] [FR-15] [FR-16] [FR-17] -->
<!-- @see docs/specs/130-backend-platform/design.md [DES-PLAT-SHELL] -->

- [x] Create `backend/src/main.rs`: `windows_subsystem = "windows"` gate + `run()` call.
- [x] Create `backend/src/lib.rs` with `pub fn run()`: configure `tracing_subscriber`, build `AppState`, register four plugins, manage state, wire `setup`, `invoke_handler`, and `on_window_event`.
- [x] Set `tauri.conf.json`: `productName`, `identifier`, window 1360×900 / min 860×640 / resizable / not fullscreen, `bundle.targets = "all"`, macOS entitlements path, and macOS `Info.plist` merge path for Bluetooth permission text.
- [x] Set `capabilities/default.json`: identifier `"default"`, window `["main"]`, six permission strings, six `midi://*` events.
- [x] Wire `on_window_event` `CloseRequested` handler: capture `outer_position` + `outer_size`, spawn async task, lock `AppState.settings`, call `save_settings`.
- [ ] Tighten CSP from `null` to `"default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:;"` in `tauri.conf.json` before shipping.

---

## Phase 1: Domain Value Objects

<!-- files: backend/src/domain/settings.rs, backend/src/domain/footswitch.rs, backend/src/domain/mod.rs -->
<!-- @see docs/specs/130-backend-platform/spec.md [FR-8] [FR-9] [FR-10] [FR-11] [FR-12] -->
<!-- @see docs/specs/130-backend-platform/design.md [DES-PLAT-SETTINGS] [DES-PLAT-FOOTSWITCH] -->

- [x] Define `Settings` struct with `last_device_name`, `last_preset`, `window_x/y/w/h` fields.
- [x] Implement `Settings::default()` with `window_w: Some(800)`, `window_h: Some(600)`, all others `None`.
- [x] Define `PresetOperationMode` enum (`FourPreset` / `TwoPreset`, `kebab-case`).
- [x] Define `FootswitchId` enum (`I` / `II`).
- [x] Define `FootswitchSubslot` enum (`A` / `B`).
- [x] Define `QuickPresetSlot` enum (`IA` / `IB` / `IIA` / `IIB`).
- [x] Define `FootswitchPressRole` enum (`PresetToggle` / `GlobalBypass`, `kebab-case`).
- [x] Define `FootswitchLongPressAction` enum (`TapTempo` / `Tuner`, `kebab-case`).
- [x] Define `RotaryEncoderRole` enum (`CaptureScroll` / `IrScroll`, `kebab-case`).
- [x] Define `FootswitchState` struct (5 fields: role, assigned_a, assigned_b, active_subslot, long_press_action).
- [x] Define `FootswitchIIState` struct (6 fields: same as FootswitchState + `global_bypass_enabled: bool`).
- [x] Define `NanoCortexFootswitchState` struct with `preset_operation_mode`, `footswitch_i`, `footswitch_ii`.
- [x] Implement `NanoCortexFootswitchState::default()`: 4-preset mode, FS-I A=0 B=1 tap-tempo, FS-II A=2 B=3 tuner bypass-off.
- [x] Define `FootswitchEvent` as tagged enum (`#[serde(tag = "type")]`): `FootswitchPressed`, `OperationModeChanged`, `PresetAssigned`, `GlobalBypassToggled`.
- [x] Define `RotaryEncoderMapping` struct (`footswitch`, `role`).
- [x] Re-export `Settings`, `NanoCortexFootswitchState`, and all sub-types through `backend/src/domain/mod.rs`.

---

## Phase 2: System Tray

<!-- files: backend/src/platform/tray.rs, backend/src/platform/mod.rs, backend/src/lib.rs -->
<!-- @see docs/specs/130-backend-platform/spec.md [FR-1] [FR-2] [FR-3] -->
<!-- @see docs/specs/130-backend-platform/design.md [DES-PLAT-TRAY] -->

- [x] Implement `create_tray<R: Runtime>`: `TrayIconBuilder::new()` with tooltip and `on_menu_event` handler for `"show"` / `"hide"` / `"quit"`.
- [x] Implement `update_tray_connection<R: Runtime>`: format tooltip string, call `tray.set_tooltip`.
- [x] Wire `create_tray` call into `lib.rs` `setup` closure; drop result with `let _ = tray`.
- [ ] Attach a structured `Menu` object to the `TrayIconBuilder` so Show / Hide / Quit appear as visible right-click menu items (currently event-ID dispatch without visible menu entries).
- [ ] Wire `update_tray_connection` to a `AppState` connection-state observer so the tooltip reflects live connection transitions (function exists; no caller wired yet).
- [ ] Add state-specific icon assets (e.g., green/grey) and call `tray.set_icon()` on connection change.

---

## Phase 3: Global Shortcuts

<!-- files: backend/src/platform/shortcuts.rs, backend/src/lib.rs -->
<!-- @see docs/specs/130-backend-platform/spec.md [FR-4] [FR-5] -->
<!-- @see docs/specs/130-backend-platform/design.md [DES-PLAT-SHORTCUTS] -->

- [x] Implement `register_shortcuts(app: &AppHandle)`: define 11 `(Code, &str)` pairs, call `global_shortcut.register(Shortcut::new(Modifiers::empty(), code))` for each.
- [x] Wire `register_shortcuts` call into `lib.rs` `setup` closure; log warn on failure.
- [ ] Attach a shortcut handler (via `GlobalShortcutExt::on_shortcut` or the `Builder::with_handler` API) that emits a `midi://hotkey` event or calls a `switchPreset` Tauri command when a registered shortcut fires.
- [ ] Add UX affordance (e.g., a settings panel checkbox) for disabling global shortcuts to avoid conflicts with DAWs and other music software.

---

## Phase 3.1: Shortcut Deferral for Workbench Release

<!-- files: backend/src/platform/shortcuts.rs, backend/src/lib.rs, frontend/src/features/midi/hooks/usePreset.ts, frontend/src/features/midi/components/DeviceStatusDock.tsx -->
<!-- @see docs/specs/130-backend-platform/spec.md [FR-4] [FR-5] -->
<!-- @see docs/specs/200-frontend-control-surface/tasks.md Phase 5.2 -->

> Release decision: keyboard shortcuts move to a later version because unmodified number/letter
> keys interfere with typing in the control surface. Keep normal focused-control accessibility;
> defer app-wide and global shortcuts until there is an explicit user setting.

- [x] Stop registering unmodified global digit/arrow shortcuts during app setup for this release.
- [x] Disable frontend document-level shortcuts in `usePreset` for this release: digits, arrows, Space, T, Q/W, A/S/D/F must not trigger app commands from ordinary typing.
- [x] Remove visible keyboard shortcut hints from the status dock so the UI does not advertise deferred behavior.
- [x] Add offline tests proving ordinary typing does not switch presets or trigger footswitch/tap/tuner actions.
- [ ] Revisit global/app-wide shortcuts in a later release behind an explicit enable/disable setting.

---

## Phase 4: Persistent Settings

<!-- files: backend/src/platform/settings_store.rs, backend/src/domain/settings.rs, backend/src/lib.rs -->
<!-- @see docs/specs/130-backend-platform/spec.md [FR-6] [FR-7] [FR-8] -->
<!-- @see docs/specs/130-backend-platform/design.md [DES-PLAT-SETTINGS] -->

- [x] Implement `load_settings(app: &AppHandle)`: open store `"settings.json"`, `store.get("settings")`, deserialize with `unwrap_or_default`.
- [x] Implement `save_settings(app: &AppHandle, settings: &Settings)`: serialize to value, `store.set`, `store.save`.
- [x] Wire `load_settings` into `lib.rs` `setup`: on success write to `AppState.settings` via `blocking_lock`; on failure `tracing::warn`.
- [x] Wire geometry persistence in `lib.rs` `on_window_event` `CloseRequested`.
- [ ] On `setup` completion (after USB port scan), if `settings.last_device_name` is `Some`, call `connect(last_device_name)` for auto-reconnect on launch.
- [ ] Write `settings.last_preset` to the store whenever the frontend triggers a preset change (hook in `send_midi` or a dedicated `set_last_preset` command).
- [ ] On launch, restore window position from `settings.window_x/y` via `window.set_position()` after the window is created.

---

## Phase 5: Hardware and Integration Verification

<!-- files: (no source changes — manual verification) -->
<!-- @see docs/specs/130-backend-platform/spec.md [FR-1] [FR-2] [FR-4] [FR-6] [FR-7] -->
<!-- @see docs/specs/130-backend-platform/design.md [DES-PLAT-TRAY] [DES-PLAT-SHORTCUTS] [DES-PLAT-SETTINGS] -->

- [ ] Verify tray icon appears on launch on macOS, Windows, and Linux (where supported).
- [ ] Verify Show / Hide / Quit tray actions work correctly from the tray context menu.
- [ ] Verify global shortcuts `1`–`9` and arrow keys fire when the app window is unfocused (requires handler wiring from Phase 3).
- [ ] Verify settings are persisted and restored across restarts: window geometry, last device name.
- [ ] Run `cargo test` — confirm no platform module panics in the test suite.

---

## Work Sessions

| Date       | Task                 | Action | Files Modified                                                                                                               | Agent | Human |
| ---------- | -------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------- | ----- | ----- |
| 2026-06-13 | Phase 0–4 (backfill) | Coded  | docs/specs/130-backend-platform/spec.md, docs/specs/130-backend-platform/design.md, docs/specs/130-backend-platform/tasks.md | [x]   | [x]   |
