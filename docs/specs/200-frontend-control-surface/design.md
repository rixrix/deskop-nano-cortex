---
afx: true
type: DESIGN
status: Living
owner: "@richard-sentino"
version: "1.1"
created_at: "2026-06-10T11:54:35.000Z"
updated_at: "2026-07-08T11:53:16.000Z"
tags: ["frontend", "react", "typescript", "tailwind", "midi", "control-surface", "tauri"]
spec: spec.md
---

# 200 Frontend Control Surface — Design

## [DES-FRONT-OVR] Overview

The Frontend Control Surface is a React 19 / TypeScript / Tailwind 4 webview embedded in the
Tauri shell. It is a device-first Console workbench: outgoing MIDI goes through
`TauriMidiConnection` (which wraps Tauri IPC `send_midi`), while BLE device-state sync provides
preset names, current-state dumps, FX model state, live knob movement, and hardware telemetry
where available. Captured state remains provisional until verified by this project.

The three-layer honest-state model:

```text
Layer 1 (commands)    — PC 0-63, CC1/37-43 sent via TauriMidiConnection
Layer 2 (device sync) — request_state_dump / metadata / fx-param replies over BLE
Layer 3 (telemetry)   — BLE notifications decoded by protocolLabDecoder
                        confidence: "provisional" on fields until capability graduation
```

Flow map anchor from the overview: `[Flow.Webview]`.

---

## [DES-FRONT-APP] Application Structure

### Composition Root

`App.tsx` is the composition root. It:

- Lifts all shared state: `currentPreset`, `ccState`, `fxSlotStates`, `tunerState`,
  `expressionValue`, `footswitchState`, `midiLog`, `bleObserverState`, `activityEvents`,
  `traceSession`, `lastUsbInbound`, `lastUsbOutbound`, `mainSurface`, `advancedSurface`,
  preset metadata status, current-state dump, FX model state, FX parameter values, and
  Console rail collapsed/open state.
- Subscribes to `midi://message` and `midi://disconnected` IPC events in a single `useEffect`.
- Delegates MIDI actions to `TauriMidiConnection` via the `useMidiConnection` hook's `connection` ref.
- Imports `EXPERIMENTAL_FEATURES` and `ExperimentalBadge` from zone 210 to gate capture/protocol tooling.
- Renders components in a fixed DOM structure: `StatusBar` (fixed top) → `DeviceStatusDock`
  (status strip) → hardware panel (tab-switched body) → `LogPanel` (overlay).

`main.tsx` mounts `<App>` inside `<ThemeProvider><LogProvider>` and renders into `#root`.

### Tab Navigation

```text
[SurfaceTabs]
  console  |  advanced  |  help  |  about

[Console panel]  (collapsible left rail + center console + collapsible utilities rail)
  PresetRail  (64 presets in bank sections; click = load; inline names; scroll-to-active)
  SignalPathOverview  (shared signal path; quick on/off; opens Tone Studio)
  DeviceStateReadout  (active preset identity + six dials in Nano order)
  QuickPresetAssignments  (footswitch deck + capture/cab rotary device state)
  LiveUtilitiesPanel  (Tone Studio, save mode, tap, tuner, expression, capture volume)

[Advanced panel]
  [AdvancedTabs]
    diagnostics  |  capture (EXPERIMENTAL_FEATURES gate only)

  [Advanced.diagnostics]
    MidiMonitor  (opt-in diagnostics capture + USB trace)

  [Advanced.capture]  (only when EXPERIMENTAL_FEATURES)
    ProtocolLab

[Floating overlay]
  PresetRail  (popout preset selection)
  PedalWorkbench  (Floating Tone Studio, selected block params)
```

### Surface Map

