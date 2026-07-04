/**
 * Unit tests for settings snapshot helpers — serialize, parse, round-trip,
 * validation, and localStorage apply/collect.
 *
 * @see docs/specs/200-frontend-control-surface/spec.md [FR-36]
 * @see docs/specs/400-dx-tooling/spec.md [FR-9]
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  collectSettingsSnapshot,
  parseSettingsSnapshot,
  serializeSettingsSnapshot,
  applySettingsSnapshot,
  type SettingsSnapshot,
} from "./settingsStorage";
import {
  FOOTSWITCH_STATE_STORAGE_KEY,
  OBSERVED_STATE_STORAGE_KEY,
  PRESET_NAME_STORAGE_KEY,
} from "./settingsKeys";

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  localStorage.clear();
});

// ─── Minimal valid snapshot factory ─────────────────────────────────────────

function makeSnapshot(overrides: Partial<SettingsSnapshot> = {}): SettingsSnapshot {
  return {
    version: 1,
    app: "desktop-nano-cortex",
    exportedAt: "2024-01-01T00:00:00.000Z",
    ...overrides,
  };
}

// ─── serializeSettingsSnapshot ───────────────────────────────────────────────

describe("serializeSettingsSnapshot", () => {
  it("returns valid JSON that round-trips through JSON.parse", () => {
    const snap = makeSnapshot({ presetNames: { "0": "Test Preset" } });
    const serialized = serializeSettingsSnapshot(snap);
    const parsed = JSON.parse(serialized) as SettingsSnapshot;
    expect(parsed.version).toBe(1);
    expect(parsed.app).toBe("desktop-nano-cortex");
  });

  it("ends with a trailing newline", () => {
    const snap = makeSnapshot();
    expect(serializeSettingsSnapshot(snap).endsWith("\n")).toBe(true);
  });

  it("uses 2-space indentation (pretty-prints)", () => {
    const snap = makeSnapshot();
    const serialized = serializeSettingsSnapshot(snap);
    // A pretty-printed JSON object always has at least one line starting with two spaces
    expect(serialized).toContain('  "version"');
  });
});

// ─── parseSettingsSnapshot ───────────────────────────────────────────────────

describe("parseSettingsSnapshot", () => {
  it("throws for non-JSON input", () => {
    expect(() => parseSettingsSnapshot("not json")).toThrow("not valid JSON");
  });

  it("throws for a JSON non-object (array)", () => {
    expect(() => parseSettingsSnapshot("[1, 2, 3]")).toThrow("JSON object");
  });

  it("throws for an unsupported version number", () => {
    const bad = JSON.stringify({ version: 99, app: "desktop-nano-cortex" });
    expect(() => parseSettingsSnapshot(bad)).toThrow("version is not supported");
  });

  it("throws for a snapshot from a different app", () => {
    const bad = JSON.stringify({ version: 1, app: "other-app" });
    expect(() => parseSettingsSnapshot(bad)).toThrow("different app");
  });

  it("accepts a minimal valid snapshot (no optional fields)", () => {
    const input = JSON.stringify({ version: 1 });
    const snap = parseSettingsSnapshot(input);
    expect(snap.version).toBe(1);
    expect(snap.app).toBe("desktop-nano-cortex");
  });

  it("preserves optional fields that are present", () => {
    const input = JSON.stringify({
      version: 1,
      exportedAt: "2024-06-01T12:00:00.000Z",
      presetNames: { "0": "My Preset" },
      observedState: { gain: 127 },
      footswitchState: { ia: 0 },
    });
    const snap = parseSettingsSnapshot(input);
    expect(snap.presetNames).toEqual({ "0": "My Preset" });
    expect(snap.observedState).toEqual({ gain: 127 });
    expect(snap.footswitchState).toEqual({ ia: 0 });
    expect(snap.exportedAt).toBe("2024-06-01T12:00:00.000Z");
  });

  it("does not include optional keys when they are absent", () => {
    const input = JSON.stringify({ version: 1 });
    const snap = parseSettingsSnapshot(input);
    expect("presetNames" in snap).toBe(false);
    expect("observedState" in snap).toBe(false);
    expect("footswitchState" in snap).toBe(false);
  });

  it("falls back to a fresh ISO timestamp when exportedAt is missing", () => {
    const input = JSON.stringify({ version: 1 });
    const snap = parseSettingsSnapshot(input);
    // Should be a valid ISO date string close to now
    expect(Date.parse(snap.exportedAt)).not.toBeNaN();
  });
});

// ─── Round-trip: serialize → parse ───────────────────────────────────────────

describe("serialize → parse round-trip", () => {
  it("survives a full round-trip with all optional fields", () => {
    const original = makeSnapshot({
      presetNames: { "0": "Clean", "1": "Crunch" },
      observedState: { gain: 80 },
      footswitchState: { ia: 2, ib: 3 },
    });
    const serialized = serializeSettingsSnapshot(original);
    const recovered = parseSettingsSnapshot(serialized);
    expect(recovered.version).toBe(original.version);
    expect(recovered.app).toBe(original.app);
    expect(recovered.exportedAt).toBe(original.exportedAt);
    expect(recovered.presetNames).toEqual(original.presetNames);
    expect(recovered.observedState).toEqual(original.observedState);
    expect(recovered.footswitchState).toEqual(original.footswitchState);
  });
});

// ─── applySettingsSnapshot ───────────────────────────────────────────────────

describe("applySettingsSnapshot", () => {
  it("imports all three sections when present", () => {
    const snap = makeSnapshot({
      presetNames: { "0": "Test" },
      observedState: { gain: 64 },
      footswitchState: { ia: 1 },
    });
    const summary = applySettingsSnapshot(snap);
    expect(summary.imported).toContain("preset names");
    expect(summary.imported).toContain("remembered hardware");
    expect(summary.imported).toContain("footswitch settings");
    expect(summary.skipped).toHaveLength(0);
  });

  it("skips sections that are absent from the snapshot", () => {
    const snap = makeSnapshot(); // no optional fields
    const summary = applySettingsSnapshot(snap);
    expect(summary.skipped).toContain("preset names");
    expect(summary.skipped).toContain("remembered hardware");
    expect(summary.skipped).toContain("footswitch settings");
    expect(summary.imported).toHaveLength(0);
  });

  it("writes presetNames to localStorage under the correct key", () => {
    const data = { "5": "Solo Lead" };
    applySettingsSnapshot(makeSnapshot({ presetNames: data }));
    const stored = JSON.parse(localStorage.getItem(PRESET_NAME_STORAGE_KEY) ?? "{}") as unknown;
    expect(stored).toEqual(data);
  });

  it("writes observedState to localStorage under the correct key", () => {
    const data = { gain: 100 };
    applySettingsSnapshot(makeSnapshot({ observedState: data }));
    const stored = JSON.parse(localStorage.getItem(OBSERVED_STATE_STORAGE_KEY) ?? "{}") as unknown;
    expect(stored).toEqual(data);
  });

  it("writes footswitchState to localStorage under the correct key", () => {
    const data = { ia: 3, ib: 7 };
    applySettingsSnapshot(makeSnapshot({ footswitchState: data }));
    const stored = JSON.parse(
      localStorage.getItem(FOOTSWITCH_STATE_STORAGE_KEY) ?? "{}",
    ) as unknown;
    expect(stored).toEqual(data);
  });
});

// ─── collectSettingsSnapshot ─────────────────────────────────────────────────

describe("collectSettingsSnapshot", () => {
  it("returns a snapshot with version 1 and the correct app identifier", () => {
    const snap = collectSettingsSnapshot();
    expect(snap.version).toBe(1);
    expect(snap.app).toBe("desktop-nano-cortex");
  });

  it("includes a valid exportedAt ISO timestamp", () => {
    const snap = collectSettingsSnapshot();
    expect(Date.parse(snap.exportedAt)).not.toBeNaN();
  });

  it("reads preset names written by applySettingsSnapshot", () => {
    const names = { "0": "Ambient", "1": "Lead" };
    applySettingsSnapshot(makeSnapshot({ presetNames: names }));
    const snap = collectSettingsSnapshot();
    expect(snap.presetNames).toEqual(names);
  });

  it("returns an empty object when localStorage has no data for a key", () => {
    const snap = collectSettingsSnapshot();
    // With empty localStorage the optional fields should be empty objects (readStoredJson returns {})
    expect(snap.presetNames).toEqual({});
    expect(snap.observedState).toEqual({});
    expect(snap.footswitchState).toEqual({});
  });
});
