/**
 * useNanoHardwareState hook — decodes BLE-observed knob values from the log stream with provisional confidence.
 *
 * @see docs/specs/200-frontend-control-surface/spec.md [FR-20]
 * @see docs/specs/200-frontend-control-surface/design.md [DES-FRONT-DECODER]
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useLogs } from "../../../shared/hooks/useLogs";
import {
  decodeObservedControlValues,
  decodeObservedExpression,
  decodeObservedHardwareValues,
  decodeObservedStateDump,
  type DecodedStateDump,
  type ObservedControlId,
  type ObservedControlValue,
  type ObservedExpressionValue,
  type ObservedHardwareId,
  type ObservedHardwareValue,
} from "../protocolLabDecoder";
import { OBSERVED_STATE_STORAGE_KEY } from "../settingsKeys";

export type HardwareValueSource = "live" | "memory" | "last seen";

export interface DisplayControlValue extends ObservedControlValue {
  source: HardwareValueSource;
}

export interface DisplayHardwareValue extends ObservedHardwareValue {
  source: HardwareValueSource;
}

interface PresetObservedMemory {
  controls: Partial<Record<ObservedControlId, ObservedControlValue>>;
  hardware: Partial<Record<ObservedHardwareId, ObservedHardwareValue>>;
  updatedAt: number;
}

interface ObservedStateMemory {
  version: 1;
  presets: Record<string, PresetObservedMemory>;
  globalHardware: Partial<Record<ObservedHardwareId, ObservedHardwareValue>>;
}

export interface NanoHardwareState {
  controlsById: Map<ObservedControlId, DisplayControlValue>;
  hardwareById: Map<ObservedHardwareId, DisplayHardwareValue>;
  observedHardwareEvents: ObservedHardwareValue[];
  observedExpression: ObservedExpressionValue | null;
  observedStateDump: DecodedStateDump | null;
  liveControlCount: number;
  savedControlCount: number;
  latestObservedTimestamp: number | null;
  latestBleNotificationTimestamp: number | null;
  bleNotificationCount: number;
}

function emptyMemory(): ObservedStateMemory {
  return { version: 1, presets: {}, globalHardware: {} };
}

function loadMemory(): ObservedStateMemory {
  if (typeof window === "undefined") return emptyMemory();
  try {
    const raw = window.localStorage.getItem(OBSERVED_STATE_STORAGE_KEY);
    if (!raw) return emptyMemory();
    const parsed = JSON.parse(raw) as ObservedStateMemory;
    if (parsed.version !== 1) return emptyMemory();
    return {
      version: 1,
      presets: parsed.presets ?? {},
      globalHardware: parsed.globalHardware ?? {},
    };
  } catch {
    return emptyMemory();
  }
}

function saveMemory(memory: ObservedStateMemory) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(OBSERVED_STATE_STORAGE_KEY, JSON.stringify(memory));
}

function latestTimestampOf<T extends { timestampMs: number }>(values: Iterable<T>) {
  let latest: number | null = null;
  for (const value of values) {
    latest = latest === null ? value.timestampMs : Math.max(latest, value.timestampMs);
  }
  return latest;
}

export function useNanoHardwareState(currentPreset: number): NanoHardwareState {
  const { logs } = useLogs();
  const [memory, setMemory] = useState<ObservedStateMemory>(() => loadMemory());
  const presetEnteredAtRef = useRef(Date.now());
  const previousPresetRef = useRef(currentPreset);

  if (previousPresetRef.current !== currentPreset) {
    previousPresetRef.current = currentPreset;
    presetEnteredAtRef.current = Date.now();
  }

  const observedControls = useMemo(() => decodeObservedControlValues(logs), [logs]);
  const observedHardware = useMemo(() => decodeObservedHardwareValues(logs), [logs]);
  const observedExpression = useMemo(() => decodeObservedExpression(logs), [logs]);
  const observedStateDump = useMemo(() => decodeObservedStateDump(logs), [logs]);
  const bleNotifications = useMemo(
    () => logs.filter((entry) => entry.message.includes("[ble] notification")),
    [logs],
  );

  // `currentPreset` is a recompute trigger: changing presets resets
  // `presetEnteredAtRef` (above), and these memos must re-filter against the new
  // window start. The ref read itself is not reactive, so we depend on the preset.
  const liveControls = useMemo(
    () => observedControls.filter((value) => value.timestampMs >= presetEnteredAtRef.current),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentPreset, observedControls],
  );
  const liveHardware = useMemo(
    () => observedHardware.filter((value) => value.timestampMs >= presetEnteredAtRef.current),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentPreset, observedHardware],
  );

  useEffect(() => {
    if (liveControls.length === 0 && liveHardware.length === 0) return;

    setMemory((previous) => {
      const presetKey = String(currentPreset);
      const previousPreset = previous.presets[presetKey] ?? {
        controls: {},
        hardware: {},
        updatedAt: 0,
      };
      const nextPreset: PresetObservedMemory = {
        controls: { ...previousPreset.controls },
        hardware: { ...previousPreset.hardware },
        updatedAt: Date.now(),
      };
      const nextGlobalHardware = { ...previous.globalHardware };

      for (const control of liveControls) nextPreset.controls[control.id] = control;
      for (const hardware of liveHardware) {
        nextPreset.hardware[hardware.id] = hardware;
        nextGlobalHardware[hardware.id] = hardware;
      }

      const nextMemory = {
        version: 1 as const,
        presets: { ...previous.presets, [presetKey]: nextPreset },
        globalHardware: nextGlobalHardware,
      };
      saveMemory(nextMemory);
      return nextMemory;
    });
  }, [currentPreset, liveControls, liveHardware]);

  const presetMemory = memory.presets[String(currentPreset)];
  const controlsById = useMemo(() => {
    const next = new Map<ObservedControlId, DisplayControlValue>();
    for (const [id, value] of Object.entries(presetMemory?.controls ?? {}) as Array<
      [ObservedControlId, ObservedControlValue | undefined]
    >) {
      if (value) next.set(id, { ...value, source: "memory" });
    }
    for (const value of liveControls) next.set(value.id, { ...value, source: "live" });
    return next;
  }, [liveControls, presetMemory]);

  const hardwareById = useMemo(() => {
    const next = new Map<ObservedHardwareId, DisplayHardwareValue>();
    for (const [id, value] of Object.entries(memory.globalHardware) as Array<
      [ObservedHardwareId, ObservedHardwareValue | undefined]
    >) {
      if (value) next.set(id, { ...value, source: "last seen" });
    }
    for (const [id, value] of Object.entries(presetMemory?.hardware ?? {}) as Array<
      [ObservedHardwareId, ObservedHardwareValue | undefined]
    >) {
      if (value) next.set(id, { ...value, source: "memory" });
    }
    for (const value of liveHardware) next.set(value.id, { ...value, source: "live" });
    return next;
  }, [liveHardware, memory.globalHardware, presetMemory]);

  const latestControlTimestamp = latestTimestampOf(controlsById.values());
  const latestHardwareTimestamp = latestTimestampOf(hardwareById.values());
  const latestObservedTimestamp = [latestControlTimestamp, latestHardwareTimestamp].reduce<
    number | null
  >(
    (latest, value) =>
      value === null ? latest : latest === null ? value : Math.max(latest, value),
    null,
  );
  const latestBleNotificationTimestamp = bleNotifications.reduce<number | null>(
    (latest, entry) => (latest === null ? entry.ts : Math.max(latest, entry.ts)),
    null,
  );

  return {
    controlsById,
    hardwareById,
    observedHardwareEvents: observedHardware,
    observedExpression,
    observedStateDump,
    liveControlCount: liveControls.length,
    savedControlCount: controlsById.size,
    latestObservedTimestamp,
    latestBleNotificationTimestamp,
    bleNotificationCount: bleNotifications.length,
  };
}