```text
┌─────────────────────────────────────────────────────────────┐
│ [MAP-STATUSBAR] StatusBar (fixed top nav)                   │
│  brand · Update pill (only when newer release known) ·      │
│  USB btn · BLE btn · SCAN btn · Disconnect ·                │
│  Logs · Support · ThemeToggle                               │
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│ [MAP-DOCK] DeviceStatusDock (status strip)                  │
│  Device · USB · BLE · Activity · USB in · USB out ·         │
│  Presets · Transport · Alerts · stable log/notice lane       │
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│ [MAP-TABS] SurfaceTabs   Console | Advanced | Help | About  │
├────────────┬────────────────────────────────┬───────────────┤
│ [MAP-RAIL] │ [MAP-CONSOLE] Center Console   │ [MAP-UTIL]    │
│ PresetRail │ ─────────────────────────────  │ Utilities     │
│  Bank A-H  │ [MAP-SIGNAL] SignalPathOverview│  Tone Studio  │
│  64 rows   │  quick on/off + studio opener  │  Save mode    │
│  inline    │ [MAP-DEVSTATE] DeviceState     │  Tap tempo    │
│  names     │  preset id · dirty · 6 knobs   │  Tuner        │
│  collapses │ [MAP-QUICK] Footswitch Deck    │  Expression   │
│  to chip   │  FS rotaries · FS I/II · quick │  scroll rail  │
└────────────┴────────────────────────────────┴───────────────┘
┌─────────────────────────────────────────────────────────────┐
│ [MAP-ADVANCED] Advanced tab                                 │
│  [MAP-ADV-TABS]  Diagnostics | Capture Lab (EXP)            │
│                                                             │
│  [MAP-DIAG]     Diagnostics sub-tab                         │
│    [MAP-MON]    MidiMonitor                                 │
│                  opt-in diagnostics capture · USB trace      │
│                  Rolling PC/CC/raw MIDI log                 │
│                                                             │
│  [MAP-CAPTURE]  Capture Lab sub-tab (EXPERIMENTAL only)     │
│    [MAP-PROTO]  ProtocolLab                                 │
│                  Trace start/stop · decoded controls ·      │
│                  hardware values · footswitch snapshot       │
└─────────────────────────────────────────────────────────────┘
```

### Code Locator Table

| Map ID            | Component / module                 | Source file                                                        |
| ----------------- | ---------------------------------- | ------------------------------------------------------------------ |
| `[MAP-STATUSBAR]` | `StatusBar`                        | `frontend/src/features/midi/components/StatusBar.tsx`              |
| `[MAP-DOCK]`      | `DeviceStatusDock`                 | `frontend/src/features/midi/components/DeviceStatusDock.tsx`       |
| `[MAP-TABS]`      | `SurfaceTabs` (inline in App)      | `frontend/src/app/App.tsx`                                         |
| `[MAP-CONSOLE]`   | Console tab panel (inline)         | `frontend/src/app/App.tsx`                                         |
| `[MAP-RAIL]`      | `PresetRail`                       | `frontend/src/features/midi/components/PresetRail.tsx`             |
| `[MAP-SIGNAL]`    | `SignalPathOverview`               | `frontend/src/features/midi/components/PedalWorkbench.tsx`         |
| `[MAP-UTIL]`      | `LiveUtilitiesPanel`               | `frontend/src/features/midi/components/LiveUtilitiesPanel.tsx`     |
| `[MAP-ADVANCED]`  | Advanced tab panel (inline)        | `frontend/src/app/App.tsx`                                         |
| `[MAP-ADV-TABS]`  | `AdvancedTabs` (inline in App)     | `frontend/src/app/App.tsx`                                         |
| `[MAP-DEVSTATE]`  | `DeviceStateReadout`               | `frontend/src/features/midi/components/DeviceStateReadout.tsx`     |
| `[MAP-QUICK]`     | `QuickPresetAssignments`           | `frontend/src/features/midi/components/QuickPresetAssignments.tsx` |
| `[MAP-STUDIO]`    | `PedalWorkbench`                   | `frontend/src/features/midi/components/PedalWorkbench.tsx`         |
| `[MAP-DIAG]`      | Advanced diagnostics composite     | `frontend/src/app/App.tsx`                                         |
| `[MAP-MON]`       | `MidiMonitor`                      | `frontend/src/features/midi/components/MidiMonitor.tsx`            |
| `[MAP-CAPTURE]`   | Advanced/Capture Lab composite     | `frontend/src/app/App.tsx`                                         |
| `[MAP-PROTO]`     | `ProtocolLab`                      | `frontend/src/features/midi/components/ProtocolLab.tsx`            |
| —                 | `DeviceSyncStatus` (type provider) | `frontend/src/features/midi/components/DeviceSyncStatus.tsx`       |

