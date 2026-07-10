/**
 * Unit tests for the provisional BLE packet decoder — label/order helpers and
 * minimal realistic log-entry inputs that exercise the parser paths.
 *
 * @see docs/specs/200-frontend-control-surface/spec.md [FR-33]
 * @see docs/specs/400-dx-tooling/spec.md [FR-9]
 */
import { describe, it, expect } from "vitest";
import {
  getObservedControlOrder,
  getObservedControlLabel,
  getObservedHardwareOrder,
  getObservedHardwareLabel,
  decodeObservedControlValues,
  decodeObservedHardwareValues,
  decodeLatestFootswitchSnapshot,
  decodeObservedExpression,
  decodeObservedStateDump,
} from "./protocolLabDecoder";

// ─── Label / order helpers ───────────────────────────────────────────────────

describe("getObservedControlOrder", () => {
  it("returns the six documented control ids in their canonical order", () => {
    const order = getObservedControlOrder();
    expect(order).toEqual(["gain", "bass", "mid", "treble", "amount", "level"]);
  });
});

describe("getObservedControlLabel", () => {
  it("returns the uppercase label for every control id", () => {
    expect(getObservedControlLabel("gain")).toBe("GAIN");
    expect(getObservedControlLabel("bass")).toBe("BASS");
    expect(getObservedControlLabel("mid")).toBe("MID");
    expect(getObservedControlLabel("treble")).toBe("TREBLE");
    expect(getObservedControlLabel("amount")).toBe("AMOUNT");
    expect(getObservedControlLabel("level")).toBe("LEVEL");
  });
});

describe("getObservedHardwareOrder", () => {
  it("returns all ten hardware ids in their canonical order", () => {
    const order = getObservedHardwareOrder();
    expect(order).toEqual([
      "bank",
      "bankItem",
      "fx",
      "footswitchI",
      "footswitchII",
      "encoderI",
      "encoderII",
      "save",
      "exit",
      "capture",
    ]);
  });
});

describe("getObservedHardwareLabel", () => {
  it("returns the correct label for each hardware id", () => {
    expect(getObservedHardwareLabel("bank")).toBe("BANK");
    expect(getObservedHardwareLabel("bankItem")).toBe("BANK ITEM");
    expect(getObservedHardwareLabel("fx")).toBe("FX");
    expect(getObservedHardwareLabel("footswitchI")).toBe("FS I");
    expect(getObservedHardwareLabel("footswitchII")).toBe("FS II");
    expect(getObservedHardwareLabel("encoderI")).toBe("FS I KNOB");
    expect(getObservedHardwareLabel("encoderII")).toBe("FS II KNOB");
    expect(getObservedHardwareLabel("save")).toBe("SAVE");
    expect(getObservedHardwareLabel("exit")).toBe("EXIT");
    expect(getObservedHardwareLabel("capture")).toBe("CAPTURE");
  });
});

// ─── Helpers to build minimal BLE log entries ────────────────────────────────
//
// The decoder looks for "[ble] notification 0000c305" in the message string and
// takes everything after the last ":" as the hex payload.  The payload must
// contain the fixed 3-byte header c0 08 01 to be considered a valid packet.

function makeLog(hexPayload: string, ts = 1000): { ts: number; message: string } {
  return { ts, message: `[ble] notification 0000c305-0000-1000-8000-00805f9b34fb: ${hexPayload}` };
}

// Unrelated log lines that should never yield decoded values.
const UNRELATED_LOG = { ts: 500, message: "some unrelated log line without ble notification" };

// ─── decodeObservedControlValues — empty / unrelated inputs ──────────────────

