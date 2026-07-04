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

    expect(screen.queryByLabelText("A1 name")).not.toBeInTheDocument();
    expect(screen.getByLabelText("B3 name")).toBeInTheDocument();
  });

  it("expands an inactive bank from its bank header", () => {
    renderRail({ currentPreset: 10 });

    fireEvent.click(screen.getByRole("button", { name: /Bank A/ }));

    expect(screen.getByLabelText("A1 name")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Bank A/ })).toHaveAttribute("aria-expanded", "true");
  });

  it("keeps the active bank open when its header is clicked", () => {
    renderRail({ currentPreset: 10 });

    fireEvent.click(screen.getByRole("button", { name: /Bank B/ }));

    expect(screen.getByLabelText("B3 name")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Bank B/ })).toHaveAttribute("aria-expanded", "true");
  });

  it("names the collapsed rail as a preset selector with the active slot", () => {
    renderRail({ currentPreset: 0, collapsed: true });

    expect(screen.getByText("Preset - A1")).toBeInTheDocument();
  });

  it("notifies the app when a preset name changes", () => {
    const onRenamePreset = vi.fn();
    renderRail({ currentPreset: 0, onRenamePreset });

    fireEvent.change(screen.getByLabelText("A1 name"), { target: { value: "Stage Lead" } });

    expect(onRenamePreset).toHaveBeenCalledWith(0, "Stage Lead");
  });

  it("preserves a trailing space while renaming so the next word can be typed", () => {
    const onRenamePreset = vi.fn();
    renderRail({ currentPreset: 0, onRenamePreset });

    const input = screen.getByLabelText("A1 name") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Bass Classic " } });

    expect(input.value).toBe("Bass Classic ");
    expect(onRenamePreset).toHaveBeenCalledWith(0, "Bass Classic ");
  });
});
