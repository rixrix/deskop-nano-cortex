---
afx: true
type: SPEC
status: Living
owner: "@richard-sentino"
version: "1.1"
created_at: "2026-06-10T11:54:35.000Z"
updated_at: "2026-07-06T05:32:09.000Z"
tags:
  ["dx", "tooling", "eslint", "prettier", "rustfmt", "clippy", "vitest", "playwright", "testing"]
---

# 400 DX Tooling — Spec

> Developer-experience tooling and test strategy for the polyglot monorepo.
> Owns lint, format, type-check, unit-test, and end-to-end configurations for both the
> TypeScript frontend and the Rust backend, plus the npm and cargo script surface that ties
> them together.

## References

- **Architecture overview**: [`../001-overview/spec.md`](../001-overview/spec.md) — traceability rules, routing index, glossary
- **Testing strategy summary**: [`../001-overview/design.md`](../001-overview/design.md) — `[DES-TEST]`
- **Backend USB MIDI tests (in-crate)**: [`../100-backend-midi-usb/spec.md`](../100-backend-midi-usb/spec.md) — `[NFR-5]`
- **CI/release zone (consumer of this zone's scripts)**: [`../500-ci-release/spec.md`](../500-ci-release/spec.md)
- **ESLint flat config docs**: <https://eslint.org/docs/latest/use/configure/configuration-files>
- **typescript-eslint**: <https://typescript-eslint.io/>
- **Prettier**: <https://prettier.io/docs/en/options>
- **rustfmt**: <https://rust-lang.github.io/rustfmt/>
- **Clippy**: <https://doc.rust-lang.org/clippy/>
- **Vitest**: <https://vitest.dev/config/>
- **Playwright**: <https://playwright.dev/docs/test-configuration>
- **@testing-library/react**: <https://testing-library.com/docs/react-testing-library/intro/>

---

## Problem Statement

A polyglot monorepo (Rust + TypeScript) needs a single consistent DX surface so that any
contributor — or an AI coding agent — can run lint, format, type-check, and test without
knowing the internal layout of either sub-project. Each language needs its own formatter and
linter configured to the same line-length target (`100`); a shared `.editorconfig` enforces
baseline whitespace conventions across all file types.

The test strategy has two complementary layers:

1. **Vitest unit tests** — fast, in-process, jsdom-backed React component and hook tests
   with `@testing-library` matchers, run without MIDI hardware or a Tauri runtime.
2. **Playwright E2E tests** — headless Chromium driving the React app against the Vite dev
   server with the Tauri IPC layer mocked in the browser, because Playwright cannot drive the
   native Tauri WebView or the Rust backend.

Rust unit tests live in-crate (`#[cfg(test)]` modules) and are run via `cargo test`.
Hardware-dependent paths (USB MIDI, BLE) are manually verified against a real Nano Cortex
following a documented smoke matrix (owned by zone `500-ci-release`).

---

## Requirements

### Functional Requirements

| ID    | Requirement                                                                                                                                                                                                                                                                                                                                                                                                                                  | Priority    |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| FR-1  | ESLint flat config (`eslint.config.js`) covers all `src/**/*.{ts,tsx}` files with `@eslint/js` recommended, `typescript-eslint` recommended, `react-hooks/rules-of-hooks` (error), `react-hooks/exhaustive-deps` (warn), and `react-refresh/only-export-components` (warn).                                                                                                                                                                  | Must Have   |
| FR-2  | `eslint-config-prettier` is applied last in the ESLint config to disable all format-conflicting rules.                                                                                                                                                                                                                                                                                                                                       | Must Have   |
| FR-3  | Node-context globals (`globals.node`) are applied to `*.config.{ts,js}` and `e2e/**/*.ts` files so tooling configs and E2E specs pass the linter without manual `globals` declarations.                                                                                                                                                                                                                                                      | Must Have   |
| FR-4  | Unit-test files (`src/**/*.{test,spec}.{ts,tsx}`, `src/test/**/*.{ts,tsx}`) receive both `globals.browser` and `globals.node` so Vitest globals and DOM APIs coexist without lint errors.                                                                                                                                                                                                                                                    | Must Have   |
| FR-5  | Prettier is configured with `printWidth: 100`, `tabWidth: 2`, `semi: true`, `singleQuote: false`, `trailingComma: "all"`. Ignored paths: `dist`, `coverage`, `node_modules`, `playwright-report`, `test-results`, `package-lock.json`.                                                                                                                                                                                                       | Must Have   |
| FR-6  | `rustfmt.toml` configures `edition = "2021"`, `max_width = 100`, `newline_style = "Unix"`, `use_field_init_shorthand = true`, `use_try_shorthand = true`.                                                                                                                                                                                                                                                                                    | Must Have   |
| FR-7  | Clippy runs via `npm run lint:rust` as `cargo clippy --manifest-path backend/Cargo.toml --features ble --all-targets -- -D warnings`. No `[lints]` section exists in `Cargo.toml`; `-D warnings` is enforced purely at the CLI invocation level.                                                                                                                                                                                             | Must Have   |
| FR-8  | `.editorconfig` applies UTF-8, LF line endings, final newline, and trailing whitespace trim globally; space/2 indent for `{ts,tsx,js,jsx,json,css,html,yml,yaml,md}`; space/4 indent and `max_line_length = 100` for `*.rs`; no trailing whitespace trim for `*.md`; tab indent for `Makefile`.                                                                                                                                              | Must Have   |
| FR-9  | Vitest runs with `environment: "jsdom"`, `globals: true`, `setupFiles: ["./src/test/setup.ts"]`, `include: ["src/**/*.{test,spec}.{ts,tsx}"]`, `css: false`, and v8 coverage reporting (`text` + `html`). The Vite app config and Tailwind plugin must not load during tests.                                                                                                                                                                | Must Have   |
| FR-10 | `src/test/setup.ts` imports `@testing-library/jest-dom/vitest` for extended matchers and registers an `afterEach(() => cleanup())` to unmount React trees between tests.                                                                                                                                                                                                                                                                     | Must Have   |
| FR-11 | Playwright drives headless Chromium against `http://localhost:1420` (the Vite dev server). `webServer` spawns `npm run dev` before the suite and reuses an existing server when not in CI. Test files live under `./e2e`.                                                                                                                                                                                                                    | Must Have   |
| FR-12 | The Tauri IPC layer is mocked in the browser during E2E runs via `window.__TAURI_INTERNALS__` stubbing (see `e2e/fixtures/tauri-mock.ts`). This is the only viable approach because Playwright drives Chromium, not the native Tauri WebView.                                                                                                                                                                                                | Must Have   |
| FR-13 | Root `package.json` exposes a unified script surface: `lint` (ESLint + Clippy), `lint:rust` (Clippy only), `format` (Prettier + `cargo fmt`), `format:rust` (`cargo fmt` only), `format:check` (Prettier check + `cargo fmt --check`), `typecheck` (frontend `tsc --noEmit`), `test` (Vitest + `cargo test`), `test:rust` (`cargo test`), `e2e` (Playwright).                                                                                | Must Have   |
| FR-14 | Frontend `package.json` exposes per-tool scripts: `lint`, `lint:fix`, `format`, `format:check`, `typecheck`, `test`, `test:watch`, `test:coverage`, `e2e`, `e2e:ui`.                                                                                                                                                                                                                                                                         | Must Have   |
| FR-15 | Vitest unit tests for frontend logic (hooks, services, components) are authored under `src/**/*.{test,spec}.{ts,tsx}` using `@testing-library/react` and Vitest globals.                                                                                                                                                                                                                                                                     | Planned     |
| FR-16 | Rust unit tests beyond `port_manager.rs` are authored as `#[cfg(test)]` modules inside their respective source files and run under `cargo test --features ble`.                                                                                                                                                                                                                                                                              | Planned     |
| FR-17 | Playwright E2E specs live under `frontend/e2e/` and use the Tauri IPC mock fixture; each spec file documents which IPC commands/events it stubs.                                                                                                                                                                                                                                                                                             | Planned     |
| FR-18 | Husky v9 git hooks: `pre-commit` (branch-name advisory — commits on `main` are allowed per solo-dev policy, non-`main`/`<type>/<desc>` names warn without blocking; then an optional advisory gitleaks staged scan — warns on findings, never blocks, skips when gitleaks is absent; then lint-staged), `commit-msg` (commitlint), `pre-push` (`npm run verify`). Installed via root `"prepare": "husky"`.                                   | Must Have   |
| FR-19 | lint-staged config (`lint-staged.config.mjs` at root) formats/lints staged files across both packages: frontend TS/TSX via prettier then ESLint executed with cwd=`frontend/` (`npm --prefix frontend run lint:staged`), root/docs JSON/YAML/JS via prettier, markdown via prettier then markdownlint-cli2 --fix, `backend/**/*.rs` via `rustfmt --edition 2021`.                                                                            | Must Have   |
| FR-20 | commitlint (`commitlint.config.cjs`): `@commitlint/config-conventional` + required scope from a hand-listed enum (`overview, midi-usb, ble, ipc, platform, frontend, dx, ci, release, governance, deps, docs, repo, scripts, spec, security`) + header max length 100.                                                                                                                                                                       | Must Have   |
| FR-21 | knip (`knip.jsonc` at root) analyzes the root `scripts/*.mjs` workspace and the `frontend` workspace (entries: index.html, src/app/main.tsx, test/spec globs, e2e specs, config files) for dead code and unused dependencies; intentional config-only deps are pre-ignored. Exposed as root script `knip`.                                                                                                                                   | Must Have   |
| FR-22 | markdownlint-cli2 (`.markdownlint-cli2.jsonc` at root): default rules with MD013/MD033/MD040/MD041 disabled, globs `*.md docs/**/*.md .github/**/*.md`, ignores for archive/.afx/node_modules. Exposed as root scripts `lint:md` (check) and `format:md` (prettier --write + markdownlint --fix).                                                                                                                                            | Must Have   |
| FR-23 | Root aggregate scripts: `check` (format:check + lint + typecheck + knip + lint:md, no mutation), `fix` (format + format:md + lint:fix), `verify` (check + test; the fast pre-push gate), `verify:full` (check + coverage + Rust tests + e2e + frontend build + dependency/license checks + version:check). New root devDependencies (husky, lint-staged, commitlint, knip, markdownlint-cli2, prettier) and `engines` (node >=20, npm >=10). | Must Have   |
| FR-24 | `.vscode/settings.json` (format-on-save, Prettier default formatter, ESLint flat-config with `eslint.workingDirectories` pointing at `frontend`, markdownlint fix-on-save, rust-analyzer as Rust formatter) and `.vscode/extensions.json` recommendations (ESLint, Prettier, markdownlint, Tailwind CSS, plus existing rust-analyzer/lldb).                                                                                                  | Must Have   |
| FR-25 | Node/tooling version pinning: `.nvmrc` (20) and `.npmrc` (`engine-strict=true`, `enable-pre-post-scripts=true`).                                                                                                                                                                                                                                                                                                                             | Should Have |
| FR-26 | Root `.prettierrc.json` mirroring the frontend options (printWidth 100, tabWidth 2, semi, double quotes, trailing commas) plus a root `.prettierignore` scoped so frontend files are NOT excluded (lint-staged runs prettier from root on them).                                                                                                                                                                                             | Must Have   |
| FR-27 | `.gitattributes`: `* text=auto eol=lf`, binary markers for image/bundle assets, `linguist-generated` for lockfiles and `backend/gen/**`.                                                                                                                                                                                                                                                                                                     | Should Have |
| FR-28 | `.gitleaks.toml` secret-scan config (default ruleset extension with allowlist for BLE/USB capture output paths) + root script `scan:secrets` (`gitleaks detect`); secret scanning is advisory everywhere — the pre-commit staged scan warns without blocking (skips when gitleaks is absent) and the scheduled CI scan is non-blocking.                                                                                                      | Should Have |
| FR-29 | `.tool-versions` pinning nodejs 20 and rust 1.90.0 for asdf/mise users, consistent with `.nvmrc` and `backend/rust-toolchain.toml`.                                                                                                                                                                                                                                                                                                          | Could Have  |

### Non-Functional Requirements

| ID    | Requirement                                                                                                                                       | Target                  |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| NFR-1 | `npm run lint` exits zero on a clean tree; violations are errors or warnings per the config, never silenced globally.                             | CI-enforced             |
| NFR-2 | `npm run format:check` exits zero on a clean tree; used in CI to assert no unformatted files.                                                     | CI-enforced             |
| NFR-3 | `npm run test` completes without MIDI hardware; all hardware-dependent paths must be gated by manual-only acceptance criteria.                    | Architectural invariant |
| NFR-4 | Vitest unit tests must not import `@tauri-apps/api` directly; Tauri calls go through wrapper modules that can be mocked without patching globals. | Code convention         |
| NFR-5 | Playwright E2E runs are single-browser (Chromium only) and do not require the Tauri binary or Rust build artifacts.                               | Architectural invariant |
| NFR-6 | All config files carry a top-level `@see` doc-comment linking to this zone.                                                                       | Traceability convention |

---

## Acceptance Criteria

- [x] `npm run lint` (from root) runs ESLint across `frontend/src/**` and Clippy across the backend and exits zero on a clean tree.
- [x] `npm run format:check` (from root) checks Prettier formatting on the frontend and `cargo fmt --check` on the backend.
- [x] `npm run typecheck` (from root) runs `tsc --noEmit` with no type errors on the current source.
- [x] `npm run test` (from root) runs Vitest and `cargo test --features ble` and both exit zero.
- [x] `npm run e2e` (from root) launches Playwright against the Vite dev server.
- [x] ESLint: `react-hooks/rules-of-hooks` is `"error"`, not `"warn"`.
- [x] ESLint: `eslint-config-prettier` is the last spread in the config array, disabling format-conflicting rules.
- [x] Prettier: `printWidth` is exactly `100`; `singleQuote` is `false`.
- [x] rustfmt: `max_width` is `100`; `edition` is `"2021"`.
- [x] `.editorconfig`: `indent_size = 4` for `*.rs`; `indent_size = 2` for `*.ts`/`*.tsx`.
- [x] Vitest: `environment` is `"jsdom"`; `globals` is `true`; setup file runs `cleanup()` after each test.
- [x] Playwright: `baseURL` is `http://localhost:1420`; only Chromium project; `webServer.command` is `npm run dev`.
- [ ] Vitest unit tests exist for at least `TauriMidiConnection` send helpers and the `useMidiConnection` hook (planned).
- [ ] Rust `#[cfg(test)]` modules exist in `connection.rs` and `listener.rs` (planned).
- [ ] At least one Playwright E2E spec exercises the preset grid with the Tauri IPC mock (planned).
- [ ] `pre-commit` allows commits on `main` (solo-dev policy) and warns on non-conforming branch names without blocking; `commit-msg` runs commitlint; `pre-push` runs `npm run verify` (FR-18).
- [ ] lint-staged routes staged frontend TS/TSX through Prettier + ESLint with cwd=`frontend/`, JSON/YAML/JS and markdown through Prettier (+ markdownlint `--fix` for markdown), and `backend/**/*.rs` through `rustfmt --edition 2021` (FR-19).
- [ ] commitlint rejects a commit message without a conventional type, without an enum-listed scope, or with a header over 100 characters (FR-20).
- [ ] `npm run knip` analyzes the root `scripts/*.mjs` and `frontend` workspaces and exits zero on a clean tree (FR-21).
- [ ] `npm run lint:md` exits zero on a clean tree with MD013/MD033/MD040/MD041 disabled; `npm run format:md` applies Prettier then markdownlint fixes (FR-22).
- [ ] Root `check` / `fix` / `verify` / `verify:full` aggregate scripts exist; `check` performs no mutation; root `engines` requires node >=20 and npm >=10 (FR-23).
- [ ] `.vscode/settings.json` enables format-on-save with Prettier, sets `eslint.workingDirectories` to `frontend`, and assigns rust-analyzer as the Rust formatter; `.vscode/extensions.json` recommends the matching extensions (FR-24).
- [ ] `.nvmrc` pins Node `20`; `.npmrc` sets `engine-strict=true` and `enable-pre-post-scripts=true` (FR-25).
- [ ] Root `.prettierrc.json` mirrors the frontend Prettier options; the root `.prettierignore` does not exclude frontend files (FR-26).
- [ ] `.gitattributes` sets `* text=auto eol=lf`, marks binary assets, and flags lockfiles plus `backend/gen/**` as `linguist-generated` (FR-27).
- [ ] `npm run scan:secrets` runs `gitleaks detect` with `.gitleaks.toml`; the pre-commit staged scan is advisory (warns, never blocks) and skips when gitleaks is not installed (FR-28).
- [ ] `.tool-versions` pins `nodejs 20` and `rust 1.90.0`, consistent with `.nvmrc` and `backend/rust-toolchain.toml` (FR-29).

---

## Non-Goals

- Running tests inside the native Tauri WebView (not possible with Playwright; use Vitest + IPC mocks instead).
- Cross-browser E2E (Chromium only; the production Tauri WebView uses WebKit on macOS — hardware smoke covers that).
- Hardware-in-the-loop automated MIDI testing (manual smoke matrix, owned by `500-ci-release`).
- Rust integration tests against a virtual MIDI loopback (deferred; would require IAC/snd-virmidi setup per platform).
- Lint or format rules for Python/Swift BLE analysis tools under `tools/` (zone `110-backend-midi-ble`).
- TypeScript strict-mode changes (already enabled in `tsconfig.json`; not a DX tooling concern).

---

## Dependencies

- **ESLint**: `eslint ^10.5.0`, `@eslint/js ^10.0.1`, `typescript-eslint ^8.61.0`, `eslint-plugin-react-hooks ^7.1.1`, `eslint-plugin-react-refresh ^0.5.2`, `eslint-config-prettier ^10.1.8`, `globals ^17.6.0`.
- **Prettier**: `prettier ^3.8.4`.
- **TypeScript**: `typescript ~5.9.3` (shared with the app build).
- **Vitest**: `vitest ^4.1.8`, `jsdom ^29.1.1`, `@vitest/coverage-v8 ^4.1.8`.
- **Testing Library**: `@testing-library/react ^16.3.2`, `@testing-library/jest-dom ^6.9.1`, `@testing-library/dom ^10.4.1`, `@testing-library/user-event ^14.6.1`.
- **Playwright**: `@playwright/test ^1.60.0`.
- **Vite plugin**: `@vitejs/plugin-react ^4.4.1` (used in `vitest.config.ts`).
- **Root DX tooling (FR-23)**: `husky ^9.1.7`, `lint-staged ^17.0.8`, `@commitlint/cli ^21.2.0`, `@commitlint/config-conventional ^21.2.0`, `knip ^6.24.0`, `markdownlint-cli2 ^0.23.0`, `prettier ^3.9.4` (root install, distinct from the frontend copy).
- **Rust toolchain**: Rust 1.90.0 (pinned via `backend/rust-toolchain.toml`); `cargo fmt` and `cargo clippy` ship with the toolchain.
- **Consuming zones**: `500-ci-release` runs `npm run lint`, `npm run format:check`, `npm run test`, and `npm run e2e` as CI gates.

---

## Appendix

### Command Reference

| Script (root)          | Script (frontend)       | What it runs                                                                                               |
| ---------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------- |
| `npm run lint`         | —                       | `npm --prefix frontend run lint && npm run lint:rust` → ESLint on `frontend/src/**` + Clippy on `backend/` |
| `npm run lint:rust`    | —                       | `cargo clippy --manifest-path backend/Cargo.toml --features ble --all-targets -- -D warnings`              |
| —                      | `npm run lint`          | `eslint .` (inside `frontend/`)                                                                            |
| —                      | `npm run lint:fix`      | `eslint . --fix`                                                                                           |
| `npm run format`       | —                       | `npm --prefix frontend run format && npm run format:rust` → Prettier write + `cargo fmt`                   |
| `npm run format:rust`  | —                       | `cargo fmt --manifest-path backend/Cargo.toml`                                                             |
| `npm run format:check` | —                       | `npm --prefix frontend run format:check && cargo fmt --manifest-path backend/Cargo.toml --check`           |
| —                      | `npm run format`        | `prettier --write .`                                                                                       |
| —                      | `npm run format:check`  | `prettier --check .`                                                                                       |
| `npm run typecheck`    | —                       | `npm --prefix frontend run typecheck` → `tsc --noEmit`                                                     |
| —                      | `npm run typecheck`     | `tsc --noEmit`                                                                                             |
| `npm run test`         | —                       | `npm --prefix frontend run test && npm run test:rust` → Vitest run + `cargo test`                          |
| `npm run test:rust`    | —                       | `cargo test --manifest-path backend/Cargo.toml --features ble`                                             |
| —                      | `npm run test`          | `vitest run`                                                                                               |
| —                      | `npm run test:watch`    | `vitest` (watch mode)                                                                                      |
| —                      | `npm run test:coverage` | `vitest run --coverage`                                                                                    |
| `npm run e2e`          | —                       | `npm --prefix frontend run e2e` → `playwright test`                                                        |
| —                      | `npm run e2e`           | `playwright test`                                                                                          |
| —                      | `npm run e2e:ui`        | `playwright test --ui`                                                                                     |
| `npm run dev`          | —                       | `npm --prefix frontend run dev` → `vite` (Vite dev server on `:1420`)                                      |
| `npm run dev:tauri`    | —                       | `cd backend && node ../node_modules/.bin/tauri dev` (full Tauri dev with Rust hot-reload)                  |
| `npm run build`        | —                       | `npm --prefix frontend run build` → `tsc && vite build`                                                    |
| `npm run build:tauri`  | —                       | `cd backend && npx --yes @tauri-apps/cli build`                                                            |

### Agent Entry Map

| Owned file                                         | Local anchors               | Purpose                                                                                                                                                                 | Tests                              | Out of scope                |
| -------------------------------------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | --------------------------- |
| `frontend/eslint.config.js`                        | [FR-1] [FR-2] [FR-3] [FR-4] | ESLint flat config: JS/TS/React-hooks/react-refresh rules + prettier compat                                                                                             | verified by `npm run lint`         | Rust lint                   |
| `frontend/.prettierrc.json`                        | [FR-5]                      | Prettier options: printWidth 100, tabWidth 2, semi, double-quote, trailing-comma all                                                                                    | verified by `npm run format:check` | Rust format                 |
| `frontend/.prettierignore`                         | [FR-5]                      | Prettier exclusion list: dist, coverage, node_modules, playwright-report, test-results, package-lock.json                                                               | —                                  | —                           |
| `backend/rustfmt.toml`                             | [FR-6]                      | rustfmt: edition 2021, max_width 100, Unix newlines, field-init/try shorthand                                                                                           | verified by `npm run format:check` | TS format                   |
| `.editorconfig`                                    | [FR-8]                      | Cross-editor whitespace baseline: LF, UTF-8, final newline; 2-space TS, 4-space Rust                                                                                    | editor-enforced                    | runtime behavior            |
| `frontend/vitest.config.ts`                        | [FR-9]                      | Vitest runner: jsdom, globals, setup file, v8 coverage, no Tailwind/Tauri in test process                                                                               | `npm run test`                     | E2E, cargo test             |
| `frontend/src/test/setup.ts`                       | [FR-10]                     | Jest-DOM matchers + afterEach cleanup                                                                                                                                   | auto-loaded by Vitest              | —                           |
| `frontend/playwright.config.ts`                    | [FR-11] [FR-12]             | Playwright: Chromium, baseURL :1420, webServer npm run dev, CI retry/reporter config                                                                                    | `npm run e2e`                      | Tauri binary, Rust          |
| `frontend/tsconfig.json`                           | —                           | TypeScript strict mode (ES2020, bundler resolution, noEmit, all strict flags)                                                                                           | `npm run typecheck`                | runtime config              |
| `frontend/package.json` (scripts)                  | [FR-14]                     | Per-tool scripts: lint, format, typecheck, test, e2e and their sub-variants                                                                                             | —                                  | root orchestration          |
| `package.json` (root scripts)                      | [FR-13]                     | Root orchestration: unified lint/format/test/e2e across both sub-projects                                                                                               | —                                  | individual tool config      |
| `frontend/src/**/*.{test,spec}.{ts,tsx}`           | [FR-15]                     | Vitest unit tests (planned)                                                                                                                                             | `npm run test`                     | E2E                         |
| `backend/src/**/*.rs` (`#[cfg(test)]`)             | [FR-16]                     | Rust unit tests in-crate (partly done: port_manager; more planned)                                                                                                      | `npm run test:rust`                | hardware                    |
| `frontend/e2e/**/*.ts`                             | [FR-17]                     | Playwright E2E specs with Tauri IPC mock (planned)                                                                                                                      | `npm run e2e`                      | Tauri binary                |
| `.husky/{pre-commit,commit-msg,pre-push}`          | [FR-18]                     | Git hooks: branch-name advisory + optional gitleaks advisory scan + lint-staged; commitlint; `npm run verify` on push                                                   | exercised on every commit/push     | CI gates                    |
| `lint-staged.config.mjs`                           | [FR-19]                     | Staged-file routing: Prettier + ESLint (cwd=`frontend/`) for TS/TSX, Prettier for JSON/YAML/JS, Prettier + markdownlint for markdown, `rustfmt --edition 2021` for Rust | exercised by `pre-commit`          | full-tree lint/format       |
| `commitlint.config.cjs`                            | [FR-20]                     | Conventional commits + required scope enum + header max length 100                                                                                                      | exercised by `commit-msg`          | commit body content         |
| `knip.jsonc`                                       | [FR-21]                     | Dead-code/unused-dependency analysis: root `scripts/*.mjs` + `frontend` workspace map                                                                                   | `npm run knip`                     | Rust dead code              |
| `.markdownlint-cli2.jsonc`                         | [FR-22]                     | Markdown rules (MD013/MD033/MD040/MD041 off) + globs + ignores                                                                                                          | `npm run lint:md`                  | prose quality               |
| `package.json` (root aggregate scripts)            | [FR-23]                     | `check` / `fix` / `verify` / `verify:full` aggregates, new devDependencies, `engines`                                                                                   | `npm run verify`                   | individual tool config      |
| `.vscode/settings.json`, `.vscode/extensions.json` | [FR-24]                     | Format-on-save, ESLint working directories, per-language formatters, extension recommendations                                                                          | editor-enforced                    | CLI behavior                |
| `.nvmrc`, `.npmrc`                                 | [FR-25]                     | Node 20 pin; `engine-strict=true`, `enable-pre-post-scripts=true`                                                                                                       | enforced at `npm install`          | Rust toolchain pin          |
| `.prettierrc.json`, `.prettierignore` (root)       | [FR-26]                     | Root Prettier mirror of frontend options; ignore list keeps frontend files in scope for lint-staged                                                                     | exercised by lint-staged           | `frontend/.prettierrc.json` |
| `.gitattributes`                                   | [FR-27]                     | LF normalization, binary markers, `linguist-generated` for lockfiles + `backend/gen/**`                                                                                 | git-enforced                       | `.gitignore`                |
| `.gitleaks.toml`                                   | [FR-28]                     | Secret-scan ruleset extension + BLE/USB capture-path allowlist                                                                                                          | `npm run scan:secrets`             | dependency audit            |
| `.tool-versions`                                   | [FR-29]                     | asdf/mise pins: nodejs 20, rust 1.90.0                                                                                                                                  | —                                  | nvm-only users (`.nvmrc`)   |
