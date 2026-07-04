/**
 * LiveUtilitiesPanel — command utilities that should appear once in the Console workspace.
 *
 * @see docs/specs/200-frontend-control-surface/spec.md [FR-47]
 * @see docs/specs/200-frontend-control-surface/design.md [DES-FRONT-CONSOLE]
 */
import { useState, type ReactNode } from "react";
import {
  ArrowCounterClockwiseIcon,
  ArrowsOutSimpleIcon,
  FadersHorizontalIcon,
  FloppyDiskIcon,
  HandPointingIcon,
  LightningIcon,
  MetronomeIcon,
  WaveformIcon,
} from "@phosphor-icons/react";
import type { SaveMode } from "./ActivePresetHeader";

const BPM_QUICK_PICKS = [80, 100, 120, 140] as const;
const BPM_MIN = 40;
const BPM_MAX = 240;
export type DirtyPresetSwitchMode = "confirm" | "auto-discard";

interface LiveUtilitiesPanelProps {
  isConnected: boolean;
  captureVolume: number | null | undefined;
  saveMode: SaveMode;
  dirtyPresetSwitchMode: DirtyPresetSwitchMode;
  isDirty: boolean;
  saveCapable: boolean;
  saveInFlight?: boolean;
  lastSetBpm: number | null;
  tunerState: boolean;
  expressionValue: number;
  onSaveModeChange: (mode: SaveMode) => void;
  onDirtyPresetSwitchModeChange: (mode: DirtyPresetSwitchMode) => void;
  onSave: () => void;
  onDiscard: () => void;
  onTapTempo?: () => void;
  onSetTempoBpm?: (bpm: number) => void;
  onToggleTuner?: () => void;
  onSetExpression?: (value: number) => void;
  onOpenToneStudio?: () => void;
}

function PanelCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section
      className="rounded-xl border p-3"
      style={{ background: "var(--surface)", borderColor: "var(--panel-border-light)" }}
    >
      <div
        className="mb-2 text-[9px] font-extrabold uppercase tracking-[1.2px]"
        style={{ color: "var(--text-secondary)" }}
      >
        {title}
      </div>
      {children}
    </section>
  );
}

