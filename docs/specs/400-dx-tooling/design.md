---
afx: true
type: DESIGN
status: Living
owner: "@richard-sentino"
version: "1.1"
created_at: "2026-06-10T11:54:35.000Z"
updated_at: "2026-07-06T05:32:09.000Z"
tags:
  ["dx", "tooling", "eslint", "prettier", "rustfmt", "clippy", "vitest", "playwright", "testing"]
spec: spec.md
---

# 400 DX Tooling — Design

## [DES-DX-OVR] Overview

The DX tooling zone configures two independent language stacks — TypeScript (frontend) and
Rust (backend) — under a single root-level npm script surface. The central constraint is that
no tool from one stack bleeds into the other's config: `vitest.config.ts` does not load the
Tailwind plugin or the Tauri dev server; `rustfmt.toml` has no knowledge of the TypeScript
tree; Playwright runs against a Vite dev server with the Tauri runtime entirely absent.

The line-width target of **100 characters** is the single shared convention enforced
independently by Prettier (`printWidth: 100`), rustfmt (`max_width = 100`), and
`.editorconfig` (`max_line_length = 100` for `*.rs`). Beyond that, each tool is configured
for its own language idioms.

Flow map anchor from the overview: none (pure DX infrastructure; no runtime data flow).

---

## [DES-DX-LINT] Linting

### ESLint — `frontend/eslint.config.js`

Uses the ESLint v9 flat-config API (no `.eslintrc`). Config array evaluated left-to-right:

```
tseslint.config(
  { ignores: ["dist", "coverage", "node_modules", "playwright-report", "test-results"] }
  js.configs.recommended,                    // @eslint/js baseline
  ...tseslint.configs.recommended,           // typescript-eslint recommended (strict-ish)
  {                                          // src/**/*.{ts,tsx} — app + tests
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: { ecmaVersion: 2022, sourceType: "module", globals: browser },
    plugins: { "react-hooks", "react-refresh" },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  {                                          // tooling configs + e2e specs → Node globals
    files: ["*.config.{ts,js}", "e2e/**/*.ts"],
    languageOptions: { globals: node },
  },
  {                                          // unit tests → browser + node globals (Vitest globals)
    files: ["src/**/*.{test,spec}.{ts,tsx}", "src/test/**/*.{ts,tsx}"],
    languageOptions: { globals: { ...browser, ...node } },
  },
  prettier,                                  // must be last: disables format-conflicting rules
)
```

Key design choices:

- **`eslint-config-prettier` last**: any rule that overlaps with Prettier's formatting (indent,
  max-len, quote style, semicolons) is disabled so the two tools never conflict.
- **`rules-of-hooks` as error**: React hook call-order violations are a runtime bug class, not
  a style preference; treating them as errors blocks the PR rather than accumulating warnings.
- **`exhaustive-deps` as warn**: effect dependency omissions are often intentional (stable
  callbacks, refs) — warn to surface them but avoid blocking all work.
- **Separate `node` globals block for E2E**: `playwright.config.ts` and `e2e/**/*.ts` are
  Node-process files (test runner, fixtures). Without `globals.node` they would error on
  `process`, `__dirname`, etc.
- **Dual globals for test files**: Vitest exposes `describe`/`it`/`expect` as globals
  (matching Jest API), but tests also use DOM APIs (`document`, `window`). Both global sets
  are needed in the same file.

### Clippy — invoked via root `package.json`

Clippy has no project-level config file (no `[lints]` section in `Cargo.toml`, no
`.clippy.toml`). Enforcement is purely via the CLI invocation in `npm run lint:rust`:

```
cargo clippy --manifest-path backend/Cargo.toml --features ble --all-targets -- -D warnings
```

- `--features ble` — lints the feature-gated BLE code path; without this flag, the entire
  `btleplug` tree is invisible to Clippy.
- `--all-targets` — includes `[[bin]]` targets (`nano_usb_probe`, etc.) and test targets, not
  just the library.
- `-- -D warnings` — any Clippy warning is a hard error; the flag is forwarded to `rustc`.

This approach avoids committing a `clippy.toml` while still giving CI a zero-tolerance lint
gate.

---

## [DES-DX-FORMAT] Formatting

### Prettier — `frontend/.prettierrc.json`

