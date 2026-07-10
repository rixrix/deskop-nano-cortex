/**
 * Provisional BLE packet decoder — pure text parsing of midi://log lines into observed control values.
 *
 * @see docs/specs/200-frontend-control-surface/spec.md [FR-33]
 * @see docs/specs/200-frontend-control-surface/design.md [DES-FRONT-DECODER]
 */
import type { DecodedFxModelIds } from "./fxProtocol";

export type ObservedControlId = "gain" | "level" | "bass" | "mid" | "treble" | "amount";
export type ObservedHardwareId =
  | "bank"
  | "bankItem"
  | "fx"
  | "footswitchI"
  | "footswitchII"
  | "encoderI"
  | "encoderII"
  | "save"
  | "exit"
  | "capture";

export interface ObservedControlValue {
  id: ObservedControlId;
  label: string;
  rawValue: number;
  percent: number;
  payloadHex: string;
  timestampMs: number;
  confidence: "provisional";
}

export interface ObservedFootswitchAssignments {
  ia: number;
  ib: number;
  iia: number;
  iib: number;
}

export interface ObservedHardwareValue {
  id: ObservedHardwareId;
  label: string;
  value: string;
  numericValue?: number;
  footswitchAssignments?: ObservedFootswitchAssignments;
  detail: string;
  payloadHex: string;
  timestampMs: number;
  confidence: "provisional";
}

export interface ObservedFootswitchSnapshot {
  event: ObservedHardwareValue;
  controls: Map<ObservedControlId, ObservedControlValue>;
  missingIds: ObservedControlId[];
  timestampMs: number;
}

export type ObservedExpressionZone = "heel" | "center" | "toe";

export interface ObservedExpressionValue {
  /** Raw field-4 value as reported by the device (0-255; observed only as 0/128/255). */
  raw: number;
  /** `raw` mapped onto the 0-127 CC1 expression scale. */
  midiValue: number;
  /** Position estimate 0-100 for UI animation. */
  percent: number;
  zone: ObservedExpressionZone;
  payloadHex: string;
  timestampMs: number;
  confidence: "provisional";
}

/**
 * Read-only current-state dump request frame — write to the `c304` characteristic; the device
 * replies with the full state on `c305`. @see docs/specs/110-backend-midi-ble/design.md
 * [DES-BLE-PROTOCOL].
 */
export const STATE_DUMP_REQUEST_FRAME: number[] = [
  0x0c, 0xc0, 0x08, 0x03, 0x18, 0x01, 0x20, 0x01, 0x28, 0x01, 0x01, 0x00, 0x00, 0x00,
];

/**
 * Full current-state DUMP decoded from a `c305` reply to the state-dump request. This is a
 * DIFFERENT namespace from the knob-twist EVENT decoder above — see
 * docs/specs/110-backend-midi-ble/design.md [DES-BLE-PROTOCOL]. Confirmed against hardware.
 */
export interface DecodedStateDump {
  gain: number | null;
  level: number | null;
  bass: number | null;
  mid: number | null;
  treble: number | null;
  amount: number | null;
  captureSlot: number | null;
  captureVolume: number | null;
  gateOn: boolean | null;
  gateReduction: number | null;
  cabIrOn: boolean | null;
  firmware: string | null;
  captureName: string | null;
  irName: string | null;
  /** `[pre1,pre2,post1,post2,post3]`, 0 = on / non-zero = bypassed. */
  bypass: number[] | null;
  fxModels: DecodedFxModelIds | null;
  footswitchAssignments: ObservedFootswitchAssignments | null;
  payloadHex: string;
  timestampMs: number;
  confidence: "provisional";
}

interface LogLike {
  ts: number;
  message: string;
}

type DecodedHardwareValue = Pick<
  ObservedHardwareValue,
  "id" | "value" | "numericValue" | "footswitchAssignments" | "detail"
>;

