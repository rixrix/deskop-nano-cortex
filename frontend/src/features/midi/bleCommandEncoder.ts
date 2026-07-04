/**
 * Encoders for captured Nano Cortex BLE command frames — build the raw frames
 * written to the `c304` characteristic. Byte-exact layouts per
 * docs/specs/110-backend-midi-ble/spec.md (Appendix) / [DES-BLE-PROTOCOL].
 *
 * EXPERIMENTAL / UNVERIFIED-writes: these frames change device state; keep them behind the
 * verification surface until confirmed against hardware ([NFR-8]).
 *
 * @see docs/specs/110-backend-midi-ble/design.md [DES-BLE-PROTOCOL]
 * @see docs/specs/200-frontend-control-surface/spec.md [FR-40]
 */
export type AmpKnob = "gain" | "level" | "bass" | "mid" | "treble";

/** Write-slot IDs for amp knobs (field `0x18` selector). */
const AMP_WRITE_ID: Record<AmpKnob, number> = {
  gain: 0x00,
  level: 0x01,
  bass: 0x02,
  mid: 0x03,
  treble: 0x04,
};

/** Little-endian base-128 varint. */
export function encodeVarint(value: number): number[] {
  let v = Math.max(0, Math.round(value));
  const out: number[] = [];
  do {
    let byte = v & 0x7f;
    v >>>= 7;
    if (v > 0) byte |= 0x80;
    out.push(byte);
  } while (v > 0);
  return out;
}

/**
 * Frame to set an amp knob (raw 0-255), written to `c304`:
 * `LEN C0 18 <id> 20 <value varint> 28 00 1A 00 00 00`, where `LEN = frame.length - 2`.
 */
export function buildAmpKnobFrame(knob: AmpKnob, value: number): number[] {
  const clamped = Math.max(0, Math.min(255, Math.round(value)));
  const body = [
    0xc0,
    0x18,
    AMP_WRITE_ID[knob],
    0x20,
    ...encodeVarint(clamped),
    0x28,
    0x00,
    0x1a,
    0x00,
    0x00,
    0x00,
  ];
  // byte[0] = full-frame length − 2 = body.length − 1.
  return [body.length - 1, ...body];
}