```json
{
  "printWidth": 100,
  "tabWidth": 2,
  "semi": true,
  "singleQuote": false,
  "trailingComma": "all"
}
```

`trailingComma: "all"` includes trailing commas in function parameter lists (valid in ES2017+
and matches TypeScript `target: ES2020`). `singleQuote: false` keeps double-quotes consistent
with JSX attribute conventions and avoids mixed-quote noise in diffs.

Prettier-ignored paths (`frontend/.prettierignore`): `dist`, `coverage`, `node_modules`,
`playwright-report`, `test-results`, `package-lock.json`. These mirror the ESLint `ignores`
list so both tools skip the same generated/vendored outputs.

### rustfmt — `backend/rustfmt.toml`

```toml
edition = "2021"
max_width = 100
newline_style = "Unix"
use_field_init_shorthand = true
use_try_shorthand = true
```

- `max_width = 100` — matches `.editorconfig` `max_line_length` for `*.rs` and Prettier's
  `printWidth`, giving cross-language visual consistency.
- `newline_style = "Unix"` — LF everywhere; matches `.editorconfig` `end_of_line = lf`.
- `use_field_init_shorthand = true` — rewrites `Foo { x: x, y: y }` to `Foo { x, y }`.
- `use_try_shorthand = true` — rewrites `try!(expr)` to `expr?`.
- No `[lints]` section in `Cargo.toml` — see [DES-DX-LINT] Clippy.

### `.editorconfig` — repo root

Cross-editor baseline that prevents whitespace drift before any formatter runs:

| Pattern                                       | indent_style | indent_size | max_line_length | notes                                                              |
| --------------------------------------------- | ------------ | ----------- | --------------- | ------------------------------------------------------------------ |
| `*`                                           | —            | —           | —               | UTF-8, LF, final newline, trim trailing whitespace                 |
| `*.{ts,tsx,js,jsx,json,css,html,yml,yaml,md}` | space        | 2           | —               | —                                                                  |
| `*.rs`                                        | space        | 4           | 100             | matches rustfmt                                                    |
| `*.md`                                        | —            | —           | —               | trim_trailing_whitespace = false (Markdown line-break intentional) |
| `Makefile`                                    | tab          | —           | —               | required by make                                                   |

---

## [DES-DX-UNIT] Vitest Unit Tests

### Configuration — `frontend/vitest.config.ts`

```ts
defineConfig({
  plugins: [react()], // JSX transform only — NO Tailwind plugin, NO Tauri devServer
  test: {
    environment: "jsdom", // simulated browser DOM; no real browser process
    globals: true, // exposes describe/it/expect/vi/etc as globals (no imports needed)
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    css: false, // skip CSS parsing — faster, irrelevant to logic tests
    coverage: {
      provider: "v8", // native V8 coverage (no babel transform)
      reporter: ["text", "html"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.{test,spec}.{ts,tsx}", "src/test/**", "src/env.d.ts", "src/app/main.tsx"],
    },
  },
});
```

Key design choices:

- **Separate from `vite.config.ts`**: the app's Vite config loads the Tailwind v4 Vite plugin
  (`@tailwindcss/vite`) and the Tauri dev-server URL. Both would fail or cause noise in the
  jsdom test environment. A dedicated `vitest.config.ts` keeps tests hermetic.
- **`css: false`**: component tests assert behavior and DOM structure, not computed styles.
  Parsing Tailwind CSS in jsdom adds processing time with no benefit.
- **`globals: true`**: avoids `import { describe, it, expect } from "vitest"` in every test
  file. The `globals` block in `eslint.config.js` (`...globals.node`) ensures these names are
  recognized by ESLint in test files.
- **v8 coverage**: V8's built-in coverage instrumentation avoids the Babel transform required
  by Istanbul; compatible with Vite's native ESM transform.

### Setup — `frontend/src/test/setup.ts`

```ts
import "@testing-library/jest-dom/vitest"; // extends expect() with .toBeInTheDocument(), etc.
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup(); // unmount React trees between tests; prevents DOM leaks across test cases
});
```

The `cleanup()` call is required because Vitest does not call it automatically outside of
frameworks that integrate with `@testing-library/react` natively. Without it, a component
mounted in one test remains in the jsdom document for all subsequent tests, causing false
passes and hard-to-diagnose assertion failures.

