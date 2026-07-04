/**
 * Transport capability helpers for the dual-link Nano workflow.
 *
 * USB is the command path (preset recall, tap/tuner, expression, documented CCs). Bluetooth is
 * the state path (preset names, device dump, live hardware telemetry). When Bluetooth is the
 * displayed connection but a Nano USB output port is present, the backend can still route MIDI
 * commands through USB, so the UI must keep command controls enabled.
 *
 * @see docs/specs/200-frontend-control-surface/spec.md [FR-45]
 */
import type { MidiPort } from "../../shared/ipc/commands";

export function isBluetoothDeviceName(name: string | null | undefined) {
  const lower = name?.toLowerCase() ?? "";
  return lower.includes("bluetooth") || lower.includes("ble");
}

export function hasNanoUsbOutputPort(ports: MidiPort[]) {
  return ports.some(
    (port) =>
      port.kind === "usb" && port.direction === "out" && /nano|cortex|neural/i.test(port.name),
  );
}

export function canUseUsbCommandPath({
  isConnected,
  deviceName,
  ports,
}: {
  isConnected: boolean;
  deviceName: string | null;
  ports: MidiPort[];
}) {
  if (!isConnected) return false;
  if (!isBluetoothDeviceName(deviceName)) return true;
  return hasNanoUsbOutputPort(ports);
}
