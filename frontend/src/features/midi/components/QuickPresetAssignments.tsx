/**
 * QuickPresetAssignments component — clickable Footswitch Deck for the Console workspace.
 *
 * @see docs/specs/200-frontend-control-surface/spec.md [FR-25]
 * @see docs/specs/200-frontend-control-surface/design.md [DES-FRONT-FOOTSWITCH]
 */
import { useEffect, useMemo, useState } from "react";
import { TOTAL_PRESETS } from "../constants";
import { getPresetName, presetLabel, usePresetNames } from "../presetNames";
import type { FootswitchId, NanoCortexFootswitchState, QuickPresetSlot } from "../types";
import { GearRotaryReadout } from "./GearRotaryReadout";

interface RotaryReadback {
  value: number;
  source: string;
  timestampMs?: number;
}

export interface QuickPresetAssignmentsProps {
  currentPreset: number;
  state: NanoCortexFootswitchState;
  isConnected: boolean;
  canWriteAssetSlots?: boolean;
  disabled?: boolean;
  onActivateSlot: (slot: QuickPresetSlot) => void;
  onAssignPreset: (slot: QuickPresetSlot, preset: number) => void;
  onFootswitchPress: (footswitch: FootswitchId) => void;
  rotaryPreview?: Partial<Record<FootswitchId, RotaryReadback>>;
  loadedAssets?: {
    captureName?: string | null;
    irName?: string | null;
    captureNames?: string[];
    irNames?: string[];
  };
  onFootswitchRotaryChange?: (footswitch: FootswitchId, value: number) => void;
}

const SLOT_ACCENTS: Record<QuickPresetSlot, string> = {
  IA: "#ffd12f",
  IB: "#7c5cff",
  IIA: "#ef476f",
  IIB: "#15dbc4",
};

function slotLabel(slot: QuickPresetSlot) {
  if (slot === "IA") return "I-A";
  if (slot === "IB") return "I-B";
  if (slot === "IIA") return "II-A";
  return "II-B";
}

function footswitchAssignedSlot(state: NanoCortexFootswitchState, footswitch: FootswitchId) {
  if (footswitch === "I") return state.footswitchI.activeSubslot === "A" ? "IA" : "IB";
  return state.footswitchII.activeSubslot === "A" ? "IIA" : "IIB";
}

function slotPreset(state: NanoCortexFootswitchState, slot: QuickPresetSlot) {
  if (slot === "IA") return state.footswitchI.currentAssignedA;
  if (slot === "IB") return state.footswitchI.currentAssignedB;
  if (slot === "IIA") return state.footswitchII.currentAssignedA;
  return state.footswitchII.currentAssignedB;
}