### Test authoring convention (planned — [FR-15])

- Test files live adjacent to source (`src/features/midi/services/TauriMidiConnection.test.ts`)
  or in `src/test/` for shared utilities.
- Tauri IPC wrappers (`frontend/src/shared/ipc/commands.ts`) are mocked with `vi.mock(...)` at
  the module boundary; tests never call `@tauri-apps/api` directly.
- React components are mounted with `render()` from `@testing-library/react`; assertions use
  `screen.*` queries and `expect().toBeInTheDocument()` / `expect().toHaveTextContent()`.
- `@testing-library/user-event` is used for interaction simulation (`userEvent.click`,
  `userEvent.type`) rather than `fireEvent` for closer behavioral fidelity.

---

## [DES-DX-E2E] Playwright E2E

### Configuration — `frontend/playwright.config.ts`

```ts
defineConfig({
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
```

### Tauri IPC Mock Approach

**Problem**: Playwright drives a real Chromium browser process. The production app runs inside
the Tauri WebView (WKWebView on macOS, WebView2 on Windows), where `window.__TAURI_INTERNALS__`
is injected by the Tauri runtime and the `@tauri-apps/api` invoke calls travel over the
Tauri IPC bridge to the Rust backend. Playwright has no access to that bridge — it cannot
launch the Tauri binary, and even if it could, test isolation would require scripting the
Rust process.

**Solution**: E2E tests run the React app in Chromium against `npm run dev` (the Vite dev
server), not the Tauri-bundled WebView. Before any test code runs, a fixture stubs
`window.__TAURI_INTERNALS__` in the browser context:

```ts
// e2e/fixtures/tauri-mock.ts (planned)
await page.addInitScript(() => {
  window.__TAURI_INTERNALS__ = {
    invoke: async (cmd: string, _args?: unknown) => {
      // Return per-command mock payloads.
      switch (cmd) {
        case "list_ports":
          return [{ id: "usb:mock", name: "Nano Cortex Mock", direction: "out", kind: "usb" }];
        case "get_state":
          return "disconnected";
        default:
          return null;
      }
    },
    transformCallback: (cb: unknown) => cb,
    metadata: {},
  };
});
```

`@tauri-apps/api` reads `window.__TAURI_INTERNALS__.invoke` for all command calls, so the
stub is transparent to the application code — no source changes are needed to make the app
testable under Playwright.

**What E2E can test**: all rendering and interaction logic that does not depend on real MIDI
hardware — preset grid layout and click behavior, FX slot toggle state, connection UI
transitions, MIDI monitor rendering, log panel toggle, keyboard shortcut simulation.

**What E2E cannot test**: actual MIDI send/receive (no Rust backend), BLE scan/connect (no
btleplug), OS tray/shortcut behavior (native, outside WebView). Those paths are covered by
the manual hardware smoke matrix.

**Port 1420**: the Vite dev server listens on `:1420` (configured in `vite.config.ts`,
matching the Tauri default dev URL). Playwright's `baseURL` and `webServer.url` both reference
this port so the server health-check and navigation base are consistent.

---

## [DES-DX-RUST-TEST] Rust Unit Tests

Rust tests use the standard `#[cfg(test)]` in-crate pattern — no separate test crate, no
virtual MIDI loopback required for unit tests.

**Current state (as-built)**:

- `backend/src/infrastructure/midi/port_manager.rs` contains two `#[cfg(test)]` tests:
  - `test_is_nano_cortex`: asserts `MidiPort::is_nano_cortex()` returns `true` for
    `"Nano Cortex MIDI OUT"` and `false` for `"MIDI OUT (Port 1)"`.
  - `test_find_nano_cortex_port`: builds a `Vec<MidiPort>` with one Nano and one non-Nano
    port; asserts the correct port is returned.

Both tests run without MIDI hardware under `cargo test --features ble` because they only
construct `MidiPort` value objects and call pure functions.

**Planned (as-built when added — [FR-16])**:

- `connection.rs`: test `send_to_port` error paths (port not found, send failure) by
  constructing known-missing port names without a hardware device.