describe("decodeObservedControlValues", () => {
  it("returns an empty array for an empty log list", () => {
    expect(decodeObservedControlValues([])).toEqual([]);
  });

  it("returns an empty array for unrelated log lines", () => {
    expect(decodeObservedControlValues([UNRELATED_LOG])).toEqual([]);
  });

  it("returns an empty array for a c305 packet missing the c0 08 01 header", () => {
    // Payload with only zeroes — header not present
    const log = makeLog("00 00 00 00 00 00 00 00");
    expect(decodeObservedControlValues([log])).toEqual([]);
  });

  it("keeps only the latest value when the same control appears multiple times", () => {
    // Gain decode path: c0 08 01 20 <varInt≤0x7f> 30 01 1a
    // 0x50 = 80 decimal (varInt single byte, high bit clear)
    const log1 = makeLog("c0 08 01 20 50 30 01 1a", 1000);
    // 0x7f = 127 decimal
    const log2 = makeLog("c0 08 01 20 7f 30 01 1a", 2000);
    const result = decodeObservedControlValues([log1, log2]);
    const gainEntry = result.find((v) => v.id === "gain");
    expect(gainEntry).toBeDefined();
    // The latest packet should win
    expect(gainEntry!.rawValue).toBe(127);
    expect(gainEntry!.timestampMs).toBe(2000);
  });

  it("attaches the correct label, percent, payloadHex and confidence fields", () => {
    // Gain=0x7f=127: c0 08 01 20 7f 30 01 1a
    // (0xff would be a multi-byte varInt; single-byte max is 0x7f=127)
    const log = makeLog("c0 08 01 20 7f 30 01 1a", 9999);
    const result = decodeObservedControlValues([log]);
    const entry = result.find((v) => v.id === "gain");
    expect(entry).toBeDefined();
    expect(entry!.label).toBe("GAIN");
    expect(entry!.percent).toBe(50); // 127/255 * 100 ≈ 50
    expect(entry!.confidence).toBe("provisional");
    expect(entry!.payloadHex).toBe("c0 08 01 20 7f 30 01 1a");
    expect(entry!.timestampMs).toBe(9999);
  });

  it("decodes a level value from field 1 (0x18 0x01 ...)", () => {
    // Payload: c0 08 01  18 01  20 <varInt=64>  30 01 1a
    // field 1 → level; value byte 0x40 = 64
    const log = makeLog("c0 08 01 18 01 20 40 30 01 1a");
    const result = decodeObservedControlValues([log]);
    const entry = result.find((v) => v.id === "level");
    expect(entry).toBeDefined();
    expect(entry!.rawValue).toBe(64);
  });

  it("decodes a bass value from field 2 (0x18 0x02 ...)", () => {
    // field 2 → bass; value 0x20 = 32
    const log = makeLog("c0 08 01 18 02 20 20 30 01 1a");
    const result = decodeObservedControlValues([log]);
    const entry = result.find((v) => v.id === "bass");
    expect(entry).toBeDefined();
    expect(entry!.rawValue).toBe(32);
  });

  it("returns results in the canonical CONTROL_ORDER regardless of decode order", () => {
    const logLevel = makeLog("c0 08 01 18 01 20 10 30 01 1a", 100); // level
    const logGain = makeLog("c0 08 01 20 10 30 01 1a", 200); // gain
    const result = decodeObservedControlValues([logLevel, logGain]);
    const ids = result.map((v) => v.id);
    const order = getObservedControlOrder();
    // Only ids that actually decoded should appear, in canonical order
    for (let i = 0; i < ids.length - 1; i++) {
      expect(order.indexOf(ids[i])).toBeLessThan(order.indexOf(ids[i + 1]));
    }
  });

  it("decodes all five amp knob event families while ignoring expression and encoder noise", () => {
    const logs = [
      makeLog("0b c0 08 01 20 8f 01 30 01 1a 00 00 00", 100), // gain=143
      makeLog("0d c0 08 01 18 01 20 93 01 30 01 1a 00 00 00", 200), // level=147
      makeLog("0d c0 08 01 18 02 20 88 01 30 01 1a 00 00 00", 300), // bass=136
      makeLog("0d c0 08 01 18 03 20 84 01 30 01 1a 00 00 00", 400), // mid=132
      makeLog("0c c0 08 01 18 04 20 7c 30 01 1a 00 00 00", 500), // treble=124
      makeLog("0b c0 08 01 18 02 20 ff 01 40 00 00 00", 600), // expression toe
      makeLog("0a c0 08 01 18 01 20 03 1c 00 00 00", 700), // encoder I
    ];

    const result = new Map(decodeObservedControlValues(logs).map((entry) => [entry.id, entry]));
    expect(result.get("gain")?.rawValue).toBe(143);
    expect(result.get("level")?.rawValue).toBe(147);
    expect(result.get("bass")?.rawValue).toBe(136);
    expect(result.get("mid")?.rawValue).toBe(132);
    expect(result.get("treble")?.rawValue).toBe(124);
    expect(result.get("bass")?.timestampMs).toBe(300);
  });
});

// ─── decodeObservedHardwareValues ────────────────────────────────────────────

