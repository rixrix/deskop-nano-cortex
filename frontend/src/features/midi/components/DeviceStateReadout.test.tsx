/**
 * Regression tests for the main-console device panel controls.
 *
 * @see docs/specs/200-frontend-control-surface/spec.md [FR-40]
 */
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { DecodedStateDump } from "../protocolLabDecoder";
import { DeviceStateReadout } from "./DeviceStateReadout";

const dump: DecodedStateDump = {
  gain: 120,
  level: 121,
  bass: 122,
  mid: 123,
  treble: 124,
  captureSlot: 3,
  captureVolume: 127,
  gateOn: true,
  gateReduction: 75,
  cabIrOn: true,
  firmware: "2.2.1",
  captureName: "US Prince 65 4",
  irName: "110 US PRN C10R",
  bypass: [0, 1, 0, 1, 0],
  fxModels: null,
  footswitchAssignments: null,
  payloadHex: "00",
  timestampMs: 1,
  confidence: "provisional",
};

describe("DeviceStateReadout", () => {
  it("renders amp knobs in Nano order and keeps Amount display-only", () => {
    render(<DeviceStateReadout dump={dump} stateActive onWriteKnob={vi.fn()} />);

    const labels = within(screen.getByTestId("amp-knob-row"))
      .getAllByText(/^(Gain|Bass|Mid|Treble|Amount|Level)$/)
      .map((node) => node.textContent);

    expect(labels).toEqual(["Gain", "Bass", "Mid", "Treble", "Amount", "Level"]);
    expect(screen.getByRole("slider", { name: "Gain knob" })).toBeInTheDocument();
    expect(screen.queryByRole("slider", { name: "Amount knob" })).not.toBeInTheDocument();
  });

  it("does not render duplicated utility controls or loaded asset tiles", () => {
    render(<DeviceStateReadout dump={dump} currentPreset={0} isDirty />);

    expect(screen.getByText("A1")).toBeInTheDocument();
    expect(screen.getByText("Unsaved")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Tap$/i })).not.toBeInTheDocument();
    expect(screen.queryByText("Tuner")).not.toBeInTheDocument();
    expect(screen.queryByText("Expression")).not.toBeInTheDocument();
    expect(screen.queryByText(/Capture vol/i)).not.toBeInTheDocument();
    expect(screen.queryByText("FX bypass")).not.toBeInTheDocument();
    expect(screen.queryByText("Cab / IR")).not.toBeInTheDocument();
  });
});
