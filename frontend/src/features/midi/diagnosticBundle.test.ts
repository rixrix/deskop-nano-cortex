/**
 * Unit tests for the diagnostic bundle builder.
 *
 * @see docs/specs/200-frontend-control-surface/spec.md [FR-38]
 */
import { describe, it, expect } from "vitest";
import { buildDiagnosticBundle, type DiagnosticMeta } from "./diagnosticBundle";
import type { LogEntry } from "../../shared/hooks/useLogs";

const META: DiagnosticMeta = {
  appVersion: "0.1.0",
  deviceName: "Nano Cortex",
  connection: "connected",
  isConnected: true,
  syncMode: "CommandOnly",
  provisional: true,
  stale: false,
  activePreset: 3,
  bank: "A",
  generatedAt: "2026-07-01T20:00:00.000Z",
  platform: "test-agent",
};

const LOGS: LogEntry[] = [
  { ts: 1782892695269, level: "info", message: "connected" },
  { ts: 1782892695300, level: "debug", message: "[ble] notification 0000c305: 0B C0 08 01" },
];

describe("buildDiagnosticBundle", () => {
  it("includes the metadata header fields", () => {
    const out = buildDiagnosticBundle(LOGS, META);
    expect(out).toContain("app version: 0.1.0");
    expect(out).toContain("device:      Nano Cortex");
    expect(out).toContain("connection:  connected (connected)");
    expect(out).toContain("sync mode:   CommandOnly");
    expect(out).toContain("firmware:    unknown (not read by app)");
    expect(out).toContain("log entries: 2 (in-memory buffer)");
  });

  it("renders each log line as `ISO LEVEL message`", () => {
    const out = buildDiagnosticBundle(LOGS, META);
    expect(out).toContain("2026-07-01T07:58:15.269Z INFO connected");
    expect(out).toContain("DEBUG [ble] notification 0000c305: 0B C0 08 01");
  });

  it("handles an empty log buffer and missing state", () => {
    const out = buildDiagnosticBundle([], {
      ...META,
      deviceName: null,
      syncMode: null,
      provisional: null,
      activePreset: null,
      bank: null,
    });
    expect(out).toContain("device:      (none)");
    expect(out).toContain("sync mode:   unknown");
    expect(out).toContain("provisional=? stale=false preset=? bank=?");
    expect(out).toContain("log entries: 0");
  });
});
