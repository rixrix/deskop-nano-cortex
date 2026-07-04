---
afx: true
type: SPEC
status: Living
owner: "@richard-sentino"
version: "1.1"
created_at: "2026-06-10T11:54:35.000Z"
updated_at: "2026-07-06T05:32:48.000Z"
tags: ["ci", "release", "github-actions", "tauri", "bundle", "signing", "cross-platform"]
---

# 500 CI/Release — Spec

> Continuous integration and release pipeline for Desktop Nano Cortex. Under the solo-dev trigger
> policy (v1.1), quality/build CI is manual: `ci.yml` (frontend lint/typecheck/test/build + Rust
> fmt/clippy/test + Playwright E2E) runs on `workflow_dispatch` only, with the husky pre-push
> `verify` hook as the always-on local gate. Only security scanning and dependency freshness
> (`security.yml`) run unattended, on a weekly schedule. Releases are manual and platform-targeted:
> `release.yml` dispatches a chosen platform matrix and attaches artifacts to a drafted GitHub
> Release. Certificate-backed code signing is deferred to a later signed release; v1.0.0 ships
> unsigned with documented Gatekeeper and SmartScreen caveats. The workflow intentionally omits
> signing environment variables so empty secrets cannot trigger platform signing paths, while
> macOS uses ad-hoc signing in `tauri.conf.json` so the unsigned `.app` bundle still has a valid
> local seal. Windows and Linux artifacts are build-wired but remain untested previews until
> platform smoke evidence is recorded.

## References

- **Architecture overview**: [`../001-overview/spec.md`](../001-overview/spec.md) — traceability rules, routing index, glossary
- **DX tooling (lint/test configs)**: [`../400-dx-tooling/spec.md`](../400-dx-tooling/spec.md) — eslint/prettier/rustfmt/vitest/playwright config
- **Platform integration (bundle config)**: [`../130-backend-platform/spec.md`](../130-backend-platform/spec.md) — owns `tauri.conf.json` and `capabilities/`
- **Archived sprint brief** (Phase 5, FR-1, FR-11, FR-12, FR-14, NFR-5, DES-ROLLOUT, DES-SEC):
  [`../archive/01-deskop-nano-cortex.md`](../archive/01-deskop-nano-cortex.md) — superseded; mined for CI/release requirements
- **Tauri bundler docs**: <https://tauri.app/distribute/>
- **GitHub Actions docs**: <https://docs.github.com/en/actions>

---

## Problem Statement

Desktop Nano Cortex is a polyglot monorepo (Rust + React/TS) targeting macOS, Windows, and Linux.
Without a CI pipeline, regressions in either language surface only at manual build time. Without a
release workflow, producing cross-platform installers requires each maintainer to run a local build
matrix — error-prone, non-reproducible, and incompatible with a signed distribution goal.

This zone owns the automation that:

1. Validates the tree on demand (`workflow_dispatch`) with fast, CI-safe checks (no hardware, no
   secrets required). With a single maintainer, the husky pre-push `verify` hook is the always-on
   gate; CI is a manually dispatched second opinion, not a PR gate.
2. Produces installable artifacts for the selected platform(s) — `dmg`/`app`, `msi`/`exe`, and
   `deb`/`AppImage` — from a manual, platform-targeted dispatch and attaches them to a drafted
   GitHub Release.
3. Documents the code-signing secret schema so a later signed release can add signing deliberately
   after certificates exist.
4. Runs the only unattended automation — weekly security scanning and dependency-freshness
   reporting (`security.yml`) — because vulnerabilities, leaked secrets, and stale dependencies
   arrive on the calendar, not with commits.

---

## User Stories

### Primary Users

Maintainers and AI coding agents working in this repository.

### Stories

**As a** maintainer merging a PR to `main`
**I want** CI to run frontend and Rust checks automatically
**So that** I catch type errors, lint violations, test failures, and build breaks before they land.

**As a** maintainer cutting a release
**I want** a single `git tag v1.0.0 && git push --tags` to produce macOS, Windows, and Linux
installers attached to a GitHub Release draft
**So that** I don't have to build each platform manually.

