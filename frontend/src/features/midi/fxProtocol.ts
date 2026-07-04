/**
 * Protocol-aware FX model mapping for read-only current-state dumps.
 *
 * @see docs/specs/200-frontend-control-surface/spec.md [FR-46]
 * @see docs/specs/110-backend-midi-ble/spec.md [FR-20]
 */
import {
  type EditableFxSlotId,
  type NanoFxDeviceId,
  getDeviceById,
  isDeviceAllowedInSlot,
} from "./fxModel";

export interface DecodedFxModelId {
  rawId: string;
  numericId: number | null;
}

export type DecodedFxModelIds = Partial<Record<EditableFxSlotId, DecodedFxModelId>>;

export interface ProtocolFxModel {
  rawId: string;
  displayName: string;
  categoryLabel: string;
  deviceId?: NanoFxDeviceId;
}

export interface FxSlotModelState {
  slotId: EditableFxSlotId;
  rawId: string;
  numericId: number | null;
  displayName: string;
  categoryLabel: string;
  deviceId: NanoFxDeviceId | null;
  known: boolean;
  compatible: boolean;
}

export type FxSlotModelStates = Partial<Record<EditableFxSlotId, FxSlotModelState>>;

export const EDITABLE_FX_SLOT_ROLE_KEYS: Record<EditableFxSlotId, string[]> = {
  "pre-1": ["pre-fx1", "pre-fx-1", "preFx1"],
  "pre-2": ["pre-fx2", "pre-fx-2", "preFx2"],
  "post-1": ["post-fx1", "post-fx-1", "postFx1"],
  "post-2": ["post-fx2", "post-fx-2", "postFx2"],
  "post-3": ["post-fx3", "post-fx-3", "postFx3"],
};

