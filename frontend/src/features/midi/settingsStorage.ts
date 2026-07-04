/**
 * Settings snapshot helpers — collect, serialize, parse, and apply JSON settings for import/export.
 *
 * @see docs/specs/200-frontend-control-surface/spec.md [FR-36]
 * @see docs/specs/200-frontend-control-surface/design.md [DES-FRONT-APP]
 */
import {
  FOOTSWITCH_STATE_STORAGE_KEY,
  OBSERVED_STATE_STORAGE_KEY,
  PRESET_NAME_STORAGE_KEY,
} from "./settingsKeys";
import { normalizePresetNames } from "./presetNames";

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface SettingsSnapshot {
  version: 1;
  app: "desktop-nano-cortex";
  exportedAt: string;
  presetNames?: JsonValue;
  observedState?: JsonValue;
  footswitchState?: JsonValue;
}

export interface AppliedSettingsSummary {
  imported: string[];
  skipped: string[];
}

function hasOwn(object: object, key: string) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readStoredJson(key: string): JsonValue {
  if (typeof window === "undefined") return {};
  const raw = window.localStorage.getItem(key);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as JsonValue;
  } catch {
    return {};
  }
}

function writeStoredJson(key: string, value: JsonValue) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

export function collectSettingsSnapshot(): SettingsSnapshot {
  return {
    version: 1,
    app: "desktop-nano-cortex",
    exportedAt: new Date().toISOString(),
    presetNames: normalizePresetNames(readStoredJson(PRESET_NAME_STORAGE_KEY)),
    observedState: readStoredJson(OBSERVED_STATE_STORAGE_KEY),
    footswitchState: readStoredJson(FOOTSWITCH_STATE_STORAGE_KEY),
  };
}

export function parseSettingsSnapshot(contents: string): SettingsSnapshot {
  let parsed: unknown;
  try {
    parsed = JSON.parse(contents);
  } catch {
    throw new Error("Settings file is not valid JSON.");
  }

  if (!isRecord(parsed)) {
    throw new Error("Settings file must contain a JSON object.");
  }
  if (parsed.version !== 1) {
    throw new Error("Settings file version is not supported.");
  }
  if (parsed.app !== undefined && parsed.app !== "desktop-nano-cortex") {
    throw new Error("Settings file is for a different app.");
  }

  return {
    version: 1,
    app: "desktop-nano-cortex",
    exportedAt:
      typeof parsed.exportedAt === "string" ? parsed.exportedAt : new Date().toISOString(),
    ...(hasOwn(parsed, "presetNames") ? { presetNames: parsed.presetNames as JsonValue } : {}),
    ...(hasOwn(parsed, "observedState")
      ? { observedState: parsed.observedState as JsonValue }
      : {}),
    ...(hasOwn(parsed, "footswitchState")
      ? { footswitchState: parsed.footswitchState as JsonValue }
      : {}),
  };
}

export function serializeSettingsSnapshot(snapshot: SettingsSnapshot) {
  return `${JSON.stringify(snapshot, null, 2)}\n`;
}

export function applySettingsSnapshot(snapshot: SettingsSnapshot): AppliedSettingsSummary {
  const imported: string[] = [];
  const skipped: string[] = [];

  if (snapshot.presetNames !== undefined) {
    writeStoredJson(PRESET_NAME_STORAGE_KEY, normalizePresetNames(snapshot.presetNames));
    imported.push("preset names");
  } else {
    skipped.push("preset names");
  }

  if (snapshot.observedState !== undefined) {
    writeStoredJson(OBSERVED_STATE_STORAGE_KEY, snapshot.observedState);
    imported.push("remembered hardware");
  } else {
    skipped.push("remembered hardware");
  }

  if (snapshot.footswitchState !== undefined) {
    writeStoredJson(FOOTSWITCH_STATE_STORAGE_KEY, snapshot.footswitchState);
    imported.push("footswitch settings");
  } else {
    skipped.push("footswitch settings");
  }

  return { imported, skipped };
}