- `listener.rs`: test that `start_listener` returns `Err` for an unknown port name.
- `domain/midi_message.rs`: test `is_realtime`, `is_sysex`, `status_byte` edge cases.
- BLE modules (`ble_decoder.rs`, `ble_sync.rs`): test provisional decoder with known raw
  byte sequences; assert capability fields distinguish `confirmed` vs `inferred` vs
  `unverified`.

**Convention**: test modules are in-file (`mod tests { ... }`) so they share module-private
helpers and the associated source stays co-located. No `tests/` directory at the crate root
(that pattern is for integration tests requiring a running binary or hardware).

---

## [DES-DX-SCRIPTS] Script Architecture

The root `package.json` acts as a thin orchestration layer. Each script delegates to either
a prefixed `npm --prefix frontend run <script>` call or a `cargo` CLI call with an explicit
`--manifest-path`. This means:

- The root never installs packages into the backend; all frontend npm tooling is scoped to
  `frontend/node_modules`.
- `cargo` is always invoked from the repo root with `--manifest-path backend/Cargo.toml`,
  not from inside `backend/`. This keeps the working directory predictable for CI runners.
- `format` and `format:check` are composite scripts: they run both Prettier (frontend) and
  `cargo fmt` (backend). A contributor can run either the composite root script or the
  individual per-language scripts independently.
- `lint` is composite: ESLint (via `npm --prefix frontend run lint`) then Clippy (`npm run
lint:rust`). They are not parallelized at the shell level — Clippy runs second and its exit
  code is the composite exit code.
- `dev:tauri` and `build:tauri` are the full Tauri build paths; `dev` and `build` alone run
  only the Vite frontend (useful for UI development without needing the Rust toolchain).

---

## [DES-DX-HOOKS] Git Hooks

Husky v9 owns the git hook surface. Hooks are plain shell scripts under `.husky/`, installed
by the root `"prepare": "husky"` lifecycle script on `npm install` — no manual contributor
setup step.

**Commit flow** (`pre-commit` → `commit-msg`):

1. **Branch-name advisory** — commits on `main` are allowed (solo-dev policy); branch names not
   matching `main` or `<type>/<desc>` print a warning but never block.
2. **gitleaks staged scan (advisory)** — if the `gitleaks` binary is on `PATH`, the staged
   changes are scanned; findings print a warning and the commit continues. If it is absent, the
   step prints a skip notice. Never blocks (see [DES-DX-REPO]).
3. **lint-staged** — formats and lints only the staged files per `lint-staged.config.mjs`.
4. **commitlint** (`commit-msg`) — validates the message against the conventional-commit rules
   in `commitlint.config.cjs`.

**Push flow** (`pre-push`): `npm run verify` — the fast aggregate gate (`check` + `test`).
Anything slower (coverage, e2e, builds, license checks) stays in `verify:full` and CI.

**The cwd=`frontend/` trick for ESLint.** ESLint flat config is discovered by walking upward
from the process working directory, and the `files:` globs inside `eslint.config.js` are
resolved relative to the config file's base path. Running ESLint from the repo root against
`frontend/src/...` paths would defeat both mechanisms. lint-staged therefore delegates:

```
npm --prefix frontend run lint:staged -- <staged paths relative to frontend/>
```

so ESLint executes with cwd=`frontend/`, discovers `frontend/eslint.config.js` naturally, and
its `src/**` globs match the passed paths.

**rustfmt gets `--edition 2021` explicitly.** `cargo fmt` reads the edition from `Cargo.toml`,
but lint-staged invokes standalone `rustfmt` on individual staged files, and standalone
rustfmt does not reliably honor the `edition` key in `rustfmt.toml`. The CLI flag makes the
edition unconditional.

---

## [DES-DX-KNIP] Dead-Code Analysis (knip)

The repo is **not** an npm-workspaces monorepo — `frontend/` has its own `package.json` but no
root `workspaces` field declares it. knip's `workspaces` map is a knip-level concept that does
not require npm workspaces, so `knip.jsonc` declares the two package roots manually:

- `.` — the root package; entries are the orchestration scripts (`scripts/*.mjs`).
- `frontend` — the app; entries are `index.html`, `src/app/main.tsx`, the unit-test globs
  (`src/**/*.{test,spec}.{ts,tsx}`, `src/test/**`), the Playwright specs (`e2e/**`), and the
  tool config files (`vite.config.ts`, `vitest.config.ts`, `playwright.config.ts`,
  `eslint.config.js`).

