---
afx: true
type: DESIGN
status: Living
owner: "@richard-sentino"
version: "1.3"
created_at: "2026-06-10T11:54:35.000Z"
updated_at: "2026-07-15T10:12:54.000Z"
tags:
  [
    "ipc",
    "typescript",
    "contracts",
    "events",
    "logs",
    "theme",
    "feature-flags",
    "telemetry",
    "shared",
    "frontend",
  ]
spec: spec.md
---

# 210 Frontend IPC Contracts — Design

## [DES-IPC-OVR] Overview

Zone 210 is a thin typed adapter: it translates Tauri's stringly-typed `invoke`/`listen`
surface into a fully-typed TypeScript API consumed by zone 200 and other frontend zones.
Every call across the Tauri IPC boundary in the webview originates here, so a single file
change in `commands.ts` or `events.ts` is sufficient to update the contract for all consumers.

The zone also provides the two cross-cutting React context providers — `LogProvider` and
`ThemeProvider` — that sit at the root of the component tree, and the three shared UI
primitives (`LogPanel`, `ThemeToggle`, `ExperimentalBadge`) that depend on them. Finally, it
owns the `EXPERIMENTAL_FEATURES` boolean that gates speculative/provisional surfaces in zone 200.

Flow map anchor from the overview: `[Flow.Webview]` (frontend half).

---

## [DES-IPC-ARCH] Architecture

### File Map

```text
frontend/src/shared/
├── ipc/
│   ├── commands.ts          — invoke wrappers + all IPC payload types  [FR-1..15]
│   ├── events.ts            — listen wrappers + event payload types    [FR-16..17]
│   └── errors.ts            — formatError: raw Rust string → user msg  [FR-18]
├── hooks/
│   ├── useLogs.tsx          — LogProvider + useLogs context pair       [FR-19..20]
│   └── useTheme.tsx         — ThemeProvider + useTheme context pair    [FR-21..22]
├── ui/components/
│   ├── LogPanel.tsx         — fixed log overlay (consumes useLogs)     [FR-23]
│   ├── ThemeToggle.tsx      — contrast + theme select (consumes useTheme) [FR-24]
│   ├── ExperimentalBadge.tsx — amber "Experimental" pill               [FR-25]
│   └── TransportBadge.tsx — "USB needed"/"Bluetooth needed" pill       (200 [FR-49])
└── config/
    └── featureFlags.ts      — EXPERIMENTAL_FEATURES boolean            [FR-26]
```

### Layer Position in `[Flow.Webview]`

```text
[Zone 200 — control surface components / hooks / services]
    │  import { listPorts, connect, onMidiMessage, … }  ← from zone 210
    │  import { useLogs, useTheme }                      ← from zone 210
    │  import { EXPERIMENTAL_FEATURES }                  ← from zone 210
    ▼
[Zone 210 — commands.ts / events.ts / errors.ts]
    │  invoke("list_ports" | "connect" | "send_midi" | …)
    │  listen("midi://message" | "midi://connected" | …)
    ▼
[Tauri IPC bridge — zone 120 Rust commands/events]
    │  → USB MIDI (zone 100) / BLE (zone 110) / platform (zone 130)
```

---

## [DES-IPC-COMMANDS] Command Wrappers — `commands.ts`

Each wrapper calls `invoke<ReturnType>(rustCommandName, args?)`. The Rust command name must
match the `#[tauri::command]` function name in `backend/src/ipc/commands.rs` exactly.

### TS ↔ Rust Contract Mapping

