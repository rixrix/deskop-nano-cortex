import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Unit-test runner config, kept separate from the Vite app/dev config so the
// Tailwind plugin and Tauri dev server never load during tests.
//
// @see docs/specs/400-dx-tooling/spec.md [FR-9]
// @see docs/specs/400-dx-tooling/design.md [DES-DX-UNIT]
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    css: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.{test,spec}.{ts,tsx}", "src/test/**", "src/env.d.ts", "src/app/main.tsx"],
    },
  },
});
