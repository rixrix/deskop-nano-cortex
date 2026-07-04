/**
 * ProtocolLab component (experimental) — BLE capture/trace surface with decoded control and hardware tables.
 *
 * @see docs/specs/200-frontend-control-surface/spec.md [FR-24]
 * @see docs/specs/200-frontend-control-surface/design.md [DES-FRONT-EXPERIMENTAL] [DES-FRONT-DECODER]
 */
import { useMemo, useState } from "react";
import { useLogs } from "../../../shared/hooks/useLogs";
import { ExperimentalBadge } from "../../../shared/ui/components/ExperimentalBadge";
import { sendBleFrame } from "../../../shared/ipc/commands";
import { DeviceStateReadout } from "./DeviceStateReadout";
import { buildAmpKnobFrame } from "../bleCommandEncoder";
import {
  decodeLatestFootswitchSnapshot,
  decodeObservedControlValues,
  decodeObservedHardwareValues,
  decodeObservedStateDump,
  getObservedControlLabel,
  getObservedControlOrder,
  getObservedHardwareLabel,
  getObservedHardwareOrder,
  STATE_DUMP_REQUEST_FRAME,
  type ObservedControlId,
  type ObservedControlValue,
  type ObservedFootswitchSnapshot,
  type ObservedHardwareId,
  type ObservedHardwareValue,
} from "../protocolLabDecoder";

const TRACE_ACTIONS = [
  "GAIN clockwise",
  "GAIN counterclockwise",
  "BASS clockwise",
  "BASS counterclockwise",
  "MID clockwise",
  "MID counterclockwise",
  "TREBLE clockwise",
  "TREBLE counterclockwise",
  "AMOUNT clockwise",
  "AMOUNT counterclockwise",
  "LEVEL clockwise",
  "LEVEL counterclockwise",
  "BANK press/select",
  "BANK item select with Footswitch I",
  "FX press",
  "FX hold",
  "Footswitch I press/release",
  "Footswitch I rotate clockwise",
  "Footswitch I rotate counterclockwise",
  "Footswitch II press/release",
  "Footswitch II rotate clockwise",
  "Footswitch II rotate counterclockwise",
  "SAVE press",
  "SAVE hold",
  "EXIT press",
  "EXIT hold",
  "CAPTURE press",
  "CAPTURE hold",
  "CAPTURE observe",
  "Guitar plugged in",
  "Guitar note played",
  "Tuner opened",
  "Tuner note observed",
] as const;

interface ProtocolLabProps {
  activeLabel: string | null;
  sessionLabel: string | null;
  startedAt: number | null;
  stoppedAt: number | null;
  midiCount: number;
  bleCount: number;
  latestMidiBytes: number[] | null;
  onStartAction: (label: string) => Promise<void>;
  onStopAction: () => Promise<void>;
}

function formatBytes(bytes: number[] | null) {
  if (!bytes?.length) return "none";
  return bytes.map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join(" ");
}

function formatSessionTime(startedAt: number | null, stoppedAt: number | null) {
  if (!startedAt) return "not started";
  const end = stoppedAt ?? Date.now();
  return `${Math.max(0, Math.round((end - startedAt) / 100) / 10).toFixed(1)}s`;
}

