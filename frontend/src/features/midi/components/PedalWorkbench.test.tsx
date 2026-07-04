/**
 * Regression tests for the basic Tone Editor / advanced Tone Studio split.
 *
 * @see docs/specs/200-frontend-control-surface/spec.md [FR-23]
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CC, DEFAULT_CC_STATE } from "../constants";
import { DEFAULT_FX_SLOT_DEVICE_ASSIGNMENTS } from "../fxModel";
import type { FxSlotModelStates } from "../fxProtocol";
import { PedalWorkbench, SignalPathOverview } from "./PedalWorkbench";

const deviceModelStates: FxSlotModelStates = {
  "pre-1": {
    slotId: "pre-1",
    rawId: "1B",
    numericId: 27,
    displayName: "Green 808",
    categoryLabel: "Guitar Overdrive",
    deviceId: "green-808",
    known: true,
    compatible: true,
  },
};

const defaultProps = {
  currentPreset: 3,
  ccState: DEFAULT_CC_STATE,
  isConnected: true,
  slotAssignments: DEFAULT_FX_SLOT_DEVICE_ASSIGNMENTS,
  deviceModelStates,
  canRefreshParams: true,
  canWriteModels: true,
  onRefreshFxParams: vi.fn(),
  onWriteFxModel: vi.fn(),
  onSlotAssignmentsChange: vi.fn(),
  onToggleCC: vi.fn(),
};

describe("PedalWorkbench", () => {
  it("renders compact mode as a basic tone editor without footswitch or expression duplicates", () => {
    render(<PedalWorkbench {...defaultProps} compact />);

    expect(screen.getByText("Basic tone editor")).toBeInTheDocument();
    expect(screen.queryByText(/^Footswitch/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Expression")).not.toBeInTheDocument();
    expect(screen.getByText("device model")).toBeInTheDocument();
    expect(screen.getByText("values not synced")).toBeInTheDocument();
  });

  it("renders full mode as the advanced tone studio parameter surface", () => {
    render(<PedalWorkbench {...defaultProps} />);

    expect(screen.getByText("Signal path")).toBeInTheDocument();
    expect(screen.getAllByText("Green 808").length).toBeGreaterThan(0);
    expect(screen.getByText("Pre FX 1 · Green 808")).toBeInTheDocument();
    expect(screen.getByText("Overdrive")).toBeInTheDocument();
    expect(screen.getAllByText("0.0-10.0").length).toBeGreaterThan(0);
    expect(screen.getByText("model select ready")).toBeInTheDocument();
    expect(screen.getByLabelText("Selected FX model")).toBeEnabled();
    expect(screen.getByText("Refresh values")).toBeInTheDocument();
    expect(screen.getAllByText("Not synced yet").length).toBeGreaterThan(0);
    expect(screen.queryByText("PWR")).not.toBeInTheDocument();
    expect(screen.getAllByText(/^(On|Off|Fixed)$/).length).toBeGreaterThan(0);
  });

  it("calls the manual parameter refresh handler for the selected slot", () => {
    const onRefreshFxParams = vi.fn();
    render(<PedalWorkbench {...defaultProps} onRefreshFxParams={onRefreshFxParams} />);

    fireEvent.click(screen.getByText("Refresh values"));

    expect(onRefreshFxParams).toHaveBeenCalledWith("pre-1");
  });

  it("writes a selected model through the advanced tone studio selector", () => {
    const onWriteFxModel = vi.fn();
    render(<PedalWorkbench {...defaultProps} onWriteFxModel={onWriteFxModel} />);

    fireEvent.change(screen.getByLabelText("Selected FX model"), {
      target: { value: "rodent-drive" },
    });

    expect(onWriteFxModel).toHaveBeenCalledWith("pre-1", "rodent-drive");
  });

  it("renders read-only parameter values from the latest refresh", () => {
    render(<PedalWorkbench {...defaultProps} fxParamValues={{ "pre-1": [0.5, 0.25, 0.75] }} />);

    expect(screen.getAllByText("3 synced values").length).toBeGreaterThan(0);
    expect(screen.getByText("5.0")).toBeInTheDocument();
    expect(screen.getByText("2.5")).toBeInTheDocument();
    expect(screen.getByText("75.0 %")).toBeInTheDocument();
    expect(screen.queryByText(/normalized/i)).not.toBeInTheDocument();
  });

  it("renders enum parameter values as explicit option controls", () => {
    render(
      <PedalWorkbench
        {...defaultProps}
        deviceModelStates={{
          "pre-1": {
            slotId: "pre-1",
            rawId: "02",
            numericId: 2,
            displayName: "Obsessive Drive",
            categoryLabel: "Guitar Overdrive",
            deviceId: "obsessive-drive",
            known: true,
            compatible: true,
          },
        }}
        fxParamValues={{ "pre-1": [0.5, 1, 0.5, 0.5] }}
      />,
    );

    expect(screen.getByText("Peak")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Write Peak" })).toBeInTheDocument();
  });

  it("uses decoded fixed-block names for capture and IR rows", () => {
    render(
      <PedalWorkbench
        {...defaultProps}
        loadedSlotNames={{
          capture: "Anima Fuzz 8",
          "ir-loader": "810 Amped VT Aln 70s",
        }}
      />,
    );

    expect(screen.getByText("Anima Fuzz 8")).toBeInTheDocument();
    expect(screen.getAllByText("810 Amped VT Aln 70s").length).toBeGreaterThan(0);
  });

  it("renders IR Loader fixed-block synced values in Tone Studio", () => {
    render(
      <PedalWorkbench
        {...defaultProps}
        activeSlot="ir-loader"
        loadedSlotNames={{ "ir-loader": "810 Amped VT Aln 70s" }}
        fixedBlockReadback={{
          gateOn: true,
          captureSlot: 2,
          captureName: "US Prince 65 4",
          captureVolume: 127,
          cabIrSlot: 4,
          cabIrOn: true,
          cabIrName: "810 Amped VT Aln 70s",
          cabIrParams: {
            levelDb: -3.5,
            highPassHz: 80,
            lowPassHz: 9500,
            mic: "Ribbon 160",
            position: 3,
          },
          cabIrParamsLoading: false,
          cabIrParamsError: null,
        }}
      />,
    );

    expect(
      screen.getByText("IR Loader values come from the device Cab/IR refresh path."),
    ).toBeInTheDocument();
    expect(screen.getAllByText("810 Amped VT Aln 70s").length).toBeGreaterThan(0);
    expect(screen.getByText("-3.5 dB")).toBeInTheDocument();
    expect(screen.getByText("80 Hz")).toBeInTheDocument();
    expect(screen.getByText("9500 Hz")).toBeInTheDocument();
    expect(screen.getByText("Ribbon 160")).toBeInTheDocument();
  });

  it("cycles the Capture fixed block through the FS I rotary write path", () => {
    const onFootswitchRotaryChange = vi.fn();
    render(
      <PedalWorkbench
        {...defaultProps}
        activeSlot="capture"
        canWriteFixedBlocks
        fixedBlockRotaryPreview={{ I: { value: 2, source: "live" } }}
        fixedBlockReadback={{
          gateOn: true,
          captureSlot: 2,
          captureName: "US Prince 65 4",
          captureVolume: 127,
          cabIrSlot: 4,
          cabIrOn: true,
          cabIrName: "810 Amped VT Aln 70s",
          cabIrParams: null,
          cabIrParamsLoading: false,
          cabIrParamsError: null,
        }}
        onFootswitchRotaryChange={onFootswitchRotaryChange}
      />,
    );

    expect(screen.getByText("Capture · FS I rotary")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cycle Capture · FS I rotary right" }));

    expect(onFootswitchRotaryChange).toHaveBeenCalledWith("I", 3);
  });

  it("cycles the IR Loader fixed block through the FS II rotary write path", () => {
    const onFootswitchRotaryChange = vi.fn();
    render(
      <PedalWorkbench
        {...defaultProps}
        activeSlot="ir-loader"
        canWriteFixedBlocks
        fixedBlockRotaryPreview={{ II: { value: 4, source: "live" } }}
        fixedBlockReadback={{
          gateOn: true,
          captureSlot: 2,
          captureName: "US Prince 65 4",
          captureVolume: 127,
          cabIrSlot: 4,
          cabIrOn: true,
          cabIrName: "810 Amped VT Aln 70s",
          cabIrParams: null,
          cabIrParamsLoading: false,
          cabIrParamsError: null,
        }}
        onFootswitchRotaryChange={onFootswitchRotaryChange}
      />,
    );

    expect(screen.getByText("Cab / IR · FS II rotary")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cycle Cab / IR · FS II rotary left" }));

    expect(onFootswitchRotaryChange).toHaveBeenCalledWith("II", 3);
  });

  it("writes Gate reduction values through an explicit callback", () => {
    const onWriteGateEnabled = vi.fn();
    const onWriteGateReduction = vi.fn();
    render(
      <PedalWorkbench
        {...defaultProps}
        activeSlot="gate"
        canWriteFixedBlocks
        gateReductionLastSentValue={75}
        onWriteGateEnabled={onWriteGateEnabled}
        onWriteGateReduction={onWriteGateReduction}
        fixedBlockReadback={{
          gateOn: true,
          captureSlot: 2,
          captureName: "US Prince 65 4",
          captureVolume: 127,
          cabIrSlot: 4,
          cabIrOn: true,
          cabIrName: "810 Amped VT Aln 70s",
          cabIrParams: null,
          cabIrParamsLoading: false,
          cabIrParamsError: null,
        }}
      />,
    );

    expect(screen.getAllByText("Gate reduction").length).toBeGreaterThan(0);
    const seventyFive = screen.getByRole("button", { name: "Write Gate reduction 75 percent" });
    expect(seventyFive).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Sent 75%")).toBeInTheDocument();
    fireEvent.click(seventyFive);
    expect(onWriteGateReduction).toHaveBeenCalledWith(75);

    fireEvent.click(screen.getByRole("button", { name: /turn off/i }));
    expect(onWriteGateEnabled).toHaveBeenCalledWith(false);
  });

  it("shows Gate reduction device state from the latest state dump", () => {
    render(
      <PedalWorkbench
        {...defaultProps}
        activeSlot="gate"
        canWriteFixedBlocks
        gateReductionLastSentValue={50}
        fixedBlockReadback={{
          gateOn: true,
          gateReduction: 75,
          captureSlot: 2,
          captureName: "US Prince 65 4",
          captureVolume: 127,
          cabIrSlot: 4,
          cabIrOn: true,
          cabIrName: "810 Amped VT Aln 70s",
          cabIrParams: null,
          cabIrParamsLoading: false,
          cabIrParamsError: null,
        }}
      />,
    );

    const seventyFive = screen.getByRole("button", { name: "Write Gate reduction 75 percent" });
    expect(seventyFive).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByText("75%").length).toBeGreaterThan(0);
    expect(screen.getByText("Device state 75%")).toBeInTheDocument();
  });

  it("keeps Gate reduction values disabled when the write callback is absent", () => {
    render(
      <PedalWorkbench
        {...defaultProps}
        activeSlot="gate"
        canWriteFixedBlocks
        fixedBlockReadback={{
          gateOn: false,
          captureSlot: 2,
          captureName: "US Prince 65 4",
          captureVolume: 127,
          cabIrSlot: 4,
          cabIrOn: true,
          cabIrName: "810 Amped VT Aln 70s",
          cabIrParams: null,
          cabIrParamsLoading: false,
          cabIrParamsError: null,
        }}
      />,
    );

    expect(screen.getByRole("button", { name: "Write Gate reduction 50 percent" })).toBeDisabled();
    expect(screen.getByText(/next device sync confirms/i)).toBeInTheDocument();
  });

  it("renders the Live signal overview with On/Off toggles but without parameters", () => {
    const onToggleCC = vi.fn();
    render(
      <SignalPathOverview
        ccState={DEFAULT_CC_STATE}
        isConnected
        slotAssignments={DEFAULT_FX_SLOT_DEVICE_ASSIGNMENTS}
        deviceModelStates={deviceModelStates}
        activeSlot="pre-1"
        onActiveSlotChange={vi.fn()}
        onToggleCC={onToggleCC}
        compact
      />,
    );

    expect(screen.getByTestId("signal-path-overview")).toBeInTheDocument();
    expect(screen.getByText("Pre FX 1")).toBeInTheDocument();
    expect(screen.getByText("Green 808")).toBeInTheDocument();
    expect(screen.queryByText("Refresh values")).not.toBeInTheDocument();
    expect(screen.queryByText("Not synced yet")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Toggle Pre FX 1" }));
    expect(onToggleCC).toHaveBeenCalledWith(CC.EQ);
  });
});