| TS wrapper                           | Rust command           | Args (TS → Rust)                        | Return (Rust → TS)        |
| ------------------------------------ | ---------------------- | --------------------------------------- | ------------------------- |
| `listPorts()`                        | `list_ports`           | _(none)_                                | `MidiPort[]`              |
| `connect(deviceName)`                | `connect`              | `{ deviceName: string }`                | `string` (status message) |
| `disconnect()`                       | `disconnect`           | _(none)_                                | `void`                    |
| `sendMidi(portName, bytes)`          | `send_midi`            | `{ portName: string, bytes: number[] }` | `void`                    |
| `getState()`                         | `get_state`            | _(none)_                                | `DeviceState`             |
| `getDeviceName()`                    | `get_device_name`      | _(none)_                                | `string \| null`          |
| `getNanoState()`                     | `get_nano_state`       | _(none)_                                | `NanoState`               |
| `getBleCapabilities()`               | `get_ble_capabilities` | _(none)_                                | `BleCapabilityMatrix`     |
| `getBleDebugLog()`                   | `get_ble_debug_log`    | _(none)_                                | `BlePacketLogEntry[]`     |
| `blePing()`                          | `ble_ping`             | _(none)_                                | `string`                  |
| `bleScan()`                          | `ble_scan`             | _(none)_                                | `string[]`                |
| `traceMarker(label, phase)`          | `trace_marker`         | `{ label: string, phase: string }`      | `void`                    |
| `exportSettingsJson(path, contents)` | `export_settings_json` | `{ path: string, contents: string }`    | `string` (resolved path)  |
| `importSettingsJson(path)`           | `import_settings_json` | `{ path: string }`                      | `string` (raw JSON)       |

### Type Definitions

**`MidiPort`** — mirrors `backend/src/domain/port.rs` `MidiPort`:

```typescript
interface MidiPort {
  id: string; // "usb:<name>" or "usb-in:<name>"
  name: string; // OS-assigned port name
  direction: "in" | "out";
  kind: "usb" | "ble";
}
```

**`DeviceState`** — mirrors `DeviceState` serde lowercase variants:

```typescript
type DeviceState = "disconnected" | "connecting" | "connected" | "error";
```

**`SyncMode`** — mirrors `NanoState.sync_mode` serde values:

```typescript
type SyncMode =
  "full-read-write-sync" | "write-notification-sync" | "command-only" | "disconnected-preview";
```

**`CapabilityStatus`** — mirrors `CapabilityStatus` serde values:

```typescript
type CapabilityStatus =
  "confirmed-readable" | "confirmed-writable" | "inferred" | "unsupported" | "unverified";
```

**`NanoSlotState`** — one signal-chain slot in `NanoState`:

```typescript
interface NanoSlotState {
  role: string;
  loadedName: string | null;
  bypassed: boolean | null;
  active: boolean | null;
  confirmed: boolean;
}
```

**`NanoState`** — mirrors `backend/src/domain/nano_state.rs` `NanoState` (camelCase via serde):

```typescript
interface NanoState {
  connectionStatus: string;
  syncMode: SyncMode;
  activePresetSlot: number | null;
  presetName: string | null;
  bank: string | null;
  captureAssignment: string | null;
  irAssignment: string | null;
  slots: Record<string, NanoSlotState>;
  expressionValue: number | null;
  expressionPercent: number | null;
  stale: boolean;
  provisional: boolean;
}
```

**`BleCapabilityMatrix`** — mirrors `backend/src/domain/nano_state.rs` `CapabilityMatrix`:

```typescript
interface BleCapabilityMatrix {
  activePresetSlot: CapabilityStatus;
  presetName: CapabilityStatus;
  bank: CapabilityStatus;
  captureAssignment: CapabilityStatus;
  irAssignment: CapabilityStatus;
  preFxSlot1: CapabilityStatus;
  preFxSlot2: CapabilityStatus;
  postFxSlot1: CapabilityStatus;
  postFxSlot2: CapabilityStatus;
  postFxSlot3: CapabilityStatus;
  bypassFlags: CapabilityStatus;
  expressionValues: CapabilityStatus;
  notes: string[];
}
```

**`BlePacketLogEntry`** — mirrors `backend/src/infrastructure/midi/ble_debug.rs` `BlePacketLogEntry`:

```typescript
interface BlePacketLogEntry {
  timestampMs: number;
  direction: string;
  deviceName: string | null;
  serviceUuid: string | null;
  characteristicUuid: string | null;
  properties: string[] | null;
  payloadHex: string | null;
  note: string | null;
}
```

---

## [DES-IPC-EVENTS] Event Subscriptions — `events.ts`