**As a** user on macOS
**I want** to understand the Gatekeeper right-click-open workaround for the unsigned v1.0.0 binary
**So that** I can install and run the app without a Developer ID cert.

**As a** user on Windows
**I want** to understand the SmartScreen "More Info → Run Anyway" workaround for the unsigned v1.0.0 installer
**So that** I can install the app without an Authenticode cert.

---

## Requirements

### Functional Requirements

| ID    | Requirement                                                                                                                                                                                                                                                                                                                                                                 | Priority    |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| FR-1  | A `ci.yml` workflow runs on every PR (and push) to `main`, executing frontend lint, typecheck, test, and build plus `cargo fmt --check`, `cargo clippy`, and `cargo test`.                                                                                                                                                                                                  | Must Have   |
| FR-2  | The CI workflow runs Playwright E2E tests (`npm run e2e`) against the Vite dev server in headed-less mode.                                                                                                                                                                                                                                                                  | Should Have |
| FR-3  | A `release.yml` workflow triggers on tags matching `v*` and runs a build matrix across `macos-latest`, `windows-latest`, and `ubuntu-latest`.                                                                                                                                                                                                                               | Must Have   |
| FR-4  | Each matrix leg produces the platform's native Tauri bundle targets: `dmg` + `app` (macOS), `msi` + `nsis` (Windows), `deb` + `appimage` (Linux).                                                                                                                                                                                                                           | Must Have   |
| FR-5  | All platform artifacts are uploaded to GitHub Actions artifact storage and attached to a drafted GitHub Release via the Tauri action or `gh release upload`.                                                                                                                                                                                                                | Must Have   |
| FR-6  | The release draft is created automatically on tag push; a human manually publishes it after review.                                                                                                                                                                                                                                                                         | Should Have |
| FR-7  | CI does not require any signing secrets; it runs entirely with public dependencies and no credentials.                                                                                                                                                                                                                                                                      | Must Have   |
| FR-8  | The release docs specify the signing secret schema (see table below), but the v1.0.0 `release.yml` does not export certificate-signing env vars. Certificate signing is a later workflow change once certificates exist, preventing empty secrets from triggering keychain/import steps. macOS keeps Tauri ad-hoc signing enabled so unsigned `.app` bundles remain sealed. | Must Have   |
| FR-9  | All platform artifacts are built from the same tagged commit (`git describe --tags --exact-match`), ensuring reproducible builds.                                                                                                                                                                                                                                           | Must Have   |
| FR-10 | The CI workflow caches Rust build artifacts (`~/.cargo/registry`, `~/.cargo/git`, `target/`) and Node modules (`~/.npm`) to reduce run time.                                                                                                                                                                                                                                | Should Have |
| FR-11 | The release workflow pins the Rust toolchain to the version declared in `backend/rust-toolchain.toml`.                                                                                                                                                                                                                                                                      | Must Have   |
| FR-12 | Frontend CI steps use the Node version matching the devDependency range (`node: 20`).                                                                                                                                                                                                                                                                                       | Must Have   |
| FR-13 | Solo-dev trigger policy: `ci.yml` runs on `workflow_dispatch` only (no push/PR triggers); the husky pre-push `verify` hook is the local gate.                                                                                                                                                                                                                               | Must Have   |
| FR-14 | `release.yml` runs on `workflow_dispatch` only with a `platform` choice input (`all`/`macos`/`windows`/`linux`) and `draft` boolean input; a setup job derives the runner matrix from the input so a single platform can be built and drafted on demand. The automatic `v*` tag trigger is removed.                                                                         | Must Have   |
| FR-15 | A scheduled `security.yml` (weekly + manual dispatch) runs: gitleaks full-history scan (advisory, non-blocking), `npm audit --omit=dev` (root + frontend) plus the license allowlist script, `cargo deny check` against root `deny.toml`, osv-scanner over both lockfiles, and an outdated-dependencies report (`npm outdated` + `cargo outdated`) in the job summary.      | Must Have   |
| FR-16 | Version single-source: root `package.json` version drives `scripts/sync-version.mjs`, which syncs `frontend/package.json` (+ lockfile), `backend/Cargo.toml`, and `backend/tauri.conf.json`; the npm `version` lifecycle runs the sync automatically and `version:check` fails CI on drift.                                                                                 | Must Have   |
| FR-17 | Rust supply-chain governance via cargo-deny: root `deny.toml` (advisories + license allowlist), exposed as `lint:deps:rust` (soft-skips locally when cargo-deny is not installed; strict in `security.yml`).                                                                                                                                                                | Should Have |
| FR-18 | Windows build surface: `build:windows` / `build:windows:msi` / `build:windows:nsis` scripts for a Windows host, documented in `docs/runbooks/windows-build.md`; MSI cannot be cross-compiled from macOS/Linux, and the manual `release.yml` windows leg is the primary installer path until a Windows machine is available.                                                 | Must Have   |
| FR-19 | `release.yml` explicitly grants `permissions: contents: write` so `tauri-action` can create/update the draft GitHub Release and upload artifacts with `GITHUB_TOKEN`.                                                                                                                                                                                                       | Must Have   |
| FR-20 | After the selected platform build(s) finish, `release.yml` downloads the draft release assets, generates `SHA256SUMS-v<version>.txt` for those assets, and uploads the manifest back to the same GitHub Release draft.                                                                                                                                                      | Must Have   |

