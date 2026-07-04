---
afx: true
type: TASKS
status: Living
owner: "@richard-sentino"
version: "1.0"
created_at: "2026-06-10T11:54:35.000Z"
updated_at: "2026-07-04T10:47:11.000Z"
tags: ["frontend", "react", "typescript", "tailwind", "midi", "control-surface", "tauri"]
spec: spec.md
design: design.md
---

# 200 Frontend Control Surface — Tasks

> Living implementation checklist for the current Console workbench. Source-backed frontend,
> device-state sync, layout, and offline tests are marked complete; hardware-only and destructive write
> gates remain open until manually verified with a connected device.

---

## Phase 0: App Scaffold and IPC Wiring

<!-- files: frontend/src/app/App.tsx, frontend/src/app/main.tsx -->
<!-- @see docs/specs/200-frontend-control-surface/spec.md [FR-1] [FR-2] [FR-5] [FR-6] -->
<!-- @see docs/specs/200-frontend-control-surface/design.md [DES-FRONT-APP] -->

- [x] Scaffold React app with Vite + Tailwind 4 + TypeScript.
- [x] Mount `App` inside `ThemeProvider` + `LogProvider` in `main.tsx`.
- [x] Implement `SurfaceTabs` (Console / Advanced / About; Presets merged into Console) in `App.tsx`.
- [x] Implement `AdvancedTabs` (Diagnostics / Capture Lab gated by `EXPERIMENTAL_FEATURES`; Settings hidden this release) in `App.tsx`.
- [x] Wire `onMidiMessage` subscription in `App.tsx`; decode incoming PC (`0xCx`) and CC (`0xBx`) packets.
- [x] Wire `onDisconnected` subscription in `App.tsx`; reset all MIDI state on disconnect.
- [x] Lift all shared state: `currentPreset`, `ccState`, `fxSlotStates`, `tunerState`, `expressionValue`, `footswitchState`, `midiLog`, `activityEvents`, `traceSession`.
- [x] Implement `appendMidiLog` (capped at 200 entries) and `pushActivity` (capped at 8 entries).

---

## Phase 1: TauriMidiConnection Service

<!-- files: frontend/src/features/midi/services/TauriMidiConnection.ts -->
<!-- @see docs/specs/200-frontend-control-surface/spec.md [FR-3] [NFR-5] [NFR-6] -->
<!-- @see docs/specs/200-frontend-control-surface/design.md [DES-FRONT-SERVICE] -->

- [x] Implement `TauriMidiConnection` class with `connect`, `attach`, `disconnect` lifecycle methods.
- [x] Implement `send(data)` calling `sendMidi` IPC; store `_error` on failure and rethrow.
- [x] Implement `recallPreset(programNumber, channel)` — clamp to 0-63, send `[0xC0 | ch, program]`.
- [x] Implement `sendProgramChange` (alias).
- [x] Implement `sendControlChange(cc, value, channel)` — clamp cc/value to 0-127, channel to 1-16.
- [x] Implement `setFxSlotEnabled(slotIndex, enabled, channel)` — `cc = 36 + clamp(slot, 1, 5)`.
- [x] Implement `setTunerEnabled(enabled, channel)` — CC43 with 127/0.
- [x] Implement `sendTapTempo(channel)` — CC42=127 → 35 ms → CC42=0.
- [x] Implement `setExpression(value, channel)` — CC1.
- [x] Add backward-compatible aliases: `switchPreset`, `toggleEffect`, `tapTempo`.
- [x] Write Vitest unit tests: `recallPreset` produces correct bytes; `setFxSlotEnabled(1, true)` sends CC37=127; channel clamping works; tap tempo sends two calls with correct values.

---

## Phase 2: Hooks

<!-- files: frontend/src/features/midi/hooks/useMidiConnection.ts, usePreset.ts, useExpression.ts, useNanoHardwareState.ts -->
<!-- @see docs/specs/200-frontend-control-surface/spec.md [FR-4] [FR-18] [FR-19] [FR-20] -->
<!-- @see docs/specs/200-frontend-control-surface/design.md [DES-FRONT-APP] [DES-FRONT-DECODER] -->