const CONTROL_ORDER: ObservedControlId[] = ["gain", "bass", "mid", "treble", "amount", "level"];
const HARDWARE_ORDER: ObservedHardwareId[] = [
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
];

const CONTROL_LABELS: Record<ObservedControlId, string> = {
  gain: "GAIN",
  bass: "BASS",
  mid: "MID",
  treble: "TREBLE",
  amount: "AMOUNT",
  level: "LEVEL",
};

const HARDWARE_LABELS: Record<ObservedHardwareId, string> = {
  bank: "BANK",
  bankItem: "BANK ITEM",
  fx: "FX",
  footswitchI: "FS I",
  footswitchII: "FS II",
  encoderI: "FS I KNOB",
  encoderII: "FS II KNOB",
  save: "SAVE",
  exit: "EXIT",
  capture: "CAPTURE",
};

const CONTROL_ID_BY_FIELD: Record<number, ObservedControlId> = {
  1: "level",
  2: "bass",
  3: "mid",
  4: "treble",
  5: "amount",
  8: "amount",
  7: "amount",
  9: "amount",
};

export function getObservedControlOrder(): ObservedControlId[] {
  return CONTROL_ORDER;
}

export function getObservedControlLabel(id: ObservedControlId): string {
  return CONTROL_LABELS[id];
}

export function getObservedHardwareOrder(): ObservedHardwareId[] {
  return HARDWARE_ORDER;
}

export function getObservedHardwareLabel(id: ObservedHardwareId): string {
  return HARDWARE_LABELS[id];
}

export function decodeObservedControlValues(logs: LogLike[]): ObservedControlValue[] {
  const latest = new Map<ObservedControlId, ObservedControlValue>();
  let traceLabel: string | null = null;

  for (const log of logs) {
    traceLabel = nextTraceLabel(traceLabel, log.message);
    const decoded = decodeControlLogEntry(log, traceLabel);
    if (decoded) latest.set(decoded.id, decoded);
  }

  return CONTROL_ORDER.flatMap((id) => {
    const value = latest.get(id);
    return value ? [value] : [];
  });
}

export function decodeObservedHardwareValues(logs: LogLike[]): ObservedHardwareValue[] {
  const latest = new Map<ObservedHardwareId, ObservedHardwareValue>();
  let traceLabel: string | null = null;

  for (const log of logs) {
    traceLabel = nextTraceLabel(traceLabel, log.message);
    for (const decoded of decodeHardwareLogEntry(log, traceLabel)) {
      latest.set(decoded.id, decoded);
    }
  }

  return HARDWARE_ORDER.flatMap((id) => {
    const value = latest.get(id);
    return value ? [value] : [];
  });
}

export function decodeLatestFootswitchSnapshot(logs: LogLike[]): ObservedFootswitchSnapshot | null {
  const latestControls = new Map<ObservedControlId, ObservedControlValue>();
  let snapshot: ObservedFootswitchSnapshot | null = null;
  let traceLabel: string | null = null;

  for (const log of logs) {
    traceLabel = nextTraceLabel(traceLabel, log.message);
    const control = decodeControlLogEntry(log, traceLabel);
    if (control) {
      latestControls.set(control.id, control);
      if (snapshot) {
        snapshot.controls.set(control.id, control);
        snapshot.missingIds = CONTROL_ORDER.filter((id) => !snapshot?.controls.has(id));
        snapshot.timestampMs = log.ts;
      }
    }

    for (const event of decodeHardwareLogEntry(log, traceLabel)) {
      if (!isSnapshotHardwareEvent(event.id)) continue;
      const controls = new Map(latestControls);
      snapshot = {
        event,
        controls,
        missingIds: CONTROL_ORDER.filter((id) => !controls.has(id)),
        timestampMs: log.ts,
      };
    }
  }

  return snapshot;
}

