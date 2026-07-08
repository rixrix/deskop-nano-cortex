/**
 * DeviceStateReadout — renders the authoritative current-state DUMP decoded from the device's
 * `c305` reply (amp knobs, active preset identity, and dirty state). Read from the device. When
 * `onWriteKnob` is provided, the amp knobs become editable rotary dials that write to the device.
 *
 * @see docs/specs/200-frontend-control-surface/spec.md [FR-40]
 * @see docs/specs/110-backend-midi-ble/design.md [DES-BLE-PROTOCOL]
 */
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import type { AmpKnob } from "../bleCommandEncoder";
import { getPresetName, presetLabel, usePresetNames } from "../presetNames";
import type { DecodedStateDump } from "../protocolLabDecoder";

const KNOB_MAX = 255;
const KNOB_STEP = 4;
const SWEEP_DEG = 270;

type PanelKnob = AmpKnob | "amount";

interface DeviceStateReadoutProps {
  /** The decoded device state, or `null` before any dump has arrived (dials idle at 0). */
  dump: DecodedStateDump | null;
  currentPreset?: number;
  isDirty?: boolean;
  /** When provided, supported amp knobs become editable rotary dials that write to the device. */
  onWriteKnob?: (knob: AmpKnob, value: number) => void;
  /**
   * Latest live knob-twist values decoded from the BLE `c305` stream (0-255), used to move the
   * dials in real time when the physical knobs are turned.
   */
  liveKnobs?: Partial<Record<PanelKnob, { value: number; timestampMs: number }>>;
  stateActive?: boolean;
}

const PANEL_KNOBS: { key: PanelKnob; label: string }[] = [
  { key: "gain", label: "Gain" },
  { key: "bass", label: "Bass" },
  { key: "mid", label: "Mid" },
  { key: "treble", label: "Treble" },
  { key: "amount", label: "Amount" },
  { key: "level", label: "Level" },
];

function clampKnob(value: number) {
  return Math.max(0, Math.min(KNOB_MAX, Math.round(value)));
}

function isWritableAmpKnob(knob: PanelKnob): knob is AmpKnob {
  return knob !== "amount";
}

function AmpKnobDial({
  label,
  value,
  editable,
  onChange,
}: {
  label: string;
  value: number | null;
  editable: boolean;
  onChange?: (value: number) => void;
}) {
  const [display, setDisplay] = useState(0);
  const displayRef = useRef(0);
  const [dragging, setDragging] = useState(false);
  const draggingRef = useRef(false);
  const dragStart = useRef({ y: 0, v: 0 });
  const rafRef = useRef(0);

  const set = (raw: number) => {
    const next = clampKnob(raw);
    displayRef.current = next;
    setDisplay(next);
    return next;
  };

  useEffect(() => {
    if (value === null || draggingRef.current) return;
    const from = displayRef.current;
    const to = clampKnob(value);
    if (from === to) return;
    const start = performance.now();
    const duration = Math.max(120, Math.min(520, 120 + Math.abs(to - from) * 2.2));
    cancelAnimationFrame(rafRef.current);
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      displayRef.current = Math.round(from + (to - from) * eased);
      setDisplay(displayRef.current);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value]);

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  const hasData = value !== null;
  const sweep = (display / KNOB_MAX) * SWEEP_DEG;
  const angle = -(SWEEP_DEG / 2) + sweep;
  const pct = Math.round((display / KNOB_MAX) * 100);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!editable) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    draggingRef.current = true;
    setDragging(true);
    dragStart.current = { y: event.clientY, v: displayRef.current };
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    const dy = dragStart.current.y - event.clientY;
    onChange?.(set(dragStart.current.v + dy * (KNOB_MAX / 150)));
  };

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setDragging(false);
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      /* pointer already released */
    }
  };

  const onWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    if (!editable) return;
    event.preventDefault();
    onChange?.(set(displayRef.current + (event.deltaY < 0 ? KNOB_STEP : -KNOB_STEP)));
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!editable) return;
    const delta =
      event.key === "ArrowUp" || event.key === "ArrowRight"
        ? KNOB_STEP
        : event.key === "ArrowDown" || event.key === "ArrowLeft"
          ? -KNOB_STEP
          : 0;
    if (!delta) return;
    event.preventDefault();
    onChange?.(set(displayRef.current + delta));
  };

  return (
    <div className="flex flex-col items-center gap-1">
      <div
        role={editable ? "slider" : undefined}
        tabIndex={editable ? 0 : -1}
        aria-label={editable ? `${label} knob` : undefined}
        aria-valuemin={editable ? 0 : undefined}
        aria-valuemax={editable ? KNOB_MAX : undefined}
        aria-valuenow={editable ? display : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onWheel={onWheel}
        onKeyDown={onKeyDown}
        className="relative grid h-16 w-16 short:h-14 short:w-14 place-items-center rounded-full outline-none focus-visible:ring-2"
        style={{
          background: `conic-gradient(from -135deg, var(--color-cyan-accent) 0deg ${sweep}deg, rgba(120,135,150,0.20) ${sweep}deg ${SWEEP_DEG}deg, transparent ${SWEEP_DEG}deg 360deg)`,
          cursor: editable ? (dragging ? "grabbing" : "grab") : "default",
          opacity: hasData ? 1 : 0.5,
          touchAction: "none",
        }}
      >
        <div
          className="relative grid h-[46px] w-[46px] place-items-center rounded-full border"
          style={{
            background: [
              "radial-gradient(circle at 34% 26%, rgba(255,255,255,0.22), transparent 30%)",
              "linear-gradient(145deg, #303a40 0%, #151d22 58%, #06090b 100%)",
            ].join(", "),
            borderColor: "rgba(255,255,255,0.14)",
            boxShadow:
              "inset 0 2px 4px rgba(255,255,255,0.18), inset 0 -8px 14px rgba(0,0,0,0.5), 0 4px 10px rgba(0,0,0,0.3)",
          }}
        >
          <span
            className="absolute rounded-full"
            style={{
              left: "50%",
              top: "50%",
              width: 3,
              height: 14,
              marginLeft: -1.5,
              marginTop: -14,
              transformOrigin: "50% 100%",
              transform: `rotate(${angle}deg)`,
              background: hasData ? "var(--color-cyan-accent)" : "rgba(248,250,252,0.6)",
              boxShadow: hasData ? "0 0 7px var(--glow-cyan-strong)" : "none",
            }}
          />
          <span className="font-mono text-[12px] font-extrabold" style={{ color: "var(--text)" }}>
            {display}
          </span>
        </div>
      </div>
      <div
        className="text-[9px] font-extrabold uppercase tracking-[1px]"
        style={{ color: "var(--text-secondary)" }}
      >
        {label}
      </div>
      <div className="font-mono text-[9px] font-bold" style={{ color: "var(--color-cyan-accent)" }}>
        {pct}%
      </div>
    </div>
  );
}

