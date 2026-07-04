---
afx: true
type: TASKS
status: Living
owner: "@richard-sentino"
version: "1.1"
created_at: "2026-06-10T11:54:35.000Z"
updated_at: "2026-07-06T05:32:09.000Z"
tags:
  ["dx", "tooling", "eslint", "prettier", "rustfmt", "clippy", "vitest", "playwright", "testing"]
spec: spec.md
design: design.md
---

# 400 DX Tooling — Tasks

> Backfilled implementation checklist. Config layer shipped with the initial scaffold
> (2026-06-10). Test-authoring work is in progress as of 2026-06-13.

---

## Phase 1: Lint Configuration

<!-- files: frontend/eslint.config.js, frontend/package.json -->
<!-- @see docs/specs/400-dx-tooling/spec.md [FR-1] [FR-2] [FR-3] [FR-4] -->
<!-- @see docs/specs/400-dx-tooling/design.md [DES-DX-LINT] -->

- [x] Install `@eslint/js`, `typescript-eslint`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`, `eslint-config-prettier`, `globals` as `devDependencies`.
- [x] Write `frontend/eslint.config.js` using the flat-config (`tseslint.config(...)`) API.
- [x] Add global `ignores` block: `dist`, `coverage`, `node_modules`, `playwright-report`, `test-results`.
- [x] Add `js.configs.recommended` and `...tseslint.configs.recommended` as base layers.
- [x] Add `src/**/*.{ts,tsx}` block with `globals.browser`, `react-hooks` and `react-refresh` plugins, and the four rules at their correct severities.
- [x] Add `*.config.{ts,js}` / `e2e/**/*.ts` block with `globals.node`.
- [x] Add `src/**/*.{test,spec}.{ts,tsx}` / `src/test/**` block with `globals.browser + globals.node`.
- [x] Spread `prettier` as the final element in the config array.
- [x] Add `"lint": "eslint ."` and `"lint:fix": "eslint . --fix"` to `frontend/package.json` scripts.
- [x] Add `"lint": "npm --prefix frontend run lint && npm run lint:rust"` to root `package.json`.
- [x] Add `"lint:rust": "cargo clippy --manifest-path backend/Cargo.toml --features ble --all-targets -- -D warnings"` to root `package.json`.

---

## Phase 2: Format Configuration

<!-- files: frontend/.prettierrc.json, frontend/.prettierignore, backend/rustfmt.toml, .editorconfig -->
<!-- @see docs/specs/400-dx-tooling/spec.md [FR-5] [FR-6] [FR-8] -->
<!-- @see docs/specs/400-dx-tooling/design.md [DES-DX-FORMAT] -->

- [x] Write `frontend/.prettierrc.json`: `printWidth 100`, `tabWidth 2`, `semi true`, `singleQuote false`, `trailingComma "all"`.
- [x] Write `frontend/.prettierignore`: exclude `dist`, `coverage`, `node_modules`, `playwright-report`, `test-results`, `package-lock.json`.
- [x] Write `backend/rustfmt.toml`: `edition = "2021"`, `max_width = 100`, `newline_style = "Unix"`, `use_field_init_shorthand = true`, `use_try_shorthand = true`.
- [x] Write `.editorconfig` at repo root: global UTF-8/LF/final-newline/trim rules; per-pattern indent overrides for `*.rs` (4-space, max_line_length 100), `*.md` (no trim), `Makefile` (tab).
- [x] Add `"format": "prettier --write ."` and `"format:check": "prettier --check ."` to `frontend/package.json`.
- [x] Add composite `"format"`, `"format:rust"`, `"format:check"` scripts to root `package.json`.

---

## Phase 3: TypeScript Configuration

<!-- files: frontend/tsconfig.json -->
<!-- @see docs/specs/400-dx-tooling/spec.md [NFR-4] -->
<!-- @see docs/specs/400-dx-tooling/design.md [DES-DX-OVR] -->

- [x] Configure `frontend/tsconfig.json`: `target: ES2020`, `module: ESNext`, `moduleResolution: bundler`, `jsx: react-jsx`, `strict: true`, `noUnusedLocals: true`, `noUnusedParameters: true`, `noFallthroughCasesInSwitch: true`, `noUncheckedSideEffectImports: true`, `noEmit: true`.
- [x] Add `"typecheck": "tsc --noEmit"` to `frontend/package.json`.
- [x] Add `"typecheck": "npm --prefix frontend run typecheck"` to root `package.json`.

---

## Phase 4: Vitest Unit Test Infrastructure

<!-- files: frontend/vitest.config.ts, frontend/src/test/setup.ts, frontend/package.json -->
<!-- @see docs/specs/400-dx-tooling/spec.md [FR-9] [FR-10] -->
<!-- @see docs/specs/400-dx-tooling/design.md [DES-DX-UNIT] -->

- [x] Install `vitest`, `jsdom`, `@vitest/coverage-v8`, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/dom`, `@testing-library/user-event` as `devDependencies`.
- [x] Write `frontend/vitest.config.ts` as a separate `defineConfig` (not merged into `vite.config.ts`): `plugins: [react()]`, `environment: "jsdom"`, `globals: true`, `setupFiles: ["./src/test/setup.ts"]`, `include: ["src/**/*.{test,spec}.{ts,tsx}"]`, `css: false`, v8 coverage with `text` + `html` reporters.
- [x] Write `frontend/src/test/setup.ts`: import `@testing-library/jest-dom/vitest`, register `afterEach(() => cleanup())`.
- [x] Add `"test": "vitest run"`, `"test:watch": "vitest"`, `"test:coverage": "vitest run --coverage"` to `frontend/package.json`.
- [x] Add `"test": "npm --prefix frontend run test && npm run test:rust"` and `"test:rust": "cargo test --manifest-path backend/Cargo.toml --features ble"` to root `package.json`.

