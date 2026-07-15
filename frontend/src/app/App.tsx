/**
 * Composition root — lifts all shared MIDI state and renders the full control surface.
 *
 * @see docs/specs/200-frontend-control-surface/spec.md [FR-1]
 * @see docs/specs/200-frontend-control-surface/design.md [DES-FRONT-APP]
 */
import { useState, useCallback, useEffect, useMemo, useRef, type ReactNode } from "react";
import {
  ArrowsOutSimpleIcon,
  CaretDoubleLeftIcon,
  CaretDoubleRightIcon,
  FloppyDiskIcon,
  WarningCircleIcon,
  XIcon,
} from "@phosphor-icons/react";
import { ThemeProvider } from "../shared/hooks/useTheme";
import { LogProvider, useLogs, type LogEntry } from "../shared/hooks/useLogs";
import { MidiMonitor } from "../features/midi/components/MidiMonitor";
import type { UsbInboundSync } from "../features/midi/components/DeviceSyncStatus";
import {
  DeviceStatusDock,
  type ActivityTone,
  type BleObserverState,
  type HardwareActivityEntry,
} from "../features/midi/components/DeviceStatusDock";
import { PedalWorkbench, SignalPathOverview } from "../features/midi/components/PedalWorkbench";
import { PresetRail } from "../features/midi/components/PresetRail";
import type { SaveMode } from "../features/midi/components/ActivePresetHeader";
import {
  LiveUtilitiesPanel,
  type DirtyPresetSwitchMode,
} from "../features/midi/components/LiveUtilitiesPanel";
import { QuickPresetAssignments } from "../features/midi/components/QuickPresetAssignments";
import { ProtocolLab } from "../features/midi/components/ProtocolLab";
import { AboutPanel } from "../features/midi/components/AboutPanel";
import { HelpPanel } from "../features/midi/components/HelpPanel";
import { useLatestRelease } from "../features/midi/hooks/useLatestRelease";
import { useUpdateNudge } from "../features/midi/hooks/useUpdateNudge";
import { StatusBar } from "../features/midi/components/StatusBar";
import { SupportNudge } from "../features/midi/components/SupportNudge";
import { UpdateNudge } from "../features/midi/components/UpdateNudge";
import { useSupportNudge } from "../features/midi/hooks/useSupportNudge";
import { LogPanel } from "../shared/ui/components/LogPanel";
import { ExperimentalBadge } from "../shared/ui/components/ExperimentalBadge";
import { EXPERIMENTAL_FEATURES } from "../shared/config/featureFlags";

import { useMidiConnection } from "../features/midi/hooks/useMidiConnection";
import { usePreset } from "../features/midi/hooks/usePreset";
import { useExpression } from "../features/midi/hooks/useExpression";
import { useNanoHardwareState } from "../features/midi/hooks/useNanoHardwareState";

import {
  CC,
  DEFAULT_CC_STATE,
  DEFAULT_FOOTSWITCH_STATE,
  EFFECT_LABELS,
  FOOTSWITCH_ROTARY_MAX,
  FX_SLOT_CC,
  MIDI_CC,
} from "../features/midi/constants";
import {
  DEFAULT_FX_SLOT_DEVICE_ASSIGNMENTS,
  EDITABLE_FX_SLOT_IDS,
  isEditableFxSlot,
  type EditableFxSlotId,
  type FxSlotDeviceAssignments,
  type NanoFxDeviceId,
  type NanoFxSlotId,
} from "../features/midi/fxModel";
import {
  EDITABLE_FX_SLOT_ROLE_KEYS,
  buildFxSlotModelStates,
  getProtocolFxModelByDeviceId,
  type DecodedFxModelIds,
} from "../features/midi/fxProtocol";
import { getFxParamProfile, orderedFxParams } from "../features/midi/fxParams";
import { readLastOpenedPreset, rememberLastOpenedPreset } from "../features/midi/lastOpenedPreset";
import type {
  DecodedStateDump,
  ObservedFootswitchAssignments,
  ObservedHardwareId,
} from "../features/midi/protocolLabDecoder";
import { DeviceStateReadout } from "../features/midi/components/DeviceStateReadout";
import {
  DIRTY_PRESET_SWITCH_MODE_STORAGE_KEY,
  FOOTSWITCH_STATE_STORAGE_KEY,
  SAVE_MODE_STORAGE_KEY,
} from "../features/midi/settingsKeys";
import type {
  CCState,
  FootswitchId,
  FootswitchLongPressAction,
  MidiLogEntry,
  NanoCortexFootswitchState,
  QuickPresetSlot,
} from "../features/midi/types";
import {
  listPorts,
  bleScan,
  blePing,
  traceMarker,
  getAppVersion,
  getNanoState,
  requestStateDump,
  requestCabIrParams,
  setAmpKnob,
  setCabIrMicPosition,
  setCabIrParam,
  setCabIrSlot,
  setCaptureVolume,
  setCaptureSlot,
  setFxParam,
  setFxModel,
  setFootswitchAssignments,
  acknowledgePresetChange,
  setGateEnabled,
  setGateReduction,
  saveActivePreset,
  requestMetadata,
  requestFxParams,
  type CabIrParamKey,
  type CabIrParamRefresh,
  type NanoState,
} from "../shared/ipc/commands";
import { buildDiagnosticBundle } from "../features/midi/diagnosticBundle";
import {
  describeDevicePresetMetadata,
  loadPresetNames,
  mergeDevicePresetNames,
  metadataStatusLabel,
  savePresetNames,
  TOTAL_PRESETS,
  type PresetMetadataSource,
  usePresetNames,
} from "../features/midi/presetNames";
import {
  canUseUsbCommandPath,
  isBluetoothDeviceName,
} from "../features/midi/transportCapabilities";
import type { AmpKnob } from "../features/midi/bleCommandEncoder";
import { onDisconnected, onMidiMessage } from "../shared/ipc/events";
import { formatError } from "../shared/ipc/errors";

interface TraceSession {
  label: string | null;
  activeLabel: string | null;
  startedAt: number | null;
  stoppedAt: number | null;
  midiCount: number;
  latestMidiBytes: number[] | null;
}

type MainSurface = "live" | "advanced" | "help" | "about";
type AdvancedSurface = "diagnostics" | "capture";
type FootswitchRotarySource = "live" | "memory" | "last seen" | "local";
type DevicePanelKnob = AmpKnob | "amount";
type FxParamValueSnapshot = { modelKey: string; values: number[] };
type FxParamValuesBySlot = Partial<Record<EditableFxSlotId, FxParamValueSnapshot>>;
type FxParamRefreshAttempt = { slot: NanoFxSlotId; attempt: number; maxAttempts: number } | null;
type SaveTrigger = "manual" | "auto";
type AssetSlotWriting = "capture" | "cab-ir";
type FootswitchRotaryPreview = Record<
  FootswitchId,
  { value: number; source: FootswitchRotarySource; timestampMs: number }
>;

interface DeviceAssetNames {
  capture: string[];
  ir: string[];
}

interface PresetMetadataStatus {
  loaded: number;
  expected: number;
  usable: number;
  complete: boolean;
  source: PresetMetadataSource;
}

const LIVE_PRESET_RAIL_COLLAPSED_KEY = "nano-live-preset-rail-collapsed";
const BPM_MIN = 40;
const BPM_MAX = 240;
const TEMPO_BURST_TAPS = 4;
const AUTO_FX_PARAM_REFRESH_SLOTS: EditableFxSlotId[] = [
  "pre-1",
  "pre-2",
  "post-1",
  "post-2",
  "post-3",
];
const AUTO_FX_PARAM_REFRESH_DELAY_MS = 180;
const AUTO_FX_PARAM_REFRESH_MAX_ATTEMPTS = 3;
const FX_PARAM_WRITE_DEBOUNCE_MS = 120;
const AUTO_SAVE_DEBOUNCE_MS = 1200;

function formatDiagnosticMidiBytes(bytes: number[]) {
  return bytes.map((byte) => byte.toString(16).padStart(2, "0").toUpperCase()).join(" ");
}

function midiLogToDiagnosticEntry(entry: MidiLogEntry): LogEntry {
  const channel = entry.channel > 0 ? `ch=${entry.channel}` : "sys";
  const value = entry.value === undefined ? "" : ` value=${entry.value}`;
  return {
    ts: entry.ts,
    level: "info",
    message:
      `[usb-midi] ${entry.kind.toUpperCase()} ${entry.label}; ` +
      `${channel} number=${entry.number}${value} data=${formatDiagnosticMidiBytes(entry.bytes)}`,
  };
}

function clampFootswitchRotary(footswitch: FootswitchId, value: number) {
  const max = footswitch === "I" ? 25 : FOOTSWITCH_ROTARY_MAX;
  return Math.max(0, Math.min(max, Math.round(value)));
}

function assetNameForRotarySlot(
  kind: "Capture" | "IR",
  slot: number | null | undefined,
  names: string[],
  fallbackName: string | null | undefined,
  options: { preferFallbackForUnknown?: boolean } = {},
) {
  if (slot === null || slot === undefined) return fallbackName?.trim() || "--";
  if (slot <= 0) return "Bypass";

  const metadataName = names[slot - 1]?.trim();
  if (metadataName) return metadataName;
  if (options.preferFallbackForUnknown && fallbackName?.trim()) return fallbackName.trim();
  return `${kind} ${slot}`;
}

function inferRotarySlotFromName(name: string | null | undefined, names: string[]) {
  const normalized = name?.trim().toLowerCase();
  if (!normalized) return null;
  const index = names.findIndex((candidate) => {
    const assetName = candidate.trim().toLowerCase();
    return normalized === assetName || normalized.startsWith(`${assetName}/`);
  });
  return index >= 0 ? index + 1 : null;
}

