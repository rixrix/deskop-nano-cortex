/**
 * Regression tests for the basic Tone Editor / advanced Tone Studio split.
 *
 * @see docs/specs/200-frontend-control-surface/spec.md [FR-23]
 */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
    expect(screen.getAllByText("Guitar Overdrive").length).toBeGreaterThan(0);
    expect(screen.getByText("model select ready")).toBeInTheDocument();
    expect(screen.getByLabelText("Selected FX model")).toBeEnabled();
    expect(screen.getByRole("button", { name: "Discard changes for Pre FX 1" })).toBeEnabled();
    expect(screen.getByText("Refresh values")).toBeInTheDocument();
    expect(screen.getByText("3 parameters waiting for refresh")).toBeInTheDocument();
    expect(screen.queryByText("PWR")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Toggle selected Pre FX 1" })).toBeNull();
    expect(screen.getAllByText(/^(On|Off|Fixed)$/).length).toBeGreaterThan(0);
  });

  it("calls the manual parameter refresh handler for the selected slot", () => {
    const onRefreshFxParams = vi.fn();
    render(<PedalWorkbench {...defaultProps} onRefreshFxParams={onRefreshFxParams} />);

    fireEvent.click(screen.getByText("Refresh values"));

    expect(onRefreshFxParams).toHaveBeenCalledWith("pre-1");
  });

  it("starts selected-slot parameter refresh when values are missing", async () => {
    const onRefreshFxParams = vi.fn();
    render(<PedalWorkbench {...defaultProps} onRefreshFxParams={onRefreshFxParams} />);

    await waitFor(() => expect(onRefreshFxParams).toHaveBeenCalledWith("pre-1"));
  });

  it("does not re-arm selected-slot auto refresh after partial values arrive", async () => {
    const onRefreshFxParams = vi.fn();
    const { rerender } = render(
      <PedalWorkbench {...defaultProps} onRefreshFxParams={onRefreshFxParams} />,
    );

    await waitFor(() => expect(onRefreshFxParams).toHaveBeenCalledTimes(1));

    rerender(
      <PedalWorkbench
        {...defaultProps}
        onRefreshFxParams={onRefreshFxParams}
        fxParamValues={{ "pre-1": [0.5] }}
      />,
    );

    expect(screen.getByText("2 parameters waiting for refresh")).toBeInTheDocument();
    await waitFor(() => expect(onRefreshFxParams).toHaveBeenCalledTimes(1));
  });

  it("does not mount editable parameter cards until all selected values are synced", () => {
    render(
      <PedalWorkbench
        {...defaultProps}
        canRefreshParams={false}
        fxParamValues={{ "pre-1": [0.5] }}
      />,
    );

    expect(screen.getAllByText("1/3 values synced").length).toBeGreaterThan(0);
    expect(screen.getByText("2 parameters waiting for refresh")).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Write /)).not.toBeInTheDocument();
  });

  it("keeps the selected parameter panel latched while incomplete values wait for retry", async () => {
    const onRefreshFxParams = vi.fn();
    const { rerender } = render(
      <PedalWorkbench {...defaultProps} onRefreshFxParams={onRefreshFxParams} />,
    );

    await waitFor(() => expect(onRefreshFxParams).toHaveBeenCalledWith("pre-1"));

    rerender(
      <PedalWorkbench
        {...defaultProps}
        onRefreshFxParams={onRefreshFxParams}
        fxParamLoadingSlot="pre-1"
        fxParamValues={{ "pre-1": [0.5] }}
      />,
    );

    expect(screen.getByText("2 parameters syncing from device")).toBeInTheDocument();

    rerender(
      <PedalWorkbench
        {...defaultProps}
        onRefreshFxParams={onRefreshFxParams}
        fxParamValues={{ "pre-1": [0.5] }}
      />,
    );

    expect(screen.getByText("2 parameters syncing from device")).toBeInTheDocument();
    expect(screen.queryByText("2 parameters waiting for refresh")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^Write /)).not.toBeInTheDocument();
  });

  it("holds completed parameter sync at 100 percent before mounting the form", () => {
    vi.useFakeTimers();
    try {
      const { rerender } = render(
        <PedalWorkbench
          {...defaultProps}
          canWriteParams
          fxParamLoadingSlot="pre-1"
          fxParamValues={{ "pre-1": [0.5] }}
        />,
      );

      expect(screen.getByText("2 parameters syncing from device")).toBeInTheDocument();
      expect(screen.queryByLabelText(/^Write /)).not.toBeInTheDocument();

      rerender(
        <PedalWorkbench
          {...defaultProps}
          canWriteParams
          fxParamValues={{ "pre-1": [0.5, 0.5, 0.5] }}
        />,
      );

      expect(screen.getByRole("progressbar", { name: "Parameter values synced" })).toHaveAttribute(
        "aria-valuenow",
        "100",
      );
      expect(screen.queryByLabelText(/^Write /)).not.toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(650);
      });

      expect(screen.getAllByLabelText(/^Write /).length).toBeGreaterThan(0);
      expect(
        screen.queryByRole("progressbar", { name: "Parameter values synced" }),
      ).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("writes a selected model through the advanced tone studio selector", () => {
    const onWriteFxModel = vi.fn();
    render(<PedalWorkbench {...defaultProps} onWriteFxModel={onWriteFxModel} />);

    const modelSelect = screen.getByLabelText("Selected FX model");
    expect(screen.queryByLabelText("Selected FX category")).not.toBeInTheDocument();
    expect(screen.getByText("Category")).toBeInTheDocument();
    expect(modelSelect.querySelector('optgroup[label="Guitar Overdrive"]')).not.toBeNull();
    expect(modelSelect.querySelector('optgroup[label="EQ"]')).not.toBeNull();

    fireEvent.change(modelSelect, {
      target: { value: "rodent-drive" },
    });

    expect(onWriteFxModel).toHaveBeenCalledWith("pre-1", "rodent-drive");
  });

  it("renders read-only parameter values from the latest refresh", () => {
    render(<PedalWorkbench {...defaultProps} fxParamValues={{ "pre-1": [0.5, 0.25, 0.75] }} />);

    expect(screen.queryByRole("img", { name: "Parameter shape" })).not.toBeInTheDocument();
    expect(screen.getAllByText("3 synced values").length).toBeGreaterThan(0);
    expect(screen.getByText("5.0")).toBeInTheDocument();
    expect(screen.getByText("2.5")).toBeInTheDocument();
    expect(screen.getByText("75.0 %")).toBeInTheDocument();
    expect(screen.queryByText(/normalized/i)).not.toBeInTheDocument();
  });

  it("builds a Parametric 3 graph from the synced EQ band values", () => {
    render(
      <PedalWorkbench
        {...defaultProps}
        deviceModelStates={{
          "pre-1": {
            slotId: "pre-1",
            rawId: "A11F",
            numericId: 41247,
            displayName: "Parametric 3",
            categoryLabel: "EQ",
            deviceId: "parametric-3",
            known: true,
            compatible: true,
          },
        }}
        fxParamValues={{ "pre-1": Array(16).fill(0.5) }}
      />,
    );

    expect(screen.getByRole("img", { name: "Parametric EQ curve" })).toBeInTheDocument();
    expect(screen.getByText("Derived from 3 synced EQ bands")).toBeInTheDocument();
    expect(screen.queryByText(/parameters waiting for refresh/)).not.toBeInTheDocument();
  });

  it("shows one inline progress lane instead of duplicate refresh loaders", () => {
    render(
      <PedalWorkbench
        {...defaultProps}
        deviceModelStates={{
          "pre-1": {
            slotId: "pre-1",
            rawId: "A51F",
            numericId: 42271,
            displayName: "Graphic 9",
            categoryLabel: "EQ",
            deviceId: "graphic-9",
            known: true,
            compatible: true,
          },
        }}
        fxParamLoadingSlot="pre-1"
        fxParamRefreshAttempt={{ slot: "pre-1", attempt: 2, maxAttempts: 3 }}
        deviceActivityMessage="Reading FX parameters for pre-1"
        fxParamValues={{ "pre-1": [0.5, 0.5, 0.5] }}
      />,
    );

    expect(screen.getAllByText("streaming values").length).toBeGreaterThan(0);
    expect(screen.getByText("9 parameters syncing from device")).toBeInTheDocument();
    expect(
      screen.getByRole("progressbar", { name: "Reading 9 parameter values (attempt 2/3)" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("progressbar")).toHaveLength(1);
    expect(screen.queryByRole("img", { name: "Graphic EQ curve" })).not.toBeInTheDocument();
    expect(screen.queryByText("9 parameters waiting for refresh")).not.toBeInTheDocument();
  });

  it("keeps On/Off readout stable while parameter refresh is active", () => {
    const activeCcState = { ...DEFAULT_CC_STATE, [CC.EQ]: true };
    const bypassedCcState = { ...DEFAULT_CC_STATE, [CC.EQ]: false };
    const { rerender } = render(
      <PedalWorkbench
        {...defaultProps}
        ccState={activeCcState}
        fxParamLoadingSlot="pre-1"
        fxParamRefreshAttempt={{ slot: "pre-1", attempt: 1, maxAttempts: 3 }}
      />,
    );

    expect(screen.getByRole("button", { name: "Toggle Pre FX 1" })).toHaveTextContent("On");

    rerender(
      <PedalWorkbench
        {...defaultProps}
        ccState={bypassedCcState}
        fxParamLoadingSlot="pre-1"
        fxParamRefreshAttempt={{ slot: "pre-1", attempt: 2, maxAttempts: 3 }}
      />,
    );

    expect(screen.getByRole("button", { name: "Toggle Pre FX 1" })).toHaveTextContent("On");

    rerender(<PedalWorkbench {...defaultProps} ccState={bypassedCcState} />);

    expect(screen.getByRole("button", { name: "Toggle Pre FX 1" })).toHaveTextContent("Off");
  });

  it("shows a retryable failed state when parameter refresh exhausts", () => {
    render(
      <PedalWorkbench {...defaultProps} fxParamError="No FX parameter refresh reply received" />,
    );

    expect(
      screen.getByText(
        "Could not sync parameter values after retrying. Refresh values again or reconnect Bluetooth.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("3 parameters could not sync")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh values" })).toBeEnabled();
  });

  it("shows device activity progress inside the tone studio panel", () => {
    render(
      <PedalWorkbench {...defaultProps} deviceActivityMessage="Reading FX parameters for pre-1" />,
    );

    expect(screen.getByText("Reading 3 parameter values from the device")).toBeInTheDocument();
    expect(
      screen.getByRole("progressbar", { name: "Reading 3 parameter values from the device" }),
    ).toBeInTheDocument();
  });

  it("keeps parameter controls hidden while active device activity is draining", () => {
    render(
      <PedalWorkbench
        {...defaultProps}
        deviceActivityMessage="Reading FX parameters for pre-1"
        fxParamValues={{ "pre-1": [0.5, 0.5, 0.5] }}
      />,
    );

    expect(screen.getByText("Parameter values synced")).toBeInTheDocument();
    expect(
      screen.getByRole("progressbar", { name: "Parameter values synced" }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Write /)).not.toBeInTheDocument();
  });

  it("keeps mounted parameter controls visible during live parameter writes", () => {
    render(
      <PedalWorkbench
        {...defaultProps}
        canWriteParams
        fxParamWritingKey="pre-1:0"
        deviceActivityMessage="FX PARAM PRE-1 #1 WRITE"
        fxParamValues={{ "pre-1": [0.5, 0.5, 0.5] }}
      />,
    );

    expect(screen.getAllByLabelText(/^Write /)).toHaveLength(3);
    expect(
      screen.getByRole("progressbar", { name: "FX PARAM PRE-1 #1 WRITE" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Reading parameter values from the device.")).toBeNull();
  });

  it("reserves the tone studio activity lane even when there is no visible progress", () => {
    const { rerender } = render(
      <PedalWorkbench {...defaultProps} fxParamValues={{ "pre-1": [0.5, 0.5, 0.5] }} />,
    );

    expect(screen.getByTestId("tone-studio-device-activity-lane")).toHaveStyle({ opacity: "0" });

    rerender(
      <PedalWorkbench
        {...defaultProps}
        deviceActivityMessage="Reading device state"
        fxParamValues={{ "pre-1": [0.5, 0.5, 0.5] }}
      />,
    );

    expect(screen.getByTestId("tone-studio-device-activity-lane")).toHaveStyle({ opacity: "1" });
    expect(screen.getByRole("progressbar", { name: "Reading device state" })).toBeInTheDocument();
  });

  it("does not show background FX parameter progress inside the selected block panel", () => {
    render(
      <PedalWorkbench
        {...defaultProps}
        canRefreshParams={false}
        deviceActivityMessage="Reading FX parameters for pre-2"
      />,
    );

    expect(
      screen.queryByRole("progressbar", { name: "Reading FX parameters for pre-2" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Reading FX parameters for pre-2")).not.toBeInTheDocument();
    expect(screen.getByText("3 parameters waiting for refresh")).toBeInTheDocument();
  });

  it("writes a filter parameter from the contextual graph handle", () => {
    const onWriteFxParam = vi.fn();
    render(
      <PedalWorkbench
        {...defaultProps}
        deviceModelStates={{
          "pre-1": {
            slotId: "pre-1",
            rawId: "FA2E",
            numericId: 64046,
            displayName: "Analog Delay",
            categoryLabel: "Delay",
            deviceId: "analog-delay",
            known: true,
            compatible: true,
          },
        }}
        canWriteParams
        onWriteFxParam={onWriteFxParam}
        fxParamValues={{ "pre-1": Array(12).fill(0.5) }}
      />,
    );

    const graph = screen.getByRole("img", { name: "Filter curve" });
    expect(screen.getByText("Derived from high/low pass filters")).toBeInTheDocument();
    const parameterHeadings = screen
      .getAllByText(/^(High Pass|Low Pass|Mix)$/)
      .map((element) => element.textContent);
    expect(parameterHeadings.slice(0, 2)).toEqual(["High Pass", "Low Pass"]);
    vi.spyOn(graph, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 320,
      bottom: 128,
      width: 320,
      height: 128,
      toJSON: () => ({}),
    });

    const mixHandle = screen.getByRole("slider", { name: "Drag Filter curve High Pass" });
    const highPassSlider = screen.getByLabelText("Write High Pass");
    expect(mixHandle).toHaveAttribute("title", "High Pass: 410 Hz");
    expect(highPassSlider).toHaveValue("0.5");
    const curvePath = graph.querySelectorAll("path")[2];
    const initialCurve = curvePath?.getAttribute("d");

    fireEvent.pointerDown(mixHandle, {
      pointerId: 1,
      clientX: 160,
      clientY: 64,
    });
    fireEvent.pointerMove(graph, { pointerId: 1, clientX: 260, clientY: 24 });
    expect(curvePath?.getAttribute("d")).not.toBe(initialCurve);
    expect(highPassSlider).not.toHaveValue("0.5");
    expect(mixHandle).not.toHaveAttribute("title", "High Pass: 410 Hz");
    fireEvent.pointerUp(graph, { pointerId: 1, clientX: 260, clientY: 24 });

    expect(onWriteFxParam).toHaveBeenCalledWith("pre-1", 2, expect.any(Number));
    expect(onWriteFxParam.mock.calls[0]?.[2]).toBeGreaterThan(0);
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
      screen.getByText("Cab/IR values are read from the selected IR slot."),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Refresh IR values" })).toHaveLength(1);
    expect(screen.getByRole("img", { name: "Cab/IR response shape" })).toBeInTheDocument();
    expect(screen.getByText("Derived from level, filters, mic, and position")).toBeInTheDocument();
    expect(screen.getAllByText("810 Amped VT Aln 70s").length).toBeGreaterThan(0);
    expect(screen.getByText("-3.5 dB")).toBeInTheDocument();
    expect(screen.getByText("80 Hz")).toBeInTheDocument();
    expect(screen.getByText("9500 Hz")).toBeInTheDocument();
    expect(screen.getByText("Ribbon 160")).toBeInTheDocument();
  });

  it("keeps the IR Loader graph unsynced until Cab/IR params are refreshed", () => {
    render(
      <PedalWorkbench
        {...defaultProps}
        activeSlot="ir-loader"
        canWriteFixedBlocks
        loadedSlotNames={{ "ir-loader": "212 US TWN C12Q 00s" }}
        fixedBlockReadback={{
          gateOn: true,
          captureSlot: 2,
          captureName: "US Prince 65 4",
          captureVolume: 127,
          cabIrSlot: 2,
          cabIrOn: true,
          cabIrName: "212 US TWN C12Q 00s",
          cabIrParams: null,
          cabIrParamsLoading: false,
          cabIrParamsError: null,
        }}
      />,
    );

    expect(screen.getAllByText("212 US TWN C12Q 00s").length).toBeGreaterThan(0);
    expect(screen.getByText("Refresh IR values to sync filters")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "Cab/IR response shape" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("slider", {
        name: "Drag Cab/IR response shape High pass",
      }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByText("Refresh first")).toHaveLength(3);
    expect(screen.getAllByText("Refresh values first")).toHaveLength(3);
  });

  it("writes Cab/IR filters from draggable graph handles", () => {
    const onWriteCabIrParam = vi.fn();
    render(
      <PedalWorkbench
        {...defaultProps}
        activeSlot="ir-loader"
        canWriteFixedBlocks
        onWriteCabIrParam={onWriteCabIrParam}
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

    const graph = screen.getByRole("img", { name: "Cab/IR response shape" });
    vi.spyOn(graph, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 320,
      bottom: 128,
      width: 320,
      height: 128,
      toJSON: () => ({}),
    });

    const highPassHandle = screen.getByRole("slider", {
      name: "Drag Cab/IR response shape High pass",
    });
    expect(highPassHandle).toHaveAttribute("title", "High pass: 80 Hz");

    fireEvent.pointerDown(highPassHandle, {
      pointerId: 1,
      clientX: 88,
      clientY: 64,
    });
    fireEvent.pointerMove(graph, { pointerId: 1, clientX: 160, clientY: 64 });
    fireEvent.pointerUp(graph, { pointerId: 1, clientX: 160, clientY: 64 });

    expect(onWriteCabIrParam).toHaveBeenCalledWith("high-pass", expect.any(Number));
    expect(onWriteCabIrParam.mock.calls[0]?.[1]).toBeGreaterThanOrEqual(20);
    expect(onWriteCabIrParam.mock.calls[0]?.[1]).toBeLessThanOrEqual(800);
  });

  it("selects the Capture fixed block through the FS I bank-slot write path", () => {
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
    fireEvent.click(
      screen.getByRole("button", { name: "Select Capture · FS I rotary Bank A slot 3" }),
    );

    expect(onFootswitchRotaryChange).toHaveBeenCalledWith("I", 3);
  });

  it("selects the IR Loader fixed block through the FS II bank-slot write path", () => {
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
    fireEvent.click(screen.getByRole("button", { name: "Select Cab / IR · FS II rotary slot 3" }));

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