---

## Phase 5: Playwright E2E Infrastructure

<!-- files: frontend/playwright.config.ts, frontend/package.json -->
<!-- @see docs/specs/400-dx-tooling/spec.md [FR-11] [FR-12] -->
<!-- @see docs/specs/400-dx-tooling/design.md [DES-DX-E2E] -->

- [x] Install `@playwright/test` as `devDependency`.
- [x] Write `frontend/playwright.config.ts`: `testDir: "./e2e"`, `fullyParallel: true`, `forbidOnly: !!CI`, `retries: CI ? 2 : 0`, `workers: CI ? 1 : undefined`, `reporter: CI ? [github, html] : "list"`, `baseURL: "http://localhost:1420"`, `trace: "on-first-retry"`, single `chromium` project, `webServer: { command: "npm run dev", url: ":1420", reuseExistingServer: !CI, timeout: 120_000 }`.
- [x] Add `"e2e": "playwright test"` and `"e2e:ui": "playwright test --ui"` to `frontend/package.json`.
- [x] Add `"e2e": "npm --prefix frontend run e2e"` to root `package.json`.

---

## Phase 6: Vitest Unit Test Authoring (planned)

<!-- files: frontend/src/**/*.{test,spec}.{ts,tsx} -->
<!-- @see docs/specs/400-dx-tooling/spec.md [FR-15] -->
<!-- @see docs/specs/400-dx-tooling/design.md [DES-DX-UNIT] -->

- [ ] Write `TauriMidiConnection.test.ts`: mock `frontend/src/shared/ipc/commands.ts` with `vi.mock`; assert `sendProgramChange`, `sendControlChange`, `recallPreset` call the underlying `sendMidi` with the correct byte arrays.
- [ ] Write `useMidiConnection.test.ts`: render a minimal wrapper component, fire connection state transitions, assert hook returns reflect updated state.
- [ ] Write `usePreset.test.ts`: assert preset selection state updates on `recallPreset` call.
- [ ] Write `App.test.tsx`: render `App`, simulate a mocked `midi://message` event with a PC byte, assert the preset grid highlights the correct preset.
- [ ] Confirm `npm run test:coverage` reports ≥ 70 % statement coverage on `features/midi/services/` and `features/midi/hooks/`.

