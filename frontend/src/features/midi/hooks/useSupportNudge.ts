/**
 * useSupportNudge — a recurring, never-permanently-silenced "enjoying this? consider
 * supporting" prompt (Reaper-nag-screen style: dismissing hides it for a while, not forever).
 *
 * Two independent triggers, both gated behind a persisted cooldown so it never nags:
 * - Connection count: a fresh disconnected→connected transition, once the user has connected
 *   at least `MIN_CONNECTS_BEFORE_FIRST_SHOW` times total.
 * - Long session: staying connected continuously for `LONG_SESSION_MS`, a signal the user is
 *   getting real, sustained value out of a single sitting.
 *
 * Each time the nudge is shown, the cooldown before the next one grows (`COOLDOWN_GROWTH`),
 * capped at `MAX_COOLDOWN_MS` — so a heavily-engaged long-term user gets nudged less often over
 * time, but it always eventually resurfaces. There is no "never show again" option.
 *
 * @see docs/specs/200-frontend-control-surface/spec.md [FR-42]
 * @see docs/specs/200-frontend-control-surface/design.md [DES-FRONT-APP]
 */
import { useCallback, useEffect, useRef, useState } from "react";

const CONNECT_COUNT_KEY = "nano:connectCount";
const LAST_SHOWN_AT_KEY = "nano:supportNudgeLastShownAt";
const TIMES_SHOWN_KEY = "nano:supportNudgeTimesShown";

/** Show the nudge only after the user has connected this many separate times, ever. */
const MIN_CONNECTS_BEFORE_FIRST_SHOW = 3;
/** A single continuously-connected sitting this long also qualifies as an engagement signal. */
const LONG_SESSION_MS = 25 * 60 * 1000;
/** How often the long-session timer re-checks while connected. */
const SESSION_CHECK_INTERVAL_MS = 60 * 1000;
/** Initial wait before the nudge can reappear after being shown. */
const BASE_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
/** Each subsequent showing waits this much longer than the last. */
const COOLDOWN_GROWTH = 1.5;
/** Upper bound on the cooldown — it always resurfaces eventually, never silenced for good. */
const MAX_COOLDOWN_MS = 45 * 24 * 60 * 60 * 1000;

/** The cooldown due once the nudge has already been shown `timesShown` times: the base wait
 *  after the 1st showing, growing after each one after that (never before the 1st). */
function cooldownForShowing(timesShown: number): number {
  if (timesShown <= 0) return BASE_COOLDOWN_MS;
  return Math.min(BASE_COOLDOWN_MS * COOLDOWN_GROWTH ** (timesShown - 1), MAX_COOLDOWN_MS);
}

export function useSupportNudge(isConnected: boolean) {
  const [visible, setVisible] = useState(false);
  const wasConnected = useRef(false);
  const sessionStartedAt = useRef<number | null>(null);

  const tryShow = useCallback(() => {
    const connectCount = Number(window.localStorage.getItem(CONNECT_COUNT_KEY)) || 0;
    if (connectCount < MIN_CONNECTS_BEFORE_FIRST_SHOW) return;

    const timesShown = Number(window.localStorage.getItem(TIMES_SHOWN_KEY)) || 0;
    const lastShownAt = Number(window.localStorage.getItem(LAST_SHOWN_AT_KEY)) || 0;
    if (Date.now() - lastShownAt < cooldownForShowing(timesShown)) return;

    setVisible(true);
  }, []);

  // Connection-count trigger: fires once per disconnected→connected transition.
  useEffect(() => {
    if (isConnected && !wasConnected.current) {
      const count = (Number(window.localStorage.getItem(CONNECT_COUNT_KEY)) || 0) + 1;
      window.localStorage.setItem(CONNECT_COUNT_KEY, String(count));
      sessionStartedAt.current = Date.now();
      tryShow();
    }
    if (!isConnected) sessionStartedAt.current = null;
    wasConnected.current = isConnected;
  }, [isConnected, tryShow]);

  // Long-session trigger: once past the floor, keeps re-checking every tick (not a one-shot) so
  // a sitting that outlasts a still-pending cooldown still resurfaces the moment it clears,
  // instead of getting only one chance at the 25-minute mark and going quiet for the rest of it.
  useEffect(() => {
    if (!isConnected) return undefined;
    const id = window.setInterval(() => {
      const startedAt = sessionStartedAt.current;
      if (startedAt === null) return;
      if (Date.now() - startedAt >= LONG_SESSION_MS) tryShow();
    }, SESSION_CHECK_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [isConnected, tryShow]);

  /** Hide until the next cooldown window — never permanent. */
  const dismiss = useCallback(() => {
    const timesShown = Number(window.localStorage.getItem(TIMES_SHOWN_KEY)) || 0;
    window.localStorage.setItem(TIMES_SHOWN_KEY, String(timesShown + 1));
    window.localStorage.setItem(LAST_SHOWN_AT_KEY, String(Date.now()));
    setVisible(false);
  }, []);

  return { visible, dismiss };
}
