/**
 * GearRotaryReadout — compact gear-style rotary device state and cycle control for
 * footswitch-controlled Capture and Cab/IR selectors in the Console deck.
 *
 * @see docs/specs/200-frontend-control-surface/spec.md [FR-25]
 * @see docs/specs/200-frontend-control-surface/design.md [DES-FRONT-CONSOLE]
 */
import { CaretLeftIcon, CaretRightIcon } from "@phosphor-icons/react";

const ROTARY_MAX = 5;

interface RotaryValue {
  value: number;
  source: string;
  timestampMs?: number;
}

interface GearRotaryReadoutProps {
  label: string;
  value: string;
  rotary?: RotaryValue;
  accent: "cyan" | "amber";
  onChange?: (value: number) => void;
}

function clampRotary(value: number) {
  return Math.max(0, Math.min(ROTARY_MAX, Math.round(value)));
}

export function GearRotaryReadout({
  label,
  value,
  rotary,
  accent,
  onChange,
}: GearRotaryReadoutProps) {
  const rotaryValue = clampRotary(rotary?.value ?? 0);
  const active = Boolean(rotary);
  const accentColor = accent === "cyan" ? "var(--color-cyan-accent)" : "var(--color-amber-accent)";
  const glow = accent === "cyan" ? "var(--glow-cyan-strong)" : "var(--glow-amber)";
  const angle = rotaryValue * 60;
  const gearTeeth = Array.from({ length: 28 }, (_, index) => index);
  const gearSpokes = Array.from({ length: 5 }, (_, index) => index);
  const canCycle = Boolean(onChange);

  const cycle = (delta: number) => {
    if (!onChange) return;
    const next = (rotaryValue + delta + ROTARY_MAX + 1) % (ROTARY_MAX + 1);
    onChange(next);
  };

  return (
    <div
      className="grid min-w-0 grid-cols-[32px_58px_minmax(0,1fr)_32px] items-center gap-2 rounded-lg border px-2.5 py-2"
      style={{
        background: "var(--surface)",
        borderColor: active ? accentColor : "var(--panel-border-light)",
        boxShadow: active
          ? `0 0 0 3px ${accent === "cyan" ? "rgba(0,153,204,0.08)" : "rgba(212,160,23,0.08)"}, inset 0 1px 0 var(--panel-border-light)`
          : "inset 0 1px 0 var(--panel-border-light)",
      }}
    >
      <button
        type="button"
        disabled={!canCycle}
        onClick={() => cycle(-1)}
        className="grid h-8 w-8 place-items-center rounded-lg border disabled:cursor-default disabled:opacity-45"
        style={{
          background: "var(--panel-inset)",
          borderColor: "var(--panel-border-light)",
          color: active ? accentColor : "var(--text-secondary)",
        }}
        aria-label={`Cycle ${label} left`}
      >
        <CaretLeftIcon size={15} weight="bold" aria-hidden="true" />
      </button>

      <div
        className="relative grid h-14 w-14 place-items-center"
        style={{
          filter: active
            ? `drop-shadow(0 0 10px ${glow})`
            : "drop-shadow(0 8px 12px rgba(15,23,42,0.22))",
        }}
        aria-hidden="true"
      >
        <svg viewBox="0 0 64 64" className="h-14 w-14" style={{ overflow: "visible" }}>
          <g
            style={{
              transform: `rotate(${angle}deg)`,
              transformBox: "fill-box",
              transformOrigin: "center",
              transition: "transform 220ms cubic-bezier(0.22, 1, 0.36, 1)",
            }}
          >
            {gearTeeth.map((tooth) => (
              <rect
                key={tooth}
                x="30.5"
                y="1.5"
                width="3"
                height="8"
                rx="0.7"
                transform={`rotate(${(360 / gearTeeth.length) * tooth} 32 32)`}
                fill={active ? "#eef2f5" : "#c4cad0"}
              />
            ))}
            <circle cx="32" cy="32" r="27" fill={active ? "#eef2f5" : "#c4cad0"} />
            <circle cx="32" cy="32" r="22.5" fill="#151d25" />
            <circle cx="32" cy="32" r="17.2" fill="#0f1720" stroke="#6f7880" strokeWidth="1.4" />
            {gearSpokes.map((spoke) => (
              <rect
                key={spoke}
                x="30.7"
                y="11"
                width="2.6"
                height="22"
                rx="1.3"
                transform={`rotate(${(360 / gearSpokes.length) * spoke} 32 32)`}
                fill={active ? "#d7dde2" : "#aeb5bb"}
                opacity="0.92"
              />
            ))}
            <circle cx="32" cy="32" r="9.2" fill="#d4d9dd" />
            <circle cx="32" cy="32" r="5.2" fill="#939ba3" />
          </g>
          <circle
            cx="32"
            cy="32"
            r="30.2"
            fill="none"
            stroke={active ? accentColor : "rgba(148,163,184,0.42)"}
            strokeWidth="1.2"
          />
        </svg>
      </div>

      <span className="min-w-0">
        <span
          className="block text-[8px] font-extrabold uppercase tracking-[1px]"
          style={{ color: "var(--text-secondary)" }}
        >
          {label}
        </span>
        <span
          className="block truncate text-[11px] font-extrabold"
          style={{ color: "var(--text)" }}
          title={value}
        >
          {value}
        </span>
        <span
          className="mt-0.5 block truncate font-mono text-[9px] font-bold uppercase"
          style={{ color: active ? accentColor : "var(--text-muted)" }}
        >
          {active ? `rotary ${rotaryValue}` : "rotary waiting"}
        </span>
      </span>

      <button
        type="button"
        disabled={!canCycle}
        onClick={() => cycle(1)}
        className="grid h-8 w-8 place-items-center rounded-lg border disabled:cursor-default disabled:opacity-45"
        style={{
          background: "var(--panel-inset)",
          borderColor: "var(--panel-border-light)",
          color: active ? accentColor : "var(--text-secondary)",
        }}
        aria-label={`Cycle ${label} right`}
      >
        <CaretRightIcon size={15} weight="bold" aria-hidden="true" />
      </button>
    </div>
  );
}
