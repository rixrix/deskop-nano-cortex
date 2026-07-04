---
afx: true
type: DESIGN
status: Living
owner: "@richard-sentino"
version: "1.0"
created_at: "2026-06-10T11:54:35.000Z"
updated_at: "2026-07-06T05:32:48.000Z"
tags: ["ci", "release", "github-actions", "tauri", "bundle", "signing", "cross-platform"]
spec: spec.md
---

# 500 CI/Release — Design

## [DES-CI-OVR] Overview

Three GitHub Actions workflows own the automation layer for Desktop Nano Cortex. `ci.yml` and
`release.yml` exist as-built; `security.yml` joins them under the solo-dev trigger policy
(see [DES-CI-TRIGGERS]).

- **`ci.yml`** — On-demand quality gate. Runs on manual `workflow_dispatch` only; the original
  push/PR trigger is superseded (see [DES-CI-TRIGGERS]). Validates both the frontend (TypeScript,
  ESLint, Vitest, Playwright) and the Rust backend (`cargo fmt --check`, `cargo clippy`,
  `cargo test`). No secrets required; no hardware required.

- **`release.yml`** — Installer factory. Triggered by manual `workflow_dispatch` with a `platform`
  choice input; the original `v*` tag trigger is superseded (see [DES-CI-TRIGGERS]). Fans out to
  the selected GitHub-hosted runner(s) (`macos-latest`, `windows-latest`, `ubuntu-latest`), builds
  Tauri native bundles on each, and attaches all artifacts to a drafted GitHub Release. Certificate
  signing is intentionally omitted for v1.0.0 so empty secrets cannot trigger platform import
  paths; macOS still uses Tauri ad-hoc signing (`signingIdentity: "-"`) so unsigned `.app` bundles
  have a valid local seal.

- **`security.yml`** — Scheduled watchdog. The only workflow that runs unattended (weekly cron +
  manual dispatch): secret scanning, dependency audits, license allowlists, OSV matching, and a
  dependency-freshness report. See [DES-CI-SUPPLY-CHAIN].

The split keeps CI fast and secret-free while isolating the heavier, platform-dependent build
matrix to the release path. `tauri-apps/tauri-action` (or an equivalent composite action) is the
build driver so that Tauri version upgrades require only a pinned action version bump.

---

## [DES-CI-TRIGGERS] Solo-Dev Trigger Policy

This repo has one maintainer. Every push has already passed the husky pre-push `verify` hook
(format, lint, typecheck, tests) on the machine that authored it, so an automatic PR/push CI gate
re-runs work that just succeeded locally, burns runner minutes, and adds latency without a second
developer to protect. The trigger policy follows from that:

| Workflow       | Trigger                           | Rationale                                                                                    |
| -------------- | --------------------------------- | -------------------------------------------------------------------------------------------- |
| `ci.yml`       | `workflow_dispatch` only          | Quality/build validation on demand; the pre-push hook is the always-on local gate.           |
| `release.yml`  | `workflow_dispatch` only          | Releases are deliberate, platform-targeted acts, not tag side effects.                       |
| `security.yml` | Weekly cron + `workflow_dispatch` | Advisories, leaked secrets, and stale dependencies arrive on the calendar, not with commits. |

**What stays automatic — and why only this.** `security.yml` watches for events that happen _to_
the repo rather than _in_ it: a CVE lands in an already-pinned dependency, a license changes
upstream, a secret sits in old history. No local hook can catch those, so the weekly schedule is
the only unattended automation.

**`ci.yml` additions under this policy:**

- A root job runs `knip` and `lint:md` (both `continue-on-error` until the findings are burned
  down), `version:check` (see [DES-CI-VERSION]), and `actionlint` over the workflow files.
- The pr-title semantic check is dropped — with no PR trigger there is no PR title to lint, and
  local commitlint already enforces Conventional Commits.

> The YAML sketches in [DES-CI-PIPELINE] and [DES-CI-RELEASE] predate this policy. Their `on:`
> blocks are superseded by the table above; the job/step content remains representative.

---

## [DES-CI-PIPELINE] CI Workflow (`ci.yml`) — Intended Design

