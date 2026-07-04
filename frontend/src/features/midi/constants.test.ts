/**
 * Locks the documented Nano Cortex MIDI control map so accidental edits surface in CI.
 *
 * @see docs/specs/200-frontend-control-surface/spec.md [FR-30]
 * @see docs/specs/400-dx-tooling/spec.md [FR-9]
 */
import { describe, it, expect } from "vitest";
import {
  MIDI_CC,
  FX_SLOT_CC,
  TOTAL_PRESETS,
  TOTAL_BANKS,
  PRESETS_PER_ROW,
  DEFAULT_PRESET_PROGRAM_MAP,
} from "./constants";

describe("documented MIDI CC map", () => {
  it("matches the Nano Cortex manual: CC1 expression, CC37-43 controls", () => {
    expect(MIDI_CC.EXPRESSION).toBe(1);
    expect(MIDI_CC.TAP_TEMPO).toBe(42);
    expect(MIDI_CC.TUNER).toBe(43);
  });

  it("maps the five FX slots to contiguous CC 37-41", () => {
    expect(FX_SLOT_CC).toEqual([37, 38, 39, 40, 41]);
  });
});

describe("preset program map", () => {
  it("covers 64 presets across 8 banks of 8", () => {
    expect(TOTAL_PRESETS).toBe(64);
    expect(PRESETS_PER_ROW).toBe(8);
    expect(TOTAL_BANKS).toBe(8);
  });

  it("maps program numbers 0-63 to 1-based slot labels", () => {
    expect(DEFAULT_PRESET_PROGRAM_MAP).toHaveLength(64);
    expect(DEFAULT_PRESET_PROGRAM_MAP[0]).toMatchObject({ programNumber: 0, slotLabel: "01" });
    expect(DEFAULT_PRESET_PROGRAM_MAP[63]).toMatchObject({ programNumber: 63, slotLabel: "64" });
  });
});
