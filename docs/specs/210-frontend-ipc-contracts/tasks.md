---
afx: true
type: TASKS
status: Living
owner: "@richard-sentino"
version: "1.0"
created_at: "2026-06-10T11:54:35.000Z"
updated_at: "2026-07-04T10:47:11.000Z"
tags:
  [
    "ipc",
    "typescript",
    "contracts",
    "events",
    "logs",
    "theme",
    "feature-flags",
    "shared",
    "frontend",
  ]
spec: spec.md
design: design.md
---

# 210 Frontend IPC Contracts — Tasks

> Backfilled implementation checklist. Code shipped in the initial sprint (2026-06-10 – 2026-06-13).
> All items are complete; no open hardware-verification tasks exist for this zone.

---

## Phase 0: IPC Type Definitions and Command Wrappers

<!-- files: frontend/src/shared/ipc/commands.ts -->
<!-- @see docs/specs/210-frontend-ipc-contracts/spec.md [FR-1] [FR-2] [FR-3] [FR-4] [FR-5] [FR-6] [FR-7] [FR-8] [FR-9] [FR-10] [FR-11] [FR-12] [FR-13] [FR-14] [FR-15] -->
<!-- @see docs/specs/210-frontend-ipc-contracts/design.md [DES-IPC-COMMANDS] -->

- [x] Define `MidiPort` interface mirroring Rust `MidiPort` (`id`, `name`, `direction: "in" | "out"`, `kind: "usb" | "ble"`).
- [x] Define `DeviceState` union type (`"disconnected" | "connecting" | "connected" | "error"`).
- [x] Define `SyncMode` union type for four NanoState sync modes.
- [x] Define `CapabilityStatus` union type for five BLE capability statuses.
- [x] Define `NanoSlotState` interface.
- [x] Define `NanoState` interface with all fields (camelCase, matching Rust serde output).
- [x] Define `BleCapabilityMatrix` interface with all thirteen capability fields (incl. `save`) plus `notes: string[]`.
- [x] Define `BlePacketLogEntry` interface with all eight fields.
- [x] Implement `listPorts()` → `invoke<MidiPort[]>("list_ports")`.
- [x] Implement `connect(deviceName)` → `invoke<string>("connect", { deviceName })`.
- [x] Implement `disconnect()` → `invoke<void>("disconnect")`.
- [x] Implement `sendMidi(portName, bytes)` → `invoke<void>("send_midi", { portName, bytes })`.
- [x] Implement `getState()` → `invoke<DeviceState>("get_state")`.
- [x] Implement `getDeviceName()` → `invoke<string | null>("get_device_name")`.
- [x] Implement `getNanoState()` → `invoke<NanoState>("get_nano_state")`.
- [x] Implement `getBleCapabilities()` → `invoke<BleCapabilityMatrix>("get_ble_capabilities")`.
- [x] Implement `getBleDebugLog()` → `invoke<BlePacketLogEntry[]>("get_ble_debug_log")`.
- [x] Implement `blePing()` → `invoke<string>("ble_ping")`.
- [x] Implement `bleScan()` → `invoke<string[]>("ble_scan")`.
- [x] Implement `traceMarker(label, phase)` → `invoke<void>("trace_marker", { label, phase })`.
- [x] Implement `exportSettingsJson(path, contents)` → `invoke<string>("export_settings_json", { path, contents })`.
- [x] Implement `importSettingsJson(path)` → `invoke<string>("import_settings_json", { path })`.

---

## Phase 1: Event Subscription Wrappers

<!-- files: frontend/src/shared/ipc/events.ts -->
<!-- @see docs/specs/210-frontend-ipc-contracts/spec.md [FR-16] [FR-17] -->
<!-- @see docs/specs/210-frontend-ipc-contracts/design.md [DES-IPC-EVENTS] -->

