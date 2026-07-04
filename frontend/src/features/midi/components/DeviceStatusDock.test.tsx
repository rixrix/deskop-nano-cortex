/**
 * Regression tests for the top status dock.
 *
 * @see docs/specs/200-frontend-control-surface/spec.md [FR-8]
 */
import { act, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { DeviceStatusDock } from "./DeviceStatusDock";

type DeviceStatusDockProps = ComponentProps<typeof DeviceStatusDock>;

const defaultProps: DeviceStatusDockProps = {
  isConnected: true,
  deviceName: "Nano Cortex",
  ports: [{ id: "nano-usb", name: "Nano Cortex", direction: "in", kind: "usb" }],
  usbControlActive: true,
  bleStateActive: true,
  syncMessage: null,
  bleObserverState: "ready",
  latestBleNotificationTimestamp: Date.now(),
  bleNotificationCount: 8,
  entries: [],
  lastInbound: null,
  lastOutbound: null,
  presetMetadataMessage: null,
  presetMetadataComplete: false,
  presetMetadataSource: "idle",
};

function renderDock(overrides: Partial<DeviceStatusDockProps> = {}) {
  render(<DeviceStatusDock {...defaultProps} {...overrides} />);
}

describe("DeviceStatusDock", () => {
  it("shows progress for active app-device sync", () => {
    renderDock({ syncMessage: "Writing FX parameter post-2" });

    expect(screen.getByText("Writing FX parameter post-2")).toBeInTheDocument();
    expect(
      screen.getByRole("progressbar", { name: "Writing FX parameter post-2" }),
    ).toBeInTheDocument();
  });

  it("updates progress text without restarting the lane", () => {
    vi.useFakeTimers();
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.5);
    try {
      const { rerender } = render(
        <DeviceStatusDock {...defaultProps} syncMessage="Reading device state" />,
      );
      const progress = screen.getByRole("progressbar", { name: "Reading device state" });

      act(() => vi.advanceTimersByTime(800));
      const beforeLabelChange = Number(progress.getAttribute("aria-valuenow"));

      rerender(<DeviceStatusDock {...defaultProps} syncMessage="Reading FX parameters pre-1" />);

      expect(screen.getByText("Reading FX parameters pre-1")).toBeInTheDocument();
      expect(Number(progress.getAttribute("aria-valuenow"))).toBeGreaterThanOrEqual(
        beforeLabelChange,
      );
    } finally {
      randomSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  it("keeps active progress moving instead of parking at one width", () => {
    vi.useFakeTimers();
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.5);
    try {
      renderDock({ syncMessage: "Reading preset state" });
      const progress = screen.getByRole("progressbar", { name: "Reading preset state" });
      const initial = Number(progress.getAttribute("aria-valuenow"));

      act(() => vi.advanceTimersByTime(800));

      expect(Number(progress.getAttribute("aria-valuenow"))).toBeGreaterThan(initial);
    } finally {
      randomSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  it("lands at complete before restoring dock notices", () => {
    vi.useFakeTimers();
    try {
      const { rerender } = render(
        <DeviceStatusDock {...defaultProps} syncMessage="Reading presets" />,
      );

      rerender(<DeviceStatusDock {...defaultProps} syncMessage={null} />);

      const complete = screen.getByRole("progressbar", { name: "Sync complete" });
      expect(complete).toHaveAttribute("aria-valuenow", "100");

      act(() => vi.advanceTimersByTime(400));

      expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
      expect(screen.getByText("Transport")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not show a progress bar while idle", () => {
    renderDock();

    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });
});