/**
 * Decode the latest expression-pedal position from the BLE `c305` stream.
 *
 * The Nano Cortex reports the pedal only over BLE, quantized to three zones
 * (`0`/`128`/`255` = heel/center/toe). Packet shapes: `C0 08 01 18 02 20 <v> 40 00 00 00`, and
 * `C0 08 01 18 02 40 00 00 00` for heel (the `20 <v>` value field is omitted → raw 0). The
 * `0x40` trailer distinguishes both from the knob family's `30 01 1A`. See
 * docs/specs/110-backend-midi-ble/design.md [DES-BLE-DECODER].
 */
export function decodeObservedExpression(logs: LogLike[]): ObservedExpressionValue | null {
  let latest: ObservedExpressionValue | null = null;
  for (const log of logs) {
    const decoded = decodeExpressionLogEntry(log);
    if (decoded) latest = decoded;
  }
  return latest;
}

function decodeExpressionLogEntry(log: LogLike): ObservedExpressionValue | null {
  const payloadHex = c305PayloadHex(log.message);
  if (!payloadHex) return null;

  const bytes = parseHexBytes(payloadHex);
  if (bytes.length === 0) return null;

  const headerIndex = findHeader(bytes);
  if (headerIndex < 0) return null;

  const index = headerIndex + 3;
  if (bytes[index] !== 0x18 || bytes[index + 1] !== 0x02) return null;

  let raw: number;
  let trailerIndex: number;
  if (bytes[index + 2] === 0x20) {
    const parsed = readVarInt(bytes, index + 3);
    if (!parsed) return null;
    raw = parsed.value;
    trailerIndex = parsed.nextIndex;
  } else if (bytes[index + 2] === 0x40) {
    raw = 0; // value field omitted → heel (0)
    trailerIndex = index + 2;
  } else {
    return null;
  }

  // Pedal family ends with the `0x40` field; the knob family continues `30 01 1A`.
  if (bytes[trailerIndex] !== 0x40) return null;

  const clamped = Math.max(0, Math.min(255, raw));
  const zone: ObservedExpressionZone = clamped <= 64 ? "heel" : clamped >= 192 ? "toe" : "center";

  return {
    raw: clamped,
    midiValue: Math.round((clamped / 255) * 127),
    percent: Math.round((clamped / 255) * 100),
    zone,
    payloadHex,
    timestampMs: log.ts,
    confidence: "provisional",
  };
}

/**
 * Decode the latest full current-state DUMP from the `c305` stream (reply to a state-dump
 * request). The reply is a single large notification whose 2nd byte is `0xC1`; strip the 2-byte
 * packet header, then parse the protobuf body. Field map per [DES-BLE-PROTOCOL].
 */
export function decodeObservedStateDump(logs: LogLike[]): DecodedStateDump | null {
  let latest: DecodedStateDump | null = null;
  for (const log of logs) {
    const decoded = decodeStateDumpEntry(log);
    if (decoded) latest = decoded;
  }
  return latest;
}

