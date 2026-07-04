/**
 * Read-only FX parameter metadata keyed by current-state model ids.
 *
 * @see docs/specs/200-frontend-control-surface/spec.md [FR-46]
 * @see docs/specs/110-backend-midi-ble/spec.md [FR-22]
 */
import { normalizeProtocolModelId } from "./fxProtocol";

export type FxParamMeta =
  | {
      kind: "range";
      min: number;
      max: number;
      step: number;
      unit: string;
      decimals: number;
    }
  | {
      kind: "enum";
      options: readonly string[];
    };

export interface FxParamDefinition {
  id: string;
  label: string;
  index: number;
  meta: FxParamMeta;
}

export interface FxParamProfile {
  rawId: string;
  modelName: string;
  categoryLabel: string;
  params: readonly FxParamDefinition[];
  displayOrder?: readonly number[];
}

const SYNC_NOTES_1_16_UP = [
  "1/16",
  "1/16T",
  "1/16D",
  "1/8",
  "1/8T",
  "1/8D",
  "1/4",
  "1/4T",
  "1/4D",
  "1/2",
  "1/2T",
  "1/2D",
  "1/1",
] as const;

const SYNC_NOTES_1_8_UP = [
  "1/8",
  "1/8T",
  "1/8D",
  "1/4",
  "1/4T",
  "1/4D",
  "1/2",
  "1/2T",
  "1/2D",
  "1/1",
] as const;

const SYNC_NOTES_1_32_UP = [
  "1/32",
  "1/32T",
  "1/32D",
  "1/16",
  "1/16T",
  "1/16D",
  "1/8",
  "1/8T",
  "1/8D",
  "1/4",
  "1/4T",
  "1/4D",
  "1/2",
  "1/2T",
  "1/2D",
  "1/1",
] as const;

const DELAY_SYNC_NOTES_FULL = [
  "1/64",
  "1/64T",
  "1/64D",
  "1/32",
  "1/32T",
  "1/32D",
  "1/16",
  "1/16T",
  "1/16D",
  "1/8",
  "1/8T",
  "1/8D",
  "1/4",
  "1/4T",
  "1/4D",
  "1/2",
  "1/2T",
  "1/2D",
  "1/1",
] as const;