describe("decodeObservedHardwareValues", () => {
  it("returns an empty array for an empty log list", () => {
    expect(decodeObservedHardwareValues([])).toEqual([]);
  });

  it("returns an empty array for unrelated log lines", () => {
    expect(decodeObservedHardwareValues([UNRELATED_LOG])).toEqual([]);
  });

  it("decodes a bank button event (0x20 <value> 0x1c)", () => {
    // header c0 08 01, then 20 03 1c → bank select value 3
    const log = makeLog("c0 08 01 20 03 1c");
    const result = decodeObservedHardwareValues([log]);
    const entry = result.find((v) => v.id === "bank");
    expect(entry).toBeDefined();
    expect(entry!.label).toBe("BANK");
    expect(entry!.numericValue).toBe(3);
    expect(entry!.confidence).toBe("provisional");
  });

  it("decodes a capture press event (0x18 0x01 0x1b)", () => {
    const log = makeLog("c0 08 01 18 01 1b");
    const result = decodeObservedHardwareValues([log]);
    const entry = result.find((v) => v.id === "capture");
    expect(entry).toBeDefined();
    expect(entry!.value).toBe("Press");
  });

  it("decodes a save hold event (0x18 0x02 0x1b)", () => {
    const log = makeLog("c0 08 01 18 02 1b");
    const result = decodeObservedHardwareValues([log]);
    const entry = result.find((v) => v.id === "save");
    expect(entry).toBeDefined();
    expect(entry!.value).toBe("Hold");
  });

  it("decodes encoderI from field 0x01 (0x18 0x01 0x1c)", () => {
    // 18 01 1c → encoderI value=0 (no 0x20 prefix)
    const log = makeLog("c0 08 01 18 01 1c");
    const result = decodeObservedHardwareValues([log]);
    const encoder = result.find((v) => v.id === "encoderI");
    expect(encoder).toBeDefined();
    expect(encoder!.label).toBe("FS I KNOB");
  });

  it("decodes an exit press when the TRACE label is 'EXIT press'", () => {
    const traceStart = {
      ts: 1,
      message: "TRACE START: EXIT press",
    };
    // byte 0x1f → exit press after TRACE label set
    const log = makeLog("c0 08 01 1f", 2);
    const result = decodeObservedHardwareValues([traceStart, log]);
    const entry = result.find((v) => v.id === "exit");
    expect(entry).toBeDefined();
    expect(entry!.value).toBe("Press");
  });

  it("decodes the normal exit press packet without a trace label", () => {
    const log = makeLog("c0 08 01 1f");
    const result = decodeObservedHardwareValues([log]);
    const entry = result.find((v) => v.id === "exit");
    expect(entry).toBeDefined();
    expect(entry!.value).toBe("Press");
    expect(entry!.detail).toBe("exit press packet");
  });

  it("returns results in canonical HARDWARE_ORDER", () => {
    const logBank = makeLog("c0 08 01 20 01 1c", 100);
    const logCapture = makeLog("c0 08 01 18 01 1b", 200);
    const result = decodeObservedHardwareValues([logCapture, logBank]);
    const ids = result.map((v) => v.id);
    const order = getObservedHardwareOrder();
    for (let i = 0; i < ids.length - 1; i++) {
      expect(order.indexOf(ids[i])).toBeLessThan(order.indexOf(ids[i + 1]));
    }
  });
});

// ─── decodeLatestFootswitchSnapshot ─────────────────────────────────────────

