/**
 * Tauri command contracts — single source of truth for IPC calls.
 * Each function signature matches the Rust `#[tauri::command]` counterpart.
 *
 * @see docs/specs/210-frontend-ipc-contracts/spec.md [FR-1]
 * @see docs/specs/210-frontend-ipc-contracts/design.md [DES-IPC-COMMANDS]
 */
import { invoke } from "@tauri-apps/api/core";

export interface MidiPort {
  id: string;
  name: string;
  direction: "in" | "out";
  kind: "usb" | "ble";
}

export type DeviceState = "disconnected" | "connecting" | "connected" | "error";
export type SyncMode =
  "full-read-write-sync" | "write-notification-sync" | "command-only" | "disconnected-preview";
export interface NanoSlotState {
  role: string;
  loadedName: string | null;
  modelId: string | null;
  modelIdNumeric: number | null;
  bypassed: boolean | null;
  active: boolean | null;
  confirmed: boolean;
}

export interface NanoFootswitchAssignments {
  ia: number;
  ib: number;
  iia: number;
  iib: number;
}

export interface NanoState {
  connectionStatus: string;
  syncMode: SyncMode;
  activePresetSlot: number | null;
  presetName: string | null;
  bank: string | null;
  captureSlot: number | null;
  captureVolume: number | null;
  gateOn: boolean | null;
  gateReduction: number | null;
  cabIrOn: boolean | null;
  captureAssignment: string | null;
  irAssignment: string | null;
  slots: Record<string, NanoSlotState>;
  expressionValue: number | null;
  expressionPercent: number | null;
  ampGain: number | null;
  ampLevel: number | null;
  ampBass: number | null;
  ampMid: number | null;
  ampTreble: number | null;
  footswitchAssignments: NanoFootswitchAssignments | null;
  stale: boolean;
  provisional: boolean;
}

/** List all available USB MIDI output ports. */
export async function listPorts(): Promise<MidiPort[]> {
  return invoke<MidiPort[]>("list_ports");
}

/** Add a hardware trace marker to the terminal and in-app log. */
export async function traceMarker(label: string, phase: string): Promise<void> {
  return invoke<void>("trace_marker", { label, phase });
}

/** Backend crate version, used to stamp diagnostic bundles. */
export async function getAppVersion(): Promise<string> {
  return invoke<string>("get_app_version");
}

/** Open an http(s) URL in the OS default browser. */
export async function openExternal(url: string): Promise<void> {
  return invoke<void>("open_external", { url });
}

/** Connect to a device by port name (USB). Returns a status message. */
export async function connect(deviceName: string): Promise<string> {
  return invoke<string>("connect", { deviceName });
}

/** Disconnect from the current device. */
export async function disconnect(): Promise<void> {
  return invoke<void>("disconnect");
}

/** Send raw MIDI bytes to a named port. */
export async function sendMidi(portName: string, bytes: number[]): Promise<void> {
  return invoke<void>("send_midi", { portName, bytes });
}

/**
 * Experimental: write a raw command frame to a BLE characteristic (default `c304`) to verify
 * the captured command path. Replies arrive async on `c305` (visible in the log).
 */
export async function sendBleFrame(bytes: number[], charUuid?: string): Promise<string> {
  return invoke<string>("send_ble_frame", { bytes, charUuid });
}

/**
 * Request the authoritative device-state dump: writes the request to `c304`, waits for the reply,
 * decodes it into `NanoState` (amp knobs, capture/IR names), and graduates the read capabilities.
 * Resolves with the updated `NanoState`.
 */
export async function requestStateDump(): Promise<NanoState> {
  return invoke<NanoState>("request_state_dump");
}

/** Set an amp knob (`gain`/`level`/`bass`/`mid`/`treble`, raw 0-255) on the device over BLE. */
export async function setAmpKnob(knob: string, value: number): Promise<void> {
  return invoke<void>("set_amp_knob", { knob, value });
}

/** Save the device's live state (and name) into a preset slot (0-63). Destructive device write:
 * callers must gate by transport state, ask for confirmation, and resync after the command. */
export async function saveActivePreset(preset: number, name: string): Promise<void> {
  return invoke<void>("save_active_preset", { preset, name });
}

/** Device name lists decoded from the BLE metadata dump. */
export interface MetadataDump {
  presetNames: string[];
  captureNames: string[];
  irNames: string[];
  packetCount?: number;
  payloadBytes?: number;
  expectedPresetSlots?: number;
  presetSlots?: number;
  usablePresetNames?: number;
  complete?: boolean;
}

