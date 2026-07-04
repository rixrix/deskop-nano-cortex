# Contributing

<!-- @see docs/specs/900-project-governance/spec.md [FR-4] -->

## Welcome

Desktop Nano Cortex is an **unofficial** companion for the Neural DSP Nano
Cortex — not affiliated with or endorsed by Neural DSP. The product truth that
every change must preserve: **documented MIDI is authoritative; BLE protocol
decoding is provisional** until hardware-verified. Never introduce claims of a
full editor, preset sync, parameter sync, or authoritative BLE state. See
[AGENTS.md](AGENTS.md) and the
[Truthfulness Guard](docs/specs/900-project-governance/spec.md) in zone 900.

## Setup

```bash
git clone https://github.com/rixrix/deskop-nano-cortex.git
cd deskop-nano-cortex
npm install                 # root tooling + husky hooks
npm ci --prefix frontend    # frontend deps
```

Requirements: Node 20+, Rust 1.77.0 (pinned in `backend/rust-toolchain.toml`).

Optional native tools:

```bash
brew install gitleaks cargo-deny just
```

## Development

- `npm run dev` — Vite dev server in the browser with a mocked backend
- `npm run dev:tauri` — the full desktop app (Rust backend + webview)

Where things live:

- `frontend/` — React 19 + TS + Tailwind UI
- `backend/` — Rust + Tauri crate (MIDI, BLE, IPC, platform)
- `docs/specs/` — numbered zone specs, the living source of truth

Note this is a plain npm two-package repo: the root `package.json`
orchestrates, `frontend/` has its own. Not pnpm, not a workspace.

## Verification

The loop:

```bash
npm run check    # static checks, no mutation
npm run fix      # auto-format and auto-fix
npm run verify   # check + unit tests (also runs on pre-push)
```

Before opening a PR with behavior changes, run the full gate:

```bash
npm run verify:full   # verify + coverage + rust tests + e2e + build + deps + version:check
```

If your change touches MIDI or BLE behavior, a manual hardware smoke run is
required — CI has no Nano Cortex. Follow
[docs/runbooks/hardware-smoke.md](docs/runbooks/hardware-smoke.md) and attach
the evidence to your PR.

## Branching and commits

Committing on `main` is allowed (solo-dev policy). Feature branches are
encouraged for non-trivial work — `feat/...`, `fix/...`, `chore/...`,
`docs/...`, `refactor/...`, `test/...`, `ci/...`, `build/...`, `release/...` —
and other branch names get a warning from the pre-commit hook, not a block.

Commits must follow [Conventional Commits](https://www.conventionalcommits.org/)
with a **required scope** from this enum (enforced by commit-msg; header
max 100 chars):

| Scope        | Covers                                                   |
| ------------ | -------------------------------------------------------- |
| `overview`   | Zone 001 architecture overview and routing index         |
| `midi-usb`   | USB MIDI backend — documented send/observe (zone 100)    |
| `ble`        | BLE backend — provisional decode, diagnostics (zone 110) |
| `ipc`        | Tauri IPC bridge, commands, AppState (zone 120)          |
| `platform`   | Tray, shortcuts, settings store, tauri.conf (zone 130)   |
| `frontend`   | React UI and control surface (zones 200/210)             |
| `dx`         | Local tooling: lint/format/test configs (zone 400)       |
| `ci`         | CI workflow and CI policy (zone 500)                     |
| `release`    | Release workflow, versioning, artifacts (zone 500)       |
| `governance` | Governance docs, runbooks, templates (zone 900)          |
| `deps`       | Dependency bumps and lockfile updates                    |
| `docs`       | README and general documentation                         |
| `repo`       | Repo-level config: gitignore, editorconfig, hooks        |
| `scripts`    | Helper scripts under `scripts/`                          |
| `spec`       | Spec-only changes under `docs/specs/`                    |
| `security`   | Security fixes, SECURITY.md, secret scanning             |

For non-trivial commits, use this body shape:

```
Why: <motivation>
Changed: <what changed>
Spec: docs/specs/<zone>/spec.md [FR-x]
Verification: <commands run>
```

Escape hatch for emergencies only: `git commit --no-verify` or `HUSKY=0`
(discouraged — the hooks exist to keep `main` green).

## Spec-driven changes

This repo follows the AFX convention: substantive changes start with a spec
under `docs/specs/<zone>/`. Code files carry a
`@see docs/specs/<zone>/spec.md [FR-x]` header, and `npm run lint` includes a
traceability gate that validates those links. Spec first, then code.

## Pull requests

- Fill in the PR template, including the truthfulness checklist.
- `npm run verify` must be green; `npm run verify:full` for behavior changes.
- PRs are squash-merged.

## Releases

Maintainer-only. Releases are cut by manual dispatch of the `release.yml`
workflow — see [docs/runbooks/release-checklist.md](docs/runbooks/release-checklist.md).