function TempoUtility({
  disabled,
  lastSetBpm,
  onTapTempo,
  onSetTempoBpm,
}: {
  disabled: boolean;
  lastSetBpm: number | null;
  onTapTempo?: () => void;
  onSetTempoBpm?: (bpm: number) => void;
}) {
  const [bpmInput, setBpmInput] = useState("");
  const commitBpm = () => {
    const bpm = Math.round(Number(bpmInput));
    if (!Number.isFinite(bpm) || bpm < BPM_MIN || bpm > BPM_MAX) return;
    onSetTempoBpm?.(bpm);
    setBpmInput("");
  };

  return (
    <PanelCard title="Tempo">
      <div className="flex items-center justify-between gap-2">
        <span
          className="flex items-center gap-1.5 text-[12px] font-extrabold"
          style={{ color: "var(--text)" }}
        >
          <MetronomeIcon size={16} weight="bold" aria-hidden="true" />
          Tap Tempo
        </span>
        <span
          className="font-mono text-[10px] font-extrabold"
          style={{ color: lastSetBpm === null ? "var(--text-muted)" : "var(--color-cyan-accent)" }}
        >
          {lastSetBpm === null ? "CC42" : `${lastSetBpm} BPM`}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          disabled={disabled || !onTapTempo}
          onClick={onTapTempo}
          className="h-8 rounded-md border px-2 text-[10px] font-extrabold uppercase tracking-[0.7px] disabled:cursor-default disabled:opacity-50"
          style={{
            background: "var(--panel-inset)",
            borderColor: "var(--panel-border-light)",
            color: "var(--text)",
          }}
        >
          Tap
        </button>
        {BPM_QUICK_PICKS.map((bpm) => (
          <button
            key={bpm}
            type="button"
            disabled={disabled || !onSetTempoBpm}
            onClick={() => onSetTempoBpm?.(bpm)}
            className="h-8 rounded-md border px-2 font-mono text-[10px] font-extrabold disabled:cursor-default disabled:opacity-50"
            style={{
              background: lastSetBpm === bpm ? "rgba(0,153,204,0.12)" : "var(--surface-2)",
              borderColor: lastSetBpm === bpm ? "rgba(0,153,204,0.5)" : "var(--panel-border-light)",
              color: lastSetBpm === bpm ? "var(--color-cyan-accent)" : "var(--text-secondary)",
            }}
          >
            {bpm}
          </button>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] gap-1.5">
        <input
          type="number"
          min={BPM_MIN}
          max={BPM_MAX}
          value={bpmInput}
          disabled={disabled || !onSetTempoBpm}
          onChange={(event) => setBpmInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") commitBpm();
          }}
          placeholder="BPM"
          aria-label={`Tempo in BPM (${BPM_MIN}-${BPM_MAX})`}
          className="h-8 min-w-0 rounded-md border px-2 font-mono text-[11px] font-bold outline-none disabled:opacity-50"
          style={{
            background: "var(--panel-inset)",
            borderColor: "var(--panel-border-light)",
            color: "var(--text)",
          }}
        />
        <button
          type="button"
          disabled={disabled || !bpmInput || !onSetTempoBpm}
          onClick={commitBpm}
          className="h-8 rounded-md border px-2 text-[9px] font-extrabold uppercase tracking-[0.7px] disabled:cursor-default disabled:opacity-50"
          style={{
            background: "var(--surface-2)",
            borderColor: "var(--panel-border-light)",
            color: "var(--text-secondary)",
          }}
        >
          Set
        </button>
      </div>
    </PanelCard>
  );
}

function SaveUtility({
  isConnected,
  isDirty,
  saveCapable,
  saveInFlight = false,
  saveMode,
  dirtyPresetSwitchMode,
  captureVolumeLabel,
  onSaveModeChange,
  onDirtyPresetSwitchModeChange,
  onSave,
  onDiscard,
}: Pick<
  LiveUtilitiesPanelProps,
  | "isConnected"
  | "isDirty"
  | "saveCapable"
  | "saveInFlight"
  | "saveMode"
  | "dirtyPresetSwitchMode"
  | "onSaveModeChange"
  | "onDirtyPresetSwitchModeChange"
  | "onSave"
  | "onDiscard"
> & { captureVolumeLabel: string }) {
  return (
    <PanelCard title="Save mode">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[11px] font-extrabold" style={{ color: "var(--text)" }}>
          Capture volume
        </span>
        <span
          className="rounded-lg border px-2.5 py-1 font-mono text-[10px] font-extrabold"
          style={{
            color: "var(--text)",
            borderColor: "var(--panel-border-light)",
            background: "var(--surface-2)",
          }}
        >
          {captureVolumeLabel}
        </span>
      </div>
      <div
        role="group"
        aria-label="Save mode"
        className="grid grid-cols-2 overflow-hidden rounded-lg border"
        style={{ borderColor: "var(--panel-border-light)" }}
      >
        {(["manual", "auto"] as SaveMode[]).map((mode) => {
          const active = saveMode === mode;
          return (
            <button
              key={mode}
              type="button"
              aria-pressed={active}
              onClick={() => onSaveModeChange(mode)}
              className="flex h-9 items-center justify-center gap-1.5 text-[10px] font-extrabold uppercase tracking-[0.8px]"
              style={{
                background: active ? "rgba(0,153,204,0.12)" : "var(--surface-2)",
                color: active ? "var(--color-cyan-accent)" : "var(--text-secondary)",
                borderRight: mode === "manual" ? "1px solid var(--panel-border-light)" : undefined,
              }}
            >
              {mode === "manual" ? (
                <HandPointingIcon size={13} weight="bold" aria-hidden="true" />
              ) : (
                <LightningIcon size={13} weight="bold" aria-hidden="true" />
              )}
              {mode}
            </button>
          );
        })}
      </div>
      <div className="mt-2">
        <div
          className="mb-1 text-[9px] font-extrabold uppercase tracking-[1px]"
          style={{ color: "var(--text-secondary)" }}
        >
          Unsaved preset switch
        </div>
        <div
          role="group"
          aria-label="Dirty preset switch behavior"
          className="grid grid-cols-2 overflow-hidden rounded-lg border"
          style={{ borderColor: "var(--panel-border-light)" }}
        >
          {(["confirm", "auto-discard"] as DirtyPresetSwitchMode[]).map((mode) => {
            const active = dirtyPresetSwitchMode === mode;
            return (
              <button
                key={mode}
                type="button"
                aria-pressed={active}
                onClick={() => onDirtyPresetSwitchModeChange(mode)}
                className="flex h-8 items-center justify-center gap-1.5 text-[9px] font-extrabold uppercase tracking-[0.7px]"
                style={{
                  background: active ? "rgba(212,160,23,0.12)" : "var(--surface-2)",
                  color: active ? "var(--color-amber-accent)" : "var(--text-secondary)",
                  borderRight:
                    mode === "confirm" ? "1px solid var(--panel-border-light)" : undefined,
                }}
              >
                {mode === "confirm" ? (
                  <HandPointingIcon size={12} weight="bold" aria-hidden="true" />
                ) : (
                  <ArrowCounterClockwiseIcon size={12} weight="bold" aria-hidden="true" />
                )}
                {mode === "confirm" ? "Confirm" : "Auto-discard"}
              </button>
            );
          })}
        </div>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        <button
          type="button"
          disabled={!isConnected || !isDirty}
          onClick={onDiscard}
          title="Clear unsaved app state and resync from the device, matching EXIT behavior"
          className="flex h-9 items-center justify-center gap-1.5 rounded-lg border text-[10px] font-extrabold disabled:cursor-default disabled:opacity-45"
          style={{
            background: "var(--surface-2)",
            borderColor: "var(--panel-border-light)",
            color: "var(--text-secondary)",
          }}
        >
          <ArrowCounterClockwiseIcon size={13} weight="bold" aria-hidden="true" />
          Discard
        </button>
        <button
          type="button"
          disabled={!isConnected || !isDirty || !saveCapable}
          onClick={onSave}
          title={
            saveInFlight
              ? "Saving the preset name and live device state to the selected preset"
              : saveCapable
                ? "Save the preset name and live device state to the selected preset"
                : "Save requires full USB + Bluetooth control, a loaded preset name, and unsaved edits"
          }
          className="flex h-9 items-center justify-center gap-1.5 rounded-lg border text-[10px] font-extrabold disabled:cursor-default disabled:opacity-45"
          style={{
            background: saveCapable && isDirty ? "rgba(0,170,85,0.1)" : "var(--surface-2)",
            borderColor:
              saveCapable && isDirty ? "rgba(0,170,85,0.45)" : "var(--panel-border-light)",
            color: saveCapable && isDirty ? "var(--color-green-accent)" : "var(--text-secondary)",
          }}
        >
          <FloppyDiskIcon size={13} weight="bold" aria-hidden="true" />
          {saveInFlight ? "Saving" : "Save"}
        </button>
      </div>
    </PanelCard>
  );
}
export function LiveUtilitiesPanel({
  isConnected,
  captureVolume,
  saveMode,
  dirtyPresetSwitchMode,
  isDirty,
  saveCapable,
  saveInFlight = false,
  lastSetBpm,
  tunerState,
  expressionValue,
  onSaveModeChange,
  onDirtyPresetSwitchModeChange,
  onSave,
  onDiscard,
  onTapTempo,
  onSetTempoBpm,
  onToggleTuner,
  onSetExpression,
  onOpenToneStudio,
}: LiveUtilitiesPanelProps) {
  const expressionPercent = Math.round((Math.max(0, Math.min(127, expressionValue)) / 127) * 100);
  const captureVolumeLabel =
    captureVolume !== null && captureVolume !== undefined ? String(captureVolume) : "--";

  return (
    <div className="space-y-2">
      {onOpenToneStudio ? (
        <button
          type="button"
          onClick={onOpenToneStudio}
          aria-label="Open floating tone studio"
          className="flex h-10 w-full items-center justify-center gap-2 rounded-xl border text-[10px] font-extrabold uppercase tracking-[1px]"
          style={{
            background: "linear-gradient(180deg, rgba(0,153,204,0.10), var(--surface))",
            borderColor: "rgba(0,153,204,0.34)",
            color: "var(--color-cyan-accent)",
            boxShadow: "inset 0 1px 0 var(--panel-border-light)",
          }}
        >
          <ArrowsOutSimpleIcon size={15} weight="bold" aria-hidden="true" />
          Tone Studio
        </button>
      ) : null}

      <SaveUtility
        isConnected={isConnected}
        isDirty={isDirty}
        saveCapable={saveCapable}
        saveInFlight={saveInFlight}
        saveMode={saveMode}
        dirtyPresetSwitchMode={dirtyPresetSwitchMode}
        onSaveModeChange={onSaveModeChange}
        onDirtyPresetSwitchModeChange={onDirtyPresetSwitchModeChange}
        onSave={onSave}
        onDiscard={onDiscard}
        captureVolumeLabel={captureVolumeLabel}
      />

      <TempoUtility
        disabled={!isConnected}
        lastSetBpm={lastSetBpm}
        onTapTempo={onTapTempo}
        onSetTempoBpm={onSetTempoBpm}
      />

      <PanelCard title="Tuner">
        <button
          type="button"
          disabled={!isConnected || !onToggleTuner}
          onClick={onToggleTuner}
          className="flex h-11 w-full items-center justify-between gap-2 rounded-lg border px-3 text-left disabled:cursor-default disabled:opacity-50"
          style={{
            background: tunerState ? "rgba(0,153,204,0.12)" : "var(--surface-2)",
            borderColor: tunerState ? "rgba(0,153,204,0.45)" : "var(--panel-border-light)",
            color: "var(--text)",
          }}
        >
          <span className="flex items-center gap-2 text-[12px] font-extrabold">
            <WaveformIcon size={16} weight="bold" aria-hidden="true" />
            Tuner
          </span>
          <span
            className="rounded-full border px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-[0.8px]"
            style={{
              color: tunerState ? "var(--color-cyan-accent)" : "var(--text-secondary)",
              borderColor: "var(--panel-border-light)",
              background: "var(--surface)",
            }}
          >
            {tunerState ? "Open" : "Closed"}
          </span>
        </button>
      </PanelCard>

      <PanelCard title="Expression">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <span
            className="flex items-center gap-1.5 text-[12px] font-extrabold"
            style={{ color: "var(--text)" }}
          >
            <FadersHorizontalIcon size={16} weight="bold" aria-hidden="true" />
            CC1 pedal
          </span>
          <span
            className="font-mono text-[10px] font-extrabold"
            style={{ color: "var(--color-cyan-accent)" }}
          >
            {expressionPercent}%
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={127}
          value={expressionValue}
          disabled={!isConnected || !onSetExpression}
          onChange={(event) => onSetExpression?.(Number(event.target.value))}
          aria-label="Expression CC1"
          className="w-full disabled:opacity-50"
        />
        <div
          className="mt-1 flex justify-between text-[9px] font-semibold"
          style={{ color: "var(--text-secondary)" }}
        >
          <span>Heel</span>
          <span className="font-mono">{expressionValue}</span>
          <span>Toe</span>
        </div>
      </PanelCard>
    </div>
  );
}