Dependencies that exist only to be referenced from config files rather than imported from
source are pre-ignored via `ignoreDependencies`, so a clean tree reports zero findings and any
new finding is actionable.

**Fallback**: knip resolves each workspace's dependencies against its own `node_modules`, and
the two install trees here are fully independent. If the root-driven run ever mis-resolves
`frontend/node_modules`, the documented fallback is to split into per-package knip configs —
one run from the root, one from `frontend/` — and chain them in the root `knip` script.

---

## [DES-DX-MARKDOWN] Markdown Linting

`.markdownlint-cli2.jsonc` at the root is the single carrier for rules, globs, and ignores, so
`markdownlint-cli2` runs argument-free from root scripts and the lint-staged pipeline alike:

- **Rules**: defaults with `MD013` (line length — spec tables exceed any sane limit), `MD033`
  (inline HTML — occasional `<br>`/`<kbd>` in tables), `MD040` (fenced-code language — raw
  protocol byte dumps have none), and `MD041` (first line must be a heading — YAML frontmatter
  comes first) disabled.
- **Globs**: `*.md`, `docs/**/*.md`, `.github/**/*.md`.
- **Ignores**: archive trees, `.afx/`, `node_modules`.

**Ordering — prettier first, markdownlint last.** Both `format:md` and the lint-staged
markdown pipeline run `prettier --write` before `markdownlint-cli2 --fix`. Prettier normalizes
wrapping and table shape; markdownlint then applies its rule-level fixes on top, so wherever
the two disagree markdownlint's output wins and `lint:md` (check mode) is guaranteed to pass
on the result.

---

## [DES-DX-EDITOR] Editor Workspace

`.vscode/settings.json` makes the editor agree with the CLI tooling instead of fighting it:

- **Format-on-save with Prettier as default formatter** — the same tool/config pair that
  lint-staged runs, so a save never produces a diff that `format:check` would flag.
- **`eslint.workingDirectories: ["frontend"]`** — the ESLint extension has the same
  flat-config discovery constraint as the CLI (see [DES-DX-HOOKS]): it must treat `frontend/`
  as the project root or `eslint.config.js` and its `src/**` globs are never found.
- **Per-language formatter overrides** — rust-analyzer formats Rust (it shells out to rustfmt
  and honors `backend/rustfmt.toml`); markdownlint's fix-on-save code action applies markdown
  rule fixes after Prettier's formatting pass, mirroring the CLI ordering ([DES-DX-MARKDOWN]).
- **`workbench.colorCustomizations` preserved** — the pre-existing window-tinting block is
  kept verbatim; tooling settings are merged around it, never replacing the file wholesale.

`.vscode/extensions.json` recommends the matching extensions — ESLint, Prettier, markdownlint,
Tailwind CSS — alongside the pre-existing rust-analyzer and CodeLLDB recommendations, so a
fresh clone prompts for exactly the toolchain this zone configures.

---

## [DES-DX-NODE] Node & Toolchain Version Pinning

Four artifacts tell the same version story, each aimed at a different audience:

| Artifact                        | Audience        | Content                                              |
| ------------------------------- | --------------- | ---------------------------------------------------- |
| `.nvmrc`                        | nvm users       | `20`                                                 |
| `engines` (root `package.json`) | npm itself      | `node >=20`, `npm >=10`                              |
| `.npmrc`                        | npm behavior    | `engine-strict=true`, `enable-pre-post-scripts=true` |
| `.tool-versions`                | asdf/mise users | `nodejs 20`, `rust 1.90.0`                           |

`engine-strict=true` upgrades the `engines` field from an install-time warning to a hard
`npm install` failure, so an unsupported Node version fails immediately instead of with a
cryptic error later. `enable-pre-post-scripts=true` guarantees lifecycle scripts (notably
`prepare` → husky install) run under package managers that disable pre/post scripts by
default. `.tool-versions` duplicates the Node pin for asdf/mise users and adds the Rust pin
consistent with `backend/rust-toolchain.toml` — it is a convenience mirror, never the source
of truth.

---

## [DES-DX-REPO] Repo Hygiene (.gitattributes, gitleaks)

### Line-ending normalization — `.gitattributes`

