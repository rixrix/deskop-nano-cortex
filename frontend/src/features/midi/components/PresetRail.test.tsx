/**
 * Unit tests for the Live preset rail bank-folding affordance.
 *
 * @see docs/specs/200-frontend-control-surface/spec.md [FR-44]
 * @see docs/specs/400-dx-tooling/spec.md [FR-9]
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PresetRail } from "./PresetRail";

const defaultProps = {
  currentPreset: 10,
  isConnected: true,
  collapsed: false,
  disabled: false,
  loadingPreset: null,
  onSelectPreset: vi.fn(),
  onRenamePreset: vi.fn(),
  onToggleCollapsed: vi.fn(),
};

function renderRail(overrides: Partial<typeof defaultProps> = {}) {
  const props = { ...defaultProps, ...overrides };
  render(<PresetRail {...props} />);
  return props;
}

describe("PresetRail bank folding", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("starts with the active bank expanded and inactive banks collapsed", () => {
    renderRail({ currentPreset: 10 });

    expect(screen.queryByRole("button", { name: "Recall A1" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Recall B3" })).toBeInTheDocument();
  });

  it("expands an inactive bank from its bank header", () => {
    renderRail({ currentPreset: 10 });

    fireEvent.click(screen.getByRole("button", { name: /Bank A/ }));

    expect(screen.getByRole("button", { name: "Recall A1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Bank A/ })).toHaveAttribute("aria-expanded", "true");
  });

  it("collapses the active bank while keeping the active-preset chip visible", () => {
    renderRail({ currentPreset: 10 });

    fireEvent.click(screen.getByRole("button", { name: /Bank B/ }));

    expect(screen.queryByRole("button", { name: "Recall B3" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Bank B/ })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    // The header chip still names the current selection (B3) while collapsed.
    expect(screen.getByRole("button", { name: /Bank B/ })).toHaveTextContent("B3");
  });

  it("renders names as labels and only shows the editor after the pencil is pressed", () => {
    renderRail({ currentPreset: 0 });

    expect(screen.queryByLabelText("A1 name")).not.toBeInTheDocument();
    expect(screen.getByText("Preset 1")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Edit A1 name" }));

    expect(screen.getByLabelText("A1 name")).toHaveFocus();
  });

  it("closes the name editor on blur", () => {
    renderRail({ currentPreset: 0 });

    fireEvent.click(screen.getByRole("button", { name: "Edit A1 name" }));
    fireEvent.blur(screen.getByLabelText("A1 name"));

    expect(screen.queryByLabelText("A1 name")).not.toBeInTheDocument();
  });

  it("names the collapsed rail as a preset selector with the active slot", () => {
    renderRail({ currentPreset: 0, collapsed: true });

    expect(screen.getByText("Preset - A1")).toBeInTheDocument();
  });

  it("notifies the app when a preset name changes", () => {
    const onRenamePreset = vi.fn();
    renderRail({ currentPreset: 0, onRenamePreset });

    fireEvent.click(screen.getByRole("button", { name: "Edit A1 name" }));
    fireEvent.change(screen.getByLabelText("A1 name"), { target: { value: "Stage Lead" } });

    expect(onRenamePreset).toHaveBeenCalledWith(0, "Stage Lead");
  });

  it("preserves a trailing space while renaming so the next word can be typed", () => {
    const onRenamePreset = vi.fn();
    renderRail({ currentPreset: 0, onRenamePreset });

    fireEvent.click(screen.getByRole("button", { name: "Edit A1 name" }));
    const input = screen.getByLabelText("A1 name") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Bass Classic " } });

    expect(input.value).toBe("Bass Classic ");
    expect(onRenamePreset).toHaveBeenCalledWith(0, "Bass Classic ");
  });

  it("shows the USB needed badge only while the command path is unavailable", () => {
    renderRail({ isConnected: false });
    expect(screen.getByText("USB needed")).toBeInTheDocument();
  });

  it("keeps preset names read-only while disconnected", () => {
    renderRail({ currentPreset: 0, isConnected: false });

    const pencil = screen.getByRole("button", { name: "Edit A1 name" });
    expect(pencil).toBeDisabled();
    fireEvent.click(pencil);
    expect(screen.queryByLabelText("A1 name")).not.toBeInTheDocument();
  });

  it("hides the USB needed badge when connected", () => {
    renderRail();
    expect(screen.queryByText("USB needed")).not.toBeInTheDocument();
  });
});
