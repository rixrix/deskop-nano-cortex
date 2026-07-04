/**
 * MidiMonitor component — opt-in diagnostics capture plus the raw USB MIDI trace.
 *
 * @see docs/specs/200-frontend-control-surface/spec.md [FR-17]
 * @see docs/specs/200-frontend-control-surface/design.md [DES-FRONT-MONITOR]
 */
import { useState } from "react";
import type { LogEntry } from "../../../shared/hooks/useLogs";
import type { MidiLogEntry } from "../types";

interface MidiMonitorProps {
  entries: MidiLogEntry[];
  onClear: () => void;
  diagnosticsEnabled: boolean;
  diagnosticEntries: LogEntry[];
  diagnosticStartedAt: number | null;
  onToggleDiagnostics: (enabled: boolean) => void;
  onResetDiagnostics: () => void;
  onCopyDiagnostics: () => Promise<void>;
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function levelColor(level: LogEntry["level"]) {
  if (level === "success") return "var(--color-green-accent)";
  if (level === "warn") return "var(--color-amber-accent)";
  if (level === "error") return "var(--color-red-accent)";
  if (level === "debug") return "var(--color-cyan-accent)";
  return "var(--text-secondary)";
}

export function MidiMonitor({
  entries,
  onClear,
  diagnosticsEnabled,
  diagnosticEntries,
  diagnosticStartedAt,
  onToggleDiagnostics,
  onResetDiagnostics,
  onCopyDiagnostics,
}: MidiMonitorProps) {
  const [copyState, setCopyState] = useState<"idle" | "ok" | "err">("idle");

  const handleCopy = async () => {
    try {
      await onCopyDiagnostics();
      setCopyState("ok");
    } catch {
      setCopyState("err");
    }
    window.setTimeout(() => setCopyState("idle"), 1800);
  };

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-start gap-3">
        <span className="screw mt-1.5" />
        <div className="min-w-[220px] flex-1">
          <h2
            className="text-[12px] font-extrabold tracking-[2.2px] uppercase m-0"
            style={{ color: "var(--text)" }}
          >
            Diagnostics Capture
          </h2>
          <p
            className="m-0 mt-0.5 text-[11px] font-medium"
            style={{ color: "var(--text-secondary)" }}
          >
            Opt in when debugging. The capture uses one copyable format for app/device logs and USB
            MIDI activity.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onToggleDiagnostics(!diagnosticsEnabled)}
            aria-pressed={diagnosticsEnabled}
            className="rounded-xl border px-3 py-2 text-[10px] font-extrabold uppercase tracking-[1px]"
            style={{
              color: diagnosticsEnabled ? "var(--color-green-accent)" : "var(--text-secondary)",
              background: diagnosticsEnabled ? "rgba(0,170,85,0.08)" : "var(--surface)",
              borderColor: diagnosticsEnabled ? "rgba(0,170,85,0.32)" : "var(--panel-border-light)",
            }}
          >
            {diagnosticsEnabled ? "Diagnostics on" : "Enable diagnostics"}
          </button>
          <button
            type="button"
            onClick={onResetDiagnostics}
            disabled={!diagnosticsEnabled}
            className="rounded-xl border px-3 py-2 text-[10px] font-extrabold uppercase tracking-[1px] disabled:cursor-default disabled:opacity-50"
            style={{
              color: "var(--text-secondary)",
              background: "var(--surface)",
              borderColor: "var(--panel-border-light)",
            }}
          >
            Reset
          </button>
          <button
            type="button"
            onClick={handleCopy}
            disabled={!diagnosticsEnabled}
            className="rounded-xl border px-3 py-2 text-[10px] font-extrabold uppercase tracking-[1px] disabled:cursor-default disabled:opacity-50"
            style={{
              color:
                copyState === "ok"
                  ? "var(--color-green-accent)"
                  : copyState === "err"
                    ? "var(--color-red-accent)"
                    : "var(--color-cyan-accent)",
              background: "var(--surface)",
              borderColor: "var(--panel-border-light)",
            }}
          >
            {copyState === "ok" ? "Copied" : copyState === "err" ? "Copy failed" : "Copy"}
          </button>
          <button
            type="button"
            onClick={onClear}
            className="rounded-xl border px-3 py-2 text-[10px] font-extrabold uppercase tracking-[1px]"
            style={{
              color: "var(--text-secondary)",
              background: "var(--surface)",
              borderColor: "var(--panel-border-light)",
            }}
          >
            Clear USB
          </button>
        </div>
      </div>