function normalizeName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function slug(value: string) {
  return normalizeName(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function rangeMeta(
  min: number,
  max: number,
  step: number,
  unit = "",
  decimals: number | null = null,
): FxParamMeta {
  return {
    kind: "range",
    min,
    max,
    step,
    unit,
    decimals: decimals ?? decimalsFromStep(step),
  };
}

function enumMeta(options: readonly string[]): FxParamMeta {
  return { kind: "enum", options };
}

function decimalsFromStep(step: number) {
  const text = String(step);
  const dot = text.indexOf(".");
  return dot === -1 ? 0 : text.length - dot - 1;
}

function parseParamLabel(label: string) {
  const open = label.indexOf("(");
  const close = label.lastIndexOf(")");
  if (open > -1 && close > open) {
    const name = label.slice(0, open).trim();
    const optionText = label
      .slice(open + 1, close)
      .replace(/two way switch/gi, "")
      .replace(/three way switch/gi, "")
      .trim();
    const options = optionText
      .split("/")
      .map((option) => option.trim())
      .filter(Boolean);
    return { name, options };
  }
  return { name: label.trim(), options: null };
}

function correctOptions(options: readonly string[]) {
  const corrected = options.map((option) => (option === "1,32D" ? "1/32D" : option));
  if (
    corrected.length === 2 &&
    corrected[0]?.toLowerCase() === "on" &&
    corrected[1]?.toLowerCase() === "off"
  ) {
    return [corrected[1], corrected[0]];
  }
  return corrected;
}

function enumParamOptions(modelName: string, paramName: string) {
  const p = normalizeName(paramName);
  const m = normalizeName(modelName);

  if (p === "ratio" && m.includes("legendary 87")) return ["4", "8", "12", "20", "All"];
  if (p === "ratio" && m.includes("solid state comp")) return ["2", "4", "10"];
  if (p === "dyn mode") return ["Off", "Duck", "Gate"];
  if (p === "tap preset") return ["1", "2", "3", "4", "4 Alt", "5", "5 Alt", "6", "6 Alt"];
  if (p === "size") return ["Small", "Medium", "Large"];
  if (p === "mode" && m.includes("chief dc2w")) {
    return ["1", "2", "3", "4", "1+2", "1+3", "1+4", "2+3", "2+4", "3+4"];
  }
  if (p === "mode type") return ["S", "SDD-320"];
  if (p === "type" && m.includes("chief ce2w")) return ["CE2-C", "CE1-C", "CE1-V"];
  if (p === "mode" && m.includes("dream chorus")) return ["CHO1", "CHO2"];
  if (p === "type" && m.includes("mx phase")) return ["90", "45"];
  if (p === "mode" && m.includes("mx phase")) return ["Block", "Script"];
  if (p === "vibe") return ["Off", "On"];
  if (p === "waveform") return ["Sine", "Triangle", "Square", "Saw Up", "Saw Dn"];
  if (p === "lfo active") return ["Off", "On"];
  if (p === "feedback mode") return ["Reverse", "Flip"];
  if (p === "trigger mode") return ["Off", "Full", "1/2"];
  if (p === "filter cutoff") return ["Low", "A", "B", "High"];
  if (p === "filter type") return ["Lowpass", "Bandpass", "Highpass"];
  if (p.includes("slope")) return ["Flat", "-6", "-12", "-18", "-24", "-30", "-36", "-42", "-48"];
  if (p.endsWith(" type") && (p.startsWith("1 ") || p.startsWith("2 ") || p.startsWith("3 "))) {
    return ["Peak", "Hi Pass", "Lo Pass", "Hi Shelf", "Lo Shelf"];
  }
  return null;
}

function syncNoteOptionsForModel(modelName: string) {
  const m = normalizeName(modelName);
  if (m.includes("analog delay")) return SYNC_NOTES_1_16_UP;
  if (
    m.includes("circular delay") ||
    m.includes("digital delay") ||
    m.includes("dual delay") ||
    m.includes("dual reverse") ||
    m.includes("tape delay")
  ) {
    return DELAY_SYNC_NOTES_FULL;
  }
  if (m.includes("chorus 229t")) return SYNC_NOTES_1_8_UP;
  if (m.includes("mx phase") || m.includes("tremolo")) return SYNC_NOTES_1_32_UP;
  return SYNC_NOTES_1_16_UP;
}

function exactRangeMeta(modelName: string, paramName: string): FxParamMeta | null {
  const p = normalizeName(paramName);
  const m = normalizeName(modelName);

  if (p === "wah") return rangeMeta(0, 1, 0.01, "", 2);
  if (p === "lp/bp/hp") return rangeMeta(-1, 1, 0.01, "", 2);
  if (p === "noise reduction") return rangeMeta(0, 100, 0.1, "%", 1);
  if (/65hz|125hz|250hz|500hz|1khz|2khz|4khz|8khz|16khz/.test(p))
    return rangeMeta(-12, 12, 0.1, "dB", 1);
  if (p.includes("gain") && (p.startsWith("1 ") || p.startsWith("2 ") || p.startsWith("3 ")))
    return rangeMeta(-12, 12, 0.1, "dB", 1);
  if (p.includes("output"))
    return rangeMeta(
      m.includes("graphic 9") || m.includes("low-high cut") || m.includes("parametric 3")
        ? -20
        : -12,
      m.includes("graphic 9") || m.includes("low-high cut") || m.includes("parametric 3") ? 20 : 12,
      0.1,
      "dB",
      1,
    );
  if (p.includes("threshold") && m.includes("utility gate")) return rangeMeta(-90, 0, 0.1, "dB", 1);
  if (p === "range" && m.includes("utility gate")) return rangeMeta(-90, -6, 0.1, "dB", 1);
  if (
    p.includes("threshold") &&
    (m.includes("digital delay") || m.includes("dual delay") || m.includes("dual reverse"))
  )
    return rangeMeta(-65, -10, 0.1, "dB", 1);
  if (p.includes("threshold")) return rangeMeta(-60, 12, 0.1, "dB", 1);
  if (p === "input" && m.includes("legendary")) return rangeMeta(-48, 0, 0.1, "dB", 1);
  if (p === "makeup") return rangeMeta(-48, 48, 0.01, "dB", 2);
  if (p === "dry level" || p === "fx level") return rangeMeta(-40, 12, 0.1, "dB", 1);
  if (p === "spread") return rangeMeta(3, 60, 0.01, "ms", 2);
  if (
    p.includes("mix") ||
    p.includes("depth") ||
    p.includes("width") ||
    p === "boost" ||
    p === "duty cycle" ||
    p === "smoothing" ||
    p === "overlap" ||
    p === "x-feedback" ||
    p === "feedback depth" ||
    p === "feedback l" ||
    p === "feedback r" ||
    p === "feedback" ||
    p === "diffusion" ||
    p === "mod depth" ||
    p === "level"
  ) {
    return rangeMeta(0, 100, 0.1, "%", 1);
  }
  if (p === "drive" && (m.includes("chief dc2w") || m.includes("tape delay")))
    return rangeMeta(0, 100, 1, "%", 0);
  if (p === "mod rate") return rangeMeta(0.1, 10, 0.1, "Hz", 1);
  if (p === "rate" && m.includes("tremolo")) return rangeMeta(0.1, 20, 0.1, "Hz", 1);
  if ((p === "rate" || p === "speed") && m.includes("chorus 229t"))
    return rangeMeta(0.2, 3, 0.01, "Hz", 2);
  if (p === "mod speed") return rangeMeta(0.1, 5, 0.01, "Hz", 2);
  if (p === "rate" || p === "speed") return rangeMeta(0, 100, 1, "%", 0);
  if (p.includes("attack") && m.includes("legendary")) return rangeMeta(0.02, 0.8, 0.01, "ms", 2);
  if (p.includes("release") && m.includes("legendary")) return rangeMeta(0.06, 1.1, 0.01, "s", 2);
  if (p.includes("attack") && m.includes("solid state")) return rangeMeta(0.1, 30, 0.01, "ms", 2);
  if (p.includes("release") && m.includes("solid state")) return rangeMeta(0.01, 1.2, 0.01, "s", 2);
  if (p.includes("attack") && (m.includes("opto") || m.includes("vca")))
    return rangeMeta(1, 250, 0.01, "ms", 2);
  if (p.includes("release") && (m.includes("opto") || m.includes("vca")))
    return rangeMeta(50, 1200, 1, "ms", 0);
  if (
    p.includes("attack") &&
    (m.includes("digital delay") || m.includes("dual delay") || m.includes("dual reverse"))
  )
    return rangeMeta(1, 2000, 1, "ms", 0);
  if (
    p.includes("release") &&
    (m.includes("digital delay") || m.includes("dual delay") || m.includes("dual reverse"))
  )
    return rangeMeta(1, 2000, 1, "ms", 0);
  if (p.includes("fade in") || p.includes("fade out")) return rangeMeta(1, 5000, 1, "ms", 0);
  if (p.includes("attack")) return rangeMeta(1, 1000, 1, "ms", 0);
  if (p.includes("hold")) return rangeMeta(1, 2000, 1, "ms", 0);
  if (p.includes("release")) return rangeMeta(2, 5000, 1, "ms", 0);
  if (p.includes("q") && (p.startsWith("1 ") || p.startsWith("2 ") || p.startsWith("3 ")))
    return rangeMeta(0.1, 10, 0.1, "", 1);
  if (p === "reso") return rangeMeta(1, 10, 0.01, "", 2);
  if (p === "ratio" && (m.includes("opto") || m.includes("vca")))
    return rangeMeta(2, m.includes("opto") ? 20 : 10, 0.01, "", 2);
  if (p === "knee") return rangeMeta(1, 20, 0.01, "dB", 2);
  if (p === "semitones") return rangeMeta(-12, 12, 1, "Sem", 0);
  if (p === "pitch fine") return rangeMeta(-100, 100, 1, "Cent", 0);
  if (p.includes("freq")) return rangeMeta(20, 20000, 1, "Hz", 0);
  if (p === "hpf" || p === "high pass")
    return rangeMeta(
      m.includes("tape delay") ? 80 : 20,
      m.includes("tape delay") ? 800 : m.includes("transpose") ? 2000 : 800,
      1,
      "Hz",
      0,
    );
  if (p === "lpf" || p === "low pass") {
    if (m.includes("tape delay")) return rangeMeta(800, 6000, 1, "Hz", 0);
    if (m.includes("transpose")) return rangeMeta(200, 19900, 1, "Hz", 0);
    if (
      m.includes("ambience") ||
      m.includes("hall") ||
      m.includes("mind hall") ||
      m.includes("modulated") ||
      m.includes("room")
    )
      return rangeMeta(800, 12000, 1, "Hz", 0);
    if (m.includes("cave")) return rangeMeta(800, 8000, 1, "Hz", 0);
    return rangeMeta(1000, 16000, 1, "Hz", 0);
  }
  if (p === "delay time" || p === "delay time l" || p === "delay time r") {
    if (m.includes("analog delay")) return rangeMeta(200, 1100, 0.1, "ms", 1);
    if (m.includes("circular delay")) return rangeMeta(27, 2000, 0.01, "ms", 2);
    if (m.includes("dual reverse")) return rangeMeta(20, 4000, 1, "ms", 0);
    return rangeMeta(7, 6000, 1, "ms", 0);
  }
  if (p === "pre delay") {
    if (m.includes("ambience")) return rangeMeta(0, 100, 0.1, "ms", 1);
    if (m.includes("hall") || m.includes("room")) return rangeMeta(1, 100, 0.1, "ms", 1);
    return rangeMeta(1, 200, 0.1, "ms", 1);
  }
  if (p === "decay") {
    if (m.includes("cave")) return rangeMeta(5, 20, 0.01, "s", 2);
    if (m.includes("hall") || m.includes("modulated")) return rangeMeta(1, 10, 0.01, "s", 2);
    if (m.includes("room")) return rangeMeta(0.1, 2, 0.01, "s", 2);
    if (m.includes("mind hall")) return rangeMeta(0, 100, 0.1, "%", 1);
  }
  if (p === "damping") return rangeMeta(0, 100, 0.1, "%", 1);
  if (p === "dyn depth") return rangeMeta(0, 60, 0.1, "dB", 1);
  if (p === "trig threshold") return rangeMeta(-40, 0, 0.1, "dB", 1);
  return null;
}

function inferParamMeta(
  modelName: string,
  paramName: string,
  inlineOptions: readonly string[] | null,
): FxParamMeta {
  const p = normalizeName(paramName);
  if (inlineOptions && inlineOptions.length > 1) return enumMeta(correctOptions(inlineOptions));
  if (p.includes("sync note")) return enumMeta(syncNoteOptionsForModel(modelName));
  if (p === "sync" || p === "sync l" || p === "sync r") return enumMeta(["Off", "On"]);
  const enumOverride = enumParamOptions(modelName, paramName);
  if (enumOverride) return enumMeta(enumOverride);
  const exact = exactRangeMeta(modelName, paramName);
  if (exact) return exact;
  if (
    p.includes("gain") ||
    p.includes("level") ||
    p.includes("tone") ||
    p.includes("volume") ||
    p.includes("drive") ||
    p.includes("distortion") ||
    p.includes("filter") ||
    p.includes("fuzz") ||
    p.includes("bass") ||
    p.includes("treble") ||
    p.includes("blend") ||
    p.includes("sensitivity") ||
    p === "sens" ||
    p.includes("color") ||
    p.includes("intensity")
  ) {
    return rangeMeta(0, 10, 0.1, "", 1);
  }
  return rangeMeta(0, 10, 0.1, "", 1);
}

function makeParams(modelName: string, labels: readonly string[]): readonly FxParamDefinition[] {
  return labels.map((label, index) => {
    const parsed = parseParamLabel(label);
    return {
      id: `${index}-${slug(parsed.name)}`,
      label: parsed.name,
      index,
      meta: inferParamMeta(modelName, parsed.name, parsed.options),
    };
  });
}

function profile(
  rawId: string,
  modelName: string,
  categoryLabel: string,
  labels: readonly string[],
  displayOrder?: readonly number[],
): FxParamProfile {
  return {
    rawId: normalizeProtocolModelId(rawId),
    modelName,
    categoryLabel,
    params: makeParams(modelName, labels),
    displayOrder,
  };
}

const FX_PARAM_PROFILES: readonly FxParamProfile[] = [
  profile("12", "Chief BD2", "Overdrive", ["Gain", "Tone", "Volume"]),
  profile("0D", "Chief OD1", "Overdrive", ["Gain", "Level"]),
  profile("06", "Exotic", "Overdrive", ["Gain", "Bass", "Treble", "Volume"]),
  profile("BF17", "Exotic Bass Z Boost", "Overdrive", ["Gain", "Bass", "Treble", "Volume"]),
  profile("17", "Exotic Z Boost", "Overdrive", ["Gain", "Bass", "Treble", "Volume"]),
  profile("16", "Facial Fuzz", "Overdrive", [
    "Fuzz",
    "Volume",
    "Pickup (HB/Single)",
    "Pickup Level",
  ]),
  profile("1B", "Green 808", "Overdrive", ["Overdrive", "Tone", "Level"]),
  profile("B817", "Microtubes B3K", "Overdrive", [
    "Drive",
    "Growl (On/Off)",
    "Midboost (On/Off)",
    "Tone",
    "Level",
    "Blend",
  ]),
  profile("03", "OD250", "Overdrive", ["Gain", "Volume"]),
  profile("02", "Obsessive Drive", "Overdrive", ["Drive", "Peak (LP/HP)", "Tone", "Volume"]),
  profile("04", "Rodent Drive", "Overdrive", ["Distortion", "Filter", "Volume"]),
  profile("817D", "Adaptive Gate", "Utility", ["Noise Reduction"]),
  profile("A51F", "Graphic 9", "Utility", [
    "65Hz",
    "125Hz",
    "250Hz",
    "500hz",
    "1kHz",
    "2kHz",
    "4kHz",
    "8kHz",
    "16kHz",
    "HPF",
    "LPF",
    "Output",
  ]),
  profile("A31F", "Low-High Cut", "Utility", [
    "HPF Slope",
    "HPF Freq",
    "LPF Slope",
    "LPF Freq",
    "Output",
  ]),
  profile("A11F", "Parametric 3", "Utility", [
    "1 Gain",
    "1 Freq",
    "1 Q",
    "1 Type (Peak/Hi Pass/Lo Pass/Hi Shelf/Lo Shelf)",
    "1 Active (On/Off)",
    "2 Gain",
    "2 Freq",
    "2 Q",
    "2 Type (Peak/Hi Pass/Lo Pass/Hi Shelf/Lo Shelf)",
    "2 Active (On/Off)",
    "3 Gain",
    "3 Freq",
    "3 Q",
    "3 Type (Peak/Hi Pass/Lo Pass/Hi Shelf/Lo Shelf)",
    "3 Active (On/Off)",
    "Output",
  ]),
  profile("827D", "Utility Gate", "Utility", ["Threshold", "Attack", "Hold", "Release", "Range"]),
  profile("867D", "Volume", "Utility", ["Level", "Curve (Linear/Log)"]),
  profile("B446", "Bass Wah", "Wah/Filter", ["Wah"]),
  profile("B246", "Bubba Wah", "Wah/Filter", ["Wah"]),
  profile("B646", "Crying Clyde Wah", "Wah/Filter", ["Wah"]),
  profile("B546", "Crying Wah", "Wah/Filter", ["Wah"]),
  profile("C6BB01", "Envelope Filter", "Wah/Filter", [
    "Sens",
    "Attack",
    "Decay",
    "LP/BP/HP",
    "Level",
    "Freq",
    "Freq Depth",
    "Reso",
    "Mix",
  ]),
  profile("C1BB01", "Love Meat", "Wah/Filter", [
    "Sensitivity",
    "Attack",
    "Decay",
    "Color",
    "Intensity",
    "Blend",
    "Trig Detection (Down/Up)",
    "Trigger Mode",
    "Filter Cutoff",
    "Filter Type",
    "Level",
  ]),
  profile("8927", "Legendary 87 (M)", "Compressor", [
    "Input",
    "Ratio",
    "Attack",
    "Release",
    "Makeup",
    "Mix",
  ]),
  profile("8F27", "Opto Comp (M)", "Compressor", [
    "Threshold",
    "Ratio",
    "Attack",
    "Release",
    "Makeup",
    "Mix",
  ]),
  profile("8C27", "Solid State Comp (M)", "Compressor", [
    "Threshold",
    "Ratio",
    "Attack",
    "Release",
    "Makeup",
    "Mix",
  ]),
  profile("8D27", "VCA Comp (M)", "Compressor", [
    "Threshold",
    "Ratio",
    "Attack",
    "Release",
    "Makeup",
    "Mix",
  ]),
  profile("D18C01", "Transpose", "Pitch", [
    "Mix",
    "Semitones",
    "Pitch Fine",
    "High Pass",
    "Low Pass",
  ]),
  profile("8B7D", "Doubler", "Utility/EQ", ["Spread", "Dry Level", "FX Level"]),
  profile("9427", "Legendary 87 (ST)", "Utility/EQ", [
    "Input",
    "Ratio",
    "Attack",
    "Release",
    "Makeup",
    "Mix",
  ]),
  profile("9727", "Opto Comp (ST)", "Utility/EQ", [
    "Threshold",
    "Ratio",
    "Attack",
    "Release",
    "Makeup",
    "Mix",
  ]),
  profile("9527", "Solid State Comp (ST)", "Utility/EQ", [
    "Threshold",
    "Ratio",
    "Attack",
    "Release",
    "Makeup",
    "Mix",
  ]),
  profile("9627", "VCA Comp (ST)", "Utility/EQ", [
    "Threshold",
    "Ratio",
    "Attack",
    "Release",
    "Makeup",
    "Mix",
  ]),
  profile(
    "F036",
    "Chief CE2W (ST)",
    "Modulation",
    ["Mix", "Rate", "Depth", "Type", "Width", "Output", "Sync (On/Off)", "Sync Note"],
    [0, 1, 6, 7, 2, 3, 4, 5],
  ),
  profile("F336", "Chief DC2W (ST)", "Modulation", ["Mix", "Mode", "Mode Type", "Drive", "Output"]),
  profile(
    "EF36",
    "Chorus 229T",
    "Modulation",
    ["Mix", "Rate", "Depth", "Width", "Output", "Sync (On/Off)", "Sync Note"],
    [0, 1, 5, 6, 2, 3, 4],
  ),
  profile(
    "EE36",
    "Dream Chorus",
    "Modulation",
    ["Mix", "Speed", "Depth", "Mode", "Output", "Sync (On/Off)", "Sync Note"],
    [0, 1, 5, 6, 2, 3, 4],
  ),
  profile(
    "ED36",
    "MX Flanger",
    "Modulation",
    ["Mix", "Manual", "Width", "Speed", "Regen", "Output", "Sync (On/Off)", "Sync Note"],
    [0, 1, 2, 3, 6, 7, 4, 5],
  ),
  profile(
    "F436",
    "MX Phase 95",
    "Modulation",
    ["Mix", "Speed", "Type", "Mode", "Output", "Sync (On/Off)", "Sync Note"],
    [0, 1, 5, 6, 2, 3, 4],
  ),
  profile(
    "F536",
    "MX Vibe",
    "Modulation",
    ["Mix", "Vibe", "Speed", "Level", "Depth", "Output", "Sync (On/Off)", "Sync Note"],
    [0, 1, 2, 6, 7, 3, 4, 5],
  ),
  profile(
    "DC36",
    "Tremolo",
    "Modulation",
    [
      "Rate",
      "Depth",
      "Waveform",
      "Duty Cycle",
      "Width",
      "Smoothing",
      "LFO Active",
      "Fade In",
      "Fade Out",
      "Boost",
      "Sync (On/Off)",
      "Sync Note",
    ],
    [0, 10, 11, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  ),
  profile(
    "FA2E",
    "Analog Delay",
    "Delay",
    [
      "Mix",
      "Feedback",
      "High Pass",
      "Low Pass",
      "Ping Pong (On/Off)",
      "Delay Time",
      "Mod Rate",
      "Mod Depth",
      "Width",
      "Drive",
      "Sync (On/Off)",
      "Sync Note",
    ],
    [0, 1, 2, 3, 4, 10, 11, 5, 6, 7, 8, 9],
  ),
  profile(
    "FF2E",
    "Circular Delay",
    "Delay",
    [
      "Mix",
      "Tap Preset",
      "Delay Time",
      "Feedback",
      "Diffusion",
      "High Pass",
      "Low Pass",
      "Mod Rate",
      "Mod Depth",
      "Vintage Mode (On/Off)",
      "Sync (On/Off)",
      "Sync Note",
    ],
    [0, 1, 10, 11, 2, 3, 4, 5, 6, 7, 8, 9],
  ),
  profile(
    "FB2E",
    "Digital Delay (ST)",
    "Delay",
    [
      "Mix",
      "Feedback",
      "High Pass",
      "Low Pass",
      "Ping Pong (On/Off)",
      "Delay Time",
      "Mod Rate",
      "Mod Depth",
      "Width",
      "Dyn Depth",
      "Dyn Mode",
      "Threshold",
      "Attack",
      "Release",
      "Knee",
      "Feedback Depth",
      "Sync (On/Off)",
      "Sync Note",
    ],
    [0, 1, 2, 3, 4, 16, 17, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
  ),
  profile(
    "FC2E",
    "Dual Delay",
    "Delay",
    [
      "Mix",
      "Delay Time L",
      "Feedback L",
      "X-Feedback",
      "Delay Time R",
      "Feedback R",
      "High Pass",
      "Low Pass",
      "Mod Rate",
      "Mod Depth",
      "Link FBack (On/Off)",
      "Dyn Depth",
      "Dyn Mode",
      "Threshold",
      "Attack",
      "Release",
      "Knee",
      "Feedback Depth",
      "Sync L (On/Off)",
      "Sync Note L",
      "Sync R (On/Off)",
      "Sync Note R",
    ],
    [0, 18, 19, 1, 2, 3, 20, 21, 4, 5, 10, 11, 12, 13, 14, 15, 16, 17, 6, 7, 8, 9],
  ),
  profile(
    "FE2E",
    "Dual Reverse Delay",
    "Delay",
    [
      "Mix",
      "Delay Time L",
      "Feedback L",
      "X-Feedback",
      "Feedback Mode",
      "Delay Time R",
      "Feedback R",
      "Overlap",
      "Trig Threshold",
      "Dyn Depth",
      "Dyn Mode",
      "Threshold",
      "Attack",
      "Release",
      "Knee",
      "Feedback Depth",
      "High Pass",
      "Low Pass",
      "Link FBack (On/Off)",
      "Sync (On/Off)",
      "Sync Note L",
      "Sync Note R",
    ],
    [0, 19, 20, 1, 2, 3, 4, 21, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18],
  ),
  profile(
    "F42E",
    "Tape Delay",
    "Delay",
    [
      "Mix",
      "Feedback",
      "High Pass",
      "Low Pass",
      "Drive",
      "Delay Time",
      "Wow",
      "Flutter",
      "Ping Pong (On/Off)",
      "Sync (On/Off)",
      "Sync Note",
    ],
    [0, 1, 2, 3, 4, 9, 10, 5, 6, 7, 8],
  ),
  profile("C83E", "Ambience", "Reverb", ["Mix", "Size", "Pre Delay", "High Pass", "Low Pass"]),
  profile("C93E", "Cave", "Reverb", [
    "Mix",
    "Decay",
    "Pre Delay",
    "Damping",
    "High Pass",
    "Low Pass",
  ]),
  profile("C33E", "Hall", "Reverb", ["Mix", "Decay", "Pre Delay", "High Pass", "Low Pass"]),
  profile("CB3E", "Mind Hall", "Reverb", [
    "Mix",
    "Decay",
    "Pre Delay",
    "High Pass",
    "Low Pass",
    "Damping",
  ]),
  profile("C73E", "Modulated", "Reverb", [
    "Mix",
    "Decay",
    "Pre Delay",
    "Mod Speed",
    "Mod Depth",
    "High Pass",
    "Low Pass",
  ]),
  profile("C03E", "Room", "Reverb", ["Mix", "Decay", "Pre Delay", "High Pass", "Low Pass"]),
];

const profileByRawId = new Map(FX_PARAM_PROFILES.map((entry) => [entry.rawId, entry]));

export function getFxParamProfile(rawId: string | null | undefined): FxParamProfile | null {
  const normalized = normalizeProtocolModelId(rawId);
  if (!normalized) return null;
  return profileByRawId.get(normalized) ?? null;
}

export function orderedFxParams(
  profileEntry: FxParamProfile | null | undefined,
): readonly FxParamDefinition[] {
  if (!profileEntry) return [];
  if (!profileEntry.displayOrder) return profileEntry.params;
  return profileEntry.displayOrder.map((index) => profileEntry.params[index]).filter(Boolean);
}

export function formatFxParamMeta(meta: FxParamMeta): string {
  if (meta.kind === "enum") return meta.options.join(" / ");
  const min = meta.min.toFixed(meta.decimals);
  const max = meta.max.toFixed(meta.decimals);
  return `${min}-${max}${meta.unit ? ` ${meta.unit}` : ""}`;
}

function clampNormalized(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function roundToStep(value: number, step: number) {
  if (step <= 0) return value;
  return Math.round(value / step) * step;
}

export function normalizedToFxParamValue(
  param: FxParamDefinition,
  normalizedValue: number,
): number | string {
  const value = clampNormalized(normalizedValue);
  if (param.meta.kind === "enum") {
    const index = Math.round(value * Math.max(0, param.meta.options.length - 1));
    return param.meta.options[index] ?? "";
  }

  const scaled = param.meta.min + (param.meta.max - param.meta.min) * value;
  return roundToStep(scaled, param.meta.step);
}

export function formatFxParamValue(param: FxParamDefinition, normalizedValue: number): string {
  const value = normalizedToFxParamValue(param, normalizedValue);
  if (typeof value === "string") return value;
  if (param.meta.kind !== "range") return String(value);
  return `${value.toFixed(param.meta.decimals)}${param.meta.unit ? ` ${param.meta.unit}` : ""}`;
}

export function fxParamEnumIndex(param: FxParamDefinition, normalizedValue: number): number {
  if (param.meta.kind !== "enum") return -1;
  const maxIndex = Math.max(0, param.meta.options.length - 1);
  return Math.min(maxIndex, Math.max(0, Math.round(clampNormalized(normalizedValue) * maxIndex)));
}

export function normalizedFromFxParamEnumIndex(param: FxParamDefinition, index: number): number {
  if (param.meta.kind !== "enum") return 0;
  const maxIndex = Math.max(0, param.meta.options.length - 1);
  if (maxIndex === 0) return 0;
  return Math.min(1, Math.max(0, index / maxIndex));
}