- [x] Implement `useMidiConnection`: `connectTo`, `adoptConnection`, `disconnect`, `refreshPorts`; react to `midi://connected`, `midi://disconnected`, `midi://ports-changed`; 2 s polling fallback via `getState`/`getDeviceName`.
- [x] Implement `usePreset`: programmatic preset navigation helpers with document-level keyboard shortcuts deferred for this release.
- [x] Implement `useExpression`: local value state, debounced CC1 send via callback when connected.
- [x] Implement `useNanoHardwareState`: decode controls and hardware from log stream via `protocolLabDecoder`; persist to `localStorage` (`ObservedStateMemory`); merge live/memory/globalHardware; expose `NanoHardwareState` with source-tagged display values.
- [x] Write Vitest unit tests for `usePreset` navigation and keyboard-shortcut deferral.
- [ ] Add focused hook tests for `useMidiConnection` polling/event cleanup and `useNanoHardwareState` memory merge logic.

---

## Phase 3: Constants, Types, and Feature Models

<!-- files: frontend/src/features/midi/constants.ts, types.ts, fxModel.ts, protocolLabDecoder.ts, presetNames.ts, settingsKeys.ts, settingsStorage.ts -->
<!-- @see docs/specs/200-frontend-control-surface/spec.md [FR-30] [FR-31] [FR-32] [FR-33] [FR-34] [FR-35] [FR-36] [NFR-4] [NFR-6] -->
<!-- @see docs/specs/200-frontend-control-surface/design.md [DES-FRONT-CONSTANTS] [DES-FRONT-DECODER] -->

- [x] Define `CC`, `MIDI_CC`, `FX_SLOT_CC`, `DEFAULT_CC_STATE`, `EFFECT_LABELS`, `EFFECT_ICONS`, `PEDAL_COLORS` in `constants.ts`.
- [x] Define footswitch and rotary constants: `DEFAULT_FOOTSWITCH_STATE`, `QUICK_PRESET_SLOTS`, `FOOTSWITCH_ROTARY_*`, `HARDWARE_SELECTOR_LED_COUNT`.
- [x] Define all TypeScript types in `types.ts`: `MidiMessageKind`, `CCState`, `MidiLogEntry`, `PresetOperationMode`, `FootswitchId`, `FootswitchSubslot`, `QuickPresetSlot`, `FootswitchPressRole`, `FootswitchLongPressAction`, `FootswitchState`, `FootswitchIIState`, `NanoCortexFootswitchState`.
- [x] Define `nanoSignalChain` (8 slots with role/section/midiCc/editable), `NANO_FX_SLOT_IDS`, `EDITABLE_FX_SLOT_IDS`, `FxSlotDeviceAssignments`, device catalogue and helpers in `fxModel.ts`.
- [x] Define `ObservedControlId`, `ObservedHardwareId`, `ObservedControlValue`, `ObservedHardwareValue` with `confidence: "provisional"`, all decoder functions, and helper accessors in `protocolLabDecoder.ts`.
- [x] Define `presetLabel`, `loadPresetNames`, `savePresetNames`, `getPresetName`, and normalization helpers in `presetNames.ts`.
- [x] Export the `localStorage` key constants in `settingsKeys.ts` (observed state, preset names, footswitch state, save mode).
- [x] Implement `SettingsSnapshot`, `collectSettingsSnapshot`, `serializeSettingsSnapshot`, `parseSettingsSnapshot`, `applySettingsSnapshot`, `AppliedSettingsSummary` in `settingsStorage.ts`.
- [x] Write Vitest unit tests: `protocolLabDecoder` decodes known log-line patterns; `settingsStorage` round-trips a snapshot.

---

## Phase 4: Core Components

<!-- files: frontend/src/features/midi/components/StatusBar.tsx, DeviceStatusDock.tsx, SignalChain.tsx, LiveControlPanel.tsx, Footswitches.tsx, MidiMonitor.tsx, DeviceSyncStatus.tsx -->
<!-- @see docs/specs/200-frontend-control-surface/spec.md [FR-7] [FR-8] [FR-13] [FR-14] [FR-15] [FR-16] [FR-17] [FR-37] [NFR-7] [NFR-8] -->
<!-- @see docs/specs/200-frontend-control-surface/design.md [DES-FRONT-APP] [DES-FRONT-SIGNALCHAIN] [DES-FRONT-FOOTSWITCH] [DES-FRONT-MONITOR] -->