### Non-Functional Requirements

| ID    | Requirement                                                                                                                                                | Target                 |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| NFR-1 | CI wall-clock time (lint + typecheck + test + build, cached) stays under 10 minutes on a standard GitHub-hosted runner.                                    | Observed acceptable    |
| NFR-2 | Release matrix produces all artifacts from a single tag with no manual per-platform steps.                                                                 | Architecture invariant |
| NFR-3 | The GH Actions secret schema is documented in this spec so that adding signing later requires only adding secrets, not editing workflows.                  | Living-doc invariant   |
| NFR-4 | Tauri bundle targets (`dmg`, `msi`, `deb`, `appimage`) are configured in `backend/tauri.conf.json`; the workflow reads that config without duplicating it. | Single-source-of-truth |
| NFR-5 | All platform artifacts are reproducible from a single `git describe` tag. (Derived from archived NFR-5.)                                                   | CI-enforced            |

---

## Acceptance Criteria

- [ ] `ci.yml` runs on manual `workflow_dispatch` only (the original automatic PR/push trigger is superseded by FR-13) and executes: `npm --prefix frontend run lint`, `tsc --noEmit`, `vitest run`, `npm --prefix frontend run build`, `cargo fmt --check`, `cargo clippy -- -D warnings`, `cargo test`.
- [ ] `ci.yml` runs Playwright E2E (`npm --prefix frontend run e2e`) in CI (headless).
- [ ] `release.yml` runs on manual `workflow_dispatch` only (the original `refs/tags/v*` trigger is superseded by FR-14) and fans out to the runner(s) selected via the `platform` input.
- [ ] Each matrix leg produces the expected artifact files and uploads them to the GitHub Release draft.
- [ ] `release.yml` grants `contents: write` so `tauri-action` can create/update the draft release with `GITHUB_TOKEN`.
- [ ] Each release dispatch uploads a matching `SHA256SUMS-v<version>.txt` checksum manifest beside the installers.
- [ ] `release.yml` runs without any certificate-signing environment variables in v1.0.0 (unsigned artifacts); macOS ad-hoc bundle signing remains enabled.
- [ ] README documents the Gatekeeper and SmartScreen workarounds for unsigned v1.0.0 artifacts.
- [ ] Adding `APPLE_CERT_P12_BASE64` and related secrets (see table below) plus a signed-release workflow update enables macOS signing.
- [ ] Adding `WINDOWS_CERT_PFX_BASE64` and `WINDOWS_CERT_PASSWORD` plus a signed-release workflow update enables Windows signing.
- [ ] `cargo test` passes in CI without MIDI hardware (unit tests only; hardware-only tests remain in the manual smoke matrix).
- [ ] Pushing to `main` or opening a PR triggers no quality/build workflow; the husky pre-push `verify` hook is the local gate (FR-13).
- [ ] `ci.yml` includes a root job running knip and `lint:md` (both `continue-on-error` initially), `version:check`, and actionlint (FR-13).
- [ ] Dispatching `release.yml` with `platform: macos` (or `windows` / `linux`) builds and drafts only that platform; `platform: all` fans out to all three; `draft` defaults to `true` (FR-14).
- [ ] `security.yml` runs on the weekly schedule and on manual dispatch: gitleaks full-history scan (advisory, non-blocking), `npm audit --omit=dev` (root + frontend) plus `scripts/check-licenses.mjs`, `cargo deny check` against root `deny.toml`, osv-scanner over `frontend/package-lock.json` and `backend/Cargo.lock`, and an outdated-dependencies report in the run summary (FR-15).
- [ ] Bumping the root `package.json` version via `npm version` auto-syncs `frontend/package.json` (+ lockfile), `backend/Cargo.toml`, and `backend/tauri.conf.json`; `npm run version:check` fails on drift and runs in the `ci.yml` root job (FR-16).
- [ ] `npm run lint:deps:rust` runs `cargo deny check` when cargo-deny is installed and soft-skips otherwise; `security.yml` runs it strictly (FR-17).
- [ ] `npm run build:windows` (and the `:msi` / `:nsis` variants) produce installers on a Windows host per `docs/runbooks/windows-build.md`; until such a host is available, the manual `release.yml` windows leg is the primary installer path (FR-18).

