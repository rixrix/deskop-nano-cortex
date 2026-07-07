---
afx: true
type: TASKS
status: Living
owner: "@richard-sentino"
version: "1.0"
created_at: "2026-06-10T11:54:35.000Z"
updated_at: "2026-07-07T00:00:00.000Z"
tags: ["ci", "release", "github-actions", "tauri", "bundle", "signing", "cross-platform"]
spec: spec.md
design: design.md
---

# 500 CI/Release — Tasks

> Implementation checklist for the CI and release pipeline. `ci.yml` and `release.yml` were
> created on 2026-06-13; items verifiable only on GitHub (a green PR run, a real tag build)
> remain unchecked until the repo is pushed to a remote.

---

## Phase 0: Spec Authoring

<!-- files: docs/specs/500-ci-release/spec.md, docs/specs/500-ci-release/design.md, docs/specs/500-ci-release/tasks.md -->
<!-- @see docs/specs/500-ci-release/spec.md [FR-1] [FR-3] [FR-8] [FR-9] [NFR-3] [NFR-5] -->
<!-- @see docs/specs/500-ci-release/design.md [DES-CI-OVR] [DES-CI-PIPELINE] [DES-CI-RELEASE] [DES-CI-BUNDLE] [DES-CI-SIGNING] [DES-CI-DEC] -->

- [x] Author `spec.md`: problem statement, FR/NFR table, acceptance criteria, GitHub Actions secret schema table, platform artifact matrix, Agent Entry Map.
- [x] Author `design.md`: `[DES-CI-PIPELINE]` with sketched `ci.yml` job steps, `[DES-CI-RELEASE]` with sketched `release.yml` matrix, `[DES-CI-BUNDLE]` referencing `tauri.conf.json` targets, `[DES-CI-SIGNING]` v1.0.0 unsigned and later signing paths, `[DES-CI-DEC]` key decisions.
- [x] Author `tasks.md`: phased implementation checklist with `@see` comments, `## Work Sessions` as last section.

---

## Phase 1: CI Workflow

<!-- files: .github/workflows/ci.yml -->
<!-- @see docs/specs/500-ci-release/spec.md [FR-1] [FR-2] [FR-7] [FR-10] [FR-12] -->
<!-- @see docs/specs/500-ci-release/design.md [DES-CI-PIPELINE] [DES-CI-DEC] -->

- [x] Create `.github/workflows/ci.yml` with `on: push/pull_request` targeting `main`.
- [x] Add `frontend` job: `actions/setup-node@v4` (Node 20), `npm ci`, `lint`, `format:check`, `typecheck`, `vitest run`, `build`, plus the traceability gate (`node scripts/check-traceability.mjs`).
- [x] Add `e2e` job: install Playwright browsers (`npx playwright install --with-deps chromium`), `npm run e2e`.
- [x] Add `backend` job: `dtolnay/rust-toolchain@1.90.0` (components: `rustfmt`, `clippy`), `Swatinem/rust-cache@v2` (workspaces: `backend`), Linux system deps (incl. `libdbus-1-dev` for BLE and `libasound2-dev` for ALSA MIDI crates), `cargo fmt --check`, `cargo clippy --features ble --all-targets -- -D warnings`, `cargo test --features ble`.
- [x] Jobs run in parallel (no `needs:` between `frontend`, `e2e`, `backend`).
- [ ] Confirm CI passes on a test PR without any signing secrets configured (needs a GitHub remote).
- [ ] Confirm `cargo test` passes in CI on Linux (unit tests only; no MIDI hardware required).

---

## Phase 2: Release Workflow

<!-- files: .github/workflows/release.yml -->
<!-- @see docs/specs/500-ci-release/spec.md [FR-3] [FR-4] [FR-5] [FR-6] [FR-9] [FR-11] [NFR-2] [NFR-5] -->
<!-- @see docs/specs/500-ci-release/design.md [DES-CI-RELEASE] [DES-CI-BUNDLE] [DES-CI-DEC] -->