const PROTOCOL_FX_MODELS: ProtocolFxModel[] = [
  {
    rawId: "12",
    displayName: "Chief BD2",
    categoryLabel: "Guitar Overdrive",
    deviceId: "chief-bd2",
  },
  {
    rawId: "0D",
    displayName: "Chief OD1",
    categoryLabel: "Guitar Overdrive",
    deviceId: "chief-od1",
  },
  { rawId: "06", displayName: "Exotic", categoryLabel: "Guitar Overdrive", deviceId: "exotic" },
  {
    rawId: "BF17",
    displayName: "Exotic Bass Z Boost",
    categoryLabel: "Bass Overdrive",
    deviceId: "exotic-bass-z-boost",
  },
  {
    rawId: "17",
    displayName: "Exotic Z Boost",
    categoryLabel: "Guitar Overdrive",
    deviceId: "exotic-z-boost",
  },
  {
    rawId: "16",
    displayName: "Facial Fuzz",
    categoryLabel: "Guitar Overdrive",
    deviceId: "facial-fuzz",
  },
  {
    rawId: "1B",
    displayName: "Green 808",
    categoryLabel: "Guitar Overdrive",
    deviceId: "green-808",
  },
  {
    rawId: "B817",
    displayName: "Microtubes B3K",
    categoryLabel: "Bass Overdrive",
    deviceId: "microtubes-b3k",
  },
  { rawId: "03", displayName: "OD250", categoryLabel: "Guitar Overdrive", deviceId: "od250" },
  {
    rawId: "02",
    displayName: "Obsessive Drive",
    categoryLabel: "Guitar Overdrive",
    deviceId: "obsessive-drive",
  },
  {
    rawId: "04",
    displayName: "Rodent Drive",
    categoryLabel: "Guitar Overdrive",
    deviceId: "rodent-drive",
  },

  {
    rawId: "817D",
    displayName: "Adaptive Gate",
    categoryLabel: "Utility",
    deviceId: "adaptive-gate",
  },
  {
    rawId: "827D",
    displayName: "Utility Gate",
    categoryLabel: "Utility",
    deviceId: "utility-gate",
  },
  { rawId: "867D", displayName: "Volume", categoryLabel: "Utility", deviceId: "volume" },
  { rawId: "A51F", displayName: "Graphic 9", categoryLabel: "EQ", deviceId: "graphic-9" },
  { rawId: "A31F", displayName: "Low-High Cut", categoryLabel: "EQ", deviceId: "low-high-cut" },
  { rawId: "A11F", displayName: "Parametric 3", categoryLabel: "EQ", deviceId: "parametric-3" },

  { rawId: "B446", displayName: "Bass Wah", categoryLabel: "Wah", deviceId: "bass-wah" },
  { rawId: "B246", displayName: "Bubba Wah", categoryLabel: "Wah", deviceId: "bubba-wah" },
  {
    rawId: "B646",
    displayName: "Crying Clyde Wah",
    categoryLabel: "Wah",
    deviceId: "crying-clyde-wah",
  },
  { rawId: "B546", displayName: "Crying Wah", categoryLabel: "Wah", deviceId: "crying-wah" },
  {
    rawId: "C6BB01",
    displayName: "Envelope Filter",
    categoryLabel: "Filter",
    deviceId: "envelope-filter",
  },
  { rawId: "C1BB01", displayName: "Love Meat", categoryLabel: "Filter", deviceId: "love-meat" },

  {
    rawId: "8927",
    displayName: "Legendary 87 (M)",
    categoryLabel: "Compressor",
    deviceId: "legendary-87-m",
  },
  {
    rawId: "8F27",
    displayName: "Opto Comp (M)",
    categoryLabel: "Compressor",
    deviceId: "opto-comp-m",
  },
  {
    rawId: "8C27",
    displayName: "Solid State Comp (M)",
    categoryLabel: "Compressor",
    deviceId: "solid-state-comp-m",
  },
  {
    rawId: "8D27",
    displayName: "VCA Comp (M)",
    categoryLabel: "Compressor",
    deviceId: "vca-comp-m",
  },
  { rawId: "8B7D", displayName: "Doubler", categoryLabel: "Utility/EQ", deviceId: "doubler" },
  {
    rawId: "9427",
    displayName: "Legendary 87 (ST)",
    categoryLabel: "Utility/EQ",
    deviceId: "legendary-87-st",
  },
  {
    rawId: "9727",
    displayName: "Opto Comp (ST)",
    categoryLabel: "Utility/EQ",
    deviceId: "opto-comp-st",
  },
  {
    rawId: "9527",
    displayName: "Solid State Comp (ST)",
    categoryLabel: "Utility/EQ",
    deviceId: "solid-state-comp-st",
  },
  {
    rawId: "9627",
    displayName: "VCA Comp (ST)",
    categoryLabel: "Utility/EQ",
    deviceId: "vca-comp-st",
  },

  { rawId: "D18C01", displayName: "Transpose", categoryLabel: "Pitch", deviceId: "transpose" },

  {
    rawId: "F036",
    displayName: "Chief CE2W (ST)",
    categoryLabel: "Modulation",
    deviceId: "chief-ce2w-st",
  },
  {
    rawId: "F336",
    displayName: "Chief DC2W (ST)",
    categoryLabel: "Modulation",
    deviceId: "chief-dc2w-st",
  },
  {
    rawId: "EF36",
    displayName: "Chorus 229T",
    categoryLabel: "Modulation",
    deviceId: "chorus-229t",
  },
  {
    rawId: "EE36",
    displayName: "Dream Chorus",
    categoryLabel: "Modulation",
    deviceId: "dream-chorus",
  },
  { rawId: "ED36", displayName: "MX Flanger", categoryLabel: "Modulation", deviceId: "mx-flanger" },
  {
    rawId: "F436",
    displayName: "MX Phase 95",
    categoryLabel: "Modulation",
    deviceId: "mx-phase-95",
  },
  { rawId: "F536", displayName: "MX Vibe", categoryLabel: "Modulation", deviceId: "mx-vibe" },
  { rawId: "DC36", displayName: "Tremolo", categoryLabel: "Modulation", deviceId: "tremolo" },

  { rawId: "FA2E", displayName: "Analog Delay", categoryLabel: "Delay", deviceId: "analog-delay" },
  {
    rawId: "FF2E",
    displayName: "Circular Delay",
    categoryLabel: "Delay",
    deviceId: "circular-delay",
  },
  {
    rawId: "FB2E",
    displayName: "Digital Delay (ST)",
    categoryLabel: "Delay",
    deviceId: "digital-delay-standard-delay",
  },
  { rawId: "FC2E", displayName: "Dual Delay", categoryLabel: "Delay", deviceId: "dual-delay" },
  {
    rawId: "FE2E",
    displayName: "Dual Reverse Delay",
    categoryLabel: "Delay",
    deviceId: "dual-reverse-delay",
  },
  { rawId: "F42E", displayName: "Tape Delay", categoryLabel: "Delay", deviceId: "tape-delay" },

  { rawId: "C83E", displayName: "Ambience", categoryLabel: "Reverb", deviceId: "ambience" },
  { rawId: "C93E", displayName: "Cave", categoryLabel: "Reverb", deviceId: "cave" },
  { rawId: "C33E", displayName: "Hall", categoryLabel: "Reverb", deviceId: "hall" },
  { rawId: "CB3E", displayName: "Mind Hall", categoryLabel: "Reverb", deviceId: "mind-hall" },
  { rawId: "C73E", displayName: "Modulated", categoryLabel: "Reverb", deviceId: "modulated" },
  { rawId: "C03E", displayName: "Room", categoryLabel: "Reverb", deviceId: "room" },
];