Each subscription function calls `listen<PayloadType>(eventName, handler)` and returns the
resulting `Promise<UnlistenFn>`. Callers are responsible for calling the `UnlistenFn` on
component unmount or hook cleanup.

### Event Contract Table

| TS function          | Tauri event            | Payload type                          | Rust emitter                        |
| -------------------- | ---------------------- | ------------------------------------- | ----------------------------------- |
| `onMidiMessage(cb)`  | `midi://message`       | `MidiMessagePayload { ts_ms, bytes }` | `emit_midi_message` in `events.rs`  |
| `onConnected(cb)`    | `midi://connected`     | `ConnectedPayload { name }`           | `emit_connected` in `events.rs`     |
| `onDisconnected(cb)` | `midi://disconnected`  | _(null — callback takes no payload)_  | `emit_disconnected` in `events.rs`  |
| `onMidiError(cb)`    | `midi://error`         | `ErrorPayload { message }`            | `emit_error` in `events.rs`         |
| `onPortsChanged(cb)` | `midi://ports-changed` | `PortsChangedPayload { ports }`       | `emit_ports_changed` in `events.rs` |

Note: `midi://log` is **not** wrapped in `events.ts`. The `LogProvider` in `useLogs.tsx`
subscribes to it directly via `listen("midi://log", …)`. This is intentional: the log
subscription is lifecycle-coupled to the provider and is not a general-use subscription.

### Payload Interfaces

```typescript
interface MidiMessagePayload {
  ts_ms: number;
  bytes: number[];
}
interface ConnectedPayload {
  name: string;
}
interface ErrorPayload {
  message: string;
}
interface PortsChangedPayload {
  ports: Array<{ id: string; name: string; direction: "in" | "out"; kind: "usb" | "ble" }>;
}
```

`PortsChangedPayload.ports` uses an inline type (not `MidiPort`) because `events.ts` does
not import from `commands.ts`, keeping the two modules independent.

---

## [DES-IPC-ERRORS] Error Mapping — `errors.ts`

`formatError(raw: string): string` maps raw Rust `AppError` display strings to user-facing
messages. It iterates the `ERROR_MESSAGES` map and returns the first value whose key is
found as a substring of `raw`. Falls through to `raw` if no key matches.

### Error Map

| Key (Rust `Display` prefix) | User-facing message                                             |
| --------------------------- | --------------------------------------------------------------- |
| `"MIDI error"`              | `"A MIDI communication error occurred. Check your connection."` |
| `"BLE error"`               | `"Bluetooth connection failed. Try again or use USB."`          |
| `"Not found"`               | `"Device not found. Is your Nano Cortex connected?"`            |
| `"Already connected"`       | `"Already connected to a device. Disconnect first."`            |
| `"Not connected"`           | `"Not connected to any device. Connect first."`                 |

The five keys correspond to the five `AppError` variants (`Midi`, `Ble`, `NotFound`,
`AlreadyConnected`, `NotConnected`) as formatted by their `Display` implementation in
`backend/src/app/error.rs`. `Io` and `Serialization` errors fall through to the raw string.

---

## [DES-SHARED-LOGS] Log Provider — `useLogs.tsx`

### `LogEntry` type

```typescript
interface LogEntry {
  ts: number; // Unix-ms timestamp (from Rust midi://log payload)
  level: "debug" | "info" | "success" | "warn" | "error";
  message: string;
}
```

The `level` union mirrors the `level` string emitted by `emit_log` in `backend/src/ipc/events.rs`.
`"success"` is a frontend-enriched level (Rust emits `"info"`; the frontend may set `"success"`
on specific lifecycle events). The cap is 500 entries; excess entries are sliced from the front.

### `LogProvider` lifecycle

```text
mount  → listen("midi://log", handler) → stores UnlistenFn in ref
unmount → cancelled = true (guards against setState after unmount) → call UnlistenFn
```

The `cancelled` flag guards the async gap between `listen(…)` resolving and the component
potentially unmounting before the `UnlistenFn` is stored.

### `useLogs` contract