- [x] Create `.github/workflows/release.yml` with `on: push: tags: ["v*"]`.
- [x] Add `build` job with `strategy.fail-fast: false` and a three-entry matrix (`macos-latest`, `windows-latest`, `ubuntu-latest`).
- [x] Add per-leg steps: checkout, `setup-node@v4`, `dtolnay/rust-toolchain@1.90.0`, `Swatinem/rust-cache@v2`, Linux system deps (conditional on `ubuntu-latest`, including `libasound2-dev` for ALSA), `npm ci`.
- [x] Add `permissions: contents: write` so `tauri-action` can create/update the draft release and upload artifacts with `GITHUB_TOKEN`.
- [x] Add `tauri-apps/tauri-action@v0` step with `projectPath: backend`, `releaseDraft: true`, and `tagName: v__VERSION__`; omit signing env vars for v1.0.0 so unsigned builds cannot enter keychain/signing paths with empty secrets.
- [x] Add post-build SHA-256 manifest generation/upload (`SHA256SUMS-v<version>.txt`) so the release page exposes one integrity reference for the release assets.
- [ ] Push a test tag (`v1.0.0-ci-test`) to a fork or branch; verify all three matrix legs complete and produce artifacts.
- [ ] Verify the GitHub Release draft is created with all platform artifacts attached.
- [x] Verify unsigned artifacts install correctly on macOS (right-click open) and Windows 11 (More info → Run anyway); keep unsigned trust-prompt notes visible.
- [ ] Verify unsigned Linux artifacts install and launch on real hardware (`dpkg -i` / `chmod +x AppImage`). Until this check passes, label Linux artifacts untested.
- [ ] Delete the test tag and draft release after verification.

---

## Phase 3: Bundle Config Refinement

<!-- files: backend/tauri.conf.json -->
<!-- @see docs/specs/500-ci-release/spec.md [NFR-4] -->
<!-- @see docs/specs/500-ci-release/design.md [DES-CI-BUNDLE] -->

- [ ] Evaluate whether `"targets": "all"` produces unneeded artifacts per runner (e.g. both `msi` and `nsis` on Windows). Narrow to explicit target arrays if artifact count is confusing.
- [ ] Add a pre-release version-sync step or document the manual `tauri.conf.json` `version` bump process for tags.
- [x] Confirm `productName`, `version`, and `identifier` in `tauri.conf.json` are correct for v1.0.0 release.

---

## Phase 4: Later Signing Infrastructure

<!-- files: .github/workflows/release.yml, backend/tauri.conf.json, backend/entitlements.plist -->
<!-- @see docs/specs/500-ci-release/spec.md [FR-8] [NFR-3] -->
<!-- @see docs/specs/500-ci-release/design.md [DES-CI-SIGNING] [DES-CI-DEC] -->

- [ ] Obtain Apple Developer ID Application certificate; export as `.p12`; base64-encode; add `APPLE_CERT_P12_BASE64` and `APPLE_CERT_PASSWORD` to GitHub secrets.
- [ ] Add `APPLE_SIGNING_IDENTITY` secret (certificate CN string).
- [ ] Create App Store Connect API key; add `APPLE_API_KEY_ID`, `APPLE_API_ISSUER_ID`, `APPLE_API_KEY_P8` secrets for notarization.
- [ ] Verify macOS leg produces a signed + notarized `.dmg` that passes Gatekeeper without the right-click workaround.
- [ ] Obtain or generate a Windows Authenticode certificate (OV or EV); export as `.pfx`; base64-encode; add `WINDOWS_CERT_PFX_BASE64` and `WINDOWS_CERT_PASSWORD` secrets.
- [ ] Configure `tauri.conf.json` `bundle.windows.signCommand` if not handled automatically by `tauri-apps/tauri-action`.
- [ ] Verify Windows leg produces a signed installer that passes SmartScreen without "More info → Run anyway".
- [ ] Generate Tauri updater key pair (`tauri signer generate`); add `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` secrets; embed public key in `tauri.conf.json` for a later auto-update path.
- [ ] Document secret rotation procedure in `docs/runbooks/signing-rotation.md`.

---

## Phase 5: Smoke Harness and Runbooks

<!-- files: scripts/smoke-linux.sh, docs/runbooks/smoke-matrix.md, docs/runbooks/release-checklist.md -->
<!-- @see docs/specs/500-ci-release/spec.md [NFR-2] [NFR-5] -->
<!-- @see docs/specs/500-ci-release/design.md [DES-CI-RELEASE] -->

- [ ] Author `docs/runbooks/smoke-matrix.md` documenting the manual per-OS hardware smoke checklist (connect USB Nano Cortex, switch 5 presets, verify BLE scan, verify MIDI monitor — one machine per OS before publishing a release).
- [ ] Author `docs/runbooks/release-checklist.md` covering: bump version in `tauri.conf.json`, update CHANGELOG, tag, push tag, verify CI green, review release draft artifacts, run smoke matrix, publish release.
- [ ] Linux CI smoke (optional, no hardware): configure `snd-virmidi` loopback in CI, launch the app headlessly, drive `connect` + `send_midi` via a sidecar script, assert MIDI bytes via `aseqdump`.
- [ ] Real Windows smoke: install the unsigned installer, launch, verify WebView2, USB MIDI enumeration/send, BLE scan/connect, diagnostics, and uninstall.
- [ ] Real Linux smoke: install `.deb` and run `.AppImage`, verify launch and USB MIDI enumeration/send; keep BLE explicitly unsupported/untested unless a Linux BLE path is proven.

