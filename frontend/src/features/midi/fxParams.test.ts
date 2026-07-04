/**
 * Unit tests for read-only FX parameter metadata and value formatting used by
 * Floating Tone Studio.
 *
 * @see docs/specs/200-frontend-control-surface/spec.md [FR-23] [FR-46]
 * @see docs/specs/400-dx-tooling/spec.md [FR-9]
 */
import { describe, expect, it } from "vitest";
import {
  fxParamEnumIndex,
  formatFxParamMeta,
  formatFxParamValue,
  getFxParamProfile,
  normalizedFromFxParamEnumIndex,
  normalizedToFxParamValue,
  orderedFxParams,
} from "./fxParams";

describe("fxParams", () => {
  it("returns model-specific labels for a decoded overdrive id", () => {
    const profile = getFxParamProfile("1B");

    expect(profile?.modelName).toBe("Green 808");
    expect(orderedFxParams(profile).map((param) => param.label)).toEqual([
      "Overdrive",
      "Tone",
      "Level",
    ]);
  });

  it("keeps protocol indexes while applying display order", () => {
    const profile = getFxParamProfile("FA2E");
    const ordered = orderedFxParams(profile);

    expect(ordered.map((param) => param.label).slice(0, 6)).toEqual([
      "Mix",
      "Feedback",
      "High Pass",
      "Low Pass",
      "Ping Pong",
      "Sync",
    ]);
    expect(ordered[5]?.index).toBe(10);
  });

  it("formats range and enum metadata for read-only display", () => {
    const profile = getFxParamProfile("FA2E");
    const ordered = orderedFxParams(profile);

    expect(formatFxParamMeta(ordered[0]!.meta)).toBe("0.0-100.0 %");
    expect(formatFxParamMeta(ordered[4]!.meta)).toBe("Off / On");
  });

  it("converts normalized refresh values into range display values", () => {
    const profile = getFxParamProfile("1B");
    const ordered = orderedFxParams(profile);

    expect(normalizedToFxParamValue(ordered[0]!, 0.5)).toBe(5);
    expect(formatFxParamValue(ordered[0]!, 0.5)).toBe("5.0");
  });

  it("converts normalized refresh values into enum labels", () => {
    const profile = getFxParamProfile("FA2E");
    const ordered = orderedFxParams(profile);

    expect(normalizedToFxParamValue(ordered[4]!, 0)).toBe("Off");
    expect(formatFxParamValue(ordered[4]!, 1)).toBe("On");
  });

  it("round-trips enum option indexes for selector controls", () => {
    const profile = getFxParamProfile("FA2E");
    const ordered = orderedFxParams(profile);
    const pingPong = ordered[4]!;

    expect(fxParamEnumIndex(pingPong, 0)).toBe(0);
    expect(fxParamEnumIndex(pingPong, 1)).toBe(1);
    expect(normalizedFromFxParamEnumIndex(pingPong, 1)).toBe(1);
  });

  it("clamps malformed normalized refresh values before formatting", () => {
    const profile = getFxParamProfile("FA2E");
    const ordered = orderedFxParams(profile);

    expect(formatFxParamValue(ordered[0]!, -1)).toBe("0.0 %");
    expect(formatFxParamValue(ordered[0]!, 2)).toBe("100.0 %");
  });
});
