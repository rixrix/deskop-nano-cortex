/**
 * useUpdateNudge — visibility for the one-time-per-version "update available" toast.
 *
 * Unlike the recurring SupportNudge, this is informational: each new release toasts once, and
 * dismissing silences the toast for that version for good. The StatusBar update pill and the
 * About tab remain as persistent, quieter surfaces for the same release.
 *
 * @see docs/specs/200-frontend-control-surface/spec.md [FR-48]
 * @see docs/specs/200-frontend-control-surface/design.md [DES-FRONT-APP]
 */
import { useCallback, useState } from "react";
import type { UpdateState } from "./useLatestRelease";

const DISMISSED_VERSION_KEY = "nano:updateNudgeDismissedVersion";

export function useUpdateNudge(update: UpdateState) {
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(DISMISSED_VERSION_KEY);
  });

  const visible = update.status === "update" && update.version !== dismissedVersion;

  /** Silence the toast for this release only — the next newer version toasts again. */
  const dismiss = useCallback(() => {
    if (update.status !== "update") return;
    window.localStorage.setItem(DISMISSED_VERSION_KEY, update.version);
    setDismissedVersion(update.version);
  }, [update]);

  return { visible, dismiss };
}
