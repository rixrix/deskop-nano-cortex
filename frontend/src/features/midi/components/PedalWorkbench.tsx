/**
 * PedalWorkbench component — tone-chain reader with CC bypass and read-only parameter values.
 *
 * @see docs/specs/200-frontend-control-surface/spec.md [FR-23]
 * @see docs/specs/200-frontend-control-surface/design.md [DES-FRONT-TONE-STUDIO]
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  ArrowRightIcon,
  CircuitryIcon,
  EqualizerIcon,
  FadersHorizontalIcon,
  GaugeIcon,
  GuitarIcon,
  MicrophoneStageIcon,
  SpeakerHifiIcon,
  WaveSineIcon,
  WaveformIcon,
} from "@phosphor-icons/react";
import type { CCState, FootswitchId } from "../types";
import { CC } from "../constants";
import { TransportBadge } from "../../../shared/ui/components/TransportBadge";
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
  normalizedToFxParamValue,
  normalizedFromFxParamEnumIndex,
  orderedFxParams,
} from "../fxParams";
import type { FxParamDefinition, FxParamProfile } from "../fxParams";
import type { FxSlotModelState, FxSlotModelStates } from "../fxProtocol";
import { getProtocolFxModelByDeviceId } from "../fxProtocol";
import { DeviceSyncProgress } from "./DeviceStatusDock";
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
  fxParamRefreshAttempt?: { slot: NanoFxSlotId; attempt: number; maxAttempts: number } | null;
  fxParamError?: string | null;
  canRefreshParams?: boolean;
  canWriteParams?: boolean;
  fxParamWritingKey?: string | null;
  fxParamWriteError?: string | null;
  deviceActivityMessage?: string | null;
  canWriteModels?: boolean;
  fxModelWritingSlot?: NanoFxSlotId | null;
  fxModelWriteError?: string | null;
  fixedBlockReadback?: FixedBlockReadback;
  fixedBlockRotaryPreview?: Partial<Record<FootswitchId, FixedBlockRotaryReadback>>;
  fixedBlockAssetNames?: {
    capture?: string[];
    ir?: string[];
  };
  gateReductionLastSentValue?: number | null;
  fixedBlockWritingLabel?: string | null;
  canWriteFixedBlocks?: boolean;
  onRefreshFxParams?: (slot: NanoFxSlotId) => Promise<unknown> | unknown;
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

const PARAM_SYNC_COMPLETE_HOLD_MS = 650;

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
      marker: "rgba(0,170,85,0.72)",
    },
    cyan: {
      color: "var(--color-cyan-accent)",
      marker: "rgba(0,153,204,0.72)",
    },
    amber: {
      color: "var(--color-amber-accent)",
      marker: "rgba(212,160,23,0.72)",
    },
    muted: {
      color: "var(--text-secondary)",
      marker: "rgba(100,116,139,0.62)",
    },
  }[tone];

  return (
    <span
      className="inline-flex items-center gap-1.5 text-[9px] font-extrabold uppercase tracking-[0.9px]"
      style={{ color: style.color }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: style.marker }}
        aria-hidden="true"
      />
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

function TransportStatusChip({ label, active }: { label: string; active: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 font-mono text-[8px] font-extrabold uppercase tracking-[0.5px]"
      style={{
        color: active ? "var(--color-cyan-accent)" : "var(--text-muted)",
      }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: active ? "var(--color-cyan-accent)" : "var(--text-muted)" }}
        aria-hidden="true"
      />
      {label}
    </span>
  );
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function finiteNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function logFrequencyPosition(hz: number) {
  return logValuePosition(hz, 20, 20000);
}

function logValuePosition(value: number, minValue: number, maxValue: number) {
  const min = Math.log10(20);
  const max = Math.log10(20000);
  const safeMin = Math.max(Number.EPSILON, minValue);
  const safeMax = Math.max(safeMin * 1.01, maxValue);
  const logMin = minValue === 20 && maxValue === 20000 ? min : Math.log10(safeMin);
  const logMax = minValue === 20 && maxValue === 20000 ? max : Math.log10(safeMax);
  return clamp01(
    (Math.log10(Math.max(safeMin, Math.min(safeMax, value))) - logMin) / (logMax - logMin),
  );
}

function frequencyFromLogPosition(position: number, minHz: number, maxHz: number) {
  const hz = 20 * Math.pow(1000, clamp01(position));
  return Math.round(Math.max(minHz, Math.min(maxHz, hz)));
}

function valueFromLogPosition(position: number, minValue: number, maxValue: number) {
  const safeMin = Math.max(Number.EPSILON, minValue);
  const safeMax = Math.max(safeMin * 1.01, maxValue);
  const value = safeMin * Math.pow(safeMax / safeMin, clamp01(position));
  return Math.max(safeMin, Math.min(safeMax, value));
}

function valueFromGraphY(y: number, min: number, max: number) {
  return min + clamp01(y) * (max - min);
}

function cabIrResponsePoints(values: CabIrReadbackValues | null | undefined) {
  const highPassHz = finiteNumber(values?.highPassHz) ?? 20;
  const lowPassHz = finiteNumber(values?.lowPassHz) ?? 20000;
  const levelDb = finiteNumber(values?.levelDb) ?? 0;
  const gainLift = levelDb / 48;

  return Array.from({ length: 42 }, (_, index) => {
    const x = index / 41;
    const hp = logFrequencyPosition(highPassHz);
    const lp = logFrequencyPosition(lowPassHz);
    const highPassSlope = hp <= 0.01 ? 0 : clamp01((hp - x) / 0.18);
    const lowPassSlope = lp >= 0.99 ? 0 : clamp01((x - lp) / 0.18);
    const micPresence =
      values?.mic?.toLowerCase().includes("ribbon") === true
        ? -0.06
        : values?.mic?.toLowerCase().includes("dynamic") === true
          ? 0.04
          : 0.02;
    const positionShift = ((finiteNumber(values?.position) ?? 3) - 3) * 0.025;
    const y = clamp01(0.64 + gainLift + micPresence + positionShift - highPassSlope - lowPassSlope);
    return { x, y };
  });
}

function captureResponsePoints(volumeRaw: number | null | undefined) {
  const captureDb = captureRawToDb(volumeRaw);
  return captureResponsePointsFromDb(captureDb);
}

function captureResponsePointsFromDb(captureDb: number | null | undefined) {
  const lift = captureDb === null || captureDb === undefined ? 0 : captureDb / 48;
  return Array.from({ length: 28 }, (_, index) => {
    const x = index / 27;
    const midBump = 0.09 * Math.sin(Math.PI * x);
    const edgeTrim = 0.04 * Math.cos(Math.PI * 2 * x);
    return { x, y: clamp01(0.58 + lift + midBump - edgeTrim) };
  });
}

function gateShapePoints(reduction: number | null | undefined) {
  const amount = clamp01((finiteNumber(reduction) ?? 0) / 100);
  return [
    { x: 0, y: 0.25 + amount * 0.1 },
    { x: 0.18, y: 0.25 + amount * 0.1 },
    { x: 0.34, y: 0.44 + amount * 0.36 },
    { x: 0.58, y: 0.74 + amount * 0.16 },
    { x: 1, y: 0.74 + amount * 0.16 },
  ];
}

function chartPoint(point: { x: number; y: number }) {
  return {
    x: 8 + clamp01(point.x) * 84,
    y: 88 - clamp01(point.y) * 70,
  };
}

function smoothChartPath(points: readonly { x: number; y: number }[]) {
  const chartPoints = points.map(chartPoint);
  if (chartPoints.length === 0) return "";
  if (chartPoints.length === 1) {
    const point = chartPoints[0]!;
    return `M ${point.x.toFixed(1)} ${point.y.toFixed(1)}`;
  }

  const commands = [`M ${chartPoints[0]!.x.toFixed(1)} ${chartPoints[0]!.y.toFixed(1)}`];
  for (let index = 0; index < chartPoints.length - 1; index += 1) {
    const current = chartPoints[index]!;
    const next = chartPoints[index + 1]!;
    const previous = chartPoints[index - 1] ?? current;
    const following = chartPoints[index + 2] ?? next;
    const cp1 = {
      x: current.x + (next.x - previous.x) / 6,
      y: current.y + (next.y - previous.y) / 6,
    };
    const cp2 = {
      x: next.x - (following.x - current.x) / 6,
      y: next.y - (following.y - current.y) / 6,
    };
    commands.push(
      `C ${cp1.x.toFixed(1)} ${cp1.y.toFixed(1)}, ${cp2.x.toFixed(1)} ${cp2.y.toFixed(1)}, ${next.x.toFixed(1)} ${next.y.toFixed(1)}`,
    );
  }
  return commands.join(" ");
}

type ToneShapeDrafts = Record<string, { x: number; y: number }>;

interface ToneShapeHandle {
  id: string;
  label: string;
  description?: string;
  x: number;
  y: number;
  pointIndex?: number;
  disabled?: boolean;
  valueLabel?: (x: number, y: number) => string;
  onPreview?: (x: number, y: number) => void;
  onCommit?: (x: number, y: number) => Promise<void> | void;
}

function ToneShapeGraph({
  title,
  source,
  points,
  handles = [],
  previewPoints,
  accent = "cyan",
}: {
  title: string;
  source: string;
  points: readonly { x: number; y: number }[];
  handles?: readonly ToneShapeHandle[];
  previewPoints?: (drafts: ToneShapeDrafts) => readonly { x: number; y: number }[];
  accent?: "cyan" | "amber" | "green";
}) {
  const chartRef = useRef<HTMLDivElement | null>(null);
  const [draggingHandleId, setDraggingHandleId] = useState<string | null>(null);
  const [draftHandles, setDraftHandles] = useState<Record<string, { x: number; y: number }>>({});
  const accentColor = {
    cyan: "var(--color-cyan-accent)",
    amber: "var(--color-amber-accent)",
    green: "var(--color-green-accent)",
  }[accent];
  const hasDraft = Object.keys(draftHandles).length > 0;
  const shownHandles = handles.map((handle) => ({
    ...handle,
    ...(draftHandles[handle.id] ?? {}),
  }));
  const displayPoints =
    hasDraft && previewPoints
      ? previewPoints(draftHandles)
      : hasDraft
        ? points.map((point, index) => {
            const draftHandle = shownHandles.find(
              (handle) => handle.pointIndex === index && draftHandles[handle.id],
            );
            return draftHandle ? { x: draftHandle.x, y: draftHandle.y } : point;
          })
        : points;
  const path = smoothChartPath(displayPoints);
  const areaPath = `${path} L 92 88 L 8 88 Z`;

  const pointerPosition = (event: ReactPointerEvent<HTMLElement>) => {
    const rect = chartRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return null;
    const viewX = ((event.clientX - rect.left) / rect.width) * 100;
    const viewY = ((event.clientY - rect.top) / rect.height) * 100;
    return {
      x: clamp01((viewX - 8) / 84),
      y: clamp01((88 - viewY) / 70),
    };
  };

  const startDrag = (handle: ToneShapeHandle, event: ReactPointerEvent<HTMLButtonElement>) => {
    if (handle.disabled || !handle.onCommit) return;
    event.preventDefault();
    event.stopPropagation();
    setDraggingHandleId(handle.id);
    setDraftHandles((current) => ({
      ...current,
      [handle.id]: { x: handle.x, y: handle.y },
    }));
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const moveDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggingHandleId) return;
    const next = pointerPosition(event);
    if (!next) return;
    const handle = handles.find((item) => item.id === draggingHandleId);
    handle?.onPreview?.(next.x, next.y);
    setDraftHandles((current) => ({
      ...current,
      [draggingHandleId]: next,
    }));
  };

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggingHandleId) return;
    const handle = handles.find((item) => item.id === draggingHandleId);
    const draft = draftHandles[draggingHandleId] ?? pointerPosition(event);
    setDraggingHandleId(null);
    setDraftHandles((current) => {
      const next = { ...current };
      delete next[draggingHandleId];
      return next;
    });
    if (handle && draft) void handle.onCommit?.(draft.x, draft.y);
  };

  if (points.length === 0) return null;

  return (
    <div
      className="rounded-xl border p-3"
      style={{ background: "var(--panel-bg)", borderColor: "var(--panel-border-light)" }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div
            className="text-[10px] font-extrabold uppercase tracking-[1.1px]"
            style={{ color: "var(--text-secondary)" }}
          >
            {title}
          </div>
          <div className="mt-0.5 text-[11px] font-semibold" style={{ color: "var(--text)" }}>
            {source}
          </div>
        </div>
        <span
          className="inline-flex items-center gap-1.5 text-[9px] font-extrabold uppercase tracking-[0.8px]"
          style={{
            color: accentColor,
          }}
        >
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: accentColor }}
            aria-hidden="true"
          />
          visual
        </span>
      </div>
      <div
        ref={chartRef}
        className="relative mt-3 h-36 w-full overflow-hidden rounded-lg border"
        role="img"
        aria-label={title}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        style={{
          background: "linear-gradient(180deg, rgba(248,250,252,0.02), rgba(0,153,204,0.035))",
          borderColor: "var(--panel-border-light)",
          touchAction: "none",
        }}
      >
        <svg
          className="absolute inset-0 h-full w-full"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {[18, 41, 64, 88].map((y) => (
            <line
              key={y}
              x1="8"
              x2="92"
              y1={y}
              y2={y}
              stroke="rgba(148,163,184,0.18)"
              strokeWidth="0.7"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {[8, 29, 50, 71, 92].map((x) => (
            <line
              key={x}
              x1={x}
              x2={x}
              y1="18"
              y2="88"
              stroke="rgba(148,163,184,0.10)"
              strokeWidth="0.7"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          <defs>
            <linearGradient id={`${title.replace(/\W+/g, "-")}-fill`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={accentColor} stopOpacity="0.20" />
              <stop offset="100%" stopColor={accentColor} stopOpacity="0.02" />
            </linearGradient>
          </defs>
          <path d={areaPath} fill={`url(#${title.replace(/\W+/g, "-")}-fill)`} opacity="0.95" />
          <path
            d={path}
            fill="none"
            stroke="rgba(255,255,255,0.30)"
            strokeWidth="6"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
          <path
            d={path}
            fill="none"
            stroke={accentColor}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        {shownHandles.map((handle) => {
          const x = 8 + clamp01(handle.x) * 84;
          const y = 88 - clamp01(handle.y) * 70;
          const active = draggingHandleId === handle.id;
          const enabled = !handle.disabled && Boolean(handle.onCommit);
          const valueText = handle.valueLabel?.(handle.x, handle.y);
          return (
            <div
              key={handle.id}
              className="group absolute"
              style={{
                left: `${x}%`,
                top: `${y}%`,
                transform: "translate(-50%, -50%)",
              }}
            >
              <div
                className="pointer-events-none absolute left-1/2 -top-6 -translate-x-1/2 rounded-md border px-1.5 py-0.5 font-mono text-[9px] font-extrabold transition-all group-hover:-top-12 group-hover:px-2 group-hover:py-1 group-hover:text-left"
                style={{
                  background: "var(--surface-2)",
                  borderColor: enabled ? "rgba(0,153,204,0.26)" : "var(--panel-border)",
                  color: enabled ? accentColor : "var(--text-secondary)",
                }}
              >
                <span>{handle.label}</span>
                <span
                  className={[
                    "hidden whitespace-nowrap font-sans text-[10px] normal-case tracking-normal group-hover:block",
                    active ? "block" : "",
                  ].join(" ")}
                  style={{ color: "var(--text)" }}
                >
                  {handle.description ?? handle.label}
                  {valueText ? ` · ${valueText}` : ""}
                </span>
              </div>
              <button
                type="button"
                role="slider"
                tabIndex={enabled ? 0 : -1}
                aria-label={`Drag ${title} ${handle.description ?? handle.label}`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(clamp01(handle.y) * 100)}
                aria-disabled={!enabled}
                onPointerDown={(event) => startDrag(handle, event)}
                disabled={!enabled}
                title={
                  valueText
                    ? `${handle.description ?? handle.label}: ${valueText}`
                    : (handle.description ?? handle.label)
                }
                className="grid h-6 w-6 place-items-center rounded-full border outline-none transition-transform focus-visible:ring-2 disabled:cursor-default"
                style={{
                  background: "var(--surface)",
                  borderColor: enabled ? accentColor : "rgba(148,163,184,0.42)",
                  boxShadow: active
                    ? `0 0 0 5px rgba(0,153,204,0.12), 0 6px 18px rgba(0,0,0,0.24)`
                    : "0 3px 10px rgba(0,0,0,0.18)",
                  cursor: enabled ? "grab" : "default",
                  transform: active ? "scale(1.12)" : "scale(1)",
                }}
              >
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ background: enabled ? accentColor : "rgba(148,163,184,0.5)" }}
                />
              </button>
            </div>
          );
        })}
      </div>
      <div
        className="mt-1 flex items-center justify-between font-mono text-[9px] font-bold"
        style={{ color: "var(--text-secondary)" }}
      >
        <span>low</span>
        <span>mid</span>
        <span>high</span>
      </div>
    </div>
  );
}

interface EditableToneShapeConfig {
  title: string;
  source: string;
  parameterIndices: readonly number[];
  points: readonly { x: number; y: number }[];
  handles: readonly ToneShapeHandle[];
  previewPoints?: (drafts: ToneShapeDrafts) => readonly { x: number; y: number }[];
}

function normalizedParamValue(param: FxParamDefinition, values: readonly number[]) {
  const value = values[param.index];
  return value === undefined || !Number.isFinite(value) ? null : clamp01(value);
}

function numericParamValue(param: FxParamDefinition, values: readonly number[]) {
  const normalized = normalizedParamValue(param, values);
  if (normalized === null) return null;
  const value = normalizedToFxParamValue(param, normalized);
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizedFromParamNumber(param: FxParamDefinition, value: number) {
  if (param.meta.kind !== "range") return 0;
  const span = param.meta.max - param.meta.min;
  if (!Number.isFinite(span) || span === 0) return 0;
  return clamp01((value - param.meta.min) / span);
}

function rangeMin(param: FxParamDefinition, fallback: number) {
  return param.meta.kind === "range" ? param.meta.min : fallback;
}

function rangeMax(param: FxParamDefinition, fallback: number) {
  return param.meta.kind === "range" ? param.meta.max : fallback;
}

function normalizedLabel(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function isGraphEqBand(param: FxParamDefinition) {
  return /^(65hz|125hz|250hz|500hz|1khz|2khz|4khz|8khz|16khz)$/i.test(
    param.label.replace(/\s+/g, ""),
  );
}

function graphEqBandFrequency(label: string) {
  const normalized = label.trim().toLowerCase();
  if (normalized.endsWith("khz")) return Number(normalized.replace("khz", "")) * 1000;
  if (normalized.endsWith("hz")) return Number(normalized.replace("hz", ""));
  return null;
}

function parametricBandPart(param: FxParamDefinition) {
  const match = /^([1-3])\s+(gain|freq|q)$/i.exec(normalizedLabel(param.label));
  if (!match) return null;
  return { band: Number(match[1]), part: match[2]!.toLowerCase() as "gain" | "freq" | "q" };
}

function isHighPassParam(param: FxParamDefinition) {
  const label = normalizedLabel(param.label);
  return label === "hpf" || label === "hpf freq" || label === "high pass";
}

function isLowPassParam(param: FxParamDefinition) {
  const label = normalizedLabel(param.label);
  return label === "lpf" || label === "lpf freq" || label === "low pass";
}

function gainDbToGraphY(db: number, min = -12, max = 12) {
  return clamp01((db - min) / (max - min));
}

function graphYToGainDb(y: number, min = -12, max = 12) {
  return valueFromGraphY(y, min, max);
}

function buildGraphicEqCurve(
  bands: readonly { freq: number; gainDb: number }[],
  highPassHz: number | null,
  lowPassHz: number | null,
) {
  if (bands.length === 0) return [];
  const bandPoints = bands
    .slice()
    .sort((a, b) => a.freq - b.freq)
    .map((band) => ({
      x: logFrequencyPosition(band.freq),
      y: gainDbToGraphY(band.gainDb),
    }));
  const points = [
    { x: 0, y: bandPoints[0]?.y ?? 0.5 },
    ...bandPoints,
    { x: 1, y: bandPoints[bandPoints.length - 1]?.y ?? 0.5 },
  ];
  return points.map((point) => {
    const hp = highPassHz ? logFrequencyPosition(highPassHz) : 0;
    const lp = lowPassHz ? logFrequencyPosition(lowPassHz) : 1;
    const highPassSlope = hp <= 0.01 ? 0 : clamp01((hp - point.x) / 0.16);
    const lowPassSlope = lp >= 0.99 ? 0 : clamp01((point.x - lp) / 0.16);
    return { ...point, y: clamp01(point.y - highPassSlope - lowPassSlope) };
  });
}

function buildParametricEqCurve(bands: readonly { freq: number; gainDb: number; q: number }[]) {
  if (bands.length === 0) return [];
  return Array.from({ length: 64 }, (_, index) => {
    const x = index / 63;
    const gain = bands.reduce((sum, band) => {
      const center = logFrequencyPosition(band.freq);
      const width = 0.18 / Math.max(0.4, band.q);
      const distance = (x - center) / width;
      return sum + (band.gainDb / 24) * Math.exp(-0.5 * distance * distance);
    }, 0);
    return { x, y: clamp01(0.5 + gain) };
  });
}

function filterCurvePoints(highPassHz: number | null, lowPassHz: number | null) {
  return Array.from({ length: 42 }, (_, index) => {
    const x = index / 41;
    const hp = highPassHz ? logFrequencyPosition(highPassHz) : 0;
    const lp = lowPassHz ? logFrequencyPosition(lowPassHz) : 1;
    const highPassSlope = hp <= 0.01 ? 0 : clamp01((hp - x) / 0.18);
    const lowPassSlope = lp >= 0.99 ? 0 : clamp01((x - lp) / 0.18);
    return { x, y: clamp01(0.72 - highPassSlope - lowPassSlope) };
  });
}

function buildEditableToneShape({
  profile,
  parameters,
  values,
  canWrite,
  slot,
  onWrite,
  onPreview,
}: {
  profile: FxParamProfile | null;
  parameters: readonly FxParamDefinition[];
  values: readonly number[];
  canWrite: boolean;
  slot: EditableFxSlotId | null;
  onWrite?: (
    slot: EditableFxSlotId,
    paramIndex: number,
    normalizedValue: number,
  ) => Promise<void> | void;
  onPreview?: (slot: EditableFxSlotId, paramIndex: number, normalizedValue: number) => void;
}): EditableToneShapeConfig | null {
  if (!profile || !slot || values.length === 0) return null;

  const parametricGroups = parameters.reduce(
    (groups, param) => {
      const part = parametricBandPart(param);
      if (!part) return groups;
      groups[part.band] = { ...(groups[part.band] ?? {}), [part.part]: param };
      return groups;
    },
    {} as Record<number, Partial<Record<"gain" | "freq" | "q", FxParamDefinition>>>,
  );
  const parametricBands = Object.entries(parametricGroups)
    .map(([band, parts]) => {
      if (!parts.gain || !parts.freq || !parts.q) return null;
      const gainDb = numericParamValue(parts.gain, values);
      const freq = numericParamValue(parts.freq, values);
      const q = numericParamValue(parts.q, values);
      return gainDb !== null && freq !== null && q !== null
        ? { band: Number(band), gainParam: parts.gain, freqParam: parts.freq, gainDb, freq, q }
        : null;
    })
    .filter(
      (
        item,
      ): item is {
        band: number;
        gainParam: FxParamDefinition;
        freqParam: FxParamDefinition;
        gainDb: number;
        freq: number;
        q: number;
      } => Boolean(item),
    )
    .sort((a, b) => a.band - b.band);
  if (parametricBands.length > 0) {
    const points = buildParametricEqCurve(parametricBands);
    return {
      title: "Parametric EQ curve",
      source: `Derived from ${parametricBands.length} synced EQ band${
        parametricBands.length === 1 ? "" : "s"
      }`,
      parameterIndices: parametricBands.flatMap(({ gainParam, freqParam }) => [
        freqParam.index,
        gainParam.index,
      ]),
      points,
      handles: parametricBands.map(({ band, gainParam, freqParam, gainDb, freq }) => ({
        id: `parametric-band-${band}`,
        label: `${band}`,
        description: `Band ${band}`,
        x: logValuePosition(freq, rangeMin(freqParam, 0.1), rangeMax(freqParam, 10)),
        y: gainDbToGraphY(gainDb),
        disabled: !canWrite || !onWrite,
        valueLabel: (x, y) =>
          `${valueFromLogPosition(x, rangeMin(freqParam, 0.1), rangeMax(freqParam, 10)).toFixed(1)} · ${graphYToGainDb(y).toFixed(1)} dB`,
        onPreview:
          canWrite &&
          onPreview &&
          gainParam.meta.kind === "range" &&
          freqParam.meta.kind === "range"
            ? (x, y) => {
                onPreview(
                  slot,
                  freqParam.index,
                  normalizedFromParamNumber(
                    freqParam,
                    valueFromLogPosition(x, rangeMin(freqParam, 0.1), rangeMax(freqParam, 10)),
                  ),
                );
                onPreview(
                  slot,
                  gainParam.index,
                  normalizedFromParamNumber(gainParam, graphYToGainDb(y)),
                );
              }
            : undefined,
        onCommit:
          canWrite && onWrite && gainParam.meta.kind === "range" && freqParam.meta.kind === "range"
            ? (x, y) => {
                void onWrite(
                  slot,
                  freqParam.index,
                  normalizedFromParamNumber(
                    freqParam,
                    valueFromLogPosition(x, rangeMin(freqParam, 0.1), rangeMax(freqParam, 10)),
                  ),
                );
                void onWrite(
                  slot,
                  gainParam.index,
                  normalizedFromParamNumber(gainParam, graphYToGainDb(y)),
                );
              }
            : undefined,
      })),
      previewPoints: (drafts) =>
        buildParametricEqCurve(
          parametricBands.map(({ band, gainDb, freq, q }) => {
            const draft = drafts[`parametric-band-${band}`];
            return {
              freq: draft ? valueFromLogPosition(draft.x, 0.1, 10) : freq,
              gainDb: draft ? graphYToGainDb(draft.y) : gainDb,
              q,
            };
          }),
        ),
    };
  }

  const bandParams = parameters.filter(isGraphEqBand);
  if (bandParams.length >= 5) {
    const highPass = parameters.find(isHighPassParam) ?? null;
    const lowPass = parameters.find(isLowPassParam) ?? null;
    const bandValues = bandParams
      .map((param) => {
        const freq = graphEqBandFrequency(param.label);
        const gainDb = numericParamValue(param, values);
        return freq && gainDb !== null ? { param, freq, gainDb } : null;
      })
      .filter((item): item is { param: FxParamDefinition; freq: number; gainDb: number } =>
        Boolean(item),
      );
    const highPassHz = highPass ? numericParamValue(highPass, values) : null;
    const lowPassHz = lowPass ? numericParamValue(lowPass, values) : null;
    const points = buildGraphicEqCurve(bandValues, highPassHz, lowPassHz);
    const handles: ToneShapeHandle[] = bandValues.map(({ param, freq, gainDb }) => ({
      id: param.id,
      label: param.label,
      description: param.label,
      x: logFrequencyPosition(freq),
      y: gainDbToGraphY(gainDb),
      disabled: !canWrite || !onWrite,
      valueLabel: (_x, y) => `${graphYToGainDb(y).toFixed(1)} dB`,
      onPreview:
        canWrite && onPreview
          ? (_x, y) =>
              onPreview(slot, param.index, normalizedFromParamNumber(param, graphYToGainDb(y)))
          : undefined,
      onCommit:
        canWrite && onWrite
          ? (_x, y) =>
              onWrite(slot, param.index, normalizedFromParamNumber(param, graphYToGainDb(y)))
          : undefined,
    }));
    if (highPass && highPassHz !== null) {
      handles.push({
        id: highPass.id,
        label: "HP",
        description: highPass.label,
        x: logFrequencyPosition(highPassHz),
        y: 0.18,
        disabled: !canWrite || !onWrite,
        valueLabel: (x) =>
          `${frequencyFromLogPosition(x, rangeMin(highPass, 20), rangeMax(highPass, 800))} Hz`,
        onPreview:
          canWrite && onPreview && highPass.meta.kind === "range"
            ? (x) =>
                onPreview(
                  slot,
                  highPass.index,
                  normalizedFromParamNumber(
                    highPass,
                    frequencyFromLogPosition(x, rangeMin(highPass, 20), rangeMax(highPass, 800)),
                  ),
                )
            : undefined,
        onCommit:
          canWrite && onWrite && highPass.meta.kind === "range"
            ? (x) =>
                onWrite(
                  slot,
                  highPass.index,
                  normalizedFromParamNumber(
                    highPass,
                    frequencyFromLogPosition(x, rangeMin(highPass, 20), rangeMax(highPass, 800)),
                  ),
                )
            : undefined,
      });
    }
    if (lowPass && lowPassHz !== null) {
      handles.push({
        id: lowPass.id,
        label: "LP",
        description: lowPass.label,
        x: logFrequencyPosition(lowPassHz),
        y: 0.18,
        disabled: !canWrite || !onWrite,
        valueLabel: (x) =>
          `${frequencyFromLogPosition(x, rangeMin(lowPass, 1000), rangeMax(lowPass, 20000))} Hz`,
        onPreview:
          canWrite && onPreview && lowPass.meta.kind === "range"
            ? (x) =>
                onPreview(
                  slot,
                  lowPass.index,
                  normalizedFromParamNumber(
                    lowPass,
                    frequencyFromLogPosition(x, rangeMin(lowPass, 1000), rangeMax(lowPass, 20000)),
                  ),
                )
            : undefined,
        onCommit:
          canWrite && onWrite && lowPass.meta.kind === "range"
            ? (x) =>
                onWrite(
                  slot,
                  lowPass.index,
                  normalizedFromParamNumber(
                    lowPass,
                    frequencyFromLogPosition(x, rangeMin(lowPass, 1000), rangeMax(lowPass, 20000)),
                  ),
                )
            : undefined,
      });
    }
    return {
      title: "Graphic EQ curve",
      source: "Derived from frequency bands and filters",
      parameterIndices: [
        ...bandValues.map(({ param }) => param.index),
        ...(highPass ? [highPass.index] : []),
        ...(lowPass ? [lowPass.index] : []),
      ],
      points,
      handles,
      previewPoints: (drafts) => {
        const draftBands = bandValues.map(({ param, freq, gainDb }) => ({
          freq,
          gainDb: drafts[param.id] ? graphYToGainDb(drafts[param.id]!.y) : gainDb,
        }));
        const draftHighPass =
          highPass && drafts[highPass.id] && highPass.meta.kind === "range"
            ? frequencyFromLogPosition(
                drafts[highPass.id]!.x,
                rangeMin(highPass, 20),
                rangeMax(highPass, 800),
              )
            : highPassHz;
        const draftLowPass =
          lowPass && drafts[lowPass.id] && lowPass.meta.kind === "range"
            ? frequencyFromLogPosition(
                drafts[lowPass.id]!.x,
                rangeMin(lowPass, 1000),
                rangeMax(lowPass, 20000),
              )
            : lowPassHz;
        return buildGraphicEqCurve(draftBands, draftHighPass, draftLowPass);
      },
    };
  }

  const highPass = parameters.find(isHighPassParam) ?? null;
  const lowPass = parameters.find(isLowPassParam) ?? null;
  const highPassHz = highPass ? numericParamValue(highPass, values) : null;
  const lowPassHz = lowPass ? numericParamValue(lowPass, values) : null;
  if (!highPass && !lowPass) return null;

  const handles: ToneShapeHandle[] = [];
  if (highPass && highPassHz !== null) {
    handles.push({
      id: highPass.id,
      label: "HP",
      description: highPass.label,
      x: logFrequencyPosition(highPassHz),
      y: 0.5,
      disabled: !canWrite || !onWrite,
      valueLabel: (x) =>
        `${frequencyFromLogPosition(x, rangeMin(highPass, 20), rangeMax(highPass, 800))} Hz`,
      onPreview:
        canWrite && onPreview && highPass.meta.kind === "range"
          ? (x) =>
              onPreview(
                slot,
                highPass.index,
                normalizedFromParamNumber(
                  highPass,
                  frequencyFromLogPosition(x, rangeMin(highPass, 20), rangeMax(highPass, 800)),
                ),
              )
          : undefined,
      onCommit:
        canWrite && onWrite && highPass.meta.kind === "range"
          ? (x) =>
              onWrite(
                slot,
                highPass.index,
                normalizedFromParamNumber(
                  highPass,
                  frequencyFromLogPosition(x, rangeMin(highPass, 20), rangeMax(highPass, 800)),
                ),
              )
          : undefined,
    });
  }
  if (lowPass && lowPassHz !== null) {
    handles.push({
      id: lowPass.id,
      label: "LP",
      description: lowPass.label,
      x: logFrequencyPosition(lowPassHz),
      y: 0.5,
      disabled: !canWrite || !onWrite,
      valueLabel: (x) =>
        `${frequencyFromLogPosition(x, rangeMin(lowPass, 1000), rangeMax(lowPass, 20000))} Hz`,
      onPreview:
        canWrite && onPreview && lowPass.meta.kind === "range"
          ? (x) =>
              onPreview(
                slot,
                lowPass.index,
                normalizedFromParamNumber(
                  lowPass,
                  frequencyFromLogPosition(x, rangeMin(lowPass, 1000), rangeMax(lowPass, 20000)),
                ),
              )
          : undefined,
      onCommit:
        canWrite && onWrite && lowPass.meta.kind === "range"
          ? (x) =>
              onWrite(
                slot,
                lowPass.index,
                normalizedFromParamNumber(
                  lowPass,
                  frequencyFromLogPosition(x, rangeMin(lowPass, 1000), rangeMax(lowPass, 20000)),
                ),
              )
          : undefined,
    });
  }

  return {
    title: "Filter curve",
    source: "Derived from high/low pass filters",
    parameterIndices: [...(highPass ? [highPass.index] : []), ...(lowPass ? [lowPass.index] : [])],
    points: filterCurvePoints(highPassHz, lowPassHz),
    handles,
    previewPoints: (drafts) => {
      const draftHighPass =
        highPass && drafts[highPass.id] && highPass.meta.kind === "range"
          ? frequencyFromLogPosition(
              drafts[highPass.id]!.x,
              rangeMin(highPass, 20),
              rangeMax(highPass, 800),
            )
          : highPassHz;
      const draftLowPass =
        lowPass && drafts[lowPass.id] && lowPass.meta.kind === "range"
          ? frequencyFromLogPosition(
              drafts[lowPass.id]!.x,
              rangeMin(lowPass, 1000),
              rangeMax(lowPass, 20000),
            )
          : lowPassHz;
      return filterCurvePoints(draftHighPass, draftLowPass);
    },
  };
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
  disabledReason,
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
  disabledReason?: string;
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
      style={{
        background: disabled || !onCommit ? "var(--surface)" : "var(--panel-bg)",
        borderColor: disabled || !onCommit ? "var(--panel-border)" : "var(--panel-border-light)",
      }}
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
      {disabled || !onCommit ? (
        <div
          className="mt-2 text-[9px] font-extrabold uppercase tracking-[0.7px]"
          style={{ color: "var(--text-muted)" }}
        >
          {disabledReason ?? "Bluetooth state required"}
        </div>
      ) : null}
    </div>
  );
}

function GraphSyncPlaceholder({
  title,
  message,
  accent = "var(--color-cyan-accent)",
}: {
  title: string;
  message: string;
  accent?: string;
}) {
  return (
    <div
      className="rounded-xl border p-3"
      style={{
        background: "var(--panel-bg)",
        borderColor: "var(--panel-border-light)",
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div
            className="text-[10px] font-extrabold uppercase tracking-[1.1px]"
            style={{ color: "var(--text-secondary)" }}
          >
            {title}
          </div>
          <div className="mt-0.5 text-[11px] font-semibold" style={{ color: "var(--text)" }}>
            {message}
          </div>
        </div>
        <div
          className="inline-flex items-center gap-1.5 text-[9px] font-extrabold uppercase tracking-[0.8px]"
          style={{ color: "var(--text-secondary)" }}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: accent }} />
          Sync needed
        </div>
      </div>
      <div
        className="mt-3 grid h-28 place-items-center rounded-lg border border-dashed text-[11px] font-bold"
        style={{
          borderColor: "var(--panel-border)",
          color: "var(--text-secondary)",
          background: "var(--surface)",
        }}
      >
        Refresh IR values
      </div>
    </div>
  );
}

function FixedBlockReadbackPanel({
  slotId,
  readback,
  rotaryPreview,
  assetNames,
  gateReductionLastSentValue,
  canWriteFixedBlocks,
  fixedBlockWritingLabel,
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
  assetNames?: {
    capture?: string[];
    ir?: string[];
  };
  gateReductionLastSentValue?: number | null;
  canWriteFixedBlocks: boolean;
  fixedBlockWritingLabel?: string | null;
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
        <div className="sm:col-span-2 xl:col-span-3">
          <ToneShapeGraph
            title="Gate envelope shape"
            source={
              gateReductionReadback === null
                ? "Last sent reduction value"
                : "Synced gate reduction value"
            }
            points={gateShapePoints(gateReductionDisplay)}
            previewPoints={(drafts) => {
              const draft = drafts["gate-reduction"];
              const raw = draft ? valueFromGraphY(draft.y, 0, 100) : (gateReductionDisplay ?? 0);
              const stepped = Math.round(raw / 25) * 25;
              return gateShapePoints(Math.max(0, Math.min(100, stepped)));
            }}
            handles={[
              {
                id: "gate-reduction",
                label: "RED",
                description: "Gate reduction",
                x: 0.42,
                y: clamp01((gateReductionDisplay ?? 0) / 100),
                disabled: !canWriteFixedBlocks || writeBusy || !onWriteGateReduction,
                valueLabel: (_x, y) =>
                  `${Math.max(0, Math.min(100, Math.round(valueFromGraphY(y, 0, 100) / 25) * 25))}%`,
                onCommit:
                  canWriteFixedBlocks && !writeBusy && onWriteGateReduction
                    ? (_x, y) => {
                        const stepped = Math.round(valueFromGraphY(y, 0, 100) / 25) * 25;
                        return onWriteGateReduction(Math.max(0, Math.min(100, stepped)));
                      }
                    : undefined,
              },
            ]}
            accent="green"
          />
        </div>
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
          cycleMin={1}
          bypassLabel="Capture"
          assetNames={assetNames?.capture}
          maxSlot={Math.max(5, assetNames?.capture?.length ?? 25)}
          onChange={canWriteRotary ? (value) => onFootswitchRotaryChange?.("I", value) : undefined}
        />
        <ToneShapeGraph
          title="Capture tone shape"
          source={captureDb === null ? "Waiting for capture volume" : "Derived from capture volume"}
          points={captureResponsePoints(readback?.captureVolume)}
          previewPoints={(drafts) =>
            captureResponsePointsFromDb(
              drafts["capture-volume"]
                ? valueFromGraphY(drafts["capture-volume"].y, -24, 12)
                : captureDb,
            )
          }
          handles={[
            {
              id: "capture-volume",
              label: "VOL",
              description: "Capture volume",
              x: 0.5,
              y: clamp01(((captureDb ?? 0) + 24) / 36),
              disabled: !canWriteFixedBlocks || writeBusy || !onWriteCaptureVolume,
              valueLabel: (_x, y) => `${valueFromGraphY(y, -24, 12).toFixed(1)} dB`,
              onCommit:
                canWriteFixedBlocks && !writeBusy && onWriteCaptureVolume
                  ? (_x, y) => onWriteCaptureVolume(valueFromGraphY(y, -24, 12))
                  : undefined,
            },
          ]}
          accent="cyan"
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
    const cabIrParams = readback?.cabIrParams ?? null;
    const hasCabIrParams = cabIrParams !== null;
    return (
      <div className="mt-4">
        <div className="mb-3">
          <GearRotaryReadout
            label="Cab / IR · FS II rotary"
            value={valueOrPending(readback?.cabIrName)}
            rotary={cabIrRotary}
            accent="amber"
            cycleMin={1}
            bypassLabel="Cab / IR"
            assetNames={assetNames?.ir}
            maxSlot={5}
            banked={false}
            onChange={
              canWriteRotary ? (value) => onFootswitchRotaryChange?.("II", value) : undefined
            }
          />
        </div>
        <div className="mb-3">
          <div className="text-[12px] font-semibold" style={{ color: "var(--text)" }}>
            Cab/IR values are read from the selected IR slot.
          </div>
        </div>
        {readback?.cabIrParamsError ? (
          <div className="mb-3 text-[11px] font-bold" style={{ color: "var(--color-red-accent)" }}>
            {readback.cabIrParamsError}
          </div>
        ) : null}
        <div className="mb-3">
          {hasCabIrParams ? (
            <ToneShapeGraph
              title="Cab/IR response shape"
              source="Derived from level, filters, mic, and position"
              points={cabIrResponsePoints(cabIrParams)}
              previewPoints={(drafts) =>
                cabIrResponsePoints({
                  levelDb: drafts.level
                    ? valueFromGraphY(drafts.level.y, -96, 12)
                    : cabIrParams.levelDb,
                  highPassHz: drafts["high-pass"]
                    ? frequencyFromLogPosition(drafts["high-pass"].x, 20, 800)
                    : cabIrParams.highPassHz,
                  lowPassHz: drafts["low-pass"]
                    ? frequencyFromLogPosition(drafts["low-pass"].x, 1000, 20000)
                    : cabIrParams.lowPassHz,
                  mic: cabIrParams.mic,
                  position: cabIrParams.position,
                })
              }
              handles={[
                {
                  id: "high-pass",
                  label: "HP",
                  description: "High pass",
                  x: logFrequencyPosition(cabIrParams.highPassHz ?? 20),
                  y: 0.52,
                  disabled: !canWriteFixedBlocks || writeBusy || !onWriteCabIrParam,
                  valueLabel: (x) => `${frequencyFromLogPosition(x, 20, 800)} Hz`,
                  onCommit:
                    canWriteFixedBlocks && !writeBusy && onWriteCabIrParam
                      ? (x) => onWriteCabIrParam("high-pass", frequencyFromLogPosition(x, 20, 800))
                      : undefined,
                },
                {
                  id: "level",
                  label: "LVL",
                  description: "Level",
                  x: 0.5,
                  y: clamp01(((cabIrParams.levelDb ?? 0) + 96) / 108),
                  disabled: !canWriteFixedBlocks || writeBusy || !onWriteCabIrParam,
                  valueLabel: (_x, y) => `${valueFromGraphY(y, -96, 12).toFixed(1)} dB`,
                  onCommit:
                    canWriteFixedBlocks && !writeBusy && onWriteCabIrParam
                      ? (_x, y) => onWriteCabIrParam("level", valueFromGraphY(y, -96, 12))
                      : undefined,
                },
                {
                  id: "low-pass",
                  label: "LP",
                  description: "Low pass",
                  x: logFrequencyPosition(cabIrParams.lowPassHz ?? 20000),
                  y: 0.52,
                  disabled: !canWriteFixedBlocks || writeBusy || !onWriteCabIrParam,
                  valueLabel: (x) => `${frequencyFromLogPosition(x, 1000, 20000)} Hz`,
                  onCommit:
                    canWriteFixedBlocks && !writeBusy && onWriteCabIrParam
                      ? (x) =>
                          onWriteCabIrParam("low-pass", frequencyFromLogPosition(x, 1000, 20000))
                      : undefined,
                },
              ]}
              accent="amber"
            />
          ) : (
            <GraphSyncPlaceholder
              title="Cab/IR response shape"
              message="Refresh IR values to sync filters"
              accent="var(--color-amber-accent)"
            />
          )}
        </div>
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
              value={cabIrParams?.mic ?? ""}
              disabled={
                !canWriteFixedBlocks || writeBusy || !onWriteCabIrMicPosition || !cabIrParams
              }
              onChange={(event) =>
                void onWriteCabIrMicPosition?.(event.target.value, cabIrParams?.position ?? 1)
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
              value={String(cabIrParams?.position ?? "")}
              disabled={
                !canWriteFixedBlocks || writeBusy || !onWriteCabIrMicPosition || !cabIrParams?.mic
              }
              onChange={(event) =>
                void onWriteCabIrMicPosition?.(cabIrParams?.mic ?? "", Number(event.target.value))
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
            value={cabIrParams?.levelDb}
            min={-96}
            max={12}
            step={0.1}
            unit="dB"
            disabled={
              !canWriteFixedBlocks || writeBusy || readback?.cabIrOn !== true || !cabIrParams
            }
            pendingLabel="Refresh first"
            disabledReason={!cabIrParams ? "Refresh values first" : undefined}
            onCommit={(value) => onWriteCabIrParam?.("level", value)}
          />
          <WriteRange
            label="High pass"
            value={cabIrParams?.highPassHz}
            min={20}
            max={800}
            step={1}
            unit="Hz"
            disabled={
              !canWriteFixedBlocks || writeBusy || readback?.cabIrOn !== true || !cabIrParams
            }
            pendingLabel="Refresh first"
            disabledReason={!cabIrParams ? "Refresh values first" : undefined}
            onCommit={(value) => onWriteCabIrParam?.("high-pass", value)}
          />
          <WriteRange
            label="Low pass"
            value={cabIrParams?.lowPassHz}
            min={1000}
            max={20000}
            step={1}
            unit="Hz"
            disabled={
              !canWriteFixedBlocks || writeBusy || readback?.cabIrOn !== true || !cabIrParams
            }
            pendingLabel="Refresh first"
            disabledReason={!cabIrParams ? "Refresh values first" : undefined}
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
        <div className="mt-1 flex h-6 items-center justify-center gap-1 short:h-5">
          <button
            type="button"
            disabled={disabled || cc === null}
            onClick={onToggle}
            className="h-6 rounded-full border px-2 text-[9px] font-extrabold uppercase tracking-[0.8px] disabled:cursor-default disabled:opacity-45 short:h-5"
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
  fxParamRefreshAttempt,
  fxParamError,
  canRefreshParams = false,
  canWriteParams = false,
  fxParamWritingKey = null,
  fxParamWriteError = null,
  deviceActivityMessage = null,
  canWriteModels = false,
  fxModelWritingSlot = null,
  fxModelWriteError = null,
  fixedBlockReadback,
  fixedBlockRotaryPreview,
  fixedBlockAssetNames,
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
  const [localParamDraft, setLocalParamDraft] = useState<{
    key: string;
    values: number[];
  } | null>(null);
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
  const autoRefreshKey = `${activeSlot}:${selectedModelDisplay.rawId ?? selectedModelDisplay.deviceId ?? selectedModelDisplay.name}`;
  const baseSelectedParamValues = fxParamValues?.[activeSlot] ?? [];
  const selectedParamValues =
    localParamDraft?.key === autoRefreshKey ? localParamDraft.values : baseSelectedParamValues;
  const syncedParameters = orderedParameters.filter((parameter) => {
    const value = selectedParamValues[parameter.index];
    return value !== undefined && Number.isFinite(value);
  });
  const unsyncedParameters = orderedParameters.filter((parameter) => {
    const value = selectedParamValues[parameter.index];
    return value === undefined || !Number.isFinite(value);
  });
  const hasSelectedParamValues = syncedParameters.length > 0;
  const hasCompleteSelectedParamValues =
    orderedParameters.length > 0 && unsyncedParameters.length === 0;
  const isParamRefreshLoading = fxParamLoadingSlot === activeSlot;
  const activeRefreshAttempt =
    fxParamRefreshAttempt?.slot === activeSlot ? fxParamRefreshAttempt : null;
  const hasParamRefreshFailure = Boolean(
    fxParamError && isEditableFxSlot(activeSlot) && !isParamRefreshLoading,
  );
  const autoRefreshRequestedRef = useRef<string | null>(null);
  const stableCcStateRef = useRef(ccState);
  const activeSlotFxParamActivityMessage = `Reading FX parameters for ${activeSlot}`;
  const isFxParamDeviceActivity =
    deviceActivityMessage?.startsWith("Reading FX parameters") ?? false;
  const isActiveSlotFxParamActivity = deviceActivityMessage === activeSlotFxParamActivityMessage;
  const freezeBypassReadout = Boolean(
    isParamRefreshLoading || fxParamWritingKey || fxModelWritingSlot || isActiveSlotFxParamActivity,
  );
  useEffect(() => {
    if (!freezeBypassReadout) stableCcStateRef.current = ccState;
  }, [ccState, freezeBypassReadout]);
  const displayedCcState = freezeBypassReadout ? stableCcStateRef.current : ccState;
  const compatibleDevices = isEditableFxSlot(activeSlot)
    ? getAvailableDevicesForSlot(activeSlot)
    : [];
  const compatibleDeviceGroups = compatibleDevices.reduce(
    (groups, device) => {
      groups[device.category] = [...(groups[device.category] ?? []), device];
      return groups;
    },
    {} as Partial<Record<NanoFxCategory, typeof compatibleDevices>>,
  );
  const selectedCompatibleDevice = compatibleDevices.find(
    (device) =>
      device.name === selectedModelDisplay.name || device.id === selectedModelDisplay.deviceId,
  );
  const selectedCc = slotCc(activeSlot);
  const selectedEnabled = selectedCc === null ? true : Boolean(displayedCcState[selectedCc]);
  const editableActiveSlot = isEditableFxSlot(activeSlot) ? activeSlot : null;
  const canWriteSelectedParams = Boolean(canWriteParams && editableActiveSlot && onWriteFxParam);
  const canWriteSelectedSurface = isEditableFxSlot(activeSlot)
    ? canWriteSelectedParams
    : canWriteFixedBlocks;
  const activeParamRefreshLabel = activeRefreshAttempt
    ? `Reading ${unsyncedParameters.length} parameter values (attempt ${activeRefreshAttempt.attempt}/${activeRefreshAttempt.maxAttempts})`
    : `Reading ${unsyncedParameters.length} parameter values from the device`;
  const [selectedParamSyncKey, setSelectedParamSyncKey] = useState<string | null>(null);
  const [selectedParamCompletionKey, setSelectedParamCompletionKey] = useState<string | null>(null);
  const selectedParamSyncLatched =
    selectedParamSyncKey === autoRefreshKey &&
    unsyncedParameters.length > 0 &&
    !hasParamRefreshFailure;
  const activeParamReadInFlight = isParamRefreshLoading || isActiveSlotFxParamActivity;
  const selectedParamSyncActive = activeParamReadInFlight || selectedParamSyncLatched;
  const selectedParamSyncCompleting =
    selectedParamCompletionKey === autoRefreshKey ||
    (activeParamReadInFlight && hasCompleteSelectedParamValues && !hasParamRefreshFailure) ||
    (selectedParamSyncKey === autoRefreshKey &&
      hasCompleteSelectedParamValues &&
      !hasParamRefreshFailure);
  const selectedParamProgressLabel = selectedParamSyncCompleting
    ? "Parameter values synced"
    : activeParamRefreshLabel;
  const selectedParamProgressVisible =
    selectedParamSyncActive ||
    (selectedParamSyncCompleting && hasCompleteSelectedParamValues && !hasParamRefreshFailure);
  const selectedParamSurfaceReady = hasCompleteSelectedParamValues && !selectedParamProgressVisible;
  const showInlineParamRefreshProgress =
    selectedParamProgressVisible && isEditableFxSlot(activeSlot);
  const canDiscardSelectedChanges =
    (Boolean(parameterProfile && canRefreshParams && onRefreshFxParams) &&
      !selectedParamProgressVisible) ||
    Boolean(
      activeSlot === "ir-loader" &&
      canRefreshParams &&
      fixedBlockReadback?.cabIrSlot &&
      !fixedBlockReadback.cabIrParamsLoading &&
      onRefreshCabIrParams,
    );
  const panelDeviceActivityMessage =
    deviceActivityMessage &&
    !showInlineParamRefreshProgress &&
    (!isFxParamDeviceActivity || isActiveSlotFxParamActivity)
      ? deviceActivityMessage
      : null;
  const previewFxParamValue = useCallback(
    (slot: EditableFxSlotId, paramIndex: number, normalizedValue: number) => {
      if (slot !== activeSlot) return;
      const value = Number.isFinite(normalizedValue)
        ? Math.max(0, Math.min(1, normalizedValue))
        : 0;
      setLocalParamDraft((current) => {
        const values =
          current?.key === autoRefreshKey
            ? [...current.values]
            : [...(fxParamValues?.[slot] ?? [])];
        values[paramIndex] = value;
        return { key: autoRefreshKey, values };
      });
    },
    [activeSlot, autoRefreshKey, fxParamValues],
  );
  const writeFxParamValue = useCallback(
    (slot: EditableFxSlotId, paramIndex: number, normalizedValue: number) => {
      previewFxParamValue(slot, paramIndex, normalizedValue);
      return onWriteFxParam?.(slot, paramIndex, normalizedValue);
    },
    [onWriteFxParam, previewFxParamValue],
  );
  useEffect(() => {
    if (activeParamReadInFlight && unsyncedParameters.length > 0 && !hasParamRefreshFailure) {
      setSelectedParamSyncKey(autoRefreshKey);
      setSelectedParamCompletionKey(null);
    }
  }, [activeParamReadInFlight, autoRefreshKey, hasParamRefreshFailure, unsyncedParameters.length]);
  useEffect(() => {
    if (!isParamRefreshLoading) return;
    setLocalParamDraft((current) => (current?.key === autoRefreshKey ? null : current));
  }, [autoRefreshKey, isParamRefreshLoading]);
  useEffect(() => {
    if (hasParamRefreshFailure) {
      autoRefreshRequestedRef.current = null;
      setSelectedParamSyncKey(null);
      setSelectedParamCompletionKey(null);
      return;
    }

    if (unsyncedParameters.length === 0) {
      autoRefreshRequestedRef.current = null;
      setSelectedParamSyncKey((current) => {
        if (current === autoRefreshKey) {
          setSelectedParamCompletionKey(autoRefreshKey);
          return null;
        }
        return current;
      });
    }
  }, [autoRefreshKey, hasParamRefreshFailure, unsyncedParameters.length]);
  useEffect(() => {
    if (selectedParamCompletionKey !== autoRefreshKey) return;
    const timer = window.setTimeout(() => {
      setSelectedParamCompletionKey((current) => (current === autoRefreshKey ? null : current));
    }, PARAM_SYNC_COMPLETE_HOLD_MS);
    return () => window.clearTimeout(timer);
  }, [autoRefreshKey, selectedParamCompletionKey]);
  useEffect(() => {
    if (!parameterProfile) return;
    if (!isEditableFxSlot(activeSlot)) return;
    if (!canRefreshParams || !onRefreshFxParams) return;
    if (activeParamReadInFlight || selectedParamSyncLatched || hasParamRefreshFailure) return;
    if (unsyncedParameters.length === 0) return;
    if (autoRefreshRequestedRef.current === autoRefreshKey) return;
    autoRefreshRequestedRef.current = autoRefreshKey;
    void onRefreshFxParams(activeSlot);
  }, [
    activeSlot,
    autoRefreshKey,
    canRefreshParams,
    hasParamRefreshFailure,
    activeParamReadInFlight,
    onRefreshFxParams,
    parameterProfile,
    selectedParamSyncLatched,
    unsyncedParameters.length,
  ]);
  const editableToneShape = buildEditableToneShape({
    profile: parameterProfile,
    parameters: orderedParameters,
    values: selectedParamValues,
    canWrite: canWriteSelectedParams && selectedParamSurfaceReady,
    slot: editableActiveSlot,
    onWrite: writeFxParamValue,
    onPreview: previewFxParamValue,
  });
  const graphParameterOrder = new Map(
    editableToneShape?.parameterIndices.map((parameterIndex, order) => [parameterIndex, order]) ??
      [],
  );
  const displayedSyncedParameters = [...syncedParameters].sort((left, right) => {
    const leftGraphOrder = graphParameterOrder.get(left.index);
    const rightGraphOrder = graphParameterOrder.get(right.index);
    if (leftGraphOrder !== undefined && rightGraphOrder !== undefined) {
      return leftGraphOrder - rightGraphOrder;
    }
    if (leftGraphOrder !== undefined) return -1;
    if (rightGraphOrder !== undefined) return 1;
    return left.index - right.index;
  });
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
              label={
                selectedParamProgressVisible
                  ? "streaming values"
                  : hasCompleteSelectedParamValues
                    ? "synced values"
                    : hasSelectedParamValues && orderedParameters.length > 0
                      ? `${syncedParameters.length}/${orderedParameters.length} values synced`
                      : "values not synced"
              }
              tone={
                selectedParamProgressVisible || hasCompleteSelectedParamValues ? "cyan" : "muted"
              }
            />
          </div>
        </div>

        <div className="space-y-3 p-2">
          <div className="space-y-2">
            {nanoSignalChain.map((slot) => {
              const cc = slotCc(slot.id);
              const enabled = cc === null ? true : Boolean(displayedCcState[cc]);
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
                aria-label={`Toggle selected ${selectedSlot.roleLabel}`}
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
              className="flex flex-wrap items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-[1.6px]"
              style={{ color: "var(--text-secondary)" }}
            >
              Signal path
              {!isConnected ? <TransportBadge transport="usb" /> : null}
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
              label={isConnected ? "USB control" : "offline"}
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
                selectedParamProgressVisible
                  ? "streaming values"
                  : hasCompleteSelectedParamValues
                    ? `${syncedParameters.length} synced values`
                    : hasSelectedParamValues && orderedParameters.length > 0
                      ? `${syncedParameters.length}/${orderedParameters.length} values synced`
                      : "values not synced"
              }
              tone={
                selectedParamProgressVisible || hasCompleteSelectedParamValues ? "cyan" : "muted"
              }
            />
          </div>
        </div>

        <div className="mt-4">
          <SignalPathOverview
            ccState={displayedCcState}
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
                {selectedParamProgressVisible ? (
                  <EvidencePill label="streaming values" tone="cyan" />
                ) : hasCompleteSelectedParamValues ? (
                  <EvidencePill label={`${syncedParameters.length} synced values`} tone="cyan" />
                ) : hasSelectedParamValues && orderedParameters.length > 0 ? (
                  <EvidencePill
                    label={`${syncedParameters.length}/${orderedParameters.length} values synced`}
                    tone="muted"
                  />
                ) : null}
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                disabled={!canDiscardSelectedChanges}
                onClick={() => {
                  if (parameterProfile) {
                    void onRefreshFxParams?.(activeSlot);
                    return;
                  }
                  if (activeSlot === "ir-loader") {
                    void onRefreshCabIrParams?.();
                  }
                }}
                className="inline-flex h-10 items-center gap-2 rounded-xl border px-4 text-[11px] font-extrabold uppercase tracking-[1px] disabled:cursor-default disabled:opacity-55"
                style={{
                  color: canDiscardSelectedChanges
                    ? "var(--color-amber-accent)"
                    : "var(--text-secondary)",
                  borderColor: canDiscardSelectedChanges
                    ? "rgba(212,160,23,0.32)"
                    : "var(--panel-border)",
                  background: canDiscardSelectedChanges
                    ? "rgba(212,160,23,0.07)"
                    : "var(--surface-2)",
                }}
                title="Discard local edits by re-reading values from the device"
                aria-label={`Discard changes for ${selectedSlot.roleLabel}`}
              >
                Discard changes
              </button>
              {parameterProfile ? (
                <button
                  type="button"
                  disabled={!canRefreshParams || selectedParamProgressVisible || !onRefreshFxParams}
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
                  {selectedParamProgressVisible ? "Refreshing" : "Refresh values"}
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
              className="grid items-end gap-3 border-b px-4 py-3 md:grid-cols-[minmax(8rem,0.38fr)_minmax(0,1fr)_auto]"
              style={{ borderColor: "var(--panel-border)", background: "var(--surface-2)" }}
            >
              <div className="min-w-0">
                <div
                  className="text-[9px] font-extrabold uppercase tracking-[1.1px]"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Category
                </div>
                <div
                  className="mt-1 flex h-8 min-w-0 items-center gap-1.5 text-[12px] font-extrabold"
                  style={{
                    color: "var(--text)",
                  }}
                >
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{
                      background:
                        CATEGORY_COLORS[selectedCompatibleDevice?.category ?? "utility"]?.bg ??
                        "var(--text-secondary)",
                    }}
                    aria-hidden="true"
                  />
                  <span className="truncate">
                    {selectedCompatibleDevice
                      ? categoryLabels[selectedCompatibleDevice.category]
                      : selectedModelDisplay.category}
                  </span>
                </div>
              </div>
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
                  {(
                    Object.entries(compatibleDeviceGroups) as [
                      NanoFxCategory,
                      typeof compatibleDevices,
                    ][]
                  ).map(([category, devices]) => (
                    <optgroup key={category} label={categoryLabels[category]}>
                      {devices.map((device) => (
                        <option
                          key={device.id}
                          value={device.id}
                          disabled={!getProtocolFxModelByDeviceId(device.id)}
                        >
                          {device.name}
                        </option>
                      ))}
                    </optgroup>
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
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="text-[13px] font-semibold" style={{ color: "var(--text)" }}>
                {parameterProfile
                  ? selectedParamProgressVisible
                    ? "Reading parameter values from the device."
                    : hasSelectedParamValues
                      ? canWriteSelectedParams
                        ? "Values are synced from the device. Slider changes write live device state; save separately to persist."
                        : "Values are synced from the device. Connect Bluetooth state to write parameter changes."
                      : hasParamRefreshFailure
                        ? "Could not sync parameter values after retrying. Refresh values again or reconnect Bluetooth."
                        : "Parameter map is ready; values sync after preset changes or when refreshed."
                  : !isEditableFxSlot(activeSlot)
                    ? "Fixed block values come from current device state. Only confirmed fields are shown."
                    : selectedModelDisplay.rawId
                      ? `No parameter metadata mapped for model id ${selectedModelDisplay.rawId}.`
                      : "Select a decoded FX model to inspect its parameters."}
              </div>
              <div className="flex shrink-0 flex-wrap gap-1.5">
                <TransportStatusChip label="USB control" active={isConnected} />
                <TransportStatusChip label="Bluetooth write" active={canWriteSelectedSurface} />
              </div>
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
                assetNames={fixedBlockAssetNames}
                gateReductionLastSentValue={gateReductionLastSentValue}
                canWriteFixedBlocks={canWriteFixedBlocks}
                fixedBlockWritingLabel={fixedBlockWritingLabel}
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
            {isEditableFxSlot(activeSlot) ? (
              <div
                data-testid="tone-studio-device-activity-lane"
                className="mt-3 h-[24px] overflow-hidden rounded-lg transition-opacity"
                style={{
                  background: panelDeviceActivityMessage ? "var(--surface-2)" : "transparent",
                  opacity: panelDeviceActivityMessage ? 1 : 0,
                }}
              >
                {panelDeviceActivityMessage ? (
                  <DeviceSyncProgress label={panelDeviceActivityMessage} />
                ) : null}
              </div>
            ) : null}

            {editableToneShape && selectedParamSurfaceReady ? (
              <div className="mt-4">
                <ToneShapeGraph
                  title={editableToneShape.title}
                  source={editableToneShape.source}
                  points={editableToneShape.points}
                  handles={editableToneShape.handles}
                  previewPoints={editableToneShape.previewPoints}
                />
              </div>
            ) : null}

            {selectedParamSurfaceReady ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {displayedSyncedParameters.map((parameter) => {
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
                  const writeDisabled =
                    selectedParamProgressVisible ||
                    !canWriteSelectedParams ||
                    !hasValue ||
                    isWriting;
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
                                void writeFxParamValue(
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
                                  void writeFxParamValue(
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
            {isEditableFxSlot(activeSlot) &&
            (unsyncedParameters.length > 0 || selectedParamSyncCompleting) ? (
              <details
                open={
                  selectedParamProgressVisible ||
                  (hasParamRefreshFailure && !hasCompleteSelectedParamValues)
                }
                className="mt-4 rounded-xl border p-3"
                style={{
                  background: "var(--surface)",
                  borderColor: selectedParamProgressVisible
                    ? "rgba(0,153,204,0.32)"
                    : hasParamRefreshFailure
                      ? "rgba(220,38,38,0.28)"
                      : "var(--panel-border-light)",
                }}
              >
                <summary
                  className={
                    selectedParamProgressVisible
                      ? "cursor-default list-none text-[11px] font-extrabold uppercase tracking-[0.9px]"
                      : "cursor-pointer text-[11px] font-extrabold uppercase tracking-[0.9px]"
                  }
                  style={{
                    color: selectedParamProgressVisible
                      ? "var(--color-cyan-accent)"
                      : "var(--text-secondary)",
                  }}
                >
                  {selectedParamSyncCompleting
                    ? "Parameter values synced"
                    : `${unsyncedParameters.length} parameter${unsyncedParameters.length === 1 ? "" : "s"} ${
                        selectedParamProgressVisible
                          ? "syncing from device"
                          : hasParamRefreshFailure && !hasSelectedParamValues
                            ? "could not sync"
                            : "waiting for refresh"
                      }`}
                </summary>
                {selectedParamProgressVisible ? (
                  <div
                    className="mt-3 h-[24px] overflow-hidden rounded-lg"
                    style={{ background: "var(--surface-2)" }}
                  >
                    <DeviceSyncProgress
                      label={selectedParamProgressLabel}
                      complete={selectedParamSyncCompleting}
                    />
                  </div>
                ) : (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {unsyncedParameters.map((parameter) => (
                      <span
                        key={parameter.id}
                        className="rounded-full border px-2 py-1 text-[10px] font-bold"
                        style={{
                          color: "var(--text-secondary)",
                          borderColor: "var(--panel-border)",
                          background: "var(--panel-bg)",
                        }}
                      >
                        #{parameter.index + 1} {parameter.label}
                      </span>
                    ))}
                  </div>
                )}
              </details>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