function decodeStateDumpEntry(log: LogLike): DecodedStateDump | null {
  const payloadHex = c305PayloadHex(log.message);
  if (!payloadHex) return null;
  const bytes = parseHexBytes(payloadHex);
  // Dump replies are large and carry 0xC1 as the 2nd byte (vs 0xC0 for command/event frames).
  if (bytes.length < 40 || bytes[1] !== 0xc1) return null;

  const fields = parseProtoFields(bytes.slice(2)); // drop the 2-byte packet header
  const varint = (f: number): number | null => {
    const e = fields.get(f);
    return e && e.kind === "varint" ? e.value : null;
  };
  const boolFlag = (f: number): boolean | null => {
    const e = fields.get(f);
    if (!e) return null;
    if (e.kind === "varint") return e.value !== 0;
    if (e.kind === "bytes") return e.bytes.length > 0;
    return e.value !== 0;
  };
  const fixed32Float = (f: number): number | null => {
    const e = fields.get(f);
    return e && e.kind === "fixed32" ? e.value : null;
  };
  const subName = (f: number): string | null => {
    const e = fields.get(f);
    if (!e || e.kind !== "bytes") return null;
    const name = parseProtoFields(e.bytes).get(2); // capture/IR submsg: {1:enabled, 2:name, ...}
    return name && name.kind === "bytes" ? asciiOf(name.bytes) : null;
  };
  const firmware = fields.get(24);
  const bypass = fields.get(31);
  const fxModel = (f: number): { rawId: string; numericId: number | null } | null => {
    const e = fields.get(f);
    if (!e) return null;
    if (e.kind === "varint") {
      return { rawId: hexCompact(encodeVarInt(e.value)), numericId: e.value };
    }
    if (e.kind !== "bytes") return null;
    return { rawId: hexCompact(e.bytes), numericId: decodeVarInt(e.bytes) };
  };

  return {
    gain: varint(3),
    level: varint(4),
    bass: varint(5),
    mid: varint(6),
    treble: varint(7),
    amount: varint(8),
    captureSlot: varint(11),
    captureVolume: varint(44),
    gateOn: varint(54) === null ? true : varint(54) === 0,
    gateReduction: gateReductionFromDumpValue(fixed32Float(53)),
    cabIrOn: boolFlag(12) ?? false,
    firmware: firmware && firmware.kind === "bytes" ? asciiOf(firmware.bytes) : null,
    captureName: subName(32),
    irName: subName(33),
    bypass: bypass && bypass.kind === "bytes" ? bypass.bytes.slice(0, 5) : null,
    fxModels: {
      "pre-1": fxModel(48) ?? undefined,
      "pre-2": fxModel(49) ?? undefined,
      "post-1": fxModel(50) ?? undefined,
      "post-2": fxModel(51) ?? undefined,
      "post-3": fxModel(52) ?? undefined,
    },
    footswitchAssignments:
      varint(14) !== null && varint(15) !== null && varint(38) !== null && varint(39) !== null
        ? {
            ia: varint(14)!,
            ib: varint(15)!,
            iia: varint(38)!,
            iib: varint(39)!,
          }
        : null,
    payloadHex,
    timestampMs: log.ts,
    confidence: "provisional",
  };
}

type ProtoField =
  | { kind: "varint"; value: number }
  | { kind: "bytes"; bytes: number[] }
  | { kind: "fixed32"; value: number };

/** Minimal protobuf reader — keeps the first occurrence of each field number. */
function parseProtoFields(bytes: number[]): Map<number, ProtoField> {
  const out = new Map<number, ProtoField>();
  let i = 0;
  while (i < bytes.length) {
    const tag = readVarInt(bytes, i);
    if (!tag) break;
    const field = tag.value >> 3;
    const wire = tag.value & 0x7;
    i = tag.nextIndex;
    if (wire === 0) {
      const v = readVarInt(bytes, i);
      if (!v) break;
      if (!out.has(field)) out.set(field, { kind: "varint", value: v.value });
      i = v.nextIndex;
    } else if (wire === 2) {
      const len = readVarInt(bytes, i);
      if (!len) break;
      const end = len.nextIndex + len.value;
      if (end > bytes.length) break;
      if (!out.has(field))
        out.set(field, { kind: "bytes", bytes: bytes.slice(len.nextIndex, end) });
      i = end;
    } else if (wire === 5) {
      const end = i + 4;
      if (end > bytes.length) break;
      if (!out.has(field))
        out.set(field, {
          kind: "fixed32",
          value: new DataView(Uint8Array.from(bytes.slice(i, end)).buffer).getFloat32(0, true),
        });
      i += 4;
    } else if (wire === 1) {
      i += 8;
    } else {
      break;
    }
  }
  return out;
}

function hexCompact(bytes: number[]): string {
  return bytes.map((byte) => byte.toString(16).padStart(2, "0").toUpperCase()).join("");
}

