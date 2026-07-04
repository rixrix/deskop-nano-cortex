---
afx: true
type: SPEC
status: Living
owner: "@richard-sentino"
version: "1.1"
created_at: "2026-06-10T11:54:35.000Z"
updated_at: "2026-07-06T07:20:42.000Z"
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
---

# 210 Frontend IPC Contracts — Spec

> TypeScript IPC contracts, context providers, shared UI primitives, and feature-flag gate.
> This zone is the frontend's narrow waist: every Tauri command invocation and every event
> subscription the webview makes goes through the typed wrappers defined here. Zone 200
> (control surface) consumes these exports — it does not call `invoke` or `listen` directly.

## References

- **Architecture overview**: [`../001-overview/spec.md`](../001-overview/spec.md) — traceability rules, routing index, glossary
- **System flow map**: [`../001-overview/design.md`](../001-overview/design.md) — `[Flow.Webview]`
- **Backend IPC (Rust counterpart)**: [`../120-backend-ipc/spec.md`](../120-backend-ipc/spec.md) — the Tauri commands/events these TS contracts mirror
- **Control surface (consumer of this zone)**: [`../200-frontend-control-surface/spec.md`](../200-frontend-control-surface/spec.md)

---

## Problem Statement

The React webview needs a stable, typed contract layer between the Rust backend and the
React control surface. Without it, `invoke` strings and event names would be scattered across
feature components, making cross-zone refactors brittle and leaving no single document
describing the full frontend-facing IPC surface.

This zone owns that contract layer as TypeScript: command wrappers (`commands.ts`), event
subscriptions (`events.ts`), error mapping (`errors.ts`), and the shared context providers
(`LogProvider`/`useLogs`, `ThemeProvider`/`useTheme`) that depend on the IPC layer. It also
owns the shared UI primitives (`LogPanel`, `ThemeToggle`, `ExperimentalBadge`) and the
`EXPERIMENTAL_FEATURES` flag that gates provisional BLE surfaces in production builds.

The zone does **not** own business logic for MIDI commands, device state management, or UI
components that belong to the control surface. Those live in zone 200.

---

## Requirements

### Functional Requirements