const protocolModelByRawId = new Map(
  PROTOCOL_FX_MODELS.map((model) => [normalizeProtocolModelId(model.rawId), model]),
);
const protocolModelByDeviceId = new Map(
  PROTOCOL_FX_MODELS.flatMap((model) => (model.deviceId ? [[model.deviceId, model] as const] : [])),
);

export function normalizeProtocolModelId(rawId: string | null | undefined): string {
  return String(rawId ?? "")
    .replace(/[^0-9a-f]/gi, "")
    .toUpperCase();
}

export function getProtocolFxModel(rawId: string | null | undefined): ProtocolFxModel | null {
  const normalized = normalizeProtocolModelId(rawId);
  if (!normalized) return null;
  return protocolModelByRawId.get(normalized) ?? null;
}

export function getProtocolFxModelByDeviceId(
  deviceId: NanoFxDeviceId | null | undefined,
): ProtocolFxModel | null {
  if (!deviceId) return null;
  return protocolModelByDeviceId.get(deviceId) ?? null;
}

export function fxSlotModelStateFromDecodedId(
  slotId: EditableFxSlotId,
  decoded: DecodedFxModelId,
): FxSlotModelState {
  const rawId = normalizeProtocolModelId(decoded.rawId);
  const model = getProtocolFxModel(rawId);
  const deviceId = model?.deviceId ?? null;
  const compatible = deviceId ? isDeviceAllowedInSlot(deviceId, slotId) : false;
  const device = deviceId ? getDeviceById(deviceId) : null;

  return {
    slotId,
    rawId,
    numericId: decoded.numericId,
    displayName: model?.displayName ?? `Unknown model ${rawId || "?"}`,
    categoryLabel: model?.categoryLabel ?? "Unknown",
    deviceId: compatible && device ? device.id : null,
    known: Boolean(model),
    compatible,
  };
}

export function buildFxSlotModelStates(
  decoded: DecodedFxModelIds | null | undefined,
): FxSlotModelStates {
  if (!decoded) return {};
  return (
    Object.entries(decoded) as [EditableFxSlotId, DecodedFxModelId][]
  ).reduce<FxSlotModelStates>((next, [slotId, model]) => {
    if (model.rawId) next[slotId] = fxSlotModelStateFromDecodedId(slotId, model);
    return next;
  }, {});
}
