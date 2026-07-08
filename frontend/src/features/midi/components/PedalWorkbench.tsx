/**
 * PedalWorkbench component — tone-chain reader with CC bypass and read-only parameter values.
 *
 * @see docs/specs/200-frontend-control-surface/spec.md [FR-23]
 * @see docs/specs/200-frontend-control-surface/design.md [DES-FRONT-TONE-STUDIO]
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRightIcon,
  CircuitryIcon,
  EqualizerIcon,
  FadersHorizontalIcon,
  GaugeIcon,
  GuitarIcon,
  MicrophoneStageIcon,
  PowerIcon,
  SpeakerHifiIcon,
  WaveSineIcon,
  WaveformIcon,
} from "@phosphor-icons/react";
import type { CCState, FootswitchId } from "../types";
import { CC } from "../constants";
import {
  categoryLabels,
  getDeviceById,
  getAvailableDevicesForSlot,
  getFxSlot,
  isEditableFxSlot,
  nanoSignalChain,
  type EditableFxSlotId,
  type FxSlotDeviceAssignments,
  type NanoFxCategory,
  type NanoFxDeviceId,
  type NanoFxSlotId,
} from "../fxModel";
import {
  fxParamEnumIndex,
  formatFxParamMeta,
  formatFxParamValue,
  getFxParamProfile,
  normalizedFromFxParamEnumIndex,
  orderedFxParams,
} from "../fxParams";
import type { FxSlotModelState, FxSlotModelStates } from "../fxProtocol";
import { getProtocolFxModelByDeviceId } from "../fxProtocol";
import { GearRotaryReadout } from "./GearRotaryReadout";

interface PedalWorkbenchProps {
  currentPreset: number;
  ccState: CCState;
  isConnected: boolean;
  slotAssignments: FxSlotDeviceAssignments;
  deviceModelStates?: FxSlotModelStates;
  loadedSlotNames?: Partial<Record<NanoFxSlotId, string | null>>;
  fxParamValues?: Partial<Record<NanoFxSlotId, number[]>>;
  fxParamLoadingSlot?: NanoFxSlotId | null;
  fxParamError?: string | null;
  canRefreshParams?: boolean;
  canWriteParams?: boolean;
  fxParamWritingKey?: string | null;
  fxParamWriteError?: string | null;
  canWriteModels?: boolean;
  fxModelWritingSlot?: NanoFxSlotId | null;
  fxModelWriteError?: string | null;
  fixedBlockReadback?: FixedBlockReadback;
  fixedBlockRotaryPreview?: Partial<Record<FootswitchId, FixedBlockRotaryReadback>>;
  gateReductionLastSentValue?: number | null;
  fixedBlockWritingLabel?: string | null;
  canWriteFixedBlocks?: boolean;
  onRefreshFxParams?: (slot: NanoFxSlotId) => Promise<void> | void;
  onRefreshCabIrParams?: () => Promise<void> | void;
  onWriteGateEnabled?: (enabled: boolean) => Promise<void> | void;
  onWriteGateReduction?: (percent: number) => Promise<void> | void;
  onWriteCaptureVolume?: (db: number) => Promise<void> | void;
  onWriteCabIrParam?: (
    param: "level" | "high-pass" | "low-pass",
    value: number,
  ) => Promise<void> | void;
  onWriteCabIrMicPosition?: (micName: string, position: number) => Promise<void> | void;
  onFootswitchRotaryChange?: (footswitch: FootswitchId, value: number) => void;
  onWriteFxParam?: (
    slot: EditableFxSlotId,
    paramIndex: number,
    normalizedValue: number,
  ) => Promise<void> | void;
  onWriteFxModel?: (slot: EditableFxSlotId, deviceId: NanoFxDeviceId) => Promise<void> | void;
  onSlotAssignmentsChange: (assignments: FxSlotDeviceAssignments) => void;
  onToggleCC: (cc: number) => void;
  activeSlot?: NanoFxSlotId;
  onActiveSlotChange?: (slot: NanoFxSlotId) => void;
  compact?: boolean;
}

interface CabIrReadbackValues {
  levelDb: number | null;
  highPassHz: number | null;
  lowPassHz: number | null;
  mic: string | null;
  position: number | null;
}

interface FixedBlockReadback {
  gateOn: boolean | null | undefined;
  gateReduction?: number | null | undefined;
  captureSlot: number | null | undefined;
  captureName: string | null | undefined;
  captureVolume: number | null | undefined;
  cabIrSlot: number | null | undefined;
  cabIrOn: boolean | null | undefined;
  cabIrName: string | null | undefined;
  cabIrParams: CabIrReadbackValues | null;
  cabIrParamsLoading: boolean;
  cabIrParamsError: string | null;
}

interface FixedBlockRotaryReadback {
  value: number;
  source: string;
  timestampMs?: number;
}

const CAB_IR_MIC_OPTIONS = [
  "Condenser 184",
  "Condenser 414",
  "Dynamic 421",
  "Dynamic 57",
  "Ribbon 160",
] as const;

const GATE_REDUCTION_VALUES = [0, 25, 50, 75, 100] as const;

const CATEGORY_COLORS: Partial<
  Record<
    NanoFxCategory | "gate" | "capture" | "ir-loader",
    { bg: string; fg: string; muted: string }
  >
> = {
  utility: { bg: "#6f6f6f", fg: "#f7f7f3", muted: "#d6d6d0" },
  compressor: { bg: "#3bed57", fg: "#051308", muted: "#144a20" },
  wah: { bg: "#74dc50", fg: "#071208", muted: "#1f5520" },
  filter: { bg: "#53c7a8", fg: "#061311", muted: "#194d43" },
  "guitar-overdrive": { bg: "#ff7300", fg: "#100602", muted: "#5a2500" },
  "bass-overdrive": { bg: "#e8a500", fg: "#120d03", muted: "#533b00" },
  pitch: { bg: "#a26dff", fg: "#10051c", muted: "#39205f" },
  eq: { bg: "#44a6ff", fg: "#04101b", muted: "#163a5b" },
  modulation: { bg: "#4211ff", fg: "#f2efff", muted: "#c9bfff" },
  delay: { bg: "#13e6d6", fg: "#031414", muted: "#07524e" },
  reverb: { bg: "#16e8c9", fg: "#031412", muted: "#075247" },
  gate: { bg: "#d9d9d9", fg: "#111111", muted: "#555555" },
  capture: { bg: "#ef476f", fg: "#ffffff", muted: "#ffd8e2" },
  "ir-loader": { bg: "#8ecae6", fg: "#061017", muted: "#24495a" },
};

function presetLabel(preset: number) {
  return `${String.fromCharCode(65 + Math.floor(preset / 8))}${(preset % 8) + 1}`;
}

function slotCc(slotId: NanoFxSlotId): number | null {
  const slot = getFxSlot(slotId);
  if (slot.midiCc) return slot.midiCc;
  if (slotId === "gate") return CC.GATE;
  if (slotId === "capture") return CC.CAPTURE;
  if (slotId === "ir-loader") return CC.CAB;
  return null;
}

function slotCategory(
  slotId: NanoFxSlotId,
  assignments: FxSlotDeviceAssignments,
): NanoFxCategory | "gate" | "capture" | "ir-loader" {
  if (isEditableFxSlot(slotId)) return getDeviceById(assignments[slotId]).category;
  if (slotId === "gate") return "gate";
  if (slotId === "capture") return "capture";
  if (slotId === "ir-loader") return "ir-loader";
  return "gate";
}

function modelStateForSlot(
  slotId: NanoFxSlotId,
  deviceModelStates?: FxSlotModelStates,
): FxSlotModelState | null {
  if (!isEditableFxSlot(slotId)) return null;
  return deviceModelStates?.[slotId] ?? null;
}

function slotModelDisplay(
  slotId: NanoFxSlotId,
  deviceModelStates?: FxSlotModelStates,
  loadedSlotNames?: Partial<Record<NanoFxSlotId, string | null>>,
) {
  const slot = getFxSlot(slotId);
  if (!isEditableFxSlot(slotId)) {
    const loadedName = loadedSlotNames?.[slotId]?.trim();
    return {
      name: loadedName || slot.fixedLoadedName || "Fixed",
      category: slot.roleLabel,
      rawId: null,
      source: loadedName ? ("device" as const) : ("fixed" as const),
      deviceId: null,
      known: true,
    };
  }

  const modelState = modelStateForSlot(slotId, deviceModelStates);
  if (modelState) {
    return {
      name: modelState.displayName,
      category: modelState.categoryLabel,
      rawId: modelState.rawId,
      source: modelState.known ? ("device" as const) : ("unknown" as const),
      deviceId: modelState.deviceId,
      known: modelState.known,
    };
  }

  return {
    name: "Waiting for device",
    category: slot.roleLabel,
    rawId: null,
    source: "pending" as const,
    deviceId: null,
    known: false,
  };
}

function EffectIcon({
  slotId,
  cc,
  size = 28,
}: {
  slotId?: NanoFxSlotId;
  cc: number;
  size?: number;
}) {
  const iconProps = { size, weight: "bold" as const, "aria-hidden": true };
  if (slotId === "gate") return <GaugeIcon {...iconProps} />;
  if (slotId === "capture") return <MicrophoneStageIcon {...iconProps} />;
  if (slotId === "ir-loader") return <SpeakerHifiIcon {...iconProps} />;
  if (slotId === "pre-1") return <GuitarIcon {...iconProps} />;
  if (slotId === "pre-2") return <EqualizerIcon {...iconProps} />;
  if (slotId === "post-1") return <WaveformIcon {...iconProps} />;
  if (slotId === "post-2") return <WaveSineIcon {...iconProps} />;
  if (slotId === "post-3") return <CircuitryIcon {...iconProps} />;
  if (cc === CC.GATE) return <GaugeIcon {...iconProps} />;
  if (cc === CC.CAPTURE) return <MicrophoneStageIcon {...iconProps} />;
  if (cc === CC.CAB) return <SpeakerHifiIcon {...iconProps} />;
  if (cc === CC.MOD) return <WaveformIcon {...iconProps} />;
  if (cc === CC.DELAY) return <WaveSineIcon {...iconProps} />;
  if (cc === CC.REVERB) return <CircuitryIcon {...iconProps} />;
  if (cc === CC.EQ) return <EqualizerIcon {...iconProps} />;
  return <FadersHorizontalIcon {...iconProps} />;
}

function EvidencePill({
  label,
  tone = "muted",
}: {
  label: string;
  tone?: "green" | "cyan" | "amber" | "muted";
}) {
  const style = {
    green: {
      color: "var(--color-green-accent)",
      border: "rgba(0,170,85,0.30)",
      background: "rgba(0,170,85,0.06)",
    },
    cyan: {
      color: "var(--color-cyan-accent)",
      border: "rgba(0,153,204,0.30)",
      background: "rgba(0,153,204,0.06)",
    },
    amber: {
      color: "var(--color-amber-accent)",
      border: "rgba(212,160,23,0.32)",
      background: "rgba(212,160,23,0.07)",
    },
    muted: {
      color: "var(--text-secondary)",
      border: "var(--panel-border)",
      background: "var(--surface)",
    },
  }[tone];

  return (
    <span
      className="rounded-full border px-2 py-1 text-[9px] font-extrabold uppercase tracking-[0.9px]"
      style={{ color: style.color, borderColor: style.border, background: style.background }}
    >
      {label}
    </span>
  );
}

function valueOrPending(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return "Not synced yet";
  return String(value);
}

function captureRawToDb(raw: number | null | undefined) {
  if (raw === null || raw === undefined || !Number.isFinite(raw)) return null;
  const safeRaw = Math.max(0, Math.min(255, Number(raw)));
  if (safeRaw <= 128) return (safeRaw / 128) * 24 - 24;
  return ((safeRaw - 128) / 127) * 12;
}

function ReadbackTile({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-xl border p-3"
      style={{ background: "var(--panel-bg)", borderColor: "var(--panel-border-light)" }}
    >
      <div
        className="text-[9px] font-extrabold uppercase tracking-[1px]"
        style={{ color: "var(--text-secondary)" }}
      >
        {label}
      </div>
      <div className="mt-1 text-[15px] font-extrabold" style={{ color: "var(--text)" }}>
        {value}
      </div>
    </div>
  );
}

function WriteRange({
  label,
  value,
  min,
  max,
  step,
  unit,
  disabled,
  pendingLabel,
  onCommit,
}: {
  label: string;
  value: number | null | undefined;
  min: number;
  max: number;
  step: number;
  unit: string;
  disabled: boolean;
  pendingLabel?: string;
  onCommit?: (value: number) => Promise<void> | void;
}) {
  const fallback = value === null || value === undefined || !Number.isFinite(value) ? min : value;
  const [draft, setDraft] = useState(fallback);
  const lastCommittedRef = useRef<number | null>(
    value === null || value === undefined || !Number.isFinite(value) ? null : value,
  );

  useEffect(() => {
    if (value === null || value === undefined || !Number.isFinite(value)) return;
    setDraft(value);
    lastCommittedRef.current = value;
  }, [value]);

  const commit = () => {
    if (disabled || !onCommit) return;
    const next = Math.max(min, Math.min(max, draft));
    if (
      lastCommittedRef.current !== null &&
      Math.abs(lastCommittedRef.current - next) < Number.EPSILON
    ) {
      return;
    }
    lastCommittedRef.current = next;
    onCommit(next);
  };

  return (
    <div
      className="rounded-xl border p-3"
      style={{ background: "var(--panel-bg)", borderColor: "var(--panel-border-light)" }}
    >
      <div className="flex items-center justify-between gap-2">
        <div
          className="text-[10px] font-extrabold uppercase tracking-[1px]"
          style={{ color: "var(--text-secondary)" }}
        >
          {label}
        </div>
        <div className="font-mono text-[11px] font-extrabold" style={{ color: "var(--text)" }}>
          {value === null || value === undefined || !Number.isFinite(value)
            ? (pendingLabel ?? "Not synced yet")
            : `${draft.toFixed(step < 1 ? 1 : 0)} ${unit}`}
        </div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={draft}
        disabled={disabled || !onCommit}
        onChange={(event) => setDraft(Number(event.target.value))}
        onMouseUp={commit}
        onTouchEnd={commit}
        onBlur={commit}
        className="mt-3 w-full disabled:opacity-45"
        aria-label={`Write ${label}`}
      />
      <div
        className="mt-1 flex items-center justify-between font-mono text-[9px] font-bold"
        style={{ color: "var(--text-secondary)" }}
      >
        <span>
          {min}
          {unit}
        </span>
        <span>{disabled || !onCommit ? "device state" : "save to keep"}</span>
        <span>
          {max}
          {unit}
        </span>
      </div>
    </div>
  );
}

function FixedBlockReadbackPanel({
  slotId,
  readback,
  rotaryPreview,
  gateReductionLastSentValue,
  canRefreshParams,
  canWriteFixedBlocks,
  fixedBlockWritingLabel,
  onRefreshCabIrParams,
  onWriteGateEnabled,
  onWriteGateReduction,
  onWriteCaptureVolume,
  onWriteCabIrParam,
  onWriteCabIrMicPosition,
  onFootswitchRotaryChange,
}: {
  slotId: NanoFxSlotId;
  readback?: FixedBlockReadback;
  rotaryPreview?: Partial<Record<FootswitchId, FixedBlockRotaryReadback>>;
  gateReductionLastSentValue?: number | null;
  canRefreshParams: boolean;
  canWriteFixedBlocks: boolean;
  fixedBlockWritingLabel?: string | null;
  onRefreshCabIrParams?: () => Promise<void> | void;
  onWriteGateEnabled?: (enabled: boolean) => Promise<void> | void;
  onWriteGateReduction?: (percent: number) => Promise<void> | void;
  onWriteCaptureVolume?: (db: number) => Promise<void> | void;
  onWriteCabIrParam?: (
    param: "level" | "high-pass" | "low-pass",
    value: number,
  ) => Promise<void> | void;
  onWriteCabIrMicPosition?: (micName: string, position: number) => Promise<void> | void;
  onFootswitchRotaryChange?: (footswitch: FootswitchId, value: number) => void;
}) {
  const writeBusy = Boolean(fixedBlockWritingLabel);
  const canWriteRotary = canWriteFixedBlocks && !writeBusy && Boolean(onFootswitchRotaryChange);
  const captureRotary =
    rotaryPreview?.I ??
    (typeof readback?.captureSlot === "number"
      ? { value: readback.captureSlot, source: "device" }
      : undefined);
  const cabIrRotary =
    rotaryPreview?.II ??
    (typeof readback?.cabIrSlot === "number"
      ? { value: readback.cabIrSlot, source: "device" }
      : undefined);

  if (slotId === "gate") {
    const gateReductionReadback =
      typeof readback?.gateReduction === "number" ? readback.gateReduction : null;
    const gateReductionDisplay = gateReductionReadback ?? gateReductionLastSentValue;
    return (
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <ReadbackTile
          label="Gate state"
          value={
            readback?.gateOn === true ? "On" : readback?.gateOn === false ? "Off" : "Not synced yet"
          }
        />
        <ReadbackTile
          label="Gate reduction"
          value={gateReductionReadback === null ? "Not synced yet" : `${gateReductionReadback}%`}
        />
        <button
          type="button"
          disabled={!canWriteFixedBlocks || writeBusy || !onWriteGateEnabled}
          onClick={() => void onWriteGateEnabled?.(readback?.gateOn !== true)}
          className="rounded-xl border p-3 text-left disabled:cursor-default disabled:opacity-45"
          style={{
            background: readback?.gateOn ? "rgba(0,170,85,0.08)" : "var(--panel-bg)",
            borderColor: readback?.gateOn ? "rgba(0,170,85,0.35)" : "var(--panel-border-light)",
          }}
        >
          <div
            className="text-[9px] font-extrabold uppercase tracking-[1px]"
            style={{ color: "var(--text-secondary)" }}
          >
            Gate power
          </div>
          <div className="mt-1 text-[15px] font-extrabold" style={{ color: "var(--text)" }}>
            {readback?.gateOn ? "Turn off" : "Turn on"}
          </div>
        </button>
        <div
          className="rounded-xl border p-3"
          style={{ background: "var(--panel-bg)", borderColor: "var(--panel-border-light)" }}
        >
          <div
            className="text-[9px] font-extrabold uppercase tracking-[1px]"
            style={{ color: "var(--text-secondary)" }}
          >
            Gate reduction
          </div>
          <div className="mt-2 grid grid-cols-5 gap-1">
            {GATE_REDUCTION_VALUES.map((value) => {
              const active = gateReductionDisplay === value;
              return (
                <button
                  key={value}
                  type="button"
                  aria-label={`Write Gate reduction ${value} percent`}
                  aria-pressed={active}
                  disabled={!canWriteFixedBlocks || writeBusy || !onWriteGateReduction}
                  onClick={() => void onWriteGateReduction?.(value)}
                  className="rounded-lg border px-1 py-1.5 text-[10px] font-extrabold transition-all disabled:cursor-default disabled:opacity-45"
                  style={{
                    background: active ? "rgba(0,170,220,0.14)" : "var(--panel-inset)",
                    borderColor: active ? "var(--color-cyan-accent)" : "var(--panel-border-light)",
                    color: active ? "var(--color-cyan-accent)" : "var(--text)",
                    boxShadow: active ? "0 0 0 1px rgba(0,170,220,0.18)" : "none",
                  }}
                >
                  {value}%
                </button>
              );
            })}
          </div>
          <div
            className="mt-2 rounded-lg px-2 py-1 text-[10px] font-extrabold uppercase tracking-[0.8px]"
            style={{
              background:
                gateReductionDisplay === null ? "var(--panel-inset)" : "rgba(0,170,220,0.1)",
              color:
                gateReductionDisplay === null
                  ? "var(--text-secondary)"
                  : "var(--color-cyan-accent)",
            }}
          >
            {gateReductionReadback !== null
              ? `Device state ${gateReductionReadback}%`
              : gateReductionLastSentValue === null
                ? "Not synced yet"
                : `Sent ${gateReductionLastSentValue}%`}
          </div>
          <p className="mt-2 text-[11px] font-semibold" style={{ color: "var(--text-secondary)" }}>
            These values write live device state; the next device sync confirms the current
            percentage. Save separately to persist.
          </p>
        </div>
      </div>
    );
  }

  if (slotId === "capture") {
    const captureDb = captureRawToDb(readback?.captureVolume);
    return (
      <div className="mt-4 space-y-3">
        <GearRotaryReadout
          label="Capture · FS I rotary"
          value={valueOrPending(readback?.captureName)}
          rotary={captureRotary}
          accent="cyan"
          onChange={canWriteRotary ? (value) => onFootswitchRotaryChange?.("I", value) : undefined}
        />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <ReadbackTile label="Loaded capture" value={valueOrPending(readback?.captureName)} />
          <ReadbackTile label="Capture slot" value={valueOrPending(readback?.captureSlot)} />
          <ReadbackTile
            label="Capture volume raw"
            value={valueOrPending(readback?.captureVolume)}
          />
          <WriteRange
            label="Capture volume"
            value={captureDb}
            min={-24}
            max={12}
            step={0.1}
            unit="dB"
            disabled={!canWriteFixedBlocks || writeBusy}
            onCommit={onWriteCaptureVolume}
          />
        </div>
      </div>
    );
  }

  if (slotId === "ir-loader") {
    const canRefresh = Boolean(canRefreshParams && readback?.cabIrSlot && onRefreshCabIrParams);
    return (
      <div className="mt-4">
        <div className="mb-3">
          <GearRotaryReadout
            label="Cab / IR · FS II rotary"
            value={valueOrPending(readback?.cabIrName)}
            rotary={cabIrRotary}
            accent="amber"
            onChange={
              canWriteRotary ? (value) => onFootswitchRotaryChange?.("II", value) : undefined
            }
          />
        </div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="text-[12px] font-semibold" style={{ color: "var(--text)" }}>
            IR Loader values come from the device Cab/IR refresh path.
          </div>
          <button
            type="button"
            disabled={!canRefresh || readback?.cabIrParamsLoading}
            onClick={() => {
              void onRefreshCabIrParams?.();
            }}
            className="h-9 rounded-xl border px-3 text-[10px] font-extrabold uppercase tracking-[0.9px] disabled:cursor-default disabled:opacity-45"
            style={{
              color: canRefresh ? "var(--color-cyan-accent)" : "var(--text-secondary)",
              borderColor: canRefresh ? "rgba(0,153,204,0.30)" : "var(--panel-border)",
              background: canRefresh ? "rgba(0,153,204,0.06)" : "var(--surface-2)",
            }}
          >
            {readback?.cabIrParamsLoading ? "Refreshing" : "Refresh IR values"}
          </button>
        </div>
        {readback?.cabIrParamsError ? (
          <div className="mb-3 text-[11px] font-bold" style={{ color: "var(--color-red-accent)" }}>
            {readback.cabIrParamsError}
          </div>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <ReadbackTile label="Loaded IR" value={valueOrPending(readback?.cabIrName)} />
          <ReadbackTile label="Cab/IR slot" value={valueOrPending(readback?.cabIrSlot)} />
          <ReadbackTile
            label="State"
            value={
              readback?.cabIrOn === true
                ? "On"
                : readback?.cabIrOn === false
                  ? "Off"
                  : "Not synced yet"
            }
          />
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <label
            className="rounded-xl border p-3"
            style={{ background: "var(--panel-bg)", borderColor: "var(--panel-border-light)" }}
          >
            <div
              className="text-[10px] font-extrabold uppercase tracking-[1px]"
              style={{ color: "var(--text-secondary)" }}
            >
              Mic
            </div>
            <select
              value={readback?.cabIrParams?.mic ?? ""}
              disabled={!canWriteFixedBlocks || writeBusy || !onWriteCabIrMicPosition}
              onChange={(event) =>
                void onWriteCabIrMicPosition?.(
                  event.target.value,
                  readback?.cabIrParams?.position ?? 1,
                )
              }
              className="mt-2 h-9 w-full rounded-lg border px-2 text-[12px] font-extrabold disabled:opacity-45"
              style={{
                background: "var(--surface-2)",
                borderColor: "var(--panel-border)",
                color: "var(--text)",
              }}
            >
              <option value="" disabled>
                Select mic
              </option>
              {CAB_IR_MIC_OPTIONS.map((mic) => (
                <option key={mic} value={mic}>
                  {mic}
                </option>
              ))}
            </select>
          </label>
          <label
            className="rounded-xl border p-3"
            style={{ background: "var(--panel-bg)", borderColor: "var(--panel-border-light)" }}
          >
            <div
              className="text-[10px] font-extrabold uppercase tracking-[1px]"
              style={{ color: "var(--text-secondary)" }}
            >
              Position
            </div>
            <select
              value={String(readback?.cabIrParams?.position ?? "")}
              disabled={
                !canWriteFixedBlocks ||
                writeBusy ||
                !onWriteCabIrMicPosition ||
                !readback?.cabIrParams?.mic
              }
              onChange={(event) =>
                void onWriteCabIrMicPosition?.(
                  readback?.cabIrParams?.mic ?? "",
                  Number(event.target.value),
                )
              }
              className="mt-2 h-9 w-full rounded-lg border px-2 text-[12px] font-extrabold disabled:opacity-45"
              style={{
                background: "var(--surface-2)",
                borderColor: "var(--panel-border)",
                color: "var(--text)",
              }}
            >
              <option value="" disabled>
                Select position
              </option>
              {[1, 2, 3, 4, 5, 6].map((position) => (
                <option key={position} value={position}>
                  {position}
                </option>
              ))}
            </select>
          </label>
          <WriteRange
            label="Level"
            value={readback?.cabIrParams?.levelDb}
            min={-96}
            max={12}
            step={0.1}
            unit="dB"
            disabled={!canWriteFixedBlocks || writeBusy || readback?.cabIrOn !== true}
            onCommit={(value) => onWriteCabIrParam?.("level", value)}
          />
          <WriteRange
            label="High pass"
            value={readback?.cabIrParams?.highPassHz}
            min={20}
            max={800}
            step={1}
            unit="Hz"
            disabled={!canWriteFixedBlocks || writeBusy || readback?.cabIrOn !== true}
            onCommit={(value) => onWriteCabIrParam?.("high-pass", value)}
          />
          <WriteRange
            label="Low pass"
            value={readback?.cabIrParams?.lowPassHz}
            min={1000}
            max={20000}
            step={1}
            unit="Hz"
            disabled={!canWriteFixedBlocks || writeBusy || readback?.cabIrOn !== true}
            onCommit={(value) => onWriteCabIrParam?.("low-pass", value)}
          />
        </div>
      </div>
    );
  }

  return null;
}

function CompactEffectRow({
  slotId,
  assignments,
  deviceModelStates,
  loadedSlotNames,
  selected,
  enabled,
  disabled,
  onSelect,
  onToggle,
}: {
  slotId: NanoFxSlotId;
  assignments: FxSlotDeviceAssignments;
  deviceModelStates?: FxSlotModelStates;
  loadedSlotNames?: Partial<Record<NanoFxSlotId, string | null>>;
  selected: boolean;
  enabled: boolean;
  disabled: boolean;
  onSelect: () => void;
  onToggle: () => void;
}) {
  const slot = getFxSlot(slotId);
  const category = slotCategory(slotId, assignments);
  const colors = CATEGORY_COLORS[category] ?? CATEGORY_COLORS.gate!;
  const modelDisplay = slotModelDisplay(slotId, deviceModelStates, loadedSlotNames);
  const cc = slotCc(slotId);

  return (
    <div
      className="grid min-h-[54px] grid-cols-[42px_minmax(0,1fr)_42px] overflow-hidden rounded-xl border transition-all"
      style={{
        background: enabled ? colors.bg : "var(--surface)",
        borderColor: selected ? colors.bg : "var(--panel-border-light)",
        boxShadow: selected ? `0 0 0 2px ${colors.bg}20` : "none",
        opacity: enabled ? 1 : 0.66,
      }}
    >
      <button
        type="button"
        onClick={onSelect}
        className="grid place-items-center border-r"
        style={{
          background: "#050505",
          borderColor: "rgba(255,255,255,0.08)",
          color: selected ? colors.bg : "#f4f4f4",
        }}
        aria-label={`Select ${slot.roleLabel}`}
      >
        <EffectIcon slotId={slotId} cc={slot.iconCc} />
      </button>
      <button
        type="button"
        onClick={onSelect}
        className="min-w-0 px-2 py-2 short:py-1 text-left"
        style={{ color: enabled ? colors.fg : "var(--text-secondary)" }}
      >
        <div className="truncate text-[11px] font-extrabold leading-tight">{slot.roleLabel}</div>
        <div
          className="mt-0.5 truncate text-[10px] font-bold"
          style={{ color: enabled ? colors.muted : "var(--text-secondary)" }}
        >
          {modelDisplay.name}
        </div>
      </button>
      <button
        type="button"
        disabled={disabled || cc === null}
        onClick={onToggle}
        className="grid place-items-center border-l text-[10px] font-extrabold uppercase disabled:cursor-default disabled:opacity-40"
        style={{
          background: enabled ? "rgba(255,255,255,0.12)" : "var(--surface-2)",
          borderColor: "rgba(255,255,255,0.08)",
          color: enabled ? colors.fg : "var(--text)",
        }}
        title={cc === null ? "Fixed block" : enabled ? "Bypass block" : "Enable block"}
        aria-label={cc === null ? `${slot.roleLabel} fixed` : `Toggle ${slot.roleLabel}`}
      >
        {cc === null ? "FIX" : enabled ? "ON" : "OFF"}
      </button>
    </div>
  );
}

function SignalPathBlock({
  slotId,
  assignments,
  deviceModelStates,
  loadedSlotNames,
  selected,
  enabled,
  disabled,
  onSelect,
  onToggle,
  compact = false,
}: {
  slotId: NanoFxSlotId;
  assignments: FxSlotDeviceAssignments;
  deviceModelStates?: FxSlotModelStates;
  loadedSlotNames?: Partial<Record<NanoFxSlotId, string | null>>;
  selected: boolean;
  enabled: boolean;
  disabled: boolean;
  onSelect: () => void;
  onToggle: () => void;
  compact?: boolean;
}) {
  const slot = getFxSlot(slotId);
  const category = slotCategory(slotId, assignments);
  const colors = CATEGORY_COLORS[category] ?? CATEGORY_COLORS.gate!;
  const modelDisplay = slotModelDisplay(slotId, deviceModelStates, loadedSlotNames);
  const cc = slotCc(slotId);

  return (
    <div className="flex min-w-0 flex-col items-center gap-2 short:gap-1">
      <button
        type="button"
        onClick={onSelect}
        className={[
          "relative grid w-full place-items-center rounded-2xl border transition-all",
          compact
            ? "h-12 max-w-[56px] lg:h-[52px] short:lg:h-11 lg:max-w-[60px]"
            : "h-14 max-w-[64px] lg:h-16 lg:max-w-[72px]",
        ].join(" ")}
        style={{
          background: enabled ? "#080d11" : "var(--surface)",
          borderColor: selected ? colors.bg : enabled ? colors.bg : "var(--panel-border)",
          boxShadow: selected
            ? `0 0 0 3px ${colors.bg}24, inset 0 0 0 2px rgba(255,255,255,0.08)`
            : "inset 0 1px 0 rgba(255,255,255,0.08)",
          color: enabled ? "#f8fafc" : "var(--text-secondary)",
        }}
        aria-label={`Select ${slot.roleLabel}`}
        title={`${slot.roleLabel}: ${modelDisplay.name}`}
      >
        <span
          className="grid place-items-center transition-opacity"
          style={{ opacity: enabled ? 1 : 0.5 }}
        >
          <EffectIcon slotId={slotId} cc={slot.iconCc} size={compact ? 20 : 24} />
        </span>
        <span
          className={[
            "absolute inset-x-1 bottom-1 truncate rounded-full px-1 font-extrabold uppercase tracking-[0.45px]",
            compact ? "text-[7px]" : "text-[8px]",
          ].join(" ")}
          style={{
            background: enabled ? "rgba(0,0,0,0.5)" : "transparent",
            color: selected
              ? colors.bg
              : enabled
                ? "rgba(248,250,252,0.92)"
                : "var(--text-secondary)",
          }}
        >
          {slot.roleLabel}
        </span>
      </button>
      <div className="w-full min-w-0 text-center">
        <div
          className={["truncate font-extrabold", compact ? "text-[9px]" : "text-[11px]"].join(" ")}
          style={{ color: "var(--text)" }}
        >
          {modelDisplay.name}
        </div>
        <div className="mt-1 flex items-center justify-center gap-1">
          <button
            type="button"
            disabled={disabled || cc === null}
            onClick={onToggle}
            className="h-6 short:h-5 rounded-full border px-2 text-[9px] font-extrabold uppercase tracking-[0.8px] disabled:cursor-default disabled:opacity-45"
            style={{
              color:
                cc === null
                  ? "var(--text-secondary)"
                  : enabled
                    ? "var(--color-green-accent)"
                    : "var(--color-amber-accent)",
              borderColor:
                cc === null
                  ? "var(--panel-border)"
                  : enabled
                    ? "rgba(0,170,85,0.32)"
                    : "rgba(212,160,23,0.32)",
              background:
                cc === null
                  ? "var(--surface)"
                  : enabled
                    ? "rgba(0,170,85,0.07)"
                    : "rgba(212,160,23,0.07)",
            }}
            title={cc === null ? "Fixed block" : enabled ? "Turn off" : "Turn on"}
            aria-label={cc === null ? `${slot.roleLabel} fixed` : `Toggle ${slot.roleLabel}`}
          >
            {cc === null ? "Fixed" : enabled ? "On" : "Off"}
          </button>
        </div>
      </div>
    </div>
  );
}

interface SignalPathOverviewProps {
  ccState: CCState;
  isConnected: boolean;
  slotAssignments: FxSlotDeviceAssignments;
  deviceModelStates?: FxSlotModelStates;
  loadedSlotNames?: Partial<Record<NanoFxSlotId, string | null>>;
  activeSlot: NanoFxSlotId;
  onActiveSlotChange: (slot: NanoFxSlotId) => void;
  onToggleCC: (cc: number) => void;
  compact?: boolean;
}

export function SignalPathOverview({
  ccState,
  isConnected,
  slotAssignments,
  deviceModelStates,
  loadedSlotNames,
  activeSlot,
  onActiveSlotChange,
  onToggleCC,
  compact = false,
}: SignalPathOverviewProps) {
  return (
    <div
      data-testid={compact ? "signal-path-overview" : "tone-studio-signal-path"}
      className={[
        "overflow-hidden rounded-2xl border",
        compact ? "px-2 py-2 short:py-1" : "px-3 py-4",
      ].join(" ")}
      style={{
        background: "linear-gradient(180deg, var(--surface-2), var(--surface))",
        borderColor: "var(--panel-border-light)",
      }}
    >
      <div
        className={[
          "grid items-start",
          compact
            ? "grid-cols-[32px_repeat(8,minmax(0,1fr))_32px] gap-1"
            : "grid-cols-[42px_repeat(8,minmax(0,1fr))_42px] gap-1.5 lg:gap-2",
        ].join(" ")}
      >
        <div
          className={[
            "grid place-items-center rounded-xl border font-extrabold uppercase tracking-[0.8px]",
            compact ? "mt-3 h-7 text-[8px]" : "mt-4 h-8 text-[9px] lg:h-9",
          ].join(" ")}
          style={{
            background: "var(--surface)",
            borderColor: "var(--panel-border)",
            color: "var(--text)",
          }}
        >
          In
        </div>
        {nanoSignalChain.map((slot, index) => {
          const cc = slotCc(slot.id);
          const enabled = cc === null ? true : Boolean(ccState[cc]);
          return (
            <div key={slot.id} className="relative min-w-0">
              <SignalPathBlock
                slotId={slot.id}
                assignments={slotAssignments}
                deviceModelStates={deviceModelStates}
                loadedSlotNames={loadedSlotNames}
                selected={activeSlot === slot.id}
                enabled={enabled}
                disabled={!isConnected || cc === null}
                onSelect={() => onActiveSlotChange(slot.id)}
                onToggle={() => {
                  if (cc !== null) onToggleCC(cc);
                }}
                compact={compact}
              />
              {index < nanoSignalChain.length - 1 ? (
                <ArrowRightIcon
                  className="pointer-events-none absolute z-10 hidden lg:block"
                  size={compact ? 12 : 14}
                  weight="bold"
                  aria-hidden="true"
                  style={{
                    color: "var(--text-secondary)",
                    right: compact ? "-10px" : "-13px",
                    top: compact ? 18 : 20,
                  }}
                />
              ) : null}
            </div>
          );
        })}
        <div
          className={[
            "grid place-items-center rounded-xl border font-extrabold uppercase tracking-[0.8px]",
            compact ? "mt-3 h-7 text-[8px]" : "mt-4 h-8 text-[9px] lg:h-9",
          ].join(" ")}
          style={{
            background: "var(--surface)",
            borderColor: "var(--panel-border)",
            color: "var(--text)",
          }}
        >
          Out
        </div>
      </div>
    </div>
  );
}

export function PedalWorkbench({
  currentPreset,
  ccState,
  isConnected,
  slotAssignments,
  deviceModelStates,
  loadedSlotNames,
  fxParamValues,
  fxParamLoadingSlot,
  fxParamError,
  canRefreshParams = false,
  canWriteParams = false,
  fxParamWritingKey = null,
  fxParamWriteError = null,
  canWriteModels = false,
  fxModelWritingSlot = null,
  fxModelWriteError = null,
  fixedBlockReadback,
  fixedBlockRotaryPreview,
  gateReductionLastSentValue,
  fixedBlockWritingLabel = null,
  canWriteFixedBlocks = false,
  onRefreshFxParams,
  onRefreshCabIrParams,
  onWriteGateEnabled,
  onWriteGateReduction,
  onWriteCaptureVolume,
  onWriteCabIrParam,
  onWriteCabIrMicPosition,
  onFootswitchRotaryChange,
  onWriteFxParam,
  onWriteFxModel,
  onToggleCC,
  activeSlot: controlledActiveSlot,
  onActiveSlotChange,
  compact = false,
}: PedalWorkbenchProps) {
  const [localActiveSlot, setLocalActiveSlot] = useState<NanoFxSlotId>("pre-1");
  const activeSlot = controlledActiveSlot ?? localActiveSlot;
  const setActiveSlot = useCallback(
    (slot: NanoFxSlotId) => {
      setLocalActiveSlot(slot);
      onActiveSlotChange?.(slot);
    },
    [onActiveSlotChange],
  );
  const selectedSlot = getFxSlot(activeSlot);
  const selectedModelDisplay = slotModelDisplay(activeSlot, deviceModelStates, loadedSlotNames);
  const parameterProfile = getFxParamProfile(selectedModelDisplay.rawId);
  const orderedParameters = orderedFxParams(parameterProfile);
  const selectedParamValues = fxParamValues?.[activeSlot] ?? [];
  const hasSelectedParamValues = selectedParamValues.length > 0;
  const isParamRefreshLoading = fxParamLoadingSlot === activeSlot;
  const compatibleDevices = isEditableFxSlot(activeSlot)
    ? getAvailableDevicesForSlot(activeSlot)
    : [];
  const selectedCompatibleDevice = compatibleDevices.find(
    (device) =>
      device.name === selectedModelDisplay.name || device.id === selectedModelDisplay.deviceId,
  );
  const selectedCc = slotCc(activeSlot);
  const selectedEnabled = selectedCc === null ? true : Boolean(ccState[selectedCc]);
  const selectedPowerLabel = selectedCc === null ? "Fixed" : selectedEnabled ? "On" : "Off";
  const editableActiveSlot = isEditableFxSlot(activeSlot) ? activeSlot : null;
  const canWriteSelectedParams = Boolean(canWriteParams && editableActiveSlot && onWriteFxParam);
  const isModelWriting = fxModelWritingSlot === activeSlot;
  const canWriteSelectedModel = Boolean(
    canWriteModels && editableActiveSlot && onWriteFxModel && !isModelWriting,
  );

  useEffect(() => {
    setActiveSlot("pre-1");
  }, [currentPreset, setActiveSlot]);

  if (compact) {
    return (
      <section
        className="overflow-hidden rounded-xl border"
        style={{ background: "var(--surface-2)", borderColor: "var(--panel-border-light)" }}
      >
        <div className="border-b p-3" style={{ borderColor: "var(--panel-border)" }}>
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div
                className="text-[10px] font-extrabold uppercase tracking-[1.4px]"
                style={{ color: "var(--text-secondary)" }}
              >
                Basic tone editor
              </div>
              <div
                className="mt-1 truncate text-[20px] font-extrabold"
                style={{ color: "var(--text)" }}
              >
                {presetLabel(currentPreset)} · {selectedModelDisplay.name}
              </div>
            </div>
            <EvidencePill
              label={isConnected ? "USB control" : "offline"}
              tone={isConnected ? "cyan" : "muted"}
            />
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <EvidencePill label="bypass" tone="green" />
            <EvidencePill
              label={
                selectedModelDisplay.source === "pending" ? "device state needed" : "device model"
              }
              tone={selectedModelDisplay.source === "pending" ? "amber" : "cyan"}
            />
            <EvidencePill
              label={hasSelectedParamValues ? "synced values" : "values not synced"}
              tone={hasSelectedParamValues ? "cyan" : "muted"}
            />
          </div>
        </div>

        <div className="space-y-3 p-2">
          <div className="space-y-2">
            {nanoSignalChain.map((slot) => {
              const cc = slotCc(slot.id);
              const enabled = cc === null ? true : Boolean(ccState[cc]);
              return (
                <CompactEffectRow
                  key={slot.id}
                  slotId={slot.id}
                  assignments={slotAssignments}
                  deviceModelStates={deviceModelStates}
                  loadedSlotNames={loadedSlotNames}
                  selected={activeSlot === slot.id}
                  enabled={enabled}
                  disabled={!isConnected || cc === null}
                  onSelect={() => setActiveSlot(slot.id)}
                  onToggle={() => {
                    if (cc !== null) onToggleCC(cc);
                  }}
                />
              );
            })}
          </div>

          <div
            className="rounded-xl border p-3"
            style={{ background: "var(--surface)", borderColor: "var(--panel-border-light)" }}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div
                  className="text-[9px] font-extrabold uppercase tracking-[1px]"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Selected block
                </div>
                <div
                  className="mt-1 truncate text-[15px] font-extrabold"
                  style={{ color: "var(--text)" }}
                >
                  {selectedSlot.roleLabel}
                </div>
                <div
                  className="truncate text-[11px] font-bold"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {selectedModelDisplay.name}
                </div>
                {selectedModelDisplay.rawId ? (
                  <div
                    className="truncate font-mono text-[10px] font-bold"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    id {selectedModelDisplay.rawId}
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                disabled={!isConnected || selectedCc === null}
                onClick={() => {
                  if (selectedCc !== null) onToggleCC(selectedCc);
                }}
                className="h-8 rounded-lg border px-2 text-[10px] font-extrabold uppercase tracking-[0.8px] disabled:cursor-default disabled:opacity-45"
                style={{
                  background: selectedEnabled ? "rgba(0,153,204,0.08)" : "var(--panel-inset)",
                  borderColor: selectedEnabled
                    ? "rgba(0,153,204,0.30)"
                    : "var(--panel-border-light)",
                  color: selectedEnabled ? "var(--color-cyan-accent)" : "var(--text-secondary)",
                }}
              >
                {selectedCc === null ? "Fixed" : selectedEnabled ? "On" : "Off"}
              </button>
            </div>

            {isEditableFxSlot(activeSlot) ? (
              <div className="mt-3 grid gap-2">
                <div className="block">
                  <span
                    className="text-[9px] font-extrabold uppercase tracking-[1px]"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Category
                  </span>
                  <div
                    className="mt-1 w-full rounded-lg border px-2 py-1.5 text-[11px] font-bold"
                    style={{
                      background: "var(--surface-2)",
                      color: "var(--text)",
                      borderColor: "var(--panel-border-light)",
                    }}
                  >
                    {selectedModelDisplay.category}
                  </div>
                </div>
                <div className="block">
                  <span
                    className="text-[9px] font-extrabold uppercase tracking-[1px]"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Model
                  </span>
                  <div
                    className="mt-1 w-full rounded-lg border px-2 py-1.5 text-[11px] font-bold"
                    style={{
                      background: "var(--surface-2)",
                      color: "var(--text)",
                      borderColor: "var(--panel-border-light)",
                    }}
                  >
                    {selectedModelDisplay.name}
                  </div>
                </div>
              </div>
            ) : (
              <div
                className="mt-3 text-[10px] font-semibold"
                style={{ color: "var(--text-secondary)" }}
              >
                {selectedModelDisplay.rawId && parameterProfile
                  ? `${orderedParameters.length} parameter definitions ready; values appear after device sync.`
                  : selectedModelDisplay.rawId
                    ? "Parameter metadata is not mapped for this model id yet."
                    : "Waiting for device state; detailed parameters are not available yet."}
              </div>
            )}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      className="overflow-hidden rounded-2xl border"
      style={{ background: "var(--surface-2)", borderColor: "var(--panel-border-light)" }}
    >
      <div
        className="border-b px-4 py-3"
        style={{ borderColor: "var(--panel-border)", background: "var(--panel-raised)" }}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div
              className="text-[10px] font-extrabold uppercase tracking-[1.6px]"
              style={{ color: "var(--text-secondary)" }}
            >
              Signal path
            </div>
            <div className="mt-1 flex min-w-0 flex-wrap items-baseline gap-2">
              <span
                className="font-mono text-[26px] font-extrabold leading-none"
                style={{ color: "var(--text)" }}
              >
                {presetLabel(currentPreset)}
              </span>
              <span
                className="truncate text-[16px] font-extrabold"
                style={{ color: "var(--text)" }}
              >
                {selectedSlot.roleLabel} · {selectedModelDisplay.name}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-1.5">
            <EvidencePill
              label={isConnected ? "bypass ready" : "offline"}
              tone={isConnected ? "green" : "muted"}
            />
            <EvidencePill
              label={
                selectedModelDisplay.source === "pending" ? "device state needed" : "device chain"
              }
              tone={selectedModelDisplay.source === "pending" ? "amber" : "cyan"}
            />
            <EvidencePill
              label={
                hasSelectedParamValues
                  ? `${selectedParamValues.length} synced values`
                  : "values not synced"
              }
              tone={hasSelectedParamValues ? "cyan" : "muted"}
            />
          </div>
        </div>

        <div className="mt-4">
          <SignalPathOverview
            ccState={ccState}
            isConnected={isConnected}
            slotAssignments={slotAssignments}
            deviceModelStates={deviceModelStates}
            loadedSlotNames={loadedSlotNames}
            activeSlot={activeSlot}
            onActiveSlotChange={setActiveSlot}
            onToggleCC={onToggleCC}
          />
        </div>
      </div>

      <div className="p-4">
        <div
          className="rounded-2xl border"
          style={{ background: "var(--surface)", borderColor: "var(--panel-border-light)" }}
        >
          <div
            className="flex flex-wrap items-start justify-between gap-3 border-b p-4"
            style={{ borderColor: "var(--panel-border)" }}
          >
            <div className="min-w-0">
              <div
                className="text-[10px] font-extrabold uppercase tracking-[1.4px]"
                style={{ color: "var(--text-secondary)" }}
              >
                {selectedSlot.roleLabel}
              </div>
              <div
                className="mt-1 truncate text-[26px] font-extrabold leading-none"
                style={{ color: "var(--text)" }}
              >
                {selectedModelDisplay.name}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <EvidencePill label={selectedModelDisplay.category} tone="muted" />
                {selectedModelDisplay.rawId ? (
                  <EvidencePill label={`id ${selectedModelDisplay.rawId}`} tone="muted" />
                ) : null}
                {isEditableFxSlot(activeSlot) ? (
                  <EvidencePill
                    label={canWriteSelectedModel ? "model select ready" : "device model"}
                    tone={canWriteSelectedModel ? "cyan" : "muted"}
                  />
                ) : null}
                <EvidencePill
                  label={
                    parameterProfile
                      ? `${orderedParameters.length} parameter defs`
                      : isEditableFxSlot(activeSlot)
                        ? "parameters unmapped"
                        : "fixed block"
                  }
                  tone={parameterProfile || !isEditableFxSlot(activeSlot) ? "cyan" : "muted"}
                />
                {hasSelectedParamValues ? (
                  <EvidencePill label={`${selectedParamValues.length} synced values`} tone="cyan" />
                ) : null}
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                disabled={!isConnected || selectedCc === null}
                onClick={() => {
                  if (selectedCc !== null) onToggleCC(selectedCc);
                }}
                className="inline-flex h-10 items-center gap-2 rounded-xl border px-4 text-[11px] font-extrabold uppercase tracking-[1px] disabled:cursor-default disabled:opacity-55"
                style={{
                  color:
                    selectedCc === null
                      ? "var(--text-secondary)"
                      : selectedEnabled
                        ? "var(--color-green-accent)"
                        : "var(--color-amber-accent)",
                  borderColor:
                    selectedCc === null
                      ? "var(--panel-border)"
                      : selectedEnabled
                        ? "rgba(0,170,85,0.32)"
                        : "rgba(212,160,23,0.32)",
                  background:
                    selectedCc === null
                      ? "var(--surface-2)"
                      : selectedEnabled
                        ? "rgba(0,170,85,0.07)"
                        : "rgba(212,160,23,0.07)",
                }}
                title={
                  selectedCc === null ? "Fixed block" : selectedEnabled ? "Turn off" : "Turn on"
                }
              >
                <PowerIcon size={14} weight="bold" aria-hidden="true" />
                {selectedPowerLabel}
              </button>
              {parameterProfile ? (
                <button
                  type="button"
                  disabled={!canRefreshParams || isParamRefreshLoading || !onRefreshFxParams}
                  onClick={() => {
                    void onRefreshFxParams?.(activeSlot);
                  }}
                  className="h-10 rounded-xl border px-4 text-[11px] font-extrabold uppercase tracking-[1px] disabled:cursor-default disabled:opacity-45"
                  style={{
                    color: canRefreshParams ? "var(--color-cyan-accent)" : "var(--text-secondary)",
                    borderColor: canRefreshParams ? "rgba(0,153,204,0.30)" : "var(--panel-border)",
                    background: canRefreshParams ? "rgba(0,153,204,0.06)" : "var(--surface-2)",
                  }}
                >
                  {isParamRefreshLoading ? "Refreshing" : "Refresh values"}
                </button>
              ) : activeSlot === "ir-loader" ? (
                <button
                  type="button"
                  disabled={
                    !canRefreshParams ||
                    !fixedBlockReadback?.cabIrSlot ||
                    fixedBlockReadback.cabIrParamsLoading ||
                    !onRefreshCabIrParams
                  }
                  onClick={() => {
                    void onRefreshCabIrParams?.();
                  }}
                  className="h-10 rounded-xl border px-4 text-[11px] font-extrabold uppercase tracking-[1px] disabled:cursor-default disabled:opacity-45"
                  style={{
                    color:
                      canRefreshParams && fixedBlockReadback?.cabIrSlot
                        ? "var(--color-cyan-accent)"
                        : "var(--text-secondary)",
                    borderColor:
                      canRefreshParams && fixedBlockReadback?.cabIrSlot
                        ? "rgba(0,153,204,0.30)"
                        : "var(--panel-border)",
                    background:
                      canRefreshParams && fixedBlockReadback?.cabIrSlot
                        ? "rgba(0,153,204,0.06)"
                        : "var(--surface-2)",
                  }}
                >
                  {fixedBlockReadback?.cabIrParamsLoading ? "Refreshing" : "Refresh IR values"}
                </button>
              ) : null}
            </div>
          </div>

          {isEditableFxSlot(activeSlot) ? (
            <div
              className="grid gap-2 border-b px-4 py-3 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)_auto]"
              style={{ borderColor: "var(--panel-border)", background: "var(--surface-2)" }}
            >
              <label className="block">
                <span
                  className="text-[9px] font-extrabold uppercase tracking-[1.1px]"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Category
                </span>
                <select
                  disabled
                  value={selectedCompatibleDevice?.category ?? ""}
                  className="mt-1 h-8 w-full rounded-lg border px-2 text-[11px] font-extrabold disabled:cursor-not-allowed"
                  style={{
                    background: "var(--surface)",
                    borderColor: "var(--panel-border-light)",
                    color: "var(--text)",
                  }}
                  aria-label="Selected FX category"
                >
                  <option value="">{selectedModelDisplay.category}</option>
                  {Array.from(new Set(compatibleDevices.map((device) => device.category))).map(
                    (category) => (
                      <option key={category} value={category}>
                        {categoryLabels[category]}
                      </option>
                    ),
                  )}
                </select>
              </label>
              <label className="block">
                <span
                  className="text-[9px] font-extrabold uppercase tracking-[1.1px]"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Pedal model
                </span>
                <select
                  disabled={!canWriteSelectedModel}
                  value={selectedCompatibleDevice?.id ?? ""}
                  onChange={(event) => {
                    if (!editableActiveSlot) return;
                    const deviceId = event.target.value as NanoFxDeviceId;
                    if (!deviceId || deviceId === selectedCompatibleDevice?.id) return;
                    void onWriteFxModel?.(editableActiveSlot, deviceId);
                  }}
                  className="mt-1 h-8 w-full rounded-lg border px-2 text-[11px] font-extrabold disabled:cursor-not-allowed"
                  style={{
                    background: "var(--surface)",
                    borderColor: "var(--panel-border-light)",
                    color: "var(--text)",
                  }}
                  aria-label="Selected FX model"
                >
                  <option value="">{selectedModelDisplay.name}</option>
                  {compatibleDevices.map((device) => (
                    <option
                      key={device.id}
                      value={device.id}
                      disabled={!getProtocolFxModelByDeviceId(device.id)}
                    >
                      {device.name}
                    </option>
                  ))}
                </select>
              </label>
              <div
                className="self-end rounded-lg border px-2.5 py-2 text-[10px] font-extrabold uppercase tracking-[0.6px]"
                style={{
                  background: "var(--panel-bg)",
                  borderColor: "rgba(212,160,23,0.30)",
                  color: "var(--color-amber-accent)",
                }}
              >
                {isModelWriting ? "Updating" : canWriteSelectedModel ? "Live write" : "Read-only"}
              </div>
            </div>
          ) : null}

          <div className="p-4">
            <div className="text-[13px] font-semibold" style={{ color: "var(--text)" }}>
              {parameterProfile
                ? hasSelectedParamValues
                  ? canWriteSelectedParams
                    ? "Values are synced from the device. Slider changes write live device state; save separately to persist."
                    : "Values are synced from the device. Connect Bluetooth state to write parameter changes."
                  : "Parameter map is ready; values sync after preset changes or when refreshed."
                : !isEditableFxSlot(activeSlot)
                  ? "Fixed block values come from current device state. Only confirmed fields are shown."
                  : selectedModelDisplay.rawId
                    ? `No parameter metadata mapped for model id ${selectedModelDisplay.rawId}.`
                    : "Select a decoded FX model to inspect its parameters."}
            </div>
            {fxParamError && isEditableFxSlot(activeSlot) ? (
              <div
                className="mt-1 text-[11px] font-bold"
                style={{ color: "var(--color-red-accent)" }}
              >
                {fxParamError}
              </div>
            ) : !isEditableFxSlot(activeSlot) ? (
              <FixedBlockReadbackPanel
                slotId={activeSlot}
                readback={fixedBlockReadback}
                rotaryPreview={fixedBlockRotaryPreview}
                gateReductionLastSentValue={gateReductionLastSentValue}
                canRefreshParams={canRefreshParams}
                canWriteFixedBlocks={canWriteFixedBlocks}
                fixedBlockWritingLabel={fixedBlockWritingLabel}
                onRefreshCabIrParams={onRefreshCabIrParams}
                onWriteGateEnabled={onWriteGateEnabled}
                onWriteGateReduction={onWriteGateReduction}
                onWriteCaptureVolume={onWriteCaptureVolume}
                onWriteCabIrParam={onWriteCabIrParam}
                onWriteCabIrMicPosition={onWriteCabIrMicPosition}
                onFootswitchRotaryChange={onFootswitchRotaryChange}
              />
            ) : null}
            {fxParamWriteError && isEditableFxSlot(activeSlot) ? (
              <div
                className="mt-1 text-[11px] font-bold"
                style={{ color: "var(--color-red-accent)" }}
              >
                {fxParamWriteError}
              </div>
            ) : null}
            {fxModelWriteError && isEditableFxSlot(activeSlot) ? (
              <div
                className="mt-1 text-[11px] font-bold"
                style={{ color: "var(--color-red-accent)" }}
              >
                {fxModelWriteError}
              </div>
            ) : null}

            {orderedParameters.length > 0 ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {orderedParameters.map((parameter) => {
                  const normalizedValue = selectedParamValues[parameter.index];
                  const hasValue = normalizedValue !== undefined;
                  const safeNormalizedValue =
                    hasValue && Number.isFinite(normalizedValue) ? normalizedValue : 0;
                  const meterWidth = `${Math.min(100, Math.max(0, safeNormalizedValue * 100))}%`;
                  const isEnumParam = parameter.meta.kind === "enum";
                  const enumOptions: readonly string[] =
                    parameter.meta.kind === "enum" ? parameter.meta.options : [];
                  const sliderStep = isEnumParam ? 1 : 0.001;
                  const writeKey = `${activeSlot}:${parameter.index}`;
                  const isWriting = fxParamWritingKey === writeKey;
                  const writeDisabled = !canWriteSelectedParams || !hasValue || isWriting;
                  return (
                    <div
                      key={parameter.id}
                      className="rounded-xl border p-3"
                      style={{
                        background: "var(--panel-bg)",
                        borderColor: hasValue
                          ? "rgba(0,153,204,0.24)"
                          : "var(--panel-border-light)",
                      }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div
                            className="truncate text-[13px] font-extrabold"
                            style={{ color: "var(--text)" }}
                          >
                            {parameter.label}
                          </div>
                          <div
                            className="mt-0.5 truncate text-[10px] font-bold"
                            style={{ color: "var(--text-secondary)" }}
                          >
                            {formatFxParamMeta(parameter.meta)}
                          </div>
                        </div>
                        <span
                          className="shrink-0 rounded-full border px-1.5 py-0.5 font-mono text-[9px] font-bold"
                          style={{
                            color: "var(--text-secondary)",
                            borderColor: "var(--panel-border)",
                            background: "var(--surface)",
                          }}
                        >
                          #{parameter.index + 1}
                        </span>
                      </div>
                      {hasValue ? (
                        <div className="mt-3">
                          <div
                            className="text-[16px] font-extrabold"
                            style={{ color: "var(--text)" }}
                          >
                            {formatFxParamValue(parameter, normalizedValue!)}
                          </div>
                          {isEnumParam ? (
                            <select
                              value={fxParamEnumIndex(parameter, safeNormalizedValue)}
                              disabled={writeDisabled}
                              aria-label={`Write ${parameter.label}`}
                              onChange={(event) => {
                                if (!editableActiveSlot) return;
                                void onWriteFxParam?.(
                                  editableActiveSlot,
                                  parameter.index,
                                  normalizedFromFxParamEnumIndex(
                                    parameter,
                                    Number(event.target.value),
                                  ),
                                );
                              }}
                              className="mt-3 h-9 w-full rounded-lg border px-2 text-[12px] font-extrabold disabled:opacity-45"
                              style={{
                                background: "var(--surface-2)",
                                borderColor: "var(--panel-border)",
                                color: "var(--text)",
                              }}
                              title={
                                hasValue
                                  ? canWriteSelectedParams
                                    ? "Write live parameter value"
                                    : "Bluetooth state is required for parameter writes"
                                  : "Refresh values before writing"
                              }
                            >
                              {enumOptions.map((option, index) => (
                                <option key={`${parameter.id}-${option}`} value={index}>
                                  {option}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <>
                              <div
                                className="mt-2 h-2 overflow-hidden rounded-full"
                                style={{ background: "var(--panel-inset)" }}
                              >
                                <div
                                  className="h-full rounded-full"
                                  style={{
                                    width: meterWidth,
                                    background: "var(--color-cyan-accent)",
                                  }}
                                />
                              </div>
                              <div
                                className="mt-1 flex items-center justify-between text-[10px] font-bold"
                                style={{ color: "var(--text-secondary)" }}
                              >
                                <span>{formatFxParamValue(parameter, 0)}</span>
                                <span>{formatFxParamValue(parameter, 1)}</span>
                              </div>
                              <input
                                type="range"
                                min={0}
                                max={1}
                                step={sliderStep}
                                value={safeNormalizedValue}
                                disabled={writeDisabled}
                                aria-label={`Write ${parameter.label}`}
                                onChange={(event) => {
                                  if (!editableActiveSlot) return;
                                  void onWriteFxParam?.(
                                    editableActiveSlot,
                                    parameter.index,
                                    Number(event.target.value),
                                  );
                                }}
                                className="mt-3 w-full disabled:opacity-45"
                                title={
                                  hasValue
                                    ? canWriteSelectedParams
                                      ? "Write live parameter value"
                                      : "Bluetooth state is required for parameter writes"
                                    : "Refresh values before writing"
                                }
                              />
                            </>
                          )}
                          <div
                            className="mt-1 flex items-center justify-between font-mono text-[9px] font-bold"
                            style={{ color: "var(--text-secondary)" }}
                          >
                            <span>
                              {isWriting
                                ? "writing"
                                : canWriteSelectedParams
                                  ? "live write"
                                  : "device state"}
                            </span>
                            <span>save to keep</span>
                          </div>
                        </div>
                      ) : !isEditableFxSlot(activeSlot) ? (
                        <FixedBlockReadbackPanel
                          slotId={activeSlot}
                          readback={fixedBlockReadback}
                          rotaryPreview={fixedBlockRotaryPreview}
                          gateReductionLastSentValue={gateReductionLastSentValue}
                          canRefreshParams={canRefreshParams}
                          canWriteFixedBlocks={canWriteFixedBlocks}
                          fixedBlockWritingLabel={fixedBlockWritingLabel}
                          onRefreshCabIrParams={onRefreshCabIrParams}
                          onWriteGateEnabled={onWriteGateEnabled}
                          onWriteGateReduction={onWriteGateReduction}
                          onWriteCaptureVolume={onWriteCaptureVolume}
                          onWriteCabIrParam={onWriteCabIrParam}
                          onWriteCabIrMicPosition={onWriteCabIrMicPosition}
                          onFootswitchRotaryChange={onFootswitchRotaryChange}
                        />
                      ) : (
                        <div
                          className="mt-3 rounded-lg border px-2 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.8px]"
                          style={{
                            color: "var(--text-secondary)",
                            borderColor: "var(--panel-border)",
                            background: "var(--surface-2)",
                          }}
                        >
                          Not synced yet
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