### Update surfacing (FR-48)

Three tiers, all fed by `useLatestRelease`; all render nothing for `checking`/`latest`/`error`:

1. **About-tab dot** — green dot on the About tab in `SurfaceTabs` (`aboutBadge`).
2. **StatusBar pill** — green "Update vX.Y.Z" pill at the head of the action cluster; opens the
   About tab (`UpdateCard` carries the release link).
3. **`UpdateNudge` toast** — bottom-right, once per version via `useUpdateNudge`; dismissal
   writes `nano:updateNudgeDismissedVersion` to `localStorage`. `SupportNudge` wins the corner
   when both are eligible; the toast re-evaluates next launch.

---

## [DES-FRONT-CONSOLE] Console ASCII Layout And Flow

<!-- @see docs/specs/200-frontend-control-surface/spec.md [FR-7] [FR-8] [FR-10] [FR-43] [FR-44] [FR-47] -->

The Console is optimized for a desktop first viewport. Presets and Utilities are side rails:
they can collapse independently, are height-limited, and scroll internally so expanding all
banks does not stretch the main app height.

**Vertical fit (NFR-9).** The `short:` variant (`@media (max-height: 1199px)`,
`styles/index.css`) compacts panel/section paddings, inter-section gaps, amp-dial and rotary
sizes, and the footswitch click-switch height so the page fits 1920×1000 CSS px with no
page-level scrollbar. Only spacing/control chrome shrinks; the only hidden element is the
Footswitch Deck helper sentence. Guarded by the Playwright 1920×1000 no-page-scroll test.

```text
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│ STATUS BAR: logo · connected pill · USB · Bluetooth · Scan · Disconnect · Logs · Support     │
├──────────────────────────────────────────────────────────────────────────────────────────────┤
│ DOCK: Device · USB · BLE · Last · Activity · USB in/out · Presets · Transport · Alerts       │
├──────────────────────────────────────────────────────────────────────────────────────────────┤
│ TABS: [Console] [Advanced] [Help] [About]                                                   │
├──────────────┬───────────────────────────────────────────────────────────┬───────────────────┤
│ PRESETS      │ SIGNAL PATH · QUICK ON/OFF                    [Tone Studio]│ UTILITIES         │
│ Bank A v     │ In → Gate → Pre1 → Pre2 → Capture → IR → Post1 → Post2 → Out│ Tone Studio btn   │
│  A1 Clean    │          each slot: icon + compact role + model + On/Off    │ Save mode         │
│  A2 Clean    ├───────────────────────────────────────────────────────────┤ Capture volume    │
│  ...         │ A1 Clean 1 Simple · PC 0 · Unsaved                         │ Tap Tempo         │
│ Bank B >     │ Gain · Bass · Mid · Treble · Amount · Level                 │ Tuner             │
│ Bank C >     │ horizontal dials in Nano order                              │ Expression        │
│              ├───────────────────────────────────────────────────────────┤                   │
│              │ FOOTSWITCH DECK                                             │                   │
│              │ Capture rotary ←/→ | Cab/IR rotary ←/→                      │                   │
│              │ FS I switch card        FS II switch card                    │                   │
│              │ IA quick slot | IB quick slot | IIA quick slot | IIB quick   │                   │
└──────────────┴───────────────────────────────────────────────────────────┴───────────────────┘
```

Collapsed rail scenarios:

