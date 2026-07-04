/**
 * Regression tests for the About surface identity, privacy posture, and support links.
 *
 * @see docs/specs/200-frontend-control-surface/spec.md [FR-39]
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { openExternal } from "../../../shared/ipc/commands";
import { AboutPanel } from "./AboutPanel";

vi.mock("../../../shared/ipc/commands", () => ({
  openExternal: vi.fn(() => Promise.resolve()),
}));

const update = {
  status: "latest" as const,
  version: "1.0.0",
  latestUrl: null,
};

describe("AboutPanel", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders professional app identity and the default-on telemetry posture", () => {
    render(<AboutPanel appVersion="1.0.0" update={update} />);

    expect(screen.getByRole("heading", { name: "Unofficial Nano Cortex" })).toBeInTheDocument();
    expect(screen.getAllByText("Apache-2.0").length).toBeGreaterThan(0);
    expect(screen.getByText("Telemetry posture")).toBeInTheDocument();
    expect(screen.getByText("Telemetry is on")).toBeInTheDocument();
    expect(screen.getByText(/Uses Microsoft Clarity/i)).toBeInTheDocument();
    expect(screen.getByText("Warranty notice")).toBeInTheDocument();
    expect(screen.getByText("Use at your own risk")).toBeInTheDocument();
    expect(screen.getByText("Project links")).toBeInTheDocument();
    expect(screen.getByText("https://github.com/rixrix/deskop-nano-cortex")).toBeInTheDocument();
    expect(
      screen.getByText("https://github.com/rixrix/deskop-nano-cortex/issues"),
    ).toBeInTheDocument();
    expect(screen.getByText("https://www.apache.org/licenses/LICENSE-2.0")).toBeInTheDocument();
    expect(screen.getByText("https://agenticflowx.github.io/")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Telemetry collection is on" })).not.toBeDisabled();
  });

  it("toggles telemetry off and persists the choice", () => {
    render(<AboutPanel appVersion="1.0.0" update={update} />);

    fireEvent.click(screen.getByRole("button", { name: "Telemetry collection is on" }));

    expect(screen.getByText("Telemetry is off")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Telemetry collection is off" })).toBeInTheDocument();
    expect(localStorage.getItem("desktop-nano-cortex-telemetry-enabled")).toBe("false");
  });

  it("opens project and support links through the platform shell", () => {
    render(<AboutPanel appVersion="1.0.0" update={update} />);

    fireEvent.click(screen.getByRole("button", { name: /GitHub repo/i }));
    fireEvent.click(screen.getByRole("button", { name: /Ko-fi/i }));

    expect(openExternal).toHaveBeenCalledTimes(2);
  });
});
