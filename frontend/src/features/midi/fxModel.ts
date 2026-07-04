/**
 * Static device catalogue and signal-chain slot definitions for the Nano Cortex.
 *
 * @see docs/specs/200-frontend-control-surface/spec.md [FR-32]
 * @see docs/specs/200-frontend-control-surface/design.md [DES-FRONT-CONSTANTS]
 */
import { CC, MIDI_CC } from "./constants";

export const NANO_FX_SLOT_IDS = [
  "gate",
  "pre-1",
  "pre-2",
  "capture",
  "ir-loader",
  "post-1",
  "post-2",
  "post-3",
] as const;

export const EDITABLE_FX_SLOT_IDS = ["pre-1", "pre-2", "post-1", "post-2", "post-3"] as const;

export type NanoFxSlotId = (typeof NANO_FX_SLOT_IDS)[number];
export type EditableFxSlotId = (typeof EDITABLE_FX_SLOT_IDS)[number];
export type FxSlotSection = "input" | "pre" | "core" | "post";

export type NanoFxCategory =
  | "utility"
  | "compressor"
  | "wah"
  | "filter"
  | "guitar-overdrive"
  | "bass-overdrive"
  | "pitch"
  | "eq"
  | "modulation"
  | "delay"
  | "reverb";

export const categoryLabels: Record<NanoFxCategory, string> = {
  utility: "Utility",
  compressor: "Compressor",
  wah: "Wah",
  filter: "Filter",
  "guitar-overdrive": "Guitar Overdrive",
  "bass-overdrive": "Bass Overdrive",
  pitch: "Pitch",
  eq: "EQ",
  modulation: "Modulation",
  delay: "Delay",
  reverb: "Reverb",
};

export const devicesByCategory = {
  utility: [
    { id: "adaptive-gate", name: "Adaptive Gate", category: "utility" },
    { id: "utility-gate", name: "Utility Gate", category: "utility" },
    { id: "volume", name: "Volume", category: "utility" },
  ],
  compressor: [
    { id: "legendary-87-m", name: "Legendary 87 (M)", category: "compressor" },
    { id: "solid-state-comp-m", name: "Solid State Comp (M)", category: "compressor" },
    { id: "vca-comp-m", name: "VCA Comp (M)", category: "compressor" },
    { id: "opto-comp-m", name: "Opto Comp (M)", category: "compressor" },
  ],
  wah: [
    { id: "bubba-wah", name: "Bubba Wah", category: "wah" },
    { id: "bass-wah", name: "Bass Wah", category: "wah" },
    { id: "crying-wah", name: "Crying Wah", category: "wah" },
    { id: "crying-clyde-wah", name: "Crying Clyde Wah", category: "wah" },
  ],
  filter: [
    { id: "love-meat", name: "Love Meat", category: "filter" },
    { id: "envelope-filter", name: "Envelope Filter", category: "filter" },
  ],
  "guitar-overdrive": [
    { id: "obsessive-drive", name: "Obsessive Drive", category: "guitar-overdrive" },
    { id: "od250", name: "OD250", category: "guitar-overdrive" },
    { id: "rodent-drive", name: "Rodent Drive", category: "guitar-overdrive" },
    { id: "exotic", name: "Exotic", category: "guitar-overdrive" },
    { id: "chief-od1", name: "Chief OD1", category: "guitar-overdrive" },
    { id: "chief-bd2", name: "Chief BD2", category: "guitar-overdrive" },
    { id: "facial-fuzz", name: "Facial Fuzz", category: "guitar-overdrive" },
    { id: "exotic-z-boost", name: "Exotic Z Boost", category: "guitar-overdrive" },
    { id: "green-808", name: "Green 808", category: "guitar-overdrive" },
  ],
  "bass-overdrive": [
    { id: "microtubes-b3k", name: "Microtubes B3K", category: "bass-overdrive" },
    { id: "exotic-bass-z-boost", name: "Exotic Bass Z Boost", category: "bass-overdrive" },
  ],
  pitch: [{ id: "transpose", name: "Transpose", category: "pitch" }],
  eq: [
    { id: "parametric-3", name: "Parametric-3", category: "eq" },
    { id: "low-high-cut", name: "Low-High Cut", category: "eq" },
    { id: "graphic-9", name: "Graphic-9", category: "eq" },
    { id: "doubler", name: "Doubler", category: "eq" },
    { id: "legendary-87-st", name: "Legendary 87 (ST)", category: "eq" },
    { id: "solid-state-comp-st", name: "Solid State Comp (ST)", category: "eq" },
    { id: "vca-comp-st", name: "VCA Comp (ST)", category: "eq" },
    { id: "opto-comp-st", name: "Opto Comp (ST)", category: "eq" },
  ],
  modulation: [
    { id: "chief-ce2w-st", name: "Chief CE2W (ST)", category: "modulation" },
    { id: "chief-dc2w-st", name: "Chief DC2W (ST)", category: "modulation" },
    { id: "chorus-229t", name: "Chorus 229T", category: "modulation" },
    { id: "dream-chorus", name: "Dream Chorus", category: "modulation" },
    { id: "mx-flanger", name: "MX Flanger", category: "modulation" },
    { id: "mx-phase-95", name: "MX Phase 95", category: "modulation" },
    { id: "mx-vibe", name: "MX Vibe", category: "modulation" },
    { id: "tremolo", name: "Tremolo", category: "modulation" },
  ],
  delay: [
    { id: "analog-delay", name: "Analog Delay", category: "delay" },
    {
      id: "digital-delay-standard-delay",
      name: "Digital Delay / Standard Delay",
      category: "delay",
    },
    { id: "dual-delay", name: "Dual Delay", category: "delay" },
    { id: "dual-reverse-delay", name: "Dual Reverse Delay", category: "delay" },
    { id: "circular-delay", name: "Circular Delay", category: "delay" },
    { id: "tape-delay", name: "Tape Delay", category: "delay" },
  ],
  reverb: [
    { id: "room", name: "Room", category: "reverb" },
    { id: "hall", name: "Hall", category: "reverb" },
    { id: "modulated", name: "Modulated", category: "reverb" },
    { id: "ambience", name: "Ambience", category: "reverb" },
    { id: "cave", name: "Cave", category: "reverb" },
    { id: "mind-hall", name: "Mind Hall", category: "reverb" },
  ],
} as const satisfies Record<
  NanoFxCategory,
  readonly { id: string; name: string; category: NanoFxCategory; provisional?: boolean }[]