```text
Left collapsed:
┌──────┬───────────────────────────────────────────────────────────┬───────────────────┐
│ »    │ Center Console keeps signal, knobs, and footswitch deck    │ Utilities         │
│Preset│                                                           │                   │
└──────┴───────────────────────────────────────────────────────────┴───────────────────┘

Right collapsed:
┌──────────────┬───────────────────────────────────────────────────────────┬──────┐
│ Presets      │ Center Console expands, signal path still fits            │ «    │
│              │                                                           │Utils │
└──────────────┴───────────────────────────────────────────────────────────┴──────┘

Floating Tone Studio:
┌──────────────────────────────────────────────────────────────────────────────┐
│ dimmed Console behind overlay                                                │
│ ┌─────────────┬────────────────────────────────────────────────────────────┐ │
│ │ PresetRail  │ Floating Tone Studio                                      │ │
│ │ selectable  │ Signal path (no horizontal scroll)                        │ │
│ │             │ Selected block header · On/Off · Refresh                  │ │
│ │             │ Parameter grid with synced values below                    │ │
│ └─────────────┴────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Console State Flow

```text
User selects preset
  → App recall path guards duplicate selections while in flight
  → USB PC command sends when USB is available
  → BLE device-sync requests run when Bluetooth is available
      request_metadata      → merge or replace preset-name cache
      request_state_dump    → active preset state + amp knobs + loaded assets + model ids
      request_fx_params     → selected block parameter values
  → One shared state snapshot feeds:
      PresetRail · SignalPathOverview · DeviceStateReadout · QuickPresetAssignments · Utilities

Device SAVE / EXIT event
  → clear dirty state
  → resync state dump and parameter values when Bluetooth is available
```

---

## [DES-FRONT-TONE-STUDIO] Floating Tone Studio Design

<!-- @see docs/specs/200-frontend-control-surface/spec.md [FR-23] [FR-46] -->
<!-- @see docs/specs/110-backend-midi-ble/spec.md [FR-20] [FR-22] -->

Floating Tone Studio is the dense tone surface. Console stays fast and compact; Studio opens when
the user needs block details, device model state, or parameter values. It shares the same
signal-path component used by Console, but Studio enables selected-block detail and synced
parameters below the path.

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│ Floating Tone Studio                                      [close]           │
│ A8 · device chain and synced values                                         │
├───────────────┬─────────────────────────────────────────────────────────────┤
│ PRESETS       │ SIGNAL PATH                                                 │
│ Bank A >      │ In · Gate · Pre1 · Pre2 · Capture · IR · Post1 · Post2 · Out│
│ Bank B v      │ each slot: role inside icon · model label · On/Off toggle    │
│  B1 ...       ├─────────────────────────────────────────────────────────────┤
│  B2 ...       │ SELECTED BLOCK                                               │
│  B3 active    │ Pre FX 1 · Transpose · id D18C01 · On/Off · Refresh Values  │
│ Bank C >      ├─────────────────────────────────────────────────────────────┤
│               │ SYNCED PARAMETERS                                           │
│               │ Mix       Semitones       Pitch Fine       High Pass        │
│               │ value     value           value            value            │
│               │ Unsupported values stay disabled until the write path is verified. │
└───────────────┴─────────────────────────────────────────────────────────────┘
```

Interaction flow:

```text
Open Tone Studio
  → preserve active preset and selected slot
  → render non-scroll signal path from current state dump model IDs
  → user selects a slot
      → selected block header updates
      → parameter definitions come from fxParams metadata
      → refresh action requests device values for that slot
      → values render below the path
  → On/Off may call the already exposed CC bypass path only where the slot is editable
  → model/parameter writes stay disabled until the matching BLE command family graduates
```

Design constraints:

- The signal path must fit without horizontal scrolling on desktop; role labels move inside icons
  and parameter-count pills stay out of the path.
- The selected block panel owns model IDs, categories, value counts, and refresh state.
- Unknown model IDs display the raw ID and a conservative "unknown model" label, not a guessed
  model name.
- Parameter controls show synced device values first; unsupported write controls remain disabled
  until hardware verification promotes the specific command family.

---

## [DES-FRONT-SERVICE] TauriMidiConnection Service

`TauriMidiConnection` (`frontend/src/features/midi/services/TauriMidiConnection.ts`) is a
plain TypeScript class (not a React hook) wrapping the `connect` and `sendMidi` Tauri IPC
commands. It is instantiated once in `useMidiConnection` via a `useRef` and shared via the
hook's return value.

### Class API

