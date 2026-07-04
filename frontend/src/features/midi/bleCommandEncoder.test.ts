/**
 * Unit tests for the BLE command encoders.
 *
 * @see docs/specs/110-backend-midi-ble/spec.md [FR-19]
 */
import { describe, it, expect } from "vitest";
import { encodeVarint, buildAmpKnobFrame } from "./bleCommandEncoder";

describe("encodeVarint", () => {
  it("encodes single-byte values (< 128)", () => {
    expect(encodeVarint(0)).toEqual([0x00]);
    expect(encodeVarint(127)).toEqual([0x7f]);
  });
  it("encodes two-byte values (>= 128) little-endian base-128", () => {
    expect(encodeVarint(128)).toEqual([0x80, 0x01]);
    expect(encodeVarint(200)).toEqual([0xc8, 0x01]);
    expect(encodeVarint(255)).toEqual([0xff, 0x01]);
  });
});

describe("buildAmpKnobFrame", () => {
  it("builds a gain frame with a 1-byte value and correct length prefix", () => {
    // 0A C0 18 00 20 7F 28 00 1A 00 00 00  (len = frame.length - 2 = 10)
    expect(buildAmpKnobFrame("gain", 127)).toEqual([
      0x0a, 0xc0, 0x18, 0x00, 0x20, 0x7f, 0x28, 0x00, 0x1a, 0x00, 0x00, 0x00,
    ]);
  });

  it("builds a gain frame with a 2-byte value (matches the confirmed 0B template)", () => {
    // 0B C0 18 00 20 C8 01 28 00 1A 00 00 00
    expect(buildAmpKnobFrame("gain", 200)).toEqual([
      0x0b, 0xc0, 0x18, 0x00, 0x20, 0xc8, 0x01, 0x28, 0x00, 0x1a, 0x00, 0x00, 0x00,
    ]);
  });

  it("uses the correct write-slot id per knob and clamps to 0-255", () => {
    expect(buildAmpKnobFrame("level", 0)[3]).toBe(0x01);
    expect(buildAmpKnobFrame("bass", 0)[3]).toBe(0x02);
    expect(buildAmpKnobFrame("mid", 0)[3]).toBe(0x03);
    expect(buildAmpKnobFrame("treble", 0)[3]).toBe(0x04);
    expect(buildAmpKnobFrame("gain", 999)).toEqual(buildAmpKnobFrame("gain", 255));
  });
});