function encodeVarInt(value: number): number[] {
  const out: number[] = [];
  let next = Math.max(0, Math.floor(value));
  do {
    let byte = next & 0x7f;
    next = Math.floor(next / 128);
    if (next > 0) byte |= 0x80;
    out.push(byte);
  } while (next > 0);
  return out;
}

function decodeVarInt(bytes: number[]): number | null {
  let value = 0;
  let shift = 0;
  for (const byte of bytes) {
    value += (byte & 0x7f) * 2 ** shift;
    if ((byte & 0x80) === 0) return value;
    shift += 7;
    if (shift > 53) return null;
  }
  return null;
}

function gateReductionFromDumpValue(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  const percent = Math.round(value * 255) - 108;
  return percent >= 0 && percent <= 100 ? percent : null;
}

function asciiOf(bytes: number[]): string | null {
  if (bytes.length === 0 || !bytes.every((b) => b >= 32 && b < 127)) return null;
  return String.fromCharCode(...bytes);
}

function decodeControlLogEntry(
  log: LogLike,
  traceLabel: string | null = null,
): ObservedControlValue | null {
  const payloadHex = c305PayloadHex(log.message);
  if (!payloadHex) return null;

  const bytes = parseHexBytes(payloadHex);
  if (bytes.length === 0) return null;

  const decoded = decodeKnobPayload(bytes, traceLabel);
  if (!decoded) return null;

  return {
    ...decoded,
    label: CONTROL_LABELS[decoded.id],
    percent: Math.round((Math.max(0, Math.min(255, decoded.rawValue)) / 255) * 100),
    payloadHex,
    timestampMs: log.ts,
    confidence: "provisional",
  };
}

function decodeHardwareLogEntry(
  log: LogLike,
  traceLabel: string | null = null,
): ObservedHardwareValue[] {
  const payloadHex = c305PayloadHex(log.message);
  if (!payloadHex) return [];

  const bytes = parseHexBytes(payloadHex);
  if (bytes.length === 0) return [];

  return decodeHardwarePayload(bytes, traceLabel).map((decoded) => ({
    ...decoded,
    label: HARDWARE_LABELS[decoded.id],
    payloadHex,
    timestampMs: log.ts,
    confidence: "provisional",
  }));
}

function decodeKnobPayload(
  bytes: number[],
  traceLabel: string | null = null,
): Pick<ObservedControlValue, "id" | "rawValue"> | null {
  const headerIndex = findHeader(bytes);
  if (headerIndex < 0) return null;

  let index = headerIndex + 3;
  let id: ObservedControlId | null = null;
  const traceControlId = controlIdFromTraceLabel(traceLabel);

  if (bytes[index] === 0x18) {
    const field = bytes[index + 1];
    id = field === undefined ? null : (CONTROL_ID_BY_FIELD[field] ?? null);

    if (bytes[index + 2] === 0x2d) {
      return decodeAmountFloatPayload(bytes, index, traceControlId);
    }

    index += 2;
  } else if (bytes[index] === 0x20) {
    const amountFloat = decodeAmountFloatPayload(bytes, index, traceControlId);
    if (amountFloat) return amountFloat;
    id = "gain";
  }

  if (!id) return null;

  if (bytes[index] === 0x30 && bytes[index + 1] === 0x01 && bytes[index + 2] === 0x1a) {
    return { id, rawValue: 0 };
  }

  if (bytes[index] !== 0x20) return null;
  const parsed = readVarInt(bytes, index + 1);
  if (!parsed) return null;

  // The captured knob-value family then carries "30 01 1A ...".
  // Avoid treating footswitch/tuner/audio packets as knob values.
  if (
    bytes[parsed.nextIndex] !== 0x30 ||
    bytes[parsed.nextIndex + 1] !== 0x01 ||
    bytes[parsed.nextIndex + 2] !== 0x1a
  ) {
    return null;
  }

  return { id, rawValue: parsed.value };
}

