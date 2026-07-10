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
  canWriteAssetSlots: true,
  disabled: false,
  onActivateSlot: vi.fn(),
  onAssignPreset: vi.fn(),
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
    const clickSwitchButton = screen.getAllByText("Click switch")[0]?.closest("button");

    expect(clickSwitchButton).not.toBeNull();
    fireEvent.click(clickSwitchButton!);

    expect(props.onFootswitchPress).toHaveBeenCalledWith("I");
    expect(screen.queryByText(/^Tap$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Tuner$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Hold I/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Hold II/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Expression")).not.toBeInTheDocument();
  });

  it("shows capture and cab rotaries with direct current-bank slot actions", () => {
    const onFootswitchRotaryChange = vi.fn();

    renderDeck({
      rotaryPreview: {
        I: { value: 2, source: "live" },
        II: { value: 5, source: "live" },
      },
      loadedAssets: {
        captureName: "US Prince 65 4",
        irName: "110 US PRN C10R",
        captureNames: [
          "Capture A1",
          "Capture A2",
          "Capture A3",
          "Capture A4",
          "Capture A5",
          "Capture B1",
          "Capture B2",
          "Capture B3",
          "Capture B4",
          "Capture B5",
        ],
        irNames: ["IR 1", "IR 2", "IR 3", "IR 4", "IR 5"],
      },
      onFootswitchRotaryChange,
    });

    expect(screen.getByText("US Prince 65 4")).toBeInTheDocument();
    expect(screen.getByText("110 US PRN C10R")).toBeInTheDocument();
    expect(screen.getByText("rotary 2")).toBeInTheDocument();
    expect(screen.getByText("rotary 5")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /bypass off/i })).toHaveLength(2);
    expect(screen.getByText("Bank A slots")).toBeInTheDocument();
    expect(screen.getByText("IR slots")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Capture · FS I rotary picker"), {
      target: { value: "8" },
    });
    expect(onFootswitchRotaryChange).toHaveBeenCalledWith("I", 8);

    fireEvent.click(
      screen.getByRole("button", { name: "Select Capture · FS I rotary Bank A slot 3" }),
    );
    expect(onFootswitchRotaryChange).toHaveBeenCalledWith("I", 3);

    fireEvent.click(screen.getByRole("button", { name: "Select Cab / IR · FS II rotary slot 1" }));
    expect(onFootswitchRotaryChange).toHaveBeenCalledWith("II", 1);
  });

  it("toggles capture and cab bypass separately from bank slot jumps", () => {
    const onFootswitchRotaryChange = vi.fn();

    renderDeck({
      rotaryPreview: {
        I: { value: 0, source: "live" },
        II: { value: 3, source: "live" },
      },
      loadedAssets: {
        captureName: "Bypass",
        irName: "110 US PRN C10R",
      },
      onFootswitchRotaryChange,
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Select Capture · FS I rotary Bank A slot 1" }),
    );
    expect(onFootswitchRotaryChange).toHaveBeenCalledWith("I", 1);

    fireEvent.click(screen.getByRole("button", { name: "Capture bypass on" }));
    expect(onFootswitchRotaryChange).toHaveBeenCalledWith("I", 1);

    fireEvent.click(screen.getByRole("button", { name: "Cab / IR bypass off" }));
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