| ID    | Requirement                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Priority    |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| FR-1  | Provide TypeScript types for all IPC payload structures: `MidiPort`, `DeviceState`, `SyncMode`, `CapabilityStatus`, `NanoSlotState`, `NanoState`, `BleCapabilityMatrix`, `BlePacketLogEntry`.                                                                                                                                                                                                                                                                                 | Must Have   |
| FR-2  | Provide `listPorts(): Promise<MidiPort[]>` — wraps Rust `list_ports`.                                                                                                                                                                                                                                                                                                                                                                                                         | Must Have   |
| FR-3  | Provide `connect(deviceName): Promise<string>` — wraps Rust `connect`.                                                                                                                                                                                                                                                                                                                                                                                                        | Must Have   |
| FR-4  | Provide `disconnect(): Promise<void>` — wraps Rust `disconnect`.                                                                                                                                                                                                                                                                                                                                                                                                              | Must Have   |
| FR-5  | Provide `sendMidi(portName, bytes): Promise<void>` — wraps Rust `send_midi`.                                                                                                                                                                                                                                                                                                                                                                                                  | Must Have   |
| FR-6  | Provide `getState(): Promise<DeviceState>` — wraps Rust `get_state`.                                                                                                                                                                                                                                                                                                                                                                                                          | Must Have   |
| FR-7  | Provide `getDeviceName(): Promise<string \| null>` — wraps Rust `get_device_name`.                                                                                                                                                                                                                                                                                                                                                                                            | Must Have   |
| FR-8  | Provide `getNanoState(): Promise<NanoState>` — wraps Rust `get_nano_state`.                                                                                                                                                                                                                                                                                                                                                                                                   | Must Have   |
| FR-9  | Provide `getBleCapabilities(): Promise<BleCapabilityMatrix>` — wraps Rust `get_ble_capabilities`.                                                                                                                                                                                                                                                                                                                                                                             | Must Have   |
| FR-10 | Provide `getBleDebugLog(): Promise<BlePacketLogEntry[]>` — wraps Rust `get_ble_debug_log`.                                                                                                                                                                                                                                                                                                                                                                                    | Must Have   |
| FR-11 | Provide `blePing(): Promise<string>` — wraps Rust `ble_ping`.                                                                                                                                                                                                                                                                                                                                                                                                                 | Must Have   |
| FR-12 | Provide `bleScan(): Promise<string[]>` — wraps Rust `ble_scan`.                                                                                                                                                                                                                                                                                                                                                                                                               | Must Have   |
| FR-13 | Provide `traceMarker(label, phase): Promise<void>` — wraps Rust `trace_marker`.                                                                                                                                                                                                                                                                                                                                                                                               | Should Have |
| FR-14 | Provide `exportSettingsJson(path, contents): Promise<string>` — wraps Rust `export_settings_json`.                                                                                                                                                                                                                                                                                                                                                                            | Should Have |
| FR-15 | Provide `importSettingsJson(path): Promise<string>` — wraps Rust `import_settings_json`.                                                                                                                                                                                                                                                                                                                                                                                      | Should Have |
| FR-16 | Provide typed event subscription functions: `onMidiMessage`, `onConnected`, `onDisconnected`, `onMidiError`, `onPortsChanged`; each returns `Promise<UnlistenFn>`.                                                                                                                                                                                                                                                                                                            | Must Have   |
| FR-17 | Define event payload interfaces: `MidiMessagePayload { ts_ms, bytes }`, `ConnectedPayload { name }`, `ErrorPayload { message }`, `PortsChangedPayload { ports }`.                                                                                                                                                                                                                                                                                                             | Must Have   |
| FR-18 | Provide `formatError(raw: string): string` mapping raw Rust error strings to user-facing messages for the five `AppError` variants surfaced to the frontend.                                                                                                                                                                                                                                                                                                                  | Must Have   |
| FR-19 | Provide `LogProvider` / `useLogs` React context pair: `LogProvider` subscribes to `midi://log`, maintains up to 500 `LogEntry` values in state, and forwards each new entry to Clarity telemetry (see FR-28; no-op when disabled); `useLogs` exposes `{ logs, clear }`.                                                                                                                                                                                                       | Must Have   |
| FR-20 | `LogEntry` type is `{ ts: number; level: "debug" \| "info" \| "success" \| "warn" \| "error"; message: string }`.                                                                                                                                                                                                                                                                                                                                                             | Must Have   |
| FR-21 | Provide `ThemeProvider` / `useTheme` React context pair: `ThemeProvider` manages theme selection across six options (`dark`, `night`, `dim`, `light`, `day`, `system`), persists to `localStorage`, applies `data-theme` and `data-high-contrast` attributes to `document.documentElement`, and tracks high-contrast mode.                                                                                                                                                    | Must Have   |
| FR-22 | `useTheme` exposes `{ theme, resolved, highContrast, setTheme, toggleTheme, toggleContrast }`; `toggleTheme` cycles `dark → night → dim → light → day → system → dark`.                                                                                                                                                                                                                                                                                                       | Must Have   |
| FR-23 | Provide `LogPanel` shared UI component: renders a fixed 200 px bottom overlay displaying up to 500 `LogEntry` rows with level-coded colors and a Clear button; auto-scrolls to bottom on new entries when `visible` is true.                                                                                                                                                                                                                                                  | Must Have   |
| FR-24 | Provide `ThemeToggle` shared UI component: renders a compound control — a high-contrast toggle button and a `<select>` cycling through the six theme options. Reads/writes via `useTheme`.                                                                                                                                                                                                                                                                                    | Must Have   |
| FR-25 | Provide `ExperimentalBadge` shared UI component: renders a small amber pill labelled "Experimental" (or a custom label) to mark surfaces that are not yet graduated by project evidence.                                                                                                                                                                                                                                                                                      | Must Have   |
| FR-26 | Provide `EXPERIMENTAL_FEATURES: boolean` flag: `true` when `VITE_EXPERIMENTAL === "true"` or the Vite dev server is active (`import.meta.env.DEV`); `false` in production builds by default. This flag gates experimental/provisional surfaces in zone 200.                                                                                                                                                                                                                   | Must Have   |
| FR-27 | Provide typed wrappers and payload types for planned BLE deep-editor commands: FX model select, FX parameter write, FX/gate bypass, gate reduction, capture assignment, cab/IR assignment, cab mic/position, and Save. Product UI must use these wrappers; raw `sendBleFrame` remains a lab escape hatch.                                                                                                                                                                     | Should Have |
| FR-28 | Provide a Microsoft Clarity telemetry module (`shared/telemetry/clarity.ts`): `isTelemetryEnabled()`/`setTelemetryEnabled()` persist an opt-out preference to `localStorage` (default **enabled** when unset), `initClarity()` injects the Clarity tag once at boot when enabled (no-op in test mode or when disabled), and `sendClarityLog(entry)` forwards each `LogEntry` from `useLogs` as a Clarity custom event (level + message, truncated to 200 chars) when enabled. | Must Have   |

