/**
 * Unit tests for useSupportNudge — the recurring, cooldown-based support nudge trigger.
 * No permanent dismiss exists; every assertion here proves the nudge can always resurface.
 *
 * Cooldown math (BASE_COOLDOWN_MS=7d, COOLDOWN_GROWTH=1.5): after the 1st showing, the next
 * requires the base 7-day wait; growth applies from the 2nd showing onward, so the wait before
 * the 3rd is `7 * 1.5^1` = 10.5 days, before the 4th `7 * 1.5^2` = 15.75 days, and so on.
 *
 * @see docs/specs/200-frontend-control-surface/spec.md [FR-42]
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSupportNudge } from "./useSupportNudge";

const DAY_MS = 24 * 60 * 60 * 1000;

function connectThreeTimes(rerender: (props: { isConnected: boolean }) => void) {
  for (let i = 0; i < 3; i++) {
    rerender({ isConnected: true });
    rerender({ isConnected: false });
  }
}

function reconnect(rerender: (props: { isConnected: boolean }) => void) {
  rerender({ isConnected: false });
  rerender({ isConnected: true });
}

describe("useSupportNudge", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("stays hidden for the first two connections", () => {
    const { result, rerender } = renderHook(({ isConnected }) => useSupportNudge(isConnected), {
      initialProps: { isConnected: false },
    });

    rerender({ isConnected: true });
    expect(result.current.visible).toBe(false);
    rerender({ isConnected: false });
    rerender({ isConnected: true });
    expect(result.current.visible).toBe(false);
  });

  it("shows on the third distinct connection", () => {
    const { result, rerender } = renderHook(({ isConnected }) => useSupportNudge(isConnected), {
      initialProps: { isConnected: false },
    });

    connectThreeTimes(rerender);
    expect(result.current.visible).toBe(true);
  });

  it("dismiss hides it without setting a permanent flag", () => {
    const { result, rerender } = renderHook(({ isConnected }) => useSupportNudge(isConnected), {
      initialProps: { isConnected: false },
    });
    connectThreeTimes(rerender);
    expect(result.current.visible).toBe(true);

    act(() => result.current.dismiss());
    expect(result.current.visible).toBe(false);
    // No "dismissed forever" key exists anywhere in this design.
    expect(Object.keys(localStorage)).not.toContain("nano:supportNudgeDismissed");
  });

  it("does not reappear immediately after dismiss, within the base cooldown", () => {
    const { result, rerender } = renderHook(({ isConnected }) => useSupportNudge(isConnected), {
      initialProps: { isConnected: false },
    });
    connectThreeTimes(rerender);
    act(() => result.current.dismiss());

    vi.setSystemTime(new Date(Date.now() + DAY_MS)); // 1 day later, well within the 7-day base cooldown
    reconnect(rerender);
    expect(result.current.visible).toBe(false);
  });

  it("reappears once the base cooldown elapses", () => {
    const { result, rerender } = renderHook(({ isConnected }) => useSupportNudge(isConnected), {
      initialProps: { isConnected: false },
    });
    connectThreeTimes(rerender);
    act(() => result.current.dismiss());

    vi.setSystemTime(new Date(Date.now() + 8 * DAY_MS)); // past the 7-day base cooldown
    reconnect(rerender);
    expect(result.current.visible).toBe(true);
  });

  it("grows the cooldown after each showing, so the previous wait is no longer enough", () => {
    const { result, rerender } = renderHook(({ isConnected }) => useSupportNudge(isConnected), {
      initialProps: { isConnected: false },
    });
    connectThreeTimes(rerender); // 1st showing
    expect(result.current.visible).toBe(true);
    act(() => result.current.dismiss());
    const afterFirstDismiss = Date.now();

    // 2nd showing requires the 7-day base cooldown.
    vi.setSystemTime(new Date(afterFirstDismiss + 8 * DAY_MS));
    reconnect(rerender);
    expect(result.current.visible).toBe(true);
    act(() => result.current.dismiss());
    const afterSecondDismiss = Date.now();

    // 3rd showing requires 7 * 1.5^1 = 10.5 days. The 8 days that worked last time is no longer enough.
    vi.setSystemTime(new Date(afterSecondDismiss + 8 * DAY_MS));
    reconnect(rerender);
    expect(result.current.visible).toBe(false);

    // 12 days clears the grown cooldown.
    vi.setSystemTime(new Date(afterSecondDismiss + 12 * DAY_MS));
    reconnect(rerender);
    expect(result.current.visible).toBe(true);
  });

  it("resurfaces during one long continuous session even without reconnecting", () => {
    const { result, rerender } = renderHook(({ isConnected }) => useSupportNudge(isConnected), {
      initialProps: { isConnected: false },
    });
    connectThreeTimes(rerender); // 1st showing
    act(() => result.current.dismiss()); // next showing requires the 7-day base cooldown

    // Reconnect once, then never disconnect again — the cooldown must clear via the periodic
    // in-session check alone, not via another connect/disconnect edge.
    reconnect(rerender);
    expect(result.current.visible).toBe(false); // still within the 7-day cooldown

    act(() => {
      vi.advanceTimersByTime(12 * DAY_MS); // past 10.5 days, ticking the 1-minute interval throughout
    });
    expect(result.current.visible).toBe(true);
  });
});