function ConfirmActionDialog({
  title,
  message,
  detail,
  confirmLabel,
  icon,
  busy = false,
  tone = "warning",
  onCancel,
  onConfirm,
}: {
  title: string;
  message: string;
  detail?: string;
  confirmLabel: string;
  icon: ReactNode;
  busy?: boolean;
  tone?: "warning" | "danger";
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const accent = tone === "danger" ? "var(--color-red-accent)" : "var(--color-gold)";
  const accentBg = tone === "danger" ? "rgba(255,64,96,0.12)" : "rgba(217,153,0,0.12)";
  const accentBorder = tone === "danger" ? "rgba(255,64,96,0.38)" : "rgba(217,153,0,0.45)";

  return (
    <div
      className="fixed inset-0 z-[90] grid place-items-center bg-slate-950/42 px-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-action-title"
        className="w-full max-w-[460px] rounded-2xl border p-4 shadow-2xl"
        style={{
          background: "var(--panel-bg)",
          borderColor: "var(--panel-border-light)",
          boxShadow: "0 24px 80px rgba(15,23,42,0.42)",
        }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border"
            style={{ background: accentBg, borderColor: accentBorder, color: accent }}
            aria-hidden="true"
          >
            {icon}
          </div>
          <div className="min-w-0 flex-1">
            <h2
              id="confirm-action-title"
              className="text-[18px] font-extrabold"
              style={{ color: "var(--text)" }}
            >
              {title}
            </h2>
            <p
              className="mt-2 text-[13px] font-semibold leading-5"
              style={{ color: "var(--text-secondary)" }}
            >
              {message}
            </p>
            {detail && (
              <p
                className="mt-2 text-[12px] font-semibold leading-5"
                style={{ color: "var(--text-muted)" }}
              >
                {detail}
              </p>
            )}
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            title="Cancel"
            aria-label="Cancel"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border disabled:opacity-45"
            style={{
              background: "var(--surface)",
              borderColor: "var(--panel-border-light)",
              color: "var(--text-secondary)",
            }}
          >
            <XIcon size={15} weight="bold" aria-hidden="true" />
          </button>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="h-10 rounded-lg border text-[11px] font-extrabold uppercase tracking-[0.8px] disabled:opacity-45"
            style={{
              background: "var(--surface-2)",
              borderColor: "var(--panel-border-light)",
              color: "var(--text-secondary)",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className="h-10 rounded-lg border text-[11px] font-extrabold uppercase tracking-[0.8px] disabled:opacity-45"
            style={{ background: accentBg, borderColor: accentBorder, color: accent }}
          >
            {busy ? "Working" : confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}

function nanoStateFxModels(nano: NanoState): DecodedFxModelIds | null {
  const models: DecodedFxModelIds = {};
  for (const [slotId, roleKeys] of Object.entries(EDITABLE_FX_SLOT_ROLE_KEYS) as [
    EditableFxSlotId,
    string[],
  ][]) {
    const slot = roleKeys.map((key) => nano.slots[key]).find(Boolean);
    if (slot?.modelId) {
      models[slotId] = {
        rawId: slot.modelId,
        numericId: slot.modelIdNumeric,
      };
    }
  }
  return Object.keys(models).length > 0 ? models : null;
}

function nanoStateFxBypass(nano: NanoState): number[] | null {
  const values = AUTO_FX_PARAM_REFRESH_SLOTS.map((slotId) => {
    const slot = EDITABLE_FX_SLOT_ROLE_KEYS[slotId].map((key) => nano.slots[key]).find(Boolean);
    if (!slot) return null;
    if (slot.active !== null) return slot.active ? 0 : 1;
    if (slot.bypassed !== null) return slot.bypassed ? 1 : 0;
    return null;
  });
  return values.every((value) => value !== null) ? (values as number[]) : null;
}

function fxModelSignature(models: DecodedFxModelIds | null | undefined) {
  const values = AUTO_FX_PARAM_REFRESH_SLOTS.map((slotId) => models?.[slotId]?.rawId ?? "");
  return values.some(Boolean) ? values.join("|") : "";
}

function mergeFxModels(
  latest: DecodedFxModelIds | null,
  fallback: DecodedFxModelIds | null,
): DecodedFxModelIds | null {
  if (!latest || Object.keys(latest).length === 0) return fallback;
  if (!fallback || Object.keys(fallback).length === 0) return latest;
  return { ...fallback, ...latest };
}

function nanoStateToDecodedStateDump(nano: NanoState): DecodedStateDump | null {
  const fxModels = nanoStateFxModels(nano);
  const fxBypass = nanoStateFxBypass(nano);
  const hasDecodedState =
    nano.ampGain !== null ||
    nano.ampLevel !== null ||
    nano.ampBass !== null ||
    nano.ampMid !== null ||
    nano.ampTreble !== null ||
    nano.captureAssignment !== null ||
    nano.irAssignment !== null ||
    nano.gateOn !== null ||
    nano.gateReduction !== null ||
    nano.cabIrOn !== null ||
    nano.footswitchAssignments !== null ||
    fxModels !== null ||
    fxBypass !== null;

  if (!hasDecodedState) return null;

  return {
    gain: nano.ampGain,
    level: nano.ampLevel,
    bass: nano.ampBass,
    mid: nano.ampMid,
    treble: nano.ampTreble,
    amount: null,
    captureSlot: nano.captureSlot,
    captureVolume: nano.captureVolume,
    gateOn: nano.gateOn,
    gateReduction: nano.gateReduction,
    cabIrOn: nano.cabIrOn,
    firmware: null,
    captureName: nano.captureAssignment,
    irName: nano.irAssignment,
    bypass: fxBypass,
    fxModels,
    footswitchAssignments: nano.footswitchAssignments,
    payloadHex: "",
    timestampMs: Date.now(),
    confidence: "provisional",
  };
}

function mergeStateDumps(
  latest: DecodedStateDump | null,
  fallback: DecodedStateDump | null,
): DecodedStateDump | null {
  if (!latest) return fallback;
  if (!fallback) return latest;

  return {
    ...latest,
    gain: latest.gain ?? fallback.gain,
    level: latest.level ?? fallback.level,
    bass: latest.bass ?? fallback.bass,
    mid: latest.mid ?? fallback.mid,
    treble: latest.treble ?? fallback.treble,
    amount: latest.amount ?? fallback.amount,
    captureSlot: latest.captureSlot ?? fallback.captureSlot,
    captureVolume: latest.captureVolume ?? fallback.captureVolume,
    gateOn: latest.gateOn ?? fallback.gateOn,
    gateReduction: latest.gateReduction ?? fallback.gateReduction,
    cabIrOn: latest.cabIrOn ?? fallback.cabIrOn,
    firmware: latest.firmware ?? fallback.firmware,
    captureName: latest.captureName ?? fallback.captureName,
    irName: latest.irName ?? fallback.irName,
    bypass: latest.bypass ?? fallback.bypass,
    fxModels: mergeFxModels(latest.fxModels, fallback.fxModels),
    footswitchAssignments: latest.footswitchAssignments ?? fallback.footswitchAssignments,
    payloadHex: latest.payloadHex || fallback.payloadHex,
  };
}

function ampKnobSignature(dump: DecodedStateDump | null): string | null {
  if (!dump) return null;
  return [dump.gain, dump.level, dump.bass, dump.mid, dump.treble, dump.amount]
    .map((value) => (value === null ? "-" : String(value)))
    .join("/");
}

function FooterMetaItem({
  children,
  href,
  tone = "muted",
}: {
  children: ReactNode;
  href?: string;
  tone?: "muted" | "accent";
}) {
  const style = {
    color: tone === "accent" ? "var(--color-cyan-accent)" : "var(--text-secondary)",
  };

  const className = "inline-flex items-center text-[10px] font-semibold uppercase tracking-[1.1px]";

  if (href) {
    return (
      <a
        className={`${className} hover:underline`}
        href={href}
        target="_blank"
        rel="noreferrer"
        style={style}
      >
        {children}
      </a>
    );
  }

  return (
    <span className={className} style={style}>
      {children}
    </span>
  );
}

function ProjectAttributionFooter() {
  return (
    <footer className="mt-2 short:mt-0.5 px-3 pb-1 short:pb-0.5">
      <div
        className="mx-auto flex max-w-fit flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center"
        style={{ color: "var(--text-secondary)" }}
      >
        <FooterMetaItem>Unofficial desktop app</FooterMetaItem>
        <span className="text-[10px]" aria-hidden="true">
          /
        </span>
        <FooterMetaItem tone="accent" href="https://agenticflowx.github.io/">
          Built with AgenticFlowX
        </FooterMetaItem>
        <span className="text-[10px]" aria-hidden="true">
          /
        </span>
        <FooterMetaItem>Not affiliated with Neural DSP</FooterMetaItem>
        <span className="text-[10px]" aria-hidden="true">
          /
        </span>
        <FooterMetaItem tone="accent" href="https://ko-fi.com/rixrix">
          Donate
        </FooterMetaItem>
        <span className="text-[10px]" aria-hidden="true">
          /
        </span>
        <FooterMetaItem>Apache-2.0</FooterMetaItem>
        <span className="text-[10px]" aria-hidden="true">
          /
        </span>
        <FooterMetaItem tone="accent" href="https://github.com/rixrix/deskop-nano-cortex">
          GitHub
        </FooterMetaItem>
      </div>
    </footer>
  );
}

function presetLabel(preset: number) {
  return `${String.fromCharCode(65 + Math.floor(preset / 8))}${(preset % 8) + 1}`;
}

function clampPreset(value: unknown, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(63, Math.round(parsed)));
}

function isLongPressAction(value: unknown): value is FootswitchLongPressAction {
  return value === "tap-tempo" || value === "tuner";
}

function loadFootswitchState(): NanoCortexFootswitchState {
  const fallback: NanoCortexFootswitchState = {
    presetOperationMode: DEFAULT_FOOTSWITCH_STATE.presetOperationMode,
    footswitchI: { ...DEFAULT_FOOTSWITCH_STATE.footswitchI },
    footswitchII: { ...DEFAULT_FOOTSWITCH_STATE.footswitchII },
  };

  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(FOOTSWITCH_STATE_STORAGE_KEY);
    if (!raw) return fallback;
    const saved = JSON.parse(raw) as Partial<NanoCortexFootswitchState>;
    const savedI = (saved.footswitchI ?? {}) as Partial<NanoCortexFootswitchState["footswitchI"]>;
    const savedII = (saved.footswitchII ?? {}) as Partial<
      NanoCortexFootswitchState["footswitchII"]
    >;
    return {
      presetOperationMode: saved.presetOperationMode === "2-preset" ? "2-preset" : "4-preset",
      footswitchI: {
        ...fallback.footswitchI,
        currentAssignedA: clampPreset(
          savedI.currentAssignedA,
          fallback.footswitchI.currentAssignedA,
        ),
        currentAssignedB: clampPreset(
          savedI.currentAssignedB,
          fallback.footswitchI.currentAssignedB,
        ),
        activeSubslot: savedI.activeSubslot === "B" ? "B" : "A",
        longPressAction: isLongPressAction(savedI.longPressAction)
          ? savedI.longPressAction
          : fallback.footswitchI.longPressAction,
      },
      footswitchII: {
        ...fallback.footswitchII,
        currentAssignedA: clampPreset(
          savedII.currentAssignedA,
          fallback.footswitchII.currentAssignedA,
        ),
        currentAssignedB: clampPreset(
          savedII.currentAssignedB,
          fallback.footswitchII.currentAssignedB,
        ),
        activeSubslot: savedII.activeSubslot === "B" ? "B" : "A",
        longPressAction: isLongPressAction(savedII.longPressAction)
          ? savedII.longPressAction
          : fallback.footswitchII.longPressAction,
        globalBypassEnabled: Boolean(savedII.globalBypassEnabled),
      },
    };
  } catch {
    return fallback;
  }
}

function saveFootswitchState(state: NanoCortexFootswitchState) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(FOOTSWITCH_STATE_STORAGE_KEY, JSON.stringify(state));
}

function activityToneFor(message: string): ActivityTone {
  const normalized = message.toLowerCase();
  if (
    normalized.includes("error") ||
    normalized.includes("failed") ||
    normalized.includes("disconnected")
  )
    return "error";
  if (
    normalized.includes("usb") ||
    normalized.includes("midi") ||
    normalized.includes("pc ") ||
    normalized.includes("cc ")
  )
    return "usb";
  if (normalized.includes("ble") || normalized.includes("bluetooth")) return "ble";
  if (
    normalized.includes("footswitch") ||
    normalized.includes("trace") ||
    normalized.includes("assigned")
  )
    return "hardware";
  return "system";
}

function describeIncomingCc(cc: number, value: number): Pick<UsbInboundSync, "summary" | "detail"> {
  if (cc === MIDI_CC.EXPRESSION) {
    return { summary: `Expression ${value}`, detail: `CC ${cc} value ${value}` };
  }
  if (cc === MIDI_CC.TAP_TEMPO) {
    return { summary: "Tap tempo", detail: `CC ${cc} trigger ${value}` };
  }
  if (cc === MIDI_CC.TUNER) {
    return { summary: `Tuner ${value >= 64 ? "on" : "off"}`, detail: `CC ${cc} ${value}` };
  }

  const fxIndex = FX_SLOT_CC.indexOf(cc);
  if (fxIndex >= 0) {
    return {
      summary: `FX Slot ${fxIndex + 1} ${value >= 64 ? "on" : "off"}`,
      detail: `CC ${cc} ${value}`,
    };
  }

  const knownLabel = EFFECT_LABELS[cc] ?? (cc === CC.CAB ? "IR Loader" : null);
  if (knownLabel) {
    return { summary: `${knownLabel} ${value >= 64 ? "on" : "off"}`, detail: `CC ${cc} ${value}` };
  }

  return { summary: `CC ${cc} = ${value}`, detail: `unmapped CC ${cc}` };
}

function buildUsbPcSync(preset: number, channel: number): UsbInboundSync {
  return {
    kind: "pc",
    summary: `Sent ${presetLabel(preset)}`,
    detail: `Program Change ${preset}`,
    channel,
    bytes: [0xc0 | (channel - 1), preset],
    timestampMs: Date.now(),
  };
}

function buildUsbCcSync(
  cc: number,
  value: number,
  channel: number,
  summaryPrefix = "Sent",
): UsbInboundSync {
  const described = describeIncomingCc(cc, value);
  return {
    kind: "cc",
    summary: `${summaryPrefix} ${described.summary}`,
    detail: described.detail,
    channel,
    bytes: [0xb0 | (channel - 1), cc, value],
    timestampMs: Date.now(),
  };
}

function describeRawMidi(bytes: number[]): Pick<UsbInboundSync, "summary" | "detail" | "channel"> {
  const status = bytes[0] ?? 0;
  if (status === 0xf0) {
    return { summary: "USB SysEx", detail: `${bytes.length} byte SysEx`, channel: 0 };
  }
  if (status >= 0xf8) {
    return {
      summary: "USB realtime",
      detail: `status 0x${status.toString(16).toUpperCase()}`,
      channel: 0,
    };
  }
  return {
    summary: "USB raw input",
    detail: `${bytes.length} bytes, status 0x${status.toString(16).toUpperCase().padStart(2, "0")}`,
    channel: (status & 0x0f) + 1,
  };
}

function applyFootswitchPressModel(
  previous: NanoCortexFootswitchState,
  footswitch: FootswitchId,
): { nextState: NanoCortexFootswitchState; selectedPreset: number | null; status: string } {
  if (footswitch === "I") {
    const nextSubslot = previous.footswitchI.activeSubslot === "A" ? "B" : "A";
    const selectedPreset =
      nextSubslot === "A"
        ? previous.footswitchI.currentAssignedA
        : previous.footswitchI.currentAssignedB;
    return {
      nextState: {
        ...previous,
        footswitchI: { ...previous.footswitchI, activeSubslot: nextSubslot },
      },
      selectedPreset,
      status: `Footswitch I -> I-${nextSubslot}`,
    };
  }

  if (previous.presetOperationMode === "2-preset") {
    const enabled = !previous.footswitchII.globalBypassEnabled;
    return {
      nextState: {
        ...previous,
        footswitchII: {
          ...previous.footswitchII,
          role: "global-bypass",
          globalBypassEnabled: enabled,
        },
      },
      selectedPreset: null,
      status: `Footswitch II -> Global Bypass ${enabled ? "on" : "off"}`,
    };
  }

  const nextSubslot = previous.footswitchII.activeSubslot === "A" ? "B" : "A";
  const selectedPreset =
    nextSubslot === "A"
      ? previous.footswitchII.currentAssignedA
      : previous.footswitchII.currentAssignedB;
  return {
    nextState: {
      ...previous,
      footswitchII: { ...previous.footswitchII, role: "preset-toggle", activeSubslot: nextSubslot },
    },
    selectedPreset,
    status: `Footswitch II -> II-${nextSubslot}`,
  };
}

function applyQuickPresetSlotSelection(
  previous: NanoCortexFootswitchState,
  slot: QuickPresetSlot,
): { nextState: NanoCortexFootswitchState; selectedPreset: number; status: string } {
  if (slot === "IA" || slot === "IB") {
    const activeSubslot = slot === "IA" ? "A" : "B";
    const selectedPreset =
      activeSubslot === "A"
        ? previous.footswitchI.currentAssignedA
        : previous.footswitchI.currentAssignedB;

    return {
      nextState: {
        ...previous,
        footswitchI: { ...previous.footswitchI, activeSubslot },
      },
      selectedPreset,
      status: `Footswitch I-${activeSubslot} -> ${presetLabel(selectedPreset)}`,
    };
  }

  const activeSubslot = slot === "IIA" ? "A" : "B";
  const selectedPreset =
    activeSubslot === "A"
      ? previous.footswitchII.currentAssignedA
      : previous.footswitchII.currentAssignedB;

  return {
    nextState: {
      ...previous,
      presetOperationMode: "4-preset",
      footswitchII: {
        ...previous.footswitchII,
        role: "preset-toggle",
        activeSubslot,
        globalBypassEnabled: false,
      },
    },
    selectedPreset,
    status: `Footswitch II-${activeSubslot} -> ${presetLabel(selectedPreset)}`,
  };
}

function assignQuickPresetSlot(
  previous: NanoCortexFootswitchState,
  slot: QuickPresetSlot,
  preset: number,
): NanoCortexFootswitchState {
  const safePreset = Math.max(0, Math.min(63, Math.round(preset)));
  if (slot === "IA") {
    return {
      ...previous,
      footswitchI: { ...previous.footswitchI, currentAssignedA: safePreset },
    };
  }
  if (slot === "IB") {
    return {
      ...previous,
      footswitchI: { ...previous.footswitchI, currentAssignedB: safePreset },
    };
  }
  if (slot === "IIA") {
    return {
      ...previous,
      footswitchII: { ...previous.footswitchII, currentAssignedA: safePreset },
    };
  }
  return {
    ...previous,
    footswitchII: { ...previous.footswitchII, currentAssignedB: safePreset },
  };
}

function footswitchAssignmentsPayload(state: NanoCortexFootswitchState) {
  return {
    ia: state.footswitchI.currentAssignedA,
    ib: state.footswitchI.currentAssignedB,
    iia: state.footswitchII.currentAssignedA,
    iib: state.footswitchII.currentAssignedB,
  };
}

function footswitchAssignmentsEqual(
  left?: ObservedFootswitchAssignments | null,
  right?: ObservedFootswitchAssignments | null,
) {
  return (
    Boolean(left && right) &&
    left!.ia === right!.ia &&
    left!.ib === right!.ib &&
    left!.iia === right!.iia &&
    left!.iib === right!.iib
  );
}

function quickPresetSlotLabel(slot: QuickPresetSlot) {
  return slot.startsWith("II") ? `II-${slot.slice(2)}` : `I-${slot.slice(1)}`;
}

function resolveQuickPresetSlot(
  state: NanoCortexFootswitchState,
  preset: number,
): QuickPresetSlot | null {
  if (state.footswitchI.currentAssignedA === preset) return "IA";
  if (state.footswitchI.currentAssignedB === preset) return "IB";
  if (state.presetOperationMode !== "2-preset") {
    if (state.footswitchII.currentAssignedA === preset) return "IIA";
    if (state.footswitchII.currentAssignedB === preset) return "IIB";
  }
  return null;
}

function applyBleFootswitchAssignments(
  previous: NanoCortexFootswitchState,
  assignments: ObservedFootswitchAssignments | undefined,
): NanoCortexFootswitchState {
  if (!assignments) return previous;

  return {
    ...previous,
    footswitchI: {
      ...previous.footswitchI,
      currentAssignedA: clampPreset(assignments.ia, previous.footswitchI.currentAssignedA),
      currentAssignedB: clampPreset(assignments.ib, previous.footswitchI.currentAssignedB),
    },
    footswitchII: {
      ...previous.footswitchII,
      currentAssignedA: clampPreset(assignments.iia, previous.footswitchII.currentAssignedA),
      currentAssignedB: clampPreset(assignments.iib, previous.footswitchII.currentAssignedB),
    },
  };
}

function applyBlePresetSelectionModel(
  previous: NanoCortexFootswitchState,
  preset: number,
  assignments?: ObservedFootswitchAssignments,
): { nextState: NanoCortexFootswitchState; slot: QuickPresetSlot | null; status: string } {
  const withAssignments = applyBleFootswitchAssignments(previous, assignments);
  const slot = resolveQuickPresetSlot(withAssignments, preset);
  if (!slot) {
    return {
      nextState: withAssignments,
      slot: null,
      status: `Bluetooth preset ${presetLabel(preset)}`,
    };
  }

  if (slot === "IA" || slot === "IB") {
    const activeSubslot = slot === "IA" ? "A" : "B";
    return {
      nextState: {
        ...withAssignments,
        footswitchI: { ...withAssignments.footswitchI, activeSubslot },
      },
      slot,
      status: `Bluetooth ${quickPresetSlotLabel(slot)} -> ${presetLabel(preset)}`,
    };
  }

  const activeSubslot = slot === "IIA" ? "A" : "B";
  return {
    nextState: {
      ...withAssignments,
      presetOperationMode: "4-preset",
      footswitchII: { ...withAssignments.footswitchII, role: "preset-toggle", activeSubslot },
    },
    slot,
    status: `Bluetooth ${quickPresetSlotLabel(slot)} -> ${presetLabel(preset)}`,
  };
}

function SurfaceTabs({
  value,
  onChange,
  trailing,
  aboutBadge,
}: {
  value: MainSurface;
  onChange: (value: MainSurface) => void;
  trailing?: ReactNode;
  aboutBadge?: boolean;
}) {
  const tabs: Array<{ id: MainSurface; label: string }> = [
    { id: "live", label: "Console" },
    { id: "advanced", label: "Advanced" },
    { id: "help", label: "Help" },
    { id: "about", label: "About" },
  ];

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 py-0.5">
      <div
        role="tablist"
        aria-label="Main editor surface"
        className="inline-flex items-center gap-1"
      >
        {tabs.map((tab) => {
          const active = value === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(tab.id)}
              className="relative h-7 rounded-md border px-2.5 text-[10px] font-extrabold uppercase tracking-[0.9px] transition-all"
              style={{
                background: active ? "var(--surface)" : "transparent",
                color: active ? "var(--color-cyan-accent)" : "var(--text-secondary)",
                borderColor: active ? "var(--panel-border-light)" : "transparent",
                boxShadow: active ? "inset 0 1px 0 var(--panel-border-light)" : "none",
              }}
            >
              {tab.label}
              {tab.id === "about" && aboutBadge && (
                <span
                  aria-label="Update available"
                  className="absolute -top-1 -right-1 h-2 w-2 rounded-full"
                  style={{
                    background: "var(--color-green-accent)",
                    boxShadow: "0 0 6px var(--glow-green, rgba(0,170,85,0.6))",
                  }}
                />
              )}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">{trailing}</div>
    </div>
  );
}

function AdvancedTabs({
  value,
  onChange,
}: {
  value: AdvancedSurface;
  onChange: (value: AdvancedSurface) => void;
}) {
  const tabs: Array<{ id: AdvancedSurface; label: string; experimental?: boolean }> = [
    { id: "diagnostics", label: "Diagnostics" },
    // Protocol reverse-engineering surface — only offered when experimental features are on.
    ...(EXPERIMENTAL_FEATURES
      ? [{ id: "capture" as const, label: "Capture Lab", experimental: true }]
      : []),
  ];

  return (
    <div
      role="tablist"
      aria-label="Advanced tools"
      className="inline-flex rounded-2xl border p-1"
      style={{ background: "var(--panel-inset)", borderColor: "var(--panel-border)" }}
    >
      {tabs.map((tab) => {
        const active = value === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.id)}
            className="h-8 rounded-xl px-3 text-[10px] font-extrabold uppercase tracking-[1px] transition-all"
            style={{
              background: active ? "var(--surface)" : "transparent",
              color: active ? "var(--color-cyan-accent)" : "var(--text-secondary)",
              boxShadow: active
                ? "inset 0 1px 0 var(--panel-border-light), 0 0 0 1px var(--panel-border-light)"
                : "none",
            }}
          >
            <span className="inline-flex items-center gap-1.5">
              {tab.label}
              {tab.experimental ? <ExperimentalBadge label="Exp" /> : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function AppContent() {
  const [currentPreset, setCurrentPreset] = useState(readLastOpenedPreset);
  const [ccState, setCcState] = useState<CCState>({ ...DEFAULT_CC_STATE });
  const [mainSurface, setMainSurface] = useState<MainSurface>("live");
  const [advancedSurface, setAdvancedSurface] = useState<AdvancedSurface>("diagnostics");
  const [tonePanelCollapsed, setTonePanelCollapsed] = useState(false);
  const [toneStudioOpen, setToneStudioOpen] = useState(false);
  const [toneEditorSlot, setToneEditorSlot] = useState<NanoFxSlotId>("pre-1");
  const [fxParamValuesBySlot, setFxParamValuesBySlot] = useState<FxParamValuesBySlot>({});
  const [fxParamRefreshSlot, setFxParamRefreshSlot] = useState<NanoFxSlotId | null>(null);
  const [fxParamRefreshAttempt, setFxParamRefreshAttempt] = useState<FxParamRefreshAttempt>(null);
  const [fxParamRefreshError, setFxParamRefreshError] = useState<string | null>(null);
  const [cabIrParamValues, setCabIrParamValues] = useState<CabIrParamRefresh | null>(null);
  const [cabIrParamSlot, setCabIrParamSlot] = useState<number | null>(null);
  const [cabIrParamLoading, setCabIrParamLoading] = useState(false);
  const [cabIrParamError, setCabIrParamError] = useState<string | null>(null);
  const [fxParamWritingKey, setFxParamWritingKey] = useState<string | null>(null);
  const [fxParamWriteError, setFxParamWriteError] = useState<string | null>(null);
  const [fxModelWritingSlot, setFxModelWritingSlot] = useState<NanoFxSlotId | null>(null);
  const [fxModelWriteError, setFxModelWriteError] = useState<string | null>(null);
  const [fixedBlockWriteLabel, setFixedBlockWriteLabel] = useState<string | null>(null);
  const [gateReductionLastSentValue, setGateReductionLastSentValue] = useState<number | null>(null);
  const [assetSlotWriting, setAssetSlotWriting] = useState<AssetSlotWriting | null>(null);
  const [saveInFlight, setSaveInFlight] = useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [pendingPresetSwitch, setPendingPresetSwitch] = useState<number | null>(null);
  const [deviceTrafficMessage, setDeviceTrafficMessage] = useState<string | null>(null);
  const midiChannel = 1;
  const [fxSlotAssignments, setFxSlotAssignments] = useState<FxSlotDeviceAssignments>(
    DEFAULT_FX_SLOT_DEVICE_ASSIGNMENTS,
  );
  const [tunerState, setTunerState] = useState(false);
  const [lastSetBpm, setLastSetBpm] = useState<number | null>(null);
  const [midiLog, setMidiLog] = useState<MidiLogEntry[]>([]);
  const [footswitchState, setFootswitchState] = useState<NanoCortexFootswitchState>(() =>
    loadFootswitchState(),
  );
  const [footswitchRotaryPreview, setFootswitchRotaryPreview] = useState<FootswitchRotaryPreview>({
    I: { value: 0, source: "memory", timestampMs: Date.now() },
    II: { value: 0, source: "memory", timestampMs: Date.now() },
  });
  const [deviceAssetNames, setDeviceAssetNames] = useState<DeviceAssetNames>({
    capture: [],
    ir: [],
  });
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [bleObserverState, setBleObserverState] = useState<BleObserverState>("offline");
  const [deviceStateLoading, setDeviceStateLoading] = useState(false);
  const [metadataLoading, setMetadataLoading] = useState(false);
  const [presetMetadataStatus, setPresetMetadataStatus] = useState<PresetMetadataStatus>({
    loaded: 0,
    expected: TOTAL_PRESETS,
    usable: 0,
    complete: false,
    source: "idle",
  });
  const [presetSyncPreset, setPresetSyncPreset] = useState<number | null>(null);
  const [activityEvents, setActivityEvents] = useState<HardwareActivityEntry[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const [diagnosticCaptureStartedAt, setDiagnosticCaptureStartedAt] = useState<number | null>(null);
  const [traceSession, setTraceSession] = useState<TraceSession>({
    label: null,
    activeLabel: null,
    startedAt: null,
    stoppedAt: null,
    midiCount: 0,
    latestMidiBytes: null,
  });
  const [lastUsbInbound, setLastUsbInbound] = useState<UsbInboundSync | null>(null);
  const [lastUsbOutbound, setLastUsbOutbound] = useState<UsbInboundSync | null>(null);
  const activeTraceLabelRef = useRef<string | null>(null);
  const footswitchStateRef = useRef(footswitchState);
  const pendingFootswitchAssignmentRef = useRef<ObservedFootswitchAssignments | null>(null);
  const footswitchRotaryPreviewRef = useRef(footswitchRotaryPreview);
  const handledBleHardwareRef = useRef<Partial<Record<ObservedHardwareId, string>>>({});
  const presetSwitchInFlightRef = useRef(false);
  const tempoBurstTimersRef = useRef<number[]>([]);
  const fxParamAutoReadSessionRef = useRef(0);
  const fxParamAutoReadKeyRef = useRef<string | null>(null);
  const cabIrParamAutoReadKeyRef = useRef<string | null>(null);
  const fxParamWriteTimersRef = useRef<Record<string, number>>({});
  const autoSaveTimerRef = useRef(0);
  const dirtyRevisionRef = useRef(0);
  const lastAutoSaveRevisionRef = useRef(0);
  const deviceTrafficTimerRef = useRef(0);
  const lastFxModelSignatureRef = useRef("");

  const { logs } = useLogs();
  const {
    connection,
    isConnected,
    deviceName,
    ports,
    error: connError,
    connectTo,
    adoptConnection,
    disconnect,
    refreshPorts,
  } = useMidiConnection();
  const { visible: supportNudgeVisible, dismiss: dismissSupportNudge } =
    useSupportNudge(isConnected);
  const presetNames = usePresetNames();
  const hardwareState = useNanoHardwareState(currentPreset);

  // ── Diagnostic bundle (copy/save logs for debugging) ──
  // @see docs/specs/200-frontend-control-surface/spec.md [FR-38]
  const [appVersion, setAppVersion] = useState("");
  // Launch warm-up, covered by the splash (see index.html / main.tsx): fetch the app version and
  // prime the MIDI port list so the app is connect-ready the moment it appears, then signal the
  // splash to fade. A safety timeout guarantees we never keep the splash up if an IPC call hangs.
  useEffect(() => {
    let done = false;
    const signalReady = () => {
      if (done) return;
      done = true;
      window.dispatchEvent(new Event("app:ready"));
    };
    void Promise.allSettled([
      getAppVersion()
        .then(setAppVersion)
        .catch(() => setAppVersion("")),
      listPorts(),
    ]).finally(signalReady);
    const safety = window.setTimeout(signalReady, 3000);
    return () => window.clearTimeout(safety);
  }, []);

  // One offline-safe update check per session (runs after the version loads; never gates launch).
  const updateState = useLatestRelease(appVersion);
  // Update surfacing (FR-48): persistent StatusBar pill + About-tab dot, and a one-time-per-version
  // toast. The support nudge takes precedence when both want the corner.
  const { visible: updateNudgeVisible, dismiss: dismissUpdateNudge } = useUpdateNudge(updateState);

  const diagnosticCaptureEntries = useMemo<LogEntry[]>(() => {
    if (diagnosticCaptureStartedAt === null) return [];
    return [
      ...logs.filter((entry) => entry.ts >= diagnosticCaptureStartedAt),
      ...midiLog
        .filter((entry) => entry.ts >= diagnosticCaptureStartedAt)
        .map(midiLogToDiagnosticEntry),
    ].sort((a, b) => a.ts - b.ts);
  }, [diagnosticCaptureStartedAt, logs, midiLog]);

  const buildDiagnostics = useCallback(
    async (entries?: LogEntry[]): Promise<string> => {
      let syncMode: string | null = null;
      let provisional: boolean | null = null;
      let stale: boolean | null = null;
      let activePreset: number | null = null;
      let bank: string | null = null;
      try {
        const nano = await getNanoState();
        syncMode = nano.syncMode ?? null;
        provisional = nano.provisional ?? null;
        stale = nano.stale ?? null;
        activePreset = nano.activePresetSlot ?? null;
        bank = nano.bank ?? null;
      } catch {
        // best-effort enrichment; omit if the backend is unavailable
      }
      return buildDiagnosticBundle(entries ?? logs, {
        appVersion: appVersion || "unknown",
        deviceName,
        connection: isConnected ? "connected" : "disconnected",
        isConnected,
        syncMode,
        provisional,
        stale,
        activePreset,
        bank,
        generatedAt: new Date().toISOString(),
        platform: typeof navigator !== "undefined" ? navigator.userAgent : "unknown",
      });
    },
    [logs, appVersion, deviceName, isConnected],
  );

  // Throws on clipboard failure so the button can show a real success/error state.
  const handleCopyDiagnostics = useCallback(async () => {
    await navigator.clipboard.writeText(await buildDiagnostics());
  }, [buildDiagnostics]);

  const handleToggleDiagnosticCapture = useCallback((enabled: boolean) => {
    setDiagnosticCaptureStartedAt(enabled ? Date.now() : null);
  }, []);

  const handleResetDiagnosticCapture = useCallback(() => {
    setDiagnosticCaptureStartedAt(Date.now());
  }, []);

  const handleCopyDiagnosticCapture = useCallback(async () => {
    await navigator.clipboard.writeText(await buildDiagnostics(diagnosticCaptureEntries));
  }, [buildDiagnostics, diagnosticCaptureEntries]);

  useEffect(() => {
    footswitchStateRef.current = footswitchState;
    saveFootswitchState(footswitchState);
  }, [footswitchState]);

  useEffect(() => {
    footswitchRotaryPreviewRef.current = footswitchRotaryPreview;
  }, [footswitchRotaryPreview]);

  useEffect(() => {
    if (hardwareState.bleNotificationCount === 0) return;
    setBleObserverState("ready");
  }, [hardwareState.bleNotificationCount]);

  const appendMidiLog = useCallback((entry: Omit<MidiLogEntry, "id" | "ts">) => {
    setMidiLog((prev) =>
      [
        { ...entry, id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, ts: Date.now() },
        ...prev,
      ].slice(0, 200),
    );
  }, []);

  const pulseDeviceTraffic = useCallback((message: string, holdMs = 1100) => {
    window.clearTimeout(deviceTrafficTimerRef.current);
    setDeviceTrafficMessage(message);
    deviceTrafficTimerRef.current = window.setTimeout(() => {
      setDeviceTrafficMessage(null);
    }, holdMs);
  }, []);
  useEffect(() => () => window.clearTimeout(deviceTrafficTimerRef.current), []);

  const pushActivity = useCallback(
    (message: string, tone = activityToneFor(message)) => {
      if (tone === "ble" || tone === "usb" || tone === "hardware") {
        pulseDeviceTraffic(message);
      }
      setActivityEvents((prev) =>
        [
          {
            id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
            ts: Date.now(),
            message,
            tone,
          },
          ...prev,
        ].slice(0, 8),
      );
    },
    [pulseDeviceTraffic],
  );

  const setFootswitchRotaryPreviewValue = useCallback(
    (footswitch: FootswitchId, value: number, source: FootswitchRotarySource) => {
      const nextValue = clampFootswitchRotary(footswitch, value);
      const nextEntry = { value: nextValue, source, timestampMs: Date.now() };
      footswitchRotaryPreviewRef.current = {
        ...footswitchRotaryPreviewRef.current,
        [footswitch]: nextEntry,
      };
      setFootswitchRotaryPreview((prev) => ({ ...prev, [footswitch]: nextEntry }));
      return nextValue;
    },
    [],
  );

  const nudgeFootswitchRotaryPreview = useCallback(
    (footswitch: FootswitchId, delta: number) => {
      const current = footswitchRotaryPreviewRef.current[footswitch]?.value ?? 0;
      const next = setFootswitchRotaryPreviewValue(footswitch, current + delta, "local");
      const label = footswitch === "I" ? "Footswitch I" : "Footswitch II";
      setStatusMsg(`${label} rotary ${next}`);
      pushActivity(`${label} rotary ${next}`, "hardware");
      setTimeout(() => setStatusMsg(null), 1400);
    },
    [pushActivity, setFootswitchRotaryPreviewValue],
  );

  useEffect(() => {
    if (!statusMsg) return;
    pushActivity(statusMsg);
  }, [pushActivity, statusMsg]);

  useEffect(() => {
    const message = error || connError;
    if (!message) return;
    pushActivity(message, "error");
  }, [connError, error, pushActivity]);

  const observedHardwareEvents = hardwareState.observedHardwareEvents;
  const observedControlEvents = hardwareState.controlsById;
  const handledBleControlRef = useRef<Record<string, string>>({});
  const latestDecodedBleActivityRef = useRef(0);
  const latestRawBleActivityRef = useRef(0);

  const adoptBlePresetSelection = useCallback(
    (preset: number, assignments?: ObservedFootswitchAssignments) => {
      if (preset < 0 || preset > 63) return;
      const result = applyBlePresetSelectionModel(footswitchStateRef.current, preset, assignments);
      footswitchStateRef.current = result.nextState;
      setFootswitchState(result.nextState);
      setCurrentPreset(preset);
      rememberLastOpenedPreset(preset);
      setStatusMsg(result.status);
      setTimeout(() => setStatusMsg(null), 1800);
    },
    [],
  );

  useEffect(() => {
    for (const value of observedControlEvents.values()) {
      if (value.source !== "live") continue;
      const eventKey = `${value.timestampMs}:${value.rawValue}:${value.payloadHex}`;
      if (handledBleControlRef.current[value.id] === eventKey) continue;
      handledBleControlRef.current[value.id] = eventKey;
      latestDecodedBleActivityRef.current = value.timestampMs;
      pulseDeviceTraffic(`Bluetooth ${value.label}`);
      pushActivity(`Bluetooth ${value.label} ${value.percent}`, "ble");
    }
  }, [observedControlEvents, pulseDeviceTraffic, pushActivity]);

  useEffect(() => {
    const timestamp = hardwareState.latestBleNotificationTimestamp;
    if (!timestamp) return;
    const decodedTimestamp = Math.max(
      latestDecodedBleActivityRef.current,
      hardwareState.latestObservedTimestamp ?? 0,
    );
    if (timestamp - decodedTimestamp < 250) return;
    if (timestamp - latestRawBleActivityRef.current < 1200) return;
    latestRawBleActivityRef.current = timestamp;
    pulseDeviceTraffic("Bluetooth packet");
    pushActivity("Bluetooth packet", "ble");
  }, [
    hardwareState.latestBleNotificationTimestamp,
    hardwareState.latestObservedTimestamp,
    pulseDeviceTraffic,
    pushActivity,
  ]);

  const bleNotificationCount = useMemo(() => {
    if (!traceSession.startedAt) return 0;
    const end = traceSession.stoppedAt ?? Number.POSITIVE_INFINITY;
    return logs.filter(
      (entry) =>
        entry.ts >= traceSession.startedAt! &&
        entry.ts <= end &&
        entry.message.includes("[ble] notification 0000c305"),
    ).length;
  }, [logs, traceSession.startedAt, traceSession.stoppedAt]);

  // Auto-request the authoritative device-state dump on BLE connect and preset change, so the
  // "Device state" readout reflects what is actually loaded (settle delay covers preset switch).
  // @see docs/specs/200-frontend-control-surface/spec.md [FR-40]
  const observedStateDump = hardwareState.observedStateDump;
  const [backendStateDump, setBackendStateDump] = useState<DecodedStateDump | null>(null);
  const deviceStateRequestCountRef = useRef(0);
  const deviceStateDump = useMemo(() => {
    if (!observedStateDump || !backendStateDump) return observedStateDump ?? backendStateDump;
    if (observedStateDump.timestampMs >= backendStateDump.timestampMs) {
      return mergeStateDumps(observedStateDump, backendStateDump);
    }
    return mergeStateDumps(backendStateDump, observedStateDump);
  }, [backendStateDump, observedStateDump]);
  // Dump field 11 is the capture rotary position within the current bank (1-5), NOT the
  // absolute slot (hardware-observed: selecting slot 25 reports 5). Resolve the absolute
  // slot from the capture name against the metadata list (same approach as Cab/IR below);
  // fall back to the raw field only when the name cannot be resolved (e.g. bypass = 0).
  const currentCaptureSlot = useMemo(() => {
    if (deviceStateDump?.captureSlot === 0) return 0;
    return (
      inferRotarySlotFromName(deviceStateDump?.captureName, deviceAssetNames.capture) ??
      (typeof deviceStateDump?.captureSlot === "number" ? deviceStateDump.captureSlot : null)
    );
  }, [deviceAssetNames.capture, deviceStateDump?.captureName, deviceStateDump?.captureSlot]);
  useEffect(() => {
    if (currentCaptureSlot === null) return;
    setFootswitchRotaryPreviewValue("I", currentCaptureSlot, "live");
  }, [currentCaptureSlot, setFootswitchRotaryPreviewValue]);
  const currentCabIrSlot = useMemo(
    () => inferRotarySlotFromName(deviceStateDump?.irName, deviceAssetNames.ir),
    [deviceAssetNames.ir, deviceStateDump?.irName],
  );
  useEffect(() => {
    if (currentCabIrSlot === null) return;
    setFootswitchRotaryPreviewValue("II", currentCabIrSlot, "live");
  }, [currentCabIrSlot, setFootswitchRotaryPreviewValue]);
  const captureRotaryDisplayName = useMemo(() => {
    const preview = footswitchRotaryPreview.I;
    const explicitSlot = preview.source !== "memory";
    const slot = explicitSlot ? preview.value : currentCaptureSlot;
    return assetNameForRotarySlot(
      "Capture",
      slot,
      deviceAssetNames.capture,
      deviceStateDump?.captureName,
      {
        preferFallbackForUnknown: !explicitSlot,
      },
    );
  }, [
    currentCaptureSlot,
    deviceAssetNames.capture,
    deviceStateDump?.captureName,
    footswitchRotaryPreview.I,
  ]);
  const irRotaryDisplayName = useMemo(() => {
    const preview = footswitchRotaryPreview.II;
    const explicitSlot = preview.source !== "memory";
    const slot = explicitSlot ? preview.value : currentCabIrSlot;
    return assetNameForRotarySlot("IR", slot, deviceAssetNames.ir, deviceStateDump?.irName, {
      preferFallbackForUnknown: !explicitSlot,
    });
  }, [currentCabIrSlot, deviceAssetNames.ir, deviceStateDump?.irName, footswitchRotaryPreview.II]);
  const deviceFxModelStates = useMemo(
    () => buildFxSlotModelStates(deviceStateDump?.fxModels),
    [deviceStateDump?.fxModels],
  );
  const fxParamModelKeyForSlot = useCallback(
    (slot: EditableFxSlotId) => {
      const modelState = deviceFxModelStates[slot];
      return modelState?.rawId ?? modelState?.deviceId ?? fxSlotAssignments[slot];
    },
    [deviceFxModelStates, fxSlotAssignments],
  );
  const activeModelFxParamValues = useMemo(
    () =>
      EDITABLE_FX_SLOT_IDS.reduce(
        (valuesBySlot, slot) => {
          const snapshot = fxParamValuesBySlot[slot];
          if (snapshot && snapshot.modelKey === fxParamModelKeyForSlot(slot)) {
            valuesBySlot[slot] = snapshot.values;
          }
          return valuesBySlot;
        },
        {} as Partial<Record<EditableFxSlotId, number[]>>,
      ),
    [fxParamModelKeyForSlot, fxParamValuesBySlot],
  );
  const deviceFxModelSignature = useMemo(
    () => fxModelSignature(deviceStateDump?.fxModels),
    [deviceStateDump?.fxModels],
  );
  const loadedToneSlotNames = useMemo(
    () => ({
      capture: deviceStateDump?.captureName ?? null,
      "ir-loader": deviceStateDump?.irName ?? null,
    }),
    [deviceStateDump?.captureName, deviceStateDump?.irName],
  );
  const fixedBlockReadback = useMemo(
    () => ({
      gateOn: deviceStateDump?.gateOn,
      captureSlot: currentCaptureSlot,
      captureName: deviceStateDump?.captureName ?? captureRotaryDisplayName,
      captureVolume: deviceStateDump?.captureVolume,
      cabIrSlot: currentCabIrSlot,
      cabIrOn: deviceStateDump?.cabIrOn,
      cabIrName: deviceStateDump?.irName ?? irRotaryDisplayName,
      gateReduction: deviceStateDump?.gateReduction,
      cabIrParams: cabIrParamValues,
      cabIrParamsLoading: cabIrParamLoading,
      cabIrParamsError: cabIrParamError,
    }),
    [
      cabIrParamError,
      cabIrParamLoading,
      cabIrParamValues,
      captureRotaryDisplayName,
      currentCabIrSlot,
      currentCaptureSlot,
      deviceStateDump?.cabIrOn,
      deviceStateDump?.captureName,
      deviceStateDump?.captureVolume,
      deviceStateDump?.gateOn,
      deviceStateDump?.gateReduction,
      deviceStateDump?.irName,
      irRotaryDisplayName,
    ],
  );
  // Live physical-knob positions decoded from the BLE twist stream, so the device-panel dials
  // follow the hardware in real time (not only on full state dumps).
  const liveKnobs = useMemo(() => {
    const out: Partial<Record<DevicePanelKnob, { value: number; timestampMs: number }>> = {};
    for (const key of ["gain", "level", "bass", "mid", "treble", "amount"] as const) {
      const control = hardwareState.controlsById.get(key);
      if (control) out[key] = { value: control.rawValue, timestampMs: control.timestampMs };
    }
    return out;
  }, [hardwareState.controlsById]);
  const isBleConnected =
    isConnected && (bleObserverState === "ready" || isBluetoothDeviceName(deviceName));
  const nanoUsbControlActive = canUseUsbCommandPath({ isConnected, deviceName, ports });
  const nanoBleStateActive = isBleConnected || bleObserverState === "ready";

  const {
    value: expressionValue,
    change: changeExpression,
    setLocalValue: setExpressionLocalValue,
  } = useExpression(async (bytes) => {
    const value = bytes[2] ?? 0;
    pulseDeviceTraffic("Writing expression");
    await connection.setExpression(value, midiChannel);
    setLastUsbOutbound(buildUsbCcSync(MIDI_CC.EXPRESSION, value, midiChannel));
    appendMidiLog({
      kind: "cc",
      channel: midiChannel,
      number: MIDI_CC.EXPRESSION,
      value,
      label: `Expression CC1 = ${value}`,
      bytes: [0xb0 | (midiChannel - 1), MIDI_CC.EXPRESSION, value],
    });
  }, nanoUsbControlActive);

  // Reflect the physical expression pedal (BLE-only, 3-zone heel/center/toe) in the
  // expression control. Display-only: mirrors the observed position without re-sending CC1.
  // @see docs/specs/200-frontend-control-surface/design.md [DES-FRONT-DECODER]
  const observedExpression = hardwareState.observedExpression;
  const lastObservedExpressionTsRef = useRef<number | null>(null);
  useEffect(() => {
    if (!observedExpression) return;
    if (lastObservedExpressionTsRef.current === observedExpression.timestampMs) return;
    lastObservedExpressionTsRef.current = observedExpression.timestampMs;
    setExpressionLocalValue(observedExpression.midiValue);
  }, [observedExpression, setExpressionLocalValue]);

  useEffect(() => {
    const bypass = deviceStateDump?.bypass;
    if (!bypass || bypass.length < FX_SLOT_CC.length) return;
    const nextSlotStates = bypass.slice(0, FX_SLOT_CC.length).map((bypassByte) => bypassByte === 0);

    setCcState((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const [index, cc] of FX_SLOT_CC.entries()) {
        const enabled = nextSlotStates[index] ?? false;
        if (next[cc] !== enabled) {
          next[cc] = enabled;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [deviceStateDump?.bypass]);
  useEffect(() => {
    const fixedStates: Array<[number, boolean | null | undefined]> = [
      [CC.GATE, deviceStateDump?.gateOn],
      [
        CC.CAPTURE,
        typeof deviceStateDump?.captureSlot === "number" ? deviceStateDump.captureSlot !== 0 : null,
      ],
      [CC.CAB, deviceStateDump?.cabIrOn],
    ];
    setCcState((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const [cc, enabled] of fixedStates) {
        if (enabled === null || enabled === undefined) continue;
        if (next[cc] !== enabled) {
          next[cc] = enabled;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [deviceStateDump?.cabIrOn, deviceStateDump?.captureSlot, deviceStateDump?.gateOn]);

  const refreshBackendStateDump = useCallback(async () => {
    deviceStateRequestCountRef.current += 1;
    setDeviceStateLoading(true);
    pulseDeviceTraffic("Reading device state");
    try {
      const nano = await requestStateDump();
      const decoded = nanoStateToDecodedStateDump(nano);
      if (decoded) setBackendStateDump(decoded);
      return nano;
    } finally {
      deviceStateRequestCountRef.current = Math.max(0, deviceStateRequestCountRef.current - 1);
      if (deviceStateRequestCountRef.current === 0) setDeviceStateLoading(false);
    }
  }, [pulseDeviceTraffic]);
  useEffect(() => {
    if (!isBleConnected) {
      setBackendStateDump(null);
      deviceStateRequestCountRef.current = 0;
      setDeviceStateLoading(false);
      setPresetSyncPreset(null);
    }
  }, [isBleConnected]);
  useEffect(() => {
    if (!isBleConnected) return;
    const timer = window.setTimeout(() => {
      // Authoritative backend read: decodes the dump into NanoState + graduates capabilities.
      // The returned NanoState drives the Live dials; raw c305 logs remain a fallback.
      refreshBackendStateDump().catch(() => {});
    }, 350);
    return () => window.clearTimeout(timer);
  }, [isBleConnected, refreshBackendStateDump]);

  // Re-read the device state dump (so the device-panel dials re-sync and animate) shortly
  // after any observed device-side change that can load different amp values but does NOT flow
  // through `currentPreset`: footswitch press/hold, rotary/bank/capture twist. Debounced so a burst
  // of encoder events collapses into a single request once the device settles on the new state.
  const stateDumpRefreshTimer = useRef(0);
  const refreshStateDumpSoon = useCallback(() => {
    window.clearTimeout(stateDumpRefreshTimer.current);
    stateDumpRefreshTimer.current = window.setTimeout(() => {
      refreshBackendStateDump().catch(() => {});
    }, 550);
  }, [refreshBackendStateDump]);
  useEffect(() => () => window.clearTimeout(stateDumpRefreshTimer.current), []);

  // Fill available preset names from the device once we have actually received data over BLE. The
  // metadata FE-stream is the only source of preset names (the c305 state dump carries capture/IR
  // names but not preset names), so we wait until a state dump proves the BLE data path is live,
  // then request metadata — retrying a few times, since an early request can land before c305 is
  // subscribed and come back empty. Keyed on each dump's timestamp so a failed sync re-arms on
  // the next dump instead of giving up for the whole session.
  // @see docs/specs/200-frontend-control-surface/spec.md [FR-34]
  const latestDumpTimestamp = deviceStateDump?.timestampMs ?? null;
  const metadataSyncedRef = useRef(false);
  const metadataSyncInFlightRef = useRef(false);
  const metadataSyncSessionRef = useRef(0);
  const metadataRetryTimersRef = useRef<number[]>([]);
  const clearMetadataRetryTimers = useCallback(() => {
    metadataRetryTimersRef.current.forEach((id) => window.clearTimeout(id));
    metadataRetryTimersRef.current = [];
  }, []);
  const applyDeviceMetadata = useCallback(
    (meta: {
      presetNames: string[];
      captureNames?: string[];
      irNames?: string[];
      presetSlots?: number;
      expectedPresetSlots?: number;
      usablePresetNames?: number;
      complete?: boolean;
    }) => {
      setDeviceAssetNames({
        capture: meta.captureNames ?? [],
        ir: meta.irNames ?? [],
      });
      const metadata = describeDevicePresetMetadata(meta.presetNames);
      if (!metadata || metadata.usable <= 0) return null;

      const loaded = meta.presetSlots ?? metadata.loaded;
      const expected = meta.expectedPresetSlots ?? metadata.expected;
      const usable = meta.usablePresetNames ?? metadata.usable;
      const complete = Boolean(meta.complete ?? metadata.complete);
      savePresetNames(mergeDevicePresetNames(loadPresetNames(), metadata));
      setPresetMetadataStatus({
        loaded,
        expected,
        usable,
        complete,
        source: "device",
      });
      return { complete, expected, loaded, usable };
    },
    [],
  );
  const refreshPresetMetadataSoon = useCallback(
    (delayMs = 700) => {
      metadataSyncSessionRef.current += 1;
      const session = metadataSyncSessionRef.current;
      metadataSyncedRef.current = false;
      metadataSyncInFlightRef.current = true;
      setMetadataLoading(true);
      clearMetadataRetryTimers();

      const timer = window.setTimeout(() => {
        pulseDeviceTraffic("Reading preset names");
        requestMetadata()
          .then((meta) => {
            if (session !== metadataSyncSessionRef.current) return;
            const applied = applyDeviceMetadata(meta);
            if (applied?.complete) metadataSyncedRef.current = true;
            metadataSyncInFlightRef.current = false;
            setMetadataLoading(false);
          })
          .catch(() => {
            if (session !== metadataSyncSessionRef.current) return;
            metadataSyncedRef.current = false;
            metadataSyncInFlightRef.current = false;
            setPresetMetadataStatus((prev) => ({
              ...prev,
              complete: false,
              source: "unavailable",
            }));
            setMetadataLoading(false);
          });
      }, delayMs);
      metadataRetryTimersRef.current.push(timer);
    },
    [applyDeviceMetadata, clearMetadataRetryTimers, pulseDeviceTraffic],
  );
  useEffect(
    () => () => {
      metadataSyncSessionRef.current += 1;
      metadataSyncInFlightRef.current = false;
      clearMetadataRetryTimers();
    },
    [clearMetadataRetryTimers],
  );
  useEffect(
    () => () => {
      tempoBurstTimersRef.current.forEach((id) => window.clearTimeout(id));
      tempoBurstTimersRef.current = [];
    },
    [],
  );
  useEffect(() => {
    if (!isBleConnected) {
      metadataSyncSessionRef.current += 1;
      metadataSyncedRef.current = false;
      metadataSyncInFlightRef.current = false;
      setMetadataLoading(false);
      setPresetMetadataStatus((prev) => ({
        ...prev,
        loaded: 0,
        usable: 0,
        complete: false,
        source: "idle",
      }));
      setDeviceAssetNames({ capture: [], ir: [] });
      clearMetadataRetryTimers();
      return;
    }
    if (
      latestDumpTimestamp === null ||
      metadataSyncedRef.current ||
      metadataSyncInFlightRef.current
    )
      return;
    metadataSyncInFlightRef.current = true;
    setMetadataLoading(true);

    const session = metadataSyncSessionRef.current;
    const attempt = (triesLeft: number) => {
      pulseDeviceTraffic("Reading preset names");
      requestMetadata()
        .then((meta) => {
          if (session !== metadataSyncSessionRef.current) return;
          const applied = applyDeviceMetadata(meta);
          if (applied) {
            setMetadataLoading(false);
            if (applied.complete) {
              metadataSyncedRef.current = true;
              metadataSyncInFlightRef.current = false;
            } else if (triesLeft > 0) {
              metadataRetryTimersRef.current.push(
                window.setTimeout(() => attempt(triesLeft - 1), 1500),
              );
            } else {
              metadataSyncedRef.current = false; // re-arms on the next dump (or reconnect)
              metadataSyncInFlightRef.current = false;
            }
          } else if (triesLeft > 0) {
            metadataRetryTimersRef.current.push(
              window.setTimeout(() => attempt(triesLeft - 1), 1500),
            );
          } else {
            setPresetMetadataStatus({
              loaded: 0,
              expected: TOTAL_PRESETS,
              usable: 0,
              complete: false,
              source: "unavailable",
            });
            metadataSyncedRef.current = false; // re-arms on the next dump (or reconnect)
            metadataSyncInFlightRef.current = false;
            setMetadataLoading(false);
          }
        })
        .catch(() => {
          if (session !== metadataSyncSessionRef.current) return;
          if (triesLeft > 0) {
            metadataRetryTimersRef.current.push(
              window.setTimeout(() => attempt(triesLeft - 1), 1500),
            );
          } else {
            setPresetMetadataStatus((prev) => ({
              ...prev,
              complete: false,
              source: "unavailable",
            }));
            metadataSyncedRef.current = false;
            metadataSyncInFlightRef.current = false;
            setMetadataLoading(false);
          }
        });
    };
    attempt(3);
  }, [
    applyDeviceMetadata,
    clearMetadataRetryTimers,
    isBleConnected,
    latestDumpTimestamp,
    pulseDeviceTraffic,
  ]);

  // Write an amp knob to the device, debounced per-knob so slider drags don't flood BLE. Any
  // write marks the active preset dirty — like the physical knobs, edits change the live sound
  // but are NOT stored to the preset until the device SAVE (hold ~3 s) / the app Save command.
  const knobWriteTimers = useRef<Record<string, number>>({});
  const [dirtyParams, setDirtyParams] = useState(false);
  const [dirtyRevision, setDirtyRevision] = useState(0);
  const cleanKnobSignatureRef = useRef<{ preset: number; signature: string } | null>(null);
  const currentPresetStartedAtRef = useRef(Date.now());
  const markPresetDirty = useCallback(() => {
    setDirtyParams(true);
    setDirtyRevision((revision) => {
      const next = revision + 1;
      dirtyRevisionRef.current = next;
      return next;
    });
  }, []);
  useEffect(() => {
    const assignments = deviceStateDump?.footswitchAssignments;
    if (!assignments) return;

    const previous = footswitchStateRef.current;
    const changed = !footswitchAssignmentsEqual(
      footswitchAssignmentsPayload(previous),
      assignments,
    );
    const pending = pendingFootswitchAssignmentRef.current;
    const confirmedPending = footswitchAssignmentsEqual(assignments, pending);

    if (changed) {
      const next = applyBleFootswitchAssignments(previous, assignments);
      footswitchStateRef.current = next;
      setFootswitchState(next);
    }

    if (confirmedPending) {
      pendingFootswitchAssignmentRef.current = null;
      if (changed) {
        markPresetDirty();
        setStatusMsg("Footswitch assignment confirmed by device; save to keep it");
        pushActivity("Footswitch assignment confirmed by device; save to keep", "ble");
        setTimeout(() => setStatusMsg(null), 2800);
      }
    }
  }, [deviceStateDump?.footswitchAssignments, markPresetDirty, pushActivity]);
  const clearAmpKnobWriteTimers = useCallback(() => {
    Object.values(knobWriteTimers.current).forEach((id) => window.clearTimeout(id));
    knobWriteTimers.current = {};
  }, []);
  const clearFxParamWriteTimers = useCallback(() => {
    Object.values(fxParamWriteTimersRef.current).forEach((id) => window.clearTimeout(id));
    fxParamWriteTimersRef.current = {};
  }, []);
  const handleWriteAmpKnob = useCallback(
    (knob: AmpKnob, value: number) => {
      if (!nanoBleStateActive) return;
      markPresetDirty();
      pulseDeviceTraffic(`Writing ${knob}`);
      const timers = knobWriteTimers.current;
      if (timers[knob]) window.clearTimeout(timers[knob]);
      timers[knob] = window.setTimeout(() => {
        pulseDeviceTraffic(`Writing ${knob}`);
        setAmpKnob(knob, value).catch(() => {});
      }, 90);
    },
    [markPresetDirty, nanoBleStateActive, pulseDeviceTraffic],
  );

  const handleRefreshFxParams = useCallback(
    async (
      slot: NanoFxSlotId,
      options: {
        session?: number;
        source?: "auto" | "manual";
        attempt?: number;
        maxAttempts?: number;
        quiet?: boolean;
        holdLoading?: boolean;
      } = {},
    ) => {
      if (!nanoBleStateActive || !isEditableFxSlot(slot)) return false;
      const {
        session,
        source = "manual",
        attempt = 1,
        maxAttempts = 1,
        quiet = false,
        holdLoading = false,
      } = options;
      pulseDeviceTraffic(`Reading FX parameters for ${slot}`);
      setFxParamRefreshSlot(slot);
      setFxParamRefreshAttempt({ slot, attempt, maxAttempts });
      if (!quiet) setFxParamRefreshError(null);
      try {
        const refresh = await requestFxParams(slot);
        if (session !== undefined && session !== fxParamAutoReadSessionRef.current) return false;
        const parameterProfile = getFxParamProfile(deviceFxModelStates[slot]?.rawId);
        const expectedParameters = orderedFxParams(parameterProfile);
        const hasCompleteValues =
          expectedParameters.length === 0 ||
          expectedParameters.every((parameter) => {
            const value = refresh.values[parameter.index];
            return value !== undefined && Number.isFinite(value);
          });
        setFxParamValuesBySlot((prev) => ({
          ...prev,
          [slot]: { modelKey: fxParamModelKeyForSlot(slot), values: refresh.values },
        }));
        if (hasCompleteValues) {
          setFxParamRefreshError(null);
        } else if (!quiet) {
          const receivedCount = expectedParameters.filter((parameter) => {
            const value = refresh.values[parameter.index];
            return value !== undefined && Number.isFinite(value);
          }).length;
          const message = `FX parameter refresh for ${slot} returned ${receivedCount}/${expectedParameters.length} mapped values`;
          setFxParamRefreshError(message);
          setStatusMsg(message);
        }
        if (source === "manual") {
          pushActivity(`FX params ${slot} ${refresh.values.length} value(s)`, "ble");
        }
        return hasCompleteValues;
      } catch (err) {
        if (session !== undefined && session !== fxParamAutoReadSessionRef.current) return false;
        const message = formatError(err instanceof Error ? err.message : String(err));
        if (!quiet) {
          setFxParamRefreshError(message);
          setStatusMsg(message);
        }
        return false;
      } finally {
        if (
          !holdLoading &&
          (session === undefined || session === fxParamAutoReadSessionRef.current)
        ) {
          setFxParamRefreshSlot(null);
          setFxParamRefreshAttempt(null);
        }
      }
    },
    [
      deviceFxModelStates,
      fxParamModelKeyForSlot,
      nanoBleStateActive,
      pulseDeviceTraffic,
      pushActivity,
    ],
  );
  const handleRefreshCabIrParams = useCallback(
    async (slot: number | null = currentCabIrSlot, source: "auto" | "manual" = "manual") => {
      if (!nanoBleStateActive || !slot || slot < 1 || slot > FOOTSWITCH_ROTARY_MAX) return;
      pulseDeviceTraffic(`Reading Cab/IR parameters for slot ${slot}`);
      setCabIrParamLoading(true);
      setCabIrParamSlot(slot);
      setCabIrParamError(null);
      try {
        const refresh = await requestCabIrParams(slot);
        setCabIrParamValues(refresh);
        if (source === "manual") {
          pushActivity(`Cab/IR slot ${slot} values synced`, "ble");
        }
      } catch (err) {
        const message = formatError(err instanceof Error ? err.message : String(err));
        if (source === "manual") {
          setCabIrParamError(message);
          setStatusMsg(message);
        } else {
          pushActivity(`Cab/IR slot ${slot} auto-sync queued`, "ble");
        }
      } finally {
        setCabIrParamLoading(false);
      }
    },
    [currentCabIrSlot, nanoBleStateActive, pulseDeviceTraffic, pushActivity],
  );

  const handleWriteGateEnabled = useCallback(
    async (enabled: boolean) => {
      if (!nanoBleStateActive) {
        setStatusMsg("Connect Bluetooth to write Gate state");
        setTimeout(() => setStatusMsg(null), 2200);
        return;
      }
      const label = `Writing Gate ${enabled ? "on" : "off"}`;
      setFixedBlockWriteLabel(label);
      pulseDeviceTraffic(label);
      try {
        await setGateEnabled(enabled);
        markPresetDirty();
        setBackendStateDump((prev) => (prev ? { ...prev, gateOn: enabled } : prev));
        pushActivity(`Gate ${enabled ? "on" : "off"}`, "ble");
        refreshStateDumpSoon();
      } catch (err) {
        const message = formatError(err instanceof Error ? err.message : String(err));
        setError(message);
        setStatusMsg(message);
      } finally {
        setFixedBlockWriteLabel(null);
      }
    },
    [markPresetDirty, nanoBleStateActive, pulseDeviceTraffic, pushActivity, refreshStateDumpSoon],
  );

  const handleWriteGateReduction = useCallback(
    async (percent: number) => {
      if (!nanoBleStateActive) {
        setStatusMsg("Connect Bluetooth to write Gate reduction");
        setTimeout(() => setStatusMsg(null), 2200);
        return;
      }
      const value = Number.isFinite(percent) ? Math.max(0, Math.min(100, Math.round(percent))) : 0;
      const label = `Writing Gate reduction ${value}%`;
      setFixedBlockWriteLabel(label);
      pulseDeviceTraffic(label);
      try {
        await setGateReduction(value);
        markPresetDirty();
        setGateReductionLastSentValue(value);
        pushActivity(`Gate reduction ${value}%`, "ble");
        refreshStateDumpSoon();
      } catch (err) {
        const message = formatError(err instanceof Error ? err.message : String(err));
        setError(message);
        setStatusMsg(message);
      } finally {
        setFixedBlockWriteLabel(null);
      }
    },
    [markPresetDirty, nanoBleStateActive, pulseDeviceTraffic, pushActivity, refreshStateDumpSoon],
  );

  const handleWriteCaptureVolume = useCallback(
    async (db: number) => {
      if (!nanoBleStateActive) {
        setStatusMsg("Connect Bluetooth to write Capture volume");
        setTimeout(() => setStatusMsg(null), 2200);
        return;
      }
      const value = Number.isFinite(db) ? Math.max(-24, Math.min(12, db)) : 0;
      const label = `Writing Capture volume ${value.toFixed(1)} dB`;
      setFixedBlockWriteLabel(label);
      pulseDeviceTraffic(label);
      try {
        await setCaptureVolume(value);
        markPresetDirty();
        pushActivity(`Capture volume ${value.toFixed(1)} dB`, "ble");
        refreshStateDumpSoon();
      } catch (err) {
        const message = formatError(err instanceof Error ? err.message : String(err));
        setError(message);
        setStatusMsg(message);
      } finally {
        setFixedBlockWriteLabel(null);
      }
    },
    [markPresetDirty, nanoBleStateActive, pulseDeviceTraffic, pushActivity, refreshStateDumpSoon],
  );

  const handleWriteCabIrParam = useCallback(
    async (param: CabIrParamKey, value: number) => {
      if (!nanoBleStateActive) {
        setStatusMsg("Connect Bluetooth to write Cab/IR values");
        setTimeout(() => setStatusMsg(null), 2200);
        return;
      }
      const safeValue =
        param === "level"
          ? Math.max(-96, Math.min(12, value))
          : param === "high-pass"
            ? Math.max(20, Math.min(800, value))
            : Math.max(1000, Math.min(20_000, value));
      const label = `Writing Cab/IR ${param}`;
      setFixedBlockWriteLabel(label);
      pulseDeviceTraffic(label);
      setCabIrParamValues((prev) => {
        const next = prev ?? {
          levelDb: null,
          highPassHz: null,
          lowPassHz: null,
          mic: null,
          position: null,
        };
        if (param === "level") return { ...next, levelDb: safeValue };
        if (param === "high-pass") return { ...next, highPassHz: safeValue };
        return { ...next, lowPassHz: safeValue };
      });
      try {
        await setCabIrParam(param, safeValue);
        markPresetDirty();
        pushActivity(`Cab/IR ${param} write`, "ble");
        await new Promise<void>((resolve) => window.setTimeout(resolve, 260));
        await handleRefreshCabIrParams(currentCabIrSlot, "auto");
      } catch (err) {
        const message = formatError(err instanceof Error ? err.message : String(err));
        setCabIrParamError(message);
        setStatusMsg(message);
      } finally {
        setFixedBlockWriteLabel(null);
      }
    },
    [
      currentCabIrSlot,
      handleRefreshCabIrParams,
      markPresetDirty,
      nanoBleStateActive,
      pulseDeviceTraffic,
      pushActivity,
    ],
  );

  const handleWriteCabIrMicPosition = useCallback(
    async (micName: string, position: number) => {
      if (!nanoBleStateActive) {
        setStatusMsg("Connect Bluetooth to write Cab/IR mic position");
        setTimeout(() => setStatusMsg(null), 2200);
        return;
      }
      const cabName = irRotaryDisplayName.trim();
      const safeMic = micName.trim();
      const safePosition = Math.max(1, Math.min(6, Math.round(position)));
      if (!cabName || cabName === "--" || !safeMic) {
        setStatusMsg("Cab/IR mic write needs a decoded factory cab name");
        setTimeout(() => setStatusMsg(null), 2400);
        return;
      }
      const label = `Writing Cab/IR mic ${safeMic}`;
      setFixedBlockWriteLabel(label);
      pulseDeviceTraffic(label);
      setCabIrParamValues((prev) => ({
        levelDb: prev?.levelDb ?? null,
        highPassHz: prev?.highPassHz ?? null,
        lowPassHz: prev?.lowPassHz ?? null,
        mic: safeMic,
        position: safePosition,
      }));
      try {
        await setCabIrMicPosition(cabName, safeMic, safePosition);
        markPresetDirty();
        pushActivity(`Cab/IR mic ${safeMic} position ${safePosition}`, "ble");
        await new Promise<void>((resolve) => window.setTimeout(resolve, 260));
        await handleRefreshCabIrParams(currentCabIrSlot, "auto");
      } catch (err) {
        const message = formatError(err instanceof Error ? err.message : String(err));
        setCabIrParamError(message);
        setStatusMsg(message);
      } finally {
        setFixedBlockWriteLabel(null);
      }
    },
    [
      currentCabIrSlot,
      handleRefreshCabIrParams,
      irRotaryDisplayName,
      markPresetDirty,
      nanoBleStateActive,
      pulseDeviceTraffic,
      pushActivity,
    ],
  );

  const handleWriteFxParam = useCallback(
    (slot: EditableFxSlotId, paramIndex: number, normalizedValue: number) => {
      if (!nanoBleStateActive) return;

      const value = Number.isFinite(normalizedValue)
        ? Math.max(0, Math.min(1, normalizedValue))
        : 0;
      const writeKey = `${slot}:${paramIndex}`;
      const writeSession = fxParamAutoReadSessionRef.current;

      markPresetDirty();
      pulseDeviceTraffic(`Writing FX parameter ${slot}`);
      setFxParamWriteError(null);
      setFxParamValuesBySlot((prev) => {
        const modelKey = fxParamModelKeyForSlot(slot);
        const currentSnapshot = prev[slot];
        const values = currentSnapshot?.modelKey === modelKey ? [...currentSnapshot.values] : [];
        values[paramIndex] = value;
        return { ...prev, [slot]: { modelKey, values } };
      });

      const timers = fxParamWriteTimersRef.current;
      if (timers[writeKey]) window.clearTimeout(timers[writeKey]);
      timers[writeKey] = window.setTimeout(() => {
        if (writeSession !== fxParamAutoReadSessionRef.current) {
          delete timers[writeKey];
          return;
        }
        pulseDeviceTraffic(`Writing FX parameter ${slot}`);
        setFxParamWritingKey(writeKey);
        setFxParam(slot, paramIndex, value)
          .then(() => {
            if (writeSession !== fxParamAutoReadSessionRef.current) return;
            pushActivity(`FX param ${slot} #${paramIndex + 1} write`, "ble");
          })
          .catch((err) => {
            if (writeSession !== fxParamAutoReadSessionRef.current) return;
            const message = formatError(err instanceof Error ? err.message : String(err));
            setFxParamWriteError(message);
            setStatusMsg(message);
          })
          .finally(() => {
            delete timers[writeKey];
            setFxParamWritingKey((current) => (current === writeKey ? null : current));
          });
      }, FX_PARAM_WRITE_DEBOUNCE_MS);
    },
    [fxParamModelKeyForSlot, markPresetDirty, nanoBleStateActive, pulseDeviceTraffic, pushActivity],
  );
  const handleWriteFxModel = useCallback(
    async (slot: EditableFxSlotId, deviceId: NanoFxDeviceId) => {
      if (!nanoBleStateActive) return;

      const protocolModel = getProtocolFxModelByDeviceId(deviceId);
      if (!protocolModel) {
        const message = `No protocol id mapped for ${deviceId}`;
        setFxModelWriteError(message);
        setStatusMsg(message);
        return;
      }

      fxParamAutoReadSessionRef.current += 1;
      fxParamAutoReadKeyRef.current = null;
      clearFxParamWriteTimers();
      setFxParamValuesBySlot((prev) => {
        const next = { ...prev };
        delete next[slot];
        return next;
      });
      setFxParamRefreshError(null);
      setFxParamWriteError(null);
      setFxModelWriteError(null);
      setFxModelWritingSlot(slot);
      pulseDeviceTraffic(`Changing FX model ${slot}`);

      try {
        await setFxModel(slot, protocolModel.rawId);
        markPresetDirty();
        setFxSlotAssignments((prev) => ({ ...prev, [slot]: deviceId }));
        pushActivity(`FX model ${slot} ${protocolModel.displayName}`, "ble");
        await new Promise<void>((resolve) => window.setTimeout(resolve, 320));
        await refreshBackendStateDump();
        await new Promise<void>((resolve) => window.setTimeout(resolve, 220));
        await handleRefreshFxParams(slot, { source: "auto" });
      } catch (err) {
        const message = formatError(err instanceof Error ? err.message : String(err));
        setFxModelWriteError(message);
        setStatusMsg(message);
      } finally {
        setFxModelWritingSlot((current) => (current === slot ? null : current));
      }
    },
    [
      clearFxParamWriteTimers,
      handleRefreshFxParams,
      markPresetDirty,
      nanoBleStateActive,
      pulseDeviceTraffic,
      pushActivity,
      refreshBackendStateDump,
    ],
  );

  const handleFootswitchRotaryChange = useCallback(
    async (footswitch: FootswitchId, value: number) => {
      const next = setFootswitchRotaryPreviewValue(footswitch, value, "local");
      const isCapture = footswitch === "I";
      const label = isCapture ? "Capture" : "Cab/IR";

      if (!nanoBleStateActive) {
        setStatusMsg(`Connect Bluetooth to change ${label} slot`);
        setTimeout(() => setStatusMsg(null), 2200);
        return;
      }

      setAssetSlotWriting(isCapture ? "capture" : "cab-ir");
      setStatusMsg(`Writing ${label} slot ${next}`);
      pulseDeviceTraffic(`Writing ${label} slot ${next}`);
      try {
        if (isCapture) {
          await setCaptureSlot(next);
        } else {
          await setCabIrSlot(next);
        }
        markPresetDirty();
        pushActivity(`${label} slot ${next}`, "ble");
        refreshStateDumpSoon();
        setTimeout(() => setStatusMsg(null), 1800);
      } catch (err) {
        const message = formatError(err instanceof Error ? err.message : String(err));
        setError(message);
        setStatusMsg(message);
        refreshStateDumpSoon();
      } finally {
        setAssetSlotWriting(null);
      }
    },
    [
      markPresetDirty,
      nanoBleStateActive,
      pulseDeviceTraffic,
      pushActivity,
      refreshStateDumpSoon,
      setFootswitchRotaryPreviewValue,
    ],
  );

  useEffect(
    () => () => {
      clearAmpKnobWriteTimers();
      clearFxParamWriteTimers();
    },
    [clearAmpKnobWriteTimers, clearFxParamWriteTimers],
  );
  useEffect(
    () => () => {
      fxParamAutoReadSessionRef.current += 1;
    },
    [],
  );
  // Loading a different preset abandons the previous working edit. A fresh dump is device truth
  // for displayed values, but it must not clear dirty state by itself: physical knob edits also
  // arrive as confirmed state and still need the Nano SAVE hold to persist.
  useEffect(() => {
    currentPresetStartedAtRef.current = Date.now();
    cleanKnobSignatureRef.current = null;
    fxParamAutoReadSessionRef.current += 1;
    fxParamAutoReadKeyRef.current = null;
    cabIrParamAutoReadKeyRef.current = null;
    clearFxParamWriteTimers();
    setFxParamRefreshSlot(null);
    setFxParamRefreshAttempt(null);
    setFxParamValuesBySlot({});
    setFxParamRefreshError(null);
    setCabIrParamValues(null);
    setCabIrParamSlot(null);
    setCabIrParamLoading(false);
    setCabIrParamError(null);
    setFootswitchRotaryPreview({
      I: { value: 0, source: "memory", timestampMs: Date.now() },
      II: { value: 0, source: "memory", timestampMs: Date.now() },
    });
    setFxParamWritingKey(null);
    setFxParamWriteError(null);
    setFxModelWritingSlot(null);
    setFxModelWriteError(null);
    setFixedBlockWriteLabel(null);
    setGateReductionLastSentValue(null);
    setAssetSlotWriting(null);
    setDirtyParams(false);
    dirtyRevisionRef.current = 0;
    setDirtyRevision(0);
    lastAutoSaveRevisionRef.current = 0;
  }, [clearFxParamWriteTimers, currentPreset]);
  useEffect(() => {
    if (nanoBleStateActive) return;
    fxParamAutoReadSessionRef.current += 1;
    fxParamAutoReadKeyRef.current = null;
    cabIrParamAutoReadKeyRef.current = null;
    clearFxParamWriteTimers();
    lastFxModelSignatureRef.current = "";
    setFxParamRefreshSlot(null);
    setFxParamRefreshAttempt(null);
    setFxParamValuesBySlot({});
    setFxParamRefreshError(null);
    setCabIrParamValues(null);
    setCabIrParamSlot(null);
    setCabIrParamLoading(false);
    setCabIrParamError(null);
    setFxParamWritingKey(null);
    setFxParamWriteError(null);
    setFxModelWritingSlot(null);
    setFxModelWriteError(null);
    setFixedBlockWriteLabel(null);
    setAssetSlotWriting(null);
  }, [clearFxParamWriteTimers, nanoBleStateActive]);
  useEffect(() => {
    if (!deviceFxModelSignature) return;
    if (lastFxModelSignatureRef.current === deviceFxModelSignature) return;
    lastFxModelSignatureRef.current = deviceFxModelSignature;
    fxParamAutoReadSessionRef.current += 1;
    fxParamAutoReadKeyRef.current = null;
    cabIrParamAutoReadKeyRef.current = null;
    clearFxParamWriteTimers();
    setFxParamRefreshSlot(null);
    setFxParamRefreshAttempt(null);
    setFxParamValuesBySlot({});
    setFxParamRefreshError(null);
    setFxParamWritingKey(null);
    setFxParamWriteError(null);
    setFxModelWritingSlot(null);
    setFxModelWriteError(null);
    setFixedBlockWriteLabel(null);
  }, [clearFxParamWriteTimers, deviceFxModelSignature]);
  useEffect(() => {
    if (!nanoBleStateActive || latestDumpTimestamp === null || !deviceStateDump) return;
    if (deviceStateDump.timestampMs < currentPresetStartedAtRef.current) return;

    const readKey = `${currentPreset}:${currentPresetStartedAtRef.current}:${deviceFxModelSignature}`;
    if (fxParamAutoReadKeyRef.current === readKey) return;
    fxParamAutoReadKeyRef.current = readKey;

    const session = fxParamAutoReadSessionRef.current + 1;
    fxParamAutoReadSessionRef.current = session;
    const readParams = async () => {
      await new Promise<void>((resolve) =>
        window.setTimeout(resolve, AUTO_FX_PARAM_REFRESH_DELAY_MS),
      );
      for (const slot of AUTO_FX_PARAM_REFRESH_SLOTS) {
        for (let attempt = 1; attempt <= AUTO_FX_PARAM_REFRESH_MAX_ATTEMPTS; attempt += 1) {
          if (session !== fxParamAutoReadSessionRef.current) return;
          const synced = await handleRefreshFxParams(slot, {
            session,
            source: "auto",
            attempt,
            maxAttempts: AUTO_FX_PARAM_REFRESH_MAX_ATTEMPTS,
            quiet: attempt < AUTO_FX_PARAM_REFRESH_MAX_ATTEMPTS,
            holdLoading: true,
          });
          if (synced || session !== fxParamAutoReadSessionRef.current) break;
          await new Promise<void>((resolve) =>
            window.setTimeout(resolve, AUTO_FX_PARAM_REFRESH_DELAY_MS * attempt),
          );
        }
        if (session !== fxParamAutoReadSessionRef.current) return;
        setFxParamRefreshSlot(null);
        setFxParamRefreshAttempt(null);
        await new Promise<void>((resolve) =>
          window.setTimeout(resolve, AUTO_FX_PARAM_REFRESH_DELAY_MS),
        );
      }
      if (session === fxParamAutoReadSessionRef.current) {
        pushActivity("FX params auto-read", "ble");
      }
    };

    void readParams();
  }, [
    currentPreset,
    deviceStateDump,
    deviceFxModelSignature,
    handleRefreshFxParams,
    latestDumpTimestamp,
    nanoBleStateActive,
    pushActivity,
  ]);
  useEffect(() => {
    if (!nanoBleStateActive || latestDumpTimestamp === null || !deviceStateDump) return;
    if (deviceStateDump.timestampMs < currentPresetStartedAtRef.current) return;
    if (deviceStateDump.cabIrOn !== true || currentCabIrSlot === null) return;

    const readKey = `${currentPreset}:${currentPresetStartedAtRef.current}:${currentCabIrSlot}:${deviceStateDump.irName ?? ""}`;
    if (cabIrParamAutoReadKeyRef.current === readKey) return;
    cabIrParamAutoReadKeyRef.current = readKey;

    const timer = window.setTimeout(() => {
      void handleRefreshCabIrParams(currentCabIrSlot, "auto");
    }, AUTO_FX_PARAM_REFRESH_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [
    currentCabIrSlot,
    currentPreset,
    deviceStateDump,
    handleRefreshCabIrParams,
    latestDumpTimestamp,
    nanoBleStateActive,
  ]);
  useEffect(() => {
    const signature = ampKnobSignature(deviceStateDump ?? null);
    if (!signature) return;
    if (deviceStateDump && deviceStateDump.timestampMs < currentPresetStartedAtRef.current) return;
    if (!cleanKnobSignatureRef.current || cleanKnobSignatureRef.current.preset !== currentPreset) {
      cleanKnobSignatureRef.current = { preset: currentPreset, signature };
    }
  }, [currentPreset, deviceStateDump]);

  // Save-mode preference (manual matches the Nano: edits stay unsaved until an explicit Save).
  const [saveMode, setSaveMode] = useState<SaveMode>(() =>
    window.localStorage.getItem(SAVE_MODE_STORAGE_KEY) === "auto" ? "auto" : "manual",
  );
  const handleSaveModeChange = useCallback((mode: SaveMode) => {
    setSaveMode(mode);
    window.localStorage.setItem(SAVE_MODE_STORAGE_KEY, mode);
  }, []);
  const [dirtyPresetSwitchMode, setDirtyPresetSwitchMode] = useState<DirtyPresetSwitchMode>(() =>
    window.localStorage.getItem(DIRTY_PRESET_SWITCH_MODE_STORAGE_KEY) === "auto-discard"
      ? "auto-discard"
      : "confirm",
  );
  const handleDirtyPresetSwitchModeChange = useCallback((mode: DirtyPresetSwitchMode) => {
    setDirtyPresetSwitchMode(mode);
    window.localStorage.setItem(DIRTY_PRESET_SWITCH_MODE_STORAGE_KEY, mode);
  }, []);

  // Console workspace side panels; defaults keep presets open and tone tools one click away.
  const [railCollapsed, setRailCollapsed] = useState(
    () => window.localStorage.getItem(LIVE_PRESET_RAIL_COLLAPSED_KEY) === "true",
  );
  useEffect(() => {
    window.localStorage.setItem(LIVE_PRESET_RAIL_COLLAPSED_KEY, String(railCollapsed));
  }, [railCollapsed]);
  useEffect(() => {
    if (!toneStudioOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setToneStudioOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [toneStudioOpen]);

  const clearWorkingDeviceState = useCallback(
    (options: { resync?: boolean } = {}) => {
      pendingFootswitchAssignmentRef.current = null;
      cleanKnobSignatureRef.current = null;
      clearAmpKnobWriteTimers();
      clearFxParamWriteTimers();
      fxParamAutoReadSessionRef.current += 1;
      fxParamAutoReadKeyRef.current = null;
      cabIrParamAutoReadKeyRef.current = null;
      setFxParamRefreshSlot(null);
      setFxParamRefreshAttempt(null);
      setFxParamValuesBySlot({});
      setFxParamRefreshError(null);
      setCabIrParamValues(null);
      setCabIrParamSlot(null);
      setCabIrParamLoading(false);
      setCabIrParamError(null);
      setFxParamWritingKey(null);
      setFxParamWriteError(null);
      setFxModelWritingSlot(null);
      setFxModelWriteError(null);
      setFixedBlockWriteLabel(null);
      setGateReductionLastSentValue(null);
      setDirtyParams(false);
      dirtyRevisionRef.current = 0;
      setDirtyRevision(0);
      lastAutoSaveRevisionRef.current = 0;
      if (options.resync) refreshStateDumpSoon();
    },
    [clearAmpKnobWriteTimers, clearFxParamWriteTimers, refreshStateDumpSoon],
  );

  const switchPreset = useCallback(
    async (id: number) => {
      if (!nanoUsbControlActive) {
        setStatusMsg("Connect USB to recall presets");
        setTimeout(() => setStatusMsg(null), 2200);
        return;
      }
      if (presetSwitchInFlightRef.current) return;
      presetSwitchInFlightRef.current = true;
      setPresetSyncPreset(id);
      setCurrentPreset(id);
      rememberLastOpenedPreset(id);
      setError(null);
      try {
        pulseDeviceTraffic(`Recalling ${presetLabel(id)}`);
        await connection.recallPreset(id, midiChannel);
        setLastUsbOutbound(buildUsbPcSync(id, midiChannel));
        appendMidiLog({
          kind: "pc",
          channel: midiChannel,
          number: id,
          label: `Recall preset PC ${id}`,
          bytes: [0xc0 | (midiChannel - 1), id],
        });
        if (isBleConnected) {
          // Ack the app-initiated preset change (PC → ack → state request) so the device
          // leaves its pending preset-change context; without it subsequent PC can be
          // ignored until the on-device EXIT is pressed.
          await acknowledgePresetChange().catch(() => {});
          await new Promise((resolve) => window.setTimeout(resolve, 450));
          await refreshBackendStateDump();
        }
      } catch (err) {
        setError(formatError(String(err)));
      } finally {
        presetSwitchInFlightRef.current = false;
        setPresetSyncPreset(null);
      }
    },
    [
      appendMidiLog,
      connection,
      isBleConnected,
      midiChannel,
      nanoUsbControlActive,
      pulseDeviceTraffic,
      refreshBackendStateDump,
    ],
  );
  const requestPresetSwitch = useCallback(
    async (id: number) => {
      if (id === currentPreset) return;
      if (dirtyParams) {
        if (dirtyPresetSwitchMode === "auto-discard") {
          clearWorkingDeviceState();
          setStatusMsg(`Discarded edits; switching to ${presetLabel(id)}`);
          setTimeout(() => setStatusMsg(null), 2400);
          await switchPreset(id);
          return;
        }
        setPendingPresetSwitch(id);
        setStatusMsg(`Switching to ${presetLabel(id)} will discard unsaved live edits`);
        setTimeout(() => setStatusMsg(null), 3000);
        return;
      }
      await switchPreset(id);
    },
    [clearWorkingDeviceState, currentPreset, dirtyParams, dirtyPresetSwitchMode, switchPreset],
  );
  const presetInteractionsDisabled = presetSyncPreset !== null || deviceStateLoading;
  const dockSyncMessage = (() => {
    if (saveInFlight) return "Saving preset to device";
    if (assetSlotWriting === "capture") return "Writing Capture slot";
    if (assetSlotWriting === "cab-ir") return "Writing Cab/IR slot";
    if (fxModelWritingSlot) return `Changing FX model ${fxModelWritingSlot}`;
    if (fxParamWritingKey) return "Writing FX parameter";
    if (fixedBlockWriteLabel) return fixedBlockWriteLabel;
    if (fxParamRefreshSlot) return `Reading FX parameters for ${fxParamRefreshSlot}`;
    if (cabIrParamLoading) {
      return cabIrParamSlot
        ? `Reading Cab/IR values for slot ${cabIrParamSlot}`
        : "Reading Cab/IR values";
    }
    if (presetSyncPreset !== null) return `Syncing ${presetLabel(presetSyncPreset)}`;
    if (deviceStateLoading) return "Reading device state";
    if (metadataLoading) return "Reading preset names";
    if (isConnecting) return "Connecting to device";
    if (bleObserverState === "scanning") return "Scanning Bluetooth";
    if (deviceTrafficMessage) return deviceTrafficMessage;
    return null;
  })();
  const deviceTrafficActive = Boolean(dockSyncMessage);
  const presetMetadataDockMessage =
    presetMetadataStatus.source === "idle" ? null : metadataStatusLabel(presetMetadataStatus);

  const handleFootswitchPress = useCallback(
    async (footswitch: FootswitchId) => {
      if (!nanoUsbControlActive || presetInteractionsDisabled) return;

      const result = applyFootswitchPressModel(footswitchStateRef.current, footswitch);
      footswitchStateRef.current = result.nextState;
      setFootswitchState(result.nextState);
      setStatusMsg(result.status);
      setTimeout(() => setStatusMsg(null), 1800);
      if (result.selectedPreset !== null) await requestPresetSwitch(result.selectedPreset);
    },
    [nanoUsbControlActive, presetInteractionsDisabled, requestPresetSwitch],
  );

  const handleAssignFootswitchPreset = useCallback(
    async (slot: QuickPresetSlot, preset: number) => {
      const safePreset = Math.max(0, Math.min(63, Math.round(preset)));

      if (!nanoBleStateActive) {
        setStatusMsg("Connect Bluetooth to write footswitch assignments to the device");
        setTimeout(() => setStatusMsg(null), 2600);
        return;
      }

      const previous = footswitchStateRef.current;
      const next = assignQuickPresetSlot(previous, slot, safePreset);
      const requestedAssignments = footswitchAssignmentsPayload(next);
      const label = `Writing ${quickPresetSlotLabel(slot)} assignment`;
      setFixedBlockWriteLabel(label);
      pulseDeviceTraffic(label);
      try {
        pendingFootswitchAssignmentRef.current = requestedAssignments;
        await setFootswitchAssignments(currentPreset, requestedAssignments);
        pushActivity(
          `${quickPresetSlotLabel(slot)} assignment request ${presetLabel(safePreset)} / PC ${safePreset}`,
          "ble",
        );
        refreshStateDumpSoon();
        setStatusMsg(
          `Sent ${quickPresetSlotLabel(slot)} -> ${presetLabel(safePreset)} / PC ${safePreset}; waiting for device sync`,
        );
      } catch (error) {
        pendingFootswitchAssignmentRef.current = null;
        const message = formatError(error instanceof Error ? error.message : String(error));
        setStatusMsg(`Footswitch assignment failed: ${message}`);
        pushActivity(`Footswitch assignment failed: ${message}`, "error");
      } finally {
        setFixedBlockWriteLabel(null);
        setTimeout(() => setStatusMsg(null), 3200);
      }
    },
    [currentPreset, nanoBleStateActive, pulseDeviceTraffic, pushActivity, refreshStateDumpSoon],
  );

  const handleActivateFootswitchAssignment = useCallback(
    async (slot: QuickPresetSlot) => {
      if (!nanoUsbControlActive || presetInteractionsDisabled) return;

      const result = applyQuickPresetSlotSelection(footswitchStateRef.current, slot);
      footswitchStateRef.current = result.nextState;
      setFootswitchState(result.nextState);
      setStatusMsg(result.status);
      setTimeout(() => setStatusMsg(null), 1800);
      await requestPresetSwitch(result.selectedPreset);
    },
    [nanoUsbControlActive, presetInteractionsDisabled, requestPresetSwitch],
  );

  const handleToggleCC = useCallback(
    async (cc: number) => {
      if (!nanoUsbControlActive) {
        setStatusMsg("Connect USB to send bypass and tuner commands");
        setTimeout(() => setStatusMsg(null), 2200);
        return;
      }
      const next = !ccState[cc];
      setCcState((prev) => ({ ...prev, [cc]: next }));
      const fxIndex = FX_SLOT_CC.indexOf(cc);
      if (fxIndex >= 0) {
        markPresetDirty();
      }
      if (cc === MIDI_CC.TUNER) setTunerState(next);
      setError(null);
      try {
        pulseDeviceTraffic(`Writing CC ${cc}`);
        await connection.sendControlChange(cc, next ? 127 : 0, midiChannel);
        setLastUsbOutbound(buildUsbCcSync(cc, next ? 127 : 0, midiChannel));
        appendMidiLog({
          kind: "cc",
          channel: midiChannel,
          number: cc,
          value: next ? 127 : 0,
          label: `CC ${cc} ${next ? "on" : "off"}`,
          bytes: [0xb0 | (midiChannel - 1), cc, next ? 127 : 0],
        });
      } catch (err) {
        setError(formatError(String(err)));
      }
    },
    [
      appendMidiLog,
      ccState,
      connection,
      markPresetDirty,
      midiChannel,
      nanoUsbControlActive,
      pulseDeviceTraffic,
    ],
  );

  const handleTapTempo = useCallback(async () => {
    if (!nanoUsbControlActive) {
      setStatusMsg("Connect USB to send Tap Tempo");
      setTimeout(() => setStatusMsg(null), 2200);
      return;
    }
    setError(null);
    try {
      pulseDeviceTraffic("Sending tap tempo");
      await connection.sendTapTempo(midiChannel);
      setLastUsbOutbound(buildUsbCcSync(MIDI_CC.TAP_TEMPO, 127, midiChannel, "Sent"));
      pushActivity("Sent tap tempo", "usb");
      appendMidiLog({
        kind: "cc",
        channel: midiChannel,
        number: MIDI_CC.TAP_TEMPO,
        value: 127,
        label: "Tap tempo CC42",
        bytes: [0xb0 | (midiChannel - 1), MIDI_CC.TAP_TEMPO, 127],
      });
    } catch (err) {
      setError(formatError(String(err)));
    }
  }, [
    appendMidiLog,
    connection,
    midiChannel,
    nanoUsbControlActive,
    pulseDeviceTraffic,
    pushActivity,
  ]);

  const handleSetTempoBpm = useCallback(
    (bpm: number) => {
      const safeBpm = Math.max(BPM_MIN, Math.min(BPM_MAX, Math.round(bpm)));
      if (!Number.isFinite(safeBpm)) return;
      if (!nanoUsbControlActive) {
        setStatusMsg("Connect USB to set Tap Tempo");
        setTimeout(() => setStatusMsg(null), 2200);
        return;
      }
      tempoBurstTimersRef.current.forEach((id) => window.clearTimeout(id));
      tempoBurstTimersRef.current = [];
      const intervalMs = Math.round(60000 / safeBpm);
      for (let tap = 0; tap < TEMPO_BURST_TAPS; tap += 1) {
        const id = window.setTimeout(() => {
          void handleTapTempo();
        }, tap * intervalMs);
        tempoBurstTimersRef.current.push(id);
      }
      setLastSetBpm(safeBpm);
      setStatusMsg(`Setting tempo to ${safeBpm} BPM`);
      setTimeout(() => setStatusMsg(null), 2200);
    },
    [handleTapTempo, nanoUsbControlActive],
  );

  // Save/Discard for the active preset. Save writes the live device state and current preset name
  // back into the selected preset slot; Discard mirrors EXIT by abandoning local working state and
  // rebuilding from device truth.
  const activePresetName = presetNames[currentPreset]?.trim() ?? "";
  const saveCapable =
    nanoUsbControlActive &&
    nanoBleStateActive &&
    activePresetName.length > 0 &&
    presetSyncPreset === null &&
    !deviceStateLoading &&
    !saveInFlight;
  useEffect(() => {
    setSaveDialogOpen(false);
    setPendingPresetSwitch(null);
  }, [activePresetName, currentPreset, dirtyParams]);
  const handleSaveUnavailable = useCallback(() => {
    setStatusMsg(
      activePresetName
        ? "Connect USB and Bluetooth before saving to the device"
        : "Wait for preset names before saving to the device",
    );
    setTimeout(() => setStatusMsg(null), 2400);
  }, [activePresetName]);
  const saveActivePresetNow = useCallback(
    (trigger: SaveTrigger) => {
      if (!saveCapable) {
        handleSaveUnavailable();
        return;
      }

      const label = presetLabel(currentPreset);
      const name = activePresetName;
      const revisionAtStart = dirtyRevisionRef.current;
      setSaveInFlight(true);
      setSaveDialogOpen(false);
      setStatusMsg(
        trigger === "auto" ? `Auto-saving ${label} to device` : `Saving ${label} to device`,
      );
      saveActivePreset(currentPreset, name)
        .then(() => {
          const signature = ampKnobSignature(deviceStateDump ?? null);
          if (signature) cleanKnobSignatureRef.current = { preset: currentPreset, signature };
          if (dirtyRevisionRef.current === revisionAtStart) {
            setDirtyParams(false);
          }
          pushActivity(
            trigger === "auto" ? `Auto-saved ${label} to device` : `Saved ${label} to device`,
            "ble",
          );
          refreshStateDumpSoon();
          refreshPresetMetadataSoon(900);
          setStatusMsg(
            trigger === "auto" ? `Auto-saved ${label} to device` : `Saved ${label} to device`,
          );
          setTimeout(() => setStatusMsg(null), 2400);
        })
        .catch((err) => {
          const message = formatError(String(err));
          setError(message);
          setStatusMsg(message);
        })
        .finally(() => setSaveInFlight(false));
    },
    [
      activePresetName,
      currentPreset,
      deviceStateDump,
      handleSaveUnavailable,
      pushActivity,
      refreshPresetMetadataSoon,
      refreshStateDumpSoon,
      saveCapable,
    ],
  );
  const handleSaveActivePreset = useCallback(() => {
    if (!saveCapable) {
      handleSaveUnavailable();
      return;
    }

    setSaveDialogOpen(true);
  }, [handleSaveUnavailable, saveCapable]);
  const confirmSaveActivePreset = useCallback(() => {
    saveActivePresetNow("manual");
  }, [saveActivePresetNow]);
  useEffect(() => {
    if (saveMode !== "auto" || !dirtyParams || !saveCapable || saveInFlight || saveDialogOpen) {
      return;
    }
    const revision = dirtyRevision;
    if (revision <= 0 || lastAutoSaveRevisionRef.current === revision) return;

    window.clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = window.setTimeout(() => {
      if (lastAutoSaveRevisionRef.current === revision) return;
      lastAutoSaveRevisionRef.current = revision;
      saveActivePresetNow("auto");
    }, AUTO_SAVE_DEBOUNCE_MS);

    return () => window.clearTimeout(autoSaveTimerRef.current);
  }, [
    dirtyParams,
    dirtyRevision,
    saveActivePresetNow,
    saveCapable,
    saveDialogOpen,
    saveInFlight,
    saveMode,
  ]);
  const handleDiscardActivePreset = useCallback(() => {
    clearWorkingDeviceState();
    void switchPreset(currentPreset);
    refreshStateDumpSoon();
  }, [clearWorkingDeviceState, switchPreset, currentPreset, refreshStateDumpSoon]);
  const cancelPendingPresetSwitch = useCallback(() => {
    setPendingPresetSwitch(null);
  }, []);
  const confirmPendingPresetSwitch = useCallback(() => {
    if (pendingPresetSwitch === null) return;
    const target = pendingPresetSwitch;
    setPendingPresetSwitch(null);
    clearWorkingDeviceState();
    void switchPreset(target);
  }, [clearWorkingDeviceState, pendingPresetSwitch, switchPreset]);

  const handleSetTunerEnabled = useCallback(
    async (enabled: boolean) => {
      if (!nanoUsbControlActive) {
        setStatusMsg("Connect USB to open the tuner");
        setTimeout(() => setStatusMsg(null), 2200);
        return;
      }
      setTunerState(enabled);
      setError(null);
      try {
        pulseDeviceTraffic(`Writing tuner ${enabled ? "on" : "off"}`);
        await connection.setTunerEnabled(enabled, midiChannel);
        setLastUsbOutbound(buildUsbCcSync(MIDI_CC.TUNER, enabled ? 127 : 0, midiChannel));
        pushActivity(`Tuner ${enabled ? "on" : "off"}`, "usb");
        appendMidiLog({
          kind: "cc",
          channel: midiChannel,
          number: MIDI_CC.TUNER,
          value: enabled ? 127 : 0,
          label: `Tuner ${enabled ? "on" : "off"}`,
          bytes: [0xb0 | (midiChannel - 1), MIDI_CC.TUNER, enabled ? 127 : 0],
        });
      } catch (err) {
        setError(formatError(String(err)));
      }
    },
    [
      appendMidiLog,
      connection,
      midiChannel,
      nanoUsbControlActive,
      pulseDeviceTraffic,
      pushActivity,
    ],
  );

  const handleFootswitchLongPress = useCallback(
    async (footswitch: FootswitchId) => {
      if (!nanoUsbControlActive) return;
      const action =
        footswitch === "I"
          ? footswitchStateRef.current.footswitchI.longPressAction
          : footswitchStateRef.current.footswitchII.longPressAction;

      if (action === "tap-tempo") {
        setStatusMsg(`Footswitch ${footswitch} hold -> Tap Tempo`);
        await handleTapTempo();
        setTimeout(() => setStatusMsg(null), 1800);
        return;
      }

      const next = !tunerState;
      setStatusMsg(`Footswitch ${footswitch} hold -> Tuner ${next ? "on" : "off"}`);
      await handleSetTunerEnabled(next);
      setTimeout(() => setStatusMsg(null), 1800);
    },
    [handleSetTunerEnabled, handleTapTempo, nanoUsbControlActive, tunerState],
  );

  const keyboardActions = useMemo(
    () => ({
      onTapTempo: handleTapTempo,
      onToggleTuner: () => handleSetTunerEnabled(!tunerState),
      onFootswitchPress: handleFootswitchPress,
      onFootswitchLongPress: handleFootswitchLongPress,
      onFootswitchRotaryNudge: nudgeFootswitchRotaryPreview,
    }),
    [
      handleFootswitchLongPress,
      handleFootswitchPress,
      handleSetTunerEnabled,
      handleTapTempo,
      nudgeFootswitchRotaryPreview,
      tunerState,
    ],
  );

  usePreset(
    requestPresetSwitch,
    currentPreset,
    isConnected,
    keyboardActions,
    presetInteractionsDisabled,
  );

  const handleSetExpression = useCallback(
    (value: number) => {
      changeExpression(value);
    },
    [changeExpression],
  );

  const handleStartTraceAction = useCallback(async (label: string) => {
    const startedAt = Date.now();
    await traceMarker(label, "start");
    activeTraceLabelRef.current = label;
    setTraceSession({
      label,
      activeLabel: label,
      startedAt,
      stoppedAt: null,
      midiCount: 0,
      latestMidiBytes: null,
    });
    setShowLogs(true);
    setStatusMsg(`Trace started: ${label}`);
  }, []);

  const handleStopTraceAction = useCallback(async () => {
    const label = activeTraceLabelRef.current;
    if (!label) return;
    await traceMarker(label, "stop");
    activeTraceLabelRef.current = null;
    setTraceSession((prev) => ({
      ...prev,
      activeLabel: null,
      stoppedAt: Date.now(),
    }));
    setStatusMsg(`Trace stopped: ${label}`);
  }, []);

  const handleConnectUsb = useCallback(async () => {
    setIsConnecting(true);
    setError(null);
    pulseDeviceTraffic("Scanning USB ports");
    setStatusMsg("Scanning USB ports...");
    try {
      const available = await listPorts();
      if (available.length === 0) {
        setError("No MIDI devices found. Connect your Nano Cortex via USB.");
        return;
      }
      const target =
        available.find(
          (p) => p.name.toLowerCase().includes("nano") || p.name.toLowerCase().includes("cortex"),
        ) || available[0];
      await connectTo(target.name);
      setStatusMsg(`Connected via USB: ${target.name}`);
      setTimeout(() => setStatusMsg(null), 3000);
    } catch (err) {
      setError(formatError(String(err)));
    } finally {
      setIsConnecting(false);
    }
  }, [connectTo, pulseDeviceTraffic]);

  const handleConnectBle = useCallback(async () => {
    setIsConnecting(true);
    setError(null);
    setBleObserverState("scanning");
    pulseDeviceTraffic("Scanning Bluetooth");
    setStatusMsg("Scanning for Bluetooth devices...");
    try {
      const lower = deviceName?.toLowerCase() ?? "";
      const keepUsbPrimary = isConnected && !(lower.includes("bluetooth") || lower.includes("ble"));
      const result = await bleScan();
      setBleObserverState("ready");
      setStatusMsg(
        keepUsbPrimary ? `Bluetooth observer ready / ${result.join(" / ")}` : result.join(" / "),
      );
      if (!keepUsbPrimary) {
        adoptConnection("Neural DSP Nano Cortex (Bluetooth)");
      }
      setTimeout(() => setStatusMsg(null), 4000);
    } catch (err) {
      setBleObserverState("error");
      setError(formatError(String(err)));
    } finally {
      setIsConnecting(false);
    }
  }, [adoptConnection, deviceName, isConnected, pulseDeviceTraffic]);

  const handleDisconnect = useCallback(async () => {
    pulseDeviceTraffic("Disconnecting device");
    await disconnect();
    activeTraceLabelRef.current = null;
    pendingFootswitchAssignmentRef.current = null;
    setTraceSession((prev) => ({
      ...prev,
      activeLabel: null,
      stoppedAt: prev.startedAt ? Date.now() : prev.stoppedAt,
    }));
    setCurrentPreset(0);
    setCcState({ ...DEFAULT_CC_STATE });
    setTunerState(false);
    setExpressionLocalValue(0);
    setBleObserverState("offline");
    setFootswitchState((prev) => ({
      ...prev,
      footswitchI: { ...prev.footswitchI, activeSubslot: "A" },
      footswitchII: { ...prev.footswitchII, activeSubslot: "A", globalBypassEnabled: false },
    }));
    setFootswitchRotaryPreview({
      I: { value: 0, source: "memory", timestampMs: Date.now() },
      II: { value: 0, source: "memory", timestampMs: Date.now() },
    });
    setStatusMsg(null);
  }, [disconnect, pulseDeviceTraffic, setExpressionLocalValue]);

  useEffect(() => {
    for (const event of observedHardwareEvents) {
      const eventKey = `${event.timestampMs}:${event.value}:${event.payloadHex}`;
      if (handledBleHardwareRef.current[event.id] === eventKey) continue;
      handledBleHardwareRef.current[event.id] = eventKey;
      latestDecodedBleActivityRef.current = event.timestampMs;
      pulseDeviceTraffic(`Bluetooth ${event.label}`);

      if (event.id === "bankItem") {
        if (typeof event.numericValue === "number")
          adoptBlePresetSelection(event.numericValue, event.footswitchAssignments);
        refreshStateDumpSoon();
        continue;
      }
      if (event.id === "footswitchI") {
        if (event.value === "Hold") void handleFootswitchLongPress("I");
        else setStatusMsg(`Bluetooth Footswitch I ${event.value}`);
        refreshStateDumpSoon(); // pressing a footswitch can load a different preset
        continue;
      }
      if (event.id === "footswitchII") {
        if (event.value === "Hold") void handleFootswitchLongPress("II");
        else setStatusMsg(`Bluetooth Footswitch II ${event.value}`);
        refreshStateDumpSoon();
        continue;
      }
      if (event.id === "encoderI") {
        if (
          typeof event.numericValue === "number" &&
          event.numericValue >= 0 &&
          event.numericValue <= FOOTSWITCH_ROTARY_MAX
        ) {
          setFootswitchRotaryPreviewValue("I", event.numericValue, "live");
          markPresetDirty();
          setStatusMsg(`Bluetooth Footswitch I slot ${event.numericValue}`);
        } else {
          setStatusMsg(`Bluetooth Footswitch I raw ${event.value}`);
        }
        setTimeout(() => setStatusMsg(null), 1600);
        refreshStateDumpSoon(); // rotary twist changes capture/IR/bank → new device state
        continue;
      }
      if (event.id === "encoderII") {
        if (
          typeof event.numericValue === "number" &&
          event.numericValue >= 0 &&
          event.numericValue <= FOOTSWITCH_ROTARY_MAX
        ) {
          setFootswitchRotaryPreviewValue("II", event.numericValue, "live");
          markPresetDirty();
          setStatusMsg(`Bluetooth Footswitch II slot ${event.numericValue}`);
        } else {
          setStatusMsg(`Bluetooth Footswitch II raw ${event.value}`);
        }
        setTimeout(() => setStatusMsg(null), 1600);
        refreshStateDumpSoon();
        continue;
      }
      if (
        event.id === "bank" ||
        event.id === "fx" ||
        event.id === "save" ||
        event.id === "exit" ||
        event.id === "capture"
      ) {
        if (event.id === "save") {
          const signature = ampKnobSignature(deviceStateDump ?? null);
          if (signature) cleanKnobSignatureRef.current = { preset: currentPreset, signature };
          setDirtyParams(false);
        } else if (event.id === "exit") {
          clearWorkingDeviceState({ resync: true });
        }
        setStatusMsg(`Bluetooth ${event.label} ${event.value}`);
        setTimeout(() => setStatusMsg(null), 1600);
        refreshStateDumpSoon(); // bank / FX / capture selection changes the loaded state
      }
    }
  }, [
    adoptBlePresetSelection,
    currentPreset,
    clearWorkingDeviceState,
    deviceStateDump,
    handleFootswitchLongPress,
    markPresetDirty,
    observedHardwareEvents,
    pulseDeviceTraffic,
    refreshStateDumpSoon,
    setFootswitchRotaryPreviewValue,
  ]);

  useEffect(() => {
    const unsubs: Array<() => void> = [];

    onDisconnected(() => {
      activeTraceLabelRef.current = null;
      pendingFootswitchAssignmentRef.current = null;
      setTraceSession((prev) => ({
        ...prev,
        activeLabel: null,
        stoppedAt: prev.startedAt ? Date.now() : prev.stoppedAt,
      }));
      setCurrentPreset(0);
      setCcState({ ...DEFAULT_CC_STATE });
      setTunerState(false);
      setExpressionLocalValue(0);
      setFootswitchState((prev) => ({
        ...prev,
        footswitchI: { ...prev.footswitchI, activeSubslot: "A" },
        footswitchII: { ...prev.footswitchII, activeSubslot: "A", globalBypassEnabled: false },
      }));
      setStatusMsg("Device disconnected");
      setTimeout(() => setStatusMsg(null), 4000);
    }).then((fn) => unsubs.push(fn));

    onMidiMessage((payload) => {
      const bytes = payload.bytes;
      if (!bytes.length) return;
      pulseDeviceTraffic("USB MIDI in");
      const traceLabel = activeTraceLabelRef.current;
      if (traceLabel) {
        setTraceSession((prev) => ({
          ...prev,
          midiCount: prev.activeLabel ? prev.midiCount + 1 : prev.midiCount,
          latestMidiBytes: bytes,
        }));
      }
      const status = bytes[0];
      const type = status & 0xf0;
      const channel = (status & 0x0f) + 1;

      if (type === 0xc0 && bytes.length >= 2) {
        const pc = bytes[1];
        if (pc < 64) {
          setCurrentPreset(pc);
          rememberLastOpenedPreset(pc);
          setLastUsbInbound({
            kind: "pc",
            summary: `Preset ${presetLabel(pc)}`,
            detail: `Program Change ${pc}`,
            channel,
            bytes,
            timestampMs: Date.now(),
          });
          appendMidiLog({
            kind: "pc",
            channel,
            number: pc,
            label: traceLabel
              ? `[${traceLabel}] MIDI in: preset PC ${pc}`
              : `MIDI in: preset PC ${pc}`,
            bytes,
          });
        }
      } else if (type === 0xb0 && bytes.length >= 3) {
        const cc = bytes[1];
        const value = bytes[2];
        const enabled = value >= 64;
        const isKnownToggle =
          cc in DEFAULT_CC_STATE || FX_SLOT_CC.includes(cc) || cc === MIDI_CC.TUNER;
        if (isKnownToggle) {
          setCcState((prev) => ({ ...prev, [cc]: enabled }));
        }
        if (cc === MIDI_CC.TUNER) setTunerState(enabled);
        if (cc === MIDI_CC.EXPRESSION) setExpressionLocalValue(value);
        const described = describeIncomingCc(cc, value);
        setLastUsbInbound({
          kind: "cc",
          ...described,
          channel,
          bytes,
          timestampMs: Date.now(),
        });
        appendMidiLog({
          kind: "cc",
          channel,
          number: cc,
          value,
          label: traceLabel
            ? `[${traceLabel}] MIDI in: CC ${cc} = ${value}`
            : `MIDI in: CC ${cc} = ${value}`,
          bytes,
        });
      } else {
        const described = describeRawMidi(bytes);
        setLastUsbInbound({
          kind: "raw",
          ...described,
          bytes,
          timestampMs: Date.now(),
        });
        appendMidiLog({
          kind: "raw",
          channel: described.channel,
          number: bytes[0] ?? 0,
          label: traceLabel
            ? `[${traceLabel}] MIDI in: ${described.detail}`
            : `MIDI in: ${described.detail}`,
          bytes,
        });
      }
    }).then((fn) => unsubs.push(fn));

    return () => {
      unsubs.forEach((fn) => fn());
    };
  }, [appendMidiLog, pulseDeviceTraffic, setExpressionLocalValue]);

  useEffect(() => {
    refreshPorts();
  }, [refreshPorts]);

  return (
    <div
      className={[
        "min-h-screen font-primary selection:bg-cyan-500/25 flex flex-col",
        deviceTrafficActive ? "cursor-wait [&_*]:cursor-wait" : "",
      ].join(" ")}
      aria-busy={deviceTrafficActive}
    >
      {/* ── Top bar: brand + connection ── */}
      <StatusBar
        isConnected={isConnected}
        isConnecting={isConnecting}
        deviceName={deviceName}
        usbControlActive={nanoUsbControlActive}
        bleStateActive={nanoBleStateActive}
        statusMsg={null}
        error={error || connError}
        onConnectUsb={handleConnectUsb}
        onConnectBle={handleConnectBle}
        onDisconnect={handleDisconnect}
        onPingBle={async () => {
          try {
            pulseDeviceTraffic("Pinging Bluetooth");
            await blePing();
          } catch {
            // best-effort availability probe; surfaced via the log panel, not fatal
          }
        }}
        onToggleLogs={() => setShowLogs((v) => !v)}
        logCount={logs.length}
        updateVersion={updateState.status === "update" ? updateState.version : null}
        onShowUpdate={() => setMainSurface("about")}
      />

      {supportNudgeVisible && (
        <SupportNudge
          onSupport={() => {
            setMainSurface("about");
            dismissSupportNudge();
          }}
          onDismiss={dismissSupportNudge}
        />
      )}

      {updateNudgeVisible && !supportNudgeVisible && updateState.status === "update" && (
        <UpdateNudge
          version={updateState.version}
          onView={() => {
            setMainSurface("about");
            dismissUpdateNudge();
          }}
          onDismiss={dismissUpdateNudge}
        />
      )}

      {/* ── Main panel ── */}
      <main className="flex-1 w-full min-w-0 px-2 pt-[4.5rem] pb-2 short:pt-[4.25rem] short:pb-0.5 sm:px-4 lg:px-5 xl:px-6">
        <div className="w-full min-w-0">
          <DeviceStatusDock
            isConnected={isConnected}
            deviceName={deviceName}
            ports={ports}
            usbControlActive={nanoUsbControlActive}
            bleStateActive={nanoBleStateActive}
            syncMessage={dockSyncMessage}
            bleObserverState={bleObserverState}
            latestBleNotificationTimestamp={hardwareState.latestBleNotificationTimestamp}
            bleNotificationCount={hardwareState.bleNotificationCount}
            entries={activityEvents}
            lastInbound={lastUsbInbound}
            lastOutbound={lastUsbOutbound}
            presetMetadataMessage={presetMetadataDockMessage}
            presetMetadataComplete={presetMetadataStatus.complete}
            presetMetadataSource={presetMetadataStatus.source}
          />

          {/* Hardware panel wrapper */}
          <div
            className="relative z-10 rounded-2xl border overflow-hidden"
            style={{
              background: "var(--panel-bg)",
              borderColor: "var(--panel-border)",
              boxShadow: "0 12px 40px rgba(15,23,42,0.12), inset 0 1px 0 var(--panel-border-light)",
            }}
          >
            {/* Panel body */}
            <div className="p-3 sm:p-4 short:sm:p-3 space-y-3 short:space-y-2">
              <SurfaceTabs
                value={mainSurface}
                onChange={setMainSurface}
                aboutBadge={updateState.status === "update"}
              />

              {mainSurface === "about" && (
                <AboutPanel appVersion={appVersion} update={updateState} />
              )}

              {mainSurface === "help" && <HelpPanel />}

              {mainSurface === "live" && (
                <div className="space-y-3 short:space-y-2">
                  <div
                    className={[
                      "grid gap-3 short:gap-2 xl:items-stretch",
                      tonePanelCollapsed
                        ? railCollapsed
                          ? "xl:grid-cols-[56px_minmax(0,1fr)_56px]"
                          : "xl:grid-cols-[280px_minmax(0,1fr)_56px]"
                        : railCollapsed
                          ? "xl:grid-cols-[56px_minmax(0,1fr)_320px]"
                          : "xl:grid-cols-[280px_minmax(0,1fr)_320px]",
                    ].join(" ")}
                  >
                    <div className="min-w-0">
                      <PresetRail
                        currentPreset={currentPreset}
                        isConnected={nanoUsbControlActive}
                        collapsed={railCollapsed}
                        disabled={presetInteractionsDisabled}
                        loadingPreset={presetSyncPreset}
                        onSelectPreset={(preset) => void requestPresetSwitch(preset)}
                        onRenamePreset={(preset) => {
                          if (preset === currentPreset) markPresetDirty();
                        }}
                        onToggleCollapsed={() => setRailCollapsed((value) => !value)}
                      />
                    </div>

                    <div className="min-w-0 space-y-3 short:space-y-2">
                      <section
                        className="rounded-xl border p-3 short:p-2"
                        style={{
                          background: "var(--panel-raised)",
                          borderColor: "var(--panel-border-light)",
                        }}
                      >
                        <div className="mb-2 short:mb-1 flex flex-wrap items-center justify-between gap-2">
                          <span
                            className="flex flex-wrap items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-[1.4px]"
                            style={{ color: "var(--text-secondary)" }}
                          >
                            Signal path · quick on/off
                          </span>
                          <button
                            type="button"
                            onClick={() => setToneStudioOpen(true)}
                            className="flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[10px] font-extrabold uppercase tracking-[0.8px]"
                            style={{
                              background: "var(--surface)",
                              borderColor: "var(--panel-border-light)",
                              color: "var(--text-secondary)",
                            }}
                          >
                            <ArrowsOutSimpleIcon size={13} weight="bold" aria-hidden="true" />
                            Tone Studio
                          </button>
                        </div>
                        <SignalPathOverview
                          ccState={ccState}
                          isConnected={nanoUsbControlActive}
                          slotAssignments={fxSlotAssignments}
                          deviceModelStates={deviceFxModelStates}
                          loadedSlotNames={loadedToneSlotNames}
                          activeSlot={toneEditorSlot}
                          onActiveSlotChange={setToneEditorSlot}
                          onToggleCC={handleToggleCC}
                          compact
                        />
                      </section>
                      <DeviceStateReadout
                        dump={deviceStateDump ?? null}
                        currentPreset={currentPreset}
                        isDirty={dirtyParams}
                        onWriteKnob={nanoBleStateActive ? handleWriteAmpKnob : undefined}
                        liveKnobs={liveKnobs}
                        stateActive={nanoBleStateActive}
                      />

                      <QuickPresetAssignments
                        currentPreset={currentPreset}
                        state={footswitchState}
                        isConnected={nanoUsbControlActive}
                        canWriteAssetSlots={nanoBleStateActive}
                        disabled={presetInteractionsDisabled}
                        onActivateSlot={handleActivateFootswitchAssignment}
                        onAssignPreset={handleAssignFootswitchPreset}
                        onFootswitchPress={handleFootswitchPress}
                        rotaryPreview={footswitchRotaryPreview}
                        loadedAssets={{
                          captureName: deviceStateDump?.captureName ?? captureRotaryDisplayName,
                          irName: deviceStateDump?.irName ?? irRotaryDisplayName,
                          captureNames: deviceAssetNames.capture,
                          irNames: deviceAssetNames.ir,
                        }}
                        onFootswitchRotaryChange={handleFootswitchRotaryChange}
                      />
                    </div>

                    <aside className="min-w-0 xl:self-start">
                      {tonePanelCollapsed ? (
                        <button
                          type="button"
                          onClick={() => setTonePanelCollapsed(false)}
                          title="Show utilities"
                          aria-label="Show utilities"
                          className="flex w-full items-center justify-center rounded-xl border px-2 py-3 text-[10px] font-extrabold uppercase tracking-[1.3px] xl:min-h-[360px] xl:flex-col xl:gap-2"
                          style={{
                            background: "var(--surface-2)",
                            borderColor: "var(--panel-border-light)",
                            color: "var(--text-secondary)",
                          }}
                        >
                          <CaretDoubleLeftIcon size={16} weight="bold" aria-hidden="true" />
                          <span className="xl:[writing-mode:vertical-rl]">Utilities</span>
                        </button>
                      ) : (
                        <section
                          data-testid="utilities-rail"
                          className="flex max-h-[70vh] flex-col overflow-hidden rounded-xl border xl:max-h-[calc(100vh-11rem)]"
                          style={{
                            background: "var(--surface-2)",
                            borderColor: "var(--panel-border-light)",
                          }}
                        >
                          <div
                            className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2"
                            style={{
                              borderColor: "var(--panel-border)",
                              background: "var(--panel-raised)",
                            }}
                          >
                            <div>
                              <div
                                className="flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[1.4px]"
                                style={{ color: "var(--text-secondary)" }}
                              >
                                Utilities
                              </div>
                              <div
                                className="mt-0.5 text-[10px] font-semibold"
                                style={{ color: "var(--text-secondary)" }}
                              >
                                Commands and readouts for {presetLabel(currentPreset)}.
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => setTonePanelCollapsed(true)}
                                title="Collapse utilities"
                                aria-label="Collapse utilities"
                                className="grid h-8 w-8 place-items-center rounded-lg border transition-all"
                                style={{
                                  background: "var(--surface)",
                                  borderColor: "var(--panel-border-light)",
                                  color: "var(--text-secondary)",
                                }}
                              >
                                <CaretDoubleRightIcon size={15} weight="bold" aria-hidden="true" />
                              </button>
                            </div>
                          </div>
                          <div
                            data-testid="utilities-rail-scroll"
                            className="min-h-0 flex-1 overflow-y-auto p-2"
                          >
                            <LiveUtilitiesPanel
                              isConnected={nanoUsbControlActive}
                              captureVolume={deviceStateDump?.captureVolume}
                              saveMode={saveMode}
                              dirtyPresetSwitchMode={dirtyPresetSwitchMode}
                              isDirty={dirtyParams}
                              saveCapable={saveCapable}
                              saveInFlight={saveInFlight}
                              lastSetBpm={lastSetBpm}
                              tunerState={tunerState}
                              expressionValue={expressionValue}
                              onSaveModeChange={handleSaveModeChange}
                              onDirtyPresetSwitchModeChange={handleDirtyPresetSwitchModeChange}
                              onSave={handleSaveActivePreset}
                              onDiscard={handleDiscardActivePreset}
                              onTapTempo={handleTapTempo}
                              onSetTempoBpm={handleSetTempoBpm}
                              onToggleTuner={() => void handleSetTunerEnabled(!tunerState)}
                              onSetExpression={handleSetExpression}
                              onOpenToneStudio={() => setToneStudioOpen(true)}
                            />
                          </div>
                        </section>
                      )}
                    </aside>
                  </div>
                </div>
              )}

              {mainSurface === "advanced" && (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <AdvancedTabs value={advancedSurface} onChange={setAdvancedSurface} />
                    <span
                      className="text-[10px] font-extrabold uppercase tracking-[1.2px]"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      Read-only diagnostics and capture tools
                    </span>
                  </div>

                  {advancedSurface === "diagnostics" && (
                    <div className="space-y-4">
                      <section
                        className="rounded-2xl border p-4"
                        style={{
                          background: "var(--surface-2)",
                          borderColor: "var(--panel-border-light)",
                        }}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="max-w-3xl">
                            <div
                              className="text-[10px] font-extrabold uppercase tracking-[1.8px]"
                              style={{ color: "var(--color-cyan-accent)" }}
                            >
                              Diagnostics
                            </div>
                            <h2 className="m-0 mt-1 text-[20px] font-extrabold">
                              Diagnostic capture and USB trace
                            </h2>
                            <p
                              className="m-0 mt-2 text-[12px] font-semibold leading-6"
                              style={{ color: "var(--text-secondary)" }}
                            >
                              Advanced is intentionally read-only. Enable diagnostics before
                              reproducing an issue, then copy the standard report with app/device
                              events and USB MIDI rows for debugging.
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <span
                              className="rounded-full border px-3 py-1 text-[10px] font-extrabold uppercase tracking-[1px]"
                              style={{
                                color: "var(--color-green-accent)",
                                borderColor: "rgba(0,170,85,0.28)",
                                background: "rgba(0,170,85,0.06)",
                              }}
                            >
                              Read-only
                            </span>
                            <span
                              className="rounded-full border px-3 py-1 text-[10px] font-extrabold uppercase tracking-[1px]"
                              style={{
                                color: "var(--color-cyan-accent)",
                                borderColor: "rgba(0,153,204,0.28)",
                                background: "rgba(0,153,204,0.06)",
                              }}
                            >
                              USB MIDI
                            </span>
                          </div>
                        </div>
                      </section>
                      <MidiMonitor
                        entries={midiLog}
                        onClear={() => setMidiLog([])}
                        diagnosticsEnabled={diagnosticCaptureStartedAt !== null}
                        diagnosticEntries={diagnosticCaptureEntries}
                        diagnosticStartedAt={diagnosticCaptureStartedAt}
                        onToggleDiagnostics={handleToggleDiagnosticCapture}
                        onResetDiagnostics={handleResetDiagnosticCapture}
                        onCopyDiagnostics={handleCopyDiagnosticCapture}
                      />
                    </div>
                  )}

                  {EXPERIMENTAL_FEATURES && advancedSurface === "capture" && (
                    <ProtocolLab
                      activeLabel={traceSession.activeLabel}
                      sessionLabel={traceSession.label}
                      startedAt={traceSession.startedAt}
                      stoppedAt={traceSession.stoppedAt}
                      midiCount={traceSession.midiCount}
                      bleCount={bleNotificationCount}
                      latestMidiBytes={traceSession.latestMidiBytes}
                      onStartAction={handleStartTraceAction}
                      onStopAction={handleStopTraceAction}
                    />
                  )}
                </div>
              )}
            </div>
          </div>

          <ProjectAttributionFooter />
        </div>
      </main>

      {saveDialogOpen && (
        <ConfirmActionDialog
          title="Save to device?"
          message={`Save the preset name and live edits to ${presetLabel(currentPreset)} / ${activePresetName} on the device.`}
          detail="This overwrites the selected preset slot. Use Discard or the Nano EXIT button if you want to abandon the working edits instead."
          confirmLabel="Save to device"
          icon={<FloppyDiskIcon size={21} weight="bold" />}
          busy={saveInFlight}
          tone="danger"
          onCancel={() => setSaveDialogOpen(false)}
          onConfirm={confirmSaveActivePreset}
        />
      )}

      {pendingPresetSwitch !== null && (
        <ConfirmActionDialog
          title="Discard edits and switch?"
          message={`Switching to ${presetLabel(pendingPresetSwitch)} will discard unsaved live edits on ${presetLabel(currentPreset)}.`}
          detail="This matches the device behavior: unsaved working changes are abandoned when another preset is recalled."
          confirmLabel="Discard and switch"
          icon={<WarningCircleIcon size={22} weight="bold" />}
          tone="warning"
          onCancel={cancelPendingPresetSwitch}
          onConfirm={confirmPendingPresetSwitch}
        />
      )}

      {toneStudioOpen && (
        <div
          className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-slate-950/38 px-3 py-16 backdrop-blur-sm"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setToneStudioOpen(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Floating Tone Studio"
            className="grid w-full max-w-[1420px] gap-3 rounded-2xl border p-3 shadow-2xl xl:grid-cols-[300px_minmax(0,1fr)]"
            style={{
              background: "var(--panel-bg)",
              borderColor: "var(--panel-border-light)",
              boxShadow: "0 24px 80px rgba(15,23,42,0.42)",
            }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="min-w-0">
              <PresetRail
                currentPreset={currentPreset}
                isConnected={nanoUsbControlActive}
                collapsed={false}
                disabled={presetInteractionsDisabled}
                loadingPreset={presetSyncPreset}
                onSelectPreset={(preset) => void requestPresetSwitch(preset)}
                onToggleCollapsed={() => setToneStudioOpen(false)}
              />
            </div>
            <div
              className="min-w-0 overflow-hidden rounded-xl border"
              style={{ borderColor: "var(--panel-border-light)" }}
            >
              <div
                className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2"
                style={{ borderColor: "var(--panel-border)", background: "var(--panel-raised)" }}
              >
                <div className="min-w-0">
                  <div
                    className="text-[10px] font-extrabold uppercase tracking-[1.4px]"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Floating Tone Studio
                  </div>
                  <div
                    className="mt-0.5 truncate text-[13px] font-extrabold"
                    style={{ color: "var(--text)" }}
                  >
                    {presetLabel(currentPreset)} · device chain and synced values
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setToneStudioOpen(false)}
                  title="Close tone studio"
                  aria-label="Close tone studio"
                  className="grid h-8 w-8 place-items-center rounded-lg border"
                  style={{
                    background: "var(--surface)",
                    borderColor: "var(--panel-border-light)",
                    color: "var(--text-secondary)",
                  }}
                >
                  <XIcon size={15} weight="bold" aria-hidden="true" />
                </button>
              </div>
              <div className="max-h-[calc(100vh-11rem)] overflow-y-auto p-3">
                <PedalWorkbench
                  currentPreset={currentPreset}
                  ccState={ccState}
                  isConnected={nanoUsbControlActive}
                  slotAssignments={fxSlotAssignments}
                  deviceModelStates={deviceFxModelStates}
                  loadedSlotNames={loadedToneSlotNames}
                  fxParamValues={activeModelFxParamValues}
                  fxParamLoadingSlot={fxParamRefreshSlot}
                  fxParamRefreshAttempt={fxParamRefreshAttempt}
                  fxParamError={fxParamRefreshError}
                  fxParamWritingKey={fxParamWritingKey}
                  fxParamWriteError={fxParamWriteError}
                  deviceActivityMessage={dockSyncMessage}
                  fxModelWritingSlot={fxModelWritingSlot}
                  fxModelWriteError={fxModelWriteError}
                  fixedBlockReadback={fixedBlockReadback}
                  fixedBlockRotaryPreview={footswitchRotaryPreview}
                  fixedBlockAssetNames={{
                    capture: deviceAssetNames.capture,
                    ir: deviceAssetNames.ir,
                  }}
                  gateReductionLastSentValue={gateReductionLastSentValue}
                  fixedBlockWritingLabel={fixedBlockWriteLabel}
                  canRefreshParams={nanoBleStateActive}
                  canWriteParams={nanoBleStateActive}
                  canWriteModels={nanoBleStateActive}
                  canWriteFixedBlocks={nanoBleStateActive}
                  onRefreshFxParams={handleRefreshFxParams}
                  onRefreshCabIrParams={() => handleRefreshCabIrParams(currentCabIrSlot, "manual")}
                  onWriteGateEnabled={handleWriteGateEnabled}
                  onWriteGateReduction={handleWriteGateReduction}
                  onWriteCaptureVolume={handleWriteCaptureVolume}
                  onWriteCabIrParam={handleWriteCabIrParam}
                  onWriteCabIrMicPosition={handleWriteCabIrMicPosition}
                  onFootswitchRotaryChange={handleFootswitchRotaryChange}
                  onWriteFxParam={handleWriteFxParam}
                  onWriteFxModel={handleWriteFxModel}
                  onSlotAssignmentsChange={setFxSlotAssignments}
                  onToggleCC={handleToggleCC}
                  activeSlot={toneEditorSlot}
                  onActiveSlotChange={setToneEditorSlot}
                />
              </div>
            </div>
          </section>
        </div>
      )}

      <LogPanel visible={showLogs} onCopyDiagnostics={handleCopyDiagnostics} />
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <LogProvider>
        <AppContent />
      </LogProvider>
    </ThemeProvider>
  );
}