### Non-Functional Requirements

| ID    | Requirement                                                                                                                                                                                      | Target                     |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------- |
| NFR-1 | Each `invoke` wrapper must name the Rust command with a string literal matching the `#[tauri::command]` name exactly; typos cause silent runtime errors.                                         | Code invariant             |
| NFR-2 | Event listener functions must call the Tauri `listen` API with the exact `midi://` event name and return the `UnlistenFn` so callers can clean up subscriptions.                                 | Code invariant             |
| NFR-3 | `LogProvider` must cap at 500 entries (slice to last 500) to prevent unbounded memory growth in long sessions.                                                                                   | Enforced in implementation |
| NFR-4 | `ThemeProvider` must not rely on DOM APIs during SSR/test contexts; `localStorage` access is guarded with `typeof window !== "undefined"`.                                                       | Code invariant             |
| NFR-5 | `EXPERIMENTAL_FEATURES` is evaluated at module load time; it must not be mutable after initialization.                                                                                           | Code invariant             |
| NFR-6 | Shared UI primitives (`LogPanel`, `ThemeToggle`, `ExperimentalBadge`) have no MIDI business logic or direct `invoke`/`listen` calls; they are pure presentational consumers of context or props. | Architectural invariant    |

---

## Acceptance Criteria

- [x] `listPorts()` compiles and resolves to `MidiPort[]` from Rust `list_ports`.
- [x] `connect(deviceName)` resolves to `string` on success; rejects with an error string on failure.
- [x] `disconnect()` resolves to `void`; rejects on error.
- [x] `sendMidi(portName, bytes)` resolves to `void`; `bytes` is typed `number[]`.
- [x] `getState()` resolves to a `DeviceState` literal.
- [x] `getDeviceName()` resolves to `string | null`.
- [x] `getNanoState()` resolves to a `NanoState` with all documented fields.
- [x] `getBleCapabilities()` resolves to `BleCapabilityMatrix`.
- [x] `getBleDebugLog()` resolves to `BlePacketLogEntry[]`.
- [x] `blePing()` and `bleScan()` compile and type-check correctly.
- [x] `traceMarker`, `exportSettingsJson`, `importSettingsJson` compile and type-check correctly.
- [x] `onMidiMessage`, `onConnected`, `onDisconnected`, `onMidiError`, `onPortsChanged` each return `Promise<UnlistenFn>`.
- [x] `formatError("MIDI error: …")` returns the user-facing MIDI error message.
- [x] `LogProvider` subscribes to `midi://log` on mount and unsubscribes on unmount.
- [x] `useLogs` throws if called outside `LogProvider`.
- [x] `LogProvider` does not exceed 500 entries (excess entries are trimmed from the front).
- [x] `ThemeProvider` applies `data-theme` and `data-high-contrast` attributes on every theme/contrast change.
- [x] `useTheme` throws if called outside `ThemeProvider`.
- [x] `ThemeProvider` persists theme and high-contrast preference to `localStorage` under the documented keys.
- [x] `LogPanel` is invisible when `visible={false}` and auto-scrolls when `visible={true}`.
- [x] `ThemeToggle` renders a contrast button and a theme `<select>` driven by `useTheme`.
- [x] `ExperimentalBadge` renders the amber pill with correct accessible title attribute.
- [x] `EXPERIMENTAL_FEATURES` is `true` during `vite dev` and `false` in a production Vite build without `VITE_EXPERIMENTAL=true`.
- [x] `isTelemetryEnabled()` returns `true` when no preference is stored; `setTelemetryEnabled(false)`/`(true)` persist and are reflected on the next read (FR-28).
- [x] `initClarity()` and `sendClarityLog()` are no-ops in test mode (`import.meta.env.MODE === "test"`) — no script tag is injected and `window.clarity` is never called during the test suite (FR-28).
- [x] `useLogs`'s `addLog` calls `sendClarityLog(entry)` for every new log line, in addition to updating local state (FR-19, FR-28).

---

## Non-Goals