function FootswitchCard({
  id,
  title,
  activeSlot,
  activePreset,
  activeName,
  disabled,
  bypassDetail,
  onPress,
}: {
  id: FootswitchId;
  title: string;
  activeSlot: QuickPresetSlot;
  activePreset: number;
  activeName: string;
  disabled: boolean;
  bypassDetail: string;
  onPress: () => void;
}) {
  const accent = id === "I" ? "var(--color-cyan-accent)" : "var(--color-amber-accent)";
  const glow = id === "I" ? "var(--glow-cyan-strong)" : "var(--glow-amber)";

  return (
    <div
      className="min-w-0 rounded-xl border p-3 short:p-2"
      style={{
        background: "linear-gradient(180deg, var(--surface), var(--surface-2))",
        borderColor: "var(--panel-border-light)",
        boxShadow: "inset 0 1px 0 var(--panel-border-light)",
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div
            className="text-[10px] font-extrabold uppercase tracking-[1.2px]"
            style={{ color: "var(--text-secondary)" }}
          >
            Footswitch {id}
          </div>
          <div
            className="mt-0.5 truncate text-[14px] font-extrabold"
            style={{ color: "var(--text)" }}
          >
            {title}
          </div>
        </div>
        <span
          className="rounded-full border px-2 py-1 font-mono text-[9px] font-extrabold"
          style={{
            color: accent,
            borderColor: "var(--panel-border-light)",
            background: "var(--panel-bg)",
          }}
        >
          {slotLabel(activeSlot)}
        </span>
      </div>

      <button
        type="button"
        disabled={disabled}
        onClick={onPress}
        className="mt-2 short:mt-1.5 grid min-h-[72px] short:min-h-[44px] w-full place-items-center rounded-xl border transition-transform active:translate-y-0.5 disabled:cursor-default disabled:opacity-50"
        style={{
          background:
            "radial-gradient(circle at 42% 28%, rgba(255,255,255,0.18), transparent 26%), linear-gradient(145deg, #3c4650, #101820 70%)",
          borderColor: accent,
          boxShadow: `0 0 0 3px rgba(0,0,0,0.02), 0 0 18px ${glow}, inset 0 2px 5px rgba(255,255,255,0.16), inset 0 -12px 18px rgba(0,0,0,0.58)`,
          color: "#f8fafc",
        }}
      >
        <span className="font-mono text-[28px] font-extrabold leading-none">{id}</span>
        <span className="mt-1 text-[9px] font-extrabold uppercase tracking-[1px]">
          Click switch
        </span>
      </button>

      <div className="mt-2 short:mt-1.5 grid gap-2 sm:grid-cols-2">
        <div className="min-w-0">
          <div
            className="text-[9px] font-extrabold uppercase tracking-[0.9px]"
            style={{ color: "var(--text-secondary)" }}
          >
            Press preset
          </div>
          <div className="truncate text-[12px] font-extrabold" style={{ color: "var(--text)" }}>
            {presetLabel(activePreset)} / {activeName}
          </div>
        </div>
        <div className="min-w-0">
          <div
            className="text-[9px] font-extrabold uppercase tracking-[0.9px]"
            style={{ color: "var(--text-secondary)" }}
          >
            Rotary
          </div>
          <div className="truncate text-[12px] font-extrabold" style={{ color: "var(--text)" }}>
            {bypassDetail}
          </div>
        </div>
      </div>
    </div>
  );
}

export function QuickPresetAssignments({
  currentPreset,
  state,
  isConnected,
  canWriteAssetSlots = false,
  disabled = false,
  onActivateSlot,
  onAssignPreset,
  onFootswitchPress,
  rotaryPreview,
  loadedAssets,
  onFootswitchRotaryChange,
}: QuickPresetAssignmentsProps) {
  const presetNames = usePresetNames();
  const presetOptions = useMemo(
    () => Array.from({ length: TOTAL_PRESETS }, (_, preset) => preset),
    [],
  );
  const assignedPresets = useMemo<Record<QuickPresetSlot, number>>(
    () => ({
      IA: slotPreset(state, "IA"),
      IB: slotPreset(state, "IB"),
      IIA: slotPreset(state, "IIA"),
      IIB: slotPreset(state, "IIB"),
    }),
    [state],
  );
  const [draftAssignments, setDraftAssignments] =
    useState<Record<QuickPresetSlot, number>>(assignedPresets);

  useEffect(() => {
    setDraftAssignments(assignedPresets);
  }, [assignedPresets]);

  const activationDisabled = !isConnected || disabled;
  const assetSlotWriteDisabled = !canWriteAssetSlots || disabled;
  const assignments = useMemo<
    Array<{ slot: QuickPresetSlot; preset: number; activeSubslot: boolean }>
  >(
    () =>
      (["IA", "IB", "IIA", "IIB"] as QuickPresetSlot[]).map((slot) => {
        const preset = slotPreset(state, slot);
        return {
          slot,
          preset,
          activeSubslot:
            slot === "IA"
              ? state.footswitchI.activeSubslot === "A"
              : slot === "IB"
                ? state.footswitchI.activeSubslot === "B"
                : slot === "IIA"
                  ? state.footswitchII.activeSubslot === "A" &&
                    !state.footswitchII.globalBypassEnabled
                  : state.footswitchII.activeSubslot === "B" &&
                    !state.footswitchII.globalBypassEnabled,
        };
      }),
    [state],
  );

  const fsISlot = footswitchAssignedSlot(state, "I");
  const fsIISlot = footswitchAssignedSlot(state, "II");
  const fsIPreset = slotPreset(state, fsISlot);
  const fsIIPreset = slotPreset(state, fsIISlot);

  return (
    <section
      className="overflow-hidden rounded-xl border"
      style={{ background: "var(--surface-2)", borderColor: "var(--panel-border-light)" }}
    >
      <div
        className="border-b px-3 py-2 short:py-1.5"
        style={{ borderColor: "var(--panel-border)", background: "var(--panel-raised)" }}
      >
        <div
          className="text-[10px] font-extrabold uppercase tracking-[1.5px]"
          style={{ color: "var(--text-secondary)" }}
        >
          Footswitch Deck
        </div>
        <div
          className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] font-semibold short:hidden"
          style={{ color: "var(--text-secondary)" }}
        >
          <span>Click switches and send device footswitch mappings; save to keep changes.</span>
          <span
            className="rounded-full border px-1.5 py-0.5 font-mono text-[8px] font-extrabold uppercase"
            style={{
              background: isConnected ? "rgba(0,170,85,0.08)" : "var(--panel-inset)",
              borderColor: isConnected ? "rgba(0,170,85,0.34)" : "var(--panel-border-light)",
              color: isConnected ? "var(--color-green-accent)" : "var(--text-muted)",
            }}
          >
            USB presets
          </span>
          <span
            className="rounded-full border px-1.5 py-0.5 font-mono text-[8px] font-extrabold uppercase"
            style={{
              background: canWriteAssetSlots ? "rgba(0,153,204,0.08)" : "var(--panel-inset)",
              borderColor: canWriteAssetSlots
                ? "rgba(0,153,204,0.34)"
                : "var(--panel-border-light)",
              color: canWriteAssetSlots ? "var(--color-cyan-accent)" : "var(--text-muted)",
            }}
          >
            Bluetooth assets
          </span>
        </div>
      </div>

      <div
        className="grid gap-2 border-b p-2 short:p-1.5 md:grid-cols-2"
        style={{ borderColor: "var(--panel-border)" }}
      >
        <GearRotaryReadout
          label="Capture · FS I rotary"
          value={loadedAssets?.captureName ?? "--"}
          rotary={rotaryPreview?.I}
          accent="cyan"
          cycleMin={1}
          bypassLabel="Capture"
          assetNames={loadedAssets?.captureNames}
          maxSlot={Math.max(5, loadedAssets?.captureNames?.length ?? 25)}
          onChange={
            !assetSlotWriteDisabled && onFootswitchRotaryChange
              ? (value) => onFootswitchRotaryChange("I", value)
              : undefined
          }
        />
        <GearRotaryReadout
          label="Cab / IR · FS II rotary"
          value={loadedAssets?.irName ?? "--"}
          rotary={rotaryPreview?.II}
          accent="amber"
          cycleMin={1}
          bypassLabel="Cab / IR"
          assetNames={loadedAssets?.irNames}
          maxSlot={5}
          banked={false}
          onChange={
            !assetSlotWriteDisabled && onFootswitchRotaryChange
              ? (value) => onFootswitchRotaryChange("II", value)
              : undefined
          }
        />
      </div>

      <div
        data-testid="footswitch-quick-slots"
        className="grid gap-2 short:gap-1.5 border-b p-2 short:p-1.5 sm:grid-cols-2 xl:grid-cols-4"
        style={{ borderColor: "var(--panel-border)" }}
      >
        {assignments.map(({ slot, preset, activeSubslot }) => {
          const selected = activeSubslot;
          const currentMatch = currentPreset === preset;
          const accent = SLOT_ACCENTS[slot];
          const name = getPresetName(presetNames, preset);
          const draftPreset = draftAssignments[slot] ?? preset;
          const draftName = getPresetName(presetNames, draftPreset);
          const hasDraftChange = draftPreset !== preset;
          const writeLabel = hasDraftChange ? "Set" : "Sync";
          const setTitle = disabled
            ? "Waiting for the current preset state to finish syncing"
            : hasDraftChange
              ? `Set ${slotLabel(slot)} device footswitch to ${presetLabel(draftPreset)} / PC ${draftPreset} / ${draftName}`
              : `Re-send ${slotLabel(slot)} device footswitch mapping ${presetLabel(preset)} / PC ${preset} / ${name}`;
          return (
            <div
              key={slot}
              className="min-w-0 rounded-xl border p-2 short:p-1.5"
              style={{
                background: selected
                  ? `linear-gradient(90deg, ${accent}22, var(--surface))`
                  : currentMatch
                    ? `linear-gradient(90deg, ${accent}14, var(--surface))`
                    : "var(--surface)",
                borderColor: selected
                  ? accent
                  : currentMatch
                    ? `${accent}99`
                    : "var(--panel-border-light)",
                boxShadow: selected
                  ? `0 0 0 3px ${accent}1f, inset 0 1px 0 var(--panel-border-light)`
                  : "inset 0 1px 0 var(--panel-border-light)",
              }}
            >
              <button
                type="button"
                disabled={activationDisabled}
                onClick={() => onActivateSlot(slot)}
                title={
                  disabled
                    ? "Waiting for the current preset state to finish syncing"
                    : `Activate ${slotLabel(slot)} / ${presetLabel(preset)} / PC ${preset}`
                }
                className="flex min-h-[36px] w-full items-center gap-2 rounded-lg text-left disabled:cursor-default disabled:opacity-55"
              >
                <span
                  className="grid h-7 w-9 shrink-0 place-items-center rounded-lg font-mono text-[11px] font-extrabold"
                  style={{ background: accent, color: "#071018" }}
                >
                  {slot}
                </span>
                <span className="min-w-0">
                  <span
                    className="block truncate text-[12px] font-extrabold"
                    style={{ color: "var(--text)" }}
                  >
                    {name}
                  </span>
                  <span
                    className="mt-0.5 block font-mono text-[9px] font-bold"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {presetLabel(preset)} · PC {preset}
                  </span>
                </span>
                <span
                  className="ml-auto h-2 w-2 rounded-full"
                  style={{
                    background: activeSubslot ? accent : "var(--text-muted)",
                    boxShadow: activeSubslot ? `0 0 9px ${accent}` : "none",
                  }}
                />
              </button>
              <div className="mt-1.5 grid grid-cols-[minmax(0,1fr)_auto] gap-1.5">
                <select
                  value={draftPreset}
                  onChange={(event) =>
                    setDraftAssignments((prev) => ({
                      ...prev,
                      [slot]: Number(event.target.value),
                    }))
                  }
                  disabled={disabled}
                  className="h-7 min-w-0 rounded-lg border px-2 text-[10px] font-bold outline-none"
                  style={{
                    background: "var(--panel-inset)",
                    borderColor: "var(--panel-border-light)",
                    color: "var(--text)",
                  }}
                  aria-label={`${slotLabel(slot)} assigned preset`}
                >
                  {presetOptions.map((option) => (
                    <option key={option} value={option}>
                      {presetLabel(option)} / PC {option} / {getPresetName(presetNames, option)}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onAssignPreset(slot, draftPreset)}
                  title={setTitle}
                  aria-label={`Set device footswitch mapping for ${slotLabel(slot)}`}
                  className="h-7 rounded-lg border px-2 text-[9px] font-extrabold uppercase tracking-[0.8px] disabled:cursor-default"
                  style={{
                    background: hasDraftChange ? `${accent}1f` : "var(--panel-inset)",
                    borderColor: hasDraftChange ? accent : "var(--panel-border-light)",
                    color: hasDraftChange ? accent : "var(--text-secondary)",
                    opacity: disabled ? 0.55 : 1,
                  }}
                >
                  {writeLabel}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid gap-2 p-2 short:p-1.5 xl:grid-cols-2">
        <FootswitchCard
          id="I"
          title="Press I / hold tap tempo"
          activeSlot={fsISlot}
          activePreset={fsIPreset}
          activeName={getPresetName(presetNames, fsIPreset)}
          disabled={activationDisabled}
          bypassDetail={state.footswitchI.role === "global-bypass" ? "Global bypass" : "Bypass"}
          onPress={() => onFootswitchPress("I")}
        />

        <FootswitchCard
          id="II"
          title="Press II / hold tuner"
          activeSlot={fsIISlot}
          activePreset={fsIIPreset}
          activeName={getPresetName(presetNames, fsIIPreset)}
          disabled={activationDisabled}
          bypassDetail={state.footswitchII.globalBypassEnabled ? "Global bypass on" : "Bypass"}
          onPress={() => onFootswitchPress("II")}
        />
      </div>
    </section>
  );
}