```yaml
# .github/workflows/ci.yml  (as-built sketch — the `on:` block is superseded; see [DES-CI-TRIGGERS])
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  frontend:
    name: Frontend — lint / typecheck / test / build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"
          cache-dependency-path: frontend/package-lock.json

      - name: Install frontend dependencies
        run: npm --prefix frontend ci

      - name: Lint
        run: npm --prefix frontend run lint

      - name: Typecheck
        run: npm --prefix frontend run typecheck

      - name: Unit tests (Vitest)
        run: npm --prefix frontend run test

      - name: Build
        run: npm --prefix frontend run build

  frontend-e2e:
    name: Frontend — Playwright E2E
    runs-on: ubuntu-latest
    needs: frontend
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"
          cache-dependency-path: frontend/package-lock.json

      - name: Install frontend dependencies
        run: npm --prefix frontend ci

      - name: Install Playwright browsers
        run: npx --prefix frontend playwright install --with-deps

      - name: Run E2E tests
        run: npm --prefix frontend run e2e

  rust:
    name: Rust — fmt / clippy / test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install Rust toolchain
        uses: dtolnay/rust-toolchain@1.90.0
        with:
          components: rustfmt, clippy

      - name: Restore Rust cache
        uses: swatinem/rust-cache@v2
        with:
          workspaces: backend

      - name: Install Linux system deps (for Tauri / webkit2gtk)
        run: |
          sudo apt-get update
          sudo apt-get install -y libwebkit2gtk-4.1-dev libgtk-3-dev \
            libayatana-appindicator3-dev librsvg2-dev patchelf libdbus-1-dev \
            libasound2-dev pkg-config

      - name: Check formatting
        run: cargo fmt --manifest-path backend/Cargo.toml --check

      - name: Clippy
        run: cargo clippy --manifest-path backend/Cargo.toml --features ble --all-targets -- -D warnings

      - name: Unit tests
        run: cargo test --manifest-path backend/Cargo.toml --features ble
```

### Job dependency rationale

- `frontend` and `rust` run in parallel; neither depends on the other.
- `frontend-e2e` runs after `frontend` to reuse the already-verified build.
- No matrix on CI — a single `ubuntu-latest` runner is sufficient for
  lint/typecheck/unit-test. Cross-platform build correctness is validated by the release
  workflow on actual platform runners.

---

## [DES-CI-RELEASE] Release Workflow (`release.yml`) — Intended Design

```yaml
# .github/workflows/release.yml  (as-built sketch — the `on:` block is superseded; see [DES-CI-TRIGGERS])
name: Release

on:
  push:
    tags:
      - "v*"

permissions:
  contents: write

jobs:
  build:
    name: Build — ${{ matrix.platform }}
    strategy:
      fail-fast: false
      matrix:
        include:
          - platform: macos-latest
            args: "--target aarch64-apple-darwin"
          - platform: windows-latest
            args: ""
          - platform: ubuntu-latest
            args: ""

    runs-on: ${{ matrix.platform }}

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"
          cache-dependency-path: frontend/package-lock.json

      - name: Install Rust toolchain
        uses: dtolnay/rust-toolchain@1.90.0
        with:
          targets: aarch64-apple-darwin # macOS only; ignored on other runners

      - name: Restore Rust cache
        uses: swatinem/rust-cache@v2
        with:
          workspaces: backend

      - name: Install Linux system deps
        if: matrix.platform == 'ubuntu-latest'
        run: |
          sudo apt-get update
          sudo apt-get install -y libwebkit2gtk-4.1-dev libgtk-3-dev \
            libayatana-appindicator3-dev librsvg2-dev patchelf libdbus-1-dev \
            libasound2-dev pkg-config

      - name: Install frontend dependencies
        run: npm --prefix frontend ci

      - name: Build Tauri app + bundle
        uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          tagName: ${{ github.ref_name }}
          releaseName: "Unofficial Nano Cortex ${{ github.ref_name }}"
          releaseBody: "See [CHANGELOG](https://github.com/richard-sentino/desktop-nano-cortex/releases) for details."
          releaseDraft: true
          prerelease: false
          projectPath: backend
          args: ${{ matrix.args }}

  checksums:
    name: Generate release checksums
    needs: build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Generate + upload SHA-256 checksum manifest
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          # Download the release draft assets, hash every non-checksum asset,
          # write SHA256SUMS-v<version>.txt, and attach it to the same GitHub
          # Release with `gh release upload --clobber`.
```

### Matrix rationale

- `fail-fast: false` — a signing failure on macOS should not abort the Linux build.
- `aarch64-apple-darwin` target is passed only to the macOS leg via `matrix.args`; a universal
  binary (Intel + Apple Silicon) is a later refinement (see Open Questions in the archived brief).
- `releaseDraft: true` — artifacts are attached and the release is created as a draft; a human
  publishes after reviewing the artifact listing.