- [x] Implement `StatusBar`: USB connect, BLE connect, scan, Disconnect, labelled Logs button, Support button, ThemeToggle, connection state pill; Save/Load and Settings entry points hidden for this release.
- [x] Implement `DeviceStatusDock`: USB/BLE/device/activity/USB-in/USB-out flat status items; stable disconnected/transport/sync notification lane; `ShortcutHelp` `<details>` panel; `BleObserverState`, `ActivityTone`, `HardwareActivityEntry` types.
- [x] Export `UsbInboundSync` type from `DeviceSyncStatus.tsx`.
- [x] Implement `SignalChain`: 8-slot grid in hardware order; `stateFor` / `slotStyle`; "Fixed Core" badge on non-editable slots; selected-slot detail panel; Tap Tempo button.
- [x] Implement `LiveControlPanel`: FX Slot 1-5 (CC37-41) buttons, Tuner (CC43) button, Tap Tempo (CC42) button, Expression (CC1) slider.
- [x] ~~Implement `PresetGrid`~~ — retired to remove duplication; the 64-preset browser now lives in `PresetRail` on the Console tab (see FR-15, FR-44).
- [x] Implement `Footswitches`: 4-preset/2-preset mode toggle, `QuickSlotCard` for I-A/I-B/II-A/II-B, long-press action selector, global-bypass toggle.
- [x] Implement `MidiMonitor`: rolling list of up to 200 `MidiLogEntry` items; PC/CC/raw display with hex bytes; Clear button.
- [x] Playwright E2E: `StatusBar` USB connect button visible; shared signal path renders expected slots; `PresetRail` shows bank sections and collapses correctly.

---

## Phase 5: Experimental and Extended Components

<!-- files: frontend/src/features/midi/components/ObservedKnobStrip.tsx, DesktopEditor.tsx, PedalWorkbench.tsx, ProtocolLab.tsx, PresetRail.tsx, LiveControlStrip.tsx, ActivePresetHeader.tsx, QuickPresetAssignments.tsx, SettingsStoragePanel.tsx -->
<!-- @see docs/specs/200-frontend-control-surface/spec.md [FR-21] [FR-22] [FR-23] [FR-24] [FR-25] [FR-26] [FR-27] [FR-29] [NFR-3] [NFR-4] -->
<!-- @see docs/specs/200-frontend-control-surface/design.md [DES-FRONT-EXPERIMENTAL] -->

- [x] Implement `ObservedKnobStrip`: footswitch I/II rotary LED rings (pointer-drag interaction), GAIN/BASS/MID/TREBLE/AMOUNT/LEVEL knob readouts, source labels (`live`/`memory`/`last seen`). Renders `hardwareState` from `useNanoHardwareState`.
- [x] Retain `DesktopEditor` as legacy catalogue/debug code; keep it out of the current normal v1 workflow.
- [x] Implement `PedalWorkbench`: Floating Tone Studio with non-scroll signal path, selected-block synced parameter values, device model state, supported live writes, and gated On/Off controls.
- [x] Implement `ProtocolLab`: trace start/stop actions (`traceMarker` IPC); decoded controls table; decoded hardware values table; footswitch snapshot; `ExperimentalBadge`.
- [x] Retire the standalone preset-switcher surface: split it into `PresetRail` (FR-44: bank-sectioned 64-preset browser, click = load, inline names) and Console utilities; `DeviceStateReadout` carries the active-preset identity + save state.
- [x] Implement `QuickPresetAssignments`: Footswitch Deck with FS I/II cards, capture/cab rotary device-state/cycle controls, and four quick-preset cards (I-A/I-B/II-A/II-B) that send device footswitch mappings.
- [x] Implement `SettingsStoragePanel` (full panel) and `SettingsStorageMenu` (compact header menu); keep them out of the normal top bar/Advanced UI for this release.
- [ ] Verify `EXPERIMENTAL_FEATURES=false` build: Capture Lab tab absent from `AdvancedTabs`; Floating Tone Studio remains available with unsupported writes disabled.
- [x] Playwright E2E: production Console renders without duplicate Tap/Tuner/Expression controls; Capture Lab remains flag-controlled in mocked app states.

