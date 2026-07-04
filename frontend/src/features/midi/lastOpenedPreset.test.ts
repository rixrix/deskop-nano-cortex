/**
 * Unit tests for remembering the last real preset opened in the Console.
 *
 * @see docs/specs/200-frontend-control-surface/spec.md [FR-40]
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  normalizePresetIndex,
  readLastOpenedPreset,
  rememberLastOpenedPreset,
} from "./lastOpenedPreset";
import { LAST_OPENED_PRESET_STORAGE_KEY } from "./settingsKeys";

beforeEach(() => {
  localStorage.clear();
});

describe("last opened preset", () => {
  it("defaults to A1 when no preset has been remembered", () => {
    expect(readLastOpenedPreset()).toBe(0);
  });

  it("remembers a valid preset index", () => {
    expect(rememberLastOpenedPreset(16)).toBe(16);
    expect(localStorage.getItem(LAST_OPENED_PRESET_STORAGE_KEY)).toBe("16");
    expect(readLastOpenedPreset()).toBe(16);
  });

  it("falls back to A1 for invalid stored values", () => {
    for (const value of ["", "abc", "-1", "64", "4.5"]) {
      localStorage.setItem(LAST_OPENED_PRESET_STORAGE_KEY, value);
      expect(readLastOpenedPreset()).toBe(0);
    }
  });

  it("normalizes invalid write values to A1", () => {
    expect(normalizePresetIndex(63)).toBe(63);
    expect(rememberLastOpenedPreset(99)).toBe(0);
    expect(localStorage.getItem(LAST_OPENED_PRESET_STORAGE_KEY)).toBe("0");
  });
});