- [x] Define `MidiMessagePayload` interface (`ts_ms: number`, `bytes: number[]`).
- [x] Define `ConnectedPayload` interface (`name: string`).
- [x] Define `ErrorPayload` interface (`message: string`).
- [x] Define `PortsChangedPayload` interface with inline port shape.
- [x] Implement `onMidiMessage(cb)` → `listen<MidiMessagePayload>("midi://message", …)`.
- [x] Implement `onConnected(cb)` → `listen<ConnectedPayload>("midi://connected", …)`.
- [x] Implement `onDisconnected(cb)` → `listen("midi://disconnected", () => cb())`.
- [x] Implement `onMidiError(cb)` → `listen<ErrorPayload>("midi://error", …)`.
- [x] Implement `onPortsChanged(cb)` → `listen<PortsChangedPayload>("midi://ports-changed", …)`.

---

## Phase 2: Error Mapping

<!-- files: frontend/src/shared/ipc/errors.ts -->
<!-- @see docs/specs/210-frontend-ipc-contracts/spec.md [FR-18] -->
<!-- @see docs/specs/210-frontend-ipc-contracts/design.md [DES-IPC-ERRORS] -->

- [x] Define `ERROR_MESSAGES` map with keys matching Rust `AppError` display prefixes.
- [x] Implement `formatError(raw)`: iterate map, return first match, fall through to `raw`.
- [x] Cover all five `AppError` variants surfaced to the frontend: `Midi`, `Ble`, `NotFound`, `AlreadyConnected`, `NotConnected`.

---

## Phase 3: Log Context Provider

<!-- files: frontend/src/shared/hooks/useLogs.tsx -->
<!-- @see docs/specs/210-frontend-ipc-contracts/spec.md [FR-19] [FR-20] -->
<!-- @see docs/specs/210-frontend-ipc-contracts/design.md [DES-SHARED-LOGS] -->

- [x] Define `LogEntry` interface (`ts`, `level` union, `message`).
- [x] Define `LogContext` with `LogContextValue { logs, clear }`.
- [x] Implement `LogProvider`: `useEffect` subscribes to `midi://log` on mount; stores `UnlistenFn` in ref; sets `cancelled = true` and calls `UnlistenFn` on unmount.
- [x] Implement log cap at `MAX_LOGS = 500`; `setLogs` slices excess from the front.
- [x] Implement `clear` callback via `useCallback` (`setLogs([])`).
- [x] Implement `useLogs` hook: reads context; throws `"useLogs must be used within LogProvider"` if null.

---

## Phase 4: Theme Context Provider

<!-- files: frontend/src/shared/hooks/useTheme.tsx -->
<!-- @see docs/specs/210-frontend-ipc-contracts/spec.md [FR-21] [FR-22] -->
<!-- @see docs/specs/210-frontend-ipc-contracts/design.md [DES-SHARED-THEME] -->

- [x] Define `Theme` union and `ResolvedTheme` (`Exclude<Theme, "system">`).
- [x] Define `ThemeContextValue` interface.
- [x] Implement `ThemeProvider`: read `localStorage` for initial theme and high-contrast state.
- [x] Implement `resolve(t)`: maps `"system"` via `matchMedia`; falls back to `"dark"`.
- [x] Implement `setTheme(t)`: updates state, writes `localStorage`, updates resolved.
- [x] Implement `toggleTheme()`: cycles `dark → night → dim → light → day → system → dark`.
- [x] Implement `toggleContrast()`: flips `highContrast` and persists to `localStorage`.
- [x] `useEffect` on `matchMedia` change: re-resolves theme when `theme === "system"`.
- [x] `useEffect` on `resolved` / `highContrast`: applies `data-theme` and `data-high-contrast` to `document.documentElement`.
- [x] Implement `useTheme` hook: throws `"useTheme must be used within ThemeProvider"` if null.

---

## Phase 5: Shared UI Primitives

<!-- files: frontend/src/shared/ui/components/LogPanel.tsx, frontend/src/shared/ui/components/ThemeToggle.tsx, frontend/src/shared/ui/components/ExperimentalBadge.tsx -->
<!-- @see docs/specs/210-frontend-ipc-contracts/spec.md [FR-23] [FR-24] [FR-25] -->
<!-- @see docs/specs/210-frontend-ipc-contracts/design.md [DES-SHARED-UI] -->

