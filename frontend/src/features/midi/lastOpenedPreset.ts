/**
 * Last-opened preset helpers keep the Console anchored to the most recent real preset selection.
 *
 * @see docs/specs/200-frontend-control-surface/spec.md [FR-40]
 */
import { TOTAL_PRESETS } from "./constants";
import { LAST_OPENED_PRESET_STORAGE_KEY } from "./settingsKeys";

export function normalizePresetIndex(value: unknown): number {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : NaN;
  return Number.isInteger(numeric) && numeric >= 0 && numeric < TOTAL_PRESETS ? numeric : 0;
}

export function readLastOpenedPreset(): number {
  if (typeof window === "undefined") return 0;
  return normalizePresetIndex(window.localStorage.getItem(LAST_OPENED_PRESET_STORAGE_KEY));
}

export function rememberLastOpenedPreset(preset: number): number {
  const normalized = normalizePresetIndex(preset);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(LAST_OPENED_PRESET_STORAGE_KEY, String(normalized));
  }
  return normalized;
}
