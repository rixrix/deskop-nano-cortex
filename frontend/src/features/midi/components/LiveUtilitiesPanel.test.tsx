/**
 * Regression tests for the Live Utilities rail.
 *
 * @see docs/specs/200-frontend-control-surface/spec.md [FR-12]
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LiveUtilitiesPanel } from "./LiveUtilitiesPanel";

const defaultProps = {
  isConnected: true,
  captureVolume: 127,
  saveMode: "manual" as const,
  dirtyPresetSwitchMode: "confirm" as const,
  isDirty: true,
  saveCapable: false,
  saveInFlight: false,
  lastSetBpm: 120,
  tunerState: false,
  expressionValue: 64,
  onSaveModeChange: vi.fn(),
  onDirtyPresetSwitchModeChange: vi.fn(),
  onSave: vi.fn(),
  onDiscard: vi.fn(),
  onTapTempo: vi.fn(),
  onSetTempoBpm: vi.fn(),
  onToggleTuner: vi.fn(),
  onSetExpression: vi.fn(),
  onOpenToneStudio: vi.fn(),
};

function renderUtilities(overrides: Partial<typeof defaultProps> = {}) {
  const props = { ...defaultProps, ...overrides };
  render(<LiveUtilitiesPanel {...props} />);
  return props;
}

describe("LiveUtilitiesPanel", () => {
  it("renders Tone Studio as a labelled Utilities button", () => {
    const props = renderUtilities();

    fireEvent.click(screen.getByRole("button", { name: "Open floating tone studio" }));

    expect(screen.getByText("Tone Studio")).toBeInTheDocument();
    expect(props.onOpenToneStudio).toHaveBeenCalledOnce();
  });

  it("renders tempo controls once and sends tap/BPM commands", () => {
    const props = renderUtilities();

    fireEvent.click(screen.getByRole("button", { name: "Tap" }));
    expect(props.onTapTempo).toHaveBeenCalledOnce();

    for (const bpm of ["80", "100", "120", "140"]) {
      expect(screen.getByRole("button", { name: bpm })).toBeInTheDocument();
    }

    fireEvent.click(screen.getByRole("button", { name: "140" }));
    expect(props.onSetTempoBpm).toHaveBeenCalledWith(140);

    fireEvent.change(screen.getByLabelText("Tempo in BPM (40-240)"), {
      target: { value: "96" },
    });
    fireEvent.keyDown(screen.getByLabelText("Tempo in BPM (40-240)"), { key: "Enter" });
    expect(props.onSetTempoBpm).toHaveBeenCalledWith(96);
  });

  it("disables USB command utilities when transport is unavailable", () => {
    renderUtilities({ isConnected: false });

    expect(screen.getByRole("button", { name: "Tap" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "120" })).toBeDisabled();
    expect(screen.getByLabelText("Tempo in BPM (40-240)")).toBeDisabled();
    expect(screen.getByRole("button", { name: /Tuner/i })).toBeDisabled();
    expect(screen.getByLabelText("Expression CC1")).toBeDisabled();
  });

  it("renders expression once and sends CC1 changes from Utilities", () => {
    const props = renderUtilities();

    expect(screen.getAllByText("Expression")).toHaveLength(1);
    fireEvent.change(screen.getByLabelText("Expression CC1"), { target: { value: "80" } });

    expect(props.onSetExpression).toHaveBeenCalledWith(80);
  });

  it("makes manual/auto save mode explicit and disables Save until the device path is ready", () => {
    const props = renderUtilities();

    expect(screen.getByRole("button", { name: /manual/i })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: /^auto$/i }));
    expect(props.onSaveModeChange).toHaveBeenCalledWith("auto");
    expect(screen.getByRole("button", { name: /confirm/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    fireEvent.click(screen.getByRole("button", { name: /auto-discard/i }));
    expect(props.onDirtyPresetSwitchModeChange).toHaveBeenCalledWith("auto-discard");
    expect(screen.getByRole("button", { name: /^Save$/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /^Discard$/i })).not.toBeDisabled();
    expect(screen.getByText("127")).toBeInTheDocument();
  });

  it("calls Save when the device save path is available", () => {
    const props = renderUtilities({ saveCapable: true });

    fireEvent.click(screen.getByRole("button", { name: /^Save$/i }));

    expect(props.onSave).toHaveBeenCalledOnce();
  });

  it("shows saving state during a device save", () => {
    renderUtilities({ saveCapable: false, saveInFlight: true });

    expect(screen.getByRole("button", { name: /^Saving$/i })).toBeDisabled();
  });
});