describe("decodeLatestFootswitchSnapshot", () => {
  it("returns null for an empty log list", () => {
    expect(decodeLatestFootswitchSnapshot([])).toBeNull();
  });

  it("returns null when no footswitch/bank/fx snapshot event is present", () => {
    // Only a knob value — no snapshot trigger
    const log = makeLog("c0 08 01 20 40 30 01 1a");
    expect(decodeLatestFootswitchSnapshot([log])).toBeNull();
  });

  it("returns a snapshot when a bankItem footswitch-assignment packet is decoded", () => {
    // bankItem payload: 20 <preset> 28 <ia> 30 <ib> 38 <iia> 40 <iib>
    // preset=0, ia=0, ib=1, iia=2, iib=3  → footswitchI (I-A) selected
    // header: c0 08 01
    // 20 00  → preset raw 0
    // 28 00  → ia = 0
    // 30 01  → ib = 1
    // 38 02  → iia = 2
    // 40 03  → iib = 3
    const log = makeLog("c0 08 01 20 00 28 00 30 01 38 02 40 03", 5000);
    const snapshot = decodeLatestFootswitchSnapshot([log]);
    expect(snapshot).not.toBeNull();
    expect(snapshot!.timestampMs).toBe(5000);
    expect(snapshot!.event.id).toMatch(/bank|bankItem|fx|footswitchI|footswitchII/);
  });

  it("accumulates preceding control values into the snapshot", () => {
    // First a knob packet (gain=64, 0x40 is a valid single-byte varInt),
    // then a bankItem snapshot trigger.
    const logGain = makeLog("c0 08 01 20 40 30 01 1a", 1000); // gain=64
    const logSnap = makeLog("c0 08 01 20 00 28 00 30 01 38 02 40 03", 2000);
    const snapshot = decodeLatestFootswitchSnapshot([logGain, logSnap]);
    expect(snapshot).not.toBeNull();
    expect(snapshot!.controls.has("gain")).toBe(true);
    expect(snapshot!.controls.get("gain")!.rawValue).toBe(64);
  });

  it("records missingIds for controls not yet seen", () => {
    // Only a snapshot trigger, no preceding knob packets
    const log = makeLog("c0 08 01 20 00 28 00 30 01 38 02 40 03", 3000);
    const snapshot = decodeLatestFootswitchSnapshot([log]);
    expect(snapshot).not.toBeNull();
    // All six control ids should be missing (none were decoded before the trigger)
    expect(snapshot!.missingIds.length).toBeGreaterThan(0);
  });
});

// ─── Expression pedal (BLE 3-zone) ───────────────────────────────────────────

describe("decodeObservedExpression", () => {
  const HEEL = makeLog("08 c0 08 01 18 02 40 00 00 00", 100);
  const CENTER = makeLog("0b c0 08 01 18 02 20 80 01 40 00 00 00", 200);
  const TOE = makeLog("0b c0 08 01 18 02 20 ff 01 40 00 00 00", 300);

  it("returns null with no logs / unrelated logs", () => {
    expect(decodeObservedExpression([])).toBeNull();
    expect(decodeObservedExpression([UNRELATED_LOG])).toBeNull();
  });

  it("decodes heel (value field omitted) as raw 0 / 0%", () => {
    const r = decodeObservedExpression([HEEL]);
    expect(r).not.toBeNull();
    expect(r!.raw).toBe(0);
    expect(r!.zone).toBe("heel");
    expect(r!.percent).toBe(0);
    expect(r!.midiValue).toBe(0);
  });

  it("decodes center (varint 128) as 50% / CC1 64", () => {
    const r = decodeObservedExpression([CENTER]);
    expect(r!.raw).toBe(128);
    expect(r!.zone).toBe("center");
    expect(r!.percent).toBe(50);
    expect(r!.midiValue).toBe(64);
  });

  it("decodes toe (varint 255) as 100% / CC1 127", () => {
    const r = decodeObservedExpression([TOE]);
    expect(r!.raw).toBe(255);
    expect(r!.zone).toBe("toe");
    expect(r!.percent).toBe(100);
    expect(r!.midiValue).toBe(127);
  });

  it("returns the latest observation across a sweep", () => {
    const r = decodeObservedExpression([HEEL, CENTER, TOE, CENTER]);
    expect(r!.raw).toBe(128);
    expect(r!.timestampMs).toBe(200);
  });

  it("does NOT decode a knob packet (30 01 1A trailer) as expression", () => {
    // bass knob: c0 08 01 18 02 20 20 30 01 1a — trailer is 30 01 1A, not 40
    const knob = makeLog("c0 08 01 18 02 20 20 30 01 1a", 400);
    expect(decodeObservedExpression([knob])).toBeNull();
  });
});

// ─── Full current-state DUMP decode (real captured c305 reply) ────────────────

