/**
 * Unit tests for useUpdateNudge — the one-time-per-version "update available" toast trigger.
 *
 * @see docs/specs/200-frontend-control-surface/spec.md [FR-48]
 */
import { beforeEach, describe, expect, it } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useUpdateNudge } from "./useUpdateNudge";
import type { UpdateState } from "./useLatestRelease";

const update = (version: string): UpdateState => ({ status: "update", version });

describe("useUpdateNudge", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("stays hidden while checking, when up to date, and on a failed check", () => {
    for (const state of [
      { status: "checking" },
      { status: "latest", version: "1.0.1" },
      { status: "error" },
    ] as UpdateState[]) {
      const { result } = renderHook(() => useUpdateNudge(state));
      expect(result.current.visible).toBe(false);
    }
  });

  it("shows when a newer release is detected", () => {
    const { result } = renderHook(() => useUpdateNudge(update("1.1.0")));
    expect(result.current.visible).toBe(true);
  });

  it("dismiss hides the toast and persists across remounts for the same version", () => {
    const { result } = renderHook(() => useUpdateNudge(update("1.1.0")));
    act(() => result.current.dismiss());
    expect(result.current.visible).toBe(false);

    const { result: remounted } = renderHook(() => useUpdateNudge(update("1.1.0")));
    expect(remounted.current.visible).toBe(false);
  });

  it("a newer version than the dismissed one toasts again", () => {
    const { result } = renderHook(() => useUpdateNudge(update("1.1.0")));
    act(() => result.current.dismiss());

    const { result: next } = renderHook(() => useUpdateNudge(update("1.2.0")));
    expect(next.current.visible).toBe(true);
  });

  it("dismiss is a no-op when there is no update", () => {
    const { result } = renderHook(() => useUpdateNudge({ status: "checking" }));
    act(() => result.current.dismiss());
    expect(localStorage.getItem("nano:updateNudgeDismissedVersion")).toBeNull();
  });
});
