# Standardize desktop-nano-cortex coding & practices

> Cross-cutting execution plan spanning zones **400-dx-tooling**, **500-ci-release**, and
> **900-project-governance**. Saved for later execution — not yet implemented.

## Context

`desktop-nano-cortex` is a Tauri 2 desktop app (Rust `backend/` + React/TS `frontend/`) built
the AFX spec-driven way: every shipped surface is traced to a spec zone under `docs/specs/`, and
a traceability gate (`scripts/check-traceability.mjs`) enforces `@see` links. Today it already has
ESLint + Prettier (frontend), rustfmt + clippy, a CI workflow, a Tauri release workflow, and a
`justfile`. What's missing is the "professional repo" layer: dead-code/knip analysis, git hooks
(husky + commitlint + lint-staged + branch guard), markdown linting, editor config, the governance
docs (LICENSE/AGENTS/CONTRIBUTING/SECURITY/CHANGELOG/PRIVACY), funding, dependabot, and refined
per-OS build scripts.

The reference `afx-project/afx-vscode-v2` (same author) supplies the conventions to port — but it's
a **pnpm/turbo workspace monorepo**, whereas this repo is a **two-package npm repo** (root
`package.json` + `frontend/package.json`, each with its own lockfile; `backend/` is a Rust crate).
That difference drives most of the non-obvious wiring below.

Crucially, zone **900-project-governance** (`docs/specs/900-project-governance/spec.md`, status
`Planned`) already fully specifies LICENSE, AGENTS.md, CONTRIBUTING.md, SECURITY.md, CHANGELOG.md,
dependabot, the PR template, and `scripts/check-licenses.mjs`. So most "docs" work is
_implementing an existing spec_, not inventing one.

### Locked decisions

1. **Everything, spec-driven** — implement the new tooling **and** the planned zone-900 governance
   docs; extend specs 400/900 + `tasks.md` first so `@see` traceability resolves.
2. **Funding** — mirror the links already in `frontend/src/features/midi/components/AboutPanel.tsx`
   (`SUPPORT_LINKS`): GitHub Sponsors `AgenticFlowX`, Ko-fi `rixrix`, Buy Me a Coffee `rixrix`.
3. **Telemetry** — add `PRIVACY.md` in the reference's structure but **honest for this app**: zero
   telemetry / nothing collected (the in-app toggle is read-only "Off"); the _only_ outbound call
   is an optional once-per-session GitHub release update-check. Future telemetry stays explicit +
   opt-in (matches the AboutPanel "Telemetry posture" copy).
4. **Hooks: Full** — branch guard + commit-msg + pre-push (see Workstream B).
5. **Agent docs** — copy `CLAUDE.md` + `AGENTS.md` from the reference and adapt heavily to this
   repo (see Workstream C). AGENTS.md already exists as zone-900 FR-1; CLAUDE.md is new.