describe("decodeObservedStateDump", () => {
  // Real reply captured from a Nano Cortex (firmware 2.2.1) to the state-dump request.
  const DUMP =
    "E6 C1 08 01 18 7F 20 90 01 28 81 01 30 7F 38 71 40 7A 48 02 50 03 58 02 68 07 70 03 78 07 " +
    "C2 01 05 32 2E 32 2E 31 CA 01 08 30 35 63 33 36 36 32 31 D0 01 19 D8 01 0A E0 01 01 F0 01 01 " +
    "FA 01 05 01 01 00 00 00 82 02 55 08 01 12 0F 4E 6F 4D 61 74 63 68 20 43 68 69 65 66 20 31 " +
    "1A 40 64 34 38 62 34 33 31 36 64 62 63 63 37 36 34 62 34 62 34 62 33 66 36 33 34 64 38 38 37 " +
    "38 61 62 36 36 63 39 36 36 38 38 33 64 34 38 30 66 39 32 36 34 38 38 32 35 66 39 63 61 33 61 " +
    "30 30 33 30 8A 02 31 08 01 12 0F 31 31 30 20 55 53 20 50 52 4E 20 43 31 30 52 1A 1C 31 31 30 " +
    "20 55 53 20 50 52 4E 20 43 31 30 52 2F 52 69 62 62 6F 6E 20 31 36 30 2F 32 92 02 9C 01 0A 40 " +
    "64 34 38 62 34 33 31 36 64 62 63 63 37 36 34 62 34 62 34 62 33 66 36 33 34 64 38 38 37 38 61 " +
    "62 36 36 63 39 36 36 38 38 33 64 34 38 30 66 39 32 36 34 38 38 32 35 66 39 63 61 33 61 30 30 " +
    "33 30 12 0F 4E 6F 4D 61 74 63 68 20 43 68 69 65 66 20 31 22 16 0A 09 4E 65 75 72 61 6C 44 53 " +
    "50 12 09 4E 65 75 72 61 6C 44 53 50 32 08 61 6D 70 5F 68 65 61 64 3A 09 4D 61 74 63 68 6C 65 " +
    "73 73 3A 09 43 68 69 65 66 74 61 69 6E 40 06 52 06 67 75 69 74 61 72 58 01 62 01 31 68 00 9A " +
    "02 31 0A 0F 31 31 30 20 55 53 20 50 52 4E 20 43 31 30 52 12 00 1A 1C 31 31 30 20 55 53 20 50 " +
    "52 4E 20 43 31 30 52 2F 52 69 62 62 6F 6E 20 31 36 30 2F 32 A8 02 01 B0 02 0A B8 02 10 C0 02 " +
    "01 C8 02 01 D0 02 90 01 E0 02 7F F5 02 00 00 DC 43 80 03 D1 8C 01 88 03 1B 90 03 F3 36 98 03 " +
    "FA 2E A0 03 CB 3E AD 03 CD CC CC 3D C5 03 00 00 F0 42 F8 03 01 02 00 00 00";

  it("decodes the amp knobs, capture/IR names, firmware and bypass from a real dump", () => {
    const d = decodeObservedStateDump([makeLog(DUMP, 4242)]);
    expect(d).not.toBeNull();
    expect(d!.gain).toBe(127);
    expect(d!.level).toBe(144);
    expect(d!.bass).toBe(129);
    expect(d!.mid).toBe(127);
    expect(d!.treble).toBe(113);
    expect(d!.amount).toBe(122);
    expect(d!.captureSlot).toBe(2);
    expect(d!.captureVolume).toBe(127);
    expect(d!.gateOn).toBe(true);
    expect(d!.gateReduction).toBeNull();
    expect(d!.cabIrOn).toBe(false);
    expect(d!.firmware).toBe("2.2.1");
    expect(d!.captureName).toBe("NoMatch Chief 1");
    expect(d!.irName).toBe("110 US PRN C10R");
    expect(d!.bypass).toEqual([1, 1, 0, 0, 0]);
    expect(d!.fxModels).toEqual({
      "pre-1": { rawId: "D18C01", numericId: 18001 },
      "pre-2": { rawId: "1B", numericId: 27 },
      "post-1": { rawId: "F336", numericId: 7027 },
      "post-2": { rawId: "FA2E", numericId: 6010 },
      "post-3": { rawId: "CB3E", numericId: 8011 },
    });
    expect(d!.footswitchAssignments).toEqual({ ia: 3, ib: 7, iia: 10, iib: 16 });
    expect(d!.timestampMs).toBe(4242);
  });

  it("decodes Gate reduction when field 53 carries the confirmed dump mapping", () => {
    const gate75Dump = DUMP.replace("AD 03 CD CC CC 3D", "AD 03 B8 B7 37 3F");
    const d = decodeObservedStateDump([makeLog(gate75Dump, 7575)]);

    expect(d).not.toBeNull();
    expect(d!.gateReduction).toBe(75);
  });

  it("ignores short knob-event packets (0xC0) and returns null when no dump present", () => {
    expect(decodeObservedStateDump([makeLog("0b c0 08 01 18 02 20 80 01 40 00 00 00")])).toBeNull();
    expect(decodeObservedStateDump([])).toBeNull();
  });
});