- `permissions: contents: write` — required for `tauri-action` to create/update the draft release
  and upload installer artifacts with the built-in `GITHUB_TOKEN`.
- `SHA256SUMS-v<version>.txt` — generated after the selected platform build(s) finish so the
  release page has one copyable integrity reference beside the installers.
- `projectPath: backend` — Tauri's config root is `backend/`, not the repository root.

---

## [DES-CI-BUNDLE] Bundle Configuration

Bundle targets and app identity are declared in `backend/tauri.conf.json`. The CI/release
workflows consume this config directly via `tauri-apps/tauri-action`; there is no duplication
of target lists in the workflow files.

Current config excerpt (as-built):

```json
{
  "productName": "Unofficial Nano Cortex",
  "version": "1.0.0",
  "identifier": "com.rixrix.desktopnanocortex",
  "bundle": {
    "active": true,
    "targets": "all",
    "publisher": "Rixrix",
    "homepage": "https://github.com/rixrix/deskop-nano-cortex",
    "copyright": "Unofficial community desktop app. Not affiliated with or endorsed by Neural DSP.",
    "license": "Apache-2.0",
    "category": "Music",
    "shortDescription": "Unofficial desktop controller for the Nano Cortex.",
    "icon": ["icons/32x32.png", "icons/128x128.png", "icons/128x128@2x.png"],
    "macOS": {
      "entitlements": "./entitlements.plist",
      "infoPlist": "./Info.plist"
    }
  }
}
```

`"targets": "all"` produces all platform-appropriate bundle types per runner:

| Runner           | Produced targets    |
| ---------------- | ------------------- |
| `macos-latest`   | `dmg`, `app`        |
| `windows-latest` | `msi`, `nsis` (exe) |
| `ubuntu-latest`  | `deb`, `AppImage`   |

Windows and Linux outputs are packaging targets for v1.0.0, not proven runtime support. They must
be labelled untested until their platform smoke checks pass on real machines.

**Later refinement**: narrow `targets` to an explicit array (e.g. `["dmg", "app"]`) to suppress
unneeded targets and reduce release artifact clutter.

**Version bump**: `version` in `tauri.conf.json` must match the git tag (for example, `1.0.0` for `v1.0.0`).
A pre-release script or the `tauri-apps/tauri-action` `tagName` input handles this in CI.

---

## [DES-CI-SIGNING] Signing Design

### v1.0.0 — Unsigned

No signing secrets are configured. Artifacts are unsigned. The macOS bundle is ad-hoc signed so
the `.app` resource seal is valid, but it is not Developer ID signed or notarized. Platform OS
warnings appear:

| Platform | Warning                            | User workaround                                  |
| -------- | ---------------------------------- | ------------------------------------------------ |
| macOS    | "App can't be opened" (Gatekeeper) | Right-click the `.app` → Open → confirm dialog   |
| Windows  | SmartScreen "Unknown publisher"    | "More info" → "Run anyway"                       |
| Linux    | None (no mandatory code signing)   | N/A — install `.deb` normally or run `.AppImage` |

Windows and Linux v1.0.0 artifacts must carry an additional untested-preview note until platform
smoke evidence exists.

### Later — macOS Developer ID + Notarization

When `APPLE_CERT_P12_BASE64` and related secrets are present and a signed-release workflow is
enabled:

1. The `.p12` certificate is imported into a temporary macOS keychain in CI.
2. `codesign` signs the `.app` bundle using the identity from `APPLE_SIGNING_IDENTITY`.
3. `notarytool submit --wait` submits the `.dmg` to Apple notarization using the API key.
4. `stapler staple` attaches the notarization ticket to the `.dmg`.
5. The `entitlements.plist` is passed to `codesign` via Tauri's `bundle.macOS.entitlements` config.
6. The `Info.plist` permission strings are merged into the app bundle via Tauri's `bundle.macOS.infoPlist` config.

Current entitlements (`backend/entitlements.plist`):

```xml
<dict>
    <key>com.apple.security.device.bluetooth</key><true/>
    <key>com.apple.security.device.usb</key><true/>
    <key>com.apple.security.network.client</key><true/>
</dict>
```

These entitlements are required for Bluetooth (BLE scan/connect), USB (MIDI I/O), and network
client (future auto-update check). They must be present in the signed bundle.

Current macOS permission strings (`backend/Info.plist`):