```typescript
class TauriMidiConnection {
  // State
  get connected(): boolean;
  get error(): string | null;

  // Lifecycle
  async connect(portName: string): Promise<void>; // calls Tauri connect, then attach
  attach(portName: string): void; // optimistic — for BLE adoptConnection
  disconnect(): void; // local state only

  // Send helpers — all clamp to valid MIDI ranges, all call send()
  async send(data: number[]): Promise<void>;
  async sendProgramChange(programNumber: number, channel?: number): Promise<void>; // PC 0-63
  async sendControlChange(ccNumber: number, value: number, channel?: number): Promise<void>;
  async recallPreset(programNumber: number, channel?: number): Promise<void>;
  async setFxSlotEnabled(slotIndex: number, enabled: boolean, channel?: number): Promise<void>;
  // slot 1-5 → CC 37-41
  async setTunerEnabled(enabled: boolean, channel?: number): Promise<void>; // CC43
  async sendTapTempo(channel?: number): Promise<void>; // CC42 on/off
  async setExpression(value: number, channel?: number): Promise<void>; // CC1
}
```

MIDI channel argument: clamped `1..=16`, converted to 0-based status byte offset internally
(`channelIndex = channel - 1`). Default channel is `1`.

Tap tempo is a momentary: `CC42=127` → 35 ms delay → `CC42=0`.

---

## [DES-FRONT-CONSTANTS] Constants and Domain Model

### `constants.ts` — MIDI scope

```text
CC.EXPRESSION  = 1    (= MIDI_CC.EXPRESSION)
CC.GATE        = 34   (signal-chain rendering only, not a documented live control)
CC.CAPTURE     = 35   (signal-chain rendering only)
CC.CAB         = 36   (signal-chain rendering only)
CC.EQ          = 37   (= MIDI_CC.FX_SLOT_1)
CC.MOD         = 38   (= MIDI_CC.FX_SLOT_2)
CC.DELAY       = 39   (= MIDI_CC.FX_SLOT_3)
CC.REVERB      = 40   (= MIDI_CC.FX_SLOT_4)
CC.COMP        = 41   (= MIDI_CC.FX_SLOT_5)
CC.TAP         = 42   (= MIDI_CC.TAP_TEMPO)
CC.TUNER       = 43   (= MIDI_CC.TUNER)

MIDI_CC: documented live controls (CC1/37-43)
FX_SLOT_CC: [37, 38, 39, 40, 41]  (index 0 = FX Slot 1)
```

Note: CCs 34/35/36 (Gate/Capture/Cab) appear in `CC` for signal-chain state rendering only.
`LiveControlPanel` exposes FX Slots 1-5 via CC37-41, not these lower CCs.

### `fxModel.ts` — Signal chain slots

```text
nanoSignalChain (8 slots, in order):
  { id: "gate",      section: "input", roleLabel: "Gate",      midiCc: CC.GATE,    editable: false }
  { id: "pre-1",     section: "pre",   roleLabel: "Pre FX 1",  midiCc: MIDI_CC.FX_SLOT_1, editable: true }
  { id: "pre-2",     section: "pre",   roleLabel: "Pre FX 2",  midiCc: MIDI_CC.FX_SLOT_2, editable: true }
  { id: "capture",   section: "core",  roleLabel: "Capture",   midiCc: CC.CAPTURE, editable: false }
  { id: "ir-loader", section: "core",  roleLabel: "IR / Cab",  midiCc: CC.CAB,     editable: false }
  { id: "post-1",    section: "post",  roleLabel: "Post FX 1", midiCc: MIDI_CC.FX_SLOT_3, editable: true }
  { id: "post-2",    section: "post",  roleLabel: "Post FX 2", midiCc: MIDI_CC.FX_SLOT_4, editable: true }
  { id: "post-3",    section: "post",  roleLabel: "Post FX 3", midiCc: MIDI_CC.FX_SLOT_5, editable: true }
```

Editable slots use `EDITABLE_FX_SLOT_IDS = ["pre-1", "pre-2", "post-1", "post-2", "post-3"]`.
Core/fixed slots (Gate, Capture, IR/Cab) do not emit CC toggles; they are role containers.

`FxSlotDeviceAssignments` maps each `EditableFxSlotId` to a `NanoFxDeviceId | null`, persisted
in `App.tsx` component state and surfaced through the Console signal path and Floating Tone Studio.

---

## [DES-FRONT-SIGNALCHAIN] Signal Chain Design

