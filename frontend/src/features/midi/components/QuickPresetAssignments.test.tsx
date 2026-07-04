/**
 * Regression tests for the Live Footswitch Deck.
 *
 * @see docs/specs/200-frontend-control-surface/spec.md [FR-25]
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_FOOTSWITCH_STATE } from "../constants";
import { QuickPresetAssignments, type QuickPresetAssignmentsProps } from "./QuickPresetAssignments";

const defaultProps: QuickPresetAssignmentsProps = {
  currentPreset: 0,
  state: DEFAULT_FOOTSWITCH_STATE,
  isConnected: true,
  disabled: false,
  onActivateSlot: vi.fn(),
  onAssignPreset: vi.fn(),
  onShowAllPresets: vi.fn(),
  onFootswitchPress: vi.fn(),
};

function renderDeck(overrides: Partial<QuickPresetAssignmentsProps> = {}) {
  const props = { ...defaultProps, ...overrides };
  render(<QuickPresetAssignments {...props} />);
  return props;
}

describe("QuickPresetAssignments", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("keeps the deck clickable without duplicating Tap, Tuner, or Expression controls", () => {
    const props = renderDeck();

    fireEvent.click(screen.getAllByRole("button", { name: /Click switch/i })[0]);

    expect(props.onFootswitchPress).toHaveBeenCalledWith("I");
    expect(screen.queryByRole("button", { name: /^Tap$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Tuner$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Hold I/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Hold II/i })).not.toBeInTheDocument();
    expect(screen.queryByText("Expression")).not.toBeInTheDocument();
  });

  it("shows capture and cab rotaries with local cycle actions", () => {
    const onFootswitchRotaryChange = vi.fn();

    renderDeck({
      rotaryPreview: {
        I: { value: 2, source: "live" },
        II: { value: 5, source: "live" },
      },
      loadedAssets: {
        captureName: "US Prince 65 4",
        irName: "110 US PRN C10R",
      },
      onFootswitchRotaryChange,
    });

    expect(screen.getByText("US Prince 65 4")).toBeInTheDocument();
    expect(screen.getByText("110 US PRN C10R")).toBeInTheDocument();
    expect(screen.getByText("rotary 2")).toBeInTheDocument();
    expect(screen.getByText("rotary 5")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Cycle Capture.*right/i }));
    expect(onFootswitchRotaryChange).toHaveBeenCalledWith("I", 3);

    fireEvent.click(screen.getByRole("button", { name: /Cycle Cab.*right/i }));
    expect(onFootswitchRotaryChange).toHaveBeenCalledWith("II", 0);
  });

  it("commits the selected dropdown preset when assigning II-B", () => {
    const onAssignPreset = vi.fn();

    renderDeck({ onAssignPreset });

    expect(
      screen.getByRole("button", { name: "Set device footswitch mapping for II-B" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Set device footswitch mapping for II-B" }),
    ).toHaveTextContent("Sync");

    fireEvent.change(screen.getByLabelText("II-B assigned preset"), {
      target: { value: "10" },
    });
    expect(onAssignPreset).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Set device footswitch mapping for II-B" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Set device footswitch mapping for II-B" }),
    ).toHaveTextContent("Set");

    fireEvent.click(screen.getByRole("button", { name: "Set device footswitch mapping for II-B" }));

    expect(onAssignPreset).toHaveBeenCalledWith("IIB", 10);
  });

  it("shows an assigned slot as mapped after the parent commits it", () => {
    renderDeck({
      state: {
        ...DEFAULT_FOOTSWITCH_STATE,
        footswitchII: {
          ...DEFAULT_FOOTSWITCH_STATE.footswitchII,
          currentAssignedB: 10,
        },
      },
    });

    expect(screen.getByLabelText("II-B assigned preset")).toHaveValue("10");
    expect(
      screen.getByRole("button", { name: "Set device footswitch mapping for II-B" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Set device footswitch mapping for II-B" }),
    ).toHaveTextContent("Sync");
  });
});