function decodeAmountFloatPayload(
  bytes: number[],
  index: number,
  traceControlId: ObservedControlId | null,
): Pick<ObservedControlValue, "id" | "rawValue"> | null {
  const hasDirectAmountPrefix = bytes[index] === 0x20 && bytes[index + 1] === 0x01;
  const hasFieldAmountPrefix =
    bytes[index] === 0x18 && (bytes[index + 1] === 0x02 || bytes[index + 1] === 0x04);
  if ((!hasDirectAmountPrefix && !hasFieldAmountPrefix) || bytes[index + 2] !== 0x2d) {
    return null;
  }
  if (traceControlId && traceControlId !== "amount") return null;

  // AMOUNT emits a float32 mirror packet guarded by "63 00 00 00".
  // Tuner/audio float packets use nearby shapes, so keep this guard narrow.
  if (
    bytes[index + 7] !== 0x63 ||
    bytes[index + 8] !== 0x00 ||
    bytes[index + 9] !== 0x00 ||
    bytes[index + 10] !== 0x00
  ) {
    return null;
  }

  const value = readFloat32Le(bytes, index + 3);
  if (value === null || !Number.isFinite(value)) return null;

  return { id: "amount", rawValue: Math.round(Math.max(0, Math.min(255, value))) };
}

function controlIdFromTraceLabel(traceLabel: string | null): ObservedControlId | null {
  const normalized = traceLabel?.toLowerCase() ?? "";
  if (normalized.includes("amount")) return "amount";
  if (normalized.includes("gain")) return "gain";
  if (normalized.includes("bass")) return "bass";
  if (normalized.includes("mid")) return "mid";
  if (normalized.includes("treble")) return "treble";
  if (normalized.includes("level")) return "level";
  return null;
}

function decodeHardwarePayload(bytes: number[], traceLabel: string | null): DecodedHardwareValue[] {
  const headerIndex = findHeader(bytes);
  if (headerIndex < 0) return [];

  const index = headerIndex + 3;
  return [
    ...decodeBankButtonPayload(bytes, index),
    ...decodeFootswitchPresetPayload(bytes, index),
    ...decodeFxPayload(bytes, index),
    ...decodeFootswitchEncoderPayload(bytes, index),
    ...decodeUtilityButtonPayload(bytes, index, traceLabel),
  ];
}

function decodeBankButtonPayload(bytes: number[], index: number): DecodedHardwareValue[] {
  if (bytes[index] !== 0x20) return [];

  const parsed = readVarInt(bytes, index + 1);
  if (!parsed || bytes[parsed.nextIndex] !== 0x1c) return [];

  return [
    {
      id: "bank",
      value: "Select",
      numericValue: parsed.value,
      detail: "button opens/advances bank list",
    },
  ];
}

function decodeFootswitchPresetPayload(bytes: number[], index: number): DecodedHardwareValue[] {
  if (bytes[index] !== 0x20) return [];

  const preset = readVarInt(bytes, index + 1);
  if (!preset) return [];

  // Captured footswitch press packets continue with an assignment snapshot:
  // 28 <I-A> 30 <I-B> 38 <II-A> 40 <II-B>.
  const assignments = decodeFootswitchAssignmentSnapshot(bytes, preset.nextIndex);
  if (!assignments) return [];

  const itemIndex = Math.max(0, preset.value);
  const presetLabel =
    itemIndex < 64
      ? `${String.fromCharCode(65 + Math.floor(itemIndex / 8))}${(itemIndex % 8) + 1}`
      : `Raw ${itemIndex}`;
  const footswitchEvent = footswitchEventFromAssignment(itemIndex, assignments);

  return [
    {
      id: "bankItem",
      value: presetLabel,
      numericValue: itemIndex,
      footswitchAssignments: assignments,
      detail: `selected raw ${preset.value}; FS ${assignments.ia}/${assignments.ib}/${assignments.iia}/${assignments.iib}`,
    },
    ...(footswitchEvent ? [footswitchEvent] : []),
  ];
}