export function DeviceStateReadout({
  dump,
  currentPreset,
  isDirty = false,
  onWriteKnob,
  liveKnobs,
  stateActive = false,
}: DeviceStateReadoutProps) {
  const presetNames = usePresetNames();
  const [edits, setEdits] = useState<Partial<Record<AmpKnob, number>>>({});

  useEffect(() => setEdits({}), [dump?.timestampMs]);

  const shown = (knob: PanelKnob): number | null => {
    if (isWritableAmpKnob(knob) && edits[knob] !== undefined) return edits[knob];
    const live = liveKnobs?.[knob];
    if (knob === "amount") return live?.value ?? null;
    if (live && (!dump || live.timestampMs > dump.timestampMs)) return live.value;
    return dump ? dump[knob] : null;
  };

  const editable = stateActive && Boolean(onWriteKnob) && dump !== null;
  const panelHasLiveState = stateActive && dump !== null;
  const activePresetName =
    currentPreset === undefined ? null : getPresetName(presetNames, currentPreset);

  return (
    <section
      className="rounded-xl border p-3 short:p-2"
      style={{
        background: "var(--surface-2)",
        borderColor: panelHasLiveState ? "rgba(0,170,85,0.34)" : "var(--panel-border-light)",
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {currentPreset !== undefined && activePresetName ? (
            <div className="flex min-w-0 flex-wrap items-baseline gap-2">
              <span
                className="font-mono text-[24px] font-extrabold leading-none"
                style={{ color: "var(--color-cyan-accent)" }}
              >
                {presetLabel(currentPreset)}
              </span>
              <span
                className="min-w-0 truncate text-[13px] font-extrabold"
                title={activePresetName}
                style={{ color: "var(--text)" }}
              >
                {activePresetName}
              </span>
              <span
                className="font-mono text-[9px] font-bold uppercase tracking-[0.8px]"
                style={{ color: "var(--text-muted)" }}
              >
                PC {currentPreset}
              </span>
              {isDirty ? (
                <span
                  className="rounded-full border px-2 py-0.5 text-[8px] font-extrabold uppercase tracking-[1px]"
                  style={{
                    color: "var(--color-amber-accent)",
                    borderColor: "rgba(212,160,23,0.4)",
                    background: "rgba(212,160,23,0.08)",
                  }}
                  title="Preset name or live edits not yet stored to the device"
                >
                  Unsaved
                </span>
              ) : null}
            </div>
          ) : null}
          <div
            className="mt-1 text-[10px] font-extrabold uppercase tracking-[1.2px]"
            style={{
              color: panelHasLiveState ? "var(--color-green-accent)" : "var(--text-muted)",
            }}
          >
            {!stateActive
              ? "Amp knobs unavailable until Bluetooth state is live"
              : !dump
                ? "Device state waiting for dump"
                : editable
                  ? "Amp knobs editable · amount synced from device"
                  : "Amp knobs read from Bluetooth"}
          </div>
        </div>
      </div>

      <div
        data-testid="amp-knob-row"
        className="mt-3 short:mt-2 grid grid-cols-2 justify-items-center gap-x-3 gap-y-4 short:gap-y-2 sm:grid-cols-3 lg:grid-cols-6 lg:items-end"
      >
        {PANEL_KNOBS.map(({ key, label }) => (
          <AmpKnobDial
            key={key}
            label={label}
            value={shown(key)}
            editable={editable && isWritableAmpKnob(key)}
            onChange={(next) => {
              if (!isWritableAmpKnob(key)) return;
              setEdits((prev) => ({ ...prev, [key]: next }));
              onWriteKnob?.(key, next);
            }}
          />
        ))}
      </div>

      {editable ? (
        <div className="mt-2 text-[10px] font-medium" style={{ color: "var(--text-muted)" }}>
          Drag a knob, scroll, or use arrow keys to write gain, level, and tone to the device.
        </div>
      ) : null}
    </section>
  );
}
