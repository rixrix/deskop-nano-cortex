/**
 * Regression tests for the Clarity telemetry module: default-on persistence and the
 * disabled/test-mode no-ops (initClarity/sendClarityLog never touch window.clarity in tests).
 *
 * @see docs/specs/210-frontend-ipc-contracts/spec.md [FR-28]
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { initClarity, isTelemetryEnabled, sendClarityLog, setTelemetryEnabled } from "./clarity";

const STORAGE_KEY = "desktop-nano-cortex-telemetry-enabled";

describe("clarity telemetry", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("defaults to enabled when no preference is stored", () => {
    expect(isTelemetryEnabled()).toBe(true);
  });

  it("persists an explicit opt-out", () => {
    setTelemetryEnabled(false);
    expect(isTelemetryEnabled()).toBe(false);
    expect(localStorage.getItem(STORAGE_KEY)).toBe("false");
  });

  it("persists re-enabling", () => {
    setTelemetryEnabled(false);
    setTelemetryEnabled(true);
    expect(isTelemetryEnabled()).toBe(true);
    expect(localStorage.getItem(STORAGE_KEY)).toBe("true");
  });

  it("initClarity is a no-op in test mode (never injects the script tag)", () => {
    initClarity();
    expect(document.querySelector('script[src*="clarity.ms"]')).toBeNull();
  });

  it("sendClarityLog never calls window.clarity in test mode", () => {
    const clarity = vi.fn();
    window.clarity = clarity;
    sendClarityLog({ ts: Date.now(), level: "error", message: "boom" });
    expect(clarity).not.toHaveBeenCalled();
    delete window.clarity;
  });
});