```typescript
interface LogContextValue {
  logs: LogEntry[];
  clear: () => void;
}
```

Throws `Error("useLogs must be used within LogProvider")` when called outside the provider.

---

## [DES-SHARED-THEME] Theme Provider — `useTheme.tsx`

### Theme types

```typescript
type Theme = "light" | "dark" | "night" | "day" | "dim" | "system";
type ResolvedTheme = Exclude<Theme, "system">; // "light" | "dark" | "night" | "day" | "dim"
```

`"system"` resolves to `"dark"` or `"light"` via `window.matchMedia("(prefers-color-scheme: dark)")`.
If `window.matchMedia` is unavailable, resolves to `"dark"`.

### Storage keys

| Key                           | Value                |
| ----------------------------- | -------------------- |
| `"desktop-nano-cortex-theme"` | `Theme` string       |
| `"desktop-nano-cortex-hc"`    | `"true"` / `"false"` |

### `toggleTheme` cycle

```text
dark → night → dim → light → day → system → dark
```

This cycle moves from a stage-dark (full-black) setting through progressively lighter modes
and back via the OS default. Each step is intentional: `night` and `dim` serve musicians
performing in dark environments.

### DOM side effects

On every `resolved` or `highContrast` state change, `ThemeProvider` sets:

```typescript
document.documentElement.setAttribute("data-theme", resolved);
document.documentElement.toggleAttribute("data-high-contrast", highContrast);
```

CSS variables and Tailwind utilities key off `[data-theme]` and `[data-high-contrast]` at
the root, so all theme-aware components react automatically without prop drilling.

### `useTheme` contract

```typescript
interface ThemeContextValue {
  theme: Theme;
  resolved: ResolvedTheme;
  highContrast: boolean;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
  toggleContrast: () => void;
}
```

Throws `Error("useTheme must be used within ThemeProvider")` when called outside the provider.

---

## [DES-SHARED-UI] Shared UI Primitives

### `LogPanel` — `frontend/src/shared/ui/components/LogPanel.tsx`

A fixed 200 px bottom overlay rendered conditionally on `visible: boolean`. When `visible`
is false, returns `null` (no DOM node). When `visible` is true:

- Renders a header bar (label "Event Log" + "Clear" button bound to `useLogs().clear`).
- Renders a scrollable 155 px body of `LogRow` components.
- Calls `bottomRef.current?.scrollIntoView({ behavior: "smooth" })` when `logs.length`
  changes and `visible` is true.

**`LogRow`** level color map:

| Level     | Color     |
| --------- | --------- |
| `debug`   | `#5d8cff` |
| `info`    | `#888`    |
| `success` | `#34f034` |
| `warn`    | `#f0c034` |
| `error`   | `#f03434` |

`LogPanel` has no `invoke`/`listen` calls. It is a pure consumer of `useLogs`.

### `ThemeToggle` — `frontend/src/shared/ui/components/ThemeToggle.tsx`

A compound control with two interactive elements:

1. **Contrast button** (left): a sun-with-rays SVG icon. `aria-pressed={highContrast}`.
   Calls `toggleContrast()` on click. Background becomes amber-tinted when active.
2. **Theme `<select>`** (right): `<option>` for each of the six `Theme` values using the
   display labels `Dark / Night / Dim / Light / Day / Auto`. Calls `setTheme(value)` on
   change. `aria-label` and `title` reflect the current resolved theme name.

`ThemeToggle` is a pure consumer of `useTheme`. No local state.

### `ExperimentalBadge` — `frontend/src/shared/ui/components/ExperimentalBadge.tsx`

A small inline `<span>` styled as an amber rounded pill. Props:

```typescript
function ExperimentalBadge({ label?: string }): JSX.Element
// default label: "Experimental"
```

Title attribute (tooltip): `"Experimental / provisional — not yet graduated by project evidence"`.

Purpose: communicate the honest-state invariant in the UI. Any surface displaying data not
graduated by project evidence must carry this badge. Zone 200 is the primary consumer
(e.g. BLE state panels), but the badge lives here because zone 210 owns the honest-state
UI primitive shared across zones.

