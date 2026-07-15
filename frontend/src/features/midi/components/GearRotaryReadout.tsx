/**
 * GearRotaryReadout — compact gear-style rotary device state and cycle control for
 * footswitch-controlled Capture and Cab/IR selectors in the Console deck.
 *
 * @see docs/specs/200-frontend-control-surface/spec.md [FR-25]
 * @see docs/specs/200-frontend-control-surface/design.md [DES-FRONT-CONSOLE]
 */
import { useEffect, useMemo, useRef, useState } from "react";

const ROTARY_MAX = 5;
const BANK_SIZE = 5;

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
  cycleMin?: number;
  bypassLabel?: string;
  assetNames?: string[];
  maxSlot?: number;
  banked?: boolean;
}

function clampRotary(value: number, maxSlot: number) {
  return Math.max(0, Math.min(maxSlot, Math.round(value)));
}

function bankLabel(index: number) {
  return `Bank ${String.fromCharCode(65 + index)}`;
}

export function GearRotaryReadout({
  label,
  value,
  rotary,
  accent,
  onChange,
  cycleMin = 0,
  bypassLabel,
  assetNames = [],
  maxSlot: maxSlotOverride,
  banked = true,
}: GearRotaryReadoutProps) {
  const maxSlot = maxSlotOverride ?? Math.max(ROTARY_MAX, assetNames.length);
  const rotaryValue = clampRotary(rotary?.value ?? 0, maxSlot);
  const firstCycleSlot = Math.max(0, Math.min(maxSlot, Math.round(cycleMin)));
  const active = Boolean(rotary);
  const bypassActive = active && rotaryValue === 0;
  const accentColor = accent === "cyan" ? "var(--color-cyan-accent)" : "var(--color-amber-accent)";
  const glow = accent === "cyan" ? "var(--glow-cyan-strong)" : "var(--glow-amber)";
  const bankSlotValue = rotaryValue > 0 ? ((rotaryValue - 1) % BANK_SIZE) + 1 : 0;
  const angle = bankSlotValue * 60;
  const gearTeeth = Array.from({ length: 28 }, (_, index) => index);
  const gearSpokes = Array.from({ length: 5 }, (_, index) => index);
  const canCycle = Boolean(onChange);
  const activeBankIndex = rotaryValue > 0 ? Math.floor((rotaryValue - 1) / BANK_SIZE) : 0;
  const bankCount = Math.max(1, Math.ceil(maxSlot / BANK_SIZE));
  const [selectedBankIndex, setSelectedBankIndex] = useState(activeBankIndex);
  useEffect(() => {
    setSelectedBankIndex(banked ? activeBankIndex : 0);
  }, [activeBankIndex, banked]);
  const bankSlots = useMemo(
    () =>
      Array.from({ length: BANK_SIZE }, (_, index) => {
        const localSlot = index + 1;
        const absoluteSlot = selectedBankIndex * BANK_SIZE + localSlot;
        return {
          localSlot,
          absoluteSlot,
          name: assetNames[absoluteSlot - 1]?.trim() || `${bypassLabel ?? label} ${absoluteSlot}`,
          available: absoluteSlot >= firstCycleSlot && absoluteSlot <= maxSlot,
        };
      }),
    [assetNames, bypassLabel, firstCycleSlot, label, maxSlot, selectedBankIndex],
  );
  const groupedAssetSlots = useMemo(
    () =>
      Array.from({ length: bankCount }, (_, bankIndex) => ({
        bankIndex,
        slots: Array.from({ length: BANK_SIZE }, (_, index) => {
          const localSlot = index + 1;
          const absoluteSlot = bankIndex * BANK_SIZE + localSlot;
          return {
            localSlot,
            absoluteSlot,
            name: assetNames[absoluteSlot - 1]?.trim() || `${bypassLabel ?? label} ${absoluteSlot}`,
            available: absoluteSlot >= firstCycleSlot && absoluteSlot <= maxSlot,
          };
        }).filter((slot) => slot.available),
      })).filter((bank) => bank.slots.length > 0),
    [assetNames, bankCount, bypassLabel, firstCycleSlot, label, maxSlot],
  );
  // Remember the last active (non-bypass) slot so turning bypass off returns to it
  // instead of jumping to slot 1.
  const lastActiveSlotRef = useRef(0);
  useEffect(() => {
    if (rotaryValue > 0) lastActiveSlotRef.current = rotaryValue;
  }, [rotaryValue]);
  const toggleBypass = () => {
    if (!onChange) return;
    onChange(bypassActive ? lastActiveSlotRef.current || Math.max(1, firstCycleSlot) : 0);
  };
  const selectedAssetSlot = rotaryValue > 0 ? String(rotaryValue) : "";

  return (
    <div
      className="grid min-w-0 grid-cols-[58px_minmax(0,1fr)] items-center gap-2 rounded-lg border px-2.5 py-2 sm:grid-cols-[58px_minmax(0,1fr)_auto]"
      style={{
        background: "var(--surface)",
        borderColor: active ? accentColor : "var(--panel-border-light)",
        boxShadow: active
          ? `0 0 0 3px ${accent === "cyan" ? "rgba(0,153,204,0.08)" : "rgba(212,160,23,0.08)"}, inset 0 1px 0 var(--panel-border-light)`
          : "inset 0 1px 0 var(--panel-border-light)",
      }}
    >
      <div
        className="relative grid h-14 w-14 short:h-12 short:w-12 place-items-center"
        style={{
          filter: active
            ? `drop-shadow(0 0 10px ${glow})`
            : "drop-shadow(0 8px 12px rgba(15,23,42,0.22))",
        }}
        aria-hidden="true"
      >
        <svg
          viewBox="0 0 64 64"
          className="h-14 w-14 short:h-12 short:w-12"
          style={{ overflow: "visible" }}
        >
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
        {bypassLabel ? (
          <button
            type="button"
            disabled={!canCycle}
            onClick={toggleBypass}
            className="mt-1 inline-flex h-5 max-w-full items-center rounded-md border px-1.5 text-[8px] font-extrabold uppercase tracking-[0.7px] disabled:cursor-default disabled:opacity-45"
            style={{
              background: bypassActive ? `${accentColor}22` : "var(--panel-inset)",
              borderColor: bypassActive ? accentColor : "var(--panel-border-light)",
              color: bypassActive ? accentColor : "var(--text-secondary)",
            }}
            aria-label={`${bypassLabel} bypass ${bypassActive ? "on" : "off"}`}
          >
            Bypass {bypassActive ? "on" : "off"}
          </button>
        ) : null}
      </span>

      <div className="col-span-2 grid grid-cols-5 gap-1 sm:col-span-1 sm:w-[152px]">
        <div
          className="col-span-5 truncate text-[8px] font-extrabold uppercase tracking-[0.8px]"
          style={{ color: "var(--text-secondary)" }}
        >
          {banked ? `${bankLabel(selectedBankIndex)} slots` : "IR slots"}
        </div>
        <select
          value={selectedAssetSlot}
          onChange={(event) => {
            const next = Number(event.target.value);
            if (next) onChange?.(next);
          }}
          disabled={!canCycle}
          className="col-span-5 h-7 min-w-0 rounded-md border px-1.5 text-[9px] font-bold outline-none disabled:opacity-45"
          style={{
            background: "var(--panel-inset)",
            borderColor: "var(--panel-border-light)",
            color: "var(--text)",
          }}
          aria-label={`${label} picker`}
        >
          <option value="">Select</option>
          {banked
            ? groupedAssetSlots.map((group) => (
                <optgroup key={group.bankIndex} label={bankLabel(group.bankIndex)}>
                  {group.slots.map((slot) => (
                    <option key={slot.absoluteSlot} value={slot.absoluteSlot}>
                      {slot.localSlot}. {slot.name}
                    </option>
                  ))}
                </optgroup>
              ))
            : bankSlots
                .filter((slot) => slot.available)
                .map((slot) => (
                  <option key={slot.absoluteSlot} value={slot.absoluteSlot}>
                    {slot.localSlot}. {slot.name}
                  </option>
                ))}
        </select>
        {bankSlots.map((slot) => {
          const selected = active && rotaryValue === slot.absoluteSlot;
          return (
            <button
              key={slot.absoluteSlot}
              type="button"
              disabled={!canCycle || !slot.available}
              onClick={() => onChange?.(slot.absoluteSlot)}
              className="h-7 rounded-md border font-mono text-[10px] font-extrabold disabled:cursor-default disabled:opacity-45"
              style={{
                background: selected ? `${accentColor}24` : "var(--panel-inset)",
                borderColor: selected ? accentColor : "var(--panel-border-light)",
                color: selected ? accentColor : "var(--text-secondary)",
                boxShadow: selected ? `0 0 0 2px ${accentColor}18` : "none",
              }}
              aria-label={`Select ${label} ${
                banked ? `${bankLabel(selectedBankIndex)} ` : ""
              }slot ${slot.localSlot}`}
              title={slot.name}
            >
              {slot.localSlot}
            </button>
          );
        })}
      </div>
    </div>
  );
}