>;

type DeviceByCategoryMap = typeof devicesByCategory;
type DeviceArray = DeviceByCategoryMap[keyof DeviceByCategoryMap];
export type NanoFxDevice = DeviceArray[number];
export type NanoFxDeviceId = NanoFxDevice["id"];

export const categoriesBySlot = {
  gate: [],
  "pre-1": [
    "utility",
    "compressor",
    "wah",
    "filter",
    "guitar-overdrive",
    "bass-overdrive",
    "pitch",
    "eq",
  ],
  "pre-2": ["utility", "compressor", "wah", "filter", "guitar-overdrive", "bass-overdrive", "eq"],
  capture: [],
  "ir-loader": [],
  "post-1": ["eq", "modulation"],
  "post-2": ["eq", "delay"],
  "post-3": ["eq", "reverb"],
} as const satisfies Record<NanoFxSlotId, readonly NanoFxCategory[]>;

export const specialRules = [
  {
    deviceId: "transpose",
    allowedSlots: ["pre-1"],
    note: "Transpose is only available in Pre FX 1.",
  },
  {
    deviceId: "doubler",
    allowedSlots: ["post-1"],
    note: "Doubler is only available in Post FX 1.",
  },
  {
    deviceId: "legendary-87-st",
    allowedSlots: ["post-1", "post-2", "post-3"],
    note: "Stereo compressor is available in post slots.",
  },
  {
    deviceId: "solid-state-comp-st",
    allowedSlots: ["post-1", "post-2", "post-3"],
    note: "Stereo compressor is available in post slots.",
  },
  {
    deviceId: "vca-comp-st",
    allowedSlots: ["post-1", "post-2", "post-3"],
    note: "Stereo compressor is available in post slots.",
  },
  {
    deviceId: "opto-comp-st",
    allowedSlots: ["post-1", "post-2", "post-3"],
    note: "Stereo compressor is available in post slots.",
  },
] as const satisfies readonly {
  deviceId: NanoFxDeviceId;
  allowedSlots: readonly EditableFxSlotId[];
  note: string;
}[];

export interface NanoFxChainSlot {
  id: NanoFxSlotId;
  roleLabel: string;
  fixedLoadedName?: string;
  section: FxSlotSection;
  editable: boolean;
  midiCc?: number;
  iconCc: number;
}