- MIDI command construction (Program Change, Control Change helpers) — owned by zone 200 service layer.
- Device state management (connection machine, preset model) — owned by zone 200.
- UI components for the control surface (preset grid, signal chain, footswitch) — owned by zone 200.
- Backend Tauri command implementation — owned by zone 120.
- BLE transport protocol decoding — owned by zone 110.
- Platform settings persistence (disk reads/writes for settings) — owned by zone 130.
- CSS design tokens / Tailwind config — referenced by all frontend zones but not exclusively owned here.

---

## Dependencies

- `@tauri-apps/api` — `invoke` (commands) and `listen` / `UnlistenFn` (events).
- `react` — `createContext`, `useContext`, `useState`, `useEffect`, `useCallback`, `useRef`.
- `vite` — `import.meta.env.DEV` and `import.meta.env.VITE_EXPERIMENTAL` for feature flag evaluation.
- **Zone 120** (runtime): Rust `#[tauri::command]` handlers and `midi://*` events that this zone wraps.
- **Zone 200** (consumer): imports all exports from this zone; does not call `invoke`/`listen` directly.

---

## Appendix

### Agent Entry Map

| Owned file                                                | Local anchors | Key exports                                                                                                                                                                                                                                                                                                                                                 | Tests                 | Dependencies                                               | Out of scope                               |
| --------------------------------------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- | ---------------------------------------------------------- | ------------------------------------------ |
| `frontend/src/shared/ipc/commands.ts`                     | [FR-1..15]    | `MidiPort`, `DeviceState`, `SyncMode`, `CapabilityStatus`, `NanoSlotState`, `NanoState`, `BleCapabilityMatrix`, `BlePacketLogEntry`; `listPorts`, `connect`, `disconnect`, `sendMidi`, `getState`, `getDeviceName`, `getNanoState`, `getBleCapabilities`, `getBleDebugLog`, `blePing`, `bleScan`, `traceMarker`, `exportSettingsJson`, `importSettingsJson` | none (contract layer) | `@tauri-apps/api/core`                                     | MIDI business logic                        |
| `frontend/src/shared/ipc/events.ts`                       | [FR-16..17]   | `MidiMessagePayload`, `ConnectedPayload`, `ErrorPayload`, `PortsChangedPayload`; `onMidiMessage`, `onConnected`, `onDisconnected`, `onMidiError`, `onPortsChanged`                                                                                                                                                                                          | none                  | `@tauri-apps/api/event`                                    | `midi://log` (subscribed in `useLogs`)     |
| `frontend/src/shared/ipc/errors.ts`                       | [FR-18]       | `formatError`                                                                                                                                                                                                                                                                                                                                               | none                  | none                                                       | Backend AppError definition                |
| `frontend/src/shared/hooks/useLogs.tsx`                   | [FR-19..20]   | `LogEntry`, `LogProvider`, `useLogs`                                                                                                                                                                                                                                                                                                                        | Vitest                | `@tauri-apps/api/event`, react, `shared/telemetry/clarity` | LogPanel rendering                         |
| `frontend/src/shared/telemetry/clarity.ts`                | [FR-28]       | `isTelemetryEnabled`, `setTelemetryEnabled`, `initClarity`, `sendClarityLog`                                                                                                                                                                                                                                                                                | Vitest                | `localStorage`, `LogEntry` (type-only)                     | Clarity dashboard/backend                  |
| `frontend/src/shared/hooks/useTheme.tsx`                  | [FR-21..22]   | `Theme`, `ResolvedTheme`, `ThemeProvider`, `useTheme`                                                                                                                                                                                                                                                                                                       | none                  | react, `localStorage`                                      | CSS token application                      |
| `frontend/src/shared/ui/components/LogPanel.tsx`          | [FR-23]       | `LogPanel`                                                                                                                                                                                                                                                                                                                                                  | none                  | `useLogs`                                                  | Log persistence, `midi://log` subscription |
| `frontend/src/shared/ui/components/ThemeToggle.tsx`       | [FR-24]       | `ThemeToggle`                                                                                                                                                                                                                                                                                                                                               | none                  | `useTheme`                                                 | Theme persistence logic                    |
| `frontend/src/shared/ui/components/ExperimentalBadge.tsx` | [FR-25]       | `ExperimentalBadge`                                                                                                                                                                                                                                                                                                                                         | none                  | none                                                       | `EXPERIMENTAL_FEATURES` gating logic       |
| `frontend/src/shared/config/featureFlags.ts`              | [FR-26]       | `EXPERIMENTAL_FEATURES`                                                                                                                                                                                                                                                                                                                                     | none                  | `import.meta.env`                                          | Zone 200 gating call-sites                 |