function decodeFootswitchAssignmentSnapshot(
  bytes: number[],
  index: number,
): ObservedFootswitchAssignments | null {
  if (bytes[index] !== 0x28) return null;
  const ia = readVarInt(bytes, index + 1);
  if (!ia || bytes[ia.nextIndex] !== 0x30) return null;
  const ib = readVarInt(bytes, ia.nextIndex + 1);
  if (!ib || bytes[ib.nextIndex] !== 0x38) return null;
  const iia = readVarInt(bytes, ib.nextIndex + 1);
  if (!iia || bytes[iia.nextIndex] !== 0x40) return null;
  const iib = readVarInt(bytes, iia.nextIndex + 1);
  if (!iib) return null;

  return {
    ia: ia.value,
    ib: ib.value,
    iia: iia.value,
    iib: iib.value,
  };
}

function footswitchEventFromAssignment(
  preset: number,
  assignments: ObservedFootswitchAssignments,
): DecodedHardwareValue | null {
  if (preset === assignments.ia) {
    return {
      id: "footswitchI",
      value: "I-A",
      numericValue: preset,
      footswitchAssignments: assignments,
      detail: `selected assigned preset raw ${preset}`,
    };
  }
  if (preset === assignments.ib) {
    return {
      id: "footswitchI",
      value: "I-B",
      numericValue: preset,
      footswitchAssignments: assignments,
      detail: `selected assigned preset raw ${preset}`,
    };
  }
  if (preset === assignments.iia) {
    return {
      id: "footswitchII",
      value: "II-A",
      numericValue: preset,
      footswitchAssignments: assignments,
      detail: `selected assigned preset raw ${preset}`,
    };
  }
  if (preset === assignments.iib) {
    return {
      id: "footswitchII",
      value: "II-B",
      numericValue: preset,
      footswitchAssignments: assignments,
      detail: `selected assigned preset raw ${preset}`,
    };
  }
  return null;
}

function decodeFxPayload(bytes: number[], index: number): DecodedHardwareValue[] {
  if (bytes[index] !== 0x18) return [];

  const field = bytes[index + 1];
  if (field === 0x02 && bytes[index + 2] === 0x20) {
    const parsed = readVarInt(bytes, index + 3);
    if (parsed && bytes[parsed.nextIndex] === 0x1c) {
      return [
        {
          id: "fx",
          value: `Press ${parsed.value}`,
          numericValue: parsed.value,
          detail: "field 2 event",
        },
      ];
    }
  }

  if (field === 0x06 && bytes[index + 2] === 0x20) {
    const parsed = readVarInt(bytes, index + 3);
    if (
      parsed &&
      bytes[parsed.nextIndex] === 0x30 &&
      bytes[parsed.nextIndex + 1] === 0x01 &&
      bytes[parsed.nextIndex + 2] === 0x1a
    ) {
      return [
        {
          id: "fx",
          value: parsed.value >= 64 ? "On" : "Off",
          numericValue: parsed.value,
          detail: "field 6 state",
        },
      ];
    }
  }

  if (field === 0x05 && bytes[index + 2] === 0x1f) {
    return [
      {
        id: "fx",
        value: "Hold",
        detail: "field 5 hold",
      },
    ];
  }

  return [];
}

function decodeFootswitchEncoderPayload(bytes: number[], index: number): DecodedHardwareValue[] {
  if (bytes[index] !== 0x18) return [];

  const field = bytes[index + 1];
  if (field !== 0x01 && field !== 0x03) return [];

  let value = 0;
  let nextIndex = index + 2;
  if (bytes[nextIndex] === 0x20) {
    const parsed = readVarInt(bytes, nextIndex + 1);
    if (!parsed) return [];
    value = parsed.value;
    nextIndex = parsed.nextIndex;
  }

  if (bytes[nextIndex] !== 0x1c) return [];

  const id: ObservedHardwareId = field === 0x01 ? "encoderI" : "encoderII";
  return [
    {
      id,
      value: String(value),
      numericValue: value,
      detail: field === 0x01 ? "capture selector BLE raw" : "IR selector BLE raw",
    },
  ];
}

