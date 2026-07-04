/**
 * SupportNudge — a tasteful, recurring "enjoying this? consider supporting" prompt. Visibility is
 * driven by `useSupportNudge`'s cooldown algorithm: dismissing it hides it for a while, not for
 * good (Reaper-nag-screen style) — there is no "never show again" option by design.
 *
 * @see docs/specs/200-frontend-control-surface/spec.md [FR-42]
 * @see docs/specs/200-frontend-control-surface/design.md [DES-FRONT-APP]
 */

import { HeartIcon } from "@phosphor-icons/react";

interface SupportNudgeProps {
  /** Open the support/donation surface (the About tab). */
  onSupport: () => void;
  /** Hide until the next cooldown window; never permanent. */
  onDismiss: () => void;
}

export function SupportNudge({ onSupport, onDismiss }: SupportNudgeProps) {
  return (
    <div
      role="dialog"
      aria-label="Support the project"
      className="fixed bottom-4 right-4 z-40 max-w-[300px] rounded-2xl border p-3"
      style={{
        background: "var(--surface)",
        borderColor: "rgba(219,97,162,0.42)",
        boxShadow: "0 12px 34px rgba(0,0,0,0.35)",
      }}
    >
      <div className="flex items-start gap-2.5">
        <HeartIcon size={18} weight="fill" color="#db61a2" aria-hidden="true" />
        <div className="min-w-0">
          <div className="text-[12px] font-extrabold" style={{ color: "var(--text)" }}>
            Enjoying Nano Cortex?
          </div>
          <div
            className="mt-0.5 text-[11px] font-medium"
            style={{ color: "var(--text-secondary)" }}
          >
            It&apos;s free and open source. If it&apos;s useful, a small tip keeps it going.
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onSupport}
              className="rounded-lg border px-3 py-1.5 text-[11px] font-extrabold"
              style={{
                color: "var(--text-inverse)",
                background: "#db61a2",
                borderColor: "#db61a2",
              }}
            >
              Support
            </button>
            <button
              type="button"
              onClick={onDismiss}
              className="rounded-lg border px-3 py-1.5 text-[11px] font-bold"
              style={{
                color: "var(--text-secondary)",
                background: "var(--surface-2)",
                borderColor: "var(--panel-border-light)",
              }}
            >
              Maybe later
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
