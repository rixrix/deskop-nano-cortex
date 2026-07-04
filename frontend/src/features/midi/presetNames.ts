/**
 * Preset name helpers — localStorage-backed load/save with bank-letter + slot-number formatting.
 *
 * @see docs/specs/200-frontend-control-surface/spec.md [FR-34]
 * @see docs/specs/200-frontend-control-surface/design.md [DES-FRONT-APP]
 */
import { useEffect, useState } from "react";
import { PRESETS_PER_ROW, TOTAL_BANKS } from "./constants";
import { PRESET_NAME_STORAGE_KEY } from "./settingsKeys";

export const TOTAL_PRESETS = TOTAL_BANKS * PRESETS_PER_ROW;

export type PresetNames = Record<number, string>;
export type PresetMetadataSource = "idle" | "device" | "cache" | "unavailable";

export interface DevicePresetMetadata {
  names: PresetNames;
  loaded: number;
  expected: number;
  usable: number;
  complete: boolean;
}

/** Fires when preset names change (e.g. synced from the device) so all displays refresh. */
const PRESET_NAMES_EVENT = "nano:presetnames";
const INTERNAL_IDENTIFIER_MIN_LENGTH = 12;

export function presetLabel(preset: number) {
  return `${String.fromCharCode(65 + Math.floor(preset / PRESETS_PER_ROW))}${(preset % PRESETS_PER_ROW) + 1}`;
}

export function isInternalIdentifierName(value: string) {
  const compact = value.trim().replace(/-/g, "");
  return compact.length >= INTERNAL_IDENTIFIER_MIN_LENGTH && /^[0-9a-f]+$/i.test(compact);
}

export function isUsablePresetName(value: unknown): value is string {
  return typeof value === "string" && Boolean(value.trim()) && !isInternalIdentifierName(value);
}

export function normalizePresetNames(value: unknown): PresetNames {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.entries(value as Record<string, unknown>).reduce<PresetNames>(
    (next, [key, name]) => {
      const preset = Number(key);
      if (
        Number.isInteger(preset) &&
        preset >= 0 &&
        preset < TOTAL_PRESETS &&
        isUsablePresetName(name)
      ) {
        next[preset] = name;
      }
      return next;
    },
    {},
  );
}

export function normalizeDevicePresetNames(
  value: unknown,
  expectedSlots = TOTAL_PRESETS,
): PresetNames | null {
  return describeDevicePresetMetadata(value, expectedSlots)?.names ?? null;
}

export function describeDevicePresetMetadata(
  value: unknown,
  expectedSlots = TOTAL_PRESETS,
): DevicePresetMetadata | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const slots = value.length > expectedSlots ? value.slice(-expectedSlots) : value;
  const names = slots.reduce<PresetNames>((next, name, preset) => {
    if (isUsablePresetName(name)) next[preset] = name.trim();
    return next;
  }, {});
  return {
    names,
    loaded: Math.min(slots.length, expectedSlots),
    expected: expectedSlots,
    usable: Object.keys(names).length,
    complete: slots.length >= expectedSlots,
  };
}

export function mergeDevicePresetNames(
  cached: PresetNames,
  metadata: DevicePresetMetadata,
): PresetNames {
  if (metadata.complete) return metadata.names;
  return normalizePresetNames({ ...cached, ...metadata.names });
}

export function metadataStatusLabel({
  loaded,
  expected,
  complete,
}: {
  loaded: number;
  expected: number;
  complete: boolean;
}) {
  if (complete) return "Preset names complete";
  if (loaded > 0) return `Preset names ${loaded}/${expected}`;
  return "Preset names unavailable";
}

export function loadPresetNames(): PresetNames {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(PRESET_NAME_STORAGE_KEY);
    if (!raw) return {};
    return normalizePresetNames(JSON.parse(raw) as unknown);
  } catch {
    return {};
  }
}

export function savePresetNames(names: PresetNames) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PRESET_NAME_STORAGE_KEY, JSON.stringify(normalizePresetNames(names)));
  window.dispatchEvent(new Event(PRESET_NAMES_EVENT));
}

export function getPresetName(names: PresetNames, preset: number) {
  const name = names[preset];
  return isUsablePresetName(name) ? name.trim() : `Preset ${preset + 1}`;
}

/**
 * Reactive preset names — reloads whenever they change (device sync or an edit anywhere), so every
 * preset display stays in sync without prop-threading.
 */
export function usePresetNames(): PresetNames {
  const [names, setNames] = useState<PresetNames>(loadPresetNames);
  useEffect(() => {
    const reload = () => setNames(loadPresetNames());
    window.addEventListener(PRESET_NAMES_EVENT, reload);
    window.addEventListener("storage", reload);
    return () => {
      window.removeEventListener(PRESET_NAMES_EVENT, reload);
      window.removeEventListener("storage", reload);
    };
  }, []);
  return names;
}
