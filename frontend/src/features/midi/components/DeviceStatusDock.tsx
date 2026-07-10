/**
 * DeviceStatusDock component — persistent status strip showing device name, USB/BLE state, notifications, and activity feed.
 *
 * @see docs/specs/200-frontend-control-surface/spec.md [FR-8]
 * @see docs/specs/200-frontend-control-surface/design.md [DES-FRONT-MONITOR]
 */
import { useEffect, useRef, useState } from "react";
import type { MidiPort } from "../../../shared/ipc/commands";
import type { UsbInboundSync } from "./DeviceSyncStatus";
import type { PresetMetadataSource } from "../presetNames";

export type BleObserverState = "offline" | "scanning" | "ready" | "error";
export type ActivityTone = "ble" | "usb" | "hardware" | "system" | "error";

export interface HardwareActivityEntry {
  id: string;
  ts: number;
  message: string;
  tone: ActivityTone;
}

interface DeviceStatusDockProps {
  isConnected: boolean;
  deviceName: string | null;
  ports: MidiPort[];
  usbControlActive: boolean;
  bleStateActive: boolean;
  syncMessage: string | null;
  bleObserverState: BleObserverState;
  latestBleNotificationTimestamp: number | null;
  bleNotificationCount: number;
  entries: HardwareActivityEntry[];
  lastInbound: UsbInboundSync | null;
  lastOutbound: UsbInboundSync | null;
  presetMetadataMessage: string | null;
  presetMetadataComplete: boolean;
  presetMetadataSource: PresetMetadataSource;
}

const BLE_LIVE_WINDOW_MS = 12_000;
const PROGRESS_START_MIN = 9;
const PROGRESS_START_MAX = 16;
const PROGRESS_SOFT_CAP = 94;

function uniquePortNames(ports: MidiPort[], kind: MidiPort["kind"]) {
  return Array.from(new Set(ports.filter((port) => port.kind === kind).map((port) => port.name)));
}

function formatAge(timestampMs: number | null) {
  if (!timestampMs) return "idle";
  const seconds = Math.max(0, Math.round((Date.now() - timestampMs) / 1000));
  if (seconds < 2) return "now";
  if (seconds < 60) return `${seconds}s`;
  return `${Math.round(seconds / 60)}m`;
}

function formatTime(timestampMs: number | null) {
  if (!timestampMs) return "waiting";
  return new Date(timestampMs).toLocaleTimeString();
}

function toneStyle(tone: ActivityTone | "green" | "cyan" | "amber" | "muted" | "red") {
  if (tone === "error" || tone === "red") {
    return {
      color: "var(--color-red-accent)",
      border: "rgba(221,34,68,0.28)",
      background: "rgba(221,34,68,0.06)",
      dot: "var(--color-red-accent)",
      glow: "rgba(221,34,68,0.28)",
    };
  }
  if (tone === "ble" || tone === "cyan") {
    return {
      color: "var(--color-cyan-accent)",
      border: "rgba(0,153,204,0.30)",
      background: "rgba(0,153,204,0.07)",
      dot: "var(--color-cyan-accent)",
      glow: "var(--glow-cyan-strong)",
    };
  }
  if (tone === "usb" || tone === "green") {
    return {
      color: "var(--color-green-accent)",
      border: "rgba(0,170,85,0.30)",
      background: "rgba(0,170,85,0.07)",
      dot: "var(--color-green-accent)",
      glow: "var(--glow-green)",
    };
  }
  if (tone === "hardware" || tone === "amber") {
    return {
      color: "var(--color-amber-accent)",
      border: "rgba(212,160,23,0.32)",
      background: "rgba(212,160,23,0.07)",
      dot: "var(--color-amber-accent)",
      glow: "var(--glow-amber)",
    };
  }
  return {
    color: "var(--text-secondary)",
    border: "var(--panel-border-light)",
    background: "var(--surface)",
    dot: "var(--text-muted)",
    glow: "transparent",
  };
}