function decodeUtilityButtonPayload(
  bytes: number[],
  index: number,
  traceLabel: string | null,
): DecodedHardwareValue[] {
  const events: DecodedHardwareValue[] = [];

  if (bytes[index] === 0x18 && bytes[index + 1] === 0x02 && bytes[index + 2] === 0x1b) {
    events.push({
      id: "save",
      value: "Hold",
      detail: "hold packet 18 02 1B; press emitted no c305",
    });
  }

  if (bytes[index] === 0x18 && bytes[index + 1] === 0x01 && bytes[index + 2] === 0x1b) {
    events.push({
      id: "capture",
      value: "Press",
      detail: "capture press field 1",
    });
  }

  if (bytes[index] === 0x49) {
    events.push({
      id: "capture",
      value: "Press",
      numericValue: 0x49,
      detail: "capture press confirm",
    });
  }

  if (
    (bytes[index] === 0x20 &&
      bytes[index + 1] === 0x01 &&
      bytes[index + 2] === 0x30 &&
      bytes[index + 3] === 0x7f &&
      bytes[index + 4] === 0x7e) ||
    (bytes[index] === 0x30 && bytes[index + 1] === 0x7f && bytes[index + 2] === 0x7e)
  ) {
    events.push({
      id: "capture",
      value: "Hold",
      detail: "capture hold guard 30 7F 7E",
    });
  }

  if (bytes[index] === 0x1f || (traceLabel === "EXIT press" && bytes[index] === 0x1b)) {
    events.push({
      id: "exit",
      value: "Press",
      numericValue: bytes[index],
      detail:
        bytes[index] === 0x1f
          ? "exit press packet"
          : "trace-confirmed; bare packet is otherwise ambiguous",
    });
  }

  return events;
}

function isSnapshotHardwareEvent(id: ObservedHardwareId): boolean {
  return (
    id === "bank" ||
    id === "bankItem" ||
    id === "fx" ||
    id === "footswitchI" ||
    id === "footswitchII"
  );
}

function nextTraceLabel(current: string | null, message: string): string | null {
  const start = message.match(/TRACE START: (.+)$/);
  if (start?.[1]) return start[1];
  if (message.includes("TRACE STOP:")) return null;
  return current;
}

function findHeader(bytes: number[]): number {
  for (let i = 0; i <= bytes.length - 3; i += 1) {
    if (bytes[i] === 0xc0 && bytes[i + 1] === 0x08 && bytes[i + 2] === 0x01) {
      return i;
    }
  }
  return -1;
}

function readVarInt(
  bytes: number[],
  startIndex: number,
): { value: number; nextIndex: number } | null {
  let value = 0;
  let shift = 0;

  for (let index = startIndex; index < bytes.length; index += 1) {
    const byte = bytes[index];
    if (byte === undefined) return null;
    value |= (byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) {
      return { value, nextIndex: index + 1 };
    }
    shift += 7;
    if (shift > 28) return null;
  }

  return null;
}

function readFloat32Le(bytes: number[], startIndex: number): number | null {
  if (startIndex + 3 >= bytes.length) return null;

  const buffer = new ArrayBuffer(4);
  const view = new DataView(buffer);
  for (let offset = 0; offset < 4; offset += 1) {
    view.setUint8(offset, bytes[startIndex + offset]);
  }
  return view.getFloat32(0, true);
}

function c305PayloadHex(message: string): string | null {
  if (!message.includes("[ble] notification 0000c305")) return null;
  return message.slice(message.lastIndexOf(":") + 1).trim();
}

function parseHexBytes(payloadHex: string): number[] {
  return payloadHex
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => Number.parseInt(part, 16))
    .filter((value) => Number.isFinite(value) && value >= 0 && value <= 255);
}
