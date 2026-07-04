/**
 * Diagnostic bundle builder — assembles a copy/paste-able report from the in-memory log
 * buffer plus app/device metadata, so the user can hand over logs for debugging.
 *
 * @see docs/specs/200-frontend-control-surface/spec.md [FR-38]
 * @see docs/specs/120-backend-ipc/spec.md [FR-27] [FR-28]
 */
import type { LogEntry } from "../../shared/hooks/useLogs";

export interface DiagnosticMeta {
  appVersion: string;
  deviceName: string | null;
  connection: string;
  isConnected: boolean;
  syncMode?: string | null;
  provisional?: boolean | null;
  stale?: boolean | null;
  activePreset?: number | null;
  bank?: string | null;
  /** ISO timestamp; injected by the caller so this stays pure/testable. */
  generatedAt: string;
  /** navigator.userAgent, injected by the caller. */
  platform: string;
}

const RULE = "=".repeat(56);

/** Build the full diagnostic report as a single text blob (header + log lines). */
export function buildDiagnosticBundle(logs: LogEntry[], meta: DiagnosticMeta): string {
  const header = [
    RULE,
    "Desktop Nano Cortex — Diagnostic Bundle",
    RULE,
    `generated:   ${meta.generatedAt}`,
    `app version: ${meta.appVersion}`,
    `platform:    ${meta.platform}`,
    `device:      ${meta.deviceName ?? "(none)"}`,
    `connection:  ${meta.connection}${meta.isConnected ? " (connected)" : ""}`,
    `sync mode:   ${meta.syncMode ?? "unknown"}`,
    `state:       provisional=${fmt(meta.provisional)} stale=${fmt(meta.stale)} ` +
      `preset=${fmt(meta.activePreset)} bank=${fmt(meta.bank)}`,
    "firmware:    unknown (not read by app)",
    `log entries: ${logs.length} (in-memory buffer)`,
    RULE,
    "",
  ].join("\n");

  const body = logs.map(formatLogLine).join("\n");
  return `${header}${body}\n`;
}

function formatLogLine(entry: LogEntry): string {
  return `${new Date(entry.ts).toISOString()} ${entry.level.toUpperCase()} ${entry.message}`;
}

function fmt(value: string | number | boolean | null | undefined): string {
  return value === null || value === undefined ? "?" : String(value);
}