6. **Round-out items** — also add community-health files, repo hygiene, version-sync + release
   automation, and Rust supply-chain (Workstreams F/G). **Every new tool gets an npm script + a
   `just` recipe** (see the Command Surface table) so it's one command to run. Frontend lint
   enrichment + the Tauri auto-updater are **deferred** to their own later passes (Workstream H);
   a devcontainer is **explicitly skipped** (native BLE/MIDI can't pass through a container).

---

## Workstream A — Spec updates (do first; unblocks honest `@see`)

The traceability gate currently scans only `backend/src`, `frontend/src`, and `EXTRA_FILES`
(`backend/rustfmt.toml`, `.editorconfig`) — so new root configs are **not yet** gate-enforced. To
stay honest (not decorative), we add the FRs **and** extend the gate to cover the new configs.

- **`docs/specs/400-dx-tooling/spec.md`** — append FR rows + acceptance criteria + Agent Entry Map
  rows, and matching design anchors in `design.md`:
  - FR-18 husky hooks (`pre-commit`, `commit-msg`, `pre-push`) + root `prepare` → `[DES-DX-HOOKS]`
  - FR-19 lint-staged cross-package config → `[DES-DX-HOOKS]`
  - FR-20 commitlint conventional config + scope-enum → `[DES-DX-HOOKS]`
  - FR-21 knip config + `knip` script → `[DES-DX-KNIP]`
  - FR-22 markdownlint-cli2 config + `lint:md`/`format:md` → `[DES-DX-MARKDOWN]`
  - FR-23 root aggregate scripts (`check`, `fix`, `verify`, `verify:full`) + new root devDeps + `engines`
  - FR-24 `.vscode` settings + recommended extensions → `[DES-DX-EDITOR]`
  - FR-25 Node pinning (`.nvmrc`, `.npmrc`) → `[DES-DX-NODE]`
  - FR-26 root `.prettierrc.json` (+ `.prettierignore`) — or extend existing FR-5
  - FR-27 `.gitattributes` (EOL normalization + `linguist-generated`) → `[DES-DX-REPO]`
  - FR-28 `.gitleaks.toml` + `scan:secrets` script (pairs with the pre-commit hook) → `[DES-DX-HOOKS]`
  - FR-29 unified toolchain pin (`.tool-versions`/`mise.toml`: Node + Rust + just) → `[DES-DX-NODE]`
- **`docs/specs/900-project-governance/spec.md`** — the LICENSE/AGENTS/CONTRIBUTING/SECURITY/
  CHANGELOG/dependabot/PR-template/license-check FRs already exist (FR-1…FR-13); flip zone status
  from `Planned` toward `Living` as files land. **Add three new FRs**: FUNDING.yml, PRIVACY.md
  (honest zero-telemetry statement + the update-check disclosure), and `CLAUDE.md` (agent entry
  that imports AGENTS.md). Keep AGENTS.md under the existing FR-1…FR-3. Also add community-health
  FRs: `CODE_OF_CONDUCT.md`, `.github/CODEOWNERS`, `.github/ISSUE_TEMPLATE/`, `SUPPORT.md`, README
  badges (Workstream F).
- **`docs/specs/400-*/tasks.md` and `900-*/tasks.md`** — add task rows for each deliverable
  (this repo tracks work in `tasks.md`; keep it in sync).
- **`scripts/check-traceability.mjs`** — extend `EXTRA_FILES` to include the new commentable configs
  (`knip.jsonc`, `.markdownlint.jsonc`, `lint-staged.config.mjs`, `commitlint.config.cjs`,
  `.npmrc`, `.vscode/settings.json`, `.vscode/extensions.json`) so NFR-6 is actually enforced.
  Do this **after** the FRs exist, else the gate goes red.
- **`docs/specs/500-ci-release/spec.md`** — add FRs for the version-sync script + `version:check`
  CI gate, Rust supply-chain (`deny.toml` + cargo-deny job), and (optional) release-please
  automation → new anchors `[DES-CI-VERSION]`, `[DES-CI-SUPPLY-CHAIN]` (Workstream G).

---

## Workstream B — DX tooling (zone 400)

All tooling installs at **root** (that's where `.git` lives). Contributors now run `npm install`
at root in addition to `frontend`. New root **devDependencies**: `husky ^9`, `lint-staged ^16`,
`@commitlint/cli ^19` + `@commitlint/config-conventional ^19`, `knip ^6`, `markdownlint-cli2 ^0.22`,
`prettier ^3.8.4` (needed at root for lint-staged on root/docs/json/yaml). Add
`"engines": { "node": ">=20", "npm": ">=10" }`, `"prepare": "husky || true"`.
**Pin-check each range against the registry at install time** — the reference lives in a
slightly-future version world.

**New/changed root `package.json` scripts** (keep existing `lint:*`/`format:*` naming, not the
reference's `check:*`):

- `knip` → `knip`
- `lint:md` → `markdownlint-cli2 "*.md" "docs/**/*.md" ".github/**/*.md"`
- `format:md` → prettier `--write` those globs then `markdownlint-cli2 --fix`
- `lint:fix` → `npm --prefix frontend run lint:fix` (root passthrough for `eslint . --fix`)
- **`check`** — the "is anything wrong?" utility, **check-only (no mutation, no tests)** →
  `format:check && lint && typecheck && knip && lint:md`. `lint` already bundles ESLint + clippy +
  the traceability gate.
- **`fix`** — **auto-resolve every mechanical issue in one command**, in dependency-safe order →
  `format && format:md && lint:fix` = prettier + `cargo fmt`, then `markdownlint-cli2 --fix`, then
  `eslint --fix`. Mirrors the reference's `fix`.
- `test:coverage` → `npm --prefix frontend run test:coverage` (root passthrough)
- **`verify`** → `check && test` (**fast** pre-push gate, ~seconds–minutes; **no e2e/build**).
  **Wire `knip` + `lint:md` into `check` only after a clean baseline pass** (see Risks).
- **`verify:full`** → the **full PR lifecycle** (what CI runs; minutes) →
  `check && test:coverage && test:rust && e2e && build && lint:deps && lint:deps:rust && version:check`.
  On top of the static `check` it adds: frontend unit **coverage**, **Rust tests**, **Playwright e2e**,
  the production **frontend build** (`tsc && vite build`), **JS + Rust supply-chain** checks, and the
  **version-drift** gate. The native Tauri bundle stays **out** (minutes-long, per-platform toolchain)
  — that lives in `build:tauri` / the release workflow; add a `verify:release` alias only if you want
  a local pre-tag bundle smoke.

**Two-tier surface** (mirror in AGENTS.md): `verify` = fast, run after every change; `verify:full` =
before merging / what CI enforces. CI's individual jobs are the decomposed equivalent of `verify:full`.

**The intended loop (document it in AGENTS.md/CLAUDE.md):** run **`npm run verify`** → if it fails on
mechanical issues, **`npm run fix`** → re-run **`npm run verify`**. `fix` deliberately does **not**
resolve TypeScript type errors, knip unused-exports, commitlint failures, or missing `@see` anchors —
those need real code/doc changes, not formatting.

**Config files (root):**

- **`knip.jsonc`** — single root config with a manual `workspaces` map: `"."` (entry
  `scripts/*.mjs`, ignore `@tauri-apps/cli`) and `"frontend"` (entries: `index.html`,
  `src/app/main.tsx`, test/spec globs, e2e, all `*.config.ts`, `eslint.config.js`; pre-ignore
  `@vitest/coverage-v8`, `@testing-library/*`, `@tailwindcss/vite`, `globals`). **Highest-risk
  item** — see Risks; fallback is per-package knip.
- **`lint-staged.config.mjs`** — per-path handlers. The crux: frontend TS/TSX must be linted with
  cwd = `frontend/` (ESLint flat config is discovered from cwd upward and its `files:` globs are
  base-path relative). So: add `"lint:staged": "eslint --fix --no-warn-ignored"` to
  `frontend/package.json`, and have lint-staged run `prettier --write <abs>` then
  `npm --prefix frontend run lint:staged -- <paths-relative-to-frontend>`. Root/backend JS + json/
  yaml → `prettier --write` only (no root ESLint config). Markdown → prettier then
  `markdownlint-cli2 --fix`. `backend/**/*.rs` → `rustfmt --edition 2021`. (Drop `.toml` from
  prettier globs — no `prettier-plugin-toml` installed.)
- **`commitlint.config.cjs`** — `extends: config-conventional`; rules `scope-empty:[2,never]`,
  `header-max-length:[2,always,100]`, and a hand-listed `scope-enum` derived from the spec zones +
  cross-cutting: `overview, midi-usb, ble, ipc, platform, frontend, dx, ci, release, governance,
deps, docs, repo, scripts, spec, security`.
- **`.markdownlint.jsonc`** — `{ default:true, MD013:false, MD033:false, MD040:false, MD041:false,
ignores:["node_modules","frontend/node_modules","**/dist","docs/specs/archive/**",".afx/**"] }`.
- **`.prettierrc.json`** (root mirror of frontend's) + optional `.prettierignore`.
- **`.nvmrc`** (`20`) + **`.npmrc`** (`engine-strict=true`, `enable-pre-post-scripts=true`).

**Husky hooks** (`.husky/`, v9 minimal form):

- **`pre-commit`** — branch guard (**block direct commits to `main`**; warn if branch isn't
  `<type>/<desc>`), then `gitleaks protect --staged` if installed (soft-fail), then
  `npx --no-install lint-staged`.
- **`commit-msg`** — `npx --no-install commitlint --edit "$1"`.
- **`pre-push`** — `npm run verify`.

**Editor config** (only `.vscode/extensions.json` + `settings.json` are git-tracked):

- extensions: append `dbaeumer.vscode-eslint`, `esbenp.prettier-vscode`,
  `DavidAnson.vscode-markdownlint`, `bradlc.vscode-tailwindcss` (keep rust-analyzer + lldb).
- settings: `formatOnSave`, prettier default formatter, `eslint.useFlatConfig` +
  `eslint.workingDirectories: [{directory:"frontend", changeProcessCWD:true}]`,
  `codeActionsOnSave` eslint+markdownlint, per-language formatters, rust-analyzer rustfmt edition.
  **Preserve the existing `workbench.colorCustomizations` block verbatim.**

**`justfile`** — update `install` to `npm ci` (root) + `npm ci --prefix frontend`; add `check`
(→ `npm run check`), `fix` (→ `npm run fix`), `verify` (→ `npm run verify`), `verify-full`
(→ `npm run verify:full`; `just` recipe names can't contain `:`), and `knip` recipes.

---

## Workstream C — Governance docs (zone 900)

Implement the zone-900 owned-files table, plus funding + privacy. Reuse the URLs/handles already in
`frontend/src/features/midi/components/AboutPanel.tsx` so nothing drifts (note the repo slug in code
is `rixrix/deskop-nano-cortex` — **verify the "deskop" spelling is the real repo name** before
hard-coding it in dependabot/CODEOWNERS/links; don't silently "fix" it).

- **`LICENSE`** — Apache-2.0, `Copyright 2026 Desktop Nano Cortex Contributors`. Add
  `"license": "Apache-2.0"` to root + `frontend/package.json`, and `license = "Apache-2.0"` to
  `backend/Cargo.toml`.
- **`AGENTS.md`** — **copy the reference's structure, adapt every project-specific section** (per
  FR-1…FR-3). Keep the section skeleton: Project identity · Current stack · Commands · Verification ·
  Commit log conventions · Layout rules · Architecture boundaries · Coding rules · Communication
  rules · AFX documentation conventions · Spec Map. Rewrite the content for this repo:
  - identity = Tauri 2 desktop app, **npm two-package** (root + `frontend/`) + Rust `backend/` crate
    — **not** pnpm/turbo; stack = React 19 / Vite 7 / Tailwind 4 frontend, Rust / Tauri 2 / `midir`
    / `btleplug`-behind-`ble`-feature backend.
  - **Product truth block (the honest-state guard, unique to this repo — most important edit):**
    documented MIDI is authoritative, BLE state is provisional/experimental, and fake full-editor /
    preset-sync / parameter-sync / authoritative-BLE claims are forbidden unless hardware-verified
    (lift the allowed/forbidden language lists straight from zone-900 "Truthfulness Guard").
  - commands = `npm install` (root) + `npm ci --prefix frontend`, `npm run dev` / `dev:tauri`,
    `npm run verify`, per-tool scripts, `just` recipes. Verification = the **`verify` → `fix` →
    `verify` loop** after every change, **`verify:full`** before merging (two-tier, document both),
    plus **manual hardware smoke** when MIDI/BLE behavior changes (link `docs/runbooks/hardware-smoke.md`).
  - commit conventions = Conventional Commits + the required scope-enum from Workstream B + the AFX
    Why/Changed/Spec/Verification body shape (seed a root `.gitmessage` too).
  - architecture boundaries = frontend never imports `@tauri-apps/api` directly in unit tests
    (NFR-4; go through mockable wrappers); backend owns MIDI/BLE/IPC; treat `backend/gen/`,
    `backend/target/`, `frontend/dist` as generated artifacts.
  - **Spec Map = regenerate from the actual `docs/specs/` folders** (001-overview, 100-backend-midi-usb,
    110-backend-midi-ble, 120-backend-ipc, 130-backend-platform, 200-frontend-control-surface,
    210-*, 400-dx-tooling, 500-ci-release, 900-project-governance) — read the dirs at build time,
    don't copy the reference's VSCode zones.
  - **Drop** reference-only sections that don't apply: the `@afx/shared` structured-logger contract,
    the per-app/per-package VSCode boundaries, `packages/ui` Shadcn read-only rules.
  - The reference's `<!-- AFX-CODEX:START … -->` managed block is generated by the AFX CLI; seed it
    by hand for now but note it's normally tool-regenerated, and point its "source of truth" paths at
    this repo's `.claude/` / `.afx/`.
- **`CLAUDE.md`** — copy the reference shape: first line `@AGENTS.md` (import), a one-line
  verification pointer, then the `<!-- AFX:START … AFX:END -->` traceability/frontmatter/
  session-continuity block. **Adapt:** replace every `pnpm verify`/`pnpm fix` with `npm run verify` /
  `npm run fix` (the verify→fix→verify loop); drop the Shadcn mention in "Global vs Feature Context" (this app uses
  Tailwind, not Shadcn); keep the `@see`/frontmatter/timestamp conventions verbatim (they're
  project-agnostic and match this repo's existing spec frontmatter). Note the AFX-managed block is
  normally regenerated by the AFX CLI.
- **`CONTRIBUTING.md`** — setup (root + frontend install), Conventional-Commit + required-scope
  guidance, branch naming, traceability + hardware-verification expectations; link zones 400 + 900.
- **`SECURITY.md`** — report via GitHub Security Advisories; note BLE/reverse-engineering logs must
  not contain personal secrets (FR-11).
- **`CHANGELOG.md`** — Keep-a-Changelog seed with an `Unreleased` section (FR-12).
- **`PRIVACY.md`** — reference structure (Telemetry / Your Data / What We Don't Do / Contact),
  honest content: no telemetry/analytics; device MIDI/BLE data + logs stay local; the sole outbound
  call is an optional GitHub release update-check (no personal data, offline-safe); future telemetry
  explicit + opt-in.
- **`docs/runbooks/hardware-smoke.md`** + **`docs/runbooks/release-checklist.md`** — per FR-5/FR-6
  (manual Nano Cortex checks; version-sync → verify → smoke → tag → draft-release → unsigned caveats).
- **`.github/PULL_REQUEST_TEMPLATE.md`** — traceability + verification + hardware-smoke +
  truthfulness-guard checklist (FR-9).
- **`.github/FUNDING.yml`** — `github: [AgenticFlowX]`, `ko_fi: rixrix`, `buy_me_a_coffee: rixrix`.
- **`.github/dependabot.yml`** — npm at `/` and `/frontend`, cargo at `/backend`, github-actions at
  `/`; weekly, grouped minor+patch, `chore` commit prefix (FR-8).
- **`scripts/check-licenses.mjs`** — lightweight allowlist check over frontend deps + `npm audit
--omit=dev` wrapper; expose as a root script (FR-8). Rust side: note `cargo-audit`/`cargo-deny`
  as optional follow-up.

---

## Workstream D — CI/workflow triggers (zone 500)

**Solo-dev policy (decided):** quality + build workflows are **manual**; only **security** and
**dependency-freshness** run on their own; **releases are manual and platform-targeted**. `ci.yml` +
`release.yml` already exist — retrigger + extend rather than rewrite.

**Automatic (run on their own):**

- **`.github/dependabot.yml`** (Workstream C) — weekly grouped update PRs for npm (`/` + `/frontend`),
  cargo (`/backend`), and github-actions. Primary "outdated packages" mechanism.
- **`security.yml`** (new) — `schedule` (weekly cron) + `workflow_dispatch`. Jobs:
  - secret scan (gitleaks, full history),
  - `npm audit --omit=dev` (root + frontend) + `check-licenses.mjs` allowlist,
  - Rust advisories/licenses via `cargo-deny check` (or `cargo audit`),
  - `osv-scanner` over `frontend/package-lock.json` + `backend/Cargo.lock`,
  - **dependency-freshness report** — `npm outdated` + `cargo outdated` written to the run summary
    (the user explicitly wanted "outdated packages" automated, beyond Dependabot's PRs),
  - optional CodeQL (JS/TS) on the same schedule.

**Manual only (`workflow_dispatch`):**

- **`ci.yml`** — flip its trigger to `workflow_dispatch` (drop push/PR). Runs the quality surface:
  lint · typecheck · test · e2e · knip · lint:md · frontend build · `version:check`. Root job uses
  `npm ci` + `HUSKY: 0`; knip/lint:md start `continue-on-error: true` until baselines are clean.
  Fold `actionlint` in here (workflow-file lint), not as its own trigger.
  - **Tradeoff (accepted, solo dev):** pushes/PRs aren't gated automatically; the husky `pre-push`
    `verify` is the local safety net. The `pr-title` semantic-PR check is **dropped** — it only fires
    on PR triggers and the local `commit-msg` commitlint hook already enforces Conventional Commits.
- **`release.yml`** — manual + platform-targeted; see Workstream E.

---

## Workstream E — Build scripts (zone 500)

`backend/tauri.conf.json` keeps `bundle.targets: "all"` (owned by zone 130); refine per-invocation
via `--bundles` instead of editing shared config:

- `build:mac` → `... build --bundles dmg,app`
- `build:mac:universal` (new) → `... build --target universal-apple-darwin --bundles dmg,app`
  (requires `rustup target add aarch64-apple-darwin x86_64-apple-darwin`; output path changes).

### Release workflow — manual & platform-targeted

- Change `release.yml`'s trigger to **`workflow_dispatch` only** (drop the automatic `v*`-tag build).
  Inputs: `platform` (choice: `all | macos | windows | linux`) and `draft` (default `true`).
- A `setup` job maps `inputs.platform` → the build matrix (all three legs, or a single runner), then
  the build job runs `matrix: ${{ fromJSON(needs.setup.outputs.matrix) }}` with `tauri-action`
  (`projectPath: backend`), drafting the Release / uploading `.dmg`, `.msi` + `-setup.exe`, and
  `.deb` + `.AppImage` for the selected platform(s) only.
- Version bumps stay manual (`npm version <x.y.z>` syncs the 3 manifests), so a release is a
  deliberate two-step: bump + commit locally, then dispatch the platform you want.

### Windows — CI is the primary path; the borrowed machine is for runtime testing

The maintainer has no Windows machine yet (will borrow one). Design so shipping Windows installers
does **not** depend on that machine, and a local build is copy-paste once it's available.

- **Primary: GitHub Actions `windows-latest`.** `release.yml` already builds the Windows `.msi` +
  `-setup.exe` via `tauri-action` on a hosted Windows runner — **no local Windows needed to produce
  installers**. The manual, platform-targeted `release.yml` above lets you dispatch **just the
  `windows` leg on demand** (no `v*` tag) and download the drafted `.msi` + `-setup.exe`. The borrowed
  box is then only needed to **test runtime behavior** (BLE/MIDI/WebView2 on Windows) and optional
  local MSI builds.
- **Local build on the borrowed Windows machine** — scripts so it's one command:
  - `build:windows` → `cd backend && npx --yes @tauri-apps/cli build --bundles msi,nsis`
    (on a Windows host the target is implicit; keep `--target x86_64-pc-windows-msvc` explicit only
    when building a non-host arch).
  - `build:windows:nsis` / `build:windows:msi` → same with a single `--bundles` value.
  - optional `build:windows:arm` → `... build --target aarch64-pc-windows-msvc --bundles nsis`
    (Windows-on-ARM; NSIS only — WiX/MSI arm64 support is limited).
  - Backed by a new **`docs/runbooks/windows-build.md`** (Workstream C): Visual Studio Build Tools
    with **"Desktop development with C++"** (MSVC + Windows SDK), `rustup` (the
    `x86_64-pc-windows-msvc` target is default on Windows), Node 20, **WebView2 runtime**
    (preinstalled on Win11), `npm ci` in root + frontend, `npm run build:windows`; artifacts land in
    `backend/target/release/bundle/{msi,nsis}/`; note the **SmartScreen "More info → Run anyway"**
    caveat for the unsigned v1.0.0 installer.
- **Cross-compile from macOS/Linux — escape hatch only.** Tauri **cannot** cross-build the MSI (WiX
  v3 is Windows-only). The community `cargo-xwin` cross-toolchain (fetches the MSVC CRT/SDK) + Linux
  `makensis` can emit an **NSIS `-setup.exe` only, unsigned**, and lower-fidelity (WebView2/BLE edge
  cases). Add an optional clearly-labeled `build:windows:xwin` script, but treat CI as the real path.
- **Docker cross-compile — skip (decision recorded).** No reliable image emits a Windows MSI; the
  only route is Wine + NSIS (hacky, unsigned). Use `windows-latest` in Actions instead — same cost,
  real fidelity. Don't re-attempt.

---

## Workstream F — Community health & repo hygiene (zones 900 + 400)

Mostly static files, but everything runnable gets a script + `just` recipe.

- **`CODE_OF_CONDUCT.md`** — Contributor Covenant v2.1; contact `richard.sentino@gmail.com`
  (matches the reference).
- **`.github/CODEOWNERS`** — `* @rixrix` + `docs/specs/* @rixrix` (confirm the handle).
- **`.github/ISSUE_TEMPLATE/`** — `bug_report.yml`, `feature_request.yml`, `config.yml` (GitHub
  form schema). The bug form asks for OS, app version, tested firmware, and **whether the issue is
  documented-MIDI or provisional-BLE** — wiring the honest-state guard into triage.
- **`SUPPORT.md`** — where to get help (issues/discussions), links to the runbooks.
- **README badges + health-file links** — CI status, Apache-2.0, latest release, downloads.
- **`.gitattributes`** — `* text=auto eol=lf`; `*.{png,icns,ico,dmg,svg} binary`;
  `backend/gen/** linguist-generated`, `*-lock.json linguist-generated`, `Cargo.lock linguist-generated`.
  Prevents CRLF churn fighting the husky/prettier hooks across macOS + Windows.
- **`.gitleaks.toml`** — extend the default ruleset; allowlist BLE/USB capture paths (`logs/`,
  `tools/` analysis outputs) so reverse-engineering dumps don't false-positive. **Scripts:**
  - `scan:secrets` → `gitleaks detect --no-banner --redact` (full tree/history)
  - `just scan` → `npm run scan:secrets`
  - the `pre-commit` hook already does the staged-only `gitleaks protect --staged` (soft-skip if
    gitleaks isn't installed — `just setup` installs it).

## Workstream G — Release automation & supply-chain (zone 500)

One-command version bumps + dependency governance.

- **Version sync** — `scripts/sync-version.mjs`: single source of truth = **root `package.json`
  `version`** (add the field), propagated to `frontend/package.json`, `backend/Cargo.toml`
  (`package.version`), and `backend/tauri.conf.json` (`version`). Hook the npm `version` lifecycle so
  a normal `npm version <patch|minor|x.y.z>` bumps root **and** auto-syncs + stages the rest:
  - root scripts: `"version": "node scripts/sync-version.mjs && git add frontend/package.json backend/Cargo.toml backend/tauri.conf.json"`,
    plus `"version:sync": "node scripts/sync-version.mjs"` and `"version:check": "node scripts/sync-version.mjs --check"` (CI asserts the manifests agree).
  - `just version ver="":` → `npm version {{ver}}`.
  - CI gains a `version:check` step so a drifted manifest fails the PR.
- **Rust supply-chain** — `deny.toml` (cargo-deny: advisories + a license allowlist matching the JS
  one + banned/duplicate crates). **Scripts:**
  - `lint:deps:rust` → `cargo deny --manifest-path backend/Cargo.toml check`
  - `lint:deps` → `node scripts/check-licenses.mjs` (JS side, from zone-900 FR-8)
  - `just deny` → `npm run lint:deps:rust`
  - CI: one `supply-chain` job runs both, plus osv-scanner over `frontend/package-lock.json` +
    `backend/Cargo.lock` (folds into Workstream D).
- **Toolchain bootstrap** — `.tool-versions` (asdf/mise): `nodejs 20`, `rust 1.90.0`, `just`. Add a
  **`just setup`** recipe = `npm ci` (root) + `npm ci --prefix frontend`, then print the one-liner for
  optional native tools (`brew install gitleaks cargo-deny just`, or `cargo install cargo-deny`) —
  documented + copy-paste, not silently run.
- **Release automation (optional follow-up)** — release-please (`release-please-config.json` +
  manifest, `release-type: node`, `extra-files` = `backend/Cargo.toml` + `backend/tauri.conf.json`)
  so CHANGELOG + all-manifest bump come from Conventional Commits, and merging the release PR tags
  `v*` → the existing `release.yml`. Manual `npm version` + tag works today, so this is opt-in.

## Workstream H — Deferred / opt-in (separate later passes)

Tracked but **not** in the first landing:

- **Frontend lint enrichment** — add `eslint-plugin-jsx-a11y` (accessibility), import ordering
  (`@trivago/prettier-plugin-sort-imports` or eslint-plugin-import), optionally `unicorn`/`no-secrets`
  to the frontend flat config. **Its own `chore(dx)` pass** — it surfaces many auto-fixes at once;
  land `eslint --fix` + review, then tighten `--max-warnings 0`.
- **Tauri auto-updater (later)** — `tauri-plugin-updater` + `plugins.updater` +
  `createUpdaterArtifacts` + `TAURI_SIGNING_PRIVATE_KEY` (schema already stubbed in zone 500). Turns
  the About-page update-check into in-app install. Product decision, not standardization.
- **devcontainer — skip (decision recorded).** Native BLE/MIDI hardware passthrough doesn't work in
  containers and would imply a false "runs anywhere". Don't re-propose.

---

## Command Surface (the "easy way")

Every new capability is one command from root, with a `just` alias where it helps.

| Task                          | npm (root)                               | just                   | Notes                                                                         |
| ----------------------------- | ---------------------------------------- | ---------------------- | ----------------------------------------------------------------------------- |
| First-time setup              | `npm ci` + `npm ci --prefix frontend`    | `just setup`           | + prints optional native-tool installs                                        |
| Check everything (no changes) | `npm run check`                          | `just check`           | format:check + lint(+clippy+trace) + typecheck + knip + md                    |
| Fix everything (auto-resolve) | `npm run fix`                            | `just fix`             | prettier + rustfmt → markdownlint --fix → eslint --fix                        |
| Fast pre-push gate            | `npm run verify`                         | `just verify`          | `check` + test                                                                |
| Full PR lifecycle             | `npm run verify:full`                    | `just verify-full`     | `verify` + coverage + rust tests + e2e + build + supply-chain + version:check |
| Dead code / unused deps       | `npm run knip`                           | `just knip`            | run once before gating                                                        |
| Markdown lint                 | `npm run lint:md`                        | —                      | globs `*.md docs/** .github/**`                                               |
| Secret scan (full tree)       | `npm run scan:secrets`                   | `just scan`            | hook covers staged-only                                                       |
| JS license + audit            | `npm run lint:deps`                      | —                      | `check-licenses.mjs`                                                          |
| Rust advisories + licenses    | `npm run lint:deps:rust`                 | `just deny`            | cargo-deny                                                                    |
| Bump + sync version           | `npm version <x.y.z>`                    | `just version <x.y.z>` | writes all 3 manifests                                                        |
| Assert version in sync        | `npm run version:check`                  | —                      | CI gate                                                                       |
| Build locally (mac/win)       | `npm run build:mac` / `build:windows`    | `just build`           | dmg/app · msi/nsis (windows needs a Windows host)                             |
| Release (no local box)        | GitHub → Actions → `release.yml` → Run   | —                      | manual dispatch, pick `platform` = all/macos/windows/linux                    |
| Security + outdated           | auto (weekly) or dispatch `security.yml` | —                      | gitleaks · npm/cargo audit · osv · `npm/cargo outdated`                       |

---

## Landing order

1. Workstream A specs (FRs + DES anchors + tasks) — but **defer** the `check-traceability.mjs`
   `EXTRA_FILES` extension until the configs exist.
2. Workstream B config + scripts + root devDeps; `npm install` at root.
3. One-time cleanup: `npm run format:md`, run `knip` once, fold intentional cases into config, commit
   as a separate `chore(docs)/chore(repo)` change.
4. Extend `EXTRA_FILES`; wire `knip` + `lint:md` into `verify` + make CI jobs required.
5. Workstream C governance docs + license fields.
6. Workstream F community-health + hygiene (`.gitattributes`, `.gitleaks.toml` + `scan:secrets`).
7. Workstream G version-sync (`sync-version.mjs` + `npm version` hook), `deny.toml` + cargo-deny,
   `.tool-versions` + `just setup`; release-please is optional.
8. Workstream D/E — flip `ci.yml` + `release.yml` to `workflow_dispatch`, add `security.yml`
   (scheduled), platform-targeted release inputs, and the Windows scripts + runbook.
9. Workstream H deferred passes — frontend lint enrichment, then the updater — as their own commits.

---

## Risks & flagged uncertainties

- **knip non-workspace resolution (highest risk)** — a manual `workspaces` map _should_ handle the
  two-lockfile layout, but per-workspace `node_modules` resolution is unverified. Symptom: every
  frontend dep reported "unused". Fallback: split into root `knip.jsonc` (scripts only) +
  `frontend/knip.jsonc`, with root `knip` = `knip && npm --prefix frontend run knip`. **Run knip
  once before gating.**
- **ESLint flat-config cwd** — solved by running via `npm --prefix frontend run lint:staged` (cwd =
  frontend) rather than `eslint --config` from root.
- **markdownlint baseline** — 36 md files; expect MD024/MD029/MD007 hits in `docs/specs/**`. Scope
  globs + `ignores` (archive/.afx) + one-time `--fix` **before** gating so CI/pre-push don't go red.
- **rustfmt `--edition`** — pass `--edition 2021` explicitly; fallback is whole-crate
  `cargo fmt` if per-file rustfmt misbehaves.
- **Dependency ranges** — verify `knip`, `markdownlint-cli2`, commitlint majors against the registry.
- **Repo-slug typo** — `deskop-nano-cortex` appears in code; confirm the real GitHub repo name.

---

## Verification

- `npm install` (root) + `npm ci --prefix frontend` succeed; `.husky/` hooks installed.
- **Hooks**: attempt a commit on `main` → blocked; on `fix/x` with a non-conventional message →
  `commit-msg` rejects; with `fix(dx): …` → passes; staged `.ts`/`.md`/`.rs` get auto-fixed by
  `pre-commit`; `git push` runs `npm run verify` green.
- `npm run knip` → clean (or only intentionally-ignored). `npm run lint:md` → clean.
- `npm run check` (no mutation) and `npm run verify` exit 0 end-to-end; `npm run fix` on a dirty tree
  auto-resolves prettier/rustfmt/markdown/eslint issues and leaves `check` green. `npm run lint`
  (incl. `lint:trace`) still passes — the new configs' `@see` IDs resolve.
- `npm run verify:full` (= coverage + rust tests + e2e + frontend build + supply-chain +
  `version:check`) exits 0 — the same surface the manually-dispatched `ci.yml` runs.
- `npm run build:mac` produces `backend/target/release/bundle/{dmg,macos}/…`; `npm run start:mac`
  launches it. (`build:windows` verified only in CI / on a Windows host.)
- Governance: `LICENSE` present; `Apache-2.0` in all three manifests; FUNDING.yml renders the three
  sponsor buttons on the repo; dependabot config validates; PR template appears on new PRs.
- Agent docs: `AGENTS.md` + `CLAUDE.md` present; CLAUDE.md's `@AGENTS.md` import resolves; a fresh
  agent can act from AGENTS.md alone (product truth + spec map + `npm run verify` are all correct and
  contain no leftover pnpm/VSCode/Shadcn references); `npm run lint:md` passes on both.
- Workflows: manually dispatching `ci.yml` runs green; `security.yml` runs on schedule/dispatch and
  reports audit + `npm/cargo outdated`; dispatching `release.yml` with `platform=windows` builds
  **only** the Windows leg and drafts a release with `.msi` + `-setup.exe` (no local Windows needed).
- Community/hygiene: `CODE_OF_CONDUCT.md`, `CODEOWNERS`, `SUPPORT.md`, and the issue-template forms
  render on GitHub; `.gitattributes` normalizes EOL (no CRLF diff when a Windows contributor commits);
  `npm run scan:secrets` / `just scan` run clean.
- Release/supply-chain: `npm version 1.0.0` bumps root + all three manifests in one commit;
  `npm run version:check` fails if any manifest drifts; `npm run lint:deps` + `npm run lint:deps:rust`
  (`just deny`) pass; `just setup` bootstraps a fresh clone.
