/**
 * UpdateNudge — a one-time-per-version "update available" toast (see `useUpdateNudge`).
 * Dismissing silences that version for good; the StatusBar update pill and the About tab
 * remain as the persistent surfaces for the same release.
 *
 * @see docs/specs/200-frontend-control-surface/spec.md [FR-48]
 * @see docs/specs/200-frontend-control-surface/design.md [DES-FRONT-APP]
 */

import { ArrowCircleUpIcon } from "@phosphor-icons/react";

interface UpdateNudgeProps {
  /** The newer release version, without the leading `v`. */
  version: string;
  /** Open the About tab (release notes + download link), then dismiss. */
  onView: () => void;
  /** Silence the toast for this version only. */
  onDismiss: () => void;
}

export function UpdateNudge({ version, onView, onDismiss }: UpdateNudgeProps) {
  return (
    <div
      role="dialog"
      aria-label="Update available"
      className="fixed bottom-4 right-4 z-40 max-w-[300px] rounded-2xl border p-3"
      style={{
        background: "var(--surface)",
        borderColor: "rgba(0,170,85,0.42)",
        boxShadow: "0 12px 34px rgba(0,0,0,0.35)",
      }}
    >
      <div className="flex items-start gap-2.5">
        <ArrowCircleUpIcon
          size={18}
          weight="fill"
          color="var(--color-green-accent)"
          aria-hidden="true"
        />
        <div className="min-w-0">
          <div className="text-[12px] font-extrabold" style={{ color: "var(--text)" }}>
            Update available: v{version}
          </div>
          <div
            className="mt-0.5 text-[11px] font-medium"
            style={{ color: "var(--text-secondary)" }}
          >
            A newer release is on GitHub. The download link is in the About tab.
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onView}
              className="rounded-lg border px-3 py-1.5 text-[11px] font-extrabold"
              style={{
                color: "var(--text-inverse)",
                background: "var(--color-green-accent)",
                borderColor: "var(--color-green-accent)",
              }}
            >
              See what&apos;s new
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
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