---

## Phase 5.1: Live Preset Rail and State Loading UX

<!-- files: frontend/src/app/App.tsx, frontend/src/features/midi/components/PresetRail.tsx, frontend/src/features/midi/components/DeviceStateReadout.tsx -->
<!-- @see docs/specs/200-frontend-control-surface/spec.md [FR-10] [FR-40] [FR-44] -->
<!-- @see docs/specs/200-frontend-control-surface/design.md [DES-FRONT-APP] -->

- [x] Add explicit Console loading state for preset metadata and state-dump refreshes, with compact loader/status affordances in the preset rail/status dock so the user can tell when the app is still syncing.
- [x] Disable preset recall interactions while a preset change/state dump is in flight; cover mouse clicks, keyboard preset shortcuts, quick-preset assignment activation, and the preset rail so duplicate recalls cannot race the BLE refresh.
- [x] Improve `PresetRail` row affordance so each preset reads as a selectable option, not just an editable text field: clearer active/loading states, a larger row click target, and separation between "select preset" and "rename preset".
- [x] Add per-bank collapse/expand controls to `PresetRail`, defaulting to the active bank open so the long 64-preset list is easier to scan.
- [x] Normalize `DeviceStateReadout` loaded-asset typography/layout for Capture and Cab/IR labels so long names fit cleanly, match surrounding scale, and do not visually dominate the amp-dial panel.
- [x] Reshape `DeviceStateReadout` to match the Nano's six-knob panel position more closely: gain/level high, bass/mid/treble/amount low; Amount mirrors live BLE observations and stays display-only until its write path is verified.
- [x] Replace duplicate loaded-asset tiles with signal-path state plus compact capture/cab rotary device state and capture-volume utility readout.
- [x] Add focused tests for preset metadata merge/replacement, loading/disabled preset-selection state, selectable affordance, and long capture/Cab/IR layout behavior.

---

## Phase 5.2: Three-Column Console Workbench Cleanup

<!-- files: frontend/src/app/App.tsx, frontend/src/features/midi/components/ActivePresetHeader.tsx, frontend/src/features/midi/components/DeviceStateReadout.tsx, frontend/src/features/midi/components/DeviceStatusDock.tsx, frontend/src/features/midi/components/LiveControlStrip.tsx, frontend/src/features/midi/components/ObservedKnobStrip.tsx, frontend/src/features/midi/components/PedalWorkbench.tsx, frontend/src/features/midi/components/PresetRail.tsx, frontend/src/features/midi/components/QuickPresetAssignments.tsx -->
<!-- @see docs/specs/200-frontend-control-surface/spec.md [FR-8] [FR-10] [FR-25] [FR-26] [FR-40] [FR-43] [FR-44] -->
<!-- @see docs/specs/200-frontend-control-surface/design.md [DES-FRONT-APP] -->

> Implemented Console cleanup. Automated E2E remains offline/mock-only so connected hardware is
> never a test target.

