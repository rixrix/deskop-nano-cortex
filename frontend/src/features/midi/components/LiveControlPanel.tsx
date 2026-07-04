/**
 * LiveControlPanel component — documented MIDI controls: FX slots 1-5 (CC37-41), tuner, tap tempo, expression.
 *
 * @see docs/specs/200-frontend-control-surface/spec.md [FR-14]
 * @see docs/specs/200-frontend-control-surface/design.md [DES-FRONT-CONSTANTS]
 */
import type { ObservedExpressionZone } from "../protocolLabDecoder";

interface LiveControlPanelProps {
  fxSlotStates: boolean[];
  tunerState: boolean;
  expressionValue: number;
  /** Last observed physical-pedal zone (BLE, 3-zone). `null` when never seen. */
  observedExpressionZone?: ObservedExpressionZone | null;
  isConnected: boolean;
  onSetFxSlotEnabled: (slotIndex: number, enabled: boolean) => void;
  onSetTunerEnabled: (enabled: boolean) => void;
  onTapTempo: () => void;
  onSetExpression: (value: number) => void;
}

const ZONE_LABELS: Record<ObservedExpressionZone, string> = {
  heel: "HEEL",
  center: "CENTER",
  toe: "TOE",
};

export function LiveControlPanel({
  fxSlotStates,
  tunerState,
  expressionValue,
  observedExpressionZone = null,
  isConnected,
  onSetFxSlotEnabled,
  onSetTunerEnabled,
  onTapTempo,
  onSetExpression,
}: LiveControlPanelProps) {
  const pct = Math.round((expressionValue / 127) * 100);

  return (
    <section>
      <div className="flex flex-wrap items-start gap-3 mb-4">
        <span className="screw mt-1.5" />
        <div className="min-w-[220px] flex-1">
          <h2
            className="text-[12px] font-extrabold tracking-[2.2px] uppercase m-0"
            style={{ color: "var(--text)" }}
          >
            Live MIDI Control
          </h2>
          <p
            className="m-0 mt-0.5 text-[11px] font-medium"
            style={{ color: "var(--text-secondary)" }}
          >
            Documented PC/CC commands only: FX slots 1-5, tuner, tap tempo, and expression.
          </p>
        </div>
        <div
          className="hidden sm:block flex-1 h-px mt-3"
          style={{ background: "var(--panel-border)" }}
        />
      </div>

      <div className="grid gap-3 xl:grid-cols-[1fr_260px]">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          {fxSlotStates.map((enabled, i) => {
            const slot = i + 1;
            return (
              <button
                key={slot}
                type="button"
                disabled={!isConnected}
                onClick={() => onSetFxSlotEnabled(slot, !enabled)}
                className="rounded-2xl border-2 p-3 text-left transition-all disabled:cursor-default disabled:opacity-70"
                style={{
                  background: enabled
                    ? "linear-gradient(180deg, rgba(0,153,204,0.12), var(--surface))"
                    : "var(--surface)",
                  borderColor: enabled ? "var(--color-cyan-accent)" : "var(--panel-border-light)",
                  boxShadow: enabled
                    ? "0 0 0 3px rgba(0,153,204,0.08), inset 0 1px 0 var(--panel-border-light)"
                    : "inset 0 1px 0 var(--panel-border-light)",
                }}
              >
                <div
                  className="text-[10px] font-extrabold tracking-[1.2px] uppercase"
                  style={{ color: enabled ? "var(--color-cyan-accent)" : "var(--text-secondary)" }}
                >
                  FX Slot {slot}
                </div>
                <div
                  className="mt-2 text-[22px] font-extrabold"
                  style={{ color: enabled ? "var(--color-cyan-accent)" : "var(--text)" }}
                >
                  {enabled ? "On" : "Off"}
                </div>
                <div
                  className="mt-1 text-[10px] font-semibold"
                  style={{ color: "var(--text-secondary)" }}
                >
                  CC {36 + slot} · {enabled ? "127" : "0"}
                </div>
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-2 xl:grid-cols-1 gap-2">
          <button
            type="button"
            disabled={!isConnected}
            onClick={() => onSetTunerEnabled(!tunerState)}
            className="rounded-2xl border-2 p-3 text-left disabled:cursor-default disabled:opacity-70"
            style={{
              background: tunerState ? "rgba(0,153,204,0.10)" : "var(--surface)",
              borderColor: tunerState ? "var(--color-cyan-accent)" : "var(--panel-border-light)",
            }}
          >
            <div
              className="text-[10px] font-extrabold tracking-[1.2px] uppercase"
              style={{ color: tunerState ? "var(--color-cyan-accent)" : "var(--text-secondary)" }}
            >
              Tuner
            </div>
            <div
              className="mt-2 text-[22px] font-extrabold"
              style={{ color: tunerState ? "var(--color-cyan-accent)" : "var(--text)" }}
            >
              {tunerState ? "On" : "Off"}
            </div>
            <div className="text-[10px] font-semibold" style={{ color: "var(--text-secondary)" }}>
              CC 43 · {tunerState ? "127" : "0"}
            </div>
          </button>

          <button
            type="button"
            disabled={!isConnected}
            onClick={onTapTempo}
            className="rounded-2xl border-2 p-3 text-left disabled:cursor-default disabled:opacity-70"
            style={{ background: "var(--surface)", borderColor: "var(--panel-border-light)" }}
          >
            <div
              className="text-[10px] font-extrabold tracking-[1.2px] uppercase"
              style={{ color: "var(--text-secondary)" }}
            >
              Tap Tempo
            </div>
            <div className="mt-2 text-[22px] font-extrabold" style={{ color: "var(--text)" }}>
              Tap
            </div>
            <div className="text-[10px] font-semibold" style={{ color: "var(--text-secondary)" }}>
              CC 42 · 127
            </div>
          </button>
        </div>
      </div>

      <div
        className="mt-3 rounded-2xl border p-3"
        style={{ background: "var(--surface)", borderColor: "var(--panel-border-light)" }}
      >
        <div className="flex items-center justify-between gap-3 mb-2">
          <div>
            <div className="flex items-center gap-2">
              <span
                className="text-[10px] font-extrabold tracking-[1.4px] uppercase"
                style={{ color: "var(--text-secondary)" }}
              >
                Expression
              </span>
              {observedExpressionZone && (
                <span
                  className="rounded-full border px-1.5 py-0.5 text-[8px] font-extrabold uppercase tracking-[0.8px]"
                  style={{
                    color: "var(--color-amber-accent)",
                    borderColor: "rgba(212,160,23,0.34)",
                    background: "rgba(212,160,23,0.08)",
                  }}
                  title="Physical pedal position observed over Bluetooth (3-zone; provisional)"
                >
                  pedal · {ZONE_LABELS[observedExpressionZone]}
                </span>
              )}
            </div>
            <div className="text-[12px] font-semibold" style={{ color: "var(--text)" }}>
              CC 1 · value {expressionValue} · {pct}%
            </div>
          </div>
          <div
            className="text-[22px] font-extrabold font-mono"
            style={{ color: isConnected ? "var(--color-cyan-accent)" : "var(--text-secondary)" }}
          >
            {expressionValue}
          </div>
        </div>
        {/* Animated position bar — glides between heel/center/toe so the coarse 3-zone
            BLE pedal reads as smooth motion. @see [DES-FRONT-DECODER] */}
        <div
          className="mb-2 h-1.5 w-full overflow-hidden rounded-full"
          style={{ background: "var(--surface-2)" }}
        >
          <div
            className="h-full rounded-full"
            style={{
              width: `${pct}%`,
              background: isConnected ? "var(--color-cyan-accent)" : "var(--text-secondary)",
              boxShadow: isConnected ? "0 0 8px var(--glow-cyan)" : "none",
              transition: "width 260ms cubic-bezier(0.22, 1, 0.36, 1)",
            }}
          />
        </div>
        <input
          type="range"
          min={0}
          max={127}
          value={expressionValue}
          disabled={!isConnected}
          onChange={(e) => onSetExpression(Number(e.target.value))}
          className="w-full"
          aria-label="Expression pedal (CC1)"
        />
      </div>
    </section>
  );
}