### `TransportBadge` — `frontend/src/shared/ui/components/TransportBadge.tsx`

A small inline `<span>` pill in the `ExperimentalBadge` idiom, marking a control/surface whose
transport is currently unavailable. Props:

```typescript
function TransportBadge({ transport, label? }: { transport: "usb" | "ble"; label?: string }): JSX.Element
// amber guidance pill; default labels: "USB needed" / "Bluetooth needed" (FR-45 dock vocabulary)
```

Title attribute: USB → `"Requires the USB MIDI command path — connect USB"`; BLE →
`"Requires Bluetooth device state — connect Bluetooth"`. Consumers render it only while the
transport is missing (`200 [FR-49]`); it must never appear when the transport is active.

---

## [DES-SHARED-FLAGS] Feature Flag — `featureFlags.ts`

```typescript
export const EXPERIMENTAL_FEATURES: boolean =
  import.meta.env.VITE_EXPERIMENTAL === "true" || import.meta.env.DEV;
```

### Evaluation rules

| Build context                              | `import.meta.env.DEV` | `VITE_EXPERIMENTAL`  | `EXPERIMENTAL_FEATURES` |
| ------------------------------------------ | --------------------- | -------------------- | ----------------------- |
| `vite dev`                                 | `true`                | any                  | `true`                  |
| `vite build` (production, default)         | `false`               | unset / not `"true"` | `false`                 |
| `vite build` with `VITE_EXPERIMENTAL=true` | `false`               | `"true"`             | `true`                  |

### Governed surfaces (zone 200 call-sites)

Zone 200 gates the following surfaces behind `EXPERIMENTAL_FEATURES`:

- BLE scan / BLE state panels derived from provisional packet decoding.
- Any UI labelled `ExperimentalBadge` that reads from `NanoState` fields with
  `CapabilityStatus` values other than `"confirmed-readable"`.
- Developer diagnostics (BLE debug log viewer, trace marker input).

### Honest-state invariant

`EXPERIMENTAL_FEATURES = false` means only the documented MIDI control surface is visible
to end users: preset selection via Program Change, FX toggles via Control Change, expression
via CC 1, tap tempo via CC 42, tuner via CC 43. No speculative BLE-derived editor state is
presented as authoritative when the flag is off.

This flag is the runtime enforcement of the project-wide honest-state rule
(see `[DES-DEC]` in `001-overview/design.md`).

---

## [DES-SHARED-TELEMETRY] Telemetry — `telemetry/clarity.ts`

### Default-on, opt-out model

```typescript
export function isTelemetryEnabled(): boolean {
  if (typeof localStorage === "undefined") return true;
  return localStorage.getItem(TELEMETRY_ENABLED_STORAGE_KEY) !== "false";
}
```

The preference is stored as a tri-state string (`"true"` / `"false"` / absent), read as
enabled unless explicitly `"false"`. This makes "no preference recorded yet" equivalent to
"enabled" — the opt-out default — while an explicit user choice in either direction is
durable across restarts. The About tab (`AboutPanel.tsx`, zone 200 FR-39) is the only UI for
this toggle.

### Boot injection and idempotency

`initClarity()` is called once from `main.tsx`, before the React tree mounts, so Clarity's
JS-error listener is attached as early as possible. It guards on three conditions before
injecting the tag: an in-module `injected` flag (idempotent against repeated calls), test
mode (`import.meta.env.MODE === "test"`, so the Vitest suite never contacts `clarity.ms` or
touches `window.clarity`), and `isTelemetryEnabled()`. The injected snippet is Microsoft's
standard tag verbatim, parameterized only by the project ID constant.

### No official runtime "stop" API