function FlatStatusItem({
  label,
  value,
  detail,
  tone,
  title,
}: {
  label: string;
  value: string;
  detail?: string;
  tone: "green" | "cyan" | "amber" | "muted" | "red";
  title?: string;
}) {
  const style = toneStyle(tone);

  return (
    <span
      className="inline-flex min-w-0 items-center gap-1.5 whitespace-nowrap"
      title={title ?? [label, value, detail].filter(Boolean).join(" ")}
    >
      <span
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{
          background: style.dot,
          boxShadow: tone === "muted" ? "none" : `0 0 7px ${style.glow}`,
        }}
      />
      <span
        className="text-[9px] font-extrabold uppercase tracking-[1px]"
        style={{ color: "var(--text-secondary)" }}
      >
        {label}
      </span>
      <span
        className="inline-block max-w-[180px] truncate text-[10px] font-extrabold"
        style={{ color: style.color }}
      >
        {value}
      </span>
      {detail && (
        <span
          className="max-w-[130px] truncate text-[10px] font-semibold"
          style={{ color: "var(--text-secondary)" }}
        >
          {detail}
        </span>
      )}
    </span>
  );
}

function DockNotice({
  label,
  value,
  detail,
  tone,
  pulse = false,
  title,
}: {
  label: string;
  value: string;
  detail?: string;
  tone: "green" | "cyan" | "amber" | "muted" | "red";
  pulse?: boolean;
  title?: string;
}) {
  const style = toneStyle(tone);

  return (
    <span
      className="inline-flex min-w-0 items-center gap-2 whitespace-nowrap"
      title={title ?? [label, value, detail].filter(Boolean).join(" ")}
    >
      <span
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${pulse ? "animate-pulse" : ""}`}
        style={{
          background: style.dot,
          boxShadow: tone === "muted" ? "none" : `0 0 7px ${style.glow}`,
        }}
      />
      <span
        className="text-[9px] font-extrabold uppercase tracking-[1px]"
        style={{ color: style.color }}
      >
        {label}
      </span>
      <span
        className="max-w-[280px] truncate text-[10px] font-extrabold"
        style={{ color: "var(--text)" }}
      >
        {value}
      </span>
      {detail && (
        <span
          className="max-w-[440px] truncate text-[10px] font-semibold"
          style={{ color: "var(--text-secondary)" }}
        >
          {detail}
        </span>
      )}
    </span>
  );
}

function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function nextProgressValue(current: number) {
  if (current < 45) return current + randomBetween(3.8, 9.5);
  if (current < 72) return current + randomBetween(2.2, 5.8);
  if (current < 86) return current + randomBetween(0.9, 2.8);
  return current + randomBetween(0.18, 1.05);
}

export function DeviceSyncProgress({
  label,
  complete = false,
}: {
  label: string;
  complete?: boolean;
}) {
  const [progress, setProgress] = useState(() =>
    randomBetween(PROGRESS_START_MIN, PROGRESS_START_MAX),
  );

  useEffect(() => {
    if (complete) {
      setProgress(100);
      return;
    }

    setProgress(randomBetween(PROGRESS_START_MIN, PROGRESS_START_MAX));
  }, [complete]);

  useEffect(() => {
    if (complete) return;

    let cancelled = false;
    let timer: number | null = null;

    const scheduleTick = () => {
      timer = window.setTimeout(
        () => {
          if (cancelled) return;
          setProgress((current) => Math.min(PROGRESS_SOFT_CAP, nextProgressValue(current)));
          scheduleTick();
        },
        randomBetween(360, 760),
      );
    };

    scheduleTick();

    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [complete]);

  const displayedProgress = complete ? 100 : Math.round(progress);

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={displayedProgress}
      aria-valuetext={complete ? "Complete" : "In progress"}
      className="relative h-full w-full overflow-hidden rounded-lg"
      style={{
        background: "linear-gradient(180deg, var(--surface-2), var(--panel-inset))",
      }}
      title={label}
    >
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(90deg, rgba(0,153,204,0.06), rgba(0,170,85,0.08), rgba(0,153,204,0.04))",
        }}
      />
      <div
        className="absolute inset-y-0 left-0 rounded-lg transition-[width] duration-700 ease-out"
        style={{
          width: `${displayedProgress}%`,
          background: complete
            ? "linear-gradient(90deg, var(--color-cyan-accent), var(--color-green-accent))"
            : "linear-gradient(90deg, rgba(0,153,204,0.18), var(--color-cyan-accent), rgba(0,170,85,0.48))",
          boxShadow: complete ? "0 0 14px var(--glow-green)" : "0 0 14px var(--glow-cyan-strong)",
        }}
      />
      {!complete && (
        <span
          aria-hidden="true"
          className="absolute inset-y-0 left-0 w-28 opacity-75"
          style={{
            animation: "device-sync-shine 1.45s linear infinite",
            background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.46), transparent)",
          }}
        />
      )}
      <span
        aria-hidden="true"
        className="absolute inset-x-2 top-1/2 h-px -translate-y-1/2 opacity-45"
        style={{
          background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.72), transparent)",
        }}
      />
      <span
        className="absolute inset-0 flex min-w-0 items-center justify-center px-3 text-center text-[10px] font-extrabold uppercase tracking-[0.8px]"
        style={{
          color: "var(--text)",
          textShadow: "0 1px 2px rgba(0,0,0,0.28)",
        }}
      >
        <span className="truncate">{complete ? "Sync complete" : label}</span>
      </span>
      <style>{`
        @keyframes device-sync-shine {
          from { transform: translateX(-120%); }
          to { transform: translateX(1500%); }
        }
      `}</style>
    </div>
  );
}

export function DeviceStatusDock({
  isConnected,
  deviceName,
  ports,
  usbControlActive,
  bleStateActive,
  syncMessage,
  bleObserverState,
  latestBleNotificationTimestamp,
  bleNotificationCount,
  entries,
  lastInbound,
  lastOutbound,
  presetMetadataMessage,
  presetMetadataComplete,
  presetMetadataSource,
}: DeviceStatusDockProps) {
  const [completedSyncLabel, setCompletedSyncLabel] = useState<string | null>(null);
  const previousSyncLabelRef = useRef<string | null>(null);
  const latestUseful = entries.find((entry) => entry.tone !== "error");
  const usbPortNames = uniquePortNames(ports, "usb");
  const connectedViaBle = Boolean(
    deviceName?.toLowerCase().includes("bluetooth") || deviceName?.toLowerCase().includes("ble"),
  );
  const usbConnected = isConnected && !connectedViaBle;
  const usbAvailable = usbPortNames.length > 0;
  const usbValue = usbConnected ? "Connected" : usbAvailable ? "Available" : "Missing";
  const usbTone = usbConnected ? "green" : usbAvailable ? "amber" : "muted";
  const usbDetail = usbConnected
    ? (deviceName ?? usbPortNames[0] ?? "Nano Cortex")
    : usbAvailable
      ? `${usbPortNames.length} port${usbPortNames.length === 1 ? "" : "s"}`
      : "no USB MIDI";

  const bleAgeMs = latestBleNotificationTimestamp
    ? Date.now() - latestBleNotificationTimestamp
    : null;
  const bleLive = bleAgeMs !== null && bleAgeMs <= BLE_LIVE_WINDOW_MS;
  const bleReady = bleObserverState === "ready" || connectedViaBle || bleNotificationCount > 0;
  const bleValue = bleLive
    ? "Live"
    : bleObserverState === "scanning"
      ? "Scanning"
      : bleObserverState === "error"
        ? "Offline"
        : bleReady
          ? "Ready"
          : "Offline";
  const bleTone = bleLive
    ? "cyan"
    : bleObserverState === "scanning"
      ? "amber"
      : bleObserverState === "error"
        ? "amber"
        : bleReady
          ? "green"
          : "muted";
  const bleDetail = bleLive
    ? `${formatAge(latestBleNotificationTimestamp)} / ${bleNotificationCount} packets`
    : bleObserverState === "error"
      ? "scan failed"
      : bleReady
        ? `${bleNotificationCount} cached`
        : "not observing";
  const activityTone =
    latestUseful?.tone === "ble"
      ? "cyan"
      : latestUseful?.tone === "usb"
        ? "green"
        : latestUseful?.tone === "hardware"
          ? "amber"
          : "muted";
  const transportTone =
    usbControlActive && bleStateActive
      ? "green"
      : usbControlActive || bleStateActive
        ? "amber"
        : "muted";
  const transportValue =
    usbControlActive && bleStateActive
      ? "Full control"
      : usbControlActive
        ? "Bluetooth needed"
        : bleStateActive
          ? "USB needed"
          : isConnected
            ? "Ready"
            : "Disconnected";
  const transportDetail =
    usbControlActive && bleStateActive
      ? "USB commands + Bluetooth state"
      : usbControlActive
        ? "Live knobs, names, loaded assets, and monitor need Bluetooth"
        : bleStateActive
          ? "Preset, FX, tuner, tap, and expression commands need USB"
          : isConnected
            ? "Connect USB and Bluetooth for the complete control surface"
            : "Connect from the top bar; USB sends commands, Bluetooth reads state";
  const latestError = entries.find((entry) => entry.tone === "error");
  useEffect(() => {
    if (syncMessage) {
      previousSyncLabelRef.current = syncMessage;
      setCompletedSyncLabel(null);
      return;
    }

    const previous = previousSyncLabelRef.current;
    if (!previous) return;
    previousSyncLabelRef.current = null;
    setCompletedSyncLabel(previous);
    const timer = window.setTimeout(() => setCompletedSyncLabel(null), 380);
    return () => window.clearTimeout(timer);
  }, [syncMessage]);
  const progressLabel = syncMessage ?? (completedSyncLabel ? "Sync complete" : null);
  const progressComplete = !syncMessage && Boolean(completedSyncLabel);

  return (
    <section
      className="relative z-20 mb-2 short:mb-1.5 rounded-xl border px-3 py-2 short:py-1.5"
      style={{
        background: "var(--surface)",
        borderColor: "var(--panel-border-light)",
      }}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
        <FlatStatusItem label="USB" value={usbValue} detail={usbDetail} tone={usbTone} />
        <FlatStatusItem label="Bluetooth" value={bleValue} detail={bleDetail} tone={bleTone} />
        <FlatStatusItem
          label="Logs"
          value={latestUseful?.message ?? "Ready"}
          detail={latestUseful ? formatTime(latestUseful.ts) : undefined}
          tone={activityTone}
          title={latestUseful?.message ?? "Ready for hardware"}
        />
        <FlatStatusItem
          label="USB in"
          value={lastInbound?.summary ?? "waiting"}
          detail={lastInbound ? formatTime(lastInbound.timestampMs) : undefined}
          tone={lastInbound ? "green" : "muted"}
          title={
            lastInbound
              ? lastInbound.bytes
                  .map((byte) => byte.toString(16).padStart(2, "0").toUpperCase())
                  .join(" ")
              : "No USB input"
          }
        />
        <FlatStatusItem
          label="USB out"
          value={lastOutbound?.summary ?? "waiting"}
          detail={lastOutbound ? formatTime(lastOutbound.timestampMs) : undefined}
          tone={lastOutbound ? "green" : "muted"}
          title={
            lastOutbound
              ? lastOutbound.bytes
                  .map((byte) => byte.toString(16).padStart(2, "0").toUpperCase())
                  .join(" ")
              : "No USB output"
          }
        />
      </div>
      {progressLabel ? (
        <div
          className="mt-1.5 short:mt-1 h-[22px] overflow-hidden rounded-lg"
          style={{ background: "var(--surface-2)" }}
        >
          <DeviceSyncProgress label={progressLabel} complete={progressComplete} />
        </div>
      ) : (
        <div
          className="mt-1.5 short:mt-1 flex min-w-0 items-center gap-x-5 border-t pt-1.5 short:pt-1"
          style={{ borderColor: "var(--panel-border-light)" }}
        >
          <DockNotice
            label="Transport"
            value={transportValue}
            detail={transportDetail}
            tone={transportTone}
          />
          {presetMetadataMessage && (
            <DockNotice
              label="Presets"
              value={presetMetadataMessage}
              detail={
                presetMetadataComplete
                  ? "device metadata loaded"
                  : presetMetadataSource === "unavailable"
                    ? "using cached names where available"
                    : "partial names kept; retrying in background"
              }
              tone={
                presetMetadataComplete
                  ? "green"
                  : presetMetadataSource === "unavailable"
                    ? "amber"
                    : "cyan"
              }
            />
          )}
          {latestError && (
            <DockNotice
              label="Alert"
              value={latestError.message}
              detail={formatTime(latestError.ts)}
              tone="red"
            />
          )}
        </div>
      )}
    </section>
  );
}
