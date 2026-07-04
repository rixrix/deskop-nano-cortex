/**
 * Nano Cortex MIDI CC map and feature constants — documented control surface values.
 * Signal chain mental model:
 *   Gate → Pre FX 1 → Pre FX 2 → Capture → IR/Cab → Post FX 1 → Post FX 2 → Post FX 3
 *
 * The hardware order is fixed. UI slots should be role containers first, loaded
 * effect/asset names second.
 *
 * CC values toggle bypass state (on/off, value 0=off 127=on).
 * Program Change 0-63 selects presets 1-64.
 *
 * @see docs/specs/200-frontend-control-surface/spec.md [FR-30]
 * @see docs/specs/200-frontend-control-surface/design.md [DES-FRONT-CONSTANTS]
 */
export const CC = {
  EXPRESSION: 1,
  GATE: 34,
  CAPTURE: 35,
  CAB: 36,
  EQ: 37, // Documented FX Slot 1 bypass CC.
  MOD: 38, // Documented FX Slot 2 bypass CC.
  DELAY: 39, // Documented FX Slot 3 bypass CC.
  REVERB: 40, // Documented FX Slot 4 bypass CC.
  COMP: 41, // Documented FX Slot 5 bypass CC.
  TAP: 42,
  TUNER: 43,
} as const;

/** Default state — all effects bypassed (off). */
export const DEFAULT_CC_STATE: Record<number, boolean> = {
  [CC.GATE]: false,
  [CC.CAPTURE]: false,
  [CC.CAB]: false,
  [CC.EQ]: false,
  [CC.MOD]: false,
  [CC.DELAY]: false,
  [CC.REVERB]: false,
  [CC.COMP]: false,
  [CC.TUNER]: false,
};

/** Human-readable labels for each effect block. */
export const EFFECT_LABELS: Record<number, string> = {
  [CC.GATE]: "Gate",
  [CC.CAPTURE]: "Capture",
  [CC.CAB]: "CAB",
  [CC.EQ]: "EQ",
  [CC.MOD]: "Mod",
  [CC.DELAY]: "Delay",
  [CC.REVERB]: "Reverb",
  [CC.COMP]: "Comp",
  [CC.TUNER]: "Tuner",
};

export const TOTAL_PRESETS = 64;
export const PRESETS_PER_ROW = 8;
export const TOTAL_BANKS = TOTAL_PRESETS / PRESETS_PER_ROW;

/** Documented MIDI CC mapping for Nano Cortex live control. */
export const MIDI_CC = {
  EXPRESSION: 1,
  FX_SLOT_1: 37,
  FX_SLOT_2: 38,
  FX_SLOT_3: 39,
  FX_SLOT_4: 40,
  FX_SLOT_5: 41,
  TAP_TEMPO: 42,
  TUNER: 43,
} as const;

export const FX_SLOT_CC: number[] = [
  MIDI_CC.FX_SLOT_1,
  MIDI_CC.FX_SLOT_2,
  MIDI_CC.FX_SLOT_3,
  MIDI_CC.FX_SLOT_4,
  MIDI_CC.FX_SLOT_5,
];

export const DEFAULT_PRESET_PROGRAM_MAP = Array.from(
  { length: TOTAL_PRESETS },
  (_, programNumber) => ({
    programNumber,
    slotLabel: `${String(programNumber + 1).padStart(2, "0")}`,
    presetName: `Preset ${programNumber + 1}`,
  }),
);

/** Default Nano Cortex footswitch behavior model. */
export const DEFAULT_FOOTSWITCH_STATE = {
  presetOperationMode: "4-preset",
  footswitchI: {
    role: "preset-toggle",
    currentAssignedA: 0,
    currentAssignedB: 1,
    activeSubslot: "A",
    longPressAction: "tap-tempo",
  },
  footswitchII: {
    role: "preset-toggle",
    currentAssignedA: 2,
    currentAssignedB: 3,
    activeSubslot: "A",
    longPressAction: "tuner",
    globalBypassEnabled: false,
  },
} as const;

/** Footswitch rotary selectors address five LED-indicated slots plus bypass. */
const FOOTSWITCH_ROTARY_LED_COUNT = 5;
export const FOOTSWITCH_ROTARY_MAX = FOOTSWITCH_ROTARY_LED_COUNT;
