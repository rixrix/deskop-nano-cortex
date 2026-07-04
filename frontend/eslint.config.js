// ESLint flat config: typescript-eslint + react-hooks + react-refresh, Prettier-compatible.
//
// @see docs/specs/400-dx-tooling/spec.md [FR-1]
// @see docs/specs/400-dx-tooling/design.md [DES-DX-LINT]
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import prettier from "eslint-config-prettier";
import globals from "globals";

export default tseslint.config(
  {
    ignores: ["dist", "coverage", "node_modules", "playwright-report", "test-results"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.browser },
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // Node-context tooling configs.
    files: ["*.config.{ts,js}"],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    // E2E specs use Playwright (node) APIs plus browser globals inside page.evaluate().
    files: ["e2e/**/*.ts"],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  {
    // Unit tests get jsdom (browser) + vitest/node globals.
    files: ["src/**/*.{test,spec}.{ts,tsx}", "src/test/**/*.{ts,tsx}"],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  prettier,
);
