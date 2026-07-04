import { defineConfig, devices } from "@playwright/test";

// E2E drives the React control surface in headless Chromium against the Vite
// dev server. Tauri IPC is mocked in the browser (see e2e/fixtures/tauri-mock.ts),
// because the production WebView/Rust backend is not available in CI.
//
// @see docs/specs/400-dx-tooling/spec.md [FR-11]
// @see docs/specs/400-dx-tooling/design.md [DES-DX-E2E]
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:1420",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:1420",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