export interface FxParamRefresh {
  values: number[];
}

export interface CabIrParamRefresh {
  levelDb: number | null;
  highPassHz: number | null;
  lowPassHz: number | null;
  mic: string | null;
  position: number | null;
}

/** Request the device metadata dump — resolves with preset/capture/IR name lists from the device. */
export async function requestMetadata(): Promise<MetadataDump> {
  return invoke<MetadataDump>("request_metadata");
}

/** Request read-only normalized FX parameter values for one editable slot. */
export async function requestFxParams(slot: string): Promise<FxParamRefresh> {
  return invoke<FxParamRefresh>("request_fx_params", { slot });
}

/** Request read-only Cab/IR parameter values for a one-based device Cab/IR slot. */
export async function requestCabIrParams(slot: number): Promise<CabIrParamRefresh> {
  return invoke<CabIrParamRefresh>("request_cab_ir_params", { slot });
}

/** Write one normalized FX parameter value for one editable slot. Live state only; save separately. */
export async function setFxParam(
  slot: string,
  paramIndex: number,
  normalizedValue: number,
): Promise<void> {
  return invoke<void>("set_fx_param", { slot, paramIndex, normalizedValue });
}

/** Select one FX model for one editable slot. Live state only; re-read before trusting the UI. */
export async function setFxModel(slot: string, modelId: string): Promise<void> {
  return invoke<void>("set_fx_model", { slot, modelId });
}

/** Select a live Capture slot. Slot 0 bypasses Capture; save separately to persist. */
export async function setCaptureSlot(slot: number): Promise<void> {
  return invoke<void>("set_capture_slot", { slot });
}

/** Select a live Cab/IR slot. Slot 0 bypasses Cab/IR; save separately to persist. */
export async function setCabIrSlot(slot: number): Promise<void> {
  return invoke<void>("set_cab_ir_slot", { slot });
}

/** Toggle the fixed input gate in live state. Save separately to persist. */
export async function setGateEnabled(enabled: boolean): Promise<void> {
  return invoke<void>("set_gate_enabled", { enabled });
}

/** Write fixed input gate reduction percentage in live state. Save separately to persist. */
export async function setGateReduction(percent: number): Promise<void> {
  return invoke<void>("set_gate_reduction", { percent });
}

/** Write Capture volume in dB in live state. Save separately to persist. */
export async function setCaptureVolume(db: number): Promise<void> {
  return invoke<void>("set_capture_volume", { db });
}

export type CabIrParamKey = "level" | "high-pass" | "low-pass";

/** Write a fixed Cab/IR display-value parameter in live state. Save separately to persist. */
export async function setCabIrParam(param: CabIrParamKey, value: number): Promise<void> {
  return invoke<void>("set_cab_ir_param", { param, value });
}

/** Write factory Cab/IR mic and position in live state. Save separately to persist. */
export async function setCabIrMicPosition(
  cabName: string,
  micName: string,
  position: number,
): Promise<void> {
  return invoke<void>("set_cab_ir_mic_position", { cabName, micName, position });
}

/** Write all four footswitch quick-access preset assignments in live state. Save separately. */
export async function setFootswitchAssignments(
  selectedPreset: number,
  assignments: { ia: number; ib: number; iia: number; iib: number },
): Promise<void> {
  return invoke<void>("set_footswitch_assignments", {
    selectedPreset,
    ia: assignments.ia,
    ib: assignments.ib,
    iia: assignments.iia,
    iib: assignments.iib,
  });
}

/**
 * Acknowledge an app-initiated preset change while a BLE session is active
 * (PC → ack → state request); without it the device can stay in a pending
 * preset-change context that ignores subsequent PC until on-device EXIT.
 */
export async function acknowledgePresetChange(): Promise<void> {
  return invoke<void>("acknowledge_preset_change", {});
}

/** Get the current connection state. */
export async function getState(): Promise<DeviceState> {
  return invoke<DeviceState>("get_state");
}

/** Get the connected device name, if any. */
export async function getDeviceName(): Promise<string | null> {
  return invoke<string | null>("get_device_name");
}

/** Normalized decoded/provisional Nano Cortex state. */
export async function getNanoState(): Promise<NanoState> {
  return invoke<NanoState>("get_nano_state");
}

/** Quick BLE availability check. Returns status string. */
export async function blePing(): Promise<string> {
  return invoke<string>("ble_ping");
}

/** Scan for BLE MIDI devices. Returns descriptors. */
export async function bleScan(): Promise<string[]> {
  return invoke<string[]>("ble_scan");
}