      <div
        className="mb-4 rounded-2xl border overflow-hidden"
        style={{ background: "var(--surface)", borderColor: "var(--panel-border-light)" }}
      >
        <div
          className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2"
          style={{ borderColor: "var(--panel-border)" }}
        >
          <div>
            <div
              className="text-[10px] font-extrabold uppercase tracking-[1.4px]"
              style={{ color: "var(--text-secondary)" }}
            >
              Standard diagnostic feed
            </div>
            <div
              className="mt-0.5 text-[11px] font-semibold"
              style={{ color: "var(--text-secondary)" }}
            >
              {diagnosticsEnabled && diagnosticStartedAt
                ? `Capturing since ${formatTime(diagnosticStartedAt)} · ${diagnosticEntries.length} events`
                : "Disabled · enable when you want a clean report for debugging"}
            </div>
          </div>
          <span
            className="rounded-full border px-2 py-1 text-[9px] font-extrabold uppercase tracking-[1px]"
            style={{
              color: diagnosticsEnabled ? "var(--color-green-accent)" : "var(--text-muted)",
              borderColor: "var(--panel-border-light)",
              background: diagnosticsEnabled ? "rgba(0,170,85,0.06)" : "var(--panel-inset)",
            }}
          >
            {diagnosticsEnabled ? "Capturing" : "Off"}
          </span>
        </div>
        <div
          className="min-h-[360px] max-h-[58vh] overflow-auto p-3"
          style={{
            background: diagnosticsEnabled
              ? "linear-gradient(180deg, var(--surface), var(--panel-inset))"
              : "var(--panel-inset)",
          }}
        >
          {!diagnosticsEnabled ? (
            <div
              className="grid min-h-[330px] place-items-center rounded-xl border border-dashed px-4 text-center"
              style={{ borderColor: "var(--panel-border)", color: "var(--text-secondary)" }}
            >
              <div className="max-w-xl">
                <div className="text-[13px] font-extrabold" style={{ color: "var(--text)" }}>
                  Diagnostics are off
                </div>
                <p className="m-0 mt-2 text-[12px] font-semibold leading-6">
                  Turn diagnostics on before reproducing an issue. The report will include
                  app/device events and USB MIDI rows in timestamp order, ready to copy and send for
                  debugging.
                </p>
              </div>
            </div>
          ) : diagnosticEntries.length === 0 ? (
            <div
              className="grid min-h-[330px] place-items-center rounded-xl border border-dashed px-4 text-center text-[12px] font-semibold"
              style={{ borderColor: "var(--panel-border)", color: "var(--text-secondary)" }}
            >
              Capture is ready. Reproduce the issue and the events will appear here.
            </div>
          ) : (
            <div className="space-y-1 font-mono text-[11px] leading-relaxed">
              {diagnosticEntries.map((entry, index) => (
                <div
                  // Diagnostic rows are a timestamped stream; index is stable enough for this preview.
                  key={`${entry.ts}-${index}`}
                  className="grid gap-2 rounded-lg border px-2 py-1 sm:grid-cols-[190px_70px_minmax(0,1fr)]"
                  style={{
                    borderColor: "var(--panel-border)",
                    background: "rgba(255,255,255,0.35)",
                  }}
                >
                  <span style={{ color: "var(--text-secondary)" }}>
                    {new Date(entry.ts).toISOString()}
                  </span>
                  <span
                    className="font-extrabold uppercase"
                    style={{ color: levelColor(entry.level) }}
                  >
                    {entry.level}
                  </span>
                  <span className="min-w-0 break-words" style={{ color: "var(--text)" }}>
                    {entry.message}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div
        className="rounded-2xl border overflow-hidden"
        style={{ background: "var(--surface)", borderColor: "var(--panel-border-light)" }}
      >
        <div
          className="grid grid-cols-[78px_52px_1fr_72px] sm:grid-cols-[86px_60px_1fr_90px_90px] gap-2 px-3 py-2 border-b text-[10px] font-extrabold uppercase tracking-[1px]"
          style={{ color: "var(--text-secondary)", borderColor: "var(--panel-border)" }}
        >
          <span>Time</span>
          <span>Type</span>
          <span>Command</span>
          <span>Ch</span>
          <span className="hidden sm:block">Bytes</span>
        </div>
        <div className="max-h-80 overflow-auto">
          {entries.length === 0 ? (
            <div
              className="px-3 py-6 text-center text-[12px] font-semibold"
              style={{ color: "var(--text-secondary)" }}
            >
              No USB MIDI activity yet. Use Console controls to generate command traffic.
            </div>
          ) : (
            entries.slice(0, 80).map((entry) => (
              <div
                key={entry.id}
                className="grid grid-cols-[78px_52px_1fr_72px] sm:grid-cols-[86px_60px_1fr_90px_90px] gap-2 px-3 py-2 border-b text-[11px] font-semibold"
                style={{ color: "var(--text)", borderColor: "var(--panel-border)" }}
              >
                <span style={{ color: "var(--text-secondary)" }}>{formatTime(entry.ts)}</span>
                <span
                  className="font-extrabold uppercase"
                  style={{
                    color:
                      entry.kind === "pc"
                        ? "var(--color-cyan-accent)"
                        : entry.kind === "raw"
                          ? "var(--color-amber-accent)"
                          : "var(--text-secondary)",
                  }}
                >
                  {entry.kind}
                </span>
                <span>{entry.label}</span>
                <span>{entry.channel > 0 ? `Ch ${entry.channel}` : "Sys"}</span>
                <span
                  className="hidden sm:block font-mono"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {entry.bytes.map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join(" ")}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