---

## Non-Goals

- Package manager distribution (`brew tap`, `scoop`, `apt` repo) — post-1.0 roadmap.
- Auto-update workflow (`tauri-plugin-updater` channel setup) — post-1.0 roadmap.
- Hardware MIDI smoke tests in CI — MIDI hardware is not available on GitHub-hosted runners; hardware verification stays in the manual smoke matrix (see `400-dx-tooling`).
- Notarization stapling beyond the `notarytool submit --wait` step — stapling is handled by the Tauri macOS bundle flow.
- Windows Authenticode EV cert acquisition — a prerequisite for signing, not a CI workflow concern.

---

## Dependencies

- **GitHub Actions**: `actions/checkout`, `actions/setup-node`, `dtolnay/rust-toolchain`, `swatinem/rust-cache`, `tauri-apps/tauri-action` (or equivalent Tauri build action).
- **`backend/tauri.conf.json`**: defines `bundle.targets`, `productName`, `version`, and `identifier`; owned by zone `130-backend-platform` but consumed here for artifact naming and bundle configuration. See [DES-CI-BUNDLE].
- **`backend/entitlements.plist`**: macOS entitlements consumed during signing; see [DES-CI-SIGNING].
- **`backend/rust-toolchain.toml`**: pins the Rust toolchain for reproducible builds.
- **`frontend/package.json`**: `lint`, `typecheck`, `test`, `build`, `e2e` scripts are the canonical CI step commands.
- **`package.json`** (root): `lint:rust`, `test:rust`, `format:check` convenience wrappers; CI may call these or the underlying commands directly.
- **Zone `400-dx-tooling`**: ESLint, Prettier, Rustfmt, Vitest, and Playwright configs that CI exercises.

---

## GitHub Actions Secret Schema

These secrets are reserved for a later signed-release workflow. None are required for `ci.yml`.
In v1.0.0, `release.yml` intentionally does not export certificate-signing env vars so unsigned
builds cannot accidentally enter platform signing paths. macOS still uses Tauri ad-hoc signing
(`signingIdentity: "-"`) so the `.app` resource seal is valid. Adding these secrets later enables
the corresponding signing path after an explicit workflow update, without changing the application
code.