---

## Phase 7: Rust Unit Test Authoring (planned)

<!-- files: backend/src/infrastructure/midi/connection.rs, backend/src/infrastructure/midi/listener.rs, backend/src/domain/midi_message.rs, backend/src/infrastructure/midi/ble_decoder.rs -->
<!-- @see docs/specs/400-dx-tooling/spec.md [FR-16] -->
<!-- @see docs/specs/400-dx-tooling/design.md [DES-DX-RUST-TEST] -->

- [ ] `connection.rs`: add `#[cfg(test)]` block; test `send_to_port` returns a descriptive `Err` when port name is not found (no hardware needed — enumeration will find zero ports in CI).
- [ ] `listener.rs`: add `#[cfg(test)]` block; test `start_listener` returns `Err` for an unknown port name.
- [ ] `domain/midi_message.rs`: add `#[cfg(test)]` block; test `is_realtime` at boundary bytes `0xF7` (false), `0xF8` (true), `0xFF` (true); test `is_sysex` for `0xF0` (true) and `0x90` (false).
- [ ] `ble_decoder.rs`: add `#[cfg(test)]` block; feed a known raw BLE notification byte sequence and assert the decoded `NanoState` fields match the expected provisional values and capability flags.
- [ ] Confirm `cargo test --features ble` collects and passes all new tests without hardware.

---

## Phase 8: Playwright E2E Spec Authoring (planned)

<!-- files: frontend/e2e/**/*.ts -->
<!-- @see docs/specs/400-dx-tooling/spec.md [FR-17] -->
<!-- @see docs/specs/400-dx-tooling/design.md [DES-DX-E2E] -->

- [ ] Create `frontend/e2e/fixtures/tauri-mock.ts`: export a `tauriMock` fixture that calls `page.addInitScript(...)` to stub `window.__TAURI_INTERNALS__` with per-command mock responses.
- [ ] Write `frontend/e2e/preset-grid.spec.ts`: load page with mock IPC (state: `"disconnected"`); assert 64 preset buttons render; simulate click on preset 5; assert the `sendMidi` mock was called with `[0xC0, 0x04]`.
- [ ] Write `frontend/e2e/fx-slots.spec.ts`: mock `get_state` as `"connected"`; assert FX slot buttons render; click slot 1 (CC37); assert mock receives `[0xB0, 37, 127]`.
- [ ] Write `frontend/e2e/connection-ui.spec.ts`: assert "Connect USB" button visible in disconnected state; mock `connect` returning `"connected"`; click button; assert status bar updates.
- [ ] Confirm `npm run e2e` passes with all specs green against the Vite dev server.

---

## Phase 9: Standard tooling adoption

<!-- files: .husky/pre-commit, .husky/commit-msg, .husky/pre-push, lint-staged.config.mjs, commitlint.config.cjs, knip.jsonc, .markdownlint-cli2.jsonc, package.json, .vscode/settings.json, .vscode/extensions.json, .nvmrc, .npmrc, .prettierrc.json, .prettierignore, .gitattributes, .gitleaks.toml, .tool-versions -->
<!-- @see docs/specs/400-dx-tooling/spec.md [FR-18] [FR-19] [FR-20] [FR-21] [FR-22] [FR-23] [FR-24] [FR-25] [FR-26] [FR-27] [FR-28] [FR-29] -->
<!-- @see docs/specs/400-dx-tooling/design.md [DES-DX-HOOKS] [DES-DX-KNIP] [DES-DX-MARKDOWN] [DES-DX-EDITOR] [DES-DX-NODE] [DES-DX-REPO] -->