function ObservedControlCard({
  id,
  value,
}: {
  id: ObservedControlId;
  value: ObservedControlValue | undefined;
}) {
  return (
    <div
      className="rounded-xl border px-3 py-2.5"
      style={{
        background: "var(--surface)",
        borderColor: value ? "rgba(0,153,204,0.34)" : "var(--panel-border-light)",
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <div
          className="text-[10px] font-extrabold tracking-[1.2px] uppercase"
          style={{ color: value ? "var(--color-cyan-accent)" : "var(--text-secondary)" }}
        >
          {getObservedControlLabel(id)}
        </div>
        <span
          className="text-[8px] font-extrabold uppercase tracking-[0.8px] px-1.5 py-0.5 rounded-full border"
          style={{
            color: value ? "var(--color-amber-accent)" : "var(--text-muted)",
            borderColor: value ? "rgba(212,160,23,0.35)" : "var(--panel-border)",
            background: "var(--panel-bg)",
          }}
        >
          {value ? value.confidence : "unknown"}
        </span>
      </div>
      <div className="mt-2 flex items-baseline justify-between gap-2">
        <span
          className="text-[22px] font-extrabold font-mono"
          style={{ color: value ? "var(--text)" : "var(--text-secondary)" }}
        >
          {value ? value.rawValue : "--"}
        </span>
        <span
          className="text-[11px] font-bold font-mono"
          style={{ color: value ? "var(--color-cyan-accent)" : "var(--text-muted)" }}
        >
          {value ? `${value.percent}%` : "--"}
        </span>
      </div>
      <div
        className="mt-2 h-[4px] rounded-full overflow-hidden"
        style={{ background: "var(--surface-3)" }}
      >
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: value ? `${value.percent}%` : "0%",
            background: value ? "var(--color-cyan-accent)" : "var(--panel-border)",
          }}
        />
      </div>
      <div
        className="mt-2 text-[9px] font-mono truncate"
        title={value?.payloadHex ?? ""}
        style={{ color: "var(--text-secondary)" }}
      >
        {value ? value.payloadHex : "waiting for c305"}
      </div>
    </div>
  );
}

