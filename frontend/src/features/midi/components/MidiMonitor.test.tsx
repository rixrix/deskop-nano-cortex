/**
 * Regression tests for the Advanced diagnostics capture panel.
 *
 * @see docs/specs/200-frontend-control-surface/spec.md [FR-17]
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { LogEntry } from "../../../shared/hooks/useLogs";
import type { MidiLogEntry } from "../types";
import { MidiMonitor } from "./MidiMonitor";

const MIDI_ENTRY: MidiLogEntry = {
  id: "midi-1",
  ts: Date.UTC(2026, 0, 1, 12, 0, 0),
  kind: "cc",
  channel: 1,
  number: 42,
  value: 127,
  label: "Tap Tempo",
  bytes: [0xb0, 42, 127],
};

const DIAGNOSTIC_ENTRY: LogEntry = {
  ts: Date.UTC(2026, 0, 1, 12, 0, 1),
  level: "info",
  message: "[usb-midi] CC Tap Tempo; ch=1 number=42 value=127 data=B0 2A 7F",
};

function renderMonitor(overrides: Partial<Parameters<typeof MidiMonitor>[0]> = {}) {
  const props = {
    entries: [MIDI_ENTRY],
    onClear: vi.fn(),
    diagnosticsEnabled: false,
    diagnosticEntries: [] as LogEntry[],
    diagnosticStartedAt: null,
    onToggleDiagnostics: vi.fn(),
    onResetDiagnostics: vi.fn(),
    onCopyDiagnostics: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };

  render(<MidiMonitor {...props} />);
  return props;
}

describe("MidiMonitor", () => {
  it("keeps diagnostics opt-in and exposes enable/reset/copy controls", async () => {
    const props = renderMonitor();

    expect(screen.getByText("Diagnostics are off")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reset" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Copy" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Enable diagnostics" }));
    expect(props.onToggleDiagnostics).toHaveBeenCalledWith(true);

    fireEvent.click(screen.getByRole("button", { name: "Clear USB" }));
    expect(props.onClear).toHaveBeenCalledOnce();
  });

  it("renders captured diagnostic entries and copies the standard bundle", async () => {
    const props = renderMonitor({
      diagnosticsEnabled: true,
      diagnosticEntries: [DIAGNOSTIC_ENTRY],
      diagnosticStartedAt: Date.UTC(2026, 0, 1, 12, 0, 0),
    });

    expect(screen.getByText(/Capturing since/)).toBeInTheDocument();
    expect(screen.getByText(DIAGNOSTIC_ENTRY.message)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(props.onResetDiagnostics).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "Copy" }));

    await waitFor(() => expect(props.onCopyDiagnostics).toHaveBeenCalledOnce());
    expect(await screen.findByRole("button", { name: "Copied" })).toBeInTheDocument();
  });
});
