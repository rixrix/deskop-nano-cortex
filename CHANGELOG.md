# Changelog

<!-- @see docs/specs/900-project-governance/spec.md [FR-12] -->

All notable changes to Desktop Nano Cortex are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

No changes yet.

## [1.0.0] - 2026-07-07

### Added

- Console workbench with collapsible preset rail, signal-path quick controls,
  Nano-ordered amp knobs, clickable footswitch deck, and a scrollable Utilities
  rail.
- USB MIDI command path for preset recall, FX on/off, tap tempo, tuner,
  expression, and documented Program Change / Control Change messages.
- Bluetooth device-state sync for preset names, knob movement, loaded
  capture/cab/IR assets, signal-chain model state, gate state, footswitch
  assignments, rotary state, and Tone Studio values.
- Floating Tone Studio for focused signal-chain inspection, parameter values,
  live parameter writes, verified gate/capture/IR controls, and guarded
  save/discard workflows.
- Preset editing workflows for 64 presets across 8 banks, including remembered
  last-opened preset, rename handling, manual/auto save mode, dirty-state
  prompts, and save confirmation.
- Footswitch assignment and rotary workflows for quick preset slots plus
  capture/cab/IR selection where verified by hardware testing.
- Diagnostics, logs, status progress lane, Protocol Lab tooling, and copyable
  support bundles for debugging app/device sessions.
- Help, About, privacy, telemetry toggle, support links, version details, and
  warranty/unofficial-use guidance inside the app.
- Release governance: Apache-2.0 license, community health docs, issue/PR
  templates, CI/security/release workflows, platform runbooks, and AFX
  traceability checks.
- macOS app/DMG packaging plus Windows and Linux release targets for preview
  validation.

### Changed

- Packaged app identity is **Unofficial Nano Cortex**, including macOS Bluetooth
  permission prompts and unofficial About metadata.
- README now includes a screenshot/video walkthrough, installation guidance for
  unsigned macOS builds, and preview notes for Windows and Linux artifacts.
- Save/Load and broad Settings entry points are hidden from the primary header
  because the connected device is the source of truth for v1.
- Rust toolchain and release workflows pin Rust 1.90.0 so GitHub Actions can
  read the committed Cargo lockfile across macOS, Windows, and Linux runners.

### Known limitations

- macOS is the only hardware-tested runtime for v1.0.0.
- Windows and Linux artifacts are wired but untested; treat them as preview
  builds until platform smoke tests are recorded.
- v1.0.0 is unsigned, so macOS Gatekeeper and Windows SmartScreen prompts are
  expected.
- Bluetooth state remains clearly labelled and guarded where device behavior is
  still provisional.
- Capture/IR library management and deeper paid/advanced tone-generation ideas
  are intentionally outside this v1 release.

[Unreleased]: https://github.com/rixrix/deskop-nano-cortex/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/rixrix/deskop-nano-cortex/releases/tag/v1.0.0
