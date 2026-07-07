# Windows Build Runbook

<!-- @see docs/specs/900-project-governance/spec.md [FR-5] -->

For working on a borrowed (or occasional) Windows machine.

## When you need this

- **Runtime testing**: BLE, USB MIDI, and WebView2 behavior can only be
  verified on real Windows. Windows 11 is confirmed for v1.0.0; rerun this
  checklist when changing installer, tray, USB, BLE, or WebView behavior.
- **Local installer builds**: normally unnecessary — the `windows` leg of the
  `release.yml` workflow is the primary installer path and needs no local
  Windows machine. Use this runbook when you need to iterate on the installer
  itself or debug a Windows-only issue.

## One-time setup

1. **Visual Studio Build Tools** with the "Desktop development with C++"
   workload (MSVC compiler + Windows 10/11 SDK).
2. **rustup** with the `x86_64-pc-windows-msvc` default host toolchain. The
   repo pins Rust 1.90.0 via `backend/rust-toolchain.toml`, so rustup fetches
   the right version automatically on first build.
3. **Node 20** (nvm-windows or the official installer).
4. **git**.
5. **WebView2 Runtime** — preinstalled on Windows 11; install manually on
   Windows 10 if missing.
6. Optional installer tooling: **WiX** for MSI (Tauri downloads WiX v3
   automatically) and **NSIS** (Tauri fetches it automatically too) — usually
   nothing to install by hand.

## Build

```bash
git clone https://github.com/rixrix/deskop-nano-cortex.git
cd deskop-nano-cortex
set HUSKY=0            # skip hook install if you are only building
npm install
npm ci --prefix frontend
npm run build:windows
```

Artifacts land at:

- `backend\target\release\bundle\msi\` — `.msi`
- `backend\target\release\bundle\nsis\` — `-setup.exe`

## Runtime test checklist

- Install via the `-setup.exe`; SmartScreen will warn (unsigned) — use
  "More info → Run anyway".
- App launches; window title is "Nano Cortex Controller".
- USB MIDI: Nano Cortex enumerates in the port list; documented preset change
  works.
- BLE scan finds the device (experimental panel; provisional decode).
- Tray icon appears and its menu works.
- Uninstall removes the app cleanly.

## Troubleshooting

- Start with the
  [Tauri v2 Windows prerequisites](https://tauri.app/start/prerequisites/) —
  most build failures are a missing MSVC workload or Windows SDK.
- Long-path issues: enable Windows long paths
  (`git config --system core.longpaths true` and the OS policy) if deep
  `node_modules`/`target` paths fail.
- `link.exe not found` or C++ errors: re-run the Build Tools installer and
  confirm the "Desktop development with C++" workload is actually installed.

## Honest caveats

- Artifacts are **unsigned** — SmartScreen warnings are expected for v1.0.0.
- Windows 11 runtime behavior is confirmed for v1.0.0. Other Windows versions
  should still be treated as pending until the checklist above is run on real
  hardware with USB and Bluetooth.
- MSI **cannot be cross-compiled** from macOS/Linux. Do not attempt Docker or
  Wine paths; use this runbook or the CI `windows` leg.
