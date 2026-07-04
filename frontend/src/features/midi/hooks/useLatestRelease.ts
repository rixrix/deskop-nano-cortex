/**
 * useLatestRelease — checks GitHub Releases for a version newer than the running app.
 *
 * Deliberately resilient for offline / live-gig use: it runs off the launch path (never gates the
 * splash or `app:ready`), aborts after a short timeout, and collapses ANY failure — no internet, a
 * captive portal returning HTML, DNS failure, 404, CORS — into a quiet `error` state with no
 * console noise. Callers treat `error`/`checking` as "no update known" and simply link to Releases.
 *
 * @see docs/specs/200-frontend-control-surface/spec.md [FR-39]
 */
import { useEffect, useState } from "react";

const RELEASES_API = "https://api.github.com/repos/rixrix/deskop-nano-cortex/releases/latest";
const CHECK_TIMEOUT_MS = 6000;

export type UpdateState =
  | { status: "checking" }
  | { status: "latest"; version: string }
  | { status: "update"; version: string }
  | { status: "error" };

/** Compare two dotted numeric versions. Returns 1 if a > b, -1 if a < b, 0 if equal. */
function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}

export function useLatestRelease(currentVersion: string): UpdateState {
  const [state, setState] = useState<UpdateState>({ status: "checking" });

  useEffect(() => {
    if (!currentVersion) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);
    let cancelled = false;
    setState({ status: "checking" });

    fetch(RELEASES_API, {
      headers: { Accept: "application/vnd.github+json" },
      signal: controller.signal,
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: { tag_name?: string }) => {
        if (cancelled) return;
        const latest = String(data.tag_name ?? "").replace(/^v/i, "");
        if (!latest) {
          setState({ status: "error" });
          return;
        }
        setState(
          compareVersions(latest, currentVersion) > 0
            ? { status: "update", version: latest }
            : { status: "latest", version: latest },
        );
      })
      .catch(() => {
        // Offline / timeout / captive portal / rate-limited — stay quiet, just no update known.
        if (!cancelled) setState({ status: "error" });
      })
      .finally(() => window.clearTimeout(timeout));

    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [currentVersion]);

  return state;
}