- [x] Build the Console tab as a three-column workbench: collapsible preset rail on the left, main console in the center, collapsible utilities rail on the right.
- [x] Persist the left preset rail and right tone panel collapsed/open state so gig/practice and tone-chasing layouts survive reloads.
- [x] Keep the center console usable when either side panel is collapsed; the first viewport must show active preset, amp knobs, Tap, Tuner, Expression, and the Footswitch Deck without scrolling.
- [x] Route preset selection from the preset rail, quick-assignment chips, footswitch cards, and pedal/tone panel through one shared recall path.
- [x] Keep active preset name, PC index, device readout, quick assignments, Footswitch Deck, and the right pedal/tone panel synced from the same state.
- [x] Disable duplicate cross-surface preset interactions while preset metadata or a state dump is still in flight.
- [x] Convert the footswitch monitor plus quick-assignment controls into one clickable Footswitch Deck; the I/II switch cards and IA/IB/IIA/IIB chips must be actionable, not read-only decoration.
- [x] Keep Tap Tempo and Tuner one click away in the device-panel top-center area, while the Footswitch Deck shows the matching hold-action context.
- [x] Move raw hardware monitor/debug details below the first viewport or behind a collapse so they do not hide core gig/practice controls.
- [x] Replace the former right tone panel with Utilities; open Floating Tone Studio from the signal path/utilities and keep selected slot state following the active preset.
- [x] Remove redundant labels from the main console, including firmware text that belongs in About.
- [x] Clean up implementation/status copy so only user-relevant state remains visible; avoid repeating the same connection, sync, or provisional-state message in multiple places.
- [x] Consolidate info, alerts, errors, sync state, and support/marketing nudges into the top bar/status dock as the single notification surface.
- [x] Remove duplicate inline banners from the body and reserve stable notification height so transient sync/status text does not make the page jump.
- [x] Add transport capability notes and gate controls by the required connection: USB for preset/CC/Tap/Tuner/expression commands, Bluetooth for live device state and amp-knob writes.
- [x] Defer frontend document-level keyboard shortcuts for this release; normal focused-control keyboard accessibility must remain.
- [x] Add/update frontend unit tests for shared preset-selection flow, disabled in-flight preset interactions, panel collapse persistence, and keyboard-shortcut deferral.
- [x] Add/update offline Playwright E2E using the mocked Tauri backend only: disconnected, USB-only mock, USB+BLE mock, preset refresh in flight, side panels collapsed/open, and first-viewport control visibility.
- [x] Run Rust/offline tests for non-device behavior only; automated tests must not issue live connected-device commands.
- [x] After manual approval, update `spec.md` and `design.md` to match the accepted workbench layout and run traceability.

---

## Phase 5.5: Device-Synced Deep Editor

<!-- files: frontend/src/app/App.tsx, frontend/src/features/midi/components/DesktopEditor.tsx, frontend/src/features/midi/components/DeviceStateReadout.tsx, frontend/src/features/midi/fxModel.ts, frontend/src/features/midi/protocolLabDecoder.ts, frontend/src/features/midi/bleCommandEncoder.ts -->
<!-- @see docs/specs/200-frontend-control-surface/spec.md [FR-22] [FR-29] [FR-40] [FR-46] -->
<!-- @see docs/specs/110-backend-midi-ble/spec.md [FR-20] [FR-21] [FR-22] docs/specs/120-backend-ipc/spec.md [FR-29] [FR-31] [FR-32] [FR-34] -->

- [x] Update frontend `DecodedStateDump` with FX model IDs for fields 48-52, matching the Rust decoder shape and preserving provisional confidence.
- [x] Add gate state (field 54) once captured traces confirm the field shape.
- [x] Add protocol-aware model metadata: device IDs, slot compatibility, display names, parameter labels, ranges/enums, transforms, and fallback handling for unknown IDs.
- [x] Convert the production tone workflow to device-synced state: current models from the latest dump, current param values from refresh replies, and UI that reconciles on the next dump/param refresh.
- [x] Add UI affordances for supported FX model select, FX param edits, FX/gate bypass, gate reduction, capture slot/volume, cab/IR slot, cab/IR params, and cab mic/position; unsupported families remain disabled or diagnostic-only.
- [x] Wire guarded app Save to the device save command: full transport required, loaded preset name required, dirty state required, confirmation before overwrite, and state/metadata refresh after save.
- [ ] Run the guided hardware Save test on a junk slot and confirm it writes the intended preset slot and persists across reselect/re-read.

---

## Phase 6: Hardware Verification

<!-- files: (no source changes — manual verification against hardware) -->
<!-- @see docs/specs/200-frontend-control-surface/spec.md [FR-5] [FR-6] [FR-28] [NFR-1] [NFR-5] -->
<!-- @see docs/specs/200-frontend-control-surface/design.md [DES-FRONT-SERVICE] -->