---

## Phase 6: Solo-Dev Triggers, Security Scanning, Version Sync, Windows Surface

<!-- files: .github/workflows/ci.yml, .github/workflows/release.yml, .github/workflows/security.yml, scripts/sync-version.mjs, deny.toml, docs/runbooks/windows-build.md, package.json -->
<!-- @see docs/specs/500-ci-release/spec.md [FR-13] [FR-14] [FR-15] [FR-16] [FR-17] [FR-18] [FR-19] [FR-20] -->
<!-- @see docs/specs/500-ci-release/design.md [DES-CI-TRIGGERS] [DES-CI-VERSION] [DES-CI-SUPPLY-CHAIN] [DES-CI-WINDOWS] -->

> Supersedes the trigger choices recorded in Phases 1-2: `ci.yml` and `release.yml` keep their
> job content but move to manual `workflow_dispatch` under the solo-dev trigger policy.

- [x] Switch `ci.yml` to `workflow_dispatch` only (remove push/PR triggers); the husky pre-push `verify` hook is the local gate.
- [x] Add a `root` job to `ci.yml`: knip + `lint:md` (both `continue-on-error` initially), `version:check`, and actionlint; drop the pr-title semantic check (local commitlint covers commits).
- [x] Switch `release.yml` to `workflow_dispatch` with `platform` (choice: `all`/`macos`/`windows`/`linux`) and `draft` (boolean, default `true`) inputs; add a setup job mapping the platform input to the runner matrix; remove the `v*` tag trigger. Apple signing secret schema unchanged (inactive until secrets exist).
- [x] Create `.github/workflows/security.yml` (weekly cron + `workflow_dispatch`): gitleaks full-history secret scan; `npm audit --omit=dev` (root + frontend) + `scripts/check-licenses.mjs`; `cargo deny check` against root `deny.toml`; osv-scanner over `frontend/package-lock.json` + `backend/Cargo.lock`; dependency-freshness report (`npm outdated` + `cargo outdated`) in the run summary. CodeQL noted as optional follow-up, not included.
- [x] Add `scripts/sync-version.mjs` (root `package.json` version → `frontend/package.json` + lockfile, `backend/Cargo.toml`, `backend/tauri.conf.json`); wire the npm `version` lifecycle hook; add `version:check` drift assertion (run in CI).
- [x] Add root `deny.toml` (advisories + license allowlist) and the `lint:deps:rust` script (soft-skips locally when cargo-deny is not installed; strict in `security.yml`).
- [x] Add Windows build scripts (`build:windows` msi+nsis, `build:windows:msi`, `build:windows:nsis`) and author `docs/runbooks/windows-build.md` (VS Build Tools C++ workload, rustup, Node 20, WebView2, `npm ci`, artifacts in `backend/target/release/bundle/{msi,nsis}`, SmartScreen caveat).
- [x] Refine macOS build scripts: `build:mac` → `--bundles dmg,app`; add `build:mac:universal` (`--target universal-apple-darwin --bundles dmg,app`); `tauri.conf.json` `bundle.targets` stays `"all"` (zone 130 owns it; per-invocation `--bundles` overrides).

---

## Work Sessions

| Date       | Task                                                                     | Action | Files Modified                                                                                                                                                                                                               | Agent | Human |
| ---------- | ------------------------------------------------------------------------ | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ----- |
| 2026-06-13 | Phase 0 (spec authoring)                                                 | Coded  | docs/specs/500-ci-release/spec.md, docs/specs/500-ci-release/design.md, docs/specs/500-ci-release/tasks.md                                                                                                                   | [x]   | [x]   |
| 2026-06-13 | Phase 1, 2                                                               | Coded  | .github/workflows/ci.yml, .github/workflows/release.yml                                                                                                                                                                      | [x]   | [x]   |
| 2026-07-06 | Phase 6 (solo-dev triggers, security.yml, version sync, windows surface) | Coded  | .github/workflows/ci.yml, .github/workflows/release.yml, .github/workflows/security.yml, scripts/sync-version.mjs, deny.toml, docs/runbooks/windows-build.md, package.json, docs/specs/500-ci-release/{spec,design,tasks}.md | [x]   | [x]   |
