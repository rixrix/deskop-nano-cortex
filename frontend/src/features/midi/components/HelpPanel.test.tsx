/**
 * Regression tests for the Console Help surface.
 *
 * @see docs/specs/200-frontend-control-surface/spec.md [FR-1]
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HelpPanel } from "./HelpPanel";

describe("HelpPanel", () => {
  it("explains transport roles, save modes, and unsaved switching", () => {
    render(<HelpPanel />);

    expect(
      screen.getByRole("heading", { name: "Working with the Nano at a desk" }),
    ).toBeInTheDocument();
    expect(screen.getByText("What each connection can do")).toBeInTheDocument();
    expect(screen.getByText("USB only")).toBeInTheDocument();
    expect(screen.getByText("Bluetooth only")).toBeInTheDocument();
    expect(screen.getByText("Manual save is the default")).toBeInTheDocument();
    expect(screen.getByText("Confirm vs Auto-discard")).toBeInTheDocument();
    expect(screen.getByText(/Discard mirrors the device EXIT behavior/i)).toBeInTheDocument();
    expect(screen.getByText("Pair again each app session")).toBeInTheDocument();
    expect(screen.getAllByText(/EXIT \+ CAPTURE/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/uses the manual pairing path/i)).toBeInTheDocument();
  });
});
