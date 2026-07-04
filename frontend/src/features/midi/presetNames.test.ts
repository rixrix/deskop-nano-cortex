/**
 * Unit tests for preset-name normalization and localStorage cache hygiene.
 *
 * @see docs/specs/200-frontend-control-surface/spec.md [FR-34]
 */
import { beforeEach, describe, expect, it } from "vitest";
import { PRESET_NAME_STORAGE_KEY } from "./settingsKeys";
import {
  describeDevicePresetMetadata,
  getPresetName,
  isInternalIdentifierName,
  loadPresetNames,
  mergeDevicePresetNames,
  metadataStatusLabel,
  normalizeDevicePresetNames,
  normalizePresetNames,
  savePresetNames,
} from "./presetNames";

describe("presetNames", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("recognizes internal identifier-shaped names", () => {
    expect(isInternalIdentifierName("Cb8ba016502e892")).toBe(true);
    expect(isInternalIdentifierName("0a8946f49948416f-cb8ba016502e892b")).toBe(true);
    expect(isInternalIdentifierName("Clean 1 Simple")).toBe(false);
    expect(isInternalIdentifierName("110 US PRN C10R")).toBe(false);
  });

  it("normalizes preset names without deduplicating real display names", () => {
    expect(
      normalizePresetNames({
        "0": "Clean 1 Simple",
        "1": "Clean 1 Simple",
        "2": "Cb8ba016502e892",
        "99": "Out of range",
      }),
    ).toEqual({
      0: "Clean 1 Simple",
      1: "Clean 1 Simple",
    });
  });

  it("preserves edit whitespace so users can continue typing a renamed preset", () => {
    savePresetNames({ 0: "Bass Classic " });

    expect(loadPresetNames()).toEqual({ 0: "Bass Classic " });
    expect(getPresetName(loadPresetNames(), 0)).toBe("Bass Classic");
  });

  it("filters stale internal identifiers when loading or saving", () => {
    localStorage.setItem(
      PRESET_NAME_STORAGE_KEY,
      JSON.stringify({ "0": "Clean", "20": "Cb8ba016502e892" }),
    );

    expect(loadPresetNames()).toEqual({ 0: "Clean" });

    savePresetNames({ 0: "Clean", 20: "Cb8ba016502e892" });
    expect(JSON.parse(localStorage.getItem(PRESET_NAME_STORAGE_KEY) ?? "{}")).toEqual({
      "0": "Clean",
    });
    expect(getPresetName(loadPresetNames(), 20)).toBe("Preset 21");
  });

  it("accepts partial slot-aligned device metadata without shifting the preset rail", () => {
    expect(normalizeDevicePresetNames(["Clean", "Crunch"], 64)).toEqual({
      0: "Clean",
      1: "Crunch",
    });
  });

  it("describes partial metadata without treating it as complete", () => {
    expect(describeDevicePresetMetadata(["Clean", "", "Cb8ba016502e892"], 64)).toMatchObject({
      names: { 0: "Clean" },
      loaded: 3,
      expected: 64,
      usable: 1,
      complete: false,
    });
  });

  it("merges partial device metadata into cached names without wiping later slots", () => {
    const metadata = describeDevicePresetMetadata(["Clean", "Crunch"], 64);

    expect(
      mergeDevicePresetNames(
        {
          0: "Old A1",
          10: "Existing B3",
        },
        metadata!,
      ),
    ).toEqual({
      0: "Clean",
      1: "Crunch",
      10: "Existing B3",
    });
  });

  it("replaces cached names when device metadata is complete", () => {
    const completeNames = Array.from({ length: 64 }, (_, index) => `Device ${index + 1}`);
    const metadata = describeDevicePresetMetadata(completeNames, 64);

    expect(mergeDevicePresetNames({ 10: "Old B3" }, metadata!)).toEqual(
      Object.fromEntries(completeNames.map((name, index) => [index, name])),
    );
  });

  it("formats metadata completeness for the dock", () => {
    expect(metadataStatusLabel({ loaded: 2, expected: 64, complete: false })).toBe(
      "Preset names 2/64",
    );
    expect(metadataStatusLabel({ loaded: 64, expected: 64, complete: true })).toBe(
      "Preset names complete",
    );
    expect(metadataStatusLabel({ loaded: 0, expected: 64, complete: false })).toBe(
      "Preset names unavailable",
    );
  });

  it("normalizes complete slot-aligned device metadata", () => {
    const names = Array.from({ length: 64 }, (_, index) =>
      index === 1 ? "" : index === 20 ? "Cb8ba016502e892" : `Preset ${index + 1}`,
    );

    expect(normalizeDevicePresetNames(names, 64)).toMatchObject({
      0: "Preset 1",
      2: "Preset 3",
      63: "Preset 64",
    });
    expect(normalizeDevicePresetNames(names, 64)).not.toHaveProperty("1");
    expect(normalizeDevicePresetNames(names, 64)).not.toHaveProperty("20");
  });

  it("uses the latest 64 slots when a metadata stream includes a stale prefix", () => {
    const current = Array.from({ length: 64 }, (_, index) => `Current ${index + 1}`);

    expect(normalizeDevicePresetNames(["Stale A", "Stale B", ...current], 64)).toMatchObject({
      0: "Current 1",
      63: "Current 64",
    });
  });
});