| Secret name                          | Required for       | Description                                                                 |
| ------------------------------------ | ------------------ | --------------------------------------------------------------------------- |
| `APPLE_CERT_P12_BASE64`              | macOS signing      | Base64-encoded Developer ID Application certificate + private key (`.p12`)  |
| `APPLE_CERT_PASSWORD`                | macOS signing      | Password for the `.p12` keychain export                                     |
| `APPLE_SIGNING_IDENTITY`             | macOS signing      | Certificate CN, e.g. `"Developer ID Application: Richard Sentino (TEAMID)"` |
| `APPLE_API_KEY_ID`                   | macOS notarization | App Store Connect API key ID (10-char alphanumeric)                         |
| `APPLE_API_ISSUER_ID`                | macOS notarization | App Store Connect issuer UUID                                               |
| `APPLE_API_KEY_P8`                   | macOS notarization | Base64-encoded `.p8` private key for `notarytool`                           |
| `WINDOWS_CERT_PFX_BASE64`            | Windows signing    | Base64-encoded Authenticode PFX certificate                                 |
| `WINDOWS_CERT_PASSWORD`              | Windows signing    | Password for the Authenticode PFX                                           |
| `TAURI_SIGNING_PRIVATE_KEY`          | Auto-update later  | Tauri updater private key for signing update bundles                        |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Auto-update later  | Password for the Tauri updater private key                                  |

> **v1.0.0 note**: All certificate-signing secrets are absent. Artifacts are unsigned. macOS `.app`
> bundles are ad-hoc signed for a valid local seal, but users must still right-click → Open to
> bypass Gatekeeper. Windows users must click "More info → Run anyway" to bypass SmartScreen. This
> is documented in the project README.

---

## Platform Artifact Matrix

| Platform runner  | Bundle targets    | Artifact file types   | Signing (v1.0.0)           | Signing later               |
| ---------------- | ----------------- | --------------------- | -------------------------- | --------------------------- |
| `macos-latest`   | `dmg`, `app`      | `.dmg`, `.app.tar.gz` | Unsigned                   | Developer ID + notarization |
| `windows-latest` | `msi`, `nsis`     | `.msi`, `-setup.exe`  | Unsigned; untested runtime | Authenticode (PFX)          |
| `ubuntu-latest`  | `deb`, `appimage` | `.deb`, `.AppImage`   | N/A; untested runtime      | N/A                         |

Bundle target configuration lives in `backend/tauri.conf.json` (`bundle.targets`). Currently set
to `"all"`, which produces all available targets for the runner's platform. Narrowing to explicit
targets (e.g. `["dmg", "app"]` on macOS) is a later refinement. See [DES-CI-BUNDLE].

---

## Appendix

### Agent Entry Map

| Owned file                       | Local anchors                                                                     | Purpose                                                                                                            | Tests            | Out of scope                                                |
| -------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------- | ----------------------------------------------------------- |
| `.github/workflows/ci.yml`       | [FR-1] [FR-2] [FR-7] [FR-10] [FR-12] [FR-13] [FR-16]                              | On-demand validation: lint/typecheck/test/build (both langs) + root job (knip, lint:md, version:check, actionlint) | Self-testing     | Signing, hardware MIDI, release                             |
| `.github/workflows/release.yml`  | [FR-3] [FR-4] [FR-5] [FR-6] [FR-8] [FR-9] [FR-11] [FR-14] [FR-18] [FR-19] [FR-20] | Manual platform-targeted cross-platform build + GH Release draft                                                   | Artifact smoke   | Notarization stapling, updater                              |
| `.github/workflows/security.yml` | [FR-15]                                                                           | Weekly + manual security scan: secrets, audits, licenses, OSV, freshness report                                    | Self-testing     | Quality/build gating, CodeQL (follow-up)                    |
| `scripts/sync-version.mjs`       | [FR-16]                                                                           | Propagates root `package.json` version to the three downstream manifests; check mode for CI                        | `version:check`  | Changelog generation                                        |
| `deny.toml`                      | [FR-17]                                                                           | cargo-deny advisories + license allowlist for the Rust tree                                                        | `lint:deps:rust` | npm license policy (`scripts/check-licenses.mjs`, zone 900) |
| `docs/runbooks/windows-build.md` | [FR-18]                                                                           | Borrowed-Windows-machine build runbook (VS Build Tools, rustup, Node 20, WebView2)                                 | Manual           | Windows signing, cross-compiled MSI                         |
| `backend/tauri.conf.json`        | [DES-CI-BUNDLE]                                                                   | Bundle target config consumed by release workflow                                                                  | —                | Window/plugin config (zone 130)                             |
| `backend/entitlements.plist`     | [DES-CI-SIGNING]                                                                  | macOS entitlements injected during signing                                                                         | —                | Runtime entitlement logic                                   |