export const nanoSignalChain: readonly NanoFxChainSlot[] = [
  {
    id: "gate",
    roleLabel: "Gate",
    fixedLoadedName: "Input Gate",
    section: "input",
    editable: false,
    iconCc: CC.GATE,
  },
  {
    id: "pre-1",
    roleLabel: "Pre FX 1",
    section: "pre",
    editable: true,
    midiCc: MIDI_CC.FX_SLOT_1,
    iconCc: CC.COMP,
  },
  {
    id: "pre-2",
    roleLabel: "Pre FX 2",
    section: "pre",
    editable: true,
    midiCc: MIDI_CC.FX_SLOT_2,
    iconCc: CC.EQ,
  },
  {
    id: "capture",
    roleLabel: "Capture",
    fixedLoadedName: "Neural Capture",
    section: "core",
    editable: false,
    iconCc: CC.CAPTURE,
  },
  {
    id: "ir-loader",
    roleLabel: "IR Loader",
    fixedLoadedName: "IR Loader / Cab",
    section: "core",
    editable: false,
    iconCc: CC.CAB,
  },
  {
    id: "post-1",
    roleLabel: "Post FX 1",
    section: "post",
    editable: true,
    midiCc: MIDI_CC.FX_SLOT_3,
    iconCc: CC.MOD,
  },
  {
    id: "post-2",
    roleLabel: "Post FX 2",
    section: "post",
    editable: true,
    midiCc: MIDI_CC.FX_SLOT_4,
    iconCc: CC.DELAY,
  },
  {
    id: "post-3",
    roleLabel: "Post FX 3",
    section: "post",
    editable: true,
    midiCc: MIDI_CC.FX_SLOT_5,
    iconCc: CC.REVERB,
  },
];

export type FxSlotDeviceAssignments = Record<EditableFxSlotId, NanoFxDeviceId>;

export const DEFAULT_FX_SLOT_DEVICE_ASSIGNMENTS: FxSlotDeviceAssignments = {
  "pre-1": "rodent-drive",
  "pre-2": "bass-wah",
  "post-1": "chief-dc2w-st",
  "post-2": "digital-delay-standard-delay",
  "post-3": "ambience",
};

export function isEditableFxSlot(slotId: NanoFxSlotId): slotId is EditableFxSlotId {
  return (EDITABLE_FX_SLOT_IDS as readonly string[]).includes(slotId);
}

export function getFxSlot(slotId: NanoFxSlotId): NanoFxChainSlot {
  return nanoSignalChain.find((slot) => slot.id === slotId) ?? nanoSignalChain[0];
}

export function getDeviceById(deviceId: NanoFxDeviceId): NanoFxDevice {
  const device = Object.values(devicesByCategory)
    .flat()
    .find((item) => item.id === deviceId);
  if (!device) return devicesByCategory["guitar-overdrive"][2];
  return device;
}

export function getAvailableCategoriesForSlot(slotId: NanoFxSlotId): NanoFxCategory[] {
  return [...(categoriesBySlot[slotId] as readonly NanoFxCategory[])];
}

export function getDevicesForSlotCategory(
  slotId: NanoFxSlotId,
  category: NanoFxCategory,
): NanoFxDevice[] {
  const slotCategories = categoriesBySlot[slotId] as readonly NanoFxCategory[];
  if (!slotCategories.includes(category)) return [];
  return devicesByCategory[category].filter((device) => isDeviceAllowedInSlot(device.id, slotId));
}

export function getAvailableDevicesForSlot(slotId: NanoFxSlotId): NanoFxDevice[] {
  return getAvailableCategoriesForSlot(slotId).flatMap((category) =>
    getDevicesForSlotCategory(slotId, category),
  );
}

export function isDeviceAllowedInSlot(deviceId: NanoFxDeviceId, slotId: NanoFxSlotId): boolean {
  if (!isEditableFxSlot(slotId)) return false;

  const device = getDeviceById(deviceId);
  const specialRule = specialRules.find((rule) => rule.deviceId === device.id);
  if (specialRule)
    return (specialRule.allowedSlots as readonly EditableFxSlotId[]).includes(slotId);

  return (categoriesBySlot[slotId] as readonly NanoFxCategory[]).includes(device.category);
}

export function getLoadedDeviceName(
  slotId: NanoFxSlotId,
  assignments: FxSlotDeviceAssignments,
): string {
  const slot = getFxSlot(slotId);
  if (!isEditableFxSlot(slotId)) return slot.fixedLoadedName ?? "Fixed";

  const deviceId = assignments[slotId];
  if (isDeviceAllowedInSlot(deviceId, slotId)) return getDeviceById(deviceId).name;

  const fallback = getAvailableDevicesForSlot(slotId)[0];
  return fallback?.name ?? "No compatible device";
}

export function normalizeFxSlotAssignments(
  assignments: FxSlotDeviceAssignments,
): FxSlotDeviceAssignments {
  return EDITABLE_FX_SLOT_IDS.reduce((next, slotId) => {
    const deviceId = assignments[slotId];
    const fallback =
      getAvailableDevicesForSlot(slotId)[0]?.id ?? DEFAULT_FX_SLOT_DEVICE_ASSIGNMENTS[slotId];
    next[slotId] = isDeviceAllowedInSlot(deviceId, slotId) ? deviceId : fallback;
    return next;
  }, {} as FxSlotDeviceAssignments);
}
