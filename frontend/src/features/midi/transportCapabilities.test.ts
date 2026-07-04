/**
 * Unit tests for the dual USB/Bluetooth command-state split.
 *
 * @see docs/specs/200-frontend-control-surface/spec.md [FR-45]
 */
import { describe, expect, it } from "vitest";
import type { MidiPort } from "../../shared/ipc/commands";
import { canUseUsbCommandPath, hasNanoUsbOutputPort } from "./transportCapabilities";

function port(overrides: Partial<MidiPort>): MidiPort {
  return {
    id: "nano-out",
    name: "Nano Cortex",
    kind: "usb",
    direction: "out",
    ...overrides,
  };
}

describe("transportCapabilities", () => {
  it("keeps USB commands active for a USB-primary connection", () => {
    expect(
      canUseUsbCommandPath({
        isConnected: true,
        deviceName: "Nano Cortex",
        ports: [],
      }),
    ).toBe(true);
  });

  it("keeps USB commands active when Bluetooth is primary but Nano USB output is available", () => {
    expect(
      canUseUsbCommandPath({
        isConnected: true,
        deviceName: "Neural DSP Nano Cortex (Bluetooth)",
        ports: [port({ name: "Nano Cortex MIDI Out" })],
      }),
    ).toBe(true);
  });

  it("disables command controls for Bluetooth-only sessions", () => {
    expect(
      canUseUsbCommandPath({
        isConnected: true,
        deviceName: "Neural DSP Nano Cortex (Bluetooth)",
        ports: [port({ name: "Other USB MIDI" })],
      }),
    ).toBe(false);
  });

  it("only treats Nano-like USB output ports as command-capable", () => {
    expect(hasNanoUsbOutputPort([port({ name: "Nano Cortex", direction: "in" })])).toBe(false);
    expect(hasNanoUsbOutputPort([port({ name: "Nano Cortex", direction: "out" })])).toBe(true);
  });
});