- [ ] USB connect via `StatusBar` USB button → device name appears in `DeviceStatusDock` (hardware-only).
- [ ] `recallPreset(0)` sends `[0xC0, 0x00]` → Nano Cortex switches to preset 0 physically (hardware-only).
- [ ] FX Slot 1 button sends CC37=127/0 on each click; physical device reflects slot toggle (hardware-only).
- [ ] Tap Tempo CC42 momentary verified on hardware (hardware-only).
- [ ] Tuner CC43 on/off verified on hardware (hardware-only).
- [ ] Expression CC1 slider verified via outgoing CC1 log (hardware-only). — _outgoing (app→device) direction still untested; see Findings 2026-07-01._
- [x] Expression pedal observed **inbound over BLE** (3-zone `0`/`128`/`255` = heel/center/toe), identical across two pedals; decoded + animated frontend-side. See Findings 2026-07-01.
- [ ] ~~Incoming USB MIDI: configure Nano to send MIDI Out → `midi://message` fires → `currentPreset` updates in `PresetGrid`~~ — **device transmits no USB MIDI out** (0 device→app bytes in every capture); this path is not available on the Nano Cortex. See Findings 2026-07-01.
- [ ] Incoming CC37-41 updates `fxSlotStates` (hardware-only). _(blocked by same finding — no device→app USB MIDI.)_
- [ ] `midi://disconnected` on unplug resets preset → 0 and CC state (hardware-only).
- [x] BLE scan + `useNanoHardwareState` receives live BLE log lines → notify/indicate stream (`c305`/`c306`) confirmed streaming pedal packets (hardware-only, `EXPERIMENTAL_FEATURES=true` build).
- [x] Device footswitch mappings (I-A/I-B/II-A/II-B) write from Console Footswitch Deck and are confirmed by state refresh (hardware-only).
- [x] Preset rename writes through the guarded device path and is confirmed by metadata/state refresh (hardware-only).
- [x] Capture and IR Loader device-state values sync into Console and Floating Tone Studio (hardware-only).
- [x] Gate on/off and gate reduction write from Floating Tone Studio, with device-state sync after write (hardware-only).

---

### Findings (2026-07-06 v1 hardware session)

Verified with USB + Bluetooth connected while tailing app/device logs.

- **Footswitch mappings**: Console I-A/I-B/II-A/II-B assignment writes update the device
  mapping and refresh back into the UI.
- **Preset rename**: preset-name edits persist through the device write path and refresh back
  from metadata.
- **Capture / IR Loader**: selected capture and Cab/IR slots plus their displayed names are
  sourced from device state; capture and IR values are available in Floating Tone Studio.
- **Gate**: gate On/Off and reduction values write live device state and sync back after refresh.
- **Deferred**: capture/IR library management and any guided tone-generation workflow are out
  of v1 scope.

---

### Findings (2026-07-01 hardware session)

Verified against a real Nano Cortex with two expression pedals (Line 6 + Boss), via the
Capture Lab (`ProtocolLab`) BLE trace on clean logs. See
`docs/specs/110-backend-midi-ble/design.md` [DES-BLE-DECODER] for the packet table.

- **Expression pedal is BLE-only.** USB-MIDI carried **zero** device→app bytes across every
  capture (standalone `nano_usb_probe` and the app's own USB listener) — not just expression,
  but no knobs/footswitches either. The device receives MIDI on USB (app→device) but does not
  transmit it.
- **3-zone quantization.** The pedal reports only `0` (heel) / `128` (center) / `255` (toe) —
  never an intermediate value, even on slow sweeps. Packet: `C0 08 01 18 02 20 <v> 40 00 00 00`.
- **Both pedals identical.** Same packet shape and value set → the quantization is the device's
  telemetry, not a per-pedal trait; the two pedals are interchangeable.
- **Frontend decode + animation.** `protocolLabDecoder.ts` decodes the zone; the expression UI
  animates to heel/center/toe (0/50/100%) so movement reads smoothly despite the coarse source.
  Underlying value stays honestly labeled as provisional/3-zone (backend `expression_values`
  capability remains `Unverified` — the backend decoder does not parse this packet).

---

## Work Sessions

| Date       | Task                 | Action | Files Modified                                                                                                                                       | Agent | Human |
| ---------- | -------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ----- |
| 2026-06-13 | Phase 0-5 (backfill) | Coded  | docs/specs/200-frontend-control-surface/spec.md, docs/specs/200-frontend-control-surface/design.md, docs/specs/200-frontend-control-surface/tasks.md | [x]   | [x]   |