The `SignalChain` component renders the fixed 8-slot hardware order. Design decisions:

| Decision             | Choice                                                                    | Rationale                                                                                                     |
| -------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Slot click behavior  | Clicking an editable connected slot emits a CC toggle                     | Editable = Pre FX 1/2, Post FX 1/2/3. Non-editable slots (Gate, Capture, IR/Cab) do not emit CC on click.     |
| State label          | `"active"` / `"bypassed"` / `"empty"` / `"unavailable"`                   | `unavailable` when disconnected; `active` when CC value is true; `bypassed` when slot exists but CC is false. |
| "Fixed Core" badge   | Rendered on slots that are core or not editable                           | Distinguishes fixed hardware blocks (Gate, Capture, IR/Cab) from togglable FX slots.                          |
| Selected slot detail | Shown below the grid with role label, loaded device name, and bypass hint | Gives context without overloading each slot card.                                                             |
| Tap Tempo button     | Placed in the signal-chain row footer                                     | Co-locates tempo control with the chain view for stage use.                                                   |

---

## [DES-FRONT-FOOTSWITCH] Footswitch Assignment Design

The footswitch model is entirely an **assignment/live-access model** — no literal MIDI
footswitch press command is documented or sent.

### State model (`NanoCortexFootswitchState`)

```text
presetOperationMode: "4-preset" | "2-preset"

footswitchI:
  role: "preset-toggle"
  currentAssignedA: 0-63 (preset PC number)
  currentAssignedB: 0-63
  activeSubslot: "A" | "B"
  longPressAction: "tap-tempo" | "tuner"

footswitchII:
  role: "preset-toggle" | "global-bypass"
  currentAssignedA: 0-63
  currentAssignedB: 0-63
  activeSubslot: "A" | "B"
  longPressAction: "tap-tempo" | "tuner"
  globalBypassEnabled: boolean
```

### Footswitch press model (`applyFootswitchPressModel` in `App.tsx`)

- **Footswitch I**: toggles `activeSubslot` A ↔ B; fires `recallPreset` on the newly active subslot's assigned preset.
- **Footswitch II (4-preset mode)**: toggles `activeSubslot` A ↔ B; fires `recallPreset`.
- **Footswitch II (2-preset mode)**: toggles `globalBypassEnabled`; no preset recall.

### BLE footswitch sync (`applyBlePresetSelectionModel` in `App.tsx`)

When a `bankItem` BLE hardware event fires, the preset number and optional `footswitchAssignments`
(provisional from `ObservedFootswitchAssignments`) are used to update the local footswitch
assignment model and fire `adoptBlePresetSelection`. This is explicitly provisional: assignments
come from `confidence: "provisional"` BLE decode.

### Persistence

`footswitchState` is saved to `localStorage` under `FOOTSWITCH_STATE_STORAGE_KEY` on every
state change via a `useEffect`. Loaded on mount via `loadFootswitchState()` with full
validation/clamping.

---

## [DES-FRONT-MONITOR] MIDI Monitor and Activity Feed Design

### MIDI Monitor (`MidiMonitor`)

- Accepts `MidiLogEntry[]` (up to 200 entries, trimmed in `App.tsx`).
- Each entry: `{ id, ts, kind: "pc"|"cc"|"raw", channel, number, value?, label, bytes }`.
- Outgoing commands and incoming `midi://message` events are both logged.
- Clear button resets to empty array.

### Activity Feed (`DeviceStatusDock`)

- Accepts `HardwareActivityEntry[]` (up to 8 entries, trimmed in `App.tsx`).
- Each entry: `{ id, ts, message, tone: "ble"|"usb"|"hardware"|"system"|"error" }`.
- `activityToneFor(message)` in `App.tsx` classifies log messages by keyword heuristic.
- The dock also shows `lastUsbInbound` and `lastUsbOutbound` (`UsbInboundSync`) with hex byte tooltip.
- The dock owns the stable notification lane for disconnected guidance, transport health, in-flight preset/state/name sync, and alert notices so the Console body does not reflow when those states change.

### Trace Session

`App.tsx` tracks a `TraceSession` struct:

