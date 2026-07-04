/**
 * Tauri event contracts — single source of truth for event payloads.
 *
 * @see docs/specs/210-frontend-ipc-contracts/spec.md [FR-16]
 * @see docs/specs/210-frontend-ipc-contracts/design.md [DES-IPC-EVENTS]
 */
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export interface MidiMessagePayload {
  ts_ms: number;
  bytes: number[];
}

export interface ConnectedPayload {
  name: string;
}

export interface PortsChangedPayload {
  ports: Array<{
    id: string;
    name: string;
    direction: "in" | "out";
    kind: "usb" | "ble";
  }>;
}

/** Listen for inbound MIDI messages from the connected device. */
export function onMidiMessage(cb: (payload: MidiMessagePayload) => void): Promise<UnlistenFn> {
  return listen<MidiMessagePayload>("midi://message", (event) => cb(event.payload));
}

/** Listen for device connection events. */
export function onConnected(cb: (payload: ConnectedPayload) => void): Promise<UnlistenFn> {
  return listen<ConnectedPayload>("midi://connected", (event) => cb(event.payload));
}

/** Listen for device disconnection events. */
export function onDisconnected(cb: () => void): Promise<UnlistenFn> {
  return listen("midi://disconnected", () => cb());
}

/** Listen for port list changes (hotplug). */
export function onPortsChanged(cb: (payload: PortsChangedPayload) => void): Promise<UnlistenFn> {
  return listen<PortsChangedPayload>("midi://ports-changed", (event) => cb(event.payload));
}