`* text=auto eol=lf` makes LF the committed **and** checked-out line ending for all text
files. Development is macOS-first, but work occasionally happens on a borrowed Windows
machine; without the attributes file, that machine's `core.autocrlf` setting decides the
outcome per-clone. With it, normalization is repo-controlled: CRLF can never enter a commit,
and checkouts are LF everywhere — matching `.editorconfig` (`end_of_line = lf`) and rustfmt
(`newline_style = "Unix"`).

Binary markers on image/bundle assets exempt them from normalization and text diffing;
`linguist-generated` on lockfiles and `backend/gen/**` collapses them in GitHub PR diffs so
reviews focus on authored changes.

### Secret scanning — `.gitleaks.toml`

Advisory everywhere (solo-dev policy) — gitleaks informs, never blocks:

- **Local (advisory)**: the `pre-commit` hook scans only the staged changes, and only when
  the `gitleaks` binary is installed — findings print a warning and the commit continues; an
  absent binary means a printed skip. Contributors are never blocked.
- **CI (advisory report)**: the weekly `security.yml` full-history scan runs with
  `continue-on-error`, surfacing findings in the run without failing it (zone `500-ci-release`).
  `npm run scan:secrets` (`gitleaks detect`) is available for on-demand full-tree scans.

The config extends the default ruleset and allowlists the BLE/USB capture output paths, whose
hex dumps otherwise trip high-entropy rules with false positives.

---

## [DES-DX-DEC] Key Decisions

| Decision                              | Choice                                           | Rationale                                                                                                                                                                                                                                                       |
| ------------------------------------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ESLint flat config (v9 API)           | `tseslint.config(...)` array                     | Flat config is the current ESLint standard; no legacy `.eslintrc` cascade; explicit `files:` glob per config object avoids implicit inheritance surprises.                                                                                                      |
| `eslint-config-prettier` last         | Spread as last element                           | Any earlier position risks a later plugin re-enabling a rule that Prettier owns; last placement is the only safe position.                                                                                                                                      |
| `rules-of-hooks` as error             | `"error"`                                        | Hook call-order violations are a runtime bug; a warning accumulates silently. Treating them as errors surfaces the issue at lint time.                                                                                                                          |
| Separate `vitest.config.ts`           | Dedicated file, not merged into `vite.config.ts` | The app's Vite config loads `@tailwindcss/vite` which processes CSS; loading it in jsdom context causes errors and slows test startup. Clean separation is the explicit recommendation in Vitest docs.                                                          |
| `css: false` in Vitest                | Disabled                                         | Component tests assert behavior and DOM structure; CSS parsing in jsdom is slow and never produces actionable failures.                                                                                                                                         |
| `globals: true` in Vitest             | Enabled                                          | Matches Jest convention; avoids boilerplate imports in every test file; ESLint is informed via the `globals.node` block in the test-file config object.                                                                                                         |
| Playwright drives Vite dev server     | `npm run dev` as `webServer.command`             | The Tauri WebView is not accessible to Playwright. Running the React app in Chromium directly is the only viable automated E2E approach; the Tauri IPC stub makes it transparent to app code.                                                                   |
| `window.__TAURI_INTERNALS__` stub     | `page.addInitScript(...)` before page load       | The `@tauri-apps/api` package reads `__TAURI_INTERNALS__.invoke` before any user code runs; `addInitScript` guarantees the stub is present at the earliest evaluation point.                                                                                    |
| Clippy via CLI flag (`-D warnings`)   | No `Cargo.toml` `[lints]` section                | `[lints]` was introduced in Rust 1.73 and is respected by cargo but not forwarded to clippy in all toolchain versions. The CLI `-D warnings` flag is unconditionally honored and keeps the enforcement explicit in the script where it can be read at a glance. |
| `--features ble` on all Rust commands | Explicit in every `cargo` invocation             | The `ble` feature gates the entire `btleplug` code path; omitting it in lint or test runs produces a false-clean result on a large fraction of the backend.                                                                                                     |
| Unified root `package.json` scripts   | Composite delegation, not a task runner          | No Makefile, no Turborepo, no nx — the project is small enough that npm composite scripts are readable and sufficient. A single `npm run lint` from the repo root gives any contributor or CI job the full picture.                                             |