- [x] Write `.husky/pre-commit` (branch guard → gitleaks soft gate → lint-staged), `.husky/commit-msg` (commitlint), `.husky/pre-push` (`npm run verify`); wire root `"prepare": "husky"` ([FR-18]).
- [x] Write `lint-staged.config.mjs`: frontend TS/TSX via prettier + ESLint with cwd=`frontend/` (`npm --prefix frontend run lint:staged`), root/docs JSON/YAML/JS via prettier, markdown via prettier + markdownlint-cli2 `--fix`, `backend/**/*.rs` via `rustfmt --edition 2021` ([FR-19]).
- [x] Write `commitlint.config.cjs`: `@commitlint/config-conventional`, required scope from the hand-listed enum, header max length 100 ([FR-20]).
- [x] Write `knip.jsonc`: manual two-workspace map (`.` scripts + `frontend` app entries), pre-ignored config-only deps; add root `knip` script ([FR-21]).
- [x] Write `.markdownlint-cli2.jsonc`: defaults with MD013/MD033/MD040/MD041 disabled, globs + ignores; add root `lint:md` and `format:md` scripts ([FR-22]).
- [x] Add root aggregate scripts `check`, `fix`, `verify`, `verify:full`; add new root devDependencies (husky, lint-staged, commitlint, knip, markdownlint-cli2, prettier) and `engines` (node >=20, npm >=10) ([FR-23]).
- [x] Write `.vscode/settings.json` (format-on-save, Prettier default formatter, `eslint.workingDirectories: ["frontend"]`, markdownlint fix-on-save, rust-analyzer as Rust formatter) and `.vscode/extensions.json` recommendations ([FR-24]).
- [x] Write `.nvmrc` (`20`) and `.npmrc` (`engine-strict=true`, `enable-pre-post-scripts=true`) ([FR-25]).
- [x] Write root `.prettierrc.json` mirroring the frontend options and root `.prettierignore` scoped so frontend files are not excluded ([FR-26]).
- [x] Write `.gitattributes`: `* text=auto eol=lf`, binary markers for image/bundle assets, `linguist-generated` for lockfiles and `backend/gen/**` ([FR-27]).
- [x] Write `.gitleaks.toml` (default ruleset extension + BLE/USB capture-path allowlist); add root `scan:secrets` script; pre-commit runs the staged-only variant with soft-skip ([FR-28]).
- [x] Write `.tool-versions`: `nodejs 20`, `rust 1.90.0`, consistent with `.nvmrc` and `backend/rust-toolchain.toml` ([FR-29]).

---

## Work Sessions

| Date       | Task                                                                                                                           | Action | Files Modified                                                                                                                                                                                                                                                                                                                                                                                                          | Agent | Human |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------ | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ----- |
| 2026-06-13 | Phase 1–5 (backfill)                                                                                                           | Coded  | docs/specs/400-dx-tooling/spec.md, docs/specs/400-dx-tooling/design.md, docs/specs/400-dx-tooling/tasks.md                                                                                                                                                                                                                                                                                                              | [x]   | [x]   |
| 2026-07-06 | Phase 9 — Standardization pass: hooks, lint-staged, commitlint, knip, markdownlint, editor+repo hygiene configs (FR-18..FR-29) | Coded  | .husky/pre-commit, .husky/commit-msg, .husky/pre-push, lint-staged.config.mjs, commitlint.config.cjs, knip.jsonc, .markdownlint-cli2.jsonc, package.json, .vscode/settings.json, .vscode/extensions.json, .nvmrc, .npmrc, .prettierrc.json, .prettierignore, .gitattributes, .gitleaks.toml, .tool-versions, docs/specs/400-dx-tooling/spec.md, docs/specs/400-dx-tooling/design.md, docs/specs/400-dx-tooling/tasks.md | [x]   | [ ]   |
