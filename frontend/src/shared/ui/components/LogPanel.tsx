/**
 * Fixed bottom log overlay rendering up to 500 midi://log entries with level-coded colors.
 *
 * @see docs/specs/210-frontend-ipc-contracts/spec.md [FR-23]
 * @see docs/specs/210-frontend-ipc-contracts/design.md [DES-SHARED-UI]
 */
import { useRef, useEffect, useState } from "react";
import { useLogs, type LogEntry } from "../../hooks/useLogs";

interface LogPanelProps {
  visible: boolean;
  /** Copy a full diagnostic bundle (logs + metadata) to the clipboard. Rejects on failure. */
  onCopyDiagnostics?: () => Promise<void>;
}

const LEVEL_COLORS: Record<string, string> = {
  debug: "#5d8cff",
  info: "#888",
  success: "#34f034",
  warn: "#f0c034",
  error: "#f03434",
};

function LogRow({ entry }: { entry: LogEntry }) {
  const time = new Date(entry.ts).toLocaleTimeString();
  return (
    <div className="flex gap-2 text-[11px] leading-relaxed font-mono">
      <span style={{ color: "#7d8794", flexShrink: 0, width: 70 }}>{time}</span>
      <span style={{ color: LEVEL_COLORS[entry.level] || "#888", flexShrink: 0, width: 50 }}>
        {entry.level.toUpperCase()}
      </span>
      <span style={{ color: "var(--text-secondary)", wordBreak: "break-word" }}>
        {entry.message}
      </span>
    </div>
  );
}

export function LogPanel({ visible, onCopyDiagnostics }: LogPanelProps) {
  const { logs, clear } = useLogs();
  const [copyState, setCopyState] = useState<"idle" | "ok" | "err">("idle");

  const copyDiagnostics = async () => {
    if (!onCopyDiagnostics) return;
    try {
      await onCopyDiagnostics();
      setCopyState("ok");
    } catch {
      setCopyState("err");
    }
    window.setTimeout(() => setCopyState("idle"), 1500);
  };
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (visible) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs.length, visible]);

  if (!visible) return null;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-40 border-t transition-colors"
      style={{
        height: 200,
        background: "rgba(0,0,0,0.95)",
        borderColor: "var(--border)",
        backdropFilter: "blur(12px)",
      }}
    >
      {/* Log header */}
      <div
        className="flex items-center justify-between px-4 py-1.5 border-b transition-colors"
        style={{ borderColor: "var(--border)" }}
      >
        <span
          className="text-[10px] font-semibold uppercase tracking-wider transition-colors"
          style={{ color: "#9aa4b0" }}
        >
          Event Log
        </span>
        <div className="flex items-center gap-3">
          {onCopyDiagnostics && (
            <button
              onClick={copyDiagnostics}
              className="text-[9px] uppercase tracking-wider font-semibold border-none cursor-pointer transition-colors hover:opacity-80"
              style={{
                color:
                  copyState === "ok"
                    ? "var(--color-green-accent)"
                    : copyState === "err"
                      ? "var(--color-red-accent)"
                      : "#9aa4b0",
              }}
              title="Copy logs + device info for debugging"
            >
              {copyState === "ok"
                ? "Copied ✓"
                : copyState === "err"
                  ? "Copy failed"
                  : "Copy diagnostics"}
            </button>
          )}
          <button
            onClick={clear}
            className="text-[9px] uppercase tracking-wider font-semibold border-none cursor-pointer transition-colors hover:opacity-80"
            style={{ color: "#9aa4b0" }}
          >
            Clear
          </button>
        </div>
      </div>

      {/* Log entries */}
      <div className="overflow-y-auto p-3" style={{ height: 155 }}>
        {logs.length === 0 ? (
          <div className="text-[11px] font-mono transition-colors" style={{ color: "#8a93a0" }}>
            No events yet. Connect a device or scan for BLE to see logs.
          </div>
        ) : (
          logs.map((entry, i) => <LogRow key={i} entry={entry} />)
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
