/**
 * Microsoft Clarity telemetry — session interactions, heatmaps, and JS errors, plus
 * app diagnostic log lines forwarded as custom Clarity events. Enabled by default;
 * the About tab exposes an off toggle (see PRIVACY.md for the full disclosure).
 *
 * @see docs/specs/210-frontend-ipc-contracts/spec.md [FR-28]
 * @see docs/specs/210-frontend-ipc-contracts/design.md [DES-SHARED-TELEMETRY]
 */
import type { LogEntry } from "../hooks/useLogs";

declare global {
  interface Window {
    clarity?: (...args: unknown[]) => void;
  }
}

const CLARITY_PROJECT_ID = "xh86t3eojp";
const TELEMETRY_ENABLED_STORAGE_KEY = "desktop-nano-cortex-telemetry-enabled";
const MAX_EVENT_LENGTH = 200;

let injected = false;

/** Defaults to enabled (opt-out model): absent or "true" → on, only "false" → off. */
export function isTelemetryEnabled(): boolean {
  if (typeof localStorage === "undefined") return true;
  return localStorage.getItem(TELEMETRY_ENABLED_STORAGE_KEY) !== "false";
}

export function setTelemetryEnabled(enabled: boolean): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(TELEMETRY_ENABLED_STORAGE_KEY, enabled ? "true" : "false");
}

function inTestMode(): boolean {
  return typeof import.meta.env !== "undefined" && import.meta.env.MODE === "test";
}

/**
 * Injects the Clarity tag once. Safe to call repeatedly (idempotent) and safe to call
 * when disabled (no-op). There is no official runtime "stop" API — once loaded, Clarity
 * keeps collecting for the session; turning the toggle off takes full effect on next launch.
 */
export function initClarity(): void {
  if (injected || inTestMode() || typeof document === "undefined") return;
  if (!isTelemetryEnabled()) return;

  injected = true;
  (function (c: Window, l: Document, a: string, r: string, i: string) {
    const win = c as unknown as Record<string, ((...args: unknown[]) => void) & { q?: unknown[] }>;
    win[a] =
      win[a] ||
      function (...args: unknown[]) {
        (win[a].q = win[a].q || []).push(args);
      };
    const t = l.createElement(r) as HTMLScriptElement;
    t.async = true;
    t.src = "https://www.clarity.ms/tag/" + i;
    const y = l.getElementsByTagName(r)[0];
    y.parentNode?.insertBefore(t, y);
  })(window, document, "clarity", "script", CLARITY_PROJECT_ID);
}

/** Forwards a single app log line as a Clarity custom event. No-op when disabled/not loaded. */
export function sendClarityLog(entry: LogEntry): void {
  if (inTestMode() || typeof window === "undefined" || typeof window.clarity !== "function") return;
  if (!isTelemetryEnabled()) return;
  const label = `${entry.level}: ${entry.message}`.slice(0, MAX_EVENT_LENGTH);
  window.clarity("event", label);
}
