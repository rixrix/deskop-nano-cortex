import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
// Production builds ship the stylesheet inside the JS bundle as a runtime <style> node instead of
// a `<link>` asset. The packaged app serves assets from the private webview origin
// (`tauri://localhost` / `http://tauri.localhost`), which Clarity's session-replay service cannot
// fetch — with a linked stylesheet, replays reconstruct an unstyled page (a giant data-URI app
// icon on white). A <style> DOM node travels with the recorded DOM, so replays keep the app CSS.
//
// @see docs/specs/210-frontend-ipc-contracts/spec.md [FR-28]
// @see docs/specs/210-frontend-ipc-contracts/design.md [DES-SHARED-TELEMETRY]
import cssInjectedByJsPlugin from "vite-plugin-css-injected-by-js";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig(async () => ({
  plugins: [react(), tailwindcss(), cssInjectedByJsPlugin()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/backend/**"],
    },
  },
}));
