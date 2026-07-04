/**
 * Unit tests for the usePreset hook — app-wide keyboard shortcuts are deferred, while
 * programmatic preset navigation remains available.
 *
 * @see docs/specs/200-frontend-control-surface/spec.md [FR-18]
 * @see docs/specs/400-dx-tooling/spec.md [FR-9]
 */
import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePreset } from "./usePreset";

function fireKey(key: string, opts: Partial<KeyboardEventInit> = {}): void {
  document.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, ...opts }));
}

function makeHook(
  preset = 0,
  connected = true,
  actions: Parameters<typeof usePreset>[3] = {},
  disabled = false,
) {
  const switchPreset = vi.fn();
  const { result } = renderHook(() =>
    usePreset(switchPreset, preset, connected, actions, disabled),
  );
  return { switchPreset, result };
}

describe("keyboard shortcut deferral", () => {
  it("does not switch presets from digit keys", () => {
    const { switchPreset } = makeHook();
    act(() => {
      fireKey("1");
      fireKey("8");
      fireKey("9");
    });
    expect(switchPreset).not.toHaveBeenCalled();
  });

  it("does not navigate from arrow keys", () => {
    const { switchPreset } = makeHook(5);
    act(() => {
      fireKey("ArrowRight");
      fireKey("ArrowLeft");
    });
    expect(switchPreset).not.toHaveBeenCalled();
  });

  it("does not trigger tap, tuner, footswitch, or rotary actions from document keys", () => {
    const actions = {
      onTapTempo: vi.fn(),
      onToggleTuner: vi.fn(),
      onFootswitchPress: vi.fn(),
      onFootswitchLongPress: vi.fn(),
      onFootswitchRotaryNudge: vi.fn(),
    };
    makeHook(0, true, actions);
    act(() => {
      for (const key of [" ", "t", "q", "w", "a", "s", "d", "f"]) fireKey(key);
      fireKey("q", { shiftKey: true });
      fireKey("w", { shiftKey: true });
    });
    expect(actions.onTapTempo).not.toHaveBeenCalled();
    expect(actions.onToggleTuner).not.toHaveBeenCalled();
    expect(actions.onFootswitchPress).not.toHaveBeenCalled();
    expect(actions.onFootswitchLongPress).not.toHaveBeenCalled();
    expect(actions.onFootswitchRotaryNudge).not.toHaveBeenCalled();
  });
});

describe("navigatePreset", () => {
  it("calling next advances the preset", () => {
    const { switchPreset, result } = makeHook(10);
    act(() => {
      result.current.navigatePreset("next");
    });
    expect(switchPreset).toHaveBeenCalledWith(11);
  });

  it("calling prev retreats the preset", () => {
    const { switchPreset, result } = makeHook(10);
    act(() => {
      result.current.navigatePreset("prev");
    });
    expect(switchPreset).toHaveBeenCalledWith(9);
  });

  it("clamps at the first and last preset", () => {
    const first = makeHook(0);
    act(() => {
      first.result.current.navigatePreset("prev");
    });
    expect(first.switchPreset).toHaveBeenCalledWith(0);

    const last = makeHook(63);
    act(() => {
      last.result.current.navigatePreset("next");
    });
    expect(last.switchPreset).toHaveBeenCalledWith(63);
  });

  it("does nothing when disconnected or disabled", () => {
    const disconnected = makeHook(10, false);
    act(() => {
      disconnected.result.current.navigatePreset("next");
    });
    expect(disconnected.switchPreset).not.toHaveBeenCalled();

    const disabled = makeHook(10, true, {}, true);
    act(() => {
      disabled.result.current.navigatePreset("next");
    });
    expect(disabled.switchPreset).not.toHaveBeenCalled();
  });
});