```xml
<dict>
    <key>NSBluetoothAlwaysUsageDescription</key>
    <string>Unofficial Nano Cortex uses Bluetooth to connect to your Nano Cortex and read live device state.</string>
    <key>NSBluetoothPeripheralUsageDescription</key>
    <string>Unofficial Nano Cortex uses Bluetooth to connect to your Nano Cortex and read live device state.</string>
    <key>NSHumanReadableCopyright</key>
    <string>Unofficial community desktop app. Not affiliated with or endorsed by Neural DSP.</string>
</dict>
```

These strings are required so macOS can show a Bluetooth permission prompt instead of terminating
the app when a packaged build scans or connects.

### Later — Windows Authenticode

When `WINDOWS_CERT_PFX_BASE64` and `WINDOWS_CERT_PASSWORD` are present:

1. The `.pfx` is decoded and written to a temp file in CI.
2. `signtool sign` (via Tauri's `bundle.windows.signCommand`) signs the `.msi` and `.exe`.
3. The signed artifacts are uploaded to the GitHub Release draft.

An EV (Extended Validation) cert removes SmartScreen reputation accumulation entirely. A standard
OV cert reduces the warning to a one-click "More info → Run anyway" dialog.

### Secret rotation

- macOS: re-export the `.p12` from Keychain Access, base64-encode, update the GitHub secret.
- Windows: re-export from the cert store, PFX-encode, base64-encode, update the GitHub secret.
- Tauri updater key: generated once via `tauri signer generate`; the private key goes to
  `TAURI_SIGNING_PRIVATE_KEY`, the public key is embedded in `tauri.conf.json`'s
  `updater.pubkey` field.

---

## [DES-CI-VERSION] Version Single-Source

Root `package.json` `version` is the single source of truth. Three downstream manifests must
agree (`frontend/package.json`, `backend/Cargo.toml`, `backend/tauri.conf.json`); drift between
them ships releases whose installer, window title, and update check disagree about what version
they are.

Sync flow:

```text
root package.json "version"          ← edited only via `npm version <bump>`
        │
        │  npm "version" lifecycle hook → node scripts/sync-version.mjs
        │
        ├──→ frontend/package.json    (+ frontend/package-lock.json)
        ├──→ backend/Cargo.toml       [package] version
        └──→ backend/tauri.conf.json  "version"
```

- **Write mode** — `node scripts/sync-version.mjs`, run automatically by the npm `version`
  lifecycle hook: reads the root version and rewrites the three manifests plus the frontend
  lockfile. A plain `npm version patch|minor|major` therefore bumps everything atomically.
- **Check mode** — `npm run version:check`: asserts all four files agree with the root version
  and exits non-zero on drift. It runs in the `ci.yml` root job (see [DES-CI-TRIGGERS]) so a
  dispatched CI run catches hand-edits that bypassed `npm version`.

This replaces the "pre-release version-sync step" open item from [DES-CI-BUNDLE]: the
`tauri.conf.json` `version` field is now machine-written, never hand-bumped.

---

## [DES-CI-SUPPLY-CHAIN] Security And Supply-Chain Scanning (`security.yml`)

`security.yml` is the only unattended workflow (weekly cron + `workflow_dispatch`). Job
breakdown:

| Job         | Tool / command                                                               | Scope                                                  | Failure meaning                          |
| ----------- | ---------------------------------------------------------------------------- | ------------------------------------------------------ | ---------------------------------------- |
| `gitleaks`  | gitleaks, full history (`fetch-depth: 0`)                                    | Every commit ever pushed                               | A secret is in git history — rotate it   |
| `js-audit`  | `npm audit --omit=dev` (root + frontend) + `node scripts/check-licenses.mjs` | Production npm dependency trees + JS license allowlist | Vulnerable or license-violating JS dep   |
| `rust-deny` | `cargo deny check` against root `deny.toml`                                  | RustSec advisories + Rust license allowlist            | Vulnerable or license-violating crate    |
| `osv`       | osv-scanner                                                                  | `frontend/package-lock.json` + `backend/Cargo.lock`    | Known OSV entry matches a pinned version |
| `freshness` | `npm outdated` + `cargo outdated` → run summary                              | All dependencies                                       | Never fails — informational report       |

**Two allowlists, two owners.** The JS license allowlist lives in `scripts/check-licenses.mjs`
(owned by zone `900-project-governance`; this workflow is its scheduled consumer). The Rust
allowlist and advisory policy live in root `deny.toml`, exposed locally as `lint:deps:rust` —
which soft-skips when cargo-deny is not installed, but runs strict here.

**Dependabot relationship.** Dependabot (`.github/dependabot.yml`, zone 900) proposes
forward-looking version bumps; `security.yml` inspects what is currently pinned. They are
complementary: Dependabot alone leaves silent windows between update PRs, and scanning alone
reports problems with no remediation path.

**CodeQL** is an optional follow-up, deliberately not included: weekly SAST on a solo-maintained
codebase does not yet justify the runner cost and alert-triage burden.

---

## [DES-CI-WINDOWS] Windows Build Strategy

There is no local Windows machine. One will be borrowed for runtime testing (WebView2 behavior,
WinRT MIDI/BLE stacks), but shipping Windows installers cannot depend on borrowed hardware. The
strategy is CI-first:

1. **Primary path** — the manual `release.yml` windows leg (`workflow_dispatch`,
   `platform: windows`). A GitHub-hosted `windows-latest` runner is the only Windows environment
   this project reliably has.
2. **Borrowed-machine path** — local scripts for when a Windows box is on the desk:
   `build:windows` (msi + nsis), `build:windows:msi`, `build:windows:nsis`. Setup is documented
   in `docs/runbooks/windows-build.md` (VS Build Tools C++ workload, rustup, Node 20, WebView2,
   `npm ci`; artifacts land in `backend/target/release/bundle/{msi,nsis}`; unsigned artifacts
   trigger SmartScreen).
3. **Escape hatch** — `cargo-xwin` can cross-compile from macOS/Linux, but produces the NSIS
   installer only.

**Why MSI cannot be cross-compiled:** the WiX toolset that produces `.msi` packages is
Windows-only. No cross-toolchain setup on macOS/Linux changes that — `.msi` requires a Windows
host (CI runner, or physical machine). Docker-based cross-compilation is explicitly rejected: it
still cannot produce an MSI, adds a maintenance-heavy image to a solo project, and duplicates
what the `windows-latest` runner already provides.

For contrast, macOS has a full local build surface: `build:mac` (`--bundles dmg,app`) and
`build:mac:universal` (`--target universal-apple-darwin --bundles dmg,app`).
`backend/tauri.conf.json` keeps `bundle.targets: "all"` (owned by zone `130-backend-platform`);
the per-invocation `--bundles` flags narrow output without touching the shared config.

---

## [DES-CI-DEC] Key Decisions

| Decision                                      | Choice                                             | Rationale                                                                                                                                                                                                                                                                           |
| --------------------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Two workflows (ci + release)                  | Split by trigger and concern                       | CI is secret-free and fast; release is platform-heavy and requires signing infrastructure. Mixing them would block PRs on slow matrix runners.                                                                                                                                      |
| `tauri-apps/tauri-action`                     | Use official Tauri action as build driver          | Handles cross-platform Tauri CLI setup, artifact discovery, and GitHub Release attachment in one step. Version pin keeps upgrades deliberate.                                                                                                                                       |
| v1.0.0 unsigned                               | Skip certificate signing until certs are available | The release workflow intentionally omits signing env vars so empty secrets cannot trigger macOS keychain import or other signing paths. macOS ad-hoc bundle signing remains enabled to prevent invalid app seals. The secret schema remains documented for a later signed workflow. |
| Windows/Linux v1.0.0 status                   | Release-wired, untested runtime                    | The workflow can attempt artifacts on hosted runners, but no Windows/Linux hardware smoke pass has been recorded yet. Release notes must label these builds honestly.                                                                                                               |
| `releaseDraft: true`                          | Human publishes after artifact review              | Prevents accidental immediate publication of a broken release; matches a "tag → review → publish" workflow.                                                                                                                                                                         |
| `fail-fast: false` on matrix                  | Continue other legs on single-platform failure     | A macOS signing failure (e.g. cert expiry) should not abort the Linux `.deb` build.                                                                                                                                                                                                 |
| `ubuntu-latest` for CI checks                 | Single runner, not per-OS                          | Frontend lint/typecheck/test and `cargo fmt`/`clippy`/`test` (unit only) do not require macOS or Windows. Saves runner minutes and keeps CI under 10 min.                                                                                                                           |
| Rust cache via `swatinem/rust-cache`          | Standard cache action                              | Avoids re-downloading crates on every run; workspace pointed at `backend` to avoid scanning the wrong directory.                                                                                                                                                                    |
| Apple Silicon target (`aarch64-apple-darwin`) | Default macOS artifact                             | Apple Silicon is the primary modern Mac target. Intel (`x86_64-apple-darwin`) and universal are later options; see archived Open Question 4.                                                                                                                                        |