- [x] Implement `LogPanel({ visible })`: fixed bottom overlay, 200 px height.
- [x] Implement `LogRow`: renders timestamp, level (color-coded), and message.
- [x] Wire `LogPanel` header "Clear" button to `useLogs().clear`.
- [x] Implement auto-scroll: `bottomRef.current?.scrollIntoView({ behavior: "smooth" })` on `logs.length` change when `visible`.
- [x] Implement `ThemeToggle`: contrast icon-button + theme `<select>` with all six `THEME_OPTIONS`.
- [x] Wire `ThemeToggle` contrast button to `toggleContrast()`; set `aria-pressed={highContrast}`.
- [x] Wire `ThemeToggle` `<select>` to `setTheme(event.target.value as Theme)`.
- [x] Implement `ExperimentalBadge({ label? })`: amber pill with `title` attribute conveying provisional/experimental meaning.

---

## Phase 6: Feature Flag

<!-- files: frontend/src/shared/config/featureFlags.ts -->
<!-- @see docs/specs/210-frontend-ipc-contracts/spec.md [FR-26] -->
<!-- @see docs/specs/210-frontend-ipc-contracts/design.md [DES-SHARED-FLAGS] -->

- [x] Define `EXPERIMENTAL_FEATURES` as `import.meta.env.VITE_EXPERIMENTAL === "true" || import.meta.env.DEV`.
- [x] Confirm `EXPERIMENTAL_FEATURES` evaluates to `true` during `vite dev`.
- [x] Confirm `EXPERIMENTAL_FEATURES` evaluates to `false` in a production `vite build` without `VITE_EXPERIMENTAL`.
- [ ] Confirm tree-shaking of gated code paths in a production build (bundler analysis — not yet performed).

---

## Phase 7: Deep Editor IPC Contracts (planned)

<!-- files: frontend/src/shared/ipc/commands.ts -->
<!-- @see docs/specs/210-frontend-ipc-contracts/spec.md [FR-1] [FR-27] -->
<!-- @see docs/specs/120-backend-ipc/spec.md [FR-29] [FR-31] [FR-32] [FR-34] -->

- [ ] Extend `NanoState`, `NanoSlotState`, and `BleCapabilityMatrix` TypeScript interfaces with decoded FX model IDs/names, gate state, and any new capability fields added by the Rust domain model.
- [ ] Add typed wrappers for the planned deep editor commands: FX model select, FX param write, FX/gate bypass, gate reduction, capture slot/volume, cab/IR slot/params, cab mic/position, and any refresh requests exposed by backend IPC.
- [ ] Keep `sendBleFrame(bytes, charUuid?)` as a verification/lab escape hatch, but route product UI through typed wrappers once they exist.
- [ ] Add contract tests/mocks that assert each wrapper invokes the exact Rust command name with camelCase args matching serde output.

---

## Work Sessions

| Date       | Task                                        | Action | Files Modified                                                                                                                                 | Agent | Human |
| ---------- | ------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ----- |
| 2026-06-13 | Phase 0–6 (backfill)                        | Coded  | docs/specs/210-frontend-ipc-contracts/spec.md, docs/specs/210-frontend-ipc-contracts/design.md, docs/specs/210-frontend-ipc-contracts/tasks.md | [x]   | [x]   |
| 2026-07-08 | Fix broken telemetry session replay (FR-28) | Coded  | frontend/vite.config.ts, frontend/package.json, docs/specs/210-frontend-ipc-contracts/spec.md, docs/specs/210-frontend-ipc-contracts/design.md | [x]   | [x]   |
| 2026-07-15 | TransportBadge shared primitive (200 FR-49) | Coded  | frontend/src/shared/ui/components/TransportBadge.tsx, docs/specs/210-frontend-ipc-contracts/design.md                                          | [x]   | [x]   |