```typescript
interface TraceSession {
  label: string | null; // session label typed by user in ProtocolLab
  activeLabel: string | null; // set while tracing, cleared on stop/disconnect
  startedAt: number | null; // Date.now() at start
  stoppedAt: number | null; // Date.now() at stop
  midiCount: number; // incoming midi://message packets during session
  latestMidiBytes: number[] | null;
}
```

`handleStartTraceAction` calls `traceMarker(label, "start")` IPC; `handleStopTraceAction` calls
`traceMarker(label, "stop")`. Active trace labels are prepended to MIDI monitor log entries.
`bleNotificationCount` is derived from the log stream filtered to the session time window.

---

## [DES-FRONT-DECODER] Protocol Lab Decoder Design

`protocolLabDecoder.ts` is a **pure text decoder** — it parses log-line strings from
`midi://log` events (surfaced via `useLogs()`) using pattern matching and regex. It does not
call any Tauri commands and has no side effects.

### Decoded types

| Type                                                | Confidence                  | Notes                                                                                                                                                                                                                                       |
| --------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ObservedControlValue` (`id: ObservedControlId`)    | `"provisional"`             | GAIN/BASS/MID/TREBLE/AMOUNT/LEVEL decoded from BLE notification log lines                                                                                                                                                                   |
| `ObservedHardwareValue` (`id: ObservedHardwareId`)  | `"provisional"`             | bank/bankItem/fx/footswitchI/footswitchII/encoderI/encoderII/save/exit/capture                                                                                                                                                              |
| `ObservedFootswitchAssignments`                     | `"provisional"` (inherited) | IA/IB/IIA/IIB preset indices extracted from bankItem hardware events                                                                                                                                                                        |
| `ObservedExpressionValue` (`zone: heel/center/toe`) | `"provisional"`             | 3-zone expression pedal decoded from `18 02 20 <v> 40 00 00 00` (or heel `18 02 40 00 00 00`, value omitted → 0); see below                                                                                                                 |
| `DecodedStateDump` (`decodeObservedStateDump`)      | `"provisional"`             | Full c305 state dump: amp gain/level/bass/mid/treble, capture slot+volume, firmware, capture/IR names, bypass flags; rendered by `DeviceStateReadout` beside the live-observed Amount dial (amp-knob writes confirmed, Amount display-only) |

### Observed expression pedal (BLE 3-zone)

`decodeObservedExpression(logs)` returns the latest `ObservedExpressionValue` from the
`c305` stream. Per the labeled hardware traces (see
`docs/specs/110-backend-midi-ble/design.md` [DES-BLE-DECODER]), the Nano Cortex reports the
expression pedal **only over BLE** and **quantized to three zones**:

| decoded `raw` (field-4 varint) | `zone` | `percent` |
| ------------------------------ | ------ | --------- |
| `0` (field omitted)            | heel   | 0         |
| `128`                          | center | 50        |
| `255`                          | toe    | 100       |

The decode is guarded to the pedal shape (`18 02 … 40 00 00 00` trailer) so it is not confused
with the knob family (`… 30 01 1A`). The expression control animates between these positions
with a CSS transition, so a heel→toe sweep reads as smooth motion even though only three
discrete values ever arrive. The value is labeled `"provisional"` and the zone is surfaced in
the UI so the coarse, inferred nature stays honest (no false continuous precision).

### Decoder pipeline (`useNanoHardwareState`)

```text
useLogs() → logs: LogEntry[]
  ↓ decodeObservedControlValues(logs)  → ObservedControlValue[] (live)
  ↓ decodeObservedHardwareValues(logs) → ObservedHardwareValue[] (live)
  ↓ filter to current-preset time window → liveControls, liveHardware
  ↓ persist to localStorage via ObservedStateMemory
  ↓ merge live + memory + globalHardware
  → NanoHardwareState { controlsById, hardwareById, source tags }
