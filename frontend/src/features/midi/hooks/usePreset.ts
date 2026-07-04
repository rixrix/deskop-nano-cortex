/**
 * usePreset hook — preset navigation helper.
 *
 * App-wide document keyboard shortcuts are deferred for this release because unmodified number
 * and letter keys interfere with typing in the control surface. Focused controls keep their native
 * keyboard behavior; this hook only exposes programmatic previous/next navigation.
 *
 * @see docs/specs/200-frontend-control-surface/spec.md [FR-18]
 * @see docs/specs/200-frontend-control-surface/design.md [DES-FRONT-APP]
 */
import { useCallback } from "react";

interface KeyboardActions {
  onTapTempo?: () => void | Promise<void>;
  onToggleTuner?: () => void | Promise<void>;
  onFootswitchPress?: (footswitch: "I" | "II") => void | Promise<void>;
  onFootswitchLongPress?: (footswitch: "I" | "II") => void | Promise<void>;
  onFootswitchRotaryNudge?: (footswitch: "I" | "II", delta: number) => void;
}

export function usePreset(
  switchPreset: (preset: number) => void,
  currentPreset: number,
  isConnected: boolean,
  _actions: KeyboardActions = {},
  disabled = false,
) {
  const navigatePreset = useCallback(
    (direction: "prev" | "next") => {
      if (!isConnected || disabled) return;
      const next =
        direction === "next" ? Math.min(currentPreset + 1, 63) : Math.max(currentPreset - 1, 0);
      switchPreset(next);
    },
    [currentPreset, disabled, isConnected, switchPreset],
  );

  return { navigatePreset };
}