function ObservedHardwareCard({
  id,
  value,
}: {
  id: ObservedHardwareId;
  value: ObservedHardwareValue | undefined;
}) {
  return (
    <div
      className="rounded-xl border px-3 py-2.5"
      style={{
        background: "var(--surface)",
        borderColor: value ? "rgba(212,160,23,0.36)" : "var(--panel-border-light)",
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <div
          className="text-[10px] font-extrabold tracking-[1.2px] uppercase"
          style={{ color: value ? "var(--color-amber-accent)" : "var(--text-secondary)" }}
        >
          {getObservedHardwareLabel(id)}
        </div>
        <span
          className="text-[8px] font-extrabold uppercase tracking-[0.8px] px-1.5 py-0.5 rounded-full border"
          style={{
            color: value ? "var(--color-amber-accent)" : "var(--text-muted)",
            borderColor: value ? "rgba(212,160,23,0.35)" : "var(--panel-border)",
            background: "var(--panel-bg)",
          }}
        >
          {value ? value.confidence : "unknown"}
        </span>
      </div>
      <div className="mt-2 flex items-baseline justify-between gap-2">
        <span
          className="text-[20px] font-extrabold font-mono truncate"
          style={{ color: value ? "var(--text)" : "var(--text-secondary)" }}
        >
          {value ? value.value : "--"}
        </span>
        <span
          className="text-[10px] font-bold font-mono"
          style={{ color: value ? "var(--color-amber-accent)" : "var(--text-muted)" }}
        >
          {value?.numericValue ?? "--"}
        </span>
      </div>
      <div
        className="mt-1 text-[10px] font-semibold truncate"
        title={value?.detail ?? ""}
        style={{ color: "var(--text-secondary)" }}
      >
        {value ? value.detail : "waiting for c305"}
      </div>
      <div
        className="mt-2 text-[9px] font-mono truncate"
        title={value?.payloadHex ?? ""}
        style={{ color: "var(--text-secondary)" }}
      >
        {value ? value.payloadHex : "not observed"}
      </div>
    </div>
  );
}

function FootswitchSnapshot({ snapshot }: { snapshot: ObservedFootswitchSnapshot | null }) {
  if (!snapshot) {
    return (
      <div
        className="mt-3 rounded-xl border px-3 py-2.5"
        style={{ background: "var(--surface)", borderColor: "var(--panel-border-light)" }}
      >
        <div
          className="text-[10px] font-extrabold uppercase tracking-[1.2px]"
          style={{ color: "var(--text-secondary)" }}
        >
          Controls At Hardware Change
        </div>
        <div className="mt-1 text-[11px] font-semibold" style={{ color: "var(--text-secondary)" }}>
          Waiting for a bank or footswitch event. The snapshot uses the latest known knob values
          before that event.
        </div>
      </div>
    );
  }

  return (
    <div
      className="mt-3 rounded-xl border p-3"
      style={{ background: "var(--surface)", borderColor: "rgba(0,153,204,0.24)" }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div
            className="text-[10px] font-extrabold uppercase tracking-[1.2px]"
            style={{ color: "var(--text-secondary)" }}
          >
            Controls At Hardware Change
          </div>
          <div className="mt-1 text-[12px] font-extrabold" style={{ color: "var(--text)" }}>
            {snapshot.event.label}: {snapshot.event.value}
          </div>
        </div>
        <span
          className="text-[10px] font-extrabold uppercase tracking-[1px] px-2 py-1 rounded-full border"
          style={{
            color: snapshot.missingIds.length
              ? "var(--color-amber-accent)"
              : "var(--color-cyan-accent)",
            borderColor: snapshot.missingIds.length
              ? "rgba(212,160,23,0.35)"
              : "rgba(0,153,204,0.32)",
            background: "var(--panel-bg)",
          }}
        >
          {6 - snapshot.missingIds.length}/6 captured
        </span>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
        {getObservedControlOrder().map((id) => {
          const value = snapshot.controls.get(id);
          return (
            <div
              key={id}
              className="rounded-lg border px-2.5 py-2"
              style={{
                background: "var(--surface-2)",
                borderColor: value ? "rgba(0,153,204,0.24)" : "var(--panel-border)",
              }}
            >
              <div
                className="text-[9px] font-extrabold uppercase tracking-[1px]"
                style={{ color: value ? "var(--color-cyan-accent)" : "var(--text-secondary)" }}
              >
                {getObservedControlLabel(id)}
              </div>
              <div className="mt-1 flex items-baseline justify-between gap-1">
                <span
                  className="text-[17px] font-extrabold font-mono"
                  style={{ color: value ? "var(--text)" : "var(--text-secondary)" }}
                >
                  {value ? value.rawValue : "--"}
                </span>
                <span
                  className="text-[10px] font-bold font-mono"
                  style={{ color: value ? "var(--color-cyan-accent)" : "var(--text-muted)" }}
                >
                  {value ? `${value.percent}%` : "--"}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-2 text-[10px] font-semibold" style={{ color: "var(--text-secondary)" }}>
        Snapshot is provisional: current traces do not emit a full knob dump on footswitch changes,
        so this freezes the latest known values seen before the event.
      </div>
    </div>
  );
}

const READONLY_FRAMES: { label: string; hint: string; bytes: number[] }[] = [
  {
    label: "Request state dump",
    hint: "0C C0 08 03 18 01 20 01 28 01 01 00 00 00 — asks the device to report its current preset state (read-only).",
    bytes: STATE_DUMP_REQUEST_FRAME,
  },
  {
    label: "Request metadata",
    hint: "06 C0 08 03 01 00 00 00 — asks for preset/capture/IR name lists (read-only).",
    bytes: [0x06, 0xc0, 0x08, 0x03, 0x01, 0x00, 0x00, 0x00],
  },
];

/**
 * Read-only protocol-verification controls: write a dump-request frame to the `c304` write
 * characteristic and watch for the device's reply on `c305` (in the log). Confirms the
 * captured command path against hardware. Experimental / unverified.
 *
 * @see docs/specs/110-backend-midi-ble/design.md [DES-BLE-PROTOCOL]
 */
function ProtocolVerifyPanel() {
  const { logs } = useLogs();
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The device's reply lands in the log stream a moment after the write; decode reactively so the
  // readout below fills in on its own once the c305 dump arrives.
  const dump = useMemo(() => decodeObservedStateDump(logs), [logs]);

  const send = async (label: string, bytes: number[]) => {
    setBusy(label);
    setError(null);
    setResult(null);
    try {
      const status = await sendBleFrame(bytes); // defaults to the c304 write characteristic
      setResult(`${label}: ${status}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  // Reversible write test — set GAIN on the device, then auto re-request the dump to confirm.
  const [gainTarget, setGainTarget] = useState(128);
  const [writeMsg, setWriteMsg] = useState<string | null>(null);
  const writeGain = async () => {
    setWriteMsg(null);
    try {
      const status = await sendBleFrame(buildAmpKnobFrame("gain", gainTarget));
      setWriteMsg(`Sent gain=${gainTarget} → ${status}. Re-reading device…`);
      window.setTimeout(() => {
        sendBleFrame(STATE_DUMP_REQUEST_FRAME).catch(() => {});
      }, 450);
    } catch (err) {
      setWriteMsg(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div
      className="mb-4 rounded-2xl border p-3"
      style={{ background: "var(--surface)", borderColor: "rgba(212,160,23,0.34)" }}
    >
      <div className="flex items-center gap-2">
        <span
          className="text-[10px] font-extrabold uppercase tracking-[1.2px]"
          style={{ color: "var(--text-secondary)" }}
        >
          Protocol verification (c304)
        </span>
        <ExperimentalBadge label="Unverified" />
      </div>
      <p className="mt-1 text-[11px] font-medium" style={{ color: "var(--text-secondary)" }}>
        Read-only dump requests written to the c304 characteristic. They do not change the device —
        a reply on c305 (in the log below) confirms the captured command path.
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {READONLY_FRAMES.map((frame) => (
          <button
            key={frame.label}
            type="button"
            title={frame.hint}
            disabled={Boolean(busy)}
            onClick={() => send(frame.label, frame.bytes)}
            className="rounded-xl border px-3 py-2 text-[10px] font-extrabold uppercase tracking-[1px] disabled:cursor-default disabled:opacity-50"
            style={{
              color: "var(--color-amber-accent)",
              background: "var(--surface-2)",
              borderColor: "rgba(212,160,23,0.4)",
            }}
          >
            {busy === frame.label ? "Sending…" : frame.label}
          </button>
        ))}
      </div>
      {result && (
        <div className="mt-2 text-[11px] font-bold" style={{ color: "var(--color-green-accent)" }}>
          {result}
        </div>
      )}
      {error && (
        <div className="mt-2 text-[11px] font-bold" style={{ color: "var(--color-red-accent)" }}>
          {error}
        </div>
      )}
      {dump && (
        <div className="mt-3">
          <DeviceStateReadout dump={dump} />
        </div>
      )}

      <div
        className="mt-3 rounded-xl border p-3"
        style={{ background: "var(--surface-2)", borderColor: "rgba(240,52,52,0.34)" }}
      >
        <div className="flex items-center gap-2">
          <span
            className="text-[10px] font-extrabold uppercase tracking-[1.2px]"
            style={{ color: "var(--color-red-accent)" }}
          >
            Reversible write test — Gain
          </span>
          <ExperimentalBadge label="Live write" />
        </div>
        <p className="mt-1 text-[11px] font-medium" style={{ color: "var(--text-secondary)" }}>
          Writes GAIN to the device (reversible). Device now:{" "}
          <strong style={{ color: "var(--text)" }}>{dump?.gain ?? "—"}</strong>. Move the slider,
          Set Gain, confirm the reading + your amp change — then set it back.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <input
            type="range"
            min={0}
            max={255}
            value={gainTarget}
            onChange={(event) => setGainTarget(Number(event.target.value))}
            className="w-48"
          />
          <span className="font-mono text-[15px] font-extrabold" style={{ color: "var(--text)" }}>
            {gainTarget}
          </span>
          <button
            type="button"
            onClick={writeGain}
            className="rounded-xl border px-3 py-2 text-[10px] font-extrabold uppercase tracking-[1px]"
            style={{
              color: "var(--color-red-accent)",
              background: "var(--surface)",
              borderColor: "rgba(240,52,52,0.4)",
            }}
          >
            Set Gain
          </button>
        </div>
        {writeMsg && (
          <div className="mt-2 text-[11px] font-bold" style={{ color: "var(--text-secondary)" }}>
            {writeMsg}
          </div>
        )}
      </div>
    </div>
  );
}

export function ProtocolLab({
  activeLabel,
  sessionLabel,
  startedAt,
  stoppedAt,
  midiCount,
  bleCount,
  latestMidiBytes,
  onStartAction,
  onStopAction,
}: ProtocolLabProps) {
  const { logs } = useLogs();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const selectedLabel = TRACE_ACTIONS[selectedIndex] ?? TRACE_ACTIONS[0];
  const isActive = activeLabel !== null;

  const recentLogs = useMemo(() => {
    const start = startedAt ?? Date.now() - 5 * 60_000;
    const end = stoppedAt ?? Number.POSITIVE_INFINITY;
    return logs.filter((entry) => entry.ts >= start && entry.ts <= end);
  }, [logs, startedAt, stoppedAt]);

  const observedControls = useMemo(() => decodeObservedControlValues(logs), [logs]);
  const observedById = useMemo(
    () => new Map(observedControls.map((value) => [value.id, value])),
    [observedControls],
  );
  const observedHardware = useMemo(() => decodeObservedHardwareValues(logs), [logs]);
  const observedHardwareById = useMemo(
    () => new Map(observedHardware.map((value) => [value.id, value])),
    [observedHardware],
  );
  const footswitchSnapshot = useMemo(() => decodeLatestFootswitchSnapshot(logs), [logs]);

  const handleStart = async () => {
    setCopyStatus(null);
    await onStartAction(selectedLabel);
  };

  const handleStop = async () => {
    setCopyStatus(null);
    await onStopAction();
  };

  const handleNext = async () => {
    const nextIndex = (selectedIndex + 1) % TRACE_ACTIONS.length;
    const nextLabel = TRACE_ACTIONS[nextIndex] ?? TRACE_ACTIONS[0];
    setSelectedIndex(nextIndex);
    setCopyStatus(null);
    if (isActive) {
      await onStopAction();
      await onStartAction(nextLabel);
    }
  };

  const handleCopyRecentLogs = async () => {
    const lines = recentLogs.map((entry) => {
      const time = new Date(entry.ts).toISOString();
      return `${time} ${entry.level.toUpperCase()} ${entry.message}`;
    });
    const header = [
      `Protocol Lab Session: ${sessionLabel ?? "unlabeled"}`,
      `Started: ${startedAt ? new Date(startedAt).toISOString() : "n/a"}`,
      `Stopped: ${stoppedAt ? new Date(stoppedAt).toISOString() : "active"}`,
      `USB MIDI messages: ${midiCount}`,
      `BLE c305 notifications: ${bleCount}`,
      "",
    ];
    await navigator.clipboard.writeText([...header, ...lines].join("\n"));
    setCopyStatus(`Copied ${lines.length} log line${lines.length === 1 ? "" : "s"}`);
  };

  return (
    <section>
      <div className="flex flex-wrap items-start gap-3 mb-4">
        <span className="screw mt-1.5" />
        <div className="min-w-[220px] flex-1">
          <h2
            className="m-0 flex items-center gap-2 text-[12px] font-extrabold uppercase tracking-[2.2px]"
            style={{ color: "var(--text)" }}
          >
            Protocol Lab
            <ExperimentalBadge />
          </h2>
          <p
            className="m-0 mt-0.5 text-[11px] font-medium"
            style={{ color: "var(--text-secondary)" }}
          >
            Bracket one physical Nano action at a time so USB MIDI and BLE packets are traceable.
          </p>
        </div>
        <div
          className="hidden sm:block flex-1 h-px mt-3"
          style={{ background: "var(--panel-border)" }}
        />
      </div>

      <ProtocolVerifyPanel />

      <div className="grid gap-3 lg:grid-cols-[minmax(260px,1fr)_auto_minmax(260px,1fr)]">
        <label
          className="rounded-2xl border p-3"
          style={{ background: "var(--surface)", borderColor: "var(--panel-border-light)" }}
        >
          <span
            className="block text-[10px] font-extrabold tracking-[1.4px] uppercase mb-2"
            style={{ color: "var(--text-secondary)" }}
          >
            Action
          </span>
          <select
            value={selectedIndex}
            onChange={(event) => setSelectedIndex(Number(event.target.value))}
            disabled={isActive}
            className="w-full rounded-xl border px-2 py-2 text-[12px] font-extrabold"
            style={{
              background: "var(--surface-2)",
              color: "var(--text)",
              borderColor: "var(--panel-border-light)",
            }}
          >
            {TRACE_ACTIONS.map((label, index) => (
              <option key={label} value={index}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-2 gap-2 min-w-[260px]">
          <button
            type="button"
            onClick={handleStart}
            disabled={isActive}
            className="rounded-xl border px-3 py-2 text-[10px] font-extrabold uppercase tracking-[1px] disabled:opacity-50 disabled:cursor-default"
            style={{
              color: "var(--color-cyan-accent)",
              background: "var(--surface)",
              borderColor: "rgba(0,153,204,0.42)",
            }}
          >
            Start Action
          </button>
          <button
            type="button"
            onClick={handleStop}
            disabled={!isActive}
            className="rounded-xl border px-3 py-2 text-[10px] font-extrabold uppercase tracking-[1px] disabled:opacity-50 disabled:cursor-default"
            style={{
              color: "var(--color-amber-accent)",
              background: "var(--surface)",
              borderColor: "rgba(212,160,23,0.42)",
            }}
          >
            Stop Action
          </button>
          <button
            type="button"
            onClick={handleNext}
            className="rounded-xl border px-3 py-2 text-[10px] font-extrabold uppercase tracking-[1px]"
            style={{
              color: "var(--text)",
              background: "var(--surface)",
              borderColor: "var(--panel-border-light)",
            }}
          >
            Next Action
          </button>
          <button
            type="button"
            onClick={handleCopyRecentLogs}
            disabled={recentLogs.length === 0}
            className="rounded-xl border px-3 py-2 text-[10px] font-extrabold uppercase tracking-[1px] disabled:opacity-50 disabled:cursor-default"
            style={{
              color: "var(--text-secondary)",
              background: "var(--surface)",
              borderColor: "var(--panel-border-light)",
            }}
          >
            Copy Recent Logs
          </button>
        </div>

        <div
          className="rounded-2xl border p-3"
          style={{
            background: "var(--surface)",
            borderColor: isActive ? "rgba(0,153,204,0.42)" : "var(--panel-border-light)",
          }}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div
                className="text-[10px] font-extrabold tracking-[1.4px] uppercase"
                style={{ color: "var(--text-secondary)" }}
              >
                {isActive ? "Recording" : "Last Session"}
              </div>
              <div
                className="mt-1 text-[13px] font-extrabold"
                style={{ color: isActive ? "var(--color-cyan-accent)" : "var(--text)" }}
              >
                {activeLabel ?? sessionLabel ?? "No action selected"}
              </div>
            </div>
            <span
              className="text-[10px] font-extrabold uppercase tracking-[1px] px-2 py-1 rounded-full border"
              style={{
                color: isActive ? "var(--color-green-accent)" : "var(--text-secondary)",
                borderColor: isActive ? "rgba(0,170,85,0.35)" : "var(--panel-border)",
                background: "var(--panel-bg)",
              }}
            >
              {isActive ? "Active" : "Idle"}
            </span>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2">
            <div>
              <div
                className="text-[9px] font-extrabold uppercase tracking-[1px]"
                style={{ color: "var(--text-secondary)" }}
              >
                USB MIDI
              </div>
              <div
                className="text-[20px] font-extrabold font-mono"
                style={{ color: "var(--text)" }}
              >
                {midiCount}
              </div>
            </div>
            <div>
              <div
                className="text-[9px] font-extrabold uppercase tracking-[1px]"
                style={{ color: "var(--text-secondary)" }}
              >
                BLE c305
              </div>
              <div
                className="text-[20px] font-extrabold font-mono"
                style={{ color: "var(--text)" }}
              >
                {bleCount}
              </div>
            </div>
            <div>
              <div
                className="text-[9px] font-extrabold uppercase tracking-[1px]"
                style={{ color: "var(--text-secondary)" }}
              >
                Duration
              </div>
              <div
                className="text-[20px] font-extrabold font-mono"
                style={{ color: "var(--text)" }}
              >
                {formatSessionTime(startedAt, stoppedAt)}
              </div>
            </div>
          </div>

          <div className="mt-2 text-[11px] font-mono" style={{ color: "var(--text-secondary)" }}>
            Latest MIDI: {formatBytes(latestMidiBytes)}
          </div>
          {copyStatus && (
            <div
              className="mt-2 text-[10px] font-bold uppercase tracking-[1px]"
              style={{ color: "var(--color-green-accent)" }}
            >
              {copyStatus}
            </div>
          )}
        </div>
      </div>

      <div
        className="mt-3 rounded-2xl border p-3"
        style={{ background: "var(--surface-2)", borderColor: "var(--panel-border-light)" }}
      >
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div>
            <div
              className="text-[10px] font-extrabold tracking-[1.4px] uppercase"
              style={{ color: "var(--text-secondary)" }}
            >
              Observed BLE Values
            </div>
            <div className="text-[11px] font-semibold" style={{ color: "var(--text-secondary)" }}>
              c305 only, duplicate c306 ignored. Provisional 0-255 live values from the first trace
              pass.
            </div>
          </div>
          <span
            className="text-[10px] font-extrabold uppercase tracking-[1px] px-2 py-1 rounded-full border"
            style={{
              color: observedControls.length ? "var(--color-cyan-accent)" : "var(--text-secondary)",
              borderColor: observedControls.length ? "rgba(0,153,204,0.32)" : "var(--panel-border)",
              background: "var(--panel-bg)",
            }}
          >
            {observedControls.length}/6 mapped
          </span>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {getObservedControlOrder().map((id) => (
            <ObservedControlCard key={id} id={id} value={observedById.get(id)} />
          ))}
        </div>
      </div>

      <div
        className="mt-3 rounded-2xl border p-3"
        style={{ background: "var(--surface-2)", borderColor: "var(--panel-border-light)" }}
      >
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div>
            <div
              className="text-[10px] font-extrabold tracking-[1.4px] uppercase"
              style={{ color: "var(--text-secondary)" }}
            >
              Observed Hardware Events
            </div>
            <div className="text-[11px] font-semibold" style={{ color: "var(--text-secondary)" }}>
              Provisional c305 decodes for bank selection, FX, footswitches, rotary raw values, and
              utility buttons.
            </div>
          </div>
          <span
            className="text-[10px] font-extrabold uppercase tracking-[1px] px-2 py-1 rounded-full border"
            style={{
              color: observedHardware.length
                ? "var(--color-amber-accent)"
                : "var(--text-secondary)",
              borderColor: observedHardware.length
                ? "rgba(212,160,23,0.35)"
                : "var(--panel-border)",
              background: "var(--panel-bg)",
            }}
          >
            {observedHardware.length}/{getObservedHardwareOrder().length} mapped
          </span>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
          {getObservedHardwareOrder().map((id) => (
            <ObservedHardwareCard key={id} id={id} value={observedHardwareById.get(id)} />
          ))}
        </div>
        <FootswitchSnapshot snapshot={footswitchSnapshot} />
      </div>
    </section>
  );
}