```

Source tags:

| Source        | Meaning                                                             |
| ------------- | ------------------------------------------------------------------- |
| `"live"`      | Decoded from log lines after entering the current preset            |
| `"memory"`    | Previously decoded and persisted for this preset key                |
| `"last seen"` | Global hardware state from most recent BLE notification, any preset |

---

## [DES-FRONT-EXPERIMENTAL] Experimental Gating Design

`EXPERIMENTAL_FEATURES` (owned by zone 210) gates diagnostics and capture tooling, not the main
Console. The current Console and Floating Tone Studio are visible as product surfaces, but
unverified command families stay disabled, read-only, or labelled at the control level.

### Gate points in `App.tsx`

| Surface                  | Gate mechanism                                                                                                                                                                                    |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Capture Lab sub-tab**  | `AdvancedTabs` only pushes `{ id: "capture", label: "Capture Lab", experimental: true }` when `EXPERIMENTAL_FEATURES` is `true`. The sub-tab cannot be selected or rendered when the flag is off. |
| **ProtocolLab** (render) | `{EXPERIMENTAL_FEATURES && advancedSurface === "capture" && <ProtocolLab ... />}` — both flag and sub-tab selection are required.                                                                 |
| **Diagnostics tab**      | Always available as a read-only surface for opt-in diagnostics capture and USB MIDI trace review.                                                                                                 |
| **Floating Tone Studio** | Opened from Console signal path or Utilities. It does not use the old experimental badge; selected-block controls are enabled only for command families verified by this project.                 |

### `ExperimentalBadge` usage

`ExperimentalBadge` is imported from zone 210 (`frontend/src/shared/ui/components/ExperimentalBadge`).

| Usage site             | Rendered by              | Label     |
| ---------------------- | ------------------------ | --------- |
| Capture Lab tab button | `AdvancedTabs` (App.tsx) | `"Exp"`   |
| `ProtocolLab` header   | `ProtocolLab.tsx`        | (default) |

---

## [DES-FRONT-DEC] Key Decisions

| Decision                                              | Choice                                                        | Rationale                                                                                                                                                            |
| ----------------------------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Composition root in App.tsx                           | All shared state lifted; no separate state management library | Avoids Redux/Zustand for a single-window app; component props are explicit and traceable.                                                                            |
| `TauriMidiConnection` as a class (not a hook)         | Plain TS class held in a `useRef`                             | Allows calling `connection.send*()` methods imperatively from event handlers without stale-closure issues; avoids re-render on connection method call.               |
| Incoming USB MIDI from `midi://message`               | USB is command/trace only                                     | USB MIDI carries commands and optional USB trace rows; BLE device-state requests provide the richer Console/Tone Studio state. Preserves the honest-state invariant. |
| `useNanoHardwareState` persists to `localStorage`     | `ObservedStateMemory` keyed by preset index                   | BLE observations accumulate across sessions without a backend store; provisional data stays in the webview layer where it is visually guarded.                       |
| `protocolLabDecoder` is pure text parsing             | Log-line regex, no Tauri IPC                                  | Keeps BLE decode in the frontend where it can be labelled provisional; avoids promoting log lines to authoritative state in the Rust backend.                        |
| Footswitch model is assignment-only                   | No literal MIDI footswitch press command                      | No documented MIDI command exists for pressing hardware footswitches. The UI models the hardware A/B preset toggle behavior, not a remote press.                     |
| `EXPERIMENTAL_FEATURES` gates Capture Lab diagnostics | Feature flag from zone 210                                    | Allows production builds to hide `ProtocolLab` and the Capture Lab sub-tab. Console and Floating Tone Studio stay available with unsupported controls disabled.      |
| Signal chain order is fixed                           | `nanoSignalChain` array in `fxModel.ts`                       | The Nano Cortex hardware chain is physically fixed; the UI must match hardware role order, not a freeform modeler grid.                                              |
| `ccState` is a flat `Record<cc, boolean>`             | Unified toggle map for all bypass CCs                         | All CC toggles (FX slots, Gate, Capture, Cab, Tuner) share one map; incoming MIDI CC updates and outgoing sends both write/read from it.                             |
| Activity feed capped at 8 entries                     | `slice(0, 8)` in `pushActivity`                               | Enough for stage visibility; prevents unbounded growth without a virtualized list.                                                                                   |
| MIDI log capped at 200 entries                        | `slice(0, 200)` in `appendMidiLog`                            | Covers a full set without virtualization; old entries are trimmed on each push.                                                                                      |
