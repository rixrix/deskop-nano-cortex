/**
 * TypeScript types for the MIDI feature — connection state, log entries, and footswitch model.
 *
 * @see docs/specs/200-frontend-control-surface/spec.md [FR-31]
 * @see docs/specs/200-frontend-control-surface/design.md [DES-FRONT-APP]
 */
export type MidiMessageKind = "pc" | "cc" | "raw";

export interface CCState {
  [cc: number]: boolean;
}

export interface MidiLogEntry {
  id: string;
  ts: number;
  kind: MidiMessageKind;
  channel: number;
  number: number;
  value?: number;
  label: string;
  bytes: number[];
}

export type PresetOperationMode = "4-preset" | "2-preset";
export type FootswitchId = "I" | "II";
export type FootswitchSubslot = "A" | "B";
export type QuickPresetSlot = "IA" | "IB" | "IIA" | "IIB";
export type FootswitchPressRole = "preset-toggle" | "global-bypass";
export type FootswitchLongPressAction = "tap-tempo" | "tuner";

export interface FootswitchState {
  role: FootswitchPressRole;
  currentAssignedA: number;
  currentAssignedB: number;
  activeSubslot: FootswitchSubslot;
  longPressAction: FootswitchLongPressAction;
}

export interface FootswitchIIState extends FootswitchState {
  globalBypassEnabled: boolean;
}

export interface NanoCortexFootswitchState {
  presetOperationMode: PresetOperationMode;
  footswitchI: FootswitchState;
  footswitchII: FootswitchIIState;
}