Toggling the About-tab switch **on** mid-session calls `initClarity()` immediately — turning
telemetry on takes effect right away, since injection is idempotent and was previously
skipped. Toggling it **off** only prevents injection on the _next_ launch: Microsoft Clarity
does not publish a supported runtime command to fully unload an already-initialized session.
The About-tab copy states this honestly ("takes full effect the next time you launch the
app") rather than implying an instant kill switch that does not exist.

### Log forwarding

`useLogs.tsx`'s `addLog` calls `sendClarityLog(entry)` immediately after appending each
`LogEntry` to state — this is the single choke point every `midi://log` line passes through
exactly once, so entries are never re-sent on re-render. Each entry becomes one Clarity
custom event named `"<level>: <message>"`, truncated to 200 characters (Clarity's `event`
API takes a label, not a structured payload, and this app's diagnostic messages can include
long BLE hex dumps). `sendClarityLog` independently re-checks `isTelemetryEnabled()` and
`typeof window.clarity === "function"` so it is always safe to call regardless of `initClarity`
timing or test mode.

### Why `shared/telemetry/`, not zone 200

The module is infrastructure consumed by a zone-210-owned hook (`useLogs.tsx`) and a
zone-200-owned UI surface (`AboutPanel.tsx`); it has no MIDI/BLE business logic of its own.
Placing it alongside `shared/hooks/` and `shared/ipc/` keeps the pattern consistent with how
this zone already hosts cross-cutting frontend infrastructure that zone 200 consumes but does
not own.

### Session-replay fidelity — CSS must live in the DOM

Session replay re-fetches stylesheets from their recorded URLs. The packaged app serves assets
from the private webview origin (`tauri://localhost` / `http://tauri.localhost`), which replay
services cannot reach — a linked stylesheet renders replays unstyled (only sub-4 KB data-URI
SVGs survive). `vite-plugin-css-injected-by-js` (`vite.config.ts`) makes production builds emit
no CSS asset and inject the stylesheet as a runtime `<style>` DOM node, which is serialized
with the recording. Dev builds already inject CSS via `<style>`. Events/heatmap data were never
affected. Replay text may still be blanked by the project's masking mode (dashboard setting).

---

## [DES-IPC-DEC] Key Decisions

| Decision                                                                         | Choice                                         | Rationale                                                                                                                                                                                                                               |
| -------------------------------------------------------------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `commands.ts` and `events.ts` are separate modules                               | Not one file                                   | Commands are request/response; events are push-only subscriptions. Separate modules let callers import only what they need and make the distinction explicit.                                                                           |
| `events.ts` does not wrap `midi://log`                                           | `useLogs.tsx` subscribes directly              | The log subscription is lifecycle-coupled to `LogProvider`; wrapping it in `events.ts` would add no value and would imply a general-use subscription pattern where one does not exist.                                                  |
| `PortsChangedPayload.ports` uses an inline type                                  | Not `MidiPort` from `commands.ts`              | Avoids a cross-module import between `events.ts` and `commands.ts`. The inline type is identical in shape; TypeScript's structural typing ensures compatibility.                                                                        |
| `LogProvider` uses a `cancelled` flag instead of checking the ref                | Async gap guard                                | `listen()` is async; the component could unmount before the `UnlistenFn` is stored in the ref. The `cancelled` flag short-circuits the callback and the ref assignment.                                                                 |
| `ThemeProvider` applies `data-theme` / `data-high-contrast` on `documentElement` | Not via class names or CSS-in-JS               | Tailwind 4 variants and CSS custom property selectors key off `data-*` attributes at the root. This is the idiomatic approach for global theme application without prop drilling.                                                       |
| `EXPERIMENTAL_FEATURES` is a module-level constant                               | Not a React context or env query per-component | Evaluated once at module load; `import.meta.env` values are inlined by Vite at build time. Making it a constant enables tree-shaking: production builds with `EXPERIMENTAL_FEATURES = false` can be statically analyzed by the bundler. |
| `ExperimentalBadge` lives in zone 210, not zone 200                              | Shared primitive with cross-zone use           | The badge enforces the honest-state invariant, which is architectural, not a feature. Zone 200 is its primary consumer but zone 210 owns the invariant's UI representation.                                                             |
| `formatError` uses substring matching                                            | Not an enum or code-based map                  | Rust `AppError::Display` strings are free-form prefixed text. Substring matching is the simplest approach that does not require a separate error code protocol in the IPC layer.                                                        |
