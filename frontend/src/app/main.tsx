/**
 * React tree root — mounts App inside ThemeProvider and LogProvider.
 *
 * @see docs/specs/200-frontend-control-surface/spec.md [FR-2]
 * @see docs/specs/200-frontend-control-surface/design.md [DES-FRONT-APP]
 */
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { initClarity } from "../shared/telemetry/clarity";
import "../styles/index.css";

// Telemetry defaults on (see PRIVACY.md); initClarity() is a no-op if the user has
// turned it off in About → Telemetry posture, or during tests.
initClarity();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// Fade out the launch splash (see index.html) when the app signals it is warmed up (the
// `app:ready` event dispatched by App once version + MIDI ports are primed). A minimum keeps the
// branded loader visible on fast machines; a maximum guarantees it never hangs if warm-up stalls.
const splash = document.getElementById("splash");
if (splash) {
  const MIN_VISIBLE_MS = 700;
  const MAX_VISIBLE_MS = 4500;
  const shownAt = performance.now();
  let hidden = false;
  const hide = () => {
    if (hidden) return;
    hidden = true;
    const wait = Math.max(0, MIN_VISIBLE_MS - (performance.now() - shownAt));
    window.setTimeout(() => {
      splash.classList.add("splash--hide");
      splash.addEventListener("transitionend", () => splash.remove(), { once: true });
      window.setTimeout(() => splash.remove(), 600);
    }, wait);
  };
  window.addEventListener("app:ready", hide, { once: true });
  window.setTimeout(hide, MAX_VISIBLE_MS);
}
