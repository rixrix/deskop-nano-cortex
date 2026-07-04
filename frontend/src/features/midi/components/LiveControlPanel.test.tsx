/**
 * Smoke test for LiveControlPanel — verifies that the documented MIDI controls
 * (FX slots 1-5, tuner, tap tempo, expression) render with correct labels and
 * respond to user interaction callbacks.
 *
 * @see docs/specs/200-frontend-control-surface/spec.md [FR-14]
 * @see docs/specs/400-dx-tooling/spec.md [FR-9]
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LiveControlPanel } from "./LiveControlPanel";

// ─── Default props ────────────────────────────────────────────────────────────

const defaultProps = {
  fxSlotStates: [false, false, false, false, false],
  tunerState: false,
  expressionValue: 0,
  isConnected: true,
  onSetFxSlotEnabled: vi.fn(),
  onSetTunerEnabled: vi.fn(),
  onTapTempo: vi.fn(),
  onSetExpression: vi.fn(),
};

function renderPanel(overrides: Partial<typeof defaultProps> = {}) {
  const props = { ...defaultProps, ...overrides };
  render(<LiveControlPanel {...props} />);
  return props;
}

// ─── Rendering ────────────────────────────────────────────────────────────────

describe("LiveControlPanel rendering", () => {
  it("renders the section heading", () => {
    renderPanel();
    expect(screen.getByText("Live MIDI Control")).toBeInTheDocument();
  });

  it("renders five FX slot buttons labeled 'FX Slot 1' through 'FX Slot 5'", () => {
    renderPanel();
    for (let slot = 1; slot <= 5; slot++) {
      expect(screen.getByText(`FX Slot ${slot}`)).toBeInTheDocument();
    }
  });

  it("renders CC labels for FX slots 1-5 (CC 37 – CC 41)", () => {
    renderPanel();
    for (let slot = 1; slot <= 5; slot++) {
      // Each button shows "CC {36 + slot} · 0" or "CC {36 + slot} · 127"
      expect(screen.getByText(`CC ${36 + slot} · 0`)).toBeInTheDocument();
    }
  });

  it("renders the Tuner button", () => {
    renderPanel();
    expect(screen.getByText("Tuner")).toBeInTheDocument();
  });

  it("renders the Tap Tempo button", () => {
    renderPanel();
    expect(screen.getByText("Tap Tempo")).toBeInTheDocument();
  });

  it("renders the Expression section", () => {
    renderPanel();
    expect(screen.getByText("Expression")).toBeInTheDocument();
  });

  it("shows expression CC 1 label with the current value", () => {
    renderPanel({ expressionValue: 64 });
    expect(screen.getByText(/CC 1 · value 64/)).toBeInTheDocument();
  });

  it("displays the active tuner state as 'On' when tunerState is true", () => {
    renderPanel({ tunerState: true });
    // There should be an 'On' text near the Tuner button
    const onTexts = screen.getAllByText("On");
    expect(onTexts.length).toBeGreaterThan(0);
  });

  it("displays FX slots as 'On' when their state is true", () => {
    renderPanel({ fxSlotStates: [true, false, false, false, false] });
    // FX Slot 1 is enabled → shows 'On'
    expect(screen.getAllByText("On").length).toBeGreaterThan(0);
  });
});

// ─── Interaction ──────────────────────────────────────────────────────────────

describe("LiveControlPanel interaction", () => {
  it("clicking an FX slot calls onSetFxSlotEnabled with (slotIndex, !currentState)", () => {
    const onSetFxSlotEnabled = vi.fn();
    renderPanel({ onSetFxSlotEnabled });
    // The first FX slot button renders "FX Slot 1" as its label text.
    // We click the parent button which wraps both the label and On/Off text.
    const fxSlot1Button = screen.getByText("FX Slot 1").closest("button");
    expect(fxSlot1Button).not.toBeNull();
    fireEvent.click(fxSlot1Button!);
    // slot=1, current state=false → toggle to true
    expect(onSetFxSlotEnabled).toHaveBeenCalledWith(1, true);
  });

  it("clicking the Tuner button calls onSetTunerEnabled with toggled value", () => {
    const onSetTunerEnabled = vi.fn();
    renderPanel({ onSetTunerEnabled, tunerState: false });
    const tunerButton = screen.getByText("Tuner").closest("button");
    fireEvent.click(tunerButton!);
    expect(onSetTunerEnabled).toHaveBeenCalledWith(true);
  });

  it("clicking the Tap Tempo button calls onTapTempo", () => {
    const onTapTempo = vi.fn();
    renderPanel({ onTapTempo });
    const tapButton = screen.getByText("Tap Tempo").closest("button");
    fireEvent.click(tapButton!);
    expect(onTapTempo).toHaveBeenCalledOnce();
  });

  it("FX slot buttons are disabled when isConnected is false", () => {
    renderPanel({ isConnected: false });
    const fxSlot1Button = screen.getByText("FX Slot 1").closest("button");
    expect(fxSlot1Button).toBeDisabled();
  });

  it("Tuner button is disabled when isConnected is false", () => {
    renderPanel({ isConnected: false });
    const tunerButton = screen.getByText("Tuner").closest("button");
    expect(tunerButton).toBeDisabled();
  });

  it("expression slider onChange calls onSetExpression with the new value", () => {
    const onSetExpression = vi.fn();
    renderPanel({ onSetExpression, expressionValue: 0 });
    const slider = screen.getByRole("slider");
    fireEvent.change(slider, { target: { value: "100" } });
    expect(onSetExpression).toHaveBeenCalledWith(100);
  });
});
